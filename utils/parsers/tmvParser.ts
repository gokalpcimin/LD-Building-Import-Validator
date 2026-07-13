import type { ParserContext, ParserResult } from './types';
import { parseDataSheet } from './dataSheetParser';

export function parseTmvSheet(
  rawData: string[][],
  context: ParserContext,
): ParserResult {
  return parseDataSheet(
    rawData,
    context,
    'Annual TMV sheet — all rows assigned asset type TMV.',
  );
}
