import type { ValidationError } from '../../types';
import type { ParserContext, ParserResult } from './types';

function normalizeCell(cell: string): string {
  return cell.replace(/\s+/g, ' ').trim();
}

export function extractCoverPageAddress(rows: string[][]): string {
  for (const row of rows) {
    for (let index = 0; index < row.length; index += 1) {
      const label = normalizeCell(row[index] ?? '').toLowerCase();

      if (
        label.includes('company address') ||
        label.includes('building address') ||
        label === 'address'
      ) {
        for (let valueIndex = index + 1; valueIndex < row.length; valueIndex += 1) {
          const value = normalizeCell(row[valueIndex] ?? '');
          if (value) {
            return value;
          }
        }
      }
    }
  }

  return '';
}

export function extractCompanyName(rows: string[][]): string | undefined {
  for (const row of rows) {
    for (let index = 0; index < row.length; index += 1) {
      const label = normalizeCell(row[index] ?? '').toLowerCase();

      if (label.includes('company name') || label === 'company') {
        for (let valueIndex = index + 1; valueIndex < row.length; valueIndex += 1) {
          const value = normalizeCell(row[valueIndex] ?? '');
          if (value) {
            return value;
          }
        }
      }
    }
  }

  return undefined;
}

export function parseCoverPage(
  rawData: string[][],
  context: ParserContext,
  manualAddress?: string,
): ParserResult & { detectedAddress: string } {
  const detectedAddress = manualAddress?.trim() || extractCoverPageAddress(rawData);
  const companyName = extractCompanyName(rawData);
  const errors: ValidationError[] = [];

  if (!detectedAddress) {
    errors.push({
      rowIdx: 0,
      field: 'address',
      severity: 'error',
      message: 'Building address could not be detected — enter it manually',
      sheetName: context.sheetName,
    });
  }

  const companyNote = companyName ? ` Company: ${companyName}.` : '';

  return {
    rows: [],
    errors,
    headerRowIndex: 0,
    columns: [],
    interpretation: detectedAddress
      ? `Metadata sheet — building address "${detectedAddress}" will be applied to all asset rows.${companyNote}`
      : `Metadata sheet — address not found.${companyNote} Enter the building address below.`,
    detectedAddress,
  };
}
