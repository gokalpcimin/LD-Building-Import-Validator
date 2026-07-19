/**
 * Regression fixture for the Outlet & Temperature Register paste path.
 * Run: npx tsx scripts/eval-paste-register.mjs
 *
 * Baseline (before Faz 1 fixes): Ready ~33, Review ~12, Blocked ~17.
 * Targets: Staff Laundry Ready, Kitchen WC + Bib Tap, Blocked ≤ ~12%,
 * lounges/medical get assets from Sink/Whb count columns (not prose TMV).
 */
import { readFileSync } from 'fs';
import { parsePastedRegister } from '../utils/pasteRegisterParser.ts';
import { parsePastedText } from '../utils/pastedTextParser.ts';

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

const raw = readFileSync(new URL('../samples/outlet-register-paste.txt', import.meta.url), 'utf8');
const result = parsePastedRegister(parsePastedText(raw), 'Test Address, Demo');
const { summary } = result;

console.log('\nOutlet register paste — regression');
console.log('SUMMARY', summary);

const staff = result.rows.find((r) => (r.room.value || '') === 'Staff Laundry');
assert(Boolean(staff), 'Staff Laundry row exists');
assert(staff?.floor.value === 'Ground', `Staff Laundry floor is Ground (got ${staff?.floor.value})`);
assert(staff?.buildingNumber.value === '1', `Staff Laundry building no is 1 (got ${staff?.buildingNumber.value})`);
const staffAssets =
  staff?.detectedAssets?.map((a) => a.assetType) ?? (staff?.assetType.value ? [staff.assetType.value] : []);
assert(
  staffAssets.includes('Washing Machine'),
  `Staff Laundry includes Washing Machine (got ${staffAssets.join(', ')})`,
);
assert(
  staffAssets.includes('Sink'),
  `Staff Laundry includes Sink from Sink column (got ${staffAssets.join(', ')})`,
);
assert(
  staffAssets.includes('Cold Source'),
  `Staff Laundry includes Cold Source (got ${staffAssets.join(', ')})`,
);
assert(
  staff?.importStatus === 'READY' || staff?.importStatus === 'REVIEW_REQUIRED',
  `Staff Laundry is importable (got ${staff?.importStatus})`,
);
const staffWmQty =
  staff?.detectedAssets?.find((a) => a.assetType === 'Washing Machine')?.quantity ??
  (staff?.assetType.value === 'Washing Machine' ? staff.quantity.value : null);
assert(staffWmQty === 2, `Staff Laundry WM quantity is 2 (got ${staffWmQty})`);

const kitchen = result.rows.find((r) => (r.room.value || '') === 'Kitchen WC');
const kitchenAssets = kitchen?.detectedAssets?.map((a) => a.assetType) ?? [kitchen?.assetType.value];
assert(
  kitchenAssets.includes('WC') && kitchenAssets.includes('Bib Tap'),
  `Kitchen WC yields WC + Bib Tap (got ${kitchenAssets.join(', ')})`,
);
assert(
  kitchen?.importStatus === 'READY' || kitchen?.importStatus === 'REVIEW_REQUIRED',
  `Kitchen WC is importable with multiple assets (got ${kitchen?.importStatus})`,
);
assert(
  (kitchen?.detectedAssets?.length ?? 0) > 1,
  'Kitchen WC still expands to multiple assets',
);

const orchardsLounge = result.rows.find((r) => (r.room.value || '') === 'The Orchards Lounge');
const loungeAssets =
  orchardsLounge?.detectedAssets?.map((a) => a.assetType) ??
  (orchardsLounge?.assetType.value ? [orchardsLounge.assetType.value] : []);
assert(
  loungeAssets.includes('Wash Hand Basin'),
  `Orchards Lounge gets Wash Hand Basin from count columns (got ${loungeAssets.join(', ') || 'none'})`,
);
assert(
  orchardsLounge?.importStatus !== 'BLOCKED',
  'Orchards Lounge is not Blocked',
);
assert(
  !orchardsLounge?.assetType.source?.toLowerCase().includes('via tmv'),
  'Orchards Lounge is not classified from prose "via TMV"',
);

const plant = result.rows.find((r) => (r.room.value || '') === 'Domestic Hot Water Plant Room');
const plantAssets = plant?.detectedAssets?.map((a) => `${a.assetType}×${a.quantity ?? 1}`) ?? [];
assert(
  plant?.detectedAssets?.some((a) => a.assetType === 'Calorifier' && a.quantity === 2) &&
    plant?.detectedAssets?.some((a) => a.assetType === 'Cold Source' && a.quantity === 1),
  `Plant Room is Calorifier×2 + Cold Source×1 (got ${plantAssets.join(', ')})`,
);

assert(summary.blockedCount === 0, `No blocked rows when Cold Source counts as asset (got ${summary.blockedCount})`);
assert(summary.assetsIdentified === 62, `Every location has an asset (got ${summary.assetsIdentified})`);
assert(summary.totalRows === 62, `Still parses 62 location rows (got ${summary.totalRows})`);

// Inventory completeness: a Flat with count columns should expose WC + Sink/Whb/Shower/TMV + Cold Source
const flat7 = result.rows.find((r) => (r.room.value || '') === 'Flat 7');
const flat7Assets = flat7?.detectedAssets?.map((a) => a.assetType) ?? [];
assert(
  flat7Assets.includes('WC') &&
    flat7Assets.includes('Sink') &&
    flat7Assets.includes('Wash Hand Basin') &&
    (flat7Assets.includes('Shower') || flat7Assets.includes('Bath/Shower')) &&
    flat7Assets.includes('TMV') &&
    flat7Assets.includes('Cold Source'),
  `Flat 7 merges comments + asset columns (got ${flat7Assets.join(', ')})`,
);

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
