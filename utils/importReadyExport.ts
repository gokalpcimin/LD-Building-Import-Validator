import type { ImportReadyRow, ValidationError } from '../types';
import type { PastedAssetRow } from './pasteRegisterParser';
import { groupRowsByImportStatus } from './validationEngine';

/**
 * The import-ready file is the clean deliverable the platform ingests — the
 * exact five fields from the case brief: Address, Asset/Outlet Type, Floor,
 * Room, Unit. Review metadata (sheet, row number, raw text, issues) stays in
 * the app; it exists to help the reviewer, not the platform importer.
 */
export interface ImportReadyExportRow {
  address: string;
  assetType: string;
  floor: string;
  room: string;
  unit: string;
  quantity: string;
}

const CSV_HEADERS = ['Address', 'Asset Type', 'Floor', 'Room', 'Unit', 'Quantity'];

function escapeCsvCell(value: string): string {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function toCsv(rows: ImportReadyExportRow[]): string {
  const lines = [CSV_HEADERS.join(',')];
  for (const row of rows) {
    lines.push(
      [row.address, row.assetType, row.floor, row.room, row.unit, row.quantity]
        .map(escapeCsvCell)
        .join(','),
    );
  }
  return lines.join('\r\n');
}

/**
 * Builds the import-ready dataset from the Excel/CSV flow: Ready and Review
 * Required rows only. Blocked rows are excluded by definition — they're
 * missing data the import record requires, and shipping them would push the
 * gap downstream. Register hierarchies without a Unit concept export their
 * Building No as the Unit so the platform's location triple stays complete.
 */
export function buildImportReadyRows(
  rows: ImportReadyRow[],
  errors: ValidationError[],
): ImportReadyExportRow[] {
  const { readyRows, reviewRows } = groupRowsByImportStatus(rows, errors);

  return [...readyRows, ...reviewRows]
    .sort((a, b) => a.rowIdx - b.rowIdx)
    .map(({ row }) => ({
      address: row.address ?? '',
      assetType: row.assetType ?? '',
      floor: row.floor ?? '',
      room: row.room ?? '',
      unit: row.unit ?? row.buildingNo ?? '',
      quantity: row.quantity !== undefined ? String(row.quantity) : '',
    }));
}

/**
 * Same contract for the paste flow. Rows flagged as "Multiple Assets" expand
 * into one export record per detected asset — the import model is one asset
 * per record, so a line like "Bath+SH head, WC" becomes two rows sharing the
 * same location.
 */
export function buildImportReadyRowsFromPaste(
  rows: PastedAssetRow[],
): ImportReadyExportRow[] {
  const exportRows: ImportReadyExportRow[] = [];

  for (const row of rows) {
    if (row.importStatus === 'BLOCKED') {
      continue;
    }

    const base = {
      address: row.address ?? '',
      floor: row.floor.value ?? '',
      room: row.room.value ?? '',
      unit: row.building.value ?? row.buildingNumber.value ?? '',
      quantity: row.quantity.value !== null ? String(row.quantity.value) : '',
    };

    const isMultiAsset =
      row.assetType.value === 'Multiple Assets' && (row.detectedAssets?.length ?? 0) > 0;

    if (isMultiAsset) {
      for (const asset of row.detectedAssets!) {
        exportRows.push({ ...base, assetType: asset.assetType });
      }
    } else {
      exportRows.push({ ...base, assetType: row.assetType.value ?? '' });
    }
  }

  return exportRows;
}

export function downloadImportReadyCsv(filename: string, rows: ImportReadyExportRow[]): void {
  // BOM so Excel opens the file as UTF-8 instead of guessing the encoding.
  const blob = new Blob(['\uFEFF' + toCsv(rows)], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
