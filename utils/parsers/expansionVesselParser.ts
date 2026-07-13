import type { ParserContext, ParserResult } from './types';
import { parseDataSheet } from './dataSheetParser';

export function parseExpansionVesselSheet(
  rawData: string[][],
  context: ParserContext,
): ParserResult {
  return parseDataSheet(
    rawData,
    context,
    'Expansion vessel sheet — all rows assigned asset type Expansion Vessel.',
  );
}
