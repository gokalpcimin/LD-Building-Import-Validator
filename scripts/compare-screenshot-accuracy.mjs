/**
 * Compare paste parser output against the Outlet & Temperature Register
 * screenshot ground truth (visible rows).
 * Run: npx tsx scripts/compare-screenshot-accuracy.mjs
 */
import { readFileSync, writeFileSync } from 'fs';
import { parsePastedRegister } from '../utils/pasteRegisterParser.ts';
import { parsePastedText } from '../utils/pastedTextParser.ts';

/**
 * Ground truth from the screenshot. Assets = comments keywords UNION
 * Sink/Whb/Shower/TMV count columns > 0. Sink+Whb → Wash Hand Basin (deduped).
 */
const GROUND_TRUTH = [
  {
    room: 'Domestic Hot Water Plant Room',
    floor: 'Lower Ground',
    buildingNo: '1',
    assets: ['Calorifier', 'Wash Hand Basin'],
    quantityByAsset: { Calorifier: 2 },
  },
  {
    room: 'Staff Laundry',
    floor: 'Ground',
    buildingNo: '1',
    // Screenshot: Whb=2, TMV=1, comments "2 x WM"
    assets: ['Washing Machine', 'Wash Hand Basin', 'TMV'],
    quantityByAsset: { 'Washing Machine': 2 },
  },
  {
    room: 'Residential Laundry',
    floor: 'Ground',
    buildingNo: '1',
    assets: ['Washing Machine', 'Wash Hand Basin'],
  },
  {
    room: 'The Orchards Lounge',
    floor: 'Ground',
    buildingNo: '1',
    assets: ['Wash Hand Basin', 'TMV'],
  },
  {
    room: 'Orchards WC-1',
    floor: 'Ground',
    buildingNo: '1',
    assets: ['WC', 'Wash Hand Basin', 'TMV'],
  },
  {
    room: 'Orchards Ass Bathroom',
    floor: 'Ground',
    buildingNo: '1',
    assets: ['Bath/Shower', 'WC', 'Wash Hand Basin', 'TMV'],
  },
  {
    room: 'Orchards WC-2',
    floor: 'Ground',
    buildingNo: '1',
    assets: ['WC', 'Wash Hand Basin', 'TMV'],
  },
  {
    room: 'Corridor junction',
    floor: 'Ground',
    buildingNo: '1',
    assets: ['Cold Water Dispenser'],
  },
  {
    room: 'Flat 3',
    floor: 'Ground',
    buildingNo: '1',
    assets: ['WC', 'Wash Hand Basin', 'Bath/Shower', 'TMV'],
  },
  {
    room: 'Flat 5',
    floor: 'Ground',
    buildingNo: '1',
    assets: ['WC', 'Wash Hand Basin', 'Bath/Shower', 'TMV'],
  },
  {
    room: 'Flat 7',
    floor: 'Ground',
    buildingNo: '1',
    assets: ['WC', 'Wash Hand Basin', 'Bath/Shower', 'TMV'],
  },
  {
    room: '(Former) Cleaner store',
    floor: 'Ground',
    buildingNo: '1',
    assets: ['Wash Hand Basin'],
  },
  {
    room: 'Flat 8',
    floor: 'Ground',
    buildingNo: '1',
    assets: ['WC', 'Wash Hand Basin', 'Bath/Shower', 'TMV'],
  },
  {
    room: 'Flat 6',
    floor: 'Ground',
    buildingNo: '1',
    assets: ['WC', 'Wash Hand Basin', 'Bath/Shower', 'TMV'],
  },
  {
    room: 'Flat 4',
    floor: 'Ground',
    buildingNo: '1',
    assets: ['WC', 'Wash Hand Basin', 'Bath/Shower', 'TMV'],
  },
  {
    room: 'Flat 2',
    floor: 'Ground',
    buildingNo: '1',
    assets: ['WC', 'Wash Hand Basin', 'Bath/Shower', 'TMV'],
  },
  {
    room: 'Flat 1',
    floor: 'Ground',
    buildingNo: '1',
    assets: ['WC', 'Wash Hand Basin', 'Bath/Shower', 'TMV'],
  },
  {
    room: 'Medical Room',
    floor: 'Ground',
    buildingNo: '1',
    assets: ['Wash Hand Basin', 'TMV'],
  },
];

function normalizeAsset(a) {
  if (a === 'Shower') return 'Bath/Shower';
  if (a === 'WHB' || a === 'Sink') return 'Wash Hand Basin';
  if (a === 'Chilled Water Fountain' || a === 'Cold Water Dispenser') return 'Cold Water Dispenser';
  return a;
}

function gotAssets(row) {
  if (row.detectedAssets?.length) {
    return [...new Set(row.detectedAssets.map((a) => normalizeAsset(a.assetType)))];
  }
  if (row.assetType.value) return [normalizeAsset(row.assetType.value)];
  return [];
}

const raw = readFileSync(new URL('../samples/outlet-register-paste.txt', import.meta.url), 'utf8');
const result = parsePastedRegister(parsePastedText(raw), 'Test Address');

const comparisons = [];
let locOk = 0;
let floorOk = 0;
let buildingOk = 0;
let assetExact = 0;
let assetPartial = 0;
let assetMiss = 0;
let qtyOk = 0;
let qtyChecked = 0;
let tp = 0;
let fp = 0;
let fn = 0;

for (const gt of GROUND_TRUTH) {
  const row = result.rows.find((r) => (r.room.value || '') === gt.room);
  const got = row ? gotAssets(row) : [];
  const expected = gt.assets.map(normalizeAsset);

  const locFound = Boolean(row);
  if (locFound) locOk += 1;
  const floorMatch = row?.floor.value === gt.floor;
  if (floorMatch) floorOk += 1;
  const buildingMatch = row?.buildingNumber.value === gt.buildingNo;
  if (buildingMatch) buildingOk += 1;

  const missing = expected.filter((a) => !got.includes(a));
  const extra = got.filter((a) => !expected.includes(a));
  const hit = expected.filter((a) => got.includes(a));

  tp += hit.length;
  fp += extra.length;
  fn += missing.length;

  let assetVerdict;
  if (!row) assetVerdict = 'absent';
  else if (missing.length === 0 && extra.length === 0) {
    assetVerdict = 'exact';
    assetExact += 1;
  } else if (hit.length > 0) {
    assetVerdict = 'partial';
    assetPartial += 1;
  } else {
    assetVerdict = 'miss';
    assetMiss += 1;
  }

  let qtyNote = '—';
  if (gt.quantityByAsset && row) {
    for (const [asset, q] of Object.entries(gt.quantityByAsset)) {
      qtyChecked += 1;
      const norm = normalizeAsset(asset);
      const fromDetected = row.detectedAssets?.find((a) => normalizeAsset(a.assetType) === norm)?.quantity;
      const fromRow =
        normalizeAsset(row.assetType.value || '') === norm ? row.quantity.value : null;
      const gotQty = fromDetected ?? fromRow;
      if (gotQty === q) {
        qtyOk += 1;
        qtyNote = `${asset}=${q} ✓`;
      } else {
        qtyNote = `${asset} expected ${q}, got ${gotQty}`;
      }
    }
  }

  comparisons.push({
    room: gt.room,
    expectedFloor: gt.floor,
    gotFloor: row?.floor.value ?? null,
    floorOk: floorMatch,
    buildingOk: buildingMatch,
    expectedAssets: expected.join(', '),
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
  scope: 'Screenshot-visible rows (18 locations)',
  locationHitRate: locOk / n,
  floorAccuracy: floorOk / n,
  buildingNoAccuracy: buildingOk / n,
  assetExactRate: assetExact / n,
  assetPartialRate: assetPartial / n,
  assetMissRate: assetMiss / n,
  assetPrecision: precision,
  assetRecall: recall,
  assetF1: f1,
  qtyAccuracy: qtyChecked ? qtyOk / qtyChecked : null,
  counts: { n, locOk, floorOk, buildingOk, assetExact, assetPartial, assetMiss, tp, fp, fn, qtyOk, qtyChecked },
  comparisons,
  fullPasteSummary: result.summary,
};

writeFileSync('/tmp/accuracy-report.json', JSON.stringify(report, null, 2));
console.log(JSON.stringify({
  locationHitRate: +(report.locationHitRate * 100).toFixed(1),
  floorAccuracy: +(report.floorAccuracy * 100).toFixed(1),
  buildingNoAccuracy: +(report.buildingNoAccuracy * 100).toFixed(1),
  assetExactRate: +(report.assetExactRate * 100).toFixed(1),
  assetPartialRate: +(report.assetPartialRate * 100).toFixed(1),
  precision: +(precision * 100).toFixed(1),
  recall: +(recall * 100).toFixed(1),
  f1: +(f1 * 100).toFixed(1),
  qtyAccuracy: report.qtyAccuracy == null ? null : +(report.qtyAccuracy * 100).toFixed(1),
  counts: report.counts,
}, null, 2));

console.log('\n--- per row ---');
for (const c of comparisons) {
  console.log(
    `${c.assetVerdict.padEnd(8)} | ${c.room.padEnd(32)} | floor ${c.floorOk ? '✓' : '✗'} | exp: ${c.expectedAssets} | got: ${c.gotAssets}`,
  );
}
