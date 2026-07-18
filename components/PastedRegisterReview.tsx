'use client';

import BuildingAddressPanel from './BuildingAddressPanel';
import ImportReadyDownloadButton from './ImportReadyDownloadButton';
import ValidationReport from './ValidationReport';
import { buildImportReadyRowsFromPaste } from '../utils/importReadyExport';
import type { FieldConfidence, PastedAssetRow, PasteParseSummary } from '../utils/pasteRegisterParser';
import { AlertTriangle, CheckCircle2, ClipboardList, Pencil, ShieldX } from 'lucide-react';
import { useMemo, useState } from 'react';

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
    <div className="flex flex-wrap gap-1.5">
      {issues.map((issue, index) => (
        <span
          key={`${issue.message}-${index}`}
          className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${
            issue.severity === 'critical' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-800'
          }`}
        >
          {issue.severity === 'critical' ? 'Critical: ' : 'Warning: '}
          {issue.message}
        </span>
      ))}
    </div>
  );
}

function NoteBadges({ notes }: { notes: string[] }) {
  if (notes.length === 0) {
    return <span className="text-xs text-slate-400">—</span>;
  }
  return (
    <div className="flex flex-wrap gap-1.5">
      {notes.map((note, index) => (
        <span
          key={`${note}-${index}`}
          className="inline-flex items-center rounded-full bg-blue-100 px-2.5 py-1 text-xs font-medium text-blue-700"
        >
          {note}
        </span>
      ))}
    </div>
  );
}

export default function PastedRegisterReview({
  rows,
  summary,
  address,
  onAddressCommit,
}: PastedRegisterReviewProps) {
  const [activeTab, setActiveTab] = useState<PreviewTab>('review');
  const [editingAddress, setEditingAddress] = useState(false);

  const rowsWithAddress = useMemo(() => rows.map((row) => ({ ...row, address })), [rows, address]);

  const readyRows = useMemo(() => rowsWithAddress.filter((row) => row.importStatus === 'READY'), [rowsWithAddress]);
  const reviewRows = useMemo(
    () => rowsWithAddress.filter((row) => row.importStatus === 'REVIEW_REQUIRED'),
    [rowsWithAddress],
  );
  const blockedRows = useMemo(
    () => rowsWithAddress.filter((row) => row.importStatus === 'BLOCKED'),
    [rowsWithAddress],
  );

  const displayedRows =
    activeTab === 'ready' ? readyRows : activeTab === 'review' ? reviewRows : blockedRows;

  const importReadyRows = useMemo(
    () => buildImportReadyRowsFromPaste(rowsWithAddress),
    [rowsWithAddress],
  );

  const kpiSummary = {
    totalImported: summary.totalRows,
    distinctLocationsCount: summary.distinctLocations,
    totalErrors: summary.blockedCount,
    totalWarnings: summary.reviewRequiredCount,
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
              Parsed rows classified as Ready, Review Required or Blocked — nothing is silently
              marked import-ready when the underlying detection is uncertain.
            </p>
          </div>
          <ImportReadyDownloadButton rows={importReadyRows} fileName="pasted-data" />
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
                  <th className="px-4 py-3 font-semibold text-slate-700">Address</th>
                  <th className="px-4 py-3 font-semibold text-slate-700">Building</th>
                  <th className="px-4 py-3 font-semibold text-slate-700">Building No</th>
                  <th className="px-4 py-3 font-semibold text-slate-700">Floor</th>
                  <th className="px-4 py-3 font-semibold text-slate-700">Room</th>
                  <th className="px-4 py-3 font-semibold text-slate-700">Asset Type</th>
                  <th className="px-4 py-3 font-semibold text-slate-700">Qty</th>
                  <th className="min-w-56 px-4 py-3 font-semibold text-slate-700">Original Raw Text</th>
                  <th className="min-w-56 px-4 py-3 font-semibold text-slate-700">Issues</th>
                  <th className="min-w-56 px-4 py-3 font-semibold text-slate-700">Parsing Notes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {displayedRows.map((row, index) => (
                  <tr key={`${row.rawText}-${index}`} className="hover:bg-slate-50">
                    <td className="px-4 py-3 text-slate-900">{row.address || '—'}</td>
                    <td className="px-4 py-3">
                      <FieldCell field={row.building} />
                    </td>
                    <td className="px-4 py-3">
                      <FieldCell field={row.buildingNumber} />
                    </td>
                    <td className="px-4 py-3">
                      <FieldCell field={row.floor} />
                    </td>
                    <td className="px-4 py-3">
                      <FieldCell field={row.room} />
                    </td>
                    <td className="px-4 py-3">
                      <FieldCell field={row.assetType} emptyLabel="Unknown" />
                      {row.detectedAssets && row.detectedAssets.length > 1 && (
                        <div className="mt-1 flex flex-wrap gap-1">
                          {row.detectedAssets.map((asset) => (
                            <span
                              key={asset.assetType}
                              title={asset.source}
                              className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-600"
                            >
                              {asset.assetType}
                            </span>
                          ))}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <FieldCell field={row.quantity} />
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-slate-600">{row.rawText}</td>
                    <td className="px-4 py-3">
                      <IssueBadges issues={row.issues} />
                    </td>
                    <td className="px-4 py-3">
                      <NoteBadges notes={row.parsingNotes} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
