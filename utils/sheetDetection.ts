import type { SheetType } from '../types';

const SHEET_TYPE_LABELS: Record<SheetType, string> = {
  'cover-page': 'Cover Page',
  'monthly-outlet': 'Monthly Outlet',
  'annual-tmv': 'Annual TMVs',
  'annual-expansion-vessel': 'Expansion Vessels',
  'building-register': 'Asset Register',
  unknown: 'Unknown Sheet',
};

export function classifySheet(sheetName: string): SheetType {
  const lower = sheetName.toLowerCase();

  if (lower.includes('cover')) {
    return 'cover-page';
  }
  // Checked before the generic "outlet"/"monthly" match below: an inventory
  // register (e.g. "Outlet & Temperature Register") also contains the word
  // "outlet", but it is asset inventory data, not a recurring historical
  // monitoring log — it needs different parsing and duplicate-detection
  // rules (see dataSheetParser.ts / validationEngine.ts).
  if (
    lower.includes('register') ||
    lower.includes('asset inventory') ||
    lower.includes('inventory')
  ) {
    return 'building-register';
  }
  if (lower.includes('outlet') || lower.includes('monthly')) {
    return 'monthly-outlet';
  }
  if (lower.includes('tmv')) {
    return 'annual-tmv';
  }
  if (lower.includes('expansion') || lower.includes('expension') || lower.includes('vessel')) {
    return 'annual-expansion-vessel';
  }

  return 'unknown';
}

export function getSheetTypeLabel(sheetType: SheetType): string {
  return SHEET_TYPE_LABELS[sheetType];
}
