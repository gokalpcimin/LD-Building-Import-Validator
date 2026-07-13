import type {
  ImportReadyRow,
  ParsedSheet,
  SheetColumnMapping,
  SheetData,
  ValidationError,
  ValidationSummary,
  WorkbookResult,
} from '../types';
import { classifySheet } from './sheetDetection';
import { summarizeValidation } from './validationEngine';
import { parseCoverPage, extractCoverPageAddress } from './parsers/coverPageParser';
import { parseExpansionVesselSheet } from './parsers/expansionVesselParser';
import { parseMonthlyOutlet } from './parsers/monthlyOutletParser';
import { parseTmvSheet } from './parsers/tmvParser';
import { parseUnknownSheet } from './parsers/unknownParser';
import { parseBuildingRegisterSheet } from './parsers/buildingRegisterParser';
import type { ParserContext, ParserResult } from './parsers/types';

function toParsedSheet(
  sheet: SheetData,
  result: ParserResult,
  sheetType: ReturnType<typeof classifySheet>,
): ParsedSheet {
  return {
    name: sheet.name,
    sheetType,
    interpretation: result.interpretation,
    headerRowIndex: result.headerRowIndex,
    columns: result.columns,
    rows: result.rows,
    errors: result.errors,
    summary: summarizeValidation(result.rows, result.errors),
  };
}

function runParser(
  sheet: SheetData,
  buildingAddress: string,
  manualAddress?: string,
  columnMapping?: SheetColumnMapping,
): ParsedSheet {
  const sheetType = classifySheet(sheet.name);
  const context: ParserContext = {
    sheetName: sheet.name,
    sheetType,
    buildingAddress,
    columnMapping,
  };

  switch (sheetType) {
    case 'cover-page': {
      const coverResult = parseCoverPage(sheet.data, context, manualAddress);
      return toParsedSheet(sheet, coverResult, sheetType);
    }
    case 'monthly-outlet':
      return toParsedSheet(sheet, parseMonthlyOutlet(sheet.data, context), sheetType);
    case 'annual-tmv':
      return toParsedSheet(sheet, parseTmvSheet(sheet.data, context), sheetType);
    case 'annual-expansion-vessel':
      return toParsedSheet(
        sheet,
        parseExpansionVesselSheet(sheet.data, context),
        sheetType,
      );
    case 'building-register':
      return toParsedSheet(
        sheet,
        parseBuildingRegisterSheet(sheet.data, context),
        sheetType,
      );
    default:
      return toParsedSheet(sheet, parseUnknownSheet(sheet.data, context), sheetType);
  }
}

export function processWorkbook(
  sheets: SheetData[],
  options?: {
    fileName?: string;
    manualAddress?: string;
    columnMappings?: Record<string, SheetColumnMapping>;
  },
): WorkbookResult {
  const coverSheet = sheets.find((sheet) => classifySheet(sheet.name) === 'cover-page');
  const manualAddress = options?.manualAddress?.trim();

  let buildingAddress = manualAddress || '';
  if (!buildingAddress && coverSheet) {
    buildingAddress = extractCoverPageAddress(coverSheet.data);
  }

  const parsedSheets = sheets.map((sheet) =>
    runParser(
      sheet,
      buildingAddress,
      classifySheet(sheet.name) === 'cover-page' ? manualAddress : undefined,
      options?.columnMappings?.[sheet.name],
    ),
  );

  return {
    fileName: options?.fileName,
    buildingAddress,
    sheets: parsedSheets,
  };
}

export function mergeAssetSheets(workbook: WorkbookResult): {
  rows: ImportReadyRow[];
  errors: ValidationError[];
  summary: ValidationSummary;
} {
  const assetSheets = workbook.sheets.filter(
    (sheet) => sheet.sheetType !== 'cover-page',
  );

  const rows: ImportReadyRow[] = [];
  const errors: ValidationError[] = [];
  let offset = 0;

  for (const sheet of assetSheets) {
    rows.push(...sheet.rows);
    // Each sheet's errors carry a rowIdx local to that sheet's own rows array —
    // rebase onto the merged array's global index so error-to-row lookups stay correct.
    for (const error of sheet.errors) {
      errors.push({ ...error, rowIdx: error.rowIdx + offset });
    }
    offset += sheet.rows.length;
  }

  return {
    rows,
    errors,
    summary: summarizeValidation(rows, errors),
  };
}

export function reprocessWithAddress(
  sheets: SheetData[],
  manualAddress: string,
  fileName?: string,
  columnMappings?: Record<string, SheetColumnMapping>,
): WorkbookResult {
  return processWorkbook(sheets, { fileName, manualAddress, columnMappings });
}
