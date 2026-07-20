'use client';

import BuildingAddressPanel from '../components/BuildingAddressPanel';
import ColumnMappingStep from '../components/ColumnMappingStep';
import DataPreviewTable from '../components/DataPreviewTable';
import ExportDownloadButtons from '../components/ExportDownloadButtons';
import FileUploader from '../components/FileUploader';
import PastedRegisterReview from '../components/PastedRegisterReview';
import SheetPanel from '../components/SheetPanel';
import ValidationReport from '../components/ValidationReport';
import type {
  AssetType,
  ColumnRole,
  SheetColumnMapping,
  SheetData,
  WorkbookResult,
} from '../types';
import { buildDefaultWorkbookMapping } from '../utils/columnMapping';
import { getSheetTypeLabel } from '../utils/sheetDetection';
import { parsePastedRegister } from '../utils/pasteRegisterParser';
import { buildExportRows } from '../utils/importReadyExport';
import { buildWorkbookSummaryReport } from '../utils/importSummaryReport';
import { mergeAssetSheets, processWorkbook } from '../utils/processWorkbook';
import {
  applyWorkbookReviewEdits,
  emptySheetReviewEdits,
  type WorkbookReviewEdits,
} from '../utils/sheetReviewEdits';
import { getSheetStatusLabel, groupRowsByImportStatus } from '../utils/validationEngine';
import { ArrowLeft, RotateCcw } from 'lucide-react';
import Image from 'next/image';
import { useCallback, useMemo, useState } from 'react';

type WorkflowStep = 'upload' | 'mapping' | 'workspace' | 'final' | 'pasteReview';

const WORKFLOW_STEPS: WorkflowStep[] = ['upload', 'mapping', 'workspace', 'final'];

const STEP_LABELS: Record<WorkflowStep, string> = {
  upload: 'Upload Data',
  mapping: 'Column Mapping',
  workspace: 'Review Sheets',
  final: 'Import Ready',
  pasteReview: 'Pasted Data Review',
};

/** The Paste Data tab in FileUploader always emits exactly this single, uniquely-named sheet. */
function isPasteSourced(sheets: SheetData[]): boolean {
  return sheets.length === 1 && sheets[0].name === 'Pasted Data';
}

export default function HomePage() {
  const [step, setStep] = useState<WorkflowStep>('upload');
  const [rawSheets, setRawSheets] = useState<SheetData[]>([]);
  const [columnMappings, setColumnMappings] = useState<Record<string, SheetColumnMapping>>({});
  const [workbook, setWorkbook] = useState<WorkbookResult | null>(null);
  const [activeSheetName, setActiveSheetName] = useState('');
  const [fileName, setFileName] = useState<string | undefined>();
  const [needsManualAddress, setNeedsManualAddress] = useState(false);
  const [pasteAddress, setPasteAddress] = useState('');
  /** Per-sheet asset corrections + Ready approvals on Review Sheets (before Import Ready). */
  const [sheetReviewEdits, setSheetReviewEdits] = useState<WorkbookReviewEdits>({});

  const reviewedWorkbook = useMemo(() => {
    if (!workbook) {
      return null;
    }
    return applyWorkbookReviewEdits(workbook, sheetReviewEdits);
  }, [workbook, sheetReviewEdits]);

  const activeSheet = useMemo(() => {
    if (!reviewedWorkbook) {
      return null;
    }
    return reviewedWorkbook.sheets.find((sheet) => sheet.name === activeSheetName) ?? null;
  }, [reviewedWorkbook, activeSheetName]);

  const activeSheetEdits = activeSheetName ? sheetReviewEdits[activeSheetName] : undefined;

  const finalData = useMemo(() => {
    if (!reviewedWorkbook) {
      return null;
    }
    return mergeAssetSheets(reviewedWorkbook);
  }, [reviewedWorkbook]);

  const finalKpiSummary = useMemo(() => {
    if (!finalData) {
      return null;
    }
    const { reviewRows, blockedRows } = groupRowsByImportStatus(
      finalData.rows,
      finalData.errors,
    );
    return {
      totalImported: finalData.summary.totalImported,
      distinctLocationsCount: finalData.summary.distinctLocationsCount,
      totalErrors: blockedRows.length,
      totalWarnings: reviewRows.length,
    };
  }, [finalData]);

  const readyExportRows = useMemo(() => {
    if (!finalData) {
      return [];
    }
    return buildExportRows(finalData.rows, finalData.errors, 'ready');
  }, [finalData]);

  const reviewExportRows = useMemo(() => {
    if (!finalData) {
      return [];
    }
    return buildExportRows(finalData.rows, finalData.errors, 'review');
  }, [finalData]);

  const summaryReport = useMemo(() => {
    if (!finalData || !reviewedWorkbook) {
      return null;
    }
    return buildWorkbookSummaryReport({
      fileName,
      buildingAddress: reviewedWorkbook.buildingAddress,
      rows: finalData.rows,
      errors: finalData.errors,
      sheets: reviewedWorkbook.sheets,
      distinctLocations:
        finalKpiSummary?.distinctLocationsCount ?? finalData.summary.distinctLocationsCount,
    });
  }, [finalData, reviewedWorkbook, fileName, finalKpiSummary]);

  const updateSheetEdits = useCallback(
    (sheetName: string, updater: (edits: ReturnType<typeof emptySheetReviewEdits>) => void) => {
      setSheetReviewEdits((prev) => {
        const current = prev[sheetName]
          ? {
              assetOverrides: new Map(prev[sheetName].assetOverrides),
              promotedRowIdxs: new Set(prev[sheetName].promotedRowIdxs),
            }
          : emptySheetReviewEdits();
        updater(current);
        return { ...prev, [sheetName]: current };
      });
    },
    [],
  );

  const changeSheetAssetType = useCallback(
    (rowIdx: number, assetType: AssetType) => {
      if (!activeSheetName) {
        return;
      }
      updateSheetEdits(activeSheetName, (edits) => {
        edits.assetOverrides.set(rowIdx, assetType);
      });
    },
    [activeSheetName, updateSheetEdits],
  );

  const promoteSheetRow = useCallback(
    (rowIdx: number) => {
      if (!activeSheetName) {
        return;
      }
      updateSheetEdits(activeSheetName, (edits) => {
        edits.promotedRowIdxs.add(rowIdx);
      });
    },
    [activeSheetName, updateSheetEdits],
  );

  const demoteSheetRow = useCallback(
    (rowIdx: number) => {
      if (!activeSheetName) {
        return;
      }
      updateSheetEdits(activeSheetName, (edits) => {
        edits.promotedRowIdxs.delete(rowIdx);
      });
    },
    [activeSheetName, updateSheetEdits],
  );

  // Pasted building-register text is semi-structured free text, not a
  // column grid — it gets its own dedicated parsing engine and review
  // screen instead of going through column mapping / the Excel parsers.
  const pasteResult = useMemo(() => {
    if (!isPasteSourced(rawSheets)) {
      return null;
    }
    return parsePastedRegister(rawSheets[0].data, pasteAddress);
  }, [rawSheets, pasteAddress]);

  const handleDataLoaded = useCallback((sheets: SheetData[], loadedFileName?: string) => {
    setRawSheets(sheets);
    setFileName(loadedFileName);
    setWorkbook(null);

    if (isPasteSourced(sheets)) {
      setPasteAddress('');
      setStep('pasteReview');
      return;
    }

    setColumnMappings(buildDefaultWorkbookMapping(sheets));
    setStep('mapping');
  }, []);

  const handleMappingRoleChange = useCallback(
    (sheetName: string, header: string, role: ColumnRole) => {
      setColumnMappings((current) => ({
        ...current,
        [sheetName]: { ...current[sheetName], [header]: role },
      }));
    },
    [],
  );

  const handleResetMappings = useCallback(() => {
    setColumnMappings(buildDefaultWorkbookMapping(rawSheets));
  }, [rawSheets]);

  const handleMappingConfirm = useCallback(() => {
    const result = processWorkbook(rawSheets, { fileName, columnMappings });
    setWorkbook(result);
    setSheetReviewEdits({});

    setNeedsManualAddress(!result.buildingAddress.trim());

    if (!result.buildingAddress) {
      const coverSheet = result.sheets.find((sheet) => sheet.sheetType === 'cover-page');
      setActiveSheetName(coverSheet?.name ?? result.sheets[0]?.name ?? '');
    } else {
      setActiveSheetName(result.sheets[0]?.name ?? '');
    }

    setStep('workspace');
  }, [rawSheets, fileName, columnMappings]);

  const handleAddressCommit = useCallback(
    (address: string) => {
      if (rawSheets.length === 0) {
        return;
      }
      const result = processWorkbook(rawSheets, {
        fileName,
        manualAddress: address,
        columnMappings,
      });
      setWorkbook(result);
      if (address.trim()) {
        setNeedsManualAddress(false);
      }
    },
    [rawSheets, fileName, columnMappings],
  );

  const handleAddressChange = handleAddressCommit;

  const handleReset = useCallback(() => {
    setStep('upload');
    setRawSheets([]);
    setColumnMappings({});
    setWorkbook(null);
    setActiveSheetName('');
    setFileName(undefined);
    setNeedsManualAddress(false);
    setPasteAddress('');
    setSheetReviewEdits({});
  }, []);

  const handleBack = useCallback(() => {
    setStep((current) => {
      if (current === 'final') return 'workspace';
      if (current === 'workspace') return 'mapping';
      return 'upload';
    });
  }, []);

  const canNavigateToStep = useCallback(
    (target: WorkflowStep) => {
      if (target === 'upload') return true;
      if (target === 'mapping') return rawSheets.length > 0;
      if (target === 'workspace') return workbook !== null;
      if (target === 'final') return workbook !== null && Boolean(workbook.buildingAddress);
      return false;
    },
    [rawSheets, workbook],
  );

  const currentStepIndex = WORKFLOW_STEPS.indexOf(step);

  return (
    <div className="min-h-screen bg-slate-100">
      <header className="border-b border-slate-200 bg-white shadow-sm">
        <div className="mx-auto flex max-w-[96rem] items-center justify-between px-4 py-4 sm:px-6">
          <div className="flex items-center gap-4">
            <div className="relative h-12 w-28">
              <Image
                src="/Logo-LegionellaDossier.png"
                alt="Legionella Dossier Logo"
                fill
                priority
                className="object-contain"
              />
            </div>
            <div className="h-8 w-px bg-slate-200" />
            <div>
              <h1 className="text-lg font-bold tracking-tight text-slate-900">
                LD Building Import Validator
              </h1>
              <p className="text-xs font-medium text-slate-500">
                Parse Legionella risk assessment sheets into a standardized import model
              </p>
            </div>
          </div>

          {step !== 'upload' && (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleBack}
                className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
              >
                <ArrowLeft className="h-4 w-4" />
                Back
              </button>
              <button
                type="button"
                onClick={handleReset}
                className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
              >
                <RotateCcw className="h-4 w-4" />
                Reset / Upload Another File
              </button>
            </div>
          )}
        </div>
      </header>

      <main className="mx-auto max-w-[96rem] px-4 py-8 sm:px-6">
        {step !== 'pasteReview' && (
          <div className="mb-8 flex flex-wrap items-center gap-3">
            {WORKFLOW_STEPS.map((workflowStep, index) => {
              const isActive = currentStepIndex === index;
              const isComplete = currentStepIndex > index;
              const isReachable = !isActive && canNavigateToStep(workflowStep);

              return (
                <div key={workflowStep} className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => isReachable && setStep(workflowStep)}
                    disabled={!isReachable}
                    title={isReachable ? `Go to ${STEP_LABELS[workflowStep]}` : undefined}
                    className={`flex items-center gap-3 rounded-full ${
                      isReachable ? 'cursor-pointer hover:opacity-80' : 'cursor-default'
                    }`}
                  >
                    <div
                      className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-semibold ${
                        isActive
                          ? 'bg-blue-600 text-white'
                          : isComplete
                            ? 'bg-emerald-100 text-emerald-700'
                            : 'bg-slate-200 text-slate-500'
                      }`}
                    >
                      {index + 1}
                    </div>
                    <span
                      className={`text-sm font-medium ${
                        isActive ? 'text-slate-900' : 'text-slate-500'
                      }`}
                    >
                      {STEP_LABELS[workflowStep]}
                    </span>
                  </button>
                  {index < WORKFLOW_STEPS.length - 1 && (
                    <div className="hidden h-px w-10 bg-slate-300 sm:block" />
                  )}
                </div>
              );
            })}
          </div>
        )}

        {step === 'upload' && (
          <div className="flex justify-center">
            <FileUploader onDataLoaded={handleDataLoaded} />
          </div>
        )}

        {step === 'pasteReview' && pasteResult && (
          <PastedRegisterReview
            rows={pasteResult.rows}
            summary={pasteResult.summary}
            address={pasteAddress}
            onAddressCommit={setPasteAddress}
          />
        )}

        {step === 'mapping' && rawSheets.length > 0 && (
          <ColumnMappingStep
            sheets={rawSheets}
            mappings={columnMappings}
            onRoleChange={handleMappingRoleChange}
            onResetToSuggested={handleResetMappings}
            onConfirm={handleMappingConfirm}
          />
        )}

        {step === 'workspace' && workbook && reviewedWorkbook && (
          <div className="space-y-6">
            {needsManualAddress && (
              <BuildingAddressPanel
                value={workbook.buildingAddress}
                onCommit={handleAddressCommit}
              />
            )}

            <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
              <div className="flex gap-1 overflow-x-auto border-b border-slate-200 px-4 pt-4">
                {reviewedWorkbook.sheets.map((sheet) => (
                  <button
                    key={sheet.name}
                    type="button"
                    onClick={() => setActiveSheetName(sheet.name)}
                    className={`whitespace-nowrap rounded-t-lg px-4 py-2.5 text-sm font-medium transition-colors ${
                      activeSheetName === sheet.name
                        ? 'border border-b-0 border-slate-200 bg-white text-slate-900'
                        : 'text-slate-500 hover:text-slate-700'
                    }`}
                  >
                    {getSheetTypeLabel(sheet.sheetType)}
                  </button>
                ))}
              </div>

              <div className="grid gap-3 border-b border-slate-200 bg-slate-50 px-6 py-3 sm:grid-cols-2">
                {reviewedWorkbook.sheets.map((sheet) => (
                  <div key={`${sheet.name}-status`} className="text-xs text-slate-600">
                    <span className="font-medium text-slate-800">{sheet.name}:</span>{' '}
                    {sheet.sheetType === 'cover-page'
                      ? reviewedWorkbook.buildingAddress
                        ? `Address: ${reviewedWorkbook.buildingAddress}`
                        : 'Address missing'
                      : getSheetStatusLabel(sheet.rows.length, sheet.errors)}
                  </div>
                ))}
              </div>
            </div>

            {activeSheet && (
              <SheetPanel
                sheet={activeSheet}
                buildingAddress={reviewedWorkbook.buildingAddress}
                reviewEdits={activeSheetEdits}
                onAssetTypeChange={changeSheetAssetType}
                onPromoteRow={promoteSheetRow}
                onDemoteRow={demoteSheetRow}
                onAddressChange={
                  activeSheet.sheetType === 'cover-page' ? handleAddressChange : undefined
                }
              />
            )}

            {reviewedWorkbook.buildingAddress && (
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
                Building address: <strong>{reviewedWorkbook.buildingAddress}</strong> — applied to
                all asset rows automatically.
              </div>
            )}

            <div className="rounded-2xl border border-slate-200 bg-white px-6 py-5 shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <h3 className="text-base font-semibold text-slate-900">View Import Summary</h3>
                  <p className="mt-1 text-sm text-slate-500">
                    Correct asset types and approve Review rows here first. Then open the merged
                    import summary.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setStep('final')}
                  disabled={!reviewedWorkbook.buildingAddress}
                  className="rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300"
                >
                  View Import Summary
                </button>
              </div>
              {!reviewedWorkbook.buildingAddress.trim() && needsManualAddress && (
                <p className="mt-3 text-xs font-medium text-amber-700">
                  Building address could not be detected automatically. Please enter it manually
                  above before viewing the import summary.
                </p>
              )}
            </div>
          </div>
        )}

        {step === 'final' && finalData && reviewedWorkbook && (
          <div className="space-y-8">
            <div className="rounded-2xl border border-slate-200 bg-white px-6 py-5 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <h2 className="text-base font-semibold text-slate-900">Validation Complete</h2>
                  <p className="mt-1 text-sm text-slate-500">
                    {fileName
                      ? `Parsed ${finalData.rows.length} asset rows from ${fileName}. Asset corrections from Review Sheets are already applied below.`
                      : `Parsed ${finalData.rows.length} asset rows. Asset corrections from Review Sheets are already applied below.`}
                  </p>
                </div>
                <ExportDownloadButtons
                  readyRows={readyExportRows}
                  reviewRows={reviewExportRows}
                  fileName={fileName}
                  summaryReport={summaryReport}
                />
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              {reviewedWorkbook.sheets
                .filter((sheet) => sheet.sheetType !== 'cover-page')
                .map((sheet) => (
                  <div
                    key={`${sheet.name}-final`}
                    className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700"
                  >
                    <span className="font-medium text-slate-900">{sheet.name}:</span>{' '}
                    {getSheetStatusLabel(sheet.rows.length, sheet.errors)}
                  </div>
                ))}
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800 sm:col-span-2">
                Building: {reviewedWorkbook.buildingAddress} · {finalData.rows.length} total asset
                rows
              </div>
            </div>

            <ValidationReport summary={finalKpiSummary ?? finalData.summary} />
            <DataPreviewTable
              rows={finalData.rows}
              errors={finalData.errors}
              showSheetColumn
              showRowColumn={false}
            />
          </div>
        )}
      </main>
    </div>
  );
}
