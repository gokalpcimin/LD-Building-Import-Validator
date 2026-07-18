import type { ColumnRole, SheetColumnMapping } from '../types';

/**
 * AI-assisted column mapping — the "AI proposes, human approves" layer on
 * top of the deterministic keyword mapping in `columnMapping.ts`.
 *
 * This is a MOCK of an LLM call (the case brief explicitly allows mocked
 * AI): `suggestMappingWithAi` has the exact signature a real integration
 * would have — async, takes headers + sample values, returns suggestions
 * with a confidence score and a human-readable rationale — so swapping the
 * body for a real `fetch('/api/suggest-mapping')` → LLM call changes
 * nothing else in the app. The mock itself goes beyond the deterministic
 * rules with fuzzy/semantic-style matching (synonyms, typo tolerance,
 * sample-value inspection), which is representative of what the LLM adds.
 *
 * Crucially, suggestions are never auto-applied: the UI shows each one with
 * its confidence and rationale, and the user accepts or dismisses them.
 */

export interface AiMappingSuggestion {
  header: string;
  /** Role the AI proposes for this column. */
  suggestedRole: ColumnRole;
  /** Role currently assigned (always 'ignore' — we only suggest for unmapped columns). */
  currentRole: ColumnRole;
  /** 0-100 — how confident the (mock) model is. */
  confidence: number;
  /** Short human-readable justification shown in the UI. */
  rationale: string;
}

interface RolePattern {
  role: ColumnRole;
  pattern: RegExp;
  confidence: number;
  rationale: string;
}

/**
 * Synonym/typo patterns the deterministic mapper intentionally doesn't
 * cover — semantic equivalents ("storey" ≈ floor, "zone" ≈ room) and common
 * misspellings. Ordered: first match wins.
 */
const HEADER_PATTERNS: RolePattern[] = [
  { role: 'floor', pattern: /\bstorey\b|\bstory\b|\bflr\b|\bfloo?r\s*(?:no|number|#)/i, confidence: 88, rationale: 'Header is a common synonym/abbreviation for a floor designation' },
  { role: 'room', pattern: /\bzone\b|\bspace\b|\blocation\s*name\b|\brm\b\.?$/i, confidence: 82, rationale: 'Header is a common synonym for a room/space designation' },
  { role: 'unit', pattern: /\bapartment\b|\bapt\b|\bflat\b|\bsuite\b|\bpremise?s\b/i, confidence: 85, rationale: 'Header names a unit-like subdivision (apartment/flat/suite)' },
  { role: 'buildingNo', pattern: /\bbldg\b|\bblg\s*(?:no|#)|\bbuilding\s*id\b/i, confidence: 84, rationale: 'Header abbreviates a building identifier' },
  { role: 'address', pattern: /\bsite\b|\bpostcode\b|\bpost\s*code\b|\bproperty\b/i, confidence: 78, rationale: 'Header refers to site/property identification, typically the address' },
  { role: 'assetType', pattern: /\bfixture\b|\bappliance\b|\bfitting\b|\bdevice\b|\bequipment\b/i, confidence: 86, rationale: 'Header names the kind of fixture/appliance, i.e. the asset type' },
  { role: 'location', pattern: /\bdescription\b|\bdetails\b/i, confidence: 62, rationale: 'Free-text description columns often contain combined location text' },
];

const SAMPLE_PATTERNS: RolePattern[] = [
  { role: 'floor', pattern: /^(?:ground|basement|mezzanine|(?:lower|upper)\s+ground|\d+(?:st|nd|rd|th)(?:\s+floor)?)$/i, confidence: 80, rationale: 'Sample value looks like a floor name' },
  { role: 'assetType', pattern: /^(?:bib\s*tap|wc|shower|whb|sink|tmv|expansion\s*vessel|calorifier)s?$/i, confidence: 84, rationale: 'Sample value matches a known asset/outlet type' },
  { role: 'unit', pattern: /^unit\s*\d+/i, confidence: 82, rationale: 'Sample value follows a "Unit N" pattern' },
  { role: 'address', pattern: /\d+\s+\w+.*(?:road|street|lane|avenue|close|way|drive)\b/i, confidence: 80, rationale: 'Sample value looks like a street address' },
];

function simulateLatency(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 600 + Math.random() * 500));
}

/**
 * Proposes roles for columns the deterministic mapper left as 'ignore'.
 * Never overrides an existing (non-ignore) assignment, and never proposes a
 * role that's already taken by another column — the suggestions must always
 * be safe to accept as-is.
 */
export async function suggestMappingWithAi(
  headers: string[],
  sampleRow: string[],
  currentMapping: SheetColumnMapping,
): Promise<AiMappingSuggestion[]> {
  await simulateLatency();

  const assignedRoles = new Set<ColumnRole>(
    Object.values(currentMapping).filter((role) => role !== 'ignore'),
  );
  const suggestions: AiMappingSuggestion[] = [];

  headers.forEach((header, index) => {
    if (!header || (currentMapping[header] ?? 'ignore') !== 'ignore') {
      return;
    }

    const sample = sampleRow[index] ?? '';
    const headerMatch = HEADER_PATTERNS.find((p) => p.pattern.test(header));
    const sampleMatch = sample ? SAMPLE_PATTERNS.find((p) => p.pattern.test(sample)) : undefined;

    const match =
      headerMatch && sampleMatch && headerMatch.role === sampleMatch.role
        ? // Header and sample value agree — boost confidence.
          { ...headerMatch, confidence: Math.min(97, headerMatch.confidence + 10), rationale: `${headerMatch.rationale}; sample value agrees` }
        : headerMatch ?? sampleMatch;

    if (!match || assignedRoles.has(match.role)) {
      return;
    }

    assignedRoles.add(match.role);
    suggestions.push({
      header,
      suggestedRole: match.role,
      currentRole: 'ignore',
      confidence: match.confidence,
      rationale: match.rationale,
    });
  });

  return suggestions;
}
