import type { ParserContext, ParserResult } from './types';
import { parseDataSheet } from './dataSheetParser';

export function parseUnknownSheet(
  rawData: string[][],
  context: ParserContext,
): ParserResult {
  return parseDataSheet(
    rawData,
    context,
    'Unknown sheet format — attempting generic location and asset detection.',
  );
}
