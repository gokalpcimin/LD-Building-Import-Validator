'use client';

import type { ColumnRole, SheetColumnMapping, SheetData } from '../types';
import type { AiMappingSuggestion } from '../utils/aiMappingSuggester';
import { suggestMappingWithAi } from '../utils/aiMappingSuggester';
import {
  buildDefaultWorkbookMapping,
  COLUMN_ROLE_LABELS,
  COLUMN_ROLE_OPTIONS,
  extractSheetHeaderInfo,
} from '../utils/columnMapping';
import { getSheetTypeLabel } from '../utils/sheetDetection';
import { ArrowRight, Check, Loader2, RotateCcw, Sparkles, Wand2, X } from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';

export interface ColumnMappingStepProps {
  sheets: SheetData[];
  mappings: Record<string, SheetColumnMapping>;
  onRoleChange: (sheetName: string, header: string, role: ColumnRole) => void;
  /** Restores the automatic keyword-based mapping after the user has made manual changes. */
  onResetToSuggested: () => void;
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

type AiState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'done'; suggestions: Record<string, AiMappingSuggestion[]> };

export default function ColumnMappingStep({
  sheets,
  mappings,
  onRoleChange,
  onResetToSuggested,
  onConfirm,
}: ColumnMappingStepProps) {
  const [aiState, setAiState] = useState<AiState>({ status: 'idle' });

  const sheetInfos = useMemo(
    () => sheets.map((sheet) => extractSheetHeaderInfo(sheet)),
    [sheets],
  );

  const mappableSheets = sheetInfos.filter((info) => info.sheetType !== 'cover-page');

  const suggestedMappings = useMemo(() => buildDefaultWorkbookMapping(sheets), [sheets]);

  const isModifiedFromSuggested = useMemo(() => {
    return JSON.stringify(mappings) !== JSON.stringify(suggestedMappings);
  }, [mappings, suggestedMappings]);

  const handleResetToSuggested = useCallback(() => {
    onResetToSuggested();
    setAiState({ status: 'idle' });
  }, [onResetToSuggested]);

  const handleAiSuggest = useCallback(async () => {
    setAiState({ status: 'loading' });
    const suggestions: Record<string, AiMappingSuggestion[]> = {};

    for (const info of mappableSheets) {
      const sheetSuggestions = await suggestMappingWithAi(
        info.headers,
        info.sampleRow,
        mappings[info.sheetName] ?? {},
      );
      if (sheetSuggestions.length > 0) {
        suggestions[info.sheetName] = sheetSuggestions;
      }
    }

    setAiState({ status: 'done', suggestions });
  }, [mappableSheets, mappings]);

  const handleAcceptSuggestion = useCallback(
    (sheetName: string, suggestion: AiMappingSuggestion) => {
      onRoleChange(sheetName, suggestion.header, suggestion.suggestedRole);
      setAiState((current) => {
        if (current.status !== 'done') {
          return current;
        }
        const remaining = (current.suggestions[sheetName] ?? []).filter(
          (s) => s.header !== suggestion.header,
        );
        return {
          status: 'done',
          suggestions: { ...current.suggestions, [sheetName]: remaining },
        };
      });
    },
    [onRoleChange],
  );

  const handleDismissSuggestion = useCallback((sheetName: string, header: string) => {
    setAiState((current) => {
      if (current.status !== 'done') {
        return current;
      }
      const remaining = (current.suggestions[sheetName] ?? []).filter(
        (s) => s.header !== header,
      );
      return {
        status: 'done',
        suggestions: { ...current.suggestions, [sheetName]: remaining },
      };
    });
  }, []);

  const totalSuggestions =
    aiState.status === 'done'
      ? Object.values(aiState.suggestions).reduce((sum, list) => sum + list.length, 0)
      : 0;

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-slate-200 bg-white px-6 py-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
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
          <div className="flex flex-col items-end gap-1.5">
            <div className="flex flex-wrap justify-end gap-2">
              <button
                type="button"
                onClick={handleResetToSuggested}
                disabled={!isModifiedFromSuggested}
                title="Restore the automatic keyword-based mapping for every column, discarding your manual changes."
                className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <RotateCcw className="h-4 w-4" />
                Reset to Suggested
              </button>
              <button
                type="button"
                onClick={handleAiSuggest}
                disabled={aiState.status === 'loading' || mappableSheets.length === 0}
                title="Asks the AI assistant to propose roles for columns the automatic matcher left unmapped. Suggestions are never applied without your approval."
                className="inline-flex items-center gap-2 rounded-lg border border-violet-300 bg-violet-50 px-4 py-2 text-sm font-medium text-violet-700 transition hover:bg-violet-100 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {aiState.status === 'loading' ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Wand2 className="h-4 w-4" />
                )}
                {aiState.status === 'loading' ? 'Analyzing columns…' : 'Suggest with AI'}
              </button>
            </div>
            {aiState.status === 'done' && totalSuggestions === 0 && (
              <p className="text-xs text-slate-500">
                No additional suggestions — unmapped columns don&apos;t resemble any platform field.
              </p>
            )}
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
        const sheetSuggestions =
          aiState.status === 'done' ? (aiState.suggestions[info.sheetName] ?? []) : [];

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

            {sheetSuggestions.length > 0 && (
              <div className="space-y-2 border-b border-violet-100 bg-violet-50/60 px-6 py-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-violet-700">
                  AI suggestions — review before applying
                </p>
                {sheetSuggestions.map((suggestion) => (
                  <div
                    key={suggestion.header}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-violet-200 bg-white px-3 py-2"
                  >
                    <div className="text-sm text-slate-700">
                      <span className="font-medium text-slate-900">{suggestion.header}</span>
                      {' → '}
                      <span className="font-medium text-violet-700">
                        {COLUMN_ROLE_LABELS[suggestion.suggestedRole]}
                      </span>
                      <span className="ml-2 rounded-full bg-violet-100 px-2 py-0.5 text-xs font-medium text-violet-700">
                        {suggestion.confidence}% confident
                      </span>
                      <p className="mt-0.5 text-xs text-slate-500">{suggestion.rationale}</p>
                    </div>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => handleAcceptSuggestion(info.sheetName, suggestion)}
                        className="inline-flex items-center gap-1 rounded-lg bg-violet-600 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-violet-700"
                      >
                        <Check className="h-3.5 w-3.5" />
                        Apply
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDismissSuggestion(info.sheetName, suggestion.header)}
                        className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 transition hover:bg-slate-50"
                      >
                        <X className="h-3.5 w-3.5" />
                        Dismiss
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-left text-xs uppercase tracking-wide text-slate-400">
                  <th className="px-6 py-2 font-medium">Column in file</th>
                  <th className="px-6 py-2 font-medium">Sample value</th>
                  <th className="px-6 py-2 font-medium">Maps to</th>
                </tr>
              </thead>
              <tbody>
                {columns.map(({ header, sample }, columnIndex) => {
                  const role = mapping[header] ?? 'ignore';
                  return (
                    <tr
                      key={`${info.sheetName}-${columnIndex}-${header}`}
                      className="border-b border-slate-50 last:border-b-0"
                    >
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
