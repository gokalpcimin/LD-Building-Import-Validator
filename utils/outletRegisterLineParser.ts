/**
 * Column-aligned parser for Outlet & Temperature Register rows copied from
 * PDF/Excel as flattened free text.
 *
 * Fixed column order (after Building No / Floor / Location):
 *   Sentinel Hot, Sentinel Cold, Sentinel Asset, Type, Biocide Reading,
 *   Hot Temp °C, Hot Source, Cold Temp °C, Cold Source,
 *   Sink, Whb, Shower, TMVs No., Scale on outlet, Spray Outlets,
 *   Dead Legs, Flexible Hoses, Other Comments
 *
 * Copy/paste often drops blank temp cells, wraps dual hot temps onto one
 * line ("52.1 34.4"), and joins wrapped fragments with "/". Alignment is
 * anchored on the trailing 8 count columns (Sink → Flexible Hoses) so a
 * lone source code like Cold Source=1 is not mistaken for Sink.
 */

export const OUTLET_REGISTER_FLOOR_KEYWORDS = [
  'Lower Ground',
  'Ground',
  'First',
  'Second',
  'Third',
  'Basement',
  'Mezzanine',
  'Roof',
] as const;

const FLOOR_ALTERNATION = OUTLET_REGISTER_FLOOR_KEYWORDS.map((k) =>
  k.replace(/\s+/g, '\\s+'),
).join('|');

const LINE_HEAD_PATTERN = new RegExp(
  `^(?:(\\d+[A-Za-z]?)\\s+)?(${FLOOR_ALTERNATION})\\b\\s*(.*)$`,
  'i',
);

/** Leading shorthand tags that can appear before telemetry (not comments). */
const SHORTHAND_TAGS = new Set([
  'WC',
  'WM',
  'DW',
  'BT',
  'HDM',
  'IM',
  'CWF',
  'WF',
  'ES',
  'EEW',
  'WB',
  'W-B',
  'SO',
  'IDWM',
  'TMV',
  'SH',
  'WHB',
]);

export interface OutletRegisterRow {
  'Building No': string | null;
  Floor: string | null;
  'Location/Barcode': string | null;
  'Sentinel Hot': string;
  'Sentinel Cold': string;
  'Sentinel Asset': string;
  Type: string;
  'Biocide Reading': string;
  'Hot Temp OC': string;
  'Hot Source': string;
  'Cold Temp OC': string;
  'Cold Source': string;
  Sink: string;
  Whb: string;
  Shower: string;
  'TMVs No.': string;
  'Scale on outlet': string;
  'Spray Outlets': string;
  'Dead Legs': string;
  'Flexible Hoses': string;
  'Other Comments': string;
}

/** Compact column bag attached to paste preview rows. */
export type OutletRegisterColumns = Pick<
  OutletRegisterRow,
  | 'Sentinel Hot'
  | 'Sentinel Cold'
  | 'Sentinel Asset'
  | 'Type'
  | 'Biocide Reading'
  | 'Hot Temp OC'
  | 'Hot Source'
  | 'Cold Temp OC'
  | 'Cold Source'
  | 'Sink'
  | 'Whb'
  | 'Shower'
  | 'TMVs No.'
  | 'Scale on outlet'
  | 'Spray Outlets'
  | 'Dead Legs'
  | 'Flexible Hoses'
  | 'Other Comments'
>;

const DASH = '-';

function emptyRow(): OutletRegisterRow {
  return {
    'Building No': null,
    Floor: null,
    'Location/Barcode': null,
    'Sentinel Hot': DASH,
    'Sentinel Cold': DASH,
    'Sentinel Asset': DASH,
    Type: DASH,
    'Biocide Reading': DASH,
    'Hot Temp OC': DASH,
    'Hot Source': DASH,
    'Cold Temp OC': DASH,
    'Cold Source': DASH,
    Sink: DASH,
    Whb: DASH,
    Shower: DASH,
    'TMVs No.': DASH,
    'Scale on outlet': DASH,
    'Spray Outlets': DASH,
    'Dead Legs': DASH,
    'Flexible Hoses': DASH,
    'Other Comments': '',
  };
}

function normalizeFloor(raw: string): string {
  return raw
    .trim()
    .replace(/\s+/g, ' ')
    .split(' ')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}

function isDash(token: string): boolean {
  return token === '-' || token === '–' || token === '—';
}

function isFlag(token: string): boolean {
  return /^[YNF]$/i.test(token);
}

function isCountToken(token: string): boolean {
  return isDash(token) || /^\d+$/.test(token);
}

function isDecimalTemp(token: string): boolean {
  return /^\d+\.\d+$/.test(token);
}

function isSourceCode(token: string): boolean {
  return isDash(token) || /^(?:[12])$/.test(token);
}

function isShorthandTag(token: string): boolean {
  return SHORTHAND_TAGS.has(token.replace(/[.,;:]+$/g, '').toUpperCase());
}

function cell(token: string | undefined): string {
  if (token == null || token === '') {
    return DASH;
  }
  return isDash(token) ? DASH : token;
}

/**
 * Split location name from the structured field/comment zone.
 * Location runs until the first sentinel flag, decimal temp, or lone dash
 * that starts the column block — keeping a single trailing room number
 * ("Flat 3") and skipping a leading shorthand tag ("… WC - WC - 38.8").
 */
export function splitLocationAndFields(tail: string): {
  location: string;
  fieldTokens: string[];
  comments: string;
} {
  const tokens = tail.split(/\s+/).filter(Boolean);
  const locationTokens: string[] = [];
  let i = 0;
  let lastWasBareInteger = false;

  for (; i < tokens.length; i += 1) {
    const token = tokens[i];
    if (isDash(token) || isDecimalTemp(token) || isFlag(token)) {
      break;
    }
    const bareInt = /^\d+$/.test(token);
    if (bareInt && lastWasBareInteger) {
      break;
    }
    locationTokens.push(token);
    lastWasBareInteger = bareInt;
  }

  // Skip repeated shorthand tags that sit between location and telemetry.
  while (i < tokens.length && (isDash(tokens[i]) || isShorthandTag(tokens[i]))) {
    if (isShorthandTag(tokens[i])) {
      i += 1;
      continue;
    }
    // Lone dash: only skip if the next token is still a tag or telemetry start.
    if (
      isDash(tokens[i]) &&
      i + 1 < tokens.length &&
      (isShorthandTag(tokens[i + 1]) ||
        isDecimalTemp(tokens[i + 1]) ||
        isFlag(tokens[i + 1]) ||
        isDash(tokens[i + 1]) ||
        /^\d+$/.test(tokens[i + 1]))
    ) {
      // This dash begins the structured zone — stop skipping tags.
      if (!isShorthandTag(tokens[i + 1])) {
        break;
      }
      i += 1;
      continue;
    }
    break;
  }

  const structuredAndComments = tokens.slice(i);
  return splitFieldsAndComments(locationTokens.join(' ').trim(), structuredAndComments);
}

function splitFieldsAndComments(
  location: string,
  tokens: string[],
): { location: string; fieldTokens: string[]; comments: string } {
  let end = tokens.length;

  // "2 x Newark Calorifiers" / "WC X 9" — quantity marker starts comments.
  for (let i = 0; i < tokens.length - 1; i += 1) {
    if (/^\d+$/.test(tokens[i]) && /^[xX]$/.test(tokens[i + 1])) {
      end = i;
      break;
    }
  }

  let commentStart = end;
  for (let i = 0; i < end; i += 1) {
    const token = tokens[i];
    if (!/[A-Za-z]{2,}/.test(token) || isFlag(token)) {
      continue;
    }
    if (isShorthandTag(token) && hasTelemetryAfter(tokens, i, end)) {
      continue;
    }
    commentStart = i;
    break;
  }

  return {
    location,
    fieldTokens: tokens.slice(0, commentStart),
    comments: tokens.slice(commentStart).join(' ').trim(),
  };
}

function hasTelemetryAfter(tokens: string[], index: number, end: number): boolean {
  for (let j = index + 1; j < end; j += 1) {
    const next = tokens[j];
    if (isDash(next) || isDecimalTemp(next) || /^\d+$/.test(next) || isFlag(next)) {
      return true;
    }
    if (isShorthandTag(next)) {
      continue;
    }
    return false;
  }
  return false;
}

export interface AlignedFields {
  sentinelHot: string;
  sentinelCold: string;
  sentinelAsset: string;
  type: string;
  biocideReading: string;
  hotTempOc: string;
  hotSource: string;
  coldTempOc: string;
  coldSource: string;
  sink: string;
  whb: string;
  shower: string;
  tmvsNo: string;
  scaleOnOutlet: string;
  sprayOutlets: string;
  deadLegs: string;
  flexibleHoses: string;
}

/** Drop wrap separators inserted when physical PDF lines are joined ("a / b"). */
function cleanFieldTokens(fieldTokens: string[]): string[] {
  return fieldTokens.filter((token) => token !== '/' && token !== '|' && token !== '\\');
}

/**
 * Align flattened field tokens to the fixed register columns.
 * Anchors on the trailing 8 count columns so Cold Source is not shifted into Sink.
 */
export function alignOutletRegisterFields(fieldTokens: string[]): AlignedFields {
  const blank: AlignedFields = {
    sentinelHot: DASH,
    sentinelCold: DASH,
    sentinelAsset: DASH,
    type: DASH,
    biocideReading: DASH,
    hotTempOc: DASH,
    hotSource: DASH,
    coldTempOc: DASH,
    coldSource: DASH,
    sink: DASH,
    whb: DASH,
    shower: DASH,
    tmvsNo: DASH,
    scaleOnOutlet: DASH,
    sprayOutlets: DASH,
    deadLegs: DASH,
    flexibleHoses: DASH,
  };

  const cleaned = cleanFieldTokens(fieldTokens);
  if (cleaned.length === 0) {
    return blank;
  }

  // Leading Y/N/F sentinel flags (Type / Biocide often follow as "-" or another flag).
  const sentinels = [DASH, DASH, DASH, DASH, DASH];
  let cursor = 0;
  let flagCount = 0;
  while (cursor < cleaned.length && flagCount < 4 && isFlag(cleaned[cursor])) {
    sentinels[flagCount] = cleaned[cursor].toUpperCase();
    flagCount += 1;
    cursor += 1;
  }
  if (flagCount > 0 && cursor < cleaned.length && isDash(cleaned[cursor])) {
    // Placeholder after Y/Y/F/F for Type or Biocide (e.g. Restaurant Kitchen).
    if (flagCount >= 3) {
      sentinels[Math.min(flagCount, 4)] = DASH;
      cursor += 1;
    }
  }

  const rest = cleaned.slice(cursor);
  if (rest.length === 0) {
    return {
      ...blank,
      sentinelHot: sentinels[0],
      sentinelCold: sentinels[1],
      sentinelAsset: sentinels[2],
      type: sentinels[3],
      biocideReading: sentinels[4],
    };
  }

  const hasDecimal = rest.some(isDecimalTemp);

  // Prefer a trailing 8-token count block (Sink … Flexible Hoses).
  let countTokens: string[] | null = null;
  let left: string[] = rest;

  if (rest.length >= 8 && rest.slice(-8).every(isCountToken)) {
    countTokens = rest.slice(-8);
    left = rest.slice(0, -8);
  } else if (rest.length >= 4 && rest.slice(-4).every(isCountToken)) {
    // Truncated paste: only Sink/Whb/Shower/TMV survived.
    countTokens = [...rest.slice(-4), DASH, DASH, DASH, DASH];
    left = rest.slice(0, -4);
  }

  const telemetry = parseTelemetryLeft(left, hasDecimal, flagCount);

  return {
    sentinelHot: flagCount > 0 ? sentinels[0] : telemetry.leadingSentinels[0],
    sentinelCold: flagCount > 0 ? sentinels[1] : telemetry.leadingSentinels[1],
    sentinelAsset: flagCount > 0 ? sentinels[2] : telemetry.leadingSentinels[2],
    type: flagCount > 0 ? sentinels[3] : telemetry.leadingSentinels[3],
    biocideReading: flagCount > 0 ? sentinels[4] : DASH,
    hotTempOc: telemetry.hotTempOc,
    hotSource: telemetry.hotSource,
    coldTempOc: telemetry.coldTempOc,
    coldSource: telemetry.coldSource,
    sink: cell(countTokens?.[0]),
    whb: cell(countTokens?.[1]),
    shower: cell(countTokens?.[2]),
    tmvsNo: cell(countTokens?.[3]),
    scaleOnOutlet: cell(countTokens?.[4]),
    sprayOutlets: cell(countTokens?.[5]),
    deadLegs: cell(countTokens?.[6]),
    flexibleHoses: cell(countTokens?.[7]),
  };
}

function parseTelemetryLeft(
  left: string[],
  hasDecimal: boolean,
  preParsedFlagCount: number,
): {
  leadingSentinels: [string, string, string, string];
  hotTempOc: string;
  hotSource: string;
  coldTempOc: string;
  coldSource: string;
  orphanDashBeforeCounts: boolean;
} {
  if (!hasDecimal) {
    const dedicated = parseDashOnlyTelemetry(left);
    if (dedicated) {
      return dedicated;
    }
  }

  const leadingSentinels: [string, string, string, string] = [DASH, DASH, DASH, DASH];
  let tokens = [...left];
  let orphanDashBeforeCounts = false;

  // One leading sentinel dash is common before the first temperature reading.
  if (preParsedFlagCount === 0 && tokens.length > 0 && isDash(tokens[0])) {
    leadingSentinels[0] = DASH;
    tokens.shift();
  }

  const hotTemps: string[] = [];
  while (tokens.length > 0 && isDecimalTemp(tokens[0])) {
    hotTemps.push(tokens.shift() as string);
  }

  let hotSource = DASH;
  let coldTempOc = DASH;
  let coldSource = DASH;

  if (tokens.length > 0 && isSourceCode(tokens[0])) {
    hotSource = cell(tokens.shift());
  }

  if (tokens.length > 0 && isDecimalTemp(tokens[0])) {
    coldTempOc = tokens.shift() as string;
  } else if (tokens.length >= 2 && isDash(tokens[0]) && isSourceCode(tokens[1])) {
    coldTempOc = DASH;
    tokens.shift();
  }

  if (tokens.length > 0 && isSourceCode(tokens[0])) {
    coldSource = cell(tokens.shift());
  }

  if (tokens.length === 1 && isDash(tokens[0])) {
    orphanDashBeforeCounts = true;
    tokens.shift();
  }

  if (coldSource === DASH && tokens.length === 1 && /^(?:[12])$/.test(tokens[0])) {
    coldSource = tokens.shift() as string;
  }

  return {
    leadingSentinels,
    hotTempOc: hotTemps.length > 0 ? hotTemps.join(' / ') : DASH,
    hotSource,
    coldTempOc,
    coldSource,
    orphanDashBeforeCounts,
  };
}

/**
 * No decimal temperatures: PDF often omits blank Hot/Cold Temp cells entirely.
 * Shapes seen in the LRA register:
 *   "- - - - 1"     → 4 sentinels + Cold Source=1
 *   "- - - - 1 -"   → same + orphan dash before counts
 *   "- - 2 - 1"     → sentinel + Hot=- + HotSrc=2 + Cold=- + ColdSrc=1
 *   "- 2 1"         → Hot=-/sentinel + HotSrc=2 + ColdSrc=1 (compact flats)
 */
function parseDashOnlyTelemetry(left: string[]): {
  leadingSentinels: [string, string, string, string];
  hotTempOc: string;
  hotSource: string;
  coldTempOc: string;
  coldSource: string;
  orphanDashBeforeCounts: boolean;
} | null {
  const leadingSentinels: [string, string, string, string] = [DASH, DASH, DASH, DASH];
  let tokens = [...left];
  let orphanDashBeforeCounts = false;

  if (tokens.length === 0) {
    return {
      leadingSentinels,
      hotTempOc: DASH,
      hotSource: DASH,
      coldTempOc: DASH,
      coldSource: DASH,
      orphanDashBeforeCounts,
    };
  }

  // Pattern: four leading dashes then Cold Source, optional orphan dash.
  if (
    tokens.length >= 5 &&
    tokens.slice(0, 4).every(isDash) &&
    /^(?:[12])$/.test(tokens[4])
  ) {
    if (tokens.length === 5 || (tokens.length === 6 && isDash(tokens[5]))) {
      return {
        leadingSentinels: [DASH, DASH, DASH, DASH],
        hotTempOc: DASH,
        hotSource: DASH,
        coldTempOc: DASH,
        coldSource: tokens[4],
        orphanDashBeforeCounts: tokens.length === 6,
      };
    }
  }

  // Peel at most one leading sentinel dash when Hot Source / Cold Source follow.
  let s = 0;
  while (tokens.length > 3 && s < 1 && isDash(tokens[0])) {
    leadingSentinels[s] = DASH;
    tokens.shift();
    s += 1;
  }

  // "- 2 - 1" or "2 - 1" or "- 2 1" or "2 1"
  let hotTempOc = DASH;
  let hotSource = DASH;
  let coldTempOc = DASH;
  let coldSource = DASH;

  if (tokens.length >= 4 && isDash(tokens[0]) && isSourceCode(tokens[1]) && isCountToken(tokens[2]) && isSourceCode(tokens[3])) {
    // Hot Temp blank, Hot Source, Cold Temp, Cold Source
    hotSource = cell(tokens[1]);
    coldTempOc = cell(tokens[2]);
    coldSource = cell(tokens[3]);
    tokens = tokens.slice(4);
  } else if (tokens.length >= 3 && isSourceCode(tokens[0]) && isDash(tokens[1]) && isSourceCode(tokens[2])) {
    hotSource = cell(tokens[0]);
    coldTempOc = DASH;
    coldSource = cell(tokens[2]);
    tokens = tokens.slice(3);
  } else if (tokens.length >= 3 && isDash(tokens[0]) && isSourceCode(tokens[1]) && isSourceCode(tokens[2])) {
    // Compact: "- 2 1" → blank hot, hotSrc=2, coldSrc=1
    hotSource = cell(tokens[1]);
    coldSource = cell(tokens[2]);
    tokens = tokens.slice(3);
  } else if (tokens.length >= 2 && isSourceCode(tokens[0]) && isSourceCode(tokens[1])) {
    hotSource = cell(tokens[0]);
    coldSource = cell(tokens[1]);
    tokens = tokens.slice(2);
  } else if (tokens.length === 1 && isSourceCode(tokens[0])) {
    coldSource = cell(tokens[0]);
    tokens = [];
  } else if (tokens.length >= 1 && isDash(tokens[0])) {
    // Still have leading blanks — treat as hot temp placeholders then sources.
    while (tokens.length > 2 && isDash(tokens[0])) {
      tokens.shift();
    }
    if (tokens.length >= 2 && isSourceCode(tokens[0]) && isSourceCode(tokens[1])) {
      hotSource = cell(tokens[0]);
      coldSource = cell(tokens[1]);
      tokens = tokens.slice(2);
    } else if (tokens.length === 1 && isSourceCode(tokens[0])) {
      coldSource = cell(tokens[0]);
      tokens = [];
    }
  }

  if (tokens.length === 1 && isDash(tokens[0])) {
    orphanDashBeforeCounts = true;
  }

  // Only accept if we consumed the left side sensibly.
  if (tokens.length > 1) {
    return null;
  }

  return {
    leadingSentinels,
    hotTempOc,
    hotSource,
    coldTempOc,
    coldSource,
    orphanDashBeforeCounts,
  };
}

/**
 * Parse one flattened Outlet & Temperature Register line into fixed columns.
 * Returns null when the line does not look like a register data row.
 */
export function parseOutletRegisterLine(rawLine: string): OutletRegisterRow | null {
  const line = rawLine.replace(/\s+/g, ' ').trim();
  if (!line) {
    return null;
  }

  const head = line.match(LINE_HEAD_PATTERN);
  if (!head) {
    return null;
  }

  const row = emptyRow();
  row['Building No'] = head[1] ?? null;
  row.Floor = normalizeFloor(head[2]);

  const { location, fieldTokens, comments } = splitLocationAndFields(head[3] ?? '');
  row['Location/Barcode'] = location || null;

  const aligned = alignOutletRegisterFields(fieldTokens);
  row['Sentinel Hot'] = aligned.sentinelHot;
  row['Sentinel Cold'] = aligned.sentinelCold;
  row['Sentinel Asset'] = aligned.sentinelAsset;
  row.Type = aligned.type;
  row['Biocide Reading'] = aligned.biocideReading;
  row['Hot Temp OC'] = aligned.hotTempOc;
  row['Hot Source'] = aligned.hotSource;
  row['Cold Temp OC'] = aligned.coldTempOc;
  row['Cold Source'] = aligned.coldSource;
  row.Sink = aligned.sink;
  row.Whb = aligned.whb;
  row.Shower = aligned.shower;
  row['TMVs No.'] = aligned.tmvsNo;
  row['Scale on outlet'] = aligned.scaleOnOutlet;
  row['Spray Outlets'] = aligned.sprayOutlets;
  row['Dead Legs'] = aligned.deadLegs;
  row['Flexible Hoses'] = aligned.flexibleHoses;
  row['Other Comments'] = comments;

  return row;
}

/** Build the column bag used by the paste preview table. */
export function toOutletRegisterColumns(
  aligned: AlignedFields,
  comments = '',
): OutletRegisterColumns {
  return {
    'Sentinel Hot': aligned.sentinelHot,
    'Sentinel Cold': aligned.sentinelCold,
    'Sentinel Asset': aligned.sentinelAsset,
    Type: aligned.type,
    'Biocide Reading': aligned.biocideReading,
    'Hot Temp OC': aligned.hotTempOc,
    'Hot Source': aligned.hotSource,
    'Cold Temp OC': aligned.coldTempOc,
    'Cold Source': aligned.coldSource,
    Sink: aligned.sink,
    Whb: aligned.whb,
    Shower: aligned.shower,
    'TMVs No.': aligned.tmvsNo,
    'Scale on outlet': aligned.scaleOnOutlet,
    'Spray Outlets': aligned.sprayOutlets,
    'Dead Legs': aligned.deadLegs,
    'Flexible Hoses': aligned.flexibleHoses,
    'Other Comments': comments,
  };
}

/** Numeric count helper: "-" / empty → 0, else integer. */
export function outletCountValue(cellValue: string | null | undefined): number {
  if (cellValue == null || cellValue === '' || isDash(cellValue)) {
    return 0;
  }
  if (/^\d+$/.test(cellValue)) {
    return Number.parseInt(cellValue, 10);
  }
  return 0;
}
