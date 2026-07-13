'use client';

import type { ImportReadyRow, ValidationError } from '../types';
import { groupRowsByImportStatus } from '../utils/validationEngine';
import { AlertTriangle, CheckCircle2, ClipboardList, ShieldX } from 'lucide-react';
import { useMemo, useState } from 'react';

export interface DataPreviewTableProps {
  rows: ImportReadyRow[];
  errors: ValidationError[];
  /** Show Sheet column. Defaults to true. */
  showSheetColumn?: boolean;
  /** Show Row # column. Defaults to true. */
  showRowColumn?: boolean;
}

type PreviewTab = 'ready' | 'review' | 'blocked';

/** Issues (error/warning — actionable) rendered with the same Critical:/Warning: prefixes and colors used for pasted-data review, so both flows read identically. */
function IssueBadges({ rowErrors }: { rowErrors: ValidationError[] }) {
  const issues = rowErrors.filter((error) => error.severity !== 'info');
  if (issues.length === 0) {
    return <span className="text-xs text-slate-400">—</span>;
  }
  return (
    <div className="flex flex-wrap gap-1.5">
      {issues.map((error, index) => (
        <span
          key={`${error.field}-${error.severity}-${index}`}
          className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${
            error.severity === 'error' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-800'
          }`}
        >
          {error.severity === 'error' ? 'Critical: ' : 'Warning: '}
          {error.message}
        </span>
      ))}
    </div>
  );
}

/** Info entries — transparent notes about automatic detection/transformation, never a reason for review. */
function NoteBadges({ rowErrors }: { rowErrors: ValidationError[] }) {
  const notes = rowErrors.filter((error) => error.severity === 'info');
  if (notes.length === 0) {
    return <span className="text-xs text-slate-400">—</span>;
  }
  return (
    <div className="flex flex-wrap gap-1.5">
      {notes.map((note, index) => (
        <span
          key={`${note.field}-${index}`}
          className="inline-flex items-center rounded-full bg-blue-100 px-2.5 py-1 text-xs font-medium text-blue-700"
        >
          {note.message}
        </span>
      ))}
    </div>
  );
}

export default function DataPreviewTable({
  rows,
  errors,
  showSheetColumn = true,
  showRowColumn = true,
}: DataPreviewTableProps) {
  const [activeTab, setActiveTab] = useState<PreviewTab>('review');

  const { readyRows, reviewRows, blockedRows } = useMemo(
    () => groupRowsByImportStatus(rows, errors),
    [rows, errors],
  );

  const displayedRows =
    activeTab === 'ready' ? readyRows : activeTab === 'review' ? reviewRows : blockedRows;
  const showBuildingNoColumn = rows.some((row) => row.buildingNo);
  const showQuantityColumn = rows.some((row) => row.quantity);

  return (
    <div className="w-full rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-200 px-6 py-5">
        <h2 className="text-lg font-semibold text-slate-900">Import Ready Preview</h2>
        <p className="mt-1 text-sm text-slate-500">
          Parsed rows classified as Ready, Review Required or Blocked — nothing is silently marked
          import-ready when the underlying detection is uncertain.
        </p>
      </div>

      <div className="flex gap-1 border-b border-slate-200 px-6 pt-4">
        <button
          type="button"
          onClick={() => setActiveTab('ready')}
          className={`inline-flex items-center gap-2 rounded-t-lg px-4 py-2.5 text-sm font-medium transition-colors ${
            activeTab === 'ready'
              ? 'border border-b-0 border-slate-200 bg-white text-slate-900'
              : 'text-slate-500 hover:text-slate-700'
          }`}
        >
          <CheckCircle2 className="h-4 w-4 text-emerald-600" />
          Ready
          <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-700">
            {readyRows.length}
          </span>
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('review')}
          className={`inline-flex items-center gap-2 rounded-t-lg px-4 py-2.5 text-sm font-medium transition-colors ${
            activeTab === 'review'
              ? 'border border-b-0 border-slate-200 bg-white text-slate-900'
              : 'text-slate-500 hover:text-slate-700'
          }`}
        >
          <AlertTriangle className="h-4 w-4 text-amber-600" />
          Review Required
          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800">
            {reviewRows.length}
          </span>
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('blocked')}
          className={`inline-flex items-center gap-2 rounded-t-lg px-4 py-2.5 text-sm font-medium transition-colors ${
            activeTab === 'blocked'
              ? 'border border-b-0 border-slate-200 bg-white text-slate-900'
              : 'text-slate-500 hover:text-slate-700'
          }`}
        >
          <ShieldX className="h-4 w-4 text-red-600" />
          Blocked
          <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-700">
            {blockedRows.length}
          </span>
        </button>
      </div>

      <div className="overflow-x-auto p-6">
        {displayedRows.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50 px-6 py-14 text-center">
            <ClipboardList className="mb-3 h-8 w-8 text-slate-400" />
            <p className="text-sm font-medium text-slate-700">No rows in this category.</p>
          </div>
        ) : (
          <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
            <thead>
              <tr className="bg-slate-50">
                {showSheetColumn && (
                  <th className="px-4 py-3 font-semibold text-slate-700">Sheet</th>
                )}
                {showRowColumn && (
                  <th className="px-4 py-3 font-semibold text-slate-700">Row #</th>
                )}
                <th className="px-4 py-3 font-semibold text-slate-700">Address</th>
                {showBuildingNoColumn && (
                  <th className="px-4 py-3 font-semibold text-slate-700">Building No</th>
                )}
                <th className="px-4 py-3 font-semibold text-slate-700">Unit</th>
                <th className="px-4 py-3 font-semibold text-slate-700">Floor</th>
                <th className="px-4 py-3 font-semibold text-slate-700">Room</th>
                <th className="px-4 py-3 font-semibold text-slate-700">Asset Type</th>
                {showQuantityColumn && (
                  <th className="px-4 py-3 font-semibold text-slate-700">Qty</th>
                )}
                <th className="min-w-56 px-4 py-3 font-semibold text-slate-700">
                  Original Raw Text
                </th>
                <th className="min-w-56 px-4 py-3 font-semibold text-slate-700">Issues</th>
                <th className="min-w-56 px-4 py-3 font-semibold text-slate-700">Parsing Notes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {displayedRows.map(({ row, rowIdx, rowErrors }) => (
                <tr key={`${row.sheetName ?? 'row'}-${rowIdx}`} className="hover:bg-slate-50">
                  {showSheetColumn && (
                    <td className="px-4 py-3 text-slate-600">{row.sheetName || '—'}</td>
                  )}
                  {showRowColumn && (
                    <td className="px-4 py-3 font-mono text-xs text-slate-600">
                      {row.sourceRowNumber ? `#${row.sourceRowNumber}` : '—'}
                    </td>
                  )}
                  <td className="px-4 py-3 text-slate-900">{row.address || '—'}</td>
                  {showBuildingNoColumn && (
                    <td className="px-4 py-3 text-slate-700">{row.buildingNo || '—'}</td>
                  )}
                  <td className="px-4 py-3 text-slate-700">{row.unit || '—'}</td>
                  <td className="px-4 py-3 text-slate-700">{row.floor || '—'}</td>
                  <td className="px-4 py-3 text-slate-700">{row.room || '—'}</td>
                  <td className="px-4 py-3 text-slate-700">{row.assetType}</td>
                  {showQuantityColumn && (
                    <td className="px-4 py-3 text-slate-700">{row.quantity ?? '—'}</td>
                  )}
                  <td className="px-4 py-3 font-mono text-xs text-slate-600">
                    {row.rawText || '—'}
                  </td>
                  <td className="px-4 py-3">
                    <IssueBadges rowErrors={rowErrors} />
                  </td>
                  <td className="px-4 py-3">
                    <NoteBadges rowErrors={rowErrors} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
