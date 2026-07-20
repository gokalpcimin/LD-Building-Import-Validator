import type { AssetType, ParsedSheet, ValidationError, WorkbookResult } from '../types';
import { summarizeValidation } from './validationEngine';

/** Per-sheet human corrections made on the Review Sheets step. */
export interface SheetReviewEdits {
  assetOverrides: Map<number, AssetType>;
  promotedRowIdxs: Set<number>;
}

export type WorkbookReviewEdits = Record<string, SheetReviewEdits>;

export function emptySheetReviewEdits(): SheetReviewEdits {
  return {
    assetOverrides: new Map(),
    promotedRowIdxs: new Set(),
  };
}

function applyAssetOverrides(
  rows: ParsedSheet['rows'],
  assetOverrides: Map<number, AssetType>,
): ParsedSheet['rows'] {
  if (assetOverrides.size === 0) {
    return rows;
  }
  return rows.map((row, rowIdx) => {
    const override = assetOverrides.get(rowIdx);
    if (!override) {
      return row;
    }
    return {
      ...row,
      assetType: override,
      assetNeedsReview: false,
      assetConfidence: 1,
    };
  });
}

function applyErrorFilters(
  errors: ValidationError[],
  edits: SheetReviewEdits,
): ValidationError[] {
  return errors.filter((error) => {
    if (edits.promotedRowIdxs.has(error.rowIdx) && error.severity === 'warning') {
      return false;
    }
    if (edits.assetOverrides.has(error.rowIdx) && error.field === 'assetType') {
      return false;
    }
    return true;
  });
}

/** Apply Review Sheets edits to one parsed sheet (rows, errors, summary). */
export function applySheetReviewEdits(
  sheet: ParsedSheet,
  edits: SheetReviewEdits | undefined,
): ParsedSheet {
  if (!edits || (edits.assetOverrides.size === 0 && edits.promotedRowIdxs.size === 0)) {
    return sheet;
  }

  const rows = applyAssetOverrides(sheet.rows, edits.assetOverrides);
  const errors = applyErrorFilters(sheet.errors, edits);

  return {
    ...sheet,
    rows,
    errors,
    summary: summarizeValidation(rows, errors),
  };
}

export function applyWorkbookReviewEdits(
  workbook: WorkbookResult,
  edits: WorkbookReviewEdits,
): WorkbookResult {
  return {
    ...workbook,
    sheets: workbook.sheets.map((sheet) => applySheetReviewEdits(sheet, edits[sheet.name])),
  };
}
