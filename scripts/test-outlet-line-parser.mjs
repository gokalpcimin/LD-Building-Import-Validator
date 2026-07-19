/**
 * Spot-check fixed-column Outlet Register line parser.
 * Run: npx tsx scripts/test-outlet-line-parser.mjs
 */
import { parseOutletRegisterLine } from '../utils/outletRegisterLineParser.ts';

const cases = [
  {
    name: 'Plant Room (user example)',
    line: '1 Lower Ground Domestic Hot Water Plant Room - - - - 1 - - - - - - - - 2 x Newark Calorifiers',
    expect: {
      'Building No': '1',
      Floor: 'Lower Ground',
      'Location/Barcode': 'Domestic Hot Water Plant Room',
      'Cold Source': '1',
      Sink: '-',
      Whb: '-',
      Shower: '-',
      'TMVs No.': '-',
      'Other Comments': '2 x Newark Calorifiers',
    },
  },
  {
    name: 'Staff Laundry with wrap slashes',
    line: '1 Ground Staff Laundry - / 52.1 / 34.4 2 7.3 1 2 - - 1 - - - - / DHWS appeared to be accurate / 2 x WM',
    expect: {
      'Hot Temp OC': '52.1 / 34.4',
      'Cold Source': '1',
      Sink: '2',
      Whb: '-',
      'TMVs No.': '1',
      'Other Comments': 'DHWS appeared to be accurate / 2 x WM',
    },
  },
  {
    name: 'Residential Laundry',
    line: '1 Ground Residential Laundry - 39.1 2 8.1 1 1 - - - - - - - WM',
    expect: {
      'Cold Source': '1',
      Sink: '1',
      Whb: '-',
      'Other Comments': 'WM',
    },
  },
  {
    name: 'Staff Laundry dual hot temp',
    line: '1 Ground Staff Laundry - 52.1 34.4 2 7.3 1 2 - - 1 - - - -',
    expect: {
      'Hot Temp OC': '52.1 / 34.4',
      'Hot Source': '2',
      'Cold Temp OC': '7.3',
      'Cold Source': '1',
      Sink: '2',
      'TMVs No.': '1',
    },
  },
  {
    name: 'Flats compacted',
    line: '1 Ground Flats 17-18-19-20 - - 2 - 1 4 4 4 8 - - - - 4 x WC',
    expect: {
      'Hot Source': '2',
      'Cold Source': '1',
      Sink: '4',
      Whb: '4',
      Shower: '4',
      'TMVs No.': '8',
      'Other Comments': '4 x WC',
    },
  },
  {
    name: 'Corridor junction',
    line: '1 Ground Corridor junction - - - - 1 - - - - - - - - Chilled Cold Water Dispenser',
    expect: {
      'Cold Source': '1',
      Sink: '-',
      'Other Comments': 'Chilled Cold Water Dispenser',
    },
  },
  {
    name: 'Orchards Ass Bathroom',
    line: '1 Ground Orchards Ass Bathroom - 41.1 2 10.9 1 - 1 1 2 - - - - Bath+SH head, WC',
    expect: {
      Sink: '-',
      Whb: '1',
      Shower: '1',
      'TMVs No.': '2',
    },
  },
  {
    name: 'Flat 3 compact',
    line: '1 Ground Flat 3 - 2 1 1 1 1 2 - - - - WC',
    expect: {
      'Hot Source': '2',
      'Cold Source': '1',
      Sink: '1',
      Whb: '1',
      Shower: '1',
      'TMVs No.': '2',
    },
  },
];

let failed = 0;
for (const { name, line, expect } of cases) {
  const got = parseOutletRegisterLine(line);
  if (!got) {
    console.log('FAIL', name, '— parser returned null');
    failed += 1;
    continue;
  }
  const mismatches = [];
  for (const [key, value] of Object.entries(expect)) {
    if (got[key] !== value) {
      mismatches.push(`${key}: expected ${JSON.stringify(value)} got ${JSON.stringify(got[key])}`);
    }
  }
  if (mismatches.length) {
    console.log('FAIL', name);
    for (const m of mismatches) console.log('  ', m);
    console.log('  full:', JSON.stringify(got, null, 2));
    failed += 1;
  } else {
    console.log('OK  ', name);
  }
}

console.log(failed === 0 ? `\nAll ${cases.length} cases passed` : `\n${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
