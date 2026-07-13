/**
 * Picks a delimiter that appears consistently across the pasted lines,
 * instead of guessing from the first line alone. Genuine Excel/Sheets
 * copies are always Tab-separated, so Tab wins whenever it shows up
 * anywhere. Comma/semicolon are only used as a fallback when most lines
 * agree on them — otherwise a stray comma inside a comment or note
 * sentence would shred every unrelated line into bogus columns. If no
 * delimiter is reliably present, each line is kept as a single cell
 * rather than being incorrectly split.
 */
export function detectDelimiter(lines: string[]): string | null {
  if (lines.some((line) => line.includes('\t'))) {
    return '\t';
  }

  for (const delimiter of [';', ',']) {
    const linesWithDelimiter = lines.filter((line) => line.includes(delimiter)).length;
    if (linesWithDelimiter / lines.length >= 0.5) {
      return delimiter;
    }
  }

  return null;
}

export function parsePastedText(text: string): string[][] {
  const normalized = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  const lines = normalized
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  if (lines.length === 0) {
    return [];
  }

  const delimiter = detectDelimiter(lines);

  return lines
    .map((line) => (delimiter ? line.split(delimiter).map((cell) => cell.trim()) : [line]))
    .filter((row) => row.some((cell) => cell.length > 0));
}
