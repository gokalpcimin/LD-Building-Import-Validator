import type { ImportReadyRow, ValidationError } from '../../types';
import { findHeaderByRole } from '../columnMapping';
import { normalizeSheetData } from '../headerDetection';
import { classifyAssetFromText } from '../services/AssetClassifier';
import {
  parseOutletLocation,
  resolveMonthlyOutletUnit,
} from '../services/LocationParser';
import { validateRow } from '../validationEngine';
import { getColumnValue, getLocationColumn } from './columnDetection';
import type { ParserContext, ParserResult } from './types';

function isEmptyRow(row: string[]): boolean {
  return !row.some((cell) => cell.trim().length > 0);
}

function isMeaningfulValue(value: string): boolean {
  const normalized = value.trim();
  return normalized.length > 0 && normalized !== '-';
}

/**
 * Monthly Outlet temperature sheets — Outlet/Location carries both the place
 * and (usually) the fixture name. Asset type is inferred by AssetClassifier;
 * unit/floor/room by LocationParser. Does not share the register multi-asset path.
 */
export function parseMonthlyOutlet(
  rawData: string[][],
  context: ParserContext,
): ParserResult {
  const { data, headerRowIndex, sourceRowIndices, rowUnits } = normalizeSheetData(rawData);
  const headers = (data[0] ?? []).map((header) => header.trim());
  const dataRows = data.slice(1);
  const mapping = context.columnMapping;
  const locationColumn =
    findHeaderByRole(mapping, 'location') ||
    getLocationColumn('monthly-outlet', headers);
  const addressColumn = findHeaderByRole(mapping, 'address');
  const floorColumn = findHeaderByRole(mapping, 'floor');
  const roomColumn = findHeaderByRole(mapping, 'room');
  const unitColumn = findHeaderByRole(mapping, 'unit');
  const hasInheritedUnits = rowUnits.some(Boolean);

  const rows: ImportReadyRow[] = [];
  const errors: ValidationError[] = [];
  const seenFullRows = new Map<string, number>();

  dataRows.forEach((row, rowIdx) => {
    if (isEmptyRow(row)) {
      return;
    }

    const locationText = locationColumn ? getColumnValue(row, headers, locationColumn) : '';
    const explicitFloor = floorColumn ? getColumnValue(row, headers, floorColumn) : '';
    const explicitRoom = roomColumn ? getColumnValue(row, headers, roomColumn) : '';
    const explicitUnit = unitColumn ? getColumnValue(row, headers, unitColumn).trim() : '';
    const inheritedUnit = rowUnits[rowIdx];
    const explicitAddress = addressColumn ? getColumnValue(row, headers, addressColumn) : '';
    const rawRowText = row.filter(isMeaningfulValue).join(' / ');
    const outletText = locationText || rawRowText;

    if (!outletText && !explicitFloor && !explicitRoom && !explicitUnit && !inheritedUnit) {
      return;
    }

    const classification = classifyAssetFromText(outletText);
    const location = parseOutletLocation(
      outletText,
      classification.matchedKeywords,
      classification.assetType,
    );

    const floor = explicitFloor || location.floor || undefined;
    // Combined section headings (e.g. "Unit 14/15") are narrowed from Outlet/Location
    // when the row names unit 14 or unit 15; plain sections ("Unit 3") are inherited.
    const unitResolution = resolveMonthlyOutletUnit(
      inheritedUnit,
      outletText,
      location.unit || undefined,
    );
    const unit = explicitUnit || unitResolution.unit || undefined;
    let room = explicitRoom || location.room || undefined;
    if (unit && room) {
      // Drop leftover "unit 14" tokens from the room once Unit is assigned.
      const cleanedRoom = room
        .replace(/\bunit\s+[\w\d/]+\b/gi, '')
        .replace(/\s*[-–/,]+\s*/g, ' - ')
        .replace(/^\s*[-–/,]+\s*|\s*[-–/,]+\s*$/g, '')
        .replace(/\s+/g, ' ')
        .trim();
      room = cleanedRoom || undefined;
    }
    const sourceRowIndex = sourceRowIndices[rowIdx];

    const importRow: ImportReadyRow = {
      address: explicitAddress || context.buildingAddress,
      assetType: classification.assetType,
      floor,
      room,
      unit,
      rawText: outletText || rawRowText,
      sheetName: context.sheetName,
      sourceRowNumber: sourceRowIndex !== undefined ? sourceRowIndex + 1 : undefined,
      assetConfidence: classification.confidence,
      assetMatchedKeywords: classification.matchedKeywords,
      assetNeedsReview: classification.needsReview,
    };

    const noteErrors: ValidationError[] = [];
    if (classification.matchedKeywords.length > 0) {
      noteErrors.push({
        rowIdx: rows.length,
        field: 'assetType',
        severity: 'info',
        message: `Detected from "${classification.matchedKeywords.join(', ')}" (${Math.round(classification.confidence * 100)}% confidence)`,
        sheetName: context.sheetName,
      });
    }
    if (!explicitUnit && unitResolution.resolvedFromInline && unitResolution.sectionUnit && unit) {
      noteErrors.push({
        rowIdx: rows.length,
        field: 'unit',
        severity: 'info',
        message: `Unit resolved as "${unit}" within section "${unitResolution.sectionUnit}"`,
        sheetName: context.sheetName,
      });
    } else if (
      !explicitUnit &&
      inheritedUnit &&
      unit === inheritedUnit &&
      !unitResolution.ambiguousCombined
    ) {
      noteErrors.push({
        rowIdx: rows.length,
        field: 'unit',
        severity: 'info',
        message: `Unit inherited from section heading "${inheritedUnit}"`,
        sheetName: context.sheetName,
      });
    }
    if (!explicitUnit && unitResolution.ambiguousCombined && unitResolution.sectionUnit) {
      noteErrors.push({
        rowIdx: rows.length,
        field: 'unit',
        severity: 'warning',
        message: `Could not determine which unit within "${unitResolution.sectionUnit}" from Outlet/Location text`,
        sheetName: context.sheetName,
      });
    }
    if (location.unclearRoom && outletText) {
      noteErrors.push({
        rowIdx: rows.length,
        field: 'room',
        severity: 'warning',
        message: 'Unclear room/location after parsing Outlet/Location text',
        sheetName: context.sheetName,
      });
    }

    const rowErrors = [
      ...noteErrors,
      ...validateRow(importRow, rows.length, {
        sheetName: context.sheetName,
        sheetType: context.sheetType,
        hasUnitSource:
          Boolean(unitColumn) || Boolean(location.unit) || hasInheritedUnits,
      }),
    ];

    // Monitoring sheets: only flag exact full-row repeats.
    const fullKey = rawRowText.toLowerCase();
    if (fullKey && seenFullRows.has(fullKey)) {
      rowErrors.push({
        rowIdx: rows.length,
        field: 'duplicate',
        severity: 'warning',
        message: 'Potential duplicate record',
        sheetName: context.sheetName,
      });
    } else if (fullKey) {
      seenFullRows.set(fullKey, rows.length);
    }

    rows.push(importRow);
    errors.push(...rowErrors);
  });

  const columnSummary = [
    locationColumn ? `location: "${locationColumn}"` : null,
    floorColumn ? `floor: "${floorColumn}"` : null,
    roomColumn ? `room: "${roomColumn}"` : null,
    unitColumn ? `unit: "${unitColumn}"` : null,
  ]
    .filter(Boolean)
    .join(', ');

  return {
    interpretation: columnSummary
      ? `Monthly outlet sheet — ${columnSummary}. Asset types inferred from Outlet/Location via weighted keyword classifier.`
      : 'Monthly outlet temperature sheet — extracting locations as assets via weighted keyword classifier.',
    headerRowIndex,
    columns: headers,
    rows,
    errors,
  };
}
