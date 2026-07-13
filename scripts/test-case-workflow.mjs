import XLSX from 'xlsx';
import { processWorkbook, mergeAssetSheets } from '../utils/processWorkbook.ts';

const excelPath =
  process.argv[2] ||
  '/Users/gokalpcimin/Desktop/Risk Assessment input for case study.xlsx';

function parseWorkbook(path) {
  const workbook = XLSX.readFile(path);
  return workbook.SheetNames.map((sheetName) => ({
    name: sheetName,
    data: XLSX.utils
      .sheet_to_json(workbook.Sheets[sheetName], {
        header: 1,
        defval: '',
      })
      .map((row) => row.map((cell) => String(cell ?? '').replace(/\s+/g, ' ').trim()))
      .filter((row) => row.some((cell) => cell.length > 0)),
  }));
}

const sheets = parseWorkbook(excelPath);
const workbook = processWorkbook(sheets, { fileName: excelPath.split('/').pop() });
const final = mergeAssetSheets(workbook);

const results = workbook.sheets.map((sheet) => ({
  name: sheet.name,
  type: sheet.sheetType,
  headerRow: sheet.headerRowIndex + 1,
  columns: sheet.columns.slice(0, 6),
  rows: sheet.rows.length,
  errors: sheet.errors.filter((e) => e.severity === 'error').length,
  warnings: sheet.errors.filter((e) => e.severity === 'warning').length,
}));

console.log(
  JSON.stringify(
    {
      file: excelPath.split('/').pop(),
      buildingAddress: workbook.buildingAddress,
      sheets: results,
      final: {
        assetsImported: final.rows.length,
        distinctLocations: final.summary.distinctLocationsCount,
        criticalErrors: final.summary.totalErrors,
        warnings: final.summary.totalWarnings,
      },
    },
    null,
    2,
  ),
);
