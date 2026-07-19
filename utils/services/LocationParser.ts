import type { AssetType, ParsedLocation } from '../../types';
import { keywordsForAssetType } from '../rules/assetRules';
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
 * Only strips keywords for the classified asset — place names like "Toilets"
 * must not disappear when the row is a WHB in a toilet area.
 */
export function stripAssetKeywordsFromText(
  text: string,
  keywordsToStrip: string[] = [],
): string {
  let remaining = text.replace(/\s+/g, ' ').trim();
  const keywords = [...new Set(keywordsToStrip)].sort((a, b) => b.length - a.length);

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
 * Reuses shared floor/unit extraction, then strips the classified asset's keywords from room.
 */
export function parseOutletLocation(
  rawText: string,
  matchedAssetKeywords: string[] = [],
  assetType?: AssetType,
): ParsedOutletLocation {
  const base = parseLocationText(rawText);
  const stripList =
    assetType && assetType !== 'Unknown'
      ? [...matchedAssetKeywords, ...keywordsForAssetType(assetType)]
      : matchedAssetKeywords;
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
