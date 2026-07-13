/**
 * Dedicated, self-contained parsing engine for the Copy & Paste import path
 * ONLY. It intentionally does not import from dataSheetParser.ts,
 * headerDetection.ts, locationParser.ts, assetDetector.ts or
 * validationEngine.ts — those are shared with the Excel/CSV pipeline and
 * must stay untouched. Every heuristic needed here (section inheritance,
 * building-number/floor/room decomposition, asset classification, duplicate
 * detection) is reimplemented locally so this file can evolve freely
 * without any risk of changing Excel import behaviour.
 *
 * Guiding rule: correct structured data > guessing > validation warning.
 * Never invent data — if a field can't be confidently extracted, it is
 * reported with a low confidence score and a null value rather than a
 * best-effort guess.
 *
 * The file is split into two layers on purpose:
 *  - Extraction (section/heading detection, [Building No]+[Floor]+[Room]
 *    decomposition, room-text cleanup, asset/quantity scanning) — this is
 *    the part that was already working well and is left conceptually
 *    unchanged here.
 *  - Validation (confidence scoring, critical/warning/info classification,
 *    import-readiness decision) — this is a distinct pass over the
 *    extracted data, so confidence rules and issue wording can evolve
 *    without touching the extraction heuristics above.
 */

/** A single extracted field, tagged with how sure the parser is and why. */
export interface FieldConfidence<T> {
  value: T | null;
  /** 0-100. 100 = exact keyword/abbreviation match, 95 = strong pattern, 70 = reasonable inference, <60 = not confident enough to set a value. */
  confidence: number;
  source: string;
}

export interface DetectedAsset {
  assetType: string;
  confidence: number;
  source: string;
}

export type IssueSeverity = 'critical' | 'warning';

export interface PasteIssue {
  severity: IssueSeverity;
  message: string;
}

/** READY: no critical issues, required fields confidently extracted. REVIEW_REQUIRED: only warnings. BLOCKED: at least one critical issue. */
export type ImportStatus = 'READY' | 'REVIEW_REQUIRED' | 'BLOCKED';

export interface PastedAssetRow {
  sheetName: 'Pasted Data';
  /** 1-based position of this line among the non-blank pasted lines — for tracing back to the source paste. */
  rowNumber: number;
  address: string;
  /** Building/area name inherited from the most recent section heading (e.g. "CROFTERS", "Bracken Close"). */
  building: FieldConfidence<string>;
  /** Building No — a distinct concept from Unit/Area, e.g. the leading "1" in "1 Ground Residential Laundry". */
  buildingNumber: FieldConfidence<string>;
  floor: FieldConfidence<string>;
  room: FieldConfidence<string>;
  /** "Unknown" (value: null) when nothing confidently matched; "Multiple Assets" when 2+ distinct assets were found — see detectedAssets. */
  assetType: FieldConfidence<string>;
  detectedAssets?: DetectedAsset[];
  quantity: FieldConfidence<number>;
  rawText: string;
  importStatus: ImportStatus;
  issues: PasteIssue[];
  /** Transparent, non-blocking notes about automatic detection/transformation. */
  parsingNotes: string[];
}

export interface PasteParseSummary {
  totalRows: number;
  assetsIdentified: number;
  distinctLocations: number;
  readyCount: number;
  reviewRequiredCount: number;
  blockedCount: number;
}

export interface PasteParseResult {
  rows: PastedAssetRow[];
  summary: PasteParseSummary;
}

// ─────────────────────────────────────────────────────────────────────────
// Extraction layer (unchanged heuristics — section headings, noise
// filtering, [Building No] + [Floor] + [Room] decomposition, room cleanup)
// ─────────────────────────────────────────────────────────────────────────

const FLOOR_KEYWORDS = [
  'Lower Ground',
  'Ground',
  'First',
  'Second',
  'Third',
  'Basement',
  'Mezzanine',
  'Roof',
];

const FLOOR_ALTERNATION = FLOOR_KEYWORDS.map((keyword) => keyword.replace(/\s+/g, '\\s+')).join('|');

/** "[Building No]? [Floor keyword] [rest of line]" — Building No is optional since line-wrapped pastes sometimes split it onto its own line above. */
const REGISTER_LINE_PATTERN = new RegExp(
  `^(?:(\\d+[A-Za-z]?)\\s+)?(${FLOOR_ALTERNATION})\\b\\s*(.*)$`,
  'i',
);

const PURE_FLOOR_LINE_PATTERN = new RegExp(`^(?:${FLOOR_ALTERNATION})(?:\\s+Floor)?$`, 'i');

/** Header cells / glossary labels that must never be mistaken for section headings or data. */
const NOISE_LINE_WORDS = new Set([
  'building no',
  'building number',
  'floor',
  'location/barcode',
  'location',
  'barcode',
  'sentinel hot',
  'sentinel cold',
  'sentinel asset',
  'sentinel asset type',
  'type',
  'biocide reading',
  'hot temp oc',
  'hot source',
  'cold temp oc',
  'cold source',
  'sink',
  'whb',
  'shower',
  'tmvs no.',
  'tmvs no',
  'scale on outlet',
  'spray outlets',
  'dead legs',
  'flexible hoses',
  'other comments',
  'other services i.e.',
  'outlet & temperature register',
  'abbreviations',
  'notes',
  'note',
  'key',
  'address',
  'asset type',
  'room',
  'unit',
]);

const NOTE_LINE_PATTERNS: RegExp[] = [
  /^abbreviations\s*:/i,
  /^(?:notes?|key|instructions?)\s*:/i,
  /^begin\s+the\s+walk\s*[- ]?through\b/i,
];

function normalize(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

function isNoiseLine(line: string): boolean {
  const trimmed = normalize(line);
  if (!trimmed) {
    return true;
  }
  if (NOISE_LINE_WORDS.has(trimmed.toLowerCase())) {
    return true;
  }
  if (NOTE_LINE_PATTERNS.some((pattern) => pattern.test(trimmed))) {
    return true;
  }
  if (PURE_FLOOR_LINE_PATTERN.test(trimmed)) {
    return true;
  }
  // A long, digit-free sentence reads like prose/instructions, not a data
  // row — genuine register rows almost always carry a number somewhere
  // (a building no, a reading, a count).
  const wordCount = trimmed.split(/\s+/).length;
  return wordCount > 10 && !/\d/.test(trimmed);
}

function isTitleCaseWord(word: string): boolean {
  return /^[A-Z][a-z'’-]*$/.test(word);
}

/** Recognizes building/area section headings like "CROFTERS" or "Bracken Close" that subsequent rows inherit. */
function isSectionHeading(line: string): boolean {
  const trimmed = normalize(line);
  if (!trimmed || trimmed.length >= 40) {
    return false;
  }
  if (/\d/.test(trimmed) || /[:.]/.test(trimmed)) {
    return false;
  }

  const words = trimmed.split(/\s+/);
  if (words.length > 4) {
    return false;
  }
  if (NOISE_LINE_WORDS.has(trimmed.toLowerCase())) {
    return false;
  }
  if (PURE_FLOOR_LINE_PATTERN.test(trimmed)) {
    return false;
  }

  const lettersOnly = trimmed.replace(/[^A-Za-z]/g, '');
  const isAllCapsWord = trimmed === trimmed.toUpperCase() && lettersOnly.length >= 4 && words.length <= 2;
  const isTitleCasePhrase = words.every(isTitleCaseWord);

  return isAllCapsWord || isTitleCasePhrase;
}

/**
 * Once Building No + Floor are stripped, the remainder is "Room name"
 * followed by telemetry (temperatures, counts, "- - - -" placeholders)
 * flattened into the same line. Collect the leading run of words as the
 * room, stopping at the first lone dash/decimal reading, a bare Y/N/F
 * sentinel flag (e.g. "Cleaner store Y Y N" — those are Sentinel Hot/Cold
 * inspection flags, not part of the room name), or a second consecutive
 * bare integer (the start of the telemetry block) — but keep a single
 * trailing bare integer as part of the room (e.g. "Flat 3").
 */
function extractRoom(tail: string): string {
  const tokens = tail.split(/\s+/).filter(Boolean);
  const roomTokens: string[] = [];
  let lastWasBareInteger = false;

  for (const token of tokens) {
    if (token === '-' || token === '–' || /^\d+\.\d+$/.test(token) || token === 'Y' || token === 'N' || token === 'F') {
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

function normalizeFloorKeyword(raw: string): string {
  return normalize(raw)
    .split(' ')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}

/** A room is only worth showing as its own location if it carries a real word, not a stray single-letter fragment ("F", "N") left over from a mid-cell line wrap. */
function isMeaningfulRoom(room: string | undefined): boolean {
  return Boolean(room) && /[A-Za-z]{3,}/.test(room as string);
}

/**
 * Real room names are written like "Staff Laundry" / "Guest Suite" — every
 * word capitalized. Wrapped inspector comments read like ordinary sentences
 * ("DHWS appeared to be accurate", "against the flow measurement, 2 x") —
 * mostly lowercase connector words. Used only for lines that didn't match
 * the [Building No] + [Floor] shape, where there's no other signal to tell
 * a genuine (if context-less) room from a stray wrapped comment line.
 */
function looksLikeRoomName(text: string): boolean {
  const words = text.split(/\s+/).map((word) => word.replace(/^[^A-Za-z]+/, '')).filter(Boolean);
  if (words.length === 0) {
    return false;
  }
  const capitalized = words.filter((word) => /^[A-Z]/.test(word)).length;
  return capitalized / words.length >= 0.5;
}

/** Matches a lone "<Building No> Lower" line — the "Ground" half of "Lower Ground" landed on the next physical line during copy/paste. */
const LOWER_GROUND_WRAP_PATTERN = /^(\d+[A-Za-z]?)\s+Lower$/i;

// ─────────────────────────────────────────────────────────────────────────
// Asset dictionary — expanded per the confidence-based validation pass.
// Each rule reports its own confidence tier: 100 = exact abbreviation/
// keyword match, 95 = strong text pattern.
// ─────────────────────────────────────────────────────────────────────────

interface AssetRule {
  assetType: string;
  confidence: number;
  source: string;
  pattern: RegExp;
}

const ASSET_RULES: AssetRule[] = [
  // Exact abbreviation / keyword matches (100%) — order matters where one
  // token is a substring of another (checked with \b so "IDWM" never also
  // satisfies the plain "DW" rule).
  { assetType: 'WC', confidence: 100, source: 'Detected from abbreviation WC', pattern: /\bWC\b/ },
  { assetType: 'Washing Machine', confidence: 100, source: 'Detected from abbreviation WM', pattern: /\bWM\b/ },
  { assetType: 'Bib Tap', confidence: 100, source: 'Detected from abbreviation BT', pattern: /\bBT\b/ },
  {
    assetType: 'Industrial Dishwasher',
    confidence: 100,
    source: 'Detected from abbreviation IDWM',
    pattern: /\bIDWM\b/,
  },
  { assetType: 'Dishwasher', confidence: 100, source: 'Detected from abbreviation DW', pattern: /\bDW\b/ },
  { assetType: 'Water Boiler', confidence: 100, source: 'Detected from abbreviation WB', pattern: /\bWB\b/ },
  { assetType: 'Water Boiler', confidence: 100, source: 'Detected from abbreviation W-B', pattern: /\bW-B\b/i },
  { assetType: 'TMV', confidence: 100, source: 'Detected from abbreviation TMV', pattern: /\bTMV\b/ },
  { assetType: 'Spray Outlet', confidence: 100, source: 'Detected from abbreviation SO', pattern: /\bSO\b/ },
  { assetType: 'Ice Machine', confidence: 100, source: 'Detected from abbreviation IM', pattern: /\bIM\b/ },
  { assetType: 'Wash Hand Basin', confidence: 100, source: 'Detected from abbreviation WHB', pattern: /\bWHB\b/ },
  {
    assetType: 'Cold Water Dispenser',
    confidence: 100,
    source: 'Detected from abbreviation CWF',
    pattern: /\bCWF\b/,
  },
  // Strong text patterns (95%) — a recognizable phrase rather than a bare code.
  {
    assetType: 'Spray Outlet',
    confidence: 95,
    source: 'Detected from pattern "Spray head"',
    pattern: /\bspray\s*head\b/i,
  },
  {
    assetType: 'Cold Water Dispenser',
    confidence: 95,
    source: 'Detected from pattern "Water Fountain"',
    pattern: /\bwater\s+fountain\b/i,
  },
  {
    assetType: 'Cold Water Dispenser',
    confidence: 95,
    source: 'Detected from pattern "Chilled Cold Water Dispenser"',
    pattern: /\bchilled\s+(?:cold\s+)?water\s+dispenser\b/i,
  },
  {
    assetType: 'Bath/Shower',
    confidence: 95,
    source: 'Detected from pattern Bath+SH',
    pattern: /\bBath\s*[+/]\s*SH\b/i,
  },
  { assetType: 'Bath/Shower', confidence: 95, source: 'Detected from pattern "Shower"', pattern: /\bshower\b/i },
  {
    assetType: 'Calorifier',
    confidence: 95,
    source: 'Detected from keyword Calorifier',
    pattern: /\bcalorifiers?\b/i,
  },
  {
    assetType: 'Panamatic',
    confidence: 95,
    source: 'Detected from keyword Panamatic',
    // Real customer sheets inconsistently spell this "Panamatic"/"Panomatic" — both accepted.
    pattern: /\bpan[ao]matic\b/i,
  },
];

/** Scans free text for every distinct known asset it contains (not just the first match) — required to support multi-asset rows like "SO, IDWM, W-B". */
function findAllAssetMatches(text: string): DetectedAsset[] {
  const found: DetectedAsset[] = [];
  const seen = new Set<string>();

  for (const rule of ASSET_RULES) {
    if (seen.has(rule.assetType)) {
      continue;
    }
    if (rule.pattern.test(text)) {
      found.push({ assetType: rule.assetType, confidence: rule.confidence, source: rule.source });
      seen.add(rule.assetType);
    }
  }

  return found;
}

/**
 * Same scan as `findAllAssetMatches`, but only trusts comma-separated
 * chunks that read like shorthand codes ("WC", "Bath+SH head") rather than
 * a descriptive sentence ("Poor flow from hot via TMV"). Without this, a
 * bare mention of an abbreviation inside an inspector's comment about a
 * *different* location gets misread as "this room has that asset" — reuses
 * the same capitalization-ratio heuristic as `looksLikeRoomName` since
 * both problems are "shorthand vs. prose" in nature.
 */
function findAllAssetMatchesInPlausibleSegments(text: string): DetectedAsset[] {
  const found: DetectedAsset[] = [];
  const seen = new Set<string>();

  for (const segment of text.split(',')) {
    if (!looksLikeRoomName(segment)) {
      continue;
    }
    for (const rule of ASSET_RULES) {
      if (seen.has(rule.assetType)) {
        continue;
      }
      if (rule.pattern.test(segment)) {
        found.push({ assetType: rule.assetType, confidence: rule.confidence, source: rule.source });
        seen.add(rule.assetType);
      }
    }
  }

  return found;
}

interface AssetScanResult {
  assets: DetectedAsset[];
  quantity?: { value: number; confidence: number; source: string };
}

/**
 * Resolves both the asset(s) and any quantity mentioned in one line of
 * text. A "N x <words>" (or reversed "<words> x N") marker is the
 * strongest, most specific signal, so it's tried first and — when it
 * successfully classifies to one known asset — wins outright rather than
 * also running the general multi-asset scan on the same text. Otherwise
 * every distinct asset the text contains is returned; when a row mentions
 * 2+ different assets with no explicit count, the number of distinct
 * assets found becomes the quantity (e.g. "SO, IDWM, W-B" → 3).
 */
function scanAssetsAndQuantity(text: string): AssetScanResult {
  const forwardQuantityMatch = text.match(/(\d+)\s*[xX]\s+([A-Za-z][A-Za-z\s]*)/);
  if (forwardQuantityMatch) {
    const quantity = Number.parseInt(forwardQuantityMatch[1], 10);
    const matches = findAllAssetMatches(forwardQuantityMatch[2]);
    if (matches.length === 1) {
      return {
        assets: matches,
        quantity: { value: quantity, confidence: 95, source: 'Quantity extracted from description' },
      };
    }
  }

  const reversedQuantityMatch = text.match(/\b([A-Za-z][A-Za-z]*)\s+[xX]\s+(\d+)\b/);
  if (reversedQuantityMatch) {
    const quantity = Number.parseInt(reversedQuantityMatch[2], 10);
    const matches = findAllAssetMatches(reversedQuantityMatch[1]);
    if (matches.length === 1) {
      return {
        assets: matches,
        quantity: { value: quantity, confidence: 95, source: 'Quantity extracted from description' },
      };
    }
  }

  const assets = findAllAssetMatchesInPlausibleSegments(text);
  if (assets.length > 1) {
    return {
      assets,
      quantity: {
        value: assets.length,
        confidence: Math.min(...assets.map((asset) => asset.confidence)),
        source: 'Count of distinct assets detected in row',
      },
    };
  }

  return { assets };
}

// ─────────────────────────────────────────────────────────────────────────
// Row assembly — extraction output, tagged with confidence. Fields that
// can't be confidently determined are set to null rather than guessed.
// ─────────────────────────────────────────────────────────────────────────

interface WorkingRow {
  rowNumber: number;
  building: FieldConfidence<string>;
  buildingNumber: FieldConfidence<string>;
  floor: FieldConfidence<string>;
  room: FieldConfidence<string>;
  assetType: FieldConfidence<string>;
  detectedAssets?: DetectedAsset[];
  quantity: FieldConfidence<number>;
  rawText: string;
  /** Accumulates every merged wrapped-line fragment so a late-arriving asset mention can be re-scanned against the full text. */
  assetScanText: string;
}

function applyAssetScan(row: WorkingRow): void {
  const scan = scanAssetsAndQuantity(row.assetScanText);

  if (scan.assets.length === 0) {
    row.assetType = { value: null, confidence: 30, source: 'No identifiable asset type detected' };
    row.detectedAssets = undefined;
  } else if (scan.assets.length === 1) {
    const [only] = scan.assets;
    row.assetType = { value: only.assetType, confidence: only.confidence, source: only.source };
    row.detectedAssets = undefined;
  } else {
    row.assetType = {
      value: 'Multiple Assets',
      confidence: Math.min(...scan.assets.map((asset) => asset.confidence)),
      source: `Multiple assets detected: ${scan.assets.map((asset) => asset.assetType).join(', ')}`,
    };
    row.detectedAssets = scan.assets;
  }

  row.quantity = scan.quantity
    ? { value: scan.quantity.value, confidence: scan.quantity.confidence, source: scan.quantity.source }
    : { value: null, confidence: 0, source: 'No quantity mentioned' };
}

function buildDuplicateKey(row: WorkingRow): string {
  return [row.building.value, row.buildingNumber.value, row.floor.value, row.room.value, row.assetType.value]
    .map((value) => (value ?? '').toLowerCase().trim())
    .join('|');
}

/**
 * Parses pasted building-register lines into clean, review-ready rows.
 * `lines` is the row-array shape already produced by `parsePastedText`
 * (each entry is one pasted line, possibly pre-split into cells by a
 * detected delimiter) — cells are joined back into one line of text here,
 * since register data is fundamentally line-based free text rather than a
 * strict column grid.
 *
 * Plain-text copy/paste from Excel/PDF often hard-wraps a single logical
 * row across several physical lines (a temperature reading, a trailing
 * comment, or a split "Lower" / "Ground" floor name each landing on their
 * own line). Two things keep that from producing bogus rows:
 *  - Everything before the first line that actually matches the
 *    [Building No] + [Floor] + [Room] shape is treated as header/glossary
 *    preamble and dropped silently — a real register always starts with
 *    that shape, so nothing meaningful can precede it.
 *  - Once inside real data, a line with no building no, no floor, no
 *    meaningful room and no asset/quantity signal is folded into the
 *    previous row's raw text (and re-scanned for assets) instead of
 *    becoming its own "empty" row.
 */
export function parsePastedRegister(lines: string[][], address: string): PasteParseResult {
  const workingRows: WorkingRow[] = [];
  let currentBuilding: string | undefined;
  let previousRow: WorkingRow | undefined;
  let seenFirstDataLine = false;
  let pendingBuildingNumber: string | undefined;

  lines.forEach((cells, index) => {
    const rawLine = normalize(cells.filter(Boolean).join(' '));
    if (!rawLine) {
      return;
    }

    if (isSectionHeading(rawLine)) {
      currentBuilding = rawLine;
      previousRow = undefined;
      pendingBuildingNumber = undefined;
      return;
    }

    if (isNoiseLine(rawLine)) {
      return;
    }

    const lowerGroundWrap = rawLine.match(LOWER_GROUND_WRAP_PATTERN);
    if (lowerGroundWrap) {
      pendingBuildingNumber = lowerGroundWrap[1];
      return;
    }

    const match = rawLine.match(REGISTER_LINE_PATTERN);
    let buildingNumberValue = match?.[1];
    let floorValue = match ? normalizeFloorKeyword(match[2]) : undefined;
    const tail = match ? match[3] : rawLine;

    const resumingLowerGround =
      Boolean(pendingBuildingNumber) && floorValue?.toLowerCase() === 'ground' && !buildingNumberValue;
    if (resumingLowerGround) {
      buildingNumberValue = pendingBuildingNumber;
      floorValue = 'Lower Ground';
    }
    pendingBuildingNumber = undefined;

    if (!seenFirstDataLine) {
      // A real register always starts with a [Building No] + [Floor] line —
      // anything before that first match is header/glossary preamble
      // (however word-like it may look) and is dropped silently rather than
      // risking a fabricated "location".
      if (!match) {
        return;
      }
      seenFirstDataLine = true;
    }

    const roomValue = extractRoom(tail) || undefined;
    const roomCountsAsStructure = match
      ? isMeaningfulRoom(roomValue)
      : isMeaningfulRoom(roomValue) && looksLikeRoomName(roomValue ?? '');
    const hasLocationStructure = Boolean(buildingNumberValue) || Boolean(floorValue) || roomCountsAsStructure;

    if (!hasLocationStructure) {
      // No location info at all on this line — either pure telemetry/noise,
      // or an isolated trailing asset abbreviation ("WM" on its own line)
      // that belongs to the previous row rather than describing a new one.
      if (previousRow) {
        previousRow.rawText = `${previousRow.rawText} / ${rawLine}`;
        previousRow.assetScanText = `${previousRow.assetScanText} ${tail}`;
        applyAssetScan(previousRow);
      }
      return;
    }

    const row: WorkingRow = {
      rowNumber: index + 1,
      building: currentBuilding
        ? { value: currentBuilding, confidence: 70, source: 'Building inherited from previous section heading' }
        : { value: null, confidence: 0, source: 'No section heading encountered yet' },
      buildingNumber: buildingNumberValue
        ? {
            value: buildingNumberValue,
            confidence: resumingLowerGround ? 70 : 95,
            source: resumingLowerGround
              ? 'Reasonable inference from a wrapped "Lower Ground" line across two physical lines'
              : 'Extracted from raw text alongside floor',
          }
        : { value: null, confidence: 0, source: 'No building number found in raw text' },
      floor: floorValue
        ? {
            value: floorValue,
            confidence: resumingLowerGround ? 70 : 95,
            source: resumingLowerGround
              ? 'Reasonable inference from a wrapped "Lower Ground" line across two physical lines'
              : 'Extracted from raw text',
          }
        : { value: null, confidence: 20, source: 'Floor keyword not found in raw text' },
      room: roomValue
        ? { value: roomValue, confidence: 95, source: 'Extracted from raw text' }
        : { value: null, confidence: 20, source: 'Room could not be determined from raw text' },
      assetType: { value: null, confidence: 30, source: 'No identifiable asset type detected' },
      quantity: { value: null, confidence: 0, source: 'No quantity mentioned' },
      rawText: rawLine,
      assetScanText: tail,
    };
    applyAssetScan(row);

    workingRows.push(row);
    previousRow = row;
  });

  // Duplicate detection is a review signal, never an automatic removal —
  // sheet-aware by construction here since this engine only ever handles
  // building-register-style pasted data (Building + Building No + Floor +
  // Room + Asset Type identifies a genuine physical asset).
  const duplicateRowNumbers = new Set<number>();
  const seenKeys = new Map<string, number>();
  workingRows.forEach((row) => {
    const key = buildDuplicateKey(row);
    if (key.replace(/\|/g, '').trim() === '') {
      return;
    }
    if (seenKeys.has(key)) {
      duplicateRowNumbers.add(row.rowNumber);
    } else {
      seenKeys.set(key, row.rowNumber);
    }
  });

  const rows = workingRows.map((row) => buildFinalRow(row, address, duplicateRowNumbers.has(row.rowNumber)));

  const distinctLocations = new Set(
    rows.map((row) =>
      [row.building.value, row.buildingNumber.value, row.floor.value, row.room.value]
        .map((v) => (v ?? '').toLowerCase())
        .join('|'),
    ),
  );

  return {
    rows,
    summary: {
      totalRows: rows.length,
      assetsIdentified: rows.filter((row) => row.assetType.value !== null).length,
      distinctLocations: distinctLocations.size,
      readyCount: rows.filter((row) => row.importStatus === 'READY').length,
      reviewRequiredCount: rows.filter((row) => row.importStatus === 'REVIEW_REQUIRED').length,
      blockedCount: rows.filter((row) => row.importStatus === 'BLOCKED').length,
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────
// Validation layer — confidence → issue classification → import readiness.
// This is the part the request asked to change: everything above stays
// exactly the same extraction behaviour that was already working.
// ─────────────────────────────────────────────────────────────────────────

function buildFinalRow(row: WorkingRow, address: string, isDuplicate: boolean): PastedAssetRow {
  const issues: PasteIssue[] = [];
  const parsingNotes: string[] = [];

  if (!address.trim()) {
    issues.push({ severity: 'critical', message: 'Missing address' });
  }
  if (row.floor.value === null) {
    issues.push({ severity: 'critical', message: 'Missing floor' });
  } else {
    parsingNotes.push('Floor extracted from raw text');
  }
  if (row.room.value === null) {
    issues.push({ severity: 'critical', message: 'Missing room' });
  }
  if (row.assetType.value === null) {
    issues.push({ severity: 'critical', message: 'Asset type could not be confidently classified' });
  } else if (row.detectedAssets && row.detectedAssets.length > 1) {
    issues.push({ severity: 'warning', message: 'Multiple assets detected in single row' });
  } else if (row.assetType.confidence >= 100) {
    // An exact abbreviation/keyword match is reliable enough on its own —
    // it's surfaced as a transparent note rather than forcing a review.
    parsingNotes.push('Asset detected from abbreviation');
  } else {
    // A pattern-based inference (not a bare code) is a softer signal and
    // does warrant a quick human sign-off.
    issues.push({ severity: 'warning', message: 'Asset type inferred from text pattern' });
  }
  if (row.building.value !== null) {
    // Inheriting the building from the last section heading is the
    // expected, common case for these registers, not a per-row uncertainty.
    parsingNotes.push('Building inherited from previous section');
  }
  if (row.quantity.value !== null) {
    parsingNotes.push(`Quantity detected: ${row.quantity.value}`);
  }
  if (isDuplicate) {
    issues.push({ severity: 'warning', message: 'Possible duplicate record' });
  }

  const importStatus: ImportStatus = issues.some((issue) => issue.severity === 'critical')
    ? 'BLOCKED'
    : issues.some((issue) => issue.severity === 'warning')
      ? 'REVIEW_REQUIRED'
      : 'READY';

  return {
    sheetName: 'Pasted Data',
    rowNumber: row.rowNumber,
    address,
    building: row.building,
    buildingNumber: row.buildingNumber,
    floor: row.floor,
    room: row.room,
    assetType: row.assetType,
    detectedAssets: row.detectedAssets,
    quantity: row.quantity,
    rawText: row.rawText,
    importStatus,
    issues,
    parsingNotes,
  };
}

