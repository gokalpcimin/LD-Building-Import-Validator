'use client';

import type { SheetData, WorkbookResult } from '../types';
import { buildReviewWorkbookBuffer, downloadWorkbookBuffer } from '../utils/excelReviewExport';
import { Download, Loader2 } from 'lucide-react';
import { useCallback, useState } from 'react';

/**
 * Annotating the original .xlsx runs server-side (exceljs's browser build
 * hangs on loading real-world workbooks); the server returns the same file
 * with highlights + the Review Status column added.
 */
async function fetchAnnotatedWorkbook(
  originalFile: ArrayBuffer,
  workbook: WorkbookResult,
): Promise<ArrayBuffer> {
  const formData = new FormData();
  formData.append(
    'file',
    new Blob([originalFile], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    }),
  );
  formData.append('workbook', JSON.stringify(workbook));

  const response = await fetch('/api/export-review', { method: 'POST', body: formData });
  if (!response.ok) {
    throw new Error(`Export API failed with status ${response.status}`);
  }
  return response.arrayBuffer();
}

export interface ExportForReviewButtonProps {
  rawSheets: SheetData[];
  workbook: WorkbookResult;
  fileName?: string;
  /** Untouched uploaded .xlsx bytes; when present, the export edits this file directly so all original formatting is preserved. */
  originalFile?: ArrayBuffer;
}

export default function ExportForReviewButton({
  rawSheets,
  workbook,
  fileName,
  originalFile,
}: ExportForReviewButtonProps) {
  const [isExporting, setIsExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  const handleExport = useCallback(async () => {
    setIsExporting(true);
    setExportError(null);
    try {
      const buffer = originalFile
        ? await fetchAnnotatedWorkbook(originalFile, workbook)
        : await buildReviewWorkbookBuffer(rawSheets, workbook);
      const baseName = fileName ? fileName.replace(/\.[^./]+$/, '') : 'import-review';
      downloadWorkbookBuffer(`${baseName}-review.xlsx`, buffer);
    } catch (err) {
      console.error('Review export failed:', err);
      setExportError('Failed to generate the review file. Please try again.');
    } finally {
      setIsExporting(false);
    }
  }, [rawSheets, workbook, fileName, originalFile]);

  return (
    <div className="flex flex-col items-end gap-1.5">
      <button
        type="button"
        onClick={handleExport}
        disabled={isExporting || rawSheets.length === 0}
        title="Downloads the same workbook you uploaded (original formatting preserved for .xlsx), with Blocked rows highlighted red, Review Required rows yellow, Ready rows green, and a Review Status column explaining why."
        className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-5 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {isExporting ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Download className="h-4 w-4" />
        )}
        {isExporting ? 'Generating…' : 'Export for Review'}
      </button>
      {exportError && <p className="text-xs text-red-600">{exportError}</p>}
    </div>
  );
}
