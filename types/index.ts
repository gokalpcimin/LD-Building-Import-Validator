export type AssetType =
  | 'Bib Tap'
  | 'WC'
  | 'Shower'
  | 'Expansion Vessel'
  | 'TMV'
  | 'WHB'
  | 'Washing Machine'
  | 'Dishwasher'
  | 'Water Boiler'
  | 'Calorifier'
  | 'Chilled Water Dispenser'
  | 'Chilled Water Fountain'
  | 'Water Fountain'
  | 'Spray Outlet'
  | 'Emergency Shower'
  | 'Emergency Eyewash'
  | 'Chiller Unit'
  | 'Hot Drinks Machine'
  | 'Ice Machine'
  | 'Unknown';

export type SheetType =
  | 'cover-page'
  | 'monthly-outlet'
  | 'annual-tmv'
  | 'annual-expansion-vessel'
  /** Building asset inventory sheets (e.g. "Outlet & Temperature Register") — hierarchical Building No → Floor → Room data, often embedded in raw text rather than clean columns. */
  | 'building-register'
  | 'unknown';

export type ValidationField =
  | 'address'
  | 'assetType'
  | 'floor'
  | 'room'
  | 'unit'
  | 'buildingNo'
  | 'duplicate';

/**
 * Error: import-blocking issue. Warning: needs human review before import.
 * Info: not an issue — a transparent note about something the parser
 * automatically detected or transformed (e.g. floor extracted from raw
 * text, asset type inferred from an abbreviation). Info entries never move
 * a row out of "Ready".
 */
export type ValidationSeverity = 'error' | 'warning' | 'info';

/**
 * Per-row import readiness, derived from that row's validation errors:
 * READY (no error/warning issues), REVIEW_REQUIRED (warning issues only —
 * import allowed but a human should look), BLOCKED (at least one error —
 * missing/unclassifiable required data, shouldn't be imported as-is).
 */
export type ImportStatus = 'READY' | 'REVIEW_REQUIRED' | 'BLOCKED';

/**
 * What a raw customer-file column should be treated as when building an
 * ImportReadyRow. "location" is a combined text column (e.g. "Unit 3 - 1st
 * Floor Finance Office") that gets split into unit/floor/room automatically;
 * floor/room/unit/buildingNo/address/assetType are explicit columns that
 * already hold just that one field and are used as-is.
 */
export type ColumnRole =
  | 'ignore'
  | 'address'
  | 'assetType'
  | 'location'
  | 'floor'
  | 'room'
  | 'unit'
  | 'buildingNo';

/** Maps a raw column header (as it appears in the file) to its role. */
export type SheetColumnMapping = Record<string, ColumnRole>;

export interface SheetData {
  name: string;
  data: string[][];
}

export interface ImportReadyRow {
  address: string;
  assetType: AssetType;
  /** Building identifier (e.g. "1") from register hierarchies like Building No → Floor → Room — distinct from Unit. */
  buildingNo?: string;
  floor?: string;
  room?: string;
  unit?: string;
  /** Count of this asset at this location, when a quantity was detected (e.g. "2 x Newark Calorifiers"). */
  quantity?: number;
  rawText?: string;
  sheetName?: string;
  /** 1-based row number in the original uploaded file, for locating/fixing the source row. */
  sourceRowNumber?: number;
}

export interface ValidationError {
  rowIdx: number;
  field: ValidationField;
  severity: ValidationSeverity;
  message: string;
  sheetName?: string;
}

export interface ValidationSummary {
  totalImported: number;
  distinctLocationsCount: number;
  totalErrors: number;
  totalWarnings: number;
}

export interface ParsedLocation {
  unit: string;
  floor: string;
  room: string;
}

export interface ParsedSheet {
  name: string;
  sheetType: SheetType;
  interpretation: string;
  headerRowIndex: number;
  columns: string[];
  rows: ImportReadyRow[];
  errors: ValidationError[];
  summary: ValidationSummary;
}

export interface WorkbookResult {
  fileName?: string;
  buildingAddress: string;
  companyName?: string;
  sheets: ParsedSheet[];
}
