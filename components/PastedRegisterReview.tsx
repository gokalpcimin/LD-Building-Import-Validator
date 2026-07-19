'use client';

import BuildingAddressPanel from './BuildingAddressPanel';
import ExportDownloadButtons from './ExportDownloadButtons';
import ValidationReport from './ValidationReport';
import { buildExportRowsFromPaste } from '../utils/importReadyExport';
import { buildPasteSummaryReport } from '../utils/importSummaryReport';
import type { FieldConfidence, PastedAssetRow, PasteParseSummary } from '../utils/pasteRegisterParser';
import {
  AlertTriangle,
  CheckCircle2,
  ClipboardList,
  Pencil,
  ShieldX,
  Undo2,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

export interface PastedRegisterReviewProps {
  rows: PastedAssetRow[];
  summary: PasteParseSummary;
  address: string;
  onAddressCommit: (address: string) => void;
}

type PreviewTab = 'ready' | 'review' | 'blocked';

/** Renders an extracted field value, or a fallback when empty. */
function FieldCell({
  field,
  emptyLabel = '—',
}: {
  field: FieldConfidence<string | number>;
  emptyLabel?: string;
}) {
  const display = field.value === null ? emptyLabel : String(field.value);
  return <div className="text-slate-700">{display}</div>;
}

function IssueBadges({ issues }: { issues: PastedAssetRow['issues'] }) {
  if (issues.length === 0) {
    return <span className="text-xs text-slate-400">—</span>;
  }
  return (
    <ul className="flex w-full list-none flex-col gap-1 p-0">
      {issues.map((issue, index) => (
        <li
          key={`${issue.message}-${index}`}
          className={`rounded-md px-2 py-1.5 text-xs leading-snug break-words whitespace-normal ${
            issue.severity === 'critical'
              ? 'bg-red-50 text-red-800 ring-1 ring-red-100'
              : 'bg-amber-50 text-amber-900 ring-1 ring-amber-100'
          }`}
        >
          <span className="font-semibold">
            {issue.severity === 'critical' ? 'Critical: ' : 'Warning: '}
          </span>
          {issue.message}
        </li>
      ))}
    </ul>
  );
}

function promotePasteRow(row: PastedAssetRow): PastedAssetRow {
  return {
    ...row,
    importStatus: 'READY',
    issues: row.issues.filter((issue) => issue.severity !== 'warning'),
    parsingNotes: row.parsingNotes.includes('Manually approved for import')
      ? row.parsingNotes
      : [...row.parsingNotes, 'Manually approved for import'],
  };
}

export default function PastedRegisterReview({
  rows,
  summary,
  address,
  onAddressCommit,
}: PastedRegisterReviewProps) {
  const [activeTab, setActiveTab] = useState<PreviewTab>('review');
  const [editingAddress, setEditingAddress] = useState(false);
  /** rowNumber values the user manually moved from Review → Ready. */
  const [promotedRowNumbers, setPromotedRowNumbers] = useState<Set<number>>(() => new Set());

  // New paste / re-parse clears manual approvals.
  useEffect(() => {
    setPromotedRowNumbers(new Set());
  }, [rows]);

  const rowsWithAddress = useMemo(() => rows.map((row) => ({ ...row, address })), [rows, address]);

  const effectiveRows = useMemo(
    () =>
      rowsWithAddress.map((row) =>
        promotedRowNumbers.has(row.rowNumber) && row.importStatus === 'REVIEW_REQUIRED'
          ? promotePasteRow(row)
          : row,
      ),
    [rowsWithAddress, promotedRowNumbers],
  );

  const readyRows = useMemo(
    () => effectiveRows.filter((row) => row.importStatus === 'READY'),
    [effectiveRows],
  );
  const reviewRows = useMemo(
    () => effectiveRows.filter((row) => row.importStatus === 'REVIEW_REQUIRED'),
    [effectiveRows],
  );
  const blockedRows = useMemo(
    () => effectiveRows.filter((row) => row.importStatus === 'BLOCKED'),
    [effectiveRows],
  );

  const displayedRows =
    activeTab === 'ready' ? readyRows : activeTab === 'review' ? reviewRows : blockedRows;

  const readyExportRows = useMemo(
    () => buildExportRowsFromPaste(effectiveRows, 'ready'),
    [effectiveRows],
  );
  const reviewExportRows = useMemo(
    () => buildExportRowsFromPaste(effectiveRows, 'review'),
    [effectiveRows],
  );

  const summaryReport = useMemo(
    () =>
      buildPasteSummaryReport({
        address,
        rows: effectiveRows,
        distinctLocations: summary.distinctLocations,
      }),
    [address, effectiveRows, summary.distinctLocations],
  );

  const kpiSummary = {
    totalImported: summary.totalRows,
    distinctLocationsCount: summary.distinctLocations,
    totalErrors: blockedRows.length,
    totalWarnings: reviewRows.length,
  };

  const promoteRow = (rowNumber: number) => {
    setPromotedRowNumbers((prev) => {
      const next = new Set(prev);
      next.add(rowNumber);
      return next;
    });
  };

  const demoteRow = (rowNumber: number) => {
    setPromotedRowNumbers((prev) => {
      const next = new Set(prev);
      next.delete(rowNumber);
      return next;
    });
  };

  return (
    <div className="space-y-6">
      {!address.trim() || editingAddress ? (
        <BuildingAddressPanel
          value={address}
          onCommit={(value) => {
            onAddressCommit(value);
            setEditingAddress(false);
          }}
        />
      ) : (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          <span>
            Building address: <strong>{address}</strong> — applied to all parsed rows.
          </span>
          <button
            type="button"
            onClick={() => setEditingAddress(true)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-300 bg-white px-3 py-1.5 text-xs font-medium text-emerald-700 transition hover:bg-emerald-50"
          >
            <Pencil className="h-3.5 w-3.5" />
            Change
          </button>
        </div>
      )}

      <ValidationReport summary={kpiSummary} />

      <div className="w-full rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-200 px-6 py-5">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Import Ready Preview</h2>
            <p className="mt-1 text-sm text-slate-500">
              Parsed rows classified as Ready, Review Required or Blocked. You can manually move
              Review Required rows into Ready after checking them.
            </p>
          </div>
          <ExportDownloadButtons
            readyRows={readyExportRows}
            reviewRows={reviewExportRows}
            fileName="pasted-data"
            summaryReport={summaryReport}
          />
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

        <div className="p-4 sm:p-5">
          {displayedRows.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50 px-6 py-14 text-center">
              <ClipboardList className="mb-3 h-8 w-8 text-slate-400" />
              <p className="text-sm font-medium text-slate-700">No rows in this category.</p>
            </div>
          ) : (
            <div className="w-full overflow-x-auto">
              <table className="w-full table-fixed divide-y divide-slate-200 text-left text-sm">
                <colgroup>
                  <col className="w-[12%]" />
                  <col className="w-[9%]" />
                  <col className="w-[6%]" />
                  <col className="w-[8%]" />
                  <col className="w-[10%]" />
                  <col className="w-[12%]" />
                  <col className="w-[16%]" />
                  <col className="w-[18%]" />
                  {(activeTab === 'review' || activeTab === 'ready') && <col className="w-[9%]" />}
                </colgroup>
                <thead>
                  <tr className="bg-slate-50">
                    <th className="px-2 py-2.5 text-xs font-semibold text-slate-700">Address</th>
                    <th className="px-2 py-2.5 text-xs font-semibold text-slate-700">Building</th>
                    <th className="px-2 py-2.5 text-xs font-semibold text-slate-700">Bldg No</th>
                    <th className="px-2 py-2.5 text-xs font-semibold text-slate-700">Floor</th>
                    <th className="px-2 py-2.5 text-xs font-semibold text-slate-700">Room</th>
                    <th className="px-2 py-2.5 text-xs font-semibold text-slate-700">Asset Type</th>
                    <th className="px-2 py-2.5 text-xs font-semibold text-slate-700">
                      Original Raw Text
                    </th>
                    <th className="px-2 py-2.5 text-xs font-semibold text-slate-700">Issues</th>
                    {(activeTab === 'review' || activeTab === 'ready') && (
                      <th className="px-2 py-2.5 text-right text-xs font-semibold text-slate-700">
                        Action
                      </th>
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {displayedRows.map((row, index) => {
                    const wasPromoted = promotedRowNumbers.has(row.rowNumber);
                    return (
                      <tr key={`${row.rawText}-${index}`} className="hover:bg-slate-50">
                        <td className="px-2 py-2.5 align-top text-xs text-slate-900 break-words">
                          {row.address || '—'}
                        </td>
                        <td className="px-2 py-2.5 align-top text-xs break-words">
                          <FieldCell field={row.building} />
                        </td>
                        <td className="px-2 py-2.5 align-top text-xs">
                          <FieldCell field={row.buildingNumber} />
                        </td>
                        <td className="px-2 py-2.5 align-top text-xs break-words">
                          <FieldCell field={row.floor} />
                        </td>
                        <td className="px-2 py-2.5 align-top text-xs break-words">
                          <FieldCell field={row.room} />
                        </td>
                        <td className="px-2 py-2.5 align-top text-xs break-words">
                          {row.detectedAssets && row.detectedAssets.length > 0 ? (
                            <div className="flex flex-wrap gap-1">
                              {row.detectedAssets.map((asset) => (
                                <span
                                  key={asset.assetType}
                                  title={asset.source}
                                  className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-700"
                                >
                                  {asset.assetType}
                                  {asset.quantity != null ? ` ×${asset.quantity}` : ''}
                                </span>
                              ))}
                            </div>
                          ) : (
                            <FieldCell field={row.assetType} emptyLabel="Unknown" />
                          )}
                        </td>
                        <td className="px-2 py-2.5 align-top font-mono text-[11px] leading-snug text-slate-600 break-words whitespace-normal">
                          {row.rawText}
                        </td>
                        <td className="px-2 py-2.5 align-top">
                          <IssueBadges issues={row.issues} />
                          {wasPromoted && activeTab === 'ready' && (
                            <span className="mt-1 inline-flex rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-medium text-emerald-800">
                              Manually approved
                            </span>
                          )}
                        </td>
                        {activeTab === 'review' && (
                          <td className="px-2 py-2.5 align-top text-right">
                            <button
                              type="button"
                              onClick={() => promoteRow(row.rowNumber)}
                              className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-2.5 py-1.5 text-[11px] font-medium text-white transition hover:bg-emerald-700"
                            >
                              <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                              Ready
                            </button>
                          </td>
                        )}
                        {activeTab === 'ready' && (
                          <td className="px-2 py-2.5 align-top text-right">
                            {wasPromoted ? (
                              <button
                                type="button"
                                onClick={() => demoteRow(row.rowNumber)}
                                className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[11px] font-medium text-slate-700 transition hover:bg-slate-50"
                              >
                                <Undo2 className="h-3.5 w-3.5 shrink-0" />
                                Undo
                              </button>
                            ) : (
                              <span className="text-xs text-slate-400">—</span>
                            )}
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
