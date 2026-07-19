import type { AssetType, ParsedLocation } from '../../types';
import {
  fixtureKeywordsForRoomStripping,
  isPlaceNameAssetKeyword,
} from '../rules/assetRules';
import { parseLocationText } from '../locationParser';

export interface ParsedOutletLocation extends ParsedLocation {
  /** True when a room/location label could not be cleanly recovered. */
  unclearRoom: boolean;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Remove fixture keywords from remaining location text so the room field
 * holds the place name only (e.g. "Cleaning Room- Bib Tap" → "Cleaning Room").
 * Place-like soft signals ("toilets", "kitchen") are kept — they are the room name.
 */
export function stripAssetKeywordsFromText(
  text: string,
  keywordsToStrip: string[] = [],
): string {
  let remaining = text.replace(/\s+/g, ' ').trim();
  const keywords = [...new Set(keywordsToStrip)]
    .filter((keyword) => !isPlaceNameAssetKeyword(keyword))
    .sort((a, b) => b.length - a.length);

  for (const keyword of keywords) {
    const flexible = keyword
      .split(/\s+/)
      .map(escapeRegExp)
      .join('\\s+');
    const phrase = new RegExp(`(?:^|[\\s\\-–/,])${flexible}(?=$|[\\s\\-–/,])`, 'gi');
    remaining = remaining.replace(phrase, ' ');
  }

  return remaining
    .replace(/\s*[-–/,]+\s*/g, ' - ')
    .replace(/^\s*[-–/,]+\s*|\s*[-–/,]+\s*$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Parse Monthly Outlet "Outlet/Location" text into unit / floor / room.
 * Reuses shared floor/unit extraction, then strips fixture keywords from room.
 */
export function parseOutletLocation(
  rawText: string,
  matchedAssetKeywords: string[] = [],
  assetType?: AssetType,
): ParsedOutletLocation {
  const base = parseLocationText(rawText);
  const stripList =
    assetType && assetType !== 'Unknown'
      ? [
          ...matchedAssetKeywords.filter((keyword) => !isPlaceNameAssetKeyword(keyword)),
          ...fixtureKeywordsForRoomStripping(assetType),
        ]
      : matchedAssetKeywords.filter((keyword) => !isPlaceNameAssetKeyword(keyword));
  const room = stripAssetKeywordsFromText(base.room, stripList);
  const unclearRoom = !room || room.length < 2;

  // Also recover unit when written as "Unit 15- Workshop..." (already in parseLocationText).
  // Extend GF shorthand if the base parser missed it.
  let floor = base.floor;
  if (!floor) {
    const gf = rawText.match(/\bGF\b/i);
    if (gf) {
      floor = 'Ground Floor';
    }
  }

  let cleanedRoom = room;
  if (floor === 'Ground Floor' && cleanedRoom) {
    cleanedRoom = cleanedRoom
      .replace(/\bGF\b/gi, '')
      .replace(/\s+/g, ' ')
      .replace(/^\s*[-–]\s*|\s*[-–]\s*$/g, '')
      .trim();
  }

  return {
    unit: base.unit,
    floor,
    room: cleanedRoom,
    unclearRoom: !cleanedRoom || cleanedRoom.length < 2,
  };
}

export interface ResolvedSectionUnit {
  unit: string | undefined;
  /** True when a combined heading like Unit 14/15 was narrowed using row text. */
  resolvedFromInline: boolean;
  /** True when the section is combined but the row does not clearly say 14 vs 15. */
  ambiguousCombined: boolean;
  sectionUnit?: string;
}

/**
 * Resolve the Unit field for a Monthly Outlet row.
 *
 * - Simple section ("Unit 3"): inherit the section heading.
 * - Combined section ("Unit 14/15"): pick Unit 14 or Unit 15 from Outlet/Location
 *   text when the row mentions one of those ids; otherwise keep "Unit 14/15"
 *   and flag ambiguousCombined so validation/UI can ask for review.
 */
export function resolveMonthlyOutletUnit(
  sectionUnit: string | undefined,
  outletText: string,
  locationParsedUnit?: string,
): ResolvedSectionUnit {
  if (!sectionUnit) {
    return {
      unit: locationParsedUnit || undefined,
      resolvedFromInline: Boolean(locationParsedUnit),
      ambiguousCombined: false,
    };
  }

  const combined = sectionUnit.match(/^unit\s+(\d+)\s*\/\s*(\d+)(?:\b|$)/i);
  if (!combined) {
    return {
      unit: sectionUnit,
      resolvedFromInline: false,
      ambiguousCombined: false,
      sectionUnit,
    };
  }

  const left = combined[1];
  const right = combined[2];
  const allowed = new Set([left, right]);
  const mentioned = new Set<string>();

  for (const match of outletText.matchAll(/\bunit\s*[-–]?\s*(\d+)\b/gi)) {
    if (allowed.has(match[1])) {
      mentioned.add(match[1]);
    }
  }

  if (mentioned.size === 0 && locationParsedUnit) {
    const parsed = locationParsedUnit.match(/^unit\s+(\d+)$/i);
    if (parsed && allowed.has(parsed[1])) {
      mentioned.add(parsed[1]);
    }
  }

  if (mentioned.size === 1) {
    const id = [...mentioned][0];
    return {
      unit: `Unit ${id}`,
      resolvedFromInline: true,
      ambiguousCombined: false,
      sectionUnit,
    };
  }

  return {
    unit: sectionUnit,
    resolvedFromInline: false,
    ambiguousCombined: true,
    sectionUnit,
  };
}
