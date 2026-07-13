import type { SheetColumnMapping, SheetType } from '../../types';

export interface ParserContext {
  sheetName: string;
  sheetType: SheetType;
  buildingAddress: string;
  /** User-confirmed (or auto-detected) column-to-field mapping for this sheet. */
  columnMapping?: SheetColumnMapping;
}

export interface ParserResult {
  rows: import('../../types').ImportReadyRow[];
  errors: import('../../types').ValidationError[];
  headerRowIndex: number;
  columns: string[];
  interpretation: string;
}
