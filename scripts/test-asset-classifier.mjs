/**
 * Unit checks for the weighted AssetClassifier + LocationParser.
 * Run: npx tsx scripts/test-asset-classifier.mjs
 */
import { classifyAssetFromText } from '../utils/services/AssetClassifier.ts';
import {
  parseOutletLocation,
  resolveMonthlyOutletUnit,
} from '../utils/services/LocationParser.ts';

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

console.log('\nAssetClassifier');
const bib = classifyAssetFromText('Workshop Toilets - Bib Tap');
assert(bib.assetType === 'Bib Tap', `Workshop Toilets - Bib Tap → Bib Tap (got ${bib.assetType})`);
assert(bib.confidence === 1, `Bib Tap confidence 1 (got ${bib.confidence})`);
assert(bib.matchedKeywords.includes('bib tap'), `matched bib tap (got ${bib.matchedKeywords.join(',')})`);
assert(!bib.matchedKeywords.includes('bib'), 'only winning-score keyword(s) returned, not weaker "bib"');
assert(bib.needsReview === false, 'high-confidence Bib Tap does not need review');

const toilets = classifyAssetFromText('Workshop Toilets');
assert(toilets.assetType === 'WC', `Workshop Toilets → WC (got ${toilets.assetType})`);
assert(toilets.confidence === 0.5, `toilets confidence 0.5 (got ${toilets.confidence})`);
assert(toilets.needsReview === true, 'soft WC needs review');

const unknown = classifyAssetFromText('Workshop - Next to Boiler');
assert(unknown.assetType === 'Unknown', 'boiler neighbour → Unknown');
assert(unknown.needsReview === true, 'Unknown needs review');

const kitchen = classifyAssetFromText('Staff Kitchenette');
assert(kitchen.assetType === 'Kitchen Outlet', `Kitchenette → Kitchen Outlet (got ${kitchen.assetType})`);

console.log('\nLocationParser');
const loc1 = parseOutletLocation('Unit 15- Workshop Toilets WHB', ['whb'], 'WHB');
assert(loc1.unit === 'Unit 15', `unit Unit 15 (got ${loc1.unit})`);
assert(!/whb/i.test(loc1.room), `WHB stripped from room (got "${loc1.room}")`);
assert(/toilet/i.test(loc1.room), `place-name Toilets kept when asset is WHB (got "${loc1.room}")`);

const loc2 = parseOutletLocation('1st Floor- Cleaning Room- Bib Tap', ['bib tap'], 'Bib Tap');
assert(loc2.floor === '1st Floor', `floor 1st Floor (got ${loc2.floor})`);
assert(loc2.room.toLowerCase().includes('cleaning'), `room Cleaning Room (got "${loc2.room}")`);
assert(!/bib/i.test(loc2.room), `bib tap stripped from room (got "${loc2.room}")`);

const loc3 = parseOutletLocation('1st Floor- Finance Office');
assert(loc3.floor === '1st Floor', 'finance office floor');
assert(/finance/i.test(loc3.room), `finance office room (got "${loc3.room}")`);

const loc4 = parseOutletLocation('Mezzanine Male Toilets', ['toilets'], 'WC');
assert(loc4.floor === 'Mezzanine', `mezzanine floor (got "${loc4.floor}")`);
assert(/male\s+toilets/i.test(loc4.room), `room keeps Male Toilets (got "${loc4.room}")`);

const loc5 = parseOutletLocation('Mezzanine Female Toilets', ['toilets'], 'WC');
assert(/female\s+toilets/i.test(loc5.room), `room keeps Female Toilets (got "${loc5.room}")`);

const loc6 = parseOutletLocation('Workshop Kitchen Area', ['kitchen'], 'Kitchen Outlet');
assert(/kitchen/i.test(loc6.room), `kitchen kept in room name (got "${loc6.room}")`);

console.log('\nCombined Unit 14/15 resolution');
const r14 = resolveMonthlyOutletUnit('Unit 14/15', 'Workshop Toilets - Wash Hand Basin unit 14');
assert(r14.unit === 'Unit 14', `unit 14 from trailing text (got ${r14.unit})`);
assert(r14.resolvedFromInline === true, 'resolved from inline');
assert(r14.ambiguousCombined === false, 'not ambiguous when unit 14 present');

const r15 = resolveMonthlyOutletUnit('Unit 14/15', 'Unit 15- Workshop Toilets WHB');
assert(r15.unit === 'Unit 15', `unit 15 from leading text (got ${r15.unit})`);

const rAmb = resolveMonthlyOutletUnit('Unit 14/15', 'Outside Bib Tap');
assert(rAmb.unit === 'Unit 14/15', `ambiguous keeps Unit 14/15 (got ${rAmb.unit})`);
assert(rAmb.ambiguousCombined === true, 'Outside Bib Tap under 14/15 is ambiguous');

const r3 = resolveMonthlyOutletUnit('Unit 3', '1st Floor- Finance Office');
assert(r3.unit === 'Unit 3', 'simple section inherits Unit 3');
assert(r3.ambiguousCombined === false, 'simple section not ambiguous');

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
