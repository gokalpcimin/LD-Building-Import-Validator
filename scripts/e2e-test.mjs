/**
 * Full end-to-end workflow test — exercises every feature of the refactored app.
 * Run: npx tsx scripts/e2e-test.mjs
 */
import XLSX from 'xlsx';
import { existsSync } from 'fs';
import { processWorkbook, mergeAssetSheets, reprocessWithAddress } from '../utils/processWorkbook.ts';
import { parseLocationText, parseBuildingRegisterLine } from '../utils/locationParser.ts';
import { detectAssetType, extractAllAssets } from '../utils/assetDetector.ts';
import { classifySheet } from '../utils/sheetDetection.ts';
import { groupRowsByImportStatus } from '../utils/validationEngine.ts';
import { buildDefaultWorkbookMapping, findHeaderByRole } from '../utils/columnMapping.ts';
import { parsePastedText } from '../utils/pastedTextParser.ts';

const CASE_STUDY = 'samples/risk-assessment-case-study.xlsx';
const DEMO_FILE = 'samples/customer-building-portfolio.xlsx';

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    passed += 1;
    console.log(`  ✓ ${message}`);
  } else {
    failed += 1;
    console.log(`  ✗ FAIL: ${message}`);
  }
}

function parseExcel(path) {
  const workbook = XLSX.readFile(path);
  return workbook.SheetNames.map((name) => ({
    name,
    data: XLSX.utils
      .sheet_to_json(workbook.Sheets[name], { header: 1, defval: '' })
      .map((row) => row.map((c) => String(c ?? '').replace(/\s+/g, ' ').trim()))
      .filter((row) => row.some((c) => c.length > 0)),
  }));
}

console.log('\n═══════════════════════════════════════════════════');
console.log('  LD Building Import Validator — E2E Test');
console.log('═══════════════════════════════════════════════════\n');

// ─── STEP 1: Upload & Sheet Detection ───────────────────────────────────────
console.log('STEP 1 — Upload Excel & automatic sheet detection');
assert(existsSync(CASE_STUDY), `Case study file exists: ${CASE_STUDY}`);

const sheets = parseExcel(CASE_STUDY);
assert(sheets.length === 4, `Detected 4 sheets (got ${sheets.length})`);

const expectedTypes = {
  'Cover Page': 'cover-page',
  'Monthly Outlet': 'monthly-outlet',
  'Annual TMVs': 'annual-tmv',
  'Annual Expension Vessels': 'annual-expansion-vessel',
};
for (const sheet of sheets) {
  const type = classifySheet(sheet.name);
  assert(
    type === expectedTypes[sheet.name],
    `"${sheet.name}" classified as ${type}`,
  );
}

// ─── STEP 2: Cover Page — address extraction ────────────────────────────────
console.log('\nSTEP 2 — Cover Page metadata (address extraction)');
const workbook = processWorkbook(sheets, { fileName: 'risk-assessment-case-study.xlsx' });

assert(
  workbook.buildingAddress.includes('52 North Lane'),
  `Building address auto-detected: "${workbook.buildingAddress.slice(0, 40)}..."`,
);

const coverSheet = workbook.sheets.find((s) => s.sheetType === 'cover-page');
assert(coverSheet?.rows.length === 0, 'Cover Page produces 0 asset rows (metadata only)');
assert(
  coverSheet?.interpretation.includes('Metadata sheet'),
  'Cover Page interpretation explains metadata role',
);
assert(coverSheet?.errors.length === 0, 'Cover Page has no errors when address found');

// ─── STEP 3: Manual address input (reprocess) ───────────────────────────────
console.log('\nSTEP 3 — Manual address input & global re-application');
const manualAddress = '99 Test Street, London';
const reprocessed = reprocessWithAddress(sheets, manualAddress, 'test.xlsx');
assert(
  reprocessed.buildingAddress === manualAddress,
  'Manual address overrides detected address',
);
const monthlyAfterManual = reprocessed.sheets.find((s) => s.sheetType === 'monthly-outlet');
assert(
  monthlyAfterManual?.rows.every((r) => r.address === manualAddress),
  'Manual address applied to all Monthly Outlet rows',
);

// Reprocess with original for remaining tests
const wb = processWorkbook(sheets, { fileName: 'risk-assessment-case-study.xlsx' });

// ─── STEP 4: Monthly Outlet parser ──────────────────────────────────────────
console.log('\nSTEP 4 — Monthly Outlet parser');
const monthly = wb.sheets.find((s) => s.sheetType === 'monthly-outlet');
assert(monthly?.rows.length === 347, `Monthly Outlet parsed 347 rows (got ${monthly?.rows.length})`);
assert(monthly?.headerRowIndex === 1, 'Monthly Outlet header at row 2 (index 1)');
assert(
  monthly?.columns.includes('Outlet/Location'),
  'Detected Outlet/Location column',
);
const monthlyErrors = monthly?.errors.filter((e) => e.severity === 'error').length ?? -1;
const monthlyWarnings = monthly?.errors.filter((e) => e.severity === 'warning').length ?? -1;
assert(monthlyErrors > 0, `Monthly Outlet: ${monthlyErrors} critical errors (e.g. incomplete location)`);
assert(monthlyWarnings > 0, `Monthly Outlet: ${monthlyWarnings} warnings for review (unknown/soft assets)`);

const sampleRow = monthly?.rows.find((r) => r.rawText?.includes('Finance Office'));
if (sampleRow) {
  assert(sampleRow.floor?.includes('Floor'), `Floor extracted: "${sampleRow.floor}"`);
  assert(sampleRow.room?.includes('Finance'), `Room extracted: "${sampleRow.room}"`);
}

// ─── STEP 5: TMV parser ─────────────────────────────────────────────────────
console.log('\nSTEP 5 — Annual TMVs parser (forced asset type)');
const tmv = wb.sheets.find((s) => s.sheetType === 'annual-tmv');
assert(tmv?.rows.length === 2, `TMV sheet parsed 2 rows (got ${tmv?.rows.length})`);
assert(
  tmv?.rows.every((r) => r.assetType === 'TMV'),
  'All TMV rows have assetType = TMV',
);
assert(tmv?.errors.filter((e) => e.severity === 'error').length === 0, 'TMV: no critical errors');

// ─── STEP 6: Expansion Vessel parser ────────────────────────────────────────
console.log('\nSTEP 6 — Expansion Vessels parser (forced asset type)');
const vessels = wb.sheets.find((s) => s.sheetType === 'annual-expansion-vessel');
assert(vessels?.rows.length === 13, `Expansion Vessels parsed 13 rows (got ${vessels?.rows.length})`);
assert(
  vessels?.rows.every((r) => r.assetType === 'Expansion Vessel'),
  'All vessel rows have assetType = Expansion Vessel',
);

// ─── STEP 7: Location parser (shared utility) ───────────────────────────────
console.log('\nSTEP 7 — Reusable location parser');
const loc1 = parseLocationText('Unit 3 - 1st Floor Finance Office');
assert(loc1.unit === 'Unit 3', `Unit: "${loc1.unit}"`);
assert(loc1.floor === '1st Floor', `Floor: "${loc1.floor}"`);
assert(loc1.room === 'Finance Office', `Room: "${loc1.room}"`);

const loc2 = parseLocationText('1st Floor- Finance Office');
assert(loc2.floor === '1st Floor', `Floor from dash format: "${loc2.floor}"`);
assert(loc2.room === 'Finance Office', `Room from dash format: "${loc2.room}"`);

// ─── STEP 8: Asset detector ─────────────────────────────────────────────────
console.log('\nSTEP 8 — Asset recognition layer');
assert(detectAssetType(['Bib Tap']).assetType === 'Bib Tap', 'Detects Bib Tap');
assert(detectAssetType(['toilet']).assetType === 'WC', 'Detects WC from toilet');
assert(detectAssetType(['Toilets']).assetType === 'WC', 'Detects WC from Toilets');
assert(detectAssetType(['Tuvalet']).assetType === 'WC', 'Detects WC from Turkish Tuvalet');
assert(detectAssetType(['wash hand basin']).assetType === 'WHB', 'Detects WHB');
assert(detectAssetType(['Bathroom']).assetType === 'Shower', 'Infers Shower from Bathroom location');
assert(
  detectAssetType(['Bathroom']).inferredFromLocation === true,
  'Bathroom location inference is soft (review, not ready)',
);
assert(detectAssetType(['unknown thing']).assetType === 'Unknown', 'Unknown for unrecognized');
assert(detectAssetType(['location'], 'annual-tmv').assetType === 'TMV', 'Forced TMV from sheet type');

// ─── STEP 9: Validation engine ──────────────────────────────────────────────
console.log('\nSTEP 9 — Validation engine (errors vs warnings)');
const final = mergeAssetSheets(wb);
assert(final.rows.length === 362, `Final merge: 362 asset rows (got ${final.rows.length})`);
// Unit section headings (e.g. "Unit 3", "Unit 14/15") are inherited onto rows below them.
assert(final.summary.distinctLocationsCount === 72, `72 distinct locations (got ${final.summary.distinctLocationsCount})`);
// Unknown assets are Review Required (warning), not hard-blocked.
assert(final.summary.totalWarnings > 0, `${final.summary.totalWarnings} review-required rows total`);

// All rows should have address from cover page
assert(
  final.rows.every((r) => r.address.includes('52 North Lane')),
  'All asset rows inherit Cover Page address',
);

// Cover page excluded from merge
assert(
  !final.rows.some((r) => r.sheetName === 'Cover Page'),
  'Cover Page rows excluded from final asset merge',
);

// ─── STEP 10: ImportReadyRow schema ─────────────────────────────────────────
console.log('\nSTEP 10 — ImportReadyRow standardized schema');
const firstRow = final.rows[0];
assert(typeof firstRow.address === 'string', 'address: string');
assert(typeof firstRow.assetType === 'string', 'assetType: string');
assert(
  'floor' in firstRow || firstRow.floor === undefined,
  'floor is optional',
);
assert(!('id' in firstRow), 'No legacy id field in ImportReadyRow');

// ─── STEP 11: Missing address scenario ──────────────────────────────────────
console.log('\nSTEP 11 — Missing address warning flow');
const sheetsNoCover = sheets.filter((s) => s.name !== 'Cover Page');
const wbNoAddress = processWorkbook(sheetsNoCover);
assert(wbNoAddress.buildingAddress === '', 'No address without Cover Page');
const monthlyNoAddr = wbNoAddress.sheets.find((s) => s.sheetType === 'monthly-outlet');
const addrErrors = monthlyNoAddr?.errors.filter((e) => e.field === 'address' && e.severity === 'error').length ?? 0;
assert(addrErrors > 0, 'Missing address produces errors on asset rows');

// ─── STEP 12: Import Ready Preview — Ready / Review Required / Blocked ─────
console.log('\nSTEP 12 — Import Ready Preview: Ready / Review Required / Blocked split');
const { readyRows, reviewRows, blockedRows } = groupRowsByImportStatus(final.rows, final.errors);
assert(
  readyRows.length + reviewRows.length + blockedRows.length === final.rows.length,
  'Ready + Review Required + Blocked = all rows',
);
assert(
  readyRows.every((entry) => entry.importStatus === 'READY'),
  'Rows in the Ready bucket are tagged importStatus READY',
);
assert(
  blockedRows.every((entry) => entry.rowErrors.some((e) => e.severity === 'error')),
  'Every Blocked row has at least one error-severity issue',
);

// ─── STEP 13: Column mapping — customer files with renamed columns ─────────
console.log('\nSTEP 13 — Column mapping for renamed customer columns');

// Real sample file: mapping should be auto-detected with no manual changes needed.
const realFileMapping = buildDefaultWorkbookMapping(sheets);
assert(
  findHeaderByRole(realFileMapping['Monthly Outlet'], 'location') === 'Outlet/Location',
  'Monthly Outlet: "Outlet/Location" auto-mapped to location role',
);
assert(
  findHeaderByRole(realFileMapping['Annual TMVs'], 'location') === 'TMV / Location',
  'Annual TMVs: "TMV / Location" auto-mapped to location role',
);
assert(
  findHeaderByRole(realFileMapping['Annual Expension Vessels'], 'location') ===
    'Expansion Vessel / Location',
  'Expansion Vessels: "Expansion Vessel / Location" auto-mapped to location role',
);
const irrelevantColumnsIgnored = ['Date', 'Name', 'Comments'].every(
  (header) => realFileMapping['Monthly Outlet'][header] === 'ignore',
);
assert(irrelevantColumnsIgnored, 'Date/Name/Comments columns default to "ignore"');

// Case-study example: "Building Address / Equipment / Level / Area" → Address / Asset Type / Floor / Room
const renamedColumnsSheets = [
  {
    name: 'Assets',
    data: [
      ['Building Address', 'Equipment', 'Level', 'Area'],
      ['52 North Lane, London', 'Bib Tap', '1st Floor', 'Finance Office'],
      ['52 North Lane, London', 'WC', 'Ground Floor', 'Reception'],
    ],
  },
];
const renamedMapping = buildDefaultWorkbookMapping(renamedColumnsSheets);
assert(
  renamedMapping.Assets['Building Address'] === 'address',
  '"Building Address" → address role',
);
assert(renamedMapping.Assets.Equipment === 'assetType', '"Equipment" → assetType role');
assert(renamedMapping.Assets.Level === 'floor', '"Level" → floor role');
assert(renamedMapping.Assets.Area === 'room', '"Area" → room role');

const renamedWorkbook = processWorkbook(renamedColumnsSheets, {
  columnMappings: renamedMapping,
});
const renamedRows = renamedWorkbook.sheets[0].rows;
assert(renamedRows.length === 2, `Renamed-columns sheet parsed ${renamedRows.length} rows`);
assert(
  renamedRows[0].address === '52 North Lane, London' &&
    renamedRows[0].assetType === 'Bib Tap' &&
    renamedRows[0].floor === '1st Floor' &&
    renamedRows[0].room === 'Finance Office',
  'Row 1 correctly mapped: address/assetType/floor/room all match source columns',
);
assert(
  renamedRows[1].assetType === 'WC' && renamedRows[1].room === 'Reception',
  'Row 2 correctly mapped: assetType=WC, room=Reception',
);

// Manual override: user marks the Equipment column as ignored — asset type
// should then be flagged Unknown/Needs Review instead of silently guessed,
// proving the confirmed mapping (not just keyword luck) drives parsing.
const overriddenMapping = {
  Assets: { ...renamedMapping.Assets, Equipment: 'ignore' },
};
const overriddenWorkbook = processWorkbook(renamedColumnsSheets, {
  columnMappings: overriddenMapping,
});
assert(
  overriddenWorkbook.sheets[0].rows[0].assetType === 'Unknown',
  'Manual override: ignoring the Equipment column yields Unknown asset type',
);
const overriddenStatus = groupRowsByImportStatus(
  overriddenWorkbook.sheets[0].rows,
  overriddenWorkbook.sheets[0].errors,
);
assert(
  overriddenStatus.reviewRows.length === 2 && overriddenStatus.blockedRows.length === 0,
  'Manual override: Unknown asset type goes to Review Required (not Blocked)',
);

// ─── STEP 14: Paste Data — outlet register format ───────────────────────────
console.log('\nSTEP 14 — Paste Data outlet register format');
const outletRegisterSheets = [
  {
    name: 'Pasted Data',
    data: [
      ['Building No', 'Floor', 'Location/Barcode', 'Sink', 'Whb', 'Shower', 'TMVs No.', 'Other Comments'],
      ['1', 'Ground', 'Staff Laundry', '1', '2', '-', '-', '2 x WM'],
      ['CROFTERS', '', '', '', '', '', '', ''],
      [
        '1',
        'Ground',
        'Kitchen WC',
        '-',
        '1',
        '-',
        '-',
        'WC, Supply assumed to move into courtyard for Bib Tap x 1',
      ],
      ['1', 'First', 'Bathroom', '-', '-', '1', '1', 'Bath+SH, WC'],
    ],
  },
];
const outletRegisterMapping = buildDefaultWorkbookMapping(outletRegisterSheets);
assert(
  outletRegisterMapping['Pasted Data']['Building No'] === 'buildingNo',
  'Paste register: "Building No" auto-maps to Building No role (distinct from Unit)',
);
assert(
  outletRegisterMapping['Pasted Data'].Floor === 'floor',
  'Paste register: "Floor" auto-maps to Floor',
);
const outletRegisterWorkbook = processWorkbook(outletRegisterSheets, {
  manualAddress: 'Manual Test Address',
  columnMappings: outletRegisterMapping,
});
const outletRegisterFinal = mergeAssetSheets(outletRegisterWorkbook);
assert(
  outletRegisterFinal.rows.length === 8,
  `Paste register expands asset-count/comment columns into 8 asset rows (got ${outletRegisterFinal.rows.length})`,
);
assert(
  outletRegisterFinal.rows.every((row) => row.buildingNo === '1'),
  'Paste register: every generated row carries Building No = "1" (Building No, not Unit)',
);
assert(
  outletRegisterFinal.rows.every((row) => row.floor),
  'Paste register: every generated row has a Floor',
);
assert(
  outletRegisterFinal.rows
    .filter((row) => row.room === 'Kitchen WC' || row.room === 'Bathroom')
    .every((row) => row.unit === 'CROFTERS'),
  'Paste register: section heading "CROFTERS" is inherited into Unit for rows below it',
);
assert(
  outletRegisterFinal.rows.filter((row) => row.room === 'Staff Laundry').every((row) => !row.unit),
  'Paste register: rows above any section heading have no Unit (none exists yet)',
);
assert(
  outletRegisterFinal.rows.some((row) => row.assetType === 'Bib Tap') &&
    outletRegisterFinal.rows.some((row) => row.assetType === 'WC') &&
    outletRegisterFinal.rows.some((row) => row.assetType === 'TMV') &&
    outletRegisterFinal.rows.some((row) => row.assetType === 'Washing Machine') &&
    outletRegisterFinal.rows.some((row) => row.assetType === 'Shower'),
  'Paste register: comments/count columns/abbreviations generate Bib Tap, WC, TMV, Washing Machine and Shower rows',
);
assert(
  outletRegisterFinal.rows.find((row) => row.room === 'Staff Laundry' && row.assetType === 'WHB')
    ?.quantity === 3,
  'Paste register: split Sink(1) + Whb(2) count columns of the same bucketed type are summed into one WHB row (qty 3)',
);
assert(
  !outletRegisterFinal.errors.some((error) => error.message === 'Unit could not be determined'),
  'Paste register: no "Unit could not be determined" warnings — this sheet has no Unit concept, only Building No',
);
assert(
  !outletRegisterFinal.errors.some((error) => error.field === 'unit'),
  'Paste register: Unit is never even validated for this sheet (hasUnitSource = false)',
);
assert(
  outletRegisterFinal.errors.some(
    (error) => error.severity === 'info' && error.field === 'assetType' && error.message.includes('abbreviation'),
  ),
  'Paste register: abbreviation-based asset detection surfaces as an Info note, not a warning',
);

// ─── STEP 15: Paste Data — messy, line-wrapped PDF-style register ─────────
// Real-world worst case: a table copied out of a PDF/Word report where the
// header title is wrapped one word per line, and note/glossary lines
// ("Abbreviations: ...", "Begin the walk through ...") get flattened into
// the same block, with no reliable Tab/comma delimiter anywhere.
console.log('\nSTEP 15 — Paste Data: messy line-wrapped register (no delimiter)');
const messyPasteRaw = [
  'Outlet & Temperature Register',
  'Other Services i.e.',
  'Building No',
  'Floor',
  'Location/Barcode',
  'Sink',
  'Whb',
  'Shower',
  'TMVs No.',
  'Flexible Hoses',
  'Vending, washing machines,',
  'dishwashers, chiller units, tea',
  'boilers etc., /',
  'Other Comments',
  'Abbreviations: Dishwasher – DW, Washing Machine – WM, Bib Tap - BT, Hot Drinks Machine – HDM, Ice Machine – IM, Chilled Water Fountain – CWF, Water Fountain - WF',
  'Emergency Shower – ES, Emergency Eyewash – EEW, Water Boiler - WB',
  'Begin the walk through at the Ground Floor Laundry – exit and walk left towards reception. Stay left.',
  '1 Lower',
  'Ground Domestic Hot Water Plant Room - - - - 1 - - - - - - - - 2 x Newark Calorifiers',
  'Ground',
  '1',
  'Staff Laundry -',
  '52.1',
  '34.4 2 7.3 1 2 - - 1 - - - -',
  'DHWS appeared to be accurate',
  'against the flow measurement, 2 x',
  'WM',
  '1 Ground Residential Laundry - 39.1 2 8.1 1 1 - - - - - - - WM',
  'CROFTERS',
  '1 Ground Restaurant Servery - 44.1 2 - 1 - 1 - 1 - 1 - - - -',
  '1 Ground Kitchen WC - 40.8 2 - 1 - 1 - 1 - 1 - - - - WC',
].join('\n');

const messyPasteRows = parsePastedText(messyPasteRaw);
const messyPasteSheets = [{ name: 'Pasted Data', data: messyPasteRows }];
const messyPasteMapping = buildDefaultWorkbookMapping(messyPasteSheets);
const messyPasteWorkbook = processWorkbook(messyPasteSheets, {
  manualAddress: 'Test Address',
  columnMappings: messyPasteMapping,
});
const messyPasteFinal = mergeAssetSheets(messyPasteWorkbook);

const junkPattern = /vending|dishwasher|boiler|abbreviation|emergency shower|begin the walk/i;
assert(
  !messyPasteFinal.rows.some((row) =>
    junkPattern.test(`${row.unit ?? ''} ${row.room ?? ''} ${row.rawText ?? ''}`),
  ),
  'Wrapped header/glossary/instruction lines never become fabricated asset rows',
);
assert(
  !messyPasteFinal.rows.some((row) => row.unit === 'Flexible Hoses' || row.unit === 'Other Comments'),
  'Column-header fragments (e.g. "Flexible Hoses") never leak into Unit',
);
assert(
  !messyPasteFinal.rows.some((row) => row.unit === 'WM'),
  'Glossary abbreviations (e.g. "WM") are not mistaken for a Unit/area heading',
);
assert(
  messyPasteFinal.rows.some((row) => row.unit === 'CROFTERS'),
  'Genuine ALL-CAPS area headings (e.g. "CROFTERS") are still captured as Unit',
);
assert(
  messyPasteFinal.rows.length > 0 && messyPasteFinal.rows.length < 10,
  `Only genuine data-bearing lines become rows (got ${messyPasteFinal.rows.length})`,
);

// ─── STEP 16: Building-register line decomposition & expanded asset rules ──
console.log('\nSTEP 16 — Building-register line parsing & expanded asset detection');
const regLine1 = parseBuildingRegisterLine(
  '1 Ground Residential Laundry - 39.1 2 8.1 1 1 - - - - - - - WM',
);
assert(regLine1.buildingNo === '1', `Register line: Building No "${regLine1.buildingNo}"`);
assert(regLine1.floor === 'Ground', `Register line: Floor "${regLine1.floor}"`);
assert(regLine1.room === 'Residential Laundry', `Register line: Room "${regLine1.room}"`);

const regLine2 = parseBuildingRegisterLine('1 Ground Orchards WC-1 - 39.0 2 - 1 - 1 - 1 - 1 - - - - WC');
assert(regLine2.floor === 'Ground', 'Register line: Floor extracted even with trailing asset code');
assert(regLine2.room === 'Orchards WC-1', `Register line: Room "${regLine2.room}"`);

const regLine3 = parseBuildingRegisterLine('1 Ground Flat 3 - 2 1 1 1 1 2 - - - - WC');
assert(
  regLine3.room === 'Flat 3',
  `Register line: a single trailing digit stays part of the room name ("${regLine3.room}")`,
);

const regLine4 = parseBuildingRegisterLine('1 First Bathroom - 32.9 2 - 1 - 1 1 2 - 1 - - - -');
assert(regLine4.floor === 'First', `Register line: recognizes "First" floor keyword`);

const noMatch = parseBuildingRegisterLine('Not a register-style line at all');
assert(
  noMatch.buildingNo === undefined && noMatch.floor === undefined,
  'Register line: non-matching text yields no forced extraction',
);

const multiAssets = extractAllAssets('Bath+SH head, WC');
assert(
  multiAssets.some((m) => m.assetType === 'Shower') && multiAssets.some((m) => m.assetType === 'WC'),
  'Multi-asset text "Bath+SH head, WC" yields both Shower and WC',
);

const qtyAssets = extractAllAssets('2 x Newark Calorifiers');
const calorifierMatch = qtyAssets.find((m) => m.assetType === 'Calorifier');
assert(calorifierMatch?.quantity === 2, `"2 x Newark Calorifiers" detected with quantity 2`);

const sprayMatch = extractAllAssets('1 x Spray head').find((m) => m.assetType === 'Spray Outlet');
assert(sprayMatch?.quantity === 1, '"1 x Spray head" detected as Spray Outlet, quantity 1');

const abbrevPairs = [
  ['WM', 'Washing Machine'],
  ['DW', 'Dishwasher'],
  ['BT', 'Bib Tap'],
  ['HDM', 'Hot Drinks Machine'],
  ['IM', 'Ice Machine'],
  ['CWF', 'Chilled Water Fountain'],
  ['WF', 'Water Fountain'],
  ['ES', 'Emergency Shower'],
  ['EEW', 'Emergency Eyewash'],
  ['WB', 'Water Boiler'],
];
for (const [abbrev, expectedType] of abbrevPairs) {
  const match = extractAllAssets(`Some location ${abbrev}`).find((m) => m.assetType === expectedType);
  assert(Boolean(match?.isAbbreviation), `Abbreviation "${abbrev}" → ${expectedType}`);
}

// ─── STEP 17: Real-world "Outlet & Temperature Register" sample data ───────
console.log('\nSTEP 17 — Real-world Outlet & Temperature Register sample (sheet-aware parsing)');
const realRegisterRaw = [
  'Outlet & Temperature Register',
  'Other Services i.e.',
  'Building No',
  'Floor',
  'Location/Barcode',
  'Sink',
  'Whb',
  'Shower',
  'TMVs No.',
  'Other Comments',
  '1 Ground Residential Laundry - 39.1 2 8.1 1 1 - - - - - - - WM',
  '1 Ground The Orchards Lounge - 39.2 2 - 1 - 1 - 1 - - - -',
  '1 Ground Orchards WC-1 - 39.0 2 - 1 - 1 - 1 - 1 - - - - WC',
  '1 Ground Orchards Ass Bathroom - 41.1 2 10.9 1 - 1 1 2 - - - - Bath+SH head, WC',
  '1 Ground Flat 3 - 2 1 1 1 1 2 - - - - WC',
  '1 Ground Hair Dresser - 43.5 2 16.1 1 - 2 - 2 - - - - 1 x Spray head',
  'CROFTERS',
  '1 Ground Kitchen WC - 40.8 2 - 1 - 1 - 1 - 1 - - - - WC',
].join('\n');

const realRegisterRows = parsePastedText(realRegisterRaw);
const realRegisterSheets = [{ name: 'Pasted Data', data: realRegisterRows }];
const realRegisterMapping = buildDefaultWorkbookMapping(realRegisterSheets);
const realRegisterWorkbook = processWorkbook(realRegisterSheets, {
  manualAddress: 'Ankara',
  columnMappings: realRegisterMapping,
});
const realRegisterFinal = mergeAssetSheets(realRegisterWorkbook);

assert(
  realRegisterFinal.rows.every((row) => row.buildingNo === '1'),
  'Real register sample: Building No "1" extracted from raw text on every row',
);
assert(
  realRegisterFinal.rows.every((row) => row.floor === 'Ground'),
  'Real register sample: Floor "Ground" extracted from raw text on every row',
);
assert(
  realRegisterFinal.rows.some((row) => row.room === 'Residential Laundry' && row.assetType === 'Washing Machine'),
  'Real register sample: "...WM" line → Room "Residential Laundry", Asset Type Washing Machine',
);
assert(
  realRegisterFinal.rows.some((row) => row.room === 'Orchards WC-1' && row.assetType === 'WC'),
  'Real register sample: "Orchards WC-1" → Room text kept intact, Asset Type WC',
);
assert(
  realRegisterFinal.rows.filter((row) => row.room === 'Orchards Ass Bathroom').length === 2 &&
    realRegisterFinal.rows.some((row) => row.room === 'Orchards Ass Bathroom' && row.assetType === 'Shower') &&
    realRegisterFinal.rows.some((row) => row.room === 'Orchards Ass Bathroom' && row.assetType === 'WC'),
  'Real register sample: "Bath+SH head, WC" produces 2 records (Shower + WC) for the same room',
);
assert(
  realRegisterFinal.rows.some((row) => row.room === 'Flat 3'),
  'Real register sample: "Flat 3" room name keeps its trailing digit',
);
assert(
  realRegisterFinal.rows.some((row) => row.assetType === 'Spray Outlet' && row.quantity === 1),
  'Real register sample: "1 x Spray head" → Spray Outlet, quantity 1',
);
assert(
  realRegisterFinal.rows
    .filter((row) => row.room === 'Kitchen WC')
    .every((row) => row.unit === 'CROFTERS'),
  'Real register sample: "CROFTERS" heading inherited as Unit for rows below it',
);
assert(
  !realRegisterFinal.errors.some((error) => error.message === 'Unit could not be determined'),
  'Real register sample: no false "Unit could not be determined" warnings',
);
assert(
  !realRegisterFinal.errors.some((error) => error.message === 'Missing floor'),
  'Real register sample: no false "Missing floor" warnings — every floor was extracted from raw text',
);
assert(
  realRegisterFinal.errors.some((error) => error.severity === 'info' && error.message === 'Floor extracted from raw text'),
  'Real register sample: floor extraction surfaces as an Info note for transparency',
);
assert(
  realRegisterFinal.errors.every((error) => error.field !== 'duplicate'),
  'Real register sample: no false-positive duplicates among genuinely distinct rows',
);

// Sheet-aware duplicate detection: an inventory sheet flags an exact repeat
// of Address+Building No+Floor+Room+Asset Type; a monitoring/history sheet
// (Monthly Outlet) must NOT flag the same recurring location as a duplicate.
console.log('\nSTEP 17b — Sheet-aware duplicate detection');
const duplicateInventorySheets = [
  {
    name: 'Asset Register',
    data: [
      ['Building No', 'Floor', 'Location/Barcode'],
      ['1', 'Ground', 'Kitchen WC - WC'],
      ['1', 'Ground', 'Kitchen WC - WC'],
    ],
  },
];
const duplicateInventoryMapping = buildDefaultWorkbookMapping(duplicateInventorySheets);
const duplicateInventoryWorkbook = processWorkbook(duplicateInventorySheets, {
  manualAddress: 'Test Address',
  columnMappings: duplicateInventoryMapping,
});
assert(
  classifySheet('Asset Register') === 'building-register',
  '"Asset Register" sheet name classified as building-register',
);
assert(
  duplicateInventoryWorkbook.sheets[0].errors.some(
    (error) => error.field === 'duplicate' && error.message === 'Potential duplicate record',
  ),
  'Inventory sheet: identical Building No + Floor + Room + Asset Type flags a duplicate warning',
);
assert(
  duplicateInventoryWorkbook.sheets[0].rows.length === 2,
  'Duplicate detection only warns — it never removes the row',
);

const repeatedMonthlySheets = [
  {
    name: 'Monthly Outlet',
    data: [
      ['Date', 'Outlet/Location'],
      ['2024-01-01', 'Unit 3 - 1st Floor Finance Office Bib Tap'],
      ['2024-02-01', 'Unit 3 - 1st Floor Finance Office Bib Tap'],
    ],
  },
];
const repeatedMonthlyWorkbook = processWorkbook(repeatedMonthlySheets);
assert(
  !repeatedMonthlyWorkbook.sheets[0].errors.some((error) => error.field === 'duplicate'),
  'Monitoring sheet: the same location repeating across inspection dates is NOT flagged as a duplicate',
);

// ─── STEP 18: Demo portfolio file (secondary test) ──────────────────────────
console.log('\nSTEP 18 — Demo portfolio file (secondary test)');
if (existsSync(DEMO_FILE)) {
  const demoSheets = parseExcel(DEMO_FILE);
  const demoWb = processWorkbook(demoSheets, { fileName: 'customer-building-portfolio.xlsx' });
  assert(demoWb.sheets.length > 0, `Demo file: ${demoWb.sheets.length} sheet(s) processed`);
  const demoFinal = mergeAssetSheets(demoWb);
  assert(demoFinal.rows.length > 0, `Demo file: ${demoFinal.rows.length} asset rows`);
} else {
  console.log('  ⊘ Demo file skipped (not found)');
}

// ─── Summary ────────────────────────────────────────────────────────────────
console.log('\n═══════════════════════════════════════════════════');
console.log(`  RESULT: ${passed} passed, ${failed} failed`);
console.log('═══════════════════════════════════════════════════\n');

if (failed > 0) {
  process.exit(1);
}
