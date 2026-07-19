/**
 * Strict birebir audit: PDF ground truth vs paste parser.
 * Run: npx tsx scripts/audit-birebir-pdf.mjs
 */
import { readFileSync, writeFileSync } from 'fs';
import { parsePastedRegister } from '../utils/pasteRegisterParser.ts';
import { parsePastedText } from '../utils/pastedTextParser.ts';

/** [room, floor, building|null, assets[], qty|null] from LRA PDF screenshots */
const GT = [
  ['Domestic Hot Water Plant Room', 'Lower Ground', null, ['Calorifier', 'Cold Source'], { Calorifier: 2, 'Cold Source': 1 }],
  ['Staff Laundry', 'Ground', null, ['Washing Machine', 'Sink', 'TMV', 'Cold Source'], { 'Washing Machine': 2 }],
  ['Residential Laundry', 'Ground', null, ['Washing Machine', 'Sink', 'Cold Source'], null],
  ['The Orchards Lounge', 'Ground', null, ['Wash Hand Basin', 'TMV'], null],
  ['Orchards WC-1', 'Ground', null, ['WC', 'Wash Hand Basin', 'TMV'], null],
  ['Orchards Ass Bathroom', 'Ground', null, ['Bath/Shower', 'WC', 'Wash Hand Basin', 'TMV'], null],
  ['Orchards WC-2', 'Ground', null, ['WC', 'Wash Hand Basin', 'TMV'], null],
  ['Corridor junction', 'Ground', null, ['Cold Water Dispenser'], null],
  ['Flat 3', 'Ground', null, ['WC', 'Wash Hand Basin', 'Bath/Shower', 'TMV'], null],
  ['Flat 5', 'Ground', null, ['WC', 'Wash Hand Basin', 'Bath/Shower', 'TMV'], null],
  ['Flat 7', 'Ground', null, ['WC', 'Wash Hand Basin', 'Bath/Shower', 'TMV'], null],
  ['(Former) Cleaner store', 'Ground', null, ['Wash Hand Basin'], null],
  ['Flat 8', 'Ground', null, ['WC', 'Wash Hand Basin', 'Bath/Shower', 'TMV'], null],
  ['Flat 6', 'Ground', null, ['WC', 'Wash Hand Basin', 'Bath/Shower', 'TMV'], null],
  ['Flat 4', 'Ground', null, ['WC', 'Wash Hand Basin', 'Bath/Shower', 'TMV'], null],
  ['Flat 2', 'Ground', null, ['WC', 'Wash Hand Basin', 'Bath/Shower', 'TMV'], null],
  ['Flat 1', 'Ground', null, ['WC', 'Wash Hand Basin', 'Bath/Shower', 'TMV'], null],
  ['Medical Room', 'Ground', null, ['Wash Hand Basin', 'TMV'], null],
  ['Hair Dresser', 'Ground', null, ['Spray Outlet', 'Wash Hand Basin', 'TMV'], { 'Spray Outlet': 1 }],
  ['Main Office Staff WC', 'Ground', null, ['WC', 'Wash Hand Basin', 'TMV'], null],
  ['Rear of Main office WC', 'Ground', null, ['WC', 'Wash Hand Basin', 'TMV'], null],
  ['Restaurant Servery', 'Ground', 'CROFTERS', ['Wash Hand Basin', 'TMV'], null],
  [
    'Restaurant Kitchen',
    'Ground',
    'CROFTERS',
    ['Spray Outlet', 'Industrial Dishwasher', 'Water Boiler', 'Wash Hand Basin', 'TMV'],
    null,
  ],
  ['Kitchen WC', 'Ground', 'CROFTERS', ['WC', 'Bib Tap', 'Wash Hand Basin', 'TMV'], null],
  ['Corridor WC', 'Ground', 'CROFTERS', ['WC', 'Wash Hand Basin', 'TMV'], null],
  ['Lounge', 'Ground', 'Bracken Close', ['Wash Hand Basin', 'TMV'], null],
  ['WC', 'Ground', 'Bracken Close', ['WC', 'Wash Hand Basin', 'TMV'], null],
  ['Bathroom', 'Ground', 'Bracken Close', ['Bath/Shower', 'WC', 'Wash Hand Basin', 'TMV'], null],
  ['Sluice room', 'Ground', 'Bracken Close', ['Panamatic', 'Wash Hand Basin', 'TMV'], { Panamatic: 1 }],
  ['Room 4', 'Ground', 'Bracken Close', ['WC', 'Wash Hand Basin', 'Bath/Shower', 'TMV'], null],
  ['Rooms 1-3, 5-10', 'Ground', 'Bracken Close', ['WC', 'Wash Hand Basin', 'Bath/Shower', 'TMV'], { WC: 9 }],
  ['Room 7', 'Ground', 'Bracken Close', [], null],
  ['Room 8', 'Ground', 'Bracken Close', [], null],
  ['WC', 'Ground', 'Heather Court', ['WC', 'Wash Hand Basin', 'TMV'], null],
  ['Bathroom', 'Ground', 'Heather Court', ['Bath/Shower', 'WC', 'Wash Hand Basin', 'TMV'], null],
  ['Lounge', 'Ground', 'Heather Court', ['Wash Hand Basin', 'TMV'], null],
  ['Rooms 11-20', 'Ground', 'Heather Court', ['WC', 'Wash Hand Basin', 'Bath/Shower', 'TMV'], { WC: 10 }],
  ['Room 14', 'Ground', 'Heather Court', [], null],
  ['Room 19', 'Ground', 'Heather Court', [], null],
  ['Flats 17-18-19-20', 'Ground', 'Bromford', ['WC', 'Wash Hand Basin', 'Bath/Shower', 'TMV'], { WC: 4 }],
  [
    'Bathroom (Above the GF Laundry)',
    'First',
    'Bromford',
    ['Bath/Shower', 'WC', 'Wash Hand Basin', 'TMV'],
    null,
  ],
  ['Lounge', 'First', 'Bromford', ['Wash Hand Basin', 'TMV'], null],
  ['Flats 9-16', 'First', 'Bromford', ['WC', 'Wash Hand Basin', 'Bath/Shower', 'TMV'], { WC: 8 }],
  ['WC-1', 'First', 'Bromford', ['WC', 'Wash Hand Basin', 'TMV'], null],
  ['WC-2', 'First', 'Bromford', ['WC', 'Wash Hand Basin', 'TMV'], null],
  ['Guest Suite', 'First', 'Bromford', ['WC', 'Wash Hand Basin', 'Bath/Shower', 'TMV'], null],
  ['Redundant Bedroom (storage)', 'First', 'Bromford', ['WC', 'Wash Hand Basin', 'Bath/Shower', 'TMV'], null],
  ['Staff Office', 'First', 'Bromford', ['Wash Hand Basin', 'TMV'], null],
  ['2nd Redundant Bedroom', 'First', 'Bromford', ['WC', 'Wash Hand Basin', 'Bath/Shower', 'TMV'], null],
  ['Lounge', 'First', 'Brambles', ['Wash Hand Basin', 'TMV'], null],
  ['WC-1', 'First', 'Brambles', ['WC', 'Wash Hand Basin', 'TMV'], null],
  ['WC-2', 'First', 'Brambles', ['WC', 'Wash Hand Basin', 'TMV'], null],
  ['Bathroom', 'First', 'Brambles', ['Bath/Shower', 'WC', 'Wash Hand Basin', 'TMV'], null],
  ['Cleaner store', 'First', 'Brambles', ['Panamatic', 'Wash Hand Basin', 'TMV'], null],
  ['Rooms 21-30', 'First', 'Brambles', ['WC', 'Wash Hand Basin', 'Bath/Shower', 'TMV'], { WC: 10 }],
  ['Room 27', 'First', 'Brambles', [], null],
  ['Room 29', 'First', 'Brambles', [], null],
  ['WC', 'First', 'Ferndale', ['WC', 'Wash Hand Basin', 'TMV'], null],
  ['Bathroom', 'First', 'Ferndale', ['Bath/Shower', 'WC', 'Wash Hand Basin', 'TMV'], null],
  ['Lounge', 'First', 'Ferndale', ['Wash Hand Basin', 'TMV'], null],
  ['Rooms 31-40', 'First', 'Ferndale', ['WC', 'Wash Hand Basin', 'Bath/Shower', 'TMV'], { WC: 10 }],
  ['Flats 21-24', 'First', 'Ferndale', ['WC', 'Wash Hand Basin', 'Bath/Shower', 'TMV'], { WC: 4 }],
];

// PDF Cold Source column → asset on every location row.
for (const row of GT) {
  const assets = row[3];
  if (!assets.includes('Cold Source')) {
    assets.push('Cold Source');
  }
}

function normalizeAsset(a) {
  if (a === 'Shower') return 'Bath/Shower';
  if (a === 'WHB' || a === 'Sink') return 'Wash Hand Basin';
  return a;
}

function gotAssets(row) {
  if (row.detectedAssets?.length) {
    return [...new Set(row.detectedAssets.map((a) => normalizeAsset(a.assetType)))].sort();
  }
  if (row.assetType.value && row.assetType.value !== 'Multiple Assets') {
    return [normalizeAsset(row.assetType.value)];
  }
  return [];
}

const result = parsePastedRegister(
  parsePastedText(readFileSync(new URL('../samples/outlet-register-paste.txt', import.meta.url), 'utf8')),
  'adağna',
);
const used = new Set();
const rows = [];
let ok = 0;
let bad = 0;

for (const [room, floor, building, assets, qty] of GT) {
  const exp = [...new Set(assets.map(normalizeAsset))].sort();
  let idx = result.rows.findIndex(
    (r, i) =>
      !used.has(i) &&
      r.room.value === room &&
      r.floor.value === floor &&
      (!building || r.building.value === building),
  );
  if (idx < 0) {
    idx = result.rows.findIndex(
      (r, i) => !used.has(i) && r.room.value === room && r.floor.value === floor,
    );
  }
  if (idx < 0) {
    bad += 1;
    rows.push({ room, floor, building: building || '—', verdict: 'ABSENT', exp: exp.join(', '), got: '' });
    continue;
  }
  used.add(idx);
  const row = result.rows[idx];
  const g = gotAssets(row);
  const missing = exp.filter((a) => !g.includes(a));
  const extra = g.filter((a) => !exp.includes(a));
  const floorOk = row.floor.value === floor;
  const bldOk = !building || row.building.value === building;
  const assetOk = missing.length === 0 && extra.length === 0;
  let qtyOk = true;
  let qtyNote = '—';
  if (qty) {
    for (const [a, q] of Object.entries(qty)) {
      const norm = normalizeAsset(a);
      const dq = row.detectedAssets?.find((x) => normalizeAsset(x.assetType) === norm)?.quantity;
      const rq = normalizeAsset(row.assetType.value || '') === norm ? row.quantity.value : null;
      const gotq = dq ?? rq;
      if (gotq !== q) {
        qtyOk = false;
        qtyNote = `${a} exp ${q} got ${gotq}`;
      }
    }
  }
  const pass = floorOk && bldOk && assetOk && qtyOk;
  if (pass) ok += 1;
  else bad += 1;
  rows.push({
    room,
    floor,
    building: building || '—',
    gotFloor: row.floor.value,
    gotBuilding: row.building.value || '—',
    exp: exp.join(', ') || '(sentinel — none)',
    got: g.join(', ') || '(none)',
    missing: missing.join(', ') || '—',
    extra: extra.join(', ') || '—',
    qtyNote,
    status: row.importStatus,
    verdict: pass ? 'OK' : 'FAIL',
  });
}

const report = {
  ok,
  bad,
  total: GT.length,
  summary: result.summary,
  failures: rows.filter((r) => r.verdict !== 'OK'),
  rows,
};
writeFileSync(new URL('../samples/birebir-audit-report.json', import.meta.url), JSON.stringify(report, null, 2));
console.log(JSON.stringify({ ok, bad, total: GT.length, summary: result.summary, failures: report.failures }, null, 2));
