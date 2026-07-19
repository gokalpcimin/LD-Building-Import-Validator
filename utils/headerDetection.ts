const HEADER_KEYWORDS = [
  'date',
  'name',
  'outlet',
  'location',
  'comments',
  'address',
  'asset',
  'floor',
  'room',
  'unit',
  'temperature',
  'type',
  'device',
  'position',
  'building',
  'site',
  'property',
];

const STRONG_HEADER_KEYWORDS = ['date', 'name', 'outlet/location', 'outlet', 'location'];

const DEFAULT_SCAN_ROWS = 5;
const MIN_HEADER_SCORE = 3;

function normalizeCell(cell: string): string {
  return cell.replace(/\s+/g, ' ').trim();
}

function scoreHeaderRow(row: string[]): number {
  const cells = row.map(normalizeCell).filter(Boolean);

  if (cells.length < 2) {
    return 0;
  }

  let score = 0;

  for (const cell of cells) {
    const lower = cell.toLowerCase();

    for (const keyword of STRONG_HEADER_KEYWORDS) {
      if (lower.includes(keyword)) {
        score += 3;
      }
    }

    for (const keyword of HEADER_KEYWORDS) {
      if (lower.includes(keyword)) {
        score += 1;
      }
    }
  }

  if (cells.length >= 3) {
    score += 2;
  }

  if (cells.length >= 5) {
    score += 2;
  }

  return score;
}

interface HeaderDetectionResult {
  index: number;
  /** False when no scanned row scored high enough to be confidently a real header row. */
  confident: boolean;
}

function detectHeaderRow(
  rows: string[][],
  maxScanRows = DEFAULT_SCAN_ROWS,
): HeaderDetectionResult {
  const scanLimit = Math.min(maxScanRows, rows.length);
  let bestIndex = 0;
  let bestScore = 0;

  for (let index = 0; index < scanLimit; index += 1) {
    const score = scoreHeaderRow(rows[index] ?? []);

    if (score > bestScore) {
      bestScore = score;
      bestIndex = index;
    }
  }

  if (bestScore < MIN_HEADER_SCORE) {
    return { index: 0, confident: false };
  }

  return { index: bestIndex, confident: true };
}

export function detectHeaderRowIndex(
  rows: string[][],
  maxScanRows = DEFAULT_SCAN_ROWS,
): number {
  return detectHeaderRow(rows, maxScanRows).index;
}

function isSectionDividerRow(row: string[]): boolean {
  const cells = row.map(normalizeCell).filter(Boolean);

  if (cells.length === 0) {
    return true;
  }

  if (cells.length === 1) {
    const value = cells[0];
    return (
      /^unit\s+[\w\d/]+/i.test(value) ||
      /^floor\s+/i.test(value) ||
      /^section\s+/i.test(value) ||
      value.length < 40
    );
  }

  return false;
}

/**
 * Extracts unit from a section-divider row like ["Unit 3", "", ...] or
 * ["Unit 10- The Christy Estate", "", ...] — these sit above outlet rows and
 * are not repeated inside Outlet/Location cells.
 */
export function extractUnitDividerValue(row: string[]): string | null {
  const cells = row.map(normalizeCell).filter(Boolean);
  if (cells.length !== 1) {
    return null;
  }

  const match = cells[0].match(/^unit\s+([\w\d/]+)(?:\s*[-–]\s*(.+))?$/i);
  if (!match) {
    return null;
  }

  const id = match[1];
  const suffix = match[2]?.trim();
  return suffix ? `Unit ${id}- ${suffix}` : `Unit ${id}`;
}

/**
 * Column-header words/fragments and note labels that can end up as their own
 * single-cell "row" when a source table's wrapped header text or footnotes
 * get flattened into plain lines during copy/paste. These must never be
 * mistaken for a real area/section heading like "CROFTERS".
 */
const NON_LOCATION_HEADING_WORDS = new Set([
  'building no',
  'building number',
  'floor',
  'location/barcode',
  'location',
  'barcode',
  'sentinel hot',
  'sentinel cold',
  'sentinel asset',
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
  // Bare floor names — these describe a Floor, not a building/area group.
  'ground',
  'lower ground',
  'first',
  'second',
  'third',
  'fourth',
  'fifth',
  'basement',
  'lower',
  'upper',
  'mezzanine',
  'penthouse',
]);

function isTitleCaseWord(word: string): boolean {
  return /^[A-Z][a-z'’-]*$/.test(word);
}

function looksLikeAreaHeading(value: string): boolean {
  if (/\d/.test(value)) {
    return false;
  }
  if (/[:.]/.test(value)) {
    return false;
  }

  const words = value.split(/\s+/);
  if (words.length > 5) {
    return false;
  }
  if (NON_LOCATION_HEADING_WORDS.has(value.toLowerCase())) {
    return false;
  }

  // Real area/building group names read as ALL CAPS (e.g. "CROFTERS",
  // "BROMFORD") or Title Case phrases where every word starts with a
  // capital (e.g. "Bracken Close", "Heather Court") — not abbreviation
  // codes like "WM"/"DW" or lowercase-heavy sentence fragments.
  const lettersOnly = value.replace(/[^A-Za-z]/g, '');
  const isAllCapsWord = value === value.toUpperCase() && lettersOnly.length >= 4 && words.length <= 2;
  const isTitleCasePhrase = words.every(isTitleCaseWord);

  return isAllCapsWord || isTitleCasePhrase;
}

/** Extracts generic area/context headings like "CROFTERS" or "Bracken Close". */
export function extractSectionDividerValue(row: string[]): string | null {
  const cells = row.map(normalizeCell).filter(Boolean);
  if (cells.length !== 1) {
    return null;
  }

  const value = cells[0];
  if (value.length === 0 || value.length >= 40) {
    return null;
  }
  if (/^(?:unit|floor|section)\s+/i.test(value)) {
    return null;
  }
  if (/^(?:ground|first|second|third|\d+(?:st|nd|rd|th))\s+floor$/i.test(value)) {
    return null;
  }
  if (!looksLikeAreaHeading(value)) {
    return null;
  }

  return value;
}

/**
 * Lines that are documentation/instructions rather than asset data — e.g.
 * an "Abbreviations: ..." glossary line or a walk-through note — flattened
 * into their own row by a messy copy/paste. Any row whose only meaningful
 * text matches this should never become a fabricated asset row.
 */
const NOTE_LINE_PATTERNS: RegExp[] = [
  /^abbreviations\s*:/i,
  /^(?:notes?|key|instructions?)\s*:/i,
  /^begin\s+the\s+walk\s*[- ]?through\b/i,
];

export function isNonDataNoteLine(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) {
    return false;
  }
  if (NOTE_LINE_PATTERNS.some((pattern) => pattern.test(trimmed))) {
    return true;
  }

  // A long, digit-free sentence reads like prose (a note/instruction), not
  // an asset location — real data rows almost always carry a count, reading,
  // or measurement somewhere in the line.
  const wordCount = trimmed.split(/\s+/).length;
  return wordCount > 10 && !/\d/.test(trimmed);
}

function padRow(row: string[], length: number): string[] {
  const padded = row.map(normalizeCell);

  while (padded.length < length) {
    padded.push('');
  }

  return padded.slice(0, length);
}

export function normalizeSheetData(rawRows: string[][]): {
  data: string[][];
  headerRowIndex: number;
  /** False when no scanned row scored high enough to be confidently a real header row. */
  headerConfident: boolean;
  /** For each row in `data` (excluding the header row), the original 0-based index within `rawRows`. */
  sourceRowIndices: number[];
  /** Unit inherited from the most recent "Unit X" section-divider row above each data row. */
  rowUnits: (string | undefined)[];
  /** Generic section/context inherited from heading rows, e.g. "CROFTERS". */
  rowSections: (string | undefined)[];
} {
  if (rawRows.length === 0) {
    return {
      data: [],
      headerRowIndex: 0,
      headerConfident: false,
      sourceRowIndices: [],
      rowUnits: [],
      rowSections: [],
    };
  }

  const { index: headerRowIndex, confident: headerConfident } = detectHeaderRow(rawRows);
  const headerRow = (rawRows[headerRowIndex] ?? []).map(normalizeCell);

  const dataRows = rawRows.slice(headerRowIndex + 1);
  const maxColumns = Math.max(
    headerRow.length,
    ...dataRows.map((row) => row.length),
    1,
  );

  const headers = padRow(headerRow, maxColumns);
  const normalizedDataRows: string[][] = [];
  const sourceRowIndices: number[] = [];
  const rowUnits: (string | undefined)[] = [];
  const rowSections: (string | undefined)[] = [];
  let currentUnit: string | undefined;
  let currentSection: string | undefined;

  dataRows.forEach((row, offset) => {
    const padded = padRow(row, maxColumns);
    if (!padded.some((cell) => cell.length > 0)) {
      return;
    }

    const unitDivider = extractUnitDividerValue(padded);
    if (unitDivider) {
      currentUnit = unitDivider;
      return;
    }

    const sectionDivider = extractSectionDividerValue(padded);
    if (sectionDivider) {
      currentSection = sectionDivider;
      return;
    }

    if (isSectionDividerRow(padded)) {
      return;
    }

    const meaningfulText = padded.filter((cell) => cell.length > 0).join(' ');
    if (isNonDataNoteLine(meaningfulText)) {
      return;
    }

    normalizedDataRows.push(padded);
    sourceRowIndices.push(headerRowIndex + 1 + offset);
    rowUnits.push(currentUnit);
    rowSections.push(currentSection);
  });

  return {
    data: [headers, ...normalizedDataRows],
    headerRowIndex,
    headerConfident,
    sourceRowIndices,
    rowUnits,
    rowSections,
  };
}
