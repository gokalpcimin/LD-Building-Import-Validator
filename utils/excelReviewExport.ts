import ExcelJS from 'exceljs';
import type { ParsedSheet, SheetData, WorkbookResult } from '../types';

const REVIEW_STATUS_HEADER = 'Review Status';

type ReviewSeverity = 'error' | 'warning' | 'ready';

const SEVERITY_STYLES: Record<ReviewSeverity, { fill: ExcelJS.Fill; font: Partial<ExcelJS.Font> }> = {
  error: {
    fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFC7CE' } },
    font: { color: { argb: 'FF9C0006' } },
  },
  warning: {
    fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFEB9C' } },
    font: { color: { argb: 'FF9C6500' } },
  },
  ready: {
    fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFC6EFCE' } },
    font: { color: { argb: 'FF006100' } },
  },
};

interface RowReviewStatus {
  /** Worst severity found for this original row — determines the highlight color. */
  severity: ReviewSeverity;
  /** Deduplicated, human-readable reasons, each already prefixed (Critical:/Warning:), or ["Ready"]. */
  messages: string[];
}

/**
 * Builds a per-original-file-row review status map, keyed by the Excel row
 * number (`ImportReadyRow.sourceRowNumber`), not by the internal rows-array
 * index — a register-style sheet can expand one source row into several
 * parsed asset rows, and all of those need to land back on the same original
 * row when highlighting. Every parsed data row starts as "ready" (green);
 * warning issues escalate it to yellow and error issues to red, with errors
 * always winning for that row's color. Non-data rows (titles, section
 * dividers, blanks) never appear in the map and stay untouched.
 */
function buildRowStatusMap(sheet: ParsedSheet): Map<number, RowReviewStatus> {
  const map = new Map<number, RowReviewStatus>();

  for (const row of sheet.rows) {
    if (row.sourceRowNumber !== undefined && !map.has(row.sourceRowNumber)) {
      map.set(row.sourceRowNumber, { severity: 'ready', messages: ['Ready'] });
    }
  }

  for (const error of sheet.errors) {
    if (error.severity === 'info') {
      continue;
    }
    const row = sheet.rows[error.rowIdx];
    const sourceRowNumber = row?.sourceRowNumber;
    if (sourceRowNumber === undefined) {
      continue;
    }

    const label = error.severity === 'error' ? 'Critical' : 'Warning';
    const message = `${label}: ${error.message}`;

    const existing = map.get(sourceRowNumber);
    if (!existing) {
      map.set(sourceRowNumber, { severity: error.severity, messages: [message] });
      continue;
    }

    if (existing.severity === 'ready') {
      existing.severity = error.severity;
      existing.messages = [message];
      continue;
    }
    if (!existing.messages.includes(message)) {
      existing.messages.push(message);
    }
    if (error.severity === 'error') {
      existing.severity = 'error';
    }
  }

  return map;
}

/**
 * Applies a highlight + review text to a cell without mutating shared style
 * objects (exceljs deduplicates styles between cells, so assigning
 * `cell.fill` directly can leak the highlight onto unrelated cells).
 */
function applyCellHighlight(
  cell: ExcelJS.Cell,
  fill: ExcelJS.Fill,
  font: Partial<ExcelJS.Font>,
): void {
  cell.style = {
    ...cell.style,
    fill,
    font: { ...(cell.style.font ?? {}), ...font },
  };
}

/**
 * Opens the exact workbook the user uploaded and edits it in place: every
 * sheet, row, value, font, border, merge and column width stays as-is. The
 * only changes are (per imported non-cover-page sheet) a trailing "Review
 * Status" column and a row highlight — red for Blocked rows (with the
 * critical reason(s)), yellow for Review Required rows (with the warning
 * reason(s)), green for Ready rows. Non-data rows and sheets that weren't
 * imported are left completely untouched.
 */
export async function buildAnnotatedWorkbookBuffer(
  originalFile: ArrayBuffer,
  workbook: WorkbookResult,
): Promise<ArrayBuffer> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(originalFile);

  for (const parsedSheet of workbook.sheets) {
    if (parsedSheet.sheetType === 'cover-page') {
      continue;
    }
    const worksheet = wb.getWorksheet(parsedSheet.name);
    if (!worksheet) {
      continue;
    }

    const statusMap = buildRowStatusMap(parsedSheet);
    if (statusMap.size === 0) {
      continue;
    }

    const reviewColumn = worksheet.columnCount + 1;

    const headerCell = worksheet
      .getRow(parsedSheet.headerRowIndex + 1)
      .getCell(reviewColumn);
    headerCell.value = REVIEW_STATUS_HEADER;
    headerCell.style = {
      ...headerCell.style,
      font: { ...(headerCell.style.font ?? {}), bold: true },
    };
    worksheet.getColumn(reviewColumn).width = 48;

    for (const [sourceRowNumber, status] of statusMap) {
      const excelRow = worksheet.getRow(sourceRowNumber);
      const { fill, font } = SEVERITY_STYLES[status.severity];

      excelRow.getCell(reviewColumn).value = status.messages.join('; ');
      for (let c = 1; c <= reviewColumn; c += 1) {
        applyCellHighlight(excelRow.getCell(c), fill, font);
      }
    }
  }

  const buffer = await wb.xlsx.writeBuffer();
  return buffer as ArrayBuffer;
}

/** Excel worksheet names: max 31 chars, no : \ / ? * [ ] , and must be unique within the workbook. */
function sanitizeSheetName(name: string, used: Set<string>): string {
  const cleaned = (name || 'Sheet').replace(/[:\\/?*[\]]/g, ' ').trim().slice(0, 31) || 'Sheet';
  let candidate = cleaned;
  let suffix = 2;
  while (used.has(candidate.toLowerCase())) {
    const suffixText = ` (${suffix})`;
    candidate = `${cleaned.slice(0, 31 - suffixText.length)}${suffixText}`;
    suffix += 1;
  }
  used.add(candidate.toLowerCase());
  return candidate;
}

/**
 * Fallback for sources with no original .xlsx bytes to edit (CSV uploads,
 * legacy .xls). Rebuilds the workbook from the parsed cell values — same
 * sheets, same row/column values and order (original formatting doesn't
 * exist for CSV and can't be read from legacy .xls) — and applies the same
 * red/yellow/green highlights and "Review Status" column as
 * `buildAnnotatedWorkbookBuffer`.
 */
export async function buildReviewWorkbookBuffer(
  rawSheets: SheetData[],
  workbook: WorkbookResult,
): Promise<ArrayBuffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'LD Building Import Validator';
  wb.created = new Date();

  const usedSheetNames = new Set<string>();

  for (const sheet of rawSheets) {
    const parsedSheet = workbook.sheets.find((s) => s.name === sheet.name);
    const canAnnotate = Boolean(parsedSheet) && parsedSheet!.sheetType !== 'cover-page';
    const statusMap = canAnnotate ? buildRowStatusMap(parsedSheet!) : new Map<number, RowReviewStatus>();
    const headerRowIndex = canAnnotate ? parsedSheet!.headerRowIndex : -1;

    const worksheet = wb.addWorksheet(sanitizeSheetName(sheet.name, usedSheetNames));

    const maxColumns = Math.max(1, ...sheet.data.map((row) => row.length));

    sheet.data.forEach((row, rowIndex) => {
      const values: (string | number)[] = [];
      for (let c = 0; c < maxColumns; c += 1) {
        values.push(row[c] ?? '');
      }

      if (canAnnotate) {
        values.push(rowIndex === headerRowIndex ? REVIEW_STATUS_HEADER : '');
      }

      const excelRow = worksheet.addRow(values);

      if (rowIndex === headerRowIndex) {
        excelRow.font = { bold: true };
        return;
      }

      if (!canAnnotate) {
        return;
      }

      const status = statusMap.get(rowIndex + 1);
      if (!status) {
        return;
      }

      const { fill, font } = SEVERITY_STYLES[status.severity];
      excelRow.getCell(values.length).value = status.messages.join('; ');

      for (let c = 1; c <= values.length; c += 1) {
        applyCellHighlight(excelRow.getCell(c), fill, font);
      }
    });

    worksheet.columns.forEach((column, index) => {
      const isReasonColumn = canAnnotate && index === maxColumns;
      column.width = isReasonColumn ? 48 : 22;
    });
  }

  const buffer = await wb.xlsx.writeBuffer();
  return buffer as ArrayBuffer;
}

export function downloadWorkbookBuffer(filename: string, buffer: ArrayBuffer): void {
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
