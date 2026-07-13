'use client';

import type { ColumnRole, SheetColumnMapping, SheetData } from '../types';
import { COLUMN_ROLE_LABELS, COLUMN_ROLE_OPTIONS, extractSheetHeaderInfo } from '../utils/columnMapping';
import { getSheetTypeLabel } from '../utils/sheetDetection';
import { ArrowRight, Sparkles } from 'lucide-react';
import { useMemo } from 'react';

export interface ColumnMappingStepProps {
  sheets: SheetData[];
  mappings: Record<string, SheetColumnMapping>;
  onRoleChange: (sheetName: string, header: string, role: ColumnRole) => void;
  onConfirm: () => void;
}

const ROLE_BADGE_STYLE: Record<ColumnRole, string> = {
  ignore: 'bg-slate-100 text-slate-500',
  address: 'bg-purple-100 text-purple-800',
  assetType: 'bg-blue-100 text-blue-800',
  location: 'bg-emerald-100 text-emerald-800',
  floor: 'bg-amber-100 text-amber-800',
  room: 'bg-amber-100 text-amber-800',
  unit: 'bg-amber-100 text-amber-800',
  buildingNo: 'bg-amber-100 text-amber-800',
};

export default function ColumnMappingStep({
  sheets,
  mappings,
  onRoleChange,
  onConfirm,
}: ColumnMappingStepProps) {
  const sheetInfos = useMemo(
    () => sheets.map((sheet) => extractSheetHeaderInfo(sheet)),
    [sheets],
  );

  const mappableSheets = sheetInfos.filter((info) => info.sheetType !== 'cover-page');

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-slate-200 bg-white px-6 py-5 shadow-sm">
        <div className="flex items-start gap-3">
          <Sparkles className="mt-0.5 h-5 w-5 shrink-0 text-blue-600" />
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Confirm Column Mapping</h2>
            <p className="mt-1 text-sm text-slate-600">
              Customer files use different column names. We&apos;ve automatically matched each
              column below to a platform field — review and adjust if anything looks wrong before
              continuing.
            </p>
          </div>
        </div>
      </div>

      {mappableSheets.length === 0 && (
        <div className="rounded-2xl border border-slate-200 bg-white px-6 py-5 text-sm text-slate-600 shadow-sm">
          No data columns to map — only a Cover Page sheet was provided.
        </div>
      )}

      {mappableSheets.map((info) => {
        const mapping = mappings[info.sheetName] ?? {};
        const columns = info.headers
          .map((header, index) => ({ header, sample: info.sampleRow[index] ?? '' }))
          .filter((column) => column.header);

        return (
          <div
            key={info.sheetName}
            className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"
          >
            <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-6 py-3">
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-semibold text-slate-900">{info.sheetName}</h3>
                <span className="rounded-full bg-blue-100 px-3 py-1 text-xs font-medium text-blue-800">
                  {getSheetTypeLabel(info.sheetType)}
                </span>
              </div>
              <span className="text-xs text-slate-500">{columns.length} columns</span>
            </div>

            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-left text-xs uppercase tracking-wide text-slate-400">
                  <th className="px-6 py-2 font-medium">Column in file</th>
                  <th className="px-6 py-2 font-medium">Sample value</th>
                  <th className="px-6 py-2 font-medium">Maps to</th>
                </tr>
              </thead>
              <tbody>
                {columns.map(({ header, sample }) => {
                  const role = mapping[header] ?? 'ignore';
                  return (
                    <tr key={header} className="border-b border-slate-50 last:border-b-0">
                      <td className="px-6 py-2.5 font-medium text-slate-800">{header}</td>
                      <td className="max-w-[220px] truncate px-6 py-2.5 text-slate-500">
                        {sample || '—'}
                      </td>
                      <td className="px-6 py-2.5">
                        <select
                          value={role}
                          onChange={(event) =>
                            onRoleChange(info.sheetName, header, event.target.value as ColumnRole)
                          }
                          className={`rounded-lg border-0 px-3 py-1.5 text-xs font-medium ${ROLE_BADGE_STYLE[role]} focus:outline-none focus:ring-2 focus:ring-blue-300`}
                        >
                          {COLUMN_ROLE_OPTIONS.map((option) => (
                            <option key={option} value={option}>
                              {COLUMN_ROLE_LABELS[option]}
                            </option>
                          ))}
                        </select>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        );
      })}

      <div className="flex justify-end">
        <button
          type="button"
          onClick={onConfirm}
          className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-blue-700"
        >
          Confirm Mapping &amp; Continue
          <ArrowRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
