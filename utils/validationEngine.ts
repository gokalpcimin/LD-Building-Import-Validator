import type {
  ImportReadyRow,
  ImportStatus,
  SheetType,
  ValidationError,
  ValidationField,
  ValidationSummary,
} from '../types';

export interface ValidationContext {
  sheetName: string;
  sheetType: SheetType;
  /**
   * Whether this sheet actually has a Unit concept at all (an explicit Unit
   * column, or "Unit X" section-divider rows). Building-register sheets
   * whose hierarchy is Building No → Floor → Room don't have units, so Unit
   * is excluded from the location check on those sheets.
   */
  hasUnitSource?: boolean;
}

function locationKey(row: Pick<ImportReadyRow, 'floor' | 'room' | 'unit'>): string {
  return `${row.floor ?? ''}|${row.room ?? ''}|${row.unit ?? ''}`;
}

export function validateRow(
  row: ImportReadyRow,
  rowIdx: number,
  context: ValidationContext,
): ValidationError[] {
  const errors: ValidationError[] = [];
  const { sheetName, sheetType, hasUnitSource = true } = context;

  if (!row.address?.trim()) {
    errors.push({
      rowIdx,
      field: 'address',
      severity: 'error',
      message: 'Missing address',
      sheetName,
    });
  }

  if (sheetType === 'cover-page') {
    return errors;
  }

  if (!row.assetType) {
    errors.push({
      rowIdx,
      field: 'assetType',
      severity: 'error',
      message: 'Missing asset type',
      sheetName,
    });
  } else if (row.assetType === 'Unknown') {
    errors.push({
      rowIdx,
      field: 'assetType',
      severity: 'error',
      message: 'Asset type could not be confidently classified',
      sheetName,
    });
  }

  const missingLocation: Array<{ field: ValidationField; message: string }> = [];
  if (!row.floor?.trim()) {
    missingLocation.push({ field: 'floor', message: 'Missing floor' });
  }
  if (!row.room?.trim()) {
    missingLocation.push({ field: 'room', message: 'Missing room' });
  }
  if (hasUnitSource && !row.unit?.trim()) {
    missingLocation.push({ field: 'unit', message: 'Unit could not be determined' });
  }

  const locationSeverity =
    missingLocation.length > 1 ? 'error' : missingLocation.length === 1 ? 'warning' : null;

  if (locationSeverity) {
    for (const item of missingLocation) {
      errors.push({
        rowIdx,
        field: item.field,
        severity: locationSeverity,
        message: item.message,
        sheetName,
      });
    }
  }

  return errors;
}

/** BLOCKED if any error-severity issue exists, REVIEW_REQUIRED if only warnings, otherwise READY. Info entries never affect the outcome. */
export function getImportStatus(rowErrors: ValidationError[]): ImportStatus {
  if (rowErrors.some((error) => error.severity === 'error')) {
    return 'BLOCKED';
  }
  if (rowErrors.some((error) => error.severity === 'warning')) {
    return 'REVIEW_REQUIRED';
  }
  return 'READY';
}

export interface RowWithErrors {
  row: ImportReadyRow;
  rowIdx: number;
  rowErrors: ValidationError[];
  importStatus: ImportStatus;
}

/** Splits rows into Ready / Review Required / Blocked — the same three-way import-readiness split used for pasted data, so both flows read identically to the user. */
export function groupRowsByImportStatus(
  rows: ImportReadyRow[],
  errors: ValidationError[],
): { readyRows: RowWithErrors[]; reviewRows: RowWithErrors[]; blockedRows: RowWithErrors[] } {
  const errorsByRow = new Map<number, ValidationError[]>();
  for (const error of errors) {
    const existing = errorsByRow.get(error.rowIdx) ?? [];
    existing.push(error);
    errorsByRow.set(error.rowIdx, existing);
  }

  const readyRows: RowWithErrors[] = [];
  const reviewRows: RowWithErrors[] = [];
  const blockedRows: RowWithErrors[] = [];

  rows.forEach((row, rowIdx) => {
    const rowErrors = errorsByRow.get(rowIdx) ?? [];
    const importStatus = getImportStatus(rowErrors);
    const entry: RowWithErrors = { row, rowIdx, rowErrors, importStatus };

    if (importStatus === 'BLOCKED') {
      blockedRows.push(entry);
    } else if (importStatus === 'REVIEW_REQUIRED') {
      reviewRows.push(entry);
    } else {
      readyRows.push(entry);
    }
  });

  return { readyRows, reviewRows, blockedRows };
}

/** Row-count based, not issue-count based — one row contributes to at most one bucket, matching how the KPI cards are read for pasted data too. */
export function summarizeValidation(
  rows: ImportReadyRow[],
  errors: ValidationError[],
): ValidationSummary {
  const distinctLocations = new Set(rows.map(locationKey));
  const { reviewRows, blockedRows } = groupRowsByImportStatus(rows, errors);

  return {
    totalImported: rows.length,
    distinctLocationsCount: distinctLocations.size,
    totalErrors: blockedRows.length,
    totalWarnings: reviewRows.length,
  };
}

export function getSheetStatusLabel(
  rowCount: number,
  errors: ValidationError[],
): string {
  if (rowCount === 0) {
    return 'No asset rows';
  }

  const errorCount = errors.filter((error) => error.severity === 'error').length;
  const warningCount = errors.filter((error) => error.severity === 'warning').length;
  const validRows = rowCount - new Set(
    errors.filter((e) => e.severity === 'error').map((e) => e.rowIdx),
  ).size;

  if (warningCount > 0) {
    return `✔ ${validRows} valid rows · ⚠ ${warningCount} warnings`;
  }

  if (errorCount > 0) {
    return `✔ ${validRows} valid rows · ✕ ${errorCount} errors`;
  }

  return `✔ ${validRows} valid rows`;
}
