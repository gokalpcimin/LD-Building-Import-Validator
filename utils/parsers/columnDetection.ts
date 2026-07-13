import type { SheetType } from '../../types';

export function findColumn(headers: string[], keywords: string[]): string {
  const normalized = headers.map((header) => header.toLowerCase().trim());

  for (const keyword of keywords) {
    const index = normalized.findIndex((header) => header.includes(keyword));
    if (index >= 0) {
      return headers[index];
    }
  }

  return '';
}

export function getColumnValue(
  row: string[],
  headers: string[],
  columnName: string,
): string {
  const columnIndex = headers.indexOf(columnName);
  if (columnIndex === -1) {
    return '';
  }
  return row[columnIndex]?.trim() ?? '';
}

export function getLocationColumn(sheetType: SheetType, headers: string[]): string {
  switch (sheetType) {
    case 'monthly-outlet':
      return (
        findColumn(headers, ['outlet/location', 'outlet location']) ||
        findColumn(headers, ['location', 'outlet'])
      );
    case 'annual-tmv':
      return (
        findColumn(headers, ['tmv / location', 'tmv/location', 'tmv location']) ||
        findColumn(headers, ['location', 'tmv'])
      );
    case 'annual-expansion-vessel':
      return (
        findColumn(headers, [
          'expansion vessel / location',
          'expansion vessel/location',
        ]) || findColumn(headers, ['location', 'vessel', 'expansion'])
      );
    default:
      return findColumn(headers, ['location', 'outlet', 'name', 'position']);
  }
}

export function getAssetColumn(headers: string[]): string {
  return findColumn(headers, ['asset type', 'asset', 'equipment', 'device', 'type']);
}

export function getAddressColumn(headers: string[]): string {
  return findColumn(headers, ['building address', 'company address', 'address']);
}
