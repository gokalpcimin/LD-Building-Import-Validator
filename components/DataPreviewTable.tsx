'use client';

import type { AssetType, ImportReadyRow, ValidationError } from '../types';
import { SELECTABLE_ASSET_TYPES } from '../types';
import { groupRowsByImportStatus } from '../utils/validationEngine';
import { AlertTriangle, CheckCircle2, ClipboardList, ShieldX, Undo2 } from 'lucide-react';
import { useMemo, useState } from 'react';

export interface DataPreviewTableProps {
  rows: ImportReadyRow[];
  errors: ValidationError[];
  /** Show Sheet column. Defaults to true. */
  showSheetColumn?: boolean;
  /** Show Row # column. Defaults to true. */
  showRowColumn?: boolean;
  /** rowIdx values the user manually moved from Review → Ready. */
  promotedRowIdxs?: Set<number>;
  /** Manual Asset Type corrections keyed by rowIdx. */
  assetTypeOverrides?: Map<number, AssetType>;
  onAssetTypeChange?: (rowIdx: number, assetType: AssetType) => void;
  onPromoteRow?: (rowIdx: number) => void;
  onDemoteRow?: (rowIdx: number) => void;
}

type PreviewTab = 'ready' | 'review' | 'blocked';

/** Issues (error/warning — actionable) as stacked readable rows, matching pasted-data review. */
function IssueBadges({ rowErrors }: { rowErrors: ValidationError[] }) {
  const issues = rowErrors.filter((error) => error.severity !== 'info');
  if (issues.length === 0) {
    return <span className="text-xs text-slate-400">—</span>;
  }
  return (
    <ul className="flex w-full list-none flex-col gap-1 p-0">
      {issues.map((error, index) => (
        <li
          key={`${error.field}-${error.severity}-${index}`}
          className={`rounded-md px-2 py-1.5 text-xs leading-snug break-words whitespace-normal ${
            error.severity === 'error'
              ? 'bg-red-50 text-red-800 ring-1 ring-red-100'
              : 'bg-amber-50 text-amber-900 ring-1 ring-amber-100'
          }`}
        >
          <span className="font-semibold">
            {error.severity === 'error' ? 'Critical: ' : 'Warning: '}
          </span>
          {error.message}
        </li>
      ))}
    </ul>
  );
}

function AssetTypeCell({
  row,
  rowIdx,
  editable,
  wasOverridden,
  onAssetTypeChange,
}: {
  row: ImportReadyRow;
  rowIdx: number;
  editable: boolean;
  wasOverridden: boolean;
  onAssetTypeChange?: (rowIdx: number, assetType: AssetType) => void;
}) {
  if (editable && onAssetTypeChange) {
    const options =
      row.assetType === 'Unknown' ||
      !SELECTABLE_ASSET_TYPES.includes(row.assetType as (typeof SELECTABLE_ASSET_TYPES)[number])
        ? (['Unknown', ...SELECTABLE_ASSET_TYPES] as AssetType[])
        : ([...SELECTABLE_ASSET_TYPES] as AssetType[]);

    return (
      <div className="space-y-1">
        <select
          value={row.assetType}
          onChange={(event) => onAssetTypeChange(rowIdx, event.target.value as AssetType)}
          aria-label={`Asset type for row ${rowIdx + 1}`}
          className="w-full max-w-[11rem] rounded-md border border-slate-300 bg-white px-2 py-1.5 text-xs text-slate-800 shadow-sm focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500"
        >
          {options.map((assetType) => (
            <option key={assetType} value={assetType} disabled={assetType === 'Unknown'}>
              {assetType}
            </option>
          ))}
        </select>
        {wasOverridden ? (
          <div className="text-[11px] font-medium text-teal-700">Manually set</div>
        ) : (
          (row.assetMatchedKeywords?.length || row.assetConfidence != null) && (
            <div className="space-y-0.5 text-[11px] text-slate-500">
              {row.assetMatchedKeywords && row.assetMatchedKeywords.length > 0 && (
                <div>
                  Detected from:{' '}
                  <span className="font-medium text-slate-600">
                    &quot;{row.assetMatchedKeywords.join(', ')}&quot;
                  </span>
                </div>
              )}
              {row.assetConfidence != null && (
                <div>
                  Confidence:{' '}
                  <span className="font-medium text-slate-600">
                    {Math.round(row.assetConfidence * 100)}%
                  </span>
                </div>
              )}
            </div>
          )
        )}
      </div>
    );
  }

  return (
    <div>
      <div>{row.assetType}</div>
      {wasOverridden ? (
        <div className="mt-1 text-[11px] font-medium text-teal-700">Manually set</div>
      ) : (
        (row.assetMatchedKeywords?.length || row.assetConfidence != null) && (
          <div className="mt-1 space-y-0.5 text-[11px] text-slate-500">
            {row.assetMatchedKeywords && row.assetMatchedKeywords.length > 0 && (
              <div>
                Detected from:{' '}
                <span className="font-medium text-slate-600">
                  &quot;{row.assetMatchedKeywords.join(', ')}&quot;
                </span>
              </div>
            )}
            {row.assetConfidence != null && (
              <div>
                Confidence:{' '}
                <span className="font-medium text-slate-600">
                  {Math.round(row.assetConfidence * 100)}%
                </span>
              </div>
            )}
          </div>
        )
      )}
    </div>
  );
}

export default function DataPreviewTable({
  rows,
  errors,
  showSheetColumn = true,
  showRowColumn = true,
  promotedRowIdxs,
  assetTypeOverrides,
  onAssetTypeChange,
  onPromoteRow,
  onDemoteRow,
}: DataPreviewTableProps) {
  const [activeTab, setActiveTab] = useState<PreviewTab>('review');
  const [localPromoted, setLocalPromoted] = useState<Set<number>>(() => new Set());

  // Controlled when parent passes promotedRowIdxs; otherwise self-contained.
  const promoted = promotedRowIdxs ?? localPromoted;
  const promote = (rowIdx: number) => {
    if (onPromoteRow) {
      onPromoteRow(rowIdx);
      return;
    }
    setLocalPromoted((prev) => {
      const next = new Set(prev);
      next.add(rowIdx);
      return next;
    });
  };
  const demote = (rowIdx: number) => {
    if (onDemoteRow) {
      onDemoteRow(rowIdx);
      return;
    }
    setLocalPromoted((prev) => {
      const next = new Set(prev);
      next.delete(rowIdx);
      return next;
    });
  };

  const effectiveErrors = useMemo(
    () =>
      errors.filter(
        (error) => !(promoted.has(error.rowIdx) && error.severity === 'warning'),
      ),
    [errors, promoted],
  );

  const { readyRows, reviewRows, blockedRows } = useMemo(
    () => groupRowsByImportStatus(rows, effectiveErrors),
    [rows, effectiveErrors],
  );

  const displayedRows =
    activeTab === 'ready' ? readyRows : activeTab === 'review' ? reviewRows : blockedRows;
  const showBuildingNoColumn = rows.some((row) => row.buildingNo);
  const showQuantityColumn = rows.some((row) => row.quantity != null);
  const showActionColumn = activeTab === 'review' || activeTab === 'ready';
  const canEditAsset = Boolean(onAssetTypeChange) && (activeTab === 'review' || activeTab === 'blocked');

  return (
    <div className="w-full rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-200 px-6 py-5">
        <h2 className="text-lg font-semibold text-slate-900">Import Ready Preview</h2>
        <p className="mt-1 text-sm text-slate-500">
          {canEditAsset
            ? 'Change Asset Type with the dropdown if the suggestion is wrong, then move the row to Ready when you are satisfied. Corrections carry into Import Ready.'
            : 'Merged preview of Ready, Review Required and Blocked rows. Edit asset types on the Review Sheets step.'}
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
                {showSheetColumn && <col className="w-[7%]" />}
                {showRowColumn && <col className="w-[4%]" />}
                <col className="w-[11%]" />
                {showBuildingNoColumn && <col className="w-[5%]" />}
                <col className="w-[6%]" />
                <col className="w-[7%]" />
                <col className="w-[8%]" />
                <col className="w-[12%]" />
                {showQuantityColumn && <col className="w-[4%]" />}
                <col className="w-[13%]" />
                <col className="w-[20%]" />
                {showActionColumn && <col className="w-[9%]" />}
              </colgroup>
              <thead>
                <tr className="bg-slate-50">
                  {showSheetColumn && (
                    <th className="px-2 py-2.5 text-xs font-semibold text-slate-700">Sheet</th>
                  )}
                  {showRowColumn && (
                    <th className="px-2 py-2.5 text-xs font-semibold text-slate-700">Row #</th>
                  )}
                  <th className="px-2 py-2.5 text-xs font-semibold text-slate-700">Address</th>
                  {showBuildingNoColumn && (
                    <th className="px-2 py-2.5 text-xs font-semibold text-slate-700">Bldg No</th>
                  )}
                  <th className="px-2 py-2.5 text-xs font-semibold text-slate-700">Unit</th>
                  <th className="px-2 py-2.5 text-xs font-semibold text-slate-700">Floor</th>
                  <th className="px-2 py-2.5 text-xs font-semibold text-slate-700">Room</th>
                  <th className="px-2 py-2.5 text-xs font-semibold text-slate-700">Asset Type</th>
                  {showQuantityColumn && (
                    <th className="px-2 py-2.5 text-xs font-semibold text-slate-700">Qty</th>
                  )}
                  <th className="px-2 py-2.5 text-xs font-semibold text-slate-700">
                    Original Raw Text
                  </th>
                  <th className="px-2 py-2.5 text-xs font-semibold text-slate-700">Issues</th>
                  {showActionColumn && (
                    <th className="px-2 py-2.5 text-right text-xs font-semibold text-slate-700">
                      Action
                    </th>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {displayedRows.map(({ row, rowIdx, rowErrors }) => {
                  const wasPromoted = promoted.has(rowIdx);
                  const wasOverridden = Boolean(assetTypeOverrides?.has(rowIdx));
                  return (
                    <tr key={`${row.sheetName ?? 'row'}-${rowIdx}`} className="hover:bg-slate-50">
                      {showSheetColumn && (
                        <td className="px-2 py-2.5 align-top text-xs text-slate-600 break-words">
                          {row.sheetName || '—'}
                        </td>
                      )}
                      {showRowColumn && (
                        <td className="px-2 py-2.5 align-top font-mono text-xs text-slate-600">
                          {row.sourceRowNumber ? `#${row.sourceRowNumber}` : '—'}
                        </td>
                      )}
                      <td className="px-2 py-2.5 align-top text-xs text-slate-900 break-words">
                        {row.address || '—'}
                      </td>
                      {showBuildingNoColumn && (
                        <td className="px-2 py-2.5 align-top text-xs text-slate-700">
                          {row.buildingNo || '—'}
                        </td>
                      )}
                      <td className="px-2 py-2.5 align-top text-xs text-slate-700 break-words">
                        {row.unit || '—'}
                      </td>
                      <td className="px-2 py-2.5 align-top text-xs text-slate-700 break-words">
                        {row.floor || '—'}
                      </td>
                      <td className="px-2 py-2.5 align-top text-xs text-slate-700 break-words">
                        {row.room || '—'}
                      </td>
                      <td className="px-2 py-2.5 align-top text-xs text-slate-700 break-words">
                        <AssetTypeCell
                          row={row}
                          rowIdx={rowIdx}
                          editable={canEditAsset}
                          wasOverridden={wasOverridden}
                          onAssetTypeChange={onAssetTypeChange}
                        />
                      </td>
                      {showQuantityColumn && (
                        <td className="px-2 py-2.5 align-top text-xs text-slate-700">
                          {row.quantity != null ? row.quantity : '—'}
                        </td>
                      )}
                      <td className="px-2 py-2.5 align-top font-mono text-[11px] leading-snug text-slate-600 break-words whitespace-normal">
                        {row.rawText || '—'}
                      </td>
                      <td className="px-2 py-2.5 align-top">
                        <IssueBadges rowErrors={rowErrors} />
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
                            onClick={() => promote(rowIdx)}
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
                              onClick={() => demote(rowIdx)}
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
  );
}
