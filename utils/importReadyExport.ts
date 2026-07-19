import type { ImportReadyRow, ImportStatus, ValidationError } from '../types';
import type { PastedAssetRow } from './pasteRegisterParser';
import { groupRowsByImportStatus } from './validationEngine';

/**
 * Shared CSV shape for both export files — platform fields from the case
 * brief (Address, Asset Type, Floor, Room, Unit) plus Quantity when the
 * parser detected an explicit count (e.g. "10 x WC"). Empty when unknown;
 * never invented as 1.
 */
export interface ImportReadyExportRow {
  address: string;
  assetType: string;
  floor: string;
  room: string;
  unit: string;
  quantity: string;
}

export type ExportBucket = 'ready' | 'review';

const CSV_HEADERS = ['Address', 'Asset Type', 'Floor', 'Room', 'Unit', 'Quantity'];

function escapeCsvCell(value: string): string {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function formatQuantity(value: number | null | undefined): string {
  return value === null || value === undefined ? '' : String(value);
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

function toExportRow(row: ImportReadyRow): ImportReadyExportRow {
  return {
    address: row.address ?? '',
    assetType: row.assetType ?? '',
    floor: row.floor ?? '',
    room: row.room ?? '',
    // Register hierarchies without a Unit concept export Building No as Unit
    // so the platform's location triple stays complete.
    unit: row.unit ?? row.buildingNo ?? '',
    quantity: formatQuantity(row.quantity),
  };
}

function pasteRowToExportRows(row: PastedAssetRow): ImportReadyExportRow[] {
  const base = {
    address: row.address ?? '',
    floor: row.floor.value ?? '',
    room: row.room.value ?? '',
    unit: row.building.value ?? row.buildingNumber.value ?? '',
  };

  // One CSV record per detected asset (Calorifier ×2 and Cold Source ×1 → 2 rows).
  if (row.detectedAssets && row.detectedAssets.length > 0) {
    return row.detectedAssets.map((asset) => ({
      ...base,
      assetType: asset.assetType,
      quantity: formatQuantity(asset.quantity ?? (asset.assetType === row.assetType.value ? row.quantity.value : null)),
    }));
  }

  return [
    {
      ...base,
      assetType: row.assetType.value ?? '',
      quantity: formatQuantity(row.quantity.value),
    },
  ];
}

/**
 * Two separate deliverables:
 * - `ready`  → only READY rows (the clean file the platform can ingest)
 * - `review` → only REVIEW_REQUIRED rows (uncertain but not blocked — human queue)
 * Blocked rows never appear in either file.
 */
export function buildExportRows(
  rows: ImportReadyRow[],
  errors: ValidationError[],
  bucket: ExportBucket,
): ImportReadyExportRow[] {
  const { readyRows, reviewRows } = groupRowsByImportStatus(rows, errors);
  const selected = bucket === 'ready' ? readyRows : reviewRows;

  return selected
    .slice()
    .sort((a, b) => a.rowIdx - b.rowIdx)
    .map(({ row }) => toExportRow(row));
}

/** Same split for the paste flow; multi-asset lines expand into one record per asset. */
export function buildExportRowsFromPaste(
  rows: PastedAssetRow[],
  bucket: ExportBucket,
): ImportReadyExportRow[] {
  const status: ImportStatus = bucket === 'ready' ? 'READY' : 'REVIEW_REQUIRED';
  const exportRows: ImportReadyExportRow[] = [];

  for (const row of rows) {
    if (row.importStatus !== status) {
      continue;
    }
    exportRows.push(...pasteRowToExportRows(row));
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
