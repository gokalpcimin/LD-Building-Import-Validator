import type { ColumnRole, SheetColumnMapping, SheetData, SheetType } from '../types';
import { classifySheet } from './sheetDetection';
import { normalizeSheetData } from './headerDetection';
import { getAddressColumn, getAssetColumn, getLocationColumn } from './parsers/columnDetection';

export const COLUMN_ROLE_OPTIONS: ColumnRole[] = [
  'ignore',
  'address',
  'assetType',
  'location',
  'floor',
  'room',
  'unit',
  'buildingNo',
];

export const COLUMN_ROLE_LABELS: Record<ColumnRole, string> = {
  ignore: 'Ignore',
  address: 'Address',
  assetType: 'Asset / Outlet Type',
  location: 'Location (combined Unit + Floor + Room text)',
  floor: 'Floor',
  room: 'Room',
  unit: 'Unit',
  buildingNo: 'Building No',
};

/**
 * Best-effort default mapping so the user rarely needs to change anything —
 * it reuses the same keyword detection the parser would otherwise fall back
 * on, then additionally recognizes explicit Floor/Room/Unit columns (e.g. a
 * customer file with "Level" and "Area" columns instead of one combined
 * location column).
 */
export function buildDefaultColumnMapping(
  headers: string[],
  sheetType: SheetType,
): SheetColumnMapping {
  const mapping: SheetColumnMapping = {};

  const locationColumn = getLocationColumn(sheetType, headers);
  const assetColumn = getAssetColumn(headers);
  const addressColumn = getAddressColumn(headers);

  for (const header of headers) {
    if (!header) {
      continue;
    }

    if (header === locationColumn) {
      mapping[header] = 'location';
      continue;
    }
    if (header === assetColumn) {
      mapping[header] = 'assetType';
      continue;
    }
    if (header === addressColumn) {
      mapping[header] = 'address';
      continue;
    }

    const lower = header.toLowerCase();
    if (/\bfloor\b|\blevel\b/.test(lower)) {
      mapping[header] = 'floor';
    } else if (/\broom\b|\barea\b/.test(lower)) {
      mapping[header] = 'room';
    } else if (/\bbuilding\s*(?:no|number|#)\b/.test(lower)) {
      // Distinct from "Unit" — a register's Building No → Floor → Room
      // hierarchy doesn't imply the sheet has a Unit concept at all.
      mapping[header] = 'buildingNo';
    } else if (/\bunit\b|\bblock\b/.test(lower)) {
      mapping[header] = 'unit';
    } else {
      mapping[header] = 'ignore';
    }
  }

  return mapping;
}

export interface SheetHeaderInfo {
  sheetName: string;
  sheetType: SheetType;
  /** Column headers in file order, including empty/padding entries. */
  headers: string[];
  /** First non-empty data row, aligned by index with `headers`, for preview. */
  sampleRow: string[];
}

/** Extracts headers + a sample row for a sheet, without running the full parser. */
export function extractSheetHeaderInfo(sheet: SheetData): SheetHeaderInfo {
  const sheetType = classifySheet(sheet.name);
  const { data } = normalizeSheetData(sheet.data);
  const headers = data[0] ?? [];
  const sampleRow = data.slice(1).find((row) => row.some((cell) => cell.length > 0)) ?? [];

  return { sheetName: sheet.name, sheetType, headers, sampleRow };
}

/** Builds default mappings for every non-cover-page sheet, keyed by sheet name. */
export function buildDefaultWorkbookMapping(
  sheets: SheetData[],
): Record<string, SheetColumnMapping> {
  const mappings: Record<string, SheetColumnMapping> = {};

  for (const sheet of sheets) {
    const { sheetType, headers } = extractSheetHeaderInfo(sheet);
    if (sheetType === 'cover-page') {
      continue;
    }
    mappings[sheet.name] = buildDefaultColumnMapping(headers, sheetType);
  }

  return mappings;
}

/** Finds the header currently assigned to a given role, if any. */
export function findHeaderByRole(
  mapping: SheetColumnMapping | undefined,
  role: ColumnRole,
): string | undefined {
  if (!mapping) {
    return undefined;
  }
  return Object.entries(mapping).find(([, r]) => r === role)?.[0];
}
