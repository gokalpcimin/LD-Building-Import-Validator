import type { ParsedLocation } from '../types';

const FLOOR_PATTERNS: ReadonlyArray<{
  pattern: RegExp;
  normalize: (match: RegExpMatchArray) => string;
}> = [
  { pattern: /\bGround\s+Floor\b/i, normalize: () => 'Ground Floor' },
  { pattern: /\bGF\b/, normalize: () => 'Ground Floor' },
  { pattern: /\b(?:First|1st)\s+Floor\b/i, normalize: () => '1st Floor' },
  { pattern: /\b(?:Second|2nd)\s+Floor\b/i, normalize: () => '2nd Floor' },
  { pattern: /\b(?:Third|3rd)\s+Floor\b/i, normalize: () => '3rd Floor' },
  { pattern: /\bMezzanine\b/i, normalize: () => 'Mezzanine' },
  {
    pattern: /\b(\d+)(?:st|nd|rd|th)\s+Floor\b/i,
    normalize: (match) => match[0],
  },
  {
    pattern: /\bFloor\s+(\d+[A-Za-z]?)\b/i,
    normalize: (match) => `Floor ${match[1]}`,
  },
];

function extractFloor(text: string): string {
  for (const { pattern, normalize } of FLOOR_PATTERNS) {
    const match = text.match(pattern);
    if (match) {
      return normalize(match);
    }
  }
  return '';
}

function stripFloorFromText(text: string, floor: string): string {
  if (!floor) {
    return text;
  }

  const escaped = floor.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return text
    .replace(new RegExp(escaped, 'i'), '')
    .replace(/^[-–]\s*/, '')
    .trim();
}

/**
 * Parse location text such as "Unit 3 - 1st Floor Finance Office" into unit, floor, and room.
 */
export function parseLocationText(text: string): ParsedLocation {
  let remaining = text.replace(/\s+/g, ' ').trim();
  let unit = '';

  const unitStartMatch = remaining.match(/^Unit\s+([\w\d]+)\s*[-–]?\s*/i);
  if (unitStartMatch) {
    unit = `Unit ${unitStartMatch[1]}`;
    remaining = remaining.slice(unitStartMatch[0].length).trim();
  } else {
    const unitInlineMatch = remaining.match(/\bUnit\s+([\w\d]+)\b/i);
    if (unitInlineMatch) {
      unit = `Unit ${unitInlineMatch[1]}`;
    }
  }

  const floor = extractFloor(remaining);
  remaining = stripFloorFromText(remaining, floor);

  if (remaining.startsWith('-') || remaining.startsWith('–')) {
    remaining = remaining.slice(1).trim();
  }

  let room = remaining;

  const roomLabelMatch = room.match(/\b(?:Room|Rm\.?)\s+(.+)$/i);
  if (roomLabelMatch) {
    room = roomLabelMatch[1].trim();
  }

  return {
    unit,
    floor,
    room: room || '',
  };
}

const BUILDING_REGISTER_FLOOR_KEYWORDS = [
  'Lower Ground',
  'Ground',
  'First',
  'Second',
  'Third',
  'Fourth',
  'Fifth',
  'Mezzanine',
  'Basement',
];

const FLOOR_KEYWORD_ALTERNATION = BUILDING_REGISTER_FLOOR_KEYWORDS.map((keyword) =>
  keyword.replace(/\s+/g, '\\s+'),
).join('|');

/** Matches "[Building No] [Floor keyword] [rest of the line]", e.g. "1 Ground Residential Laundry - 39.1 ...". */
const BUILDING_REGISTER_LINE_PATTERN = new RegExp(
  `^\\s*(\\d+[A-Za-z]?)\\s+(${FLOOR_KEYWORD_ALTERNATION})\\b\\s*(.*)$`,
  'i',
);

function normalizeFloorKeyword(raw: string): string {
  return raw
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}

/**
 * Once the Building No + Floor prefix is stripped, the remaining text is
 * "Room name" followed by dash/number telemetry columns that got flattened
 * into the same line (temperatures, counts, "- - - -" placeholders). We
 * collect the leading run of words as the room name, stopping at the first
 * lone dash or decimal reading (never part of a room name). A single
 * trailing bare integer is still kept as part of the room (e.g. "Flat 3",
 * "Room 27"), but two integers in a row signal we've reached the telemetry
 * block (e.g. "... 1 1 1 1 2 ...") and stop there instead.
 */
function extractRoomFromRegisterTail(text: string): string {
  const tokens = text.split(/\s+/).filter(Boolean);
  const roomTokens: string[] = [];
  let lastWasBareInteger = false;

  for (const token of tokens) {
    if (token === '-' || token === '–' || /^\d+\.\d+$/.test(token)) {
      break;
    }

    const isBareInteger = /^\d+$/.test(token);
    if (isBareInteger && lastWasBareInteger) {
      break;
    }

    roomTokens.push(token);
    lastWasBareInteger = isBareInteger;
  }

  return roomTokens.join(' ').trim();
}

export interface BuildingRegisterLineResult {
  buildingNo?: string;
  floor?: string;
  room?: string;
  /** Everything after the Building No + Floor prefix, unstripped — used for asset/abbreviation scanning. */
  tail?: string;
}

/**
 * Decomposes a flattened building-register line using the
 * [Building Number] + [Floor keyword] + [Location text] rule, e.g.:
 * "1 Ground Residential Laundry - 39.1 2 8.1 1 1 - - - - - - - WM"
 *   → { buildingNo: "1", floor: "Ground", room: "Residential Laundry", tail: "Residential Laundry - 39.1 ... WM" }
 */
export function parseBuildingRegisterLine(text: string): BuildingRegisterLineResult {
  const normalized = text.replace(/\s+/g, ' ').trim();
  const match = normalized.match(BUILDING_REGISTER_LINE_PATTERN);
  if (!match) {
    return {};
  }

  const [, buildingNo, floorRaw, tail] = match;
  const floor = normalizeFloorKeyword(floorRaw);
  const room = extractRoomFromRegisterTail(tail);

  return {
    buildingNo,
    floor,
    room: room || undefined,
    tail,
  };
}
