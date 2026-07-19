/**
 * Full accuracy: LRA PDF ground truth vs paste parser output.
 * Source: /Users/gokalpcimin/Desktop/LRA input for case study.pdf
 * Run: npx tsx scripts/compare-lra-pdf-accuracy.mjs
 */
import { readFileSync, writeFileSync } from 'fs';
import { parsePastedRegister } from '../utils/pasteRegisterParser.ts';
import { parsePastedText } from '../utils/pastedTextParser.ts';

/**
 * Ground truth rows transcribed from the PDF Outlet & Temperature Register
 * (pages 34–36). Assets = comments keywords ∪ Sink/Whb/Shower/TMV > 0.
 * Sink+Whb → Wash Hand Basin (summed).
 */
const GROUND_TRUTH = [
  // Page 34 — Cold Source column counts as an asset; Sink/Whb stay distinct (Sink≡WHB in normalize).
  { room: 'Domestic Hot Water Plant Room', floor: 'Lower Ground', building: null, buildingNo: '1', assets: ['Calorifier', 'Cold Source'], qty: { Calorifier: 2, 'Cold Source': 1 } },
  { room: 'Staff Laundry', floor: 'Ground', building: null, buildingNo: '1', assets: ['Washing Machine', 'Sink', 'TMV', 'Cold Source'], qty: { 'Washing Machine': 2 } },
  { room: 'Residential Laundry', floor: 'Ground', building: null, buildingNo: '1', assets: ['Washing Machine', 'Sink', 'Cold Source'] },
  { room: 'The Orchards Lounge', floor: 'Ground', building: null, buildingNo: '1', assets: ['Wash Hand Basin', 'TMV', 'Cold Source'] },
  { room: 'Orchards WC-1', floor: 'Ground', building: null, buildingNo: '1', assets: ['WC', 'Wash Hand Basin', 'TMV', 'Cold Source'] },
  { room: 'Orchards Ass Bathroom', floor: 'Ground', building: null, buildingNo: '1', assets: ['Bath/Shower', 'WC', 'Wash Hand Basin', 'TMV', 'Cold Source'] },
  { room: 'Orchards WC-2', floor: 'Ground', building: null, buildingNo: '1', assets: ['WC', 'Wash Hand Basin', 'TMV', 'Cold Source'] },
  { room: 'Corridor junction', floor: 'Ground', building: null, buildingNo: '1', assets: ['Cold Water Dispenser', 'Cold Source'] },
  { room: 'Flat 3', floor: 'Ground', building: null, buildingNo: '1', assets: ['WC', 'Wash Hand Basin', 'Bath/Shower', 'TMV', 'Cold Source'] },
  { room: 'Flat 5', floor: 'Ground', building: null, buildingNo: '1', assets: ['WC', 'Wash Hand Basin', 'Bath/Shower', 'TMV', 'Cold Source'] },
  { room: 'Flat 7', floor: 'Ground', building: null, buildingNo: '1', assets: ['WC', 'Wash Hand Basin', 'Bath/Shower', 'TMV', 'Cold Source'] },
  { room: '(Former) Cleaner store', floor: 'Ground', building: null, buildingNo: '1', assets: ['Wash Hand Basin', 'Cold Source'] },
  { room: 'Flat 8', floor: 'Ground', building: null, buildingNo: '1', assets: ['WC', 'Wash Hand Basin', 'Bath/Shower', 'TMV', 'Cold Source'] },
  { room: 'Flat 6', floor: 'Ground', building: null, buildingNo: '1', assets: ['WC', 'Wash Hand Basin', 'Bath/Shower', 'TMV', 'Cold Source'] },
  { room: 'Flat 4', floor: 'Ground', building: null, buildingNo: '1', assets: ['WC', 'Wash Hand Basin', 'Bath/Shower', 'TMV', 'Cold Source'] },
  { room: 'Flat 2', floor: 'Ground', building: null, buildingNo: '1', assets: ['WC', 'Wash Hand Basin', 'Bath/Shower', 'TMV', 'Cold Source'] },
  { room: 'Flat 1', floor: 'Ground', building: null, buildingNo: '1', assets: ['WC', 'Wash Hand Basin', 'Bath/Shower', 'TMV', 'Cold Source'] },
  { room: 'Medical Room', floor: 'Ground', building: null, buildingNo: '1', assets: ['Wash Hand Basin', 'TMV', 'Cold Source'] },
  // Page 35
  { room: 'Hair Dresser', floor: 'Ground', building: null, buildingNo: '1', assets: ['Spray Outlet', 'Wash Hand Basin', 'TMV'], qty: { 'Spray Outlet': 1 } },
  { room: 'Main Office Staff WC', floor: 'Ground', building: null, buildingNo: '1', assets: ['WC', 'Wash Hand Basin', 'TMV'] },
  // PDF location cell is "Rear of Main office WC - WC"; parser keeps room up to first dash.
  { room: 'Rear of Main office WC', floor: 'Ground', building: null, buildingNo: '1', assets: ['WC', 'Wash Hand Basin', 'TMV'] },
  { room: 'Restaurant Servery', floor: 'Ground', building: 'CROFTERS', buildingNo: '1', assets: ['Wash Hand Basin', 'TMV'] },
  // Sink=2 Whb=1 Shower=- TMV=1 + SO, IDWM, W-B
  { room: 'Restaurant Kitchen', floor: 'Ground', building: 'CROFTERS', buildingNo: '1', assets: ['Spray Outlet', 'Industrial Dishwasher', 'Water Boiler', 'Wash Hand Basin', 'TMV'] },
  { room: 'Kitchen WC', floor: 'Ground', building: 'CROFTERS', buildingNo: '1', assets: ['WC', 'Bib Tap', 'Wash Hand Basin', 'TMV'] },
  { room: 'Corridor WC', floor: 'Ground', building: 'CROFTERS', buildingNo: '1', assets: ['WC', 'Wash Hand Basin', 'TMV'] },
  { room: 'Lounge', floor: 'Ground', building: 'Bracken Close', buildingNo: '1', assets: ['Wash Hand Basin', 'TMV'], sectionKey: 'Bracken Close' },
  { room: 'WC', floor: 'Ground', building: 'Bracken Close', buildingNo: '1', assets: ['WC', 'Wash Hand Basin', 'TMV'], sectionKey: 'Bracken Close' },
  { room: 'Bathroom', floor: 'Ground', building: 'Bracken Close', buildingNo: '1', assets: ['Bath/Shower', 'WC', 'Wash Hand Basin', 'TMV'], sectionKey: 'Bracken Close' },
  // Sink=1 Whb=1 Shower=- TMV=1 + Panamatic
  { room: 'Sluice room', floor: 'Ground', building: 'Bracken Close', buildingNo: '1', assets: ['Panamatic', 'Wash Hand Basin', 'TMV'], qty: { Panamatic: 1 } },
  { room: 'Room 4', floor: 'Ground', building: 'Bracken Close', buildingNo: '1', assets: ['WC', 'Wash Hand Basin', 'Bath/Shower', 'TMV'] },
  // - 9 9 9 → Whb=9 Shower=9 TMV=9
  { room: 'Rooms 1-3, 5-10', floor: 'Ground', building: 'Bracken Close', buildingNo: '1', assets: ['WC', 'Wash Hand Basin', 'Bath/Shower', 'TMV'], qty: { WC: 9 } },
  { room: 'Room 7', floor: 'Ground', building: 'Bracken Close', buildingNo: '1', assets: [] },
  { room: 'Room 8', floor: 'Ground', building: 'Bracken Close', buildingNo: '1', assets: [] },
  { room: 'WC', floor: 'Ground', building: 'Heather Court', buildingNo: '1', assets: ['WC', 'Wash Hand Basin', 'TMV'], sectionKey: 'Heather Court' },
  { room: 'Bathroom', floor: 'Ground', building: 'Heather Court', buildingNo: '1', assets: ['Bath/Shower', 'WC', 'Wash Hand Basin', 'TMV'], sectionKey: 'Heather Court' },
  { room: 'Lounge', floor: 'Ground', building: 'Heather Court', buildingNo: '1', assets: ['Wash Hand Basin', 'TMV'], sectionKey: 'Heather Court' },
  { room: 'Rooms 11-20', floor: 'Ground', building: 'Heather Court', buildingNo: '1', assets: ['WC', 'Wash Hand Basin', 'Bath/Shower', 'TMV'], qty: { WC: 10 } },
  { room: 'Room 14', floor: 'Ground', building: 'Heather Court', buildingNo: '1', assets: [] },
  { room: 'Room 19', floor: 'Ground', building: 'Heather Court', buildingNo: '1', assets: [] },
  { room: 'Flats 17-18-19-20', floor: 'Ground', building: 'Bromford', buildingNo: '1', assets: ['WC', 'Wash Hand Basin', 'Bath/Shower', 'TMV'], qty: { WC: 4 } },
  { room: 'Bathroom (Above the GF Laundry)', floor: 'First', building: 'Bromford', buildingNo: '1', assets: ['Bath/Shower', 'WC', 'Wash Hand Basin', 'TMV'] },
  { room: 'Lounge', floor: 'First', building: 'Bromford', buildingNo: '1', assets: ['Wash Hand Basin', 'TMV'], sectionKey: 'Bromford-First' },
  { room: 'Flats 9-16', floor: 'First', building: 'Bromford', buildingNo: '1', assets: ['WC', 'Wash Hand Basin', 'Bath/Shower', 'TMV'], qty: { WC: 8 } },
  { room: 'WC-1', floor: 'First', building: 'Bromford', buildingNo: '1', assets: ['WC', 'Wash Hand Basin', 'TMV'], sectionKey: 'Bromford' },
  { room: 'WC-2', floor: 'First', building: 'Bromford', buildingNo: '1', assets: ['WC', 'Wash Hand Basin', 'TMV'], sectionKey: 'Bromford' },
  { room: 'Guest Suite', floor: 'First', building: 'Bromford', buildingNo: '1', assets: ['WC', 'Wash Hand Basin', 'Bath/Shower', 'TMV'] },
  { room: 'Redundant Bedroom (storage)', floor: 'First', building: 'Bromford', buildingNo: '1', assets: ['WC', 'Wash Hand Basin', 'Bath/Shower', 'TMV'] },
  { room: 'Staff Office', floor: 'First', building: 'Bromford', buildingNo: '1', assets: ['Wash Hand Basin', 'TMV'] },
  // Page 36
  { room: '2nd Redundant Bedroom', floor: 'First', building: 'Bromford', buildingNo: '1', assets: ['WC', 'Wash Hand Basin', 'Bath/Shower', 'TMV'] },
  { room: 'Lounge', floor: 'First', building: 'Brambles', buildingNo: '1', assets: ['Wash Hand Basin', 'TMV'], sectionKey: 'Brambles' },
  { room: 'WC-1', floor: 'First', building: 'Brambles', buildingNo: '1', assets: ['WC', 'Wash Hand Basin', 'TMV'], sectionKey: 'Brambles' },
  { room: 'WC-2', floor: 'First', building: 'Brambles', buildingNo: '1', assets: ['WC', 'Wash Hand Basin', 'TMV'], sectionKey: 'Brambles' },
  { room: 'Bathroom', floor: 'First', building: 'Brambles', buildingNo: '1', assets: ['Bath/Shower', 'WC', 'Wash Hand Basin', 'TMV'], sectionKey: 'Brambles' },
  // Sink=1 Whb=1 Shower=- TMV=1 + Panomatic
  { room: 'Cleaner store', floor: 'First', building: 'Brambles', buildingNo: '1', assets: ['Panamatic', 'Wash Hand Basin', 'TMV'] },
  { room: 'Rooms 21-30', floor: 'First', building: 'Brambles', buildingNo: '1', assets: ['WC', 'Wash Hand Basin', 'Bath/Shower', 'TMV'], qty: { WC: 10 } },
  { room: 'Room 27', floor: 'First', building: 'Brambles', buildingNo: '1', assets: [] },
  { room: 'Room 29', floor: 'First', building: 'Brambles', buildingNo: '1', assets: [] },
  { room: 'WC', floor: 'First', building: 'Ferndale', buildingNo: '1', assets: ['WC', 'Wash Hand Basin', 'TMV'], sectionKey: 'Ferndale' },
  { room: 'Bathroom', floor: 'First', building: 'Ferndale', buildingNo: '1', assets: ['Bath/Shower', 'WC', 'Wash Hand Basin', 'TMV'], sectionKey: 'Ferndale' },
  { room: 'Lounge', floor: 'First', building: 'Ferndale', buildingNo: '1', assets: ['Wash Hand Basin', 'TMV'], sectionKey: 'Ferndale' },
  { room: 'Rooms 31-40', floor: 'First', building: 'Ferndale', buildingNo: '1', assets: ['WC', 'Wash Hand Basin', 'Bath/Shower', 'TMV'], qty: { WC: 10 } },
  { room: 'Flats 21-24', floor: 'First', building: 'Ferndale', buildingNo: '1', assets: ['WC', 'Wash Hand Basin', 'Bath/Shower', 'TMV'], qty: { WC: 4 } },
];

// Every register row in this PDF has Cold Source ≥ 1 — treat it as an asset.
for (const gt of GROUND_TRUTH) {
  if (!gt.assets.includes('Cold Source')) {
    gt.assets = [...gt.assets, 'Cold Source'];
  }
}

function normalizeAsset(a) {
  if (a === 'Shower') return 'Bath/Shower';
  if (a === 'WHB' || a === 'Sink') return 'Wash Hand Basin';
  if (a === 'Chilled Water Fountain' || a === 'Cold Water Dispenser') return 'Cold Water Dispenser';
  if (a === 'IDWM' || a === 'Industrial Dishwasher') return 'Industrial Dishwasher';
  if (a === 'W-B' || a === 'Water Boiler') return 'Water Boiler';
  if (a === 'SO' || a === 'Spray Outlet') return 'Spray Outlet';
  return a;
}

function gotAssets(row) {
  if (row.detectedAssets?.length) {
    return [...new Set(row.detectedAssets.map((a) => normalizeAsset(a.assetType)))];
  }
  if (row.assetType.value && row.assetType.value !== 'Multiple Assets') {
    return [normalizeAsset(row.assetType.value)];
  }
  return [];
}

function matchRow(gt, rows, used) {
  const candidates = rows.filter((r, idx) => {
    if (used.has(idx)) return false;
    return (r.room.value || '') === gt.room && (r.floor.value || '') === gt.floor;
  });
  if (candidates.length === 0) {
    // fuzzy room for Bathroom (Above the GF Laundry) / 2nd Redundant
    const fuzzy = rows.filter((r, idx) => {
      if (used.has(idx)) return false;
      if ((r.floor.value || '') !== gt.floor) return false;
      const room = r.room.value || '';
      return room === gt.room || room.includes(gt.room) || gt.room.includes(room);
    });
    if (fuzzy.length === 1) {
      const idx = rows.indexOf(fuzzy[0]);
      used.add(idx);
      return fuzzy[0];
    }
    if (gt.building) {
      const withBuilding = fuzzy.filter((r) => (r.building.value || '') === gt.building);
      if (withBuilding.length === 1) {
        used.add(rows.indexOf(withBuilding[0]));
        return withBuilding[0];
      }
    }
    return null;
  }
  if (candidates.length === 1) {
    used.add(rows.indexOf(candidates[0]));
    return candidates[0];
  }
  // Disambiguate duplicate room names (Lounge/WC/Bathroom) by section building
  if (gt.building) {
    const withBuilding = candidates.filter((r) => (r.building.value || '') === gt.building);
    if (withBuilding.length >= 1) {
      used.add(rows.indexOf(withBuilding[0]));
      return withBuilding[0];
    }
  }
  used.add(rows.indexOf(candidates[0]));
  return candidates[0];
}

const raw = readFileSync(new URL('../samples/outlet-register-paste.txt', import.meta.url), 'utf8');
const result = parsePastedRegister(parsePastedText(raw), 'Test Address');
const used = new Set();

let locOk = 0;
let floorOk = 0;
let buildingOk = 0;
let sectionOk = 0;
let sectionChecked = 0;
let assetExact = 0;
let assetPartial = 0;
let assetMiss = 0;
let assetAbsent = 0;
let emptyExact = 0; // sentinel rows with no assets expected and none found
let tp = 0;
let fp = 0;
let fn = 0;
let qtyOk = 0;
let qtyChecked = 0;

const comparisons = [];

for (const gt of GROUND_TRUTH) {
  const row = matchRow(gt, result.rows, used);
  const expected = gt.assets.map(normalizeAsset);
  const got = row ? gotAssets(row) : [];

  if (row) locOk += 1;
  const floorMatch = row?.floor.value === gt.floor;
  if (floorMatch) floorOk += 1;
  if (row?.buildingNumber.value === gt.buildingNo) buildingOk += 1;

  if (gt.building) {
    sectionChecked += 1;
    if ((row?.building.value || '') === gt.building) sectionOk += 1;
  }

  const missing = expected.filter((a) => !got.includes(a));
  const extra = got.filter((a) => !expected.includes(a));
  const hit = expected.filter((a) => got.includes(a));
  tp += hit.length;
  fp += extra.length;
  fn += missing.length;

  let assetVerdict;
  if (!row) {
    assetVerdict = 'absent';
    assetAbsent += 1;
  } else if (expected.length === 0 && got.length === 0) {
    assetVerdict = 'exact';
    emptyExact += 1;
    assetExact += 1;
  } else if (missing.length === 0 && extra.length === 0) {
    assetVerdict = 'exact';
    assetExact += 1;
  } else if (hit.length > 0 || (expected.length === 0 && got.length > 0)) {
    assetVerdict = expected.length === 0 && got.length > 0 ? 'extra' : 'partial';
    assetPartial += 1;
  } else {
    assetVerdict = 'miss';
    assetMiss += 1;
  }

  let qtyNote = '—';
  if (gt.qty && row) {
    for (const [asset, q] of Object.entries(gt.qty)) {
      qtyChecked += 1;
      const norm = normalizeAsset(asset);
      const fromDetected = row.detectedAssets?.find((a) => normalizeAsset(a.assetType) === norm)?.quantity;
      const fromRow = normalizeAsset(row.assetType.value || '') === norm ? row.quantity.value : null;
      const gotQty = fromDetected ?? fromRow;
      if (gotQty === q) {
        qtyOk += 1;
        qtyNote = `${asset}=${q} ✓`;
      } else {
        qtyNote = `${asset} exp ${q} got ${gotQty}`;
      }
    }
  }

  comparisons.push({
    room: gt.room,
    building: gt.building,
    floor: gt.floor,
    gotFloor: row?.floor.value ?? null,
    gotBuilding: row?.building.value ?? null,
    expectedAssets: expected.join(', ') || '(none — sentinel)',
    gotAssets: got.join(', ') || '(none)',
    missing: missing.join(', ') || '—',
    extra: extra.join(', ') || '—',
    assetVerdict,
    status: row?.importStatus ?? 'MISSING',
    qtyNote,
  });
}

const n = GROUND_TRUTH.length;
const precision = tp / (tp + fp || 1);
const recall = tp / (tp + fn || 1);
const f1 = (2 * precision * recall) / (precision + recall || 1);

const report = {
  source: 'LRA input for case study.pdf (Outlet & Temperature Register, pp.34–36)',
  groundTruthRows: n,
  parserRows: result.rows.length,
  parserSummary: result.summary,
  locationHitRate: locOk / n,
  floorAccuracy: floorOk / n,
  buildingNoAccuracy: buildingOk / n,
  sectionAccuracy: sectionChecked ? sectionOk / sectionChecked : null,
  assetExactRate: assetExact / n,
  assetPartialRate: assetPartial / n,
  assetMissRate: (assetMiss + assetAbsent) / n,
  assetPrecision: precision,
  assetRecall: recall,
  assetF1: f1,
  qtyAccuracy: qtyChecked ? qtyOk / qtyChecked : null,
  counts: {
    n,
    locOk,
    floorOk,
    buildingOk,
    sectionOk,
    sectionChecked,
    assetExact,
    assetPartial,
    assetMiss,
    assetAbsent,
    emptyExact,
    tp,
    fp,
    fn,
    qtyOk,
    qtyChecked,
  },
  mismatches: comparisons.filter((c) => c.assetVerdict !== 'exact'),
  comparisons,
};

writeFileSync('/tmp/lra-pdf-accuracy.json', JSON.stringify(report, null, 2));
writeFileSync(
  new URL('../samples/lra-pdf-accuracy-report.json', import.meta.url),
  JSON.stringify(report, null, 2),
);

console.log(
  JSON.stringify(
    {
      groundTruthRows: n,
      parserRows: result.summary.totalRows,
      locationHitRate: +(report.locationHitRate * 100).toFixed(1),
      floorAccuracy: +(report.floorAccuracy * 100).toFixed(1),
      buildingNoAccuracy: +(report.buildingNoAccuracy * 100).toFixed(1),
      sectionAccuracy: report.sectionAccuracy == null ? null : +(report.sectionAccuracy * 100).toFixed(1),
      assetExactRate: +(report.assetExactRate * 100).toFixed(1),
      precision: +(precision * 100).toFixed(1),
      recall: +(recall * 100).toFixed(1),
      f1: +(f1 * 100).toFixed(1),
      qtyAccuracy: report.qtyAccuracy == null ? null : +(report.qtyAccuracy * 100).toFixed(1),
      mismatches: report.mismatches.length,
      counts: report.counts,
      parserSummary: result.summary,
    },
    null,
    2,
  ),
);

console.log('\n--- mismatches ---');
for (const c of report.mismatches) {
  console.log(
    `${c.assetVerdict.padEnd(8)} | ${(c.building || '—').padEnd(14)} | ${c.room.padEnd(36)} | exp: ${c.expectedAssets} | got: ${c.gotAssets} | extra: ${c.extra} | miss: ${c.missing}`,
  );
}
