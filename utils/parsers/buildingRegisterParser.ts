import type { ParserContext, ParserResult } from './types';
import { parseDataSheet } from './dataSheetParser';

/**
 * Asset inventory sheets (e.g. "Outlet & Temperature Register") — a
 * building-wide list of fixed assets, often with location info flattened
 * into raw text ("[Building No] [Floor] [Room] ..."). Distinct from
 * Monthly Outlet monitoring sheets: rows here represent one asset each,
 * not a repeating inspection history, so duplicate rows are treated as
 * data-entry mistakes worth flagging.
 */
export function parseBuildingRegisterSheet(
  rawData: string[][],
  context: ParserContext,
): ParserResult {
  return parseDataSheet(
    rawData,
    context,
    'Asset register sheet — parsing Building No / Floor / Room hierarchy from raw text.',
  );
}
