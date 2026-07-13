import ExcelJS from 'exceljs';
import type { ParsedSheet, SheetData, WorkbookResult } from '../types';

const REVIEW_STATUS_HEADER = 'Review Status';

const ERROR_FILL: ExcelJS.Fill = {
  type: 'pattern',
  pattern: 'solid',
  fgColor: { argb: 'FFFFC7CE' },
};
const ERROR_FONT: Partial<ExcelJS.Font> = { color: { argb: 'FF9C0006' } };

const WARNING_FILL: ExcelJS.Fill = {
  type: 'pattern',
  pattern: 'solid',
  fgColor: { argb: 'FFFFEB9C' },
};
const WARNING_FONT: Partial<ExcelJS.Font> = { color: { argb: 'FF9C6500' } };

interface RowIssueSummary {
  /** Worst severity found for this original row — determines the highlight color. */
  severity: 'error' | 'warning';
  /** Deduplicated, human-readable reasons, each already prefixed (Critical:/Warning:). */
  messages: string[];
}

/**
 * Groups a sheet's non-info validation errors by the *original file* row
 * number (`ImportReadyRow.sourceRowNumber`), not by the internal rows-array
 * index — a register-style sheet can expand one source row into several
 * parsed asset rows, and all of those need to land back on the same
 * original row when highlighting. Error-severity issues always win over
 * warning-severity ones for that row's color.
 */
function buildRowIssueMap(sheet: ParsedSheet): Map<number, RowIssueSummary> {
  const map = new Map<number, RowIssueSummary>();

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
    if (!existing.messages.includes(message)) {
      existing.messages.push(message);
    }
    if (error.severity === 'error') {
      existing.severity = 'error';
    }
  }

  return map;
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
 * Rebuilds the workbook exactly as uploaded (same sheets, same row/column
 * values, same order) and adds one trailing "Review Status" column per
 * sheet: Blocked-severity rows get a red fill + the critical reason(s),
 * Review-Required rows get a yellow fill + the warning reason(s). Rows with
 * no open issues (including Ready rows and non-data rows like titles or
 * section headers) are left untouched. Cover Page is copied as-is — it has
 * no per-row asset data to annotate.
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
    const issueMap = canAnnotate ? buildRowIssueMap(parsedSheet!) : new Map<number, RowIssueSummary>();
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

      const sourceRowNumber = rowIndex + 1;
      const issue = issueMap.get(sourceRowNumber);
      if (!issue) {
        return;
      }

      const fill = issue.severity === 'error' ? ERROR_FILL : WARNING_FILL;
      const font = issue.severity === 'error' ? ERROR_FONT : WARNING_FONT;
      const reasonCell = excelRow.getCell(values.length);
      reasonCell.value = issue.messages.join('; ');

      for (let c = 1; c <= values.length; c += 1) {
        const cell = excelRow.getCell(c);
        cell.fill = fill;
        cell.font = { ...cell.font, ...font };
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
