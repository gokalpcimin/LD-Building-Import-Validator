/**
 * Unit checks for the weighted AssetClassifier + LocationParser.
 * Run: npx tsx scripts/test-asset-classifier.mjs
 */
import { classifyAssetFromText } from '../utils/services/AssetClassifier.ts';
import { parseOutletLocation } from '../utils/services/LocationParser.ts';

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

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
