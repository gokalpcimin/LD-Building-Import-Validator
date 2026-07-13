import type { ParserContext, ParserResult } from './types';
import { parseDataSheet } from './dataSheetParser';

export function parseMonthlyOutlet(
  rawData: string[][],
  context: ParserContext,
): ParserResult {
  return parseDataSheet(
    rawData,
    context,
    'Monthly outlet temperature sheet — extracting locations as assets.',
  );
}
