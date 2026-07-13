'use client';

import DataPreviewTable from './DataPreviewTable';
import ValidationReport from './ValidationReport';
import type { ParsedSheet } from '../types';
import { getSheetTypeLabel } from '../utils/sheetDetection';
import { getSheetStatusLabel } from '../utils/validationEngine';
import { Info } from 'lucide-react';

export interface SheetPanelProps {
  sheet: ParsedSheet;
  buildingAddress: string;
  onAddressChange?: (address: string) => void;
}

export default function SheetPanel({
  sheet,
  buildingAddress,
  onAddressChange,
}: SheetPanelProps) {
  const isCoverPage = sheet.sheetType === 'cover-page';
  const isPastedData = sheet.name === 'Pasted Data';

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-slate-200 bg-white px-6 py-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-semibold text-slate-900">{sheet.name}</h2>
              <span className="rounded-full bg-blue-100 px-3 py-1 text-xs font-medium text-blue-800">
                {getSheetTypeLabel(sheet.sheetType)}
              </span>
            </div>
            <p className="mt-2 text-sm text-slate-600">{sheet.interpretation}</p>
          </div>
          <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700">
            {isCoverPage
              ? buildingAddress
                ? 'Address detected'
                : 'Address missing'
              : getSheetStatusLabel(sheet.rows.length, sheet.errors)}
          </span>
        </div>

        {!isCoverPage && sheet.columns.length > 0 && (
          <p className="mt-3 text-xs text-slate-500">
            Header row {sheet.headerRowIndex + 1} · Columns: {sheet.columns.slice(0, 6).join(', ')}
            {sheet.columns.length > 6 ? '…' : ''}
          </p>
        )}
      </div>

      {isCoverPage && buildingAddress && (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-6 py-5 shadow-sm">
          <div className="flex items-start gap-3">
            <Info className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
            <div className="flex-1">
              <h3 className="text-sm font-semibold text-slate-900">Building Address</h3>
              <p className="mt-1 text-sm text-slate-600">
                This address is applied automatically to every asset row in other sheets.
              </p>
              <input
                type="text"
                value={buildingAddress}
                onChange={(event) => onAddressChange?.(event.target.value)}
                placeholder="e.g. 52 North Lane, Aldershot, Hampshire"
                className="mt-3 w-full rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm text-slate-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
              />
            </div>
          </div>
        </div>
      )}

      {!isCoverPage && sheet.summary && (
        <>
          <ValidationReport summary={sheet.summary} />
          <DataPreviewTable
            rows={sheet.rows}
            errors={sheet.errors}
            showSheetColumn={!isPastedData}
            showRowColumn={!isPastedData}
          />
        </>
      )}
    </div>
  );
}
