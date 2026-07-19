import type { AssetType, SheetType } from '../types';
import { classifyAssetFromText } from './services/AssetClassifier';

export function getForcedAssetType(sheetType: SheetType): AssetType | undefined {
  if (sheetType === 'annual-tmv') {
    return 'TMV';
  }
  if (sheetType === 'annual-expansion-vessel') {
    return 'Expansion Vessel';
  }
  return undefined;
}

export interface AssetDetectionResult {
  assetType: AssetType;
  isSpecific: boolean;
  isVague: boolean;
  /**
   * True when the type was a soft keyword guess (confidence &lt; 100%).
   * Callers should attach a warning so the row is Review Required.
   */
  inferredFromLocation: boolean;
}

/**
 * Shared entry point for non-register sheets. Delegates to the weighted
 * AssetClassifier so Monthly Outlet and generic sheets do not diverge.
 */
export function detectAssetType(
  hints: string[],
  sheetType?: SheetType,
): AssetDetectionResult {
  const forced = sheetType ? getForcedAssetType(sheetType) : undefined;
  if (forced) {
    return { assetType: forced, isSpecific: true, isVague: false, inferredFromLocation: false };
  }

  const classification = classifyAssetFromText(hints.filter(Boolean).join(' '));
  if (classification.assetType === 'Unknown') {
    return { assetType: 'Unknown', isSpecific: false, isVague: false, inferredFromLocation: false };
  }

  const isSpecific = classification.confidence >= 1;
  return {
    assetType: classification.assetType,
    isSpecific,
    isVague: !isSpecific,
    inferredFromLocation: !isSpecific,
  };
}

/**
 * Abbreviations used in building register "Other Comments"/glossary
 * columns (e.g. "2 x Newark Calorifiers", trailing "WM"/"BT" codes at the
 * end of a flattened row). Longer/more specific patterns are listed before
 * short 2-3 letter codes so distinctive phrases win when both could match.
 */
const MULTI_ASSET_RULES: ReadonlyArray<{ type: AssetType; pattern: RegExp; isAbbreviation: RegExp }> = [
  { type: 'Expansion Vessel', pattern: /\bExpansion\s+Vessels?\b/i, isAbbreviation: /(?!)/ },
  { type: 'Calorifier', pattern: /\bCalorifiers?\b/i, isAbbreviation: /(?!)/ },
  {
    type: 'Chilled Water Dispenser',
    pattern: /\bChilled\s+(?:Cold\s+)?Water\s+Dispensers?\b/i,
    isAbbreviation: /(?!)/,
  },
  {
    type: 'Chilled Water Fountain',
    pattern: /\bCWF\b|\bChilled\s+Water\s+Fountains?\b/i,
    isAbbreviation: /\bCWF\b/i,
  },
  { type: 'Water Fountain', pattern: /\bWF\b|\bWater\s+Fountains?\b/i, isAbbreviation: /\bWF\b/i },
  { type: 'Water Boiler', pattern: /\bWB\b|\bWater\s+Boilers?\b/i, isAbbreviation: /\bWB\b/i },
  {
    type: 'Hot Drinks Machine',
    pattern: /\bHDM\b|\bHot\s+Drinks?\s+Machines?\b/i,
    isAbbreviation: /\bHDM\b/i,
  },
  { type: 'Ice Machine', pattern: /\bIM\b|\bIce\s+Machines?\b/i, isAbbreviation: /\bIM\b/i },
  {
    type: 'Washing Machine',
    pattern: /\bWMs?\b|\bWashing\s+Machines?\b/i,
    isAbbreviation: /\bWMs?\b/i,
  },
  {
    type: 'Dishwasher',
    pattern: /\bDWs?\b|\bIDWM\b|\bDishwashers?\b/i,
    isAbbreviation: /\bDWs?\b|\bIDWM\b/i,
  },
  {
    type: 'Emergency Eyewash',
    pattern: /\bEEW\b|\bEmergency\s+Eyewash(?:es)?\b/i,
    isAbbreviation: /\bEEW\b/i,
  },
  {
    type: 'Emergency Shower',
    pattern: /\bES\b|\bEmergency\s+Showers?\b/i,
    isAbbreviation: /\bES\b/i,
  },
  { type: 'Chiller Unit', pattern: /\bChiller\s+Units?\b/i, isAbbreviation: /(?!)/ },
  { type: 'Spray Outlet', pattern: /\bSpray\s+(?:Outlets?|Heads?)\b/i, isAbbreviation: /(?!)/ },
  {
    type: 'Shower',
    // Excludes "Emergency Shower", which is its own distinct asset type above.
    pattern: /\bBath\+SH\b|(?<!Emergency\s)\bShowers?\b|\bSH\b/i,
    isAbbreviation: /\bSH\b/i,
  },
  {
    type: 'WHB',
    pattern: /\bWHB\b|\bWash\s+Hand\s+Basins?\b|\bSinks?\b/i,
    isAbbreviation: /\bWHB\b/i,
  },
  { type: 'Bib Tap', pattern: /\bBib[\s-]?Tap\b|\bBT\b/i, isAbbreviation: /\bBT\b/i },
  { type: 'WC', pattern: /\bWCs?\b|\bToilets?\b|\bWater\s+Closets?\b/i, isAbbreviation: /\bWCs?\b/i },
];

export interface AssetMatch {
  assetType: AssetType;
  quantity?: number;
  /** True when this match came from a short code (e.g. "WM") rather than a spelled-out word. */
  isAbbreviation: boolean;
  /** The exact snippet of text that triggered the match, for review messages. */
  matchedText: string;
}

function findPrecedingQuantity(text: string, matchIndex: number): number | undefined {
  const windowStart = Math.max(0, matchIndex - 24);
  const window = text.slice(windowStart, matchIndex);
  const matches = [...window.matchAll(/(\d+)\s*[xX]\b/g)];
  const last = matches[matches.length - 1];
  return last ? Number.parseInt(last[1], 10) : undefined;
}

/**
 * Scans free text (comments, abbreviation codes, room/location text) for
 * every distinct asset type it can find — not just the first/best match —
 * so rows like "Bath+SH head, WC" or "2 x Newark Calorifiers" produce all
 * the assets actually present, with a quantity when one precedes the match
 * (e.g. "2 x ...").
 */
export function extractAllAssets(text: string): AssetMatch[] {
  if (!text?.trim()) {
    return [];
  }

  const found: AssetMatch[] = [];
  const claimed = new Set<AssetType>();

  for (const { type, pattern, isAbbreviation } of MULTI_ASSET_RULES) {
    if (claimed.has(type)) {
      continue;
    }

    const globalPattern = new RegExp(pattern.source, pattern.flags.includes('g') ? pattern.flags : `${pattern.flags}g`);
    const match = globalPattern.exec(text);
    if (!match) {
      continue;
    }

    found.push({
      assetType: type,
      quantity: findPrecedingQuantity(text, match.index),
      isAbbreviation: isAbbreviation.test(match[0]),
      matchedText: match[0],
    });
    claimed.add(type);
  }

  return found;
}
