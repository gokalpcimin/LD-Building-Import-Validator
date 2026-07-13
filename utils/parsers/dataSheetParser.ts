import type { AssetType, ImportReadyRow, ValidationError, SheetType } from '../../types';
import { findHeaderByRole } from '../columnMapping';
import { detectAssetType, extractAllAssets } from '../assetDetector';
import { parseBuildingRegisterLine, parseLocationText } from '../locationParser';
import { validateRow } from '../validationEngine';
import { getAssetColumn, getColumnValue, getLocationColumn } from './columnDetection';
import type { ParserContext, ParserResult } from './types';
import { normalizeSheetData } from '../headerDetection';

function isEmptyRow(row: string[]): boolean {
  return !row.some((cell) => cell.trim().length > 0);
}

function isMeaningfulValue(value: string): boolean {
  const normalized = value.trim();
  return normalized.length > 0 && normalized !== '-';
}

function formatUnitValue(value: string): string {
  const trimmed = value.trim();
  return isMeaningfulValue(trimmed) ? trimmed : '';
}

function formatBuildingNoValue(value: string): string {
  return formatUnitValue(value);
}

function combineUnitContext(section: string | undefined, unit: string): string {
  if (!section) {
    return unit;
  }
  if (!unit) {
    return section;
  }
  if (unit.toLowerCase().includes(section.toLowerCase())) {
    return unit;
  }
  return `${section} / ${unit}`;
}

/** Which sheets/rows get register-specific parsing: hierarchical text decomposition, multi-asset extraction, inventory-style duplicate keys. */
function isRegisterStyleSheet(context: ParserContext): boolean {
  return context.sheetType === 'building-register' || context.sheetName === 'Pasted Data';
}

type DuplicateCategory = 'inventory' | 'monitoring' | 'none';

/**
 * Inventory sheets (asset registers) flag a duplicate when the same asset
 * at the same location repeats — that's almost always a data-entry mistake.
 * Monitoring/history sheets (e.g. Monthly Outlet) legitimately repeat the
 * same location every inspection cycle, so only an exact repeat of the
 * *entire* source row (same date, readings, comments — not just location)
 * is worth flagging there.
 */
function getDuplicateCategory(sheetType: SheetType, isRegisterStyle: boolean): DuplicateCategory {
  if (sheetType === 'monthly-outlet') {
    return 'monitoring';
  }
  if (sheetType === 'building-register' || isRegisterStyle) {
    return 'inventory';
  }
  return 'none';
}

function buildInventoryDuplicateKey(row: ImportReadyRow): string {
  const parts = [row.address, row.buildingNo || row.unit, row.floor, row.room, row.assetType];
  return parts.map((value) => (value ?? '').toString().toLowerCase().trim()).join('|');
}

/** Numeric asset-count columns (Sink/Whb/Shower/TMVs No.) in register-style sheets — one column per asset type, cell value is the count at that location. */
function getAssetCountType(header: string): AssetType | undefined {
  const lower = header.toLowerCase().replace(/\s+/g, ' ').trim();

  if (lower === 'sink' || lower === 'whb' || lower.includes('wash hand basin')) {
    return 'WHB';
  }
  if (lower === 'shower' || lower.includes('spray outlets')) {
    return 'Shower';
  }
  if (/^tmvs?\s*(?:no\.?|number)?$/.test(lower) || lower.includes('tmv')) {
    return 'TMV';
  }

  return undefined;
}

function parseAssetCount(value: string): number {
  const normalized = value.trim();
  if (!isMeaningfulValue(normalized)) {
    return 0;
  }

  const numericMatch = normalized.match(/\d+/);
  if (numericMatch) {
    return Number.parseInt(numericMatch[0], 10);
  }

  return /^[yY]$/.test(normalized) ? 1 : 0;
}

interface AssetRowPlan {
  assetType: AssetType;
  quantity?: number;
  detectedFrom?: 'count-column' | 'abbreviation' | 'text';
  matchedText?: string;
}

/**
 * Combines explicit numeric asset-count columns with free-text/abbreviation
 * scanning (location text, room, and any trailing comments/codes) into one
 * list of distinct assets actually present at this row — so "Bath+SH head,
 * WC" yields both Shower and WC, and "2 x Newark Calorifiers" yields one
 * Calorifier row with quantity 2 instead of being dropped or merged away.
 */
function planAssetRows(countMatches: AssetRowPlan[], text: string): AssetRowPlan[] {
  const claimed = new Set(countMatches.map((m) => m.assetType));
  const textMatches = extractAllAssets(text)
    .filter((match) => !claimed.has(match.assetType))
    .map<AssetRowPlan>((match) => ({
      assetType: match.assetType,
      quantity: match.quantity,
      detectedFrom: match.isAbbreviation ? 'abbreviation' : 'text',
      matchedText: match.matchedText,
    }));

  return [...countMatches, ...textMatches];
}

export function parseDataSheet(
  rawData: string[][],
  context: ParserContext,
  interpretationPrefix: string,
): ParserResult {
  const { data, headerRowIndex, headerConfident, sourceRowIndices, rowUnits, rowSections } =
    normalizeSheetData(rawData);
  const headers = (data[0] ?? []).map((header) => header.trim());
  const dataRows = data.slice(1);
  const mapping = context.columnMapping;
  const isRegisterStyle = isRegisterStyleSheet(context);
  // Asset-count columns (Sink/Whb/TMVs No. etc.) only make sense once we're
  // confident the detected header row is real — otherwise header cells are
  // guesswork and would produce fabricated asset rows. Free-text/abbreviation
  // scanning has no such dependency, since it reads the row content itself.
  const useAssetCountColumns = isRegisterStyle && headerConfident;

  // Explicit columns from the confirmed mapping win; fall back to keyword
  // auto-detection when no mapping was supplied (e.g. direct parser calls).
  const locationColumn =
    findHeaderByRole(mapping, 'location') ?? (mapping ? '' : getLocationColumn(context.sheetType, headers));
  const assetColumn =
    findHeaderByRole(mapping, 'assetType') ?? (mapping ? '' : getAssetColumn(headers));
  const floorColumn = findHeaderByRole(mapping, 'floor');
  const roomColumn = findHeaderByRole(mapping, 'room');
  const unitColumn = findHeaderByRole(mapping, 'unit');
  const buildingNoColumn = findHeaderByRole(mapping, 'buildingNo');
  const addressColumn = findHeaderByRole(mapping, 'address');
  const assetCountColumns = useAssetCountColumns
    ? headers
        .map((header) => ({ header, assetType: getAssetCountType(header) }))
        .filter((column): column is { header: string; assetType: AssetType } =>
          Boolean(column.header && column.assetType),
        )
    : [];

  // Only warn about a missing Unit when this sheet actually has a Unit
  // concept at all (an explicit Unit column, or "Unit X" section-divider
  // rows) — a register sheet whose hierarchy is Building No → Floor → Room
  // simply doesn't have units, and shouldn't be penalized for lacking one.
  const hasUnitSource = Boolean(unitColumn) || rowUnits.some(Boolean);

  const duplicateCategory = getDuplicateCategory(context.sheetType, isRegisterStyle);

  const rows: ImportReadyRow[] = [];
  const errors: ValidationError[] = [];
  const duplicateKeys: (string | null)[] = [];

  const pushRow = (row: ImportReadyRow, monitoringKeySource: string, notes: ValidationError[] = []) => {
    const rowIdx = rows.length;
    rows.push(row);

    const key =
      duplicateCategory === 'inventory'
        ? buildInventoryDuplicateKey(row)
        : duplicateCategory === 'monitoring'
          ? monitoringKeySource.toLowerCase().trim() || null
          : null;
    duplicateKeys.push(key);

    errors.push(
      ...validateRow(row, rowIdx, {
        sheetName: context.sheetName,
        sheetType: context.sheetType,
        hasUnitSource,
      }),
      ...notes.map((note) => ({ ...note, rowIdx })),
    );
  };

  dataRows.forEach((row, rowIdx) => {
    if (isEmptyRow(row)) {
      return;
    }

    const locationText = locationColumn ? getColumnValue(row, headers, locationColumn) : '';
    const assetText = assetColumn ? getColumnValue(row, headers, assetColumn) : '';
    const explicitFloor = floorColumn ? getColumnValue(row, headers, floorColumn) : '';
    const explicitRoom = roomColumn ? getColumnValue(row, headers, roomColumn) : '';
    const explicitUnit = unitColumn ? formatUnitValue(getColumnValue(row, headers, unitColumn)) : '';
    const explicitBuildingNo = buildingNoColumn
      ? formatBuildingNoValue(getColumnValue(row, headers, buildingNoColumn))
      : '';
    const explicitAddress = addressColumn ? getColumnValue(row, headers, addressColumn) : '';
    const rawRowText = row.filter(isMeaningfulValue).join(' / ');

    if (
      !locationText &&
      !assetText &&
      !explicitFloor &&
      !explicitRoom &&
      !explicitUnit &&
      !explicitBuildingNo &&
      !rawRowText
    ) {
      return;
    }

    const parsedLocation = parseLocationText(locationText);
    // Register rows often flatten "[Building No] [Floor] [Room] ...telemetry... [code]"
    // into one cell — decompose it so Room isn't left as the entire raw string.
    const registerLine = isRegisterStyle ? parseBuildingRegisterLine(rawRowText) : undefined;

    const inheritedUnit = rowUnits[rowIdx];
    const inheritedSection = isRegisterStyle ? rowSections[rowIdx] : undefined;

    // For register-style rows, the [Building No][Floor][Room] decomposition
    // is far more precise than the generic parser (which, lacking a
    // recognizable "Unit ... Floor ..." pattern, would otherwise fall back
    // to treating the *entire* flattened line as the room) — so it wins
    // whenever it successfully matched. Otherwise fall back to the generic
    // location-text parser (used by Monthly Outlet's "Unit 3 - 1st Floor
    // Finance Office" style text).
    const floorFromRegisterLine = !explicitFloor && Boolean(registerLine?.floor);
    const floor = explicitFloor || registerLine?.floor || parsedLocation.floor || '';
    const room = explicitRoom || registerLine?.room || parsedLocation.room || '';
    const buildingNo = explicitBuildingNo || registerLine?.buildingNo || '';
    const unit = isRegisterStyle
      ? combineUnitContext(inheritedSection, explicitUnit || parsedLocation.unit || inheritedUnit || '')
      : explicitUnit || parsedLocation.unit || inheritedUnit;

    const notes: ValidationError[] = [];
    if (floorFromRegisterLine) {
      notes.push({
        rowIdx: 0,
        field: 'floor',
        severity: 'info',
        message: 'Floor extracted from raw text',
        sheetName: context.sheetName,
      });
    }

    const sourceRowIndex = sourceRowIndices[rowIdx];
    const baseRow: Omit<ImportReadyRow, 'assetType'> = {
      address: explicitAddress || context.buildingAddress,
      buildingNo: buildingNo || undefined,
      floor: floor || undefined,
      room: room || undefined,
      unit: unit || undefined,
      rawText:
        locationText ||
        assetText ||
        [explicitUnit, explicitFloor, explicitRoom].filter(Boolean).join(' / ') ||
        rawRowText,
      sheetName: context.sheetName,
      sourceRowNumber: sourceRowIndex !== undefined ? sourceRowIndex + 1 : undefined,
    };

    if (isRegisterStyle) {
      // Some registers split the same conceptual fixture across two columns
      // (e.g. separate "Sink" and "Whb" counts, both bucketed as WHB) — sum
      // same-type counts into one row instead of producing look-alike rows
      // that duplicate detection would then have to flag against each other.
      const countsByType = new Map<AssetType, number>();
      assetCountColumns.forEach(({ header, assetType: countedAssetType }) => {
        const count = parseAssetCount(getColumnValue(row, headers, header));
        if (count > 0) {
          countsByType.set(countedAssetType, (countsByType.get(countedAssetType) ?? 0) + count);
        }
      });
      const countMatches: AssetRowPlan[] = Array.from(countsByType.entries()).map(
        ([countedAssetType, quantity]) => ({
          assetType: countedAssetType,
          quantity,
          detectedFrom: 'count-column' as const,
        }),
      );

      // Scan every cell in the row, not just mapped columns — abbreviations
      // and quantities are frequently tucked into an unmapped "Comments"
      // column (e.g. "2 x Newark Calorifiers") rather than the asset column.
      const scanText = [locationText, assetText, room, registerLine?.tail, rawRowText]
        .filter(Boolean)
        .join(' ');
      const assetPlans = planAssetRows(countMatches, scanText);

      if (assetPlans.length > 0) {
        assetPlans.forEach((plan) => {
          const planNotes = [...notes];
          if (plan.detectedFrom === 'abbreviation') {
            planNotes.push({
              rowIdx: 0,
              field: 'assetType',
              severity: 'info',
              message: `Asset type detected from abbreviation "${plan.matchedText}"`,
              sheetName: context.sheetName,
            });
          }
          pushRow(
            { ...baseRow, assetType: plan.assetType, quantity: plan.quantity },
            rawRowText,
            planNotes,
          );
        });
        return;
      }
    }

    const assetHints = [locationText, assetText, room];
    const { assetType } = detectAssetType(assetHints, context.sheetType);
    pushRow({ ...baseRow, assetType }, rawRowText, notes);
  });

  if (duplicateCategory !== 'none') {
    const seen = new Map<string, number>();
    duplicateKeys.forEach((key, idx) => {
      if (!key) {
        return;
      }
      // Skip keys with no identifying information at all — comparing two
      // near-blank rows isn't a meaningful "duplicate".
      if (duplicateCategory === 'inventory' && key.replace(/\|/g, '').trim() === '') {
        return;
      }

      if (seen.has(key)) {
        errors.push({
          rowIdx: idx,
          field: 'duplicate',
          severity: 'warning',
          message: 'Potential duplicate record',
          sheetName: context.sheetName,
        });
      } else {
        seen.set(key, idx);
      }
    });
  }

  const columnSummary = [
    locationColumn ? `location: "${locationColumn}"` : null,
    assetColumn ? `asset: "${assetColumn}"` : null,
    floorColumn ? `floor: "${floorColumn}"` : null,
    roomColumn ? `room: "${roomColumn}"` : null,
    unitColumn ? `unit: "${unitColumn}"` : null,
    buildingNoColumn ? `building no: "${buildingNoColumn}"` : null,
    assetCountColumns.length > 0
      ? `asset count columns: ${assetCountColumns.map(({ header }) => `"${header}"`).join(', ')}`
      : null,
  ]
    .filter(Boolean)
    .join(', ');

  const headerNote = headerConfident
    ? ` Header row ${headerRowIndex + 1}.`
    : ' Could not confidently detect a header row — treating rows generically; review carefully.';

  return {
    rows,
    errors,
    headerRowIndex,
    columns: headers.filter(Boolean),
    interpretation: `${interpretationPrefix}${headerNote}${columnSummary ? ` Detected ${columnSummary}.` : ''} Parsed ${rows.length} asset rows.`,
  };
}
