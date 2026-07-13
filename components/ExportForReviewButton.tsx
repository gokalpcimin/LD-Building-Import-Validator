'use client';

import type { SheetData, WorkbookResult } from '../types';
import { buildReviewWorkbookBuffer, downloadWorkbookBuffer } from '../utils/excelReviewExport';
import { Download, Loader2 } from 'lucide-react';
import { useCallback, useState } from 'react';

export interface ExportForReviewButtonProps {
  rawSheets: SheetData[];
  workbook: WorkbookResult;
  fileName?: string;
}

export default function ExportForReviewButton({
  rawSheets,
  workbook,
  fileName,
}: ExportForReviewButtonProps) {
  const [isExporting, setIsExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  const handleExport = useCallback(async () => {
    setIsExporting(true);
    setExportError(null);
    try {
      const buffer = await buildReviewWorkbookBuffer(rawSheets, workbook);
      const baseName = fileName ? fileName.replace(/\.[^./]+$/, '') : 'import-review';
      downloadWorkbookBuffer(`${baseName}-review.xlsx`, buffer);
    } catch (err) {
      console.error('Review export failed:', err);
      setExportError('Failed to generate the review file. Please try again.');
    } finally {
      setIsExporting(false);
    }
  }, [rawSheets, workbook, fileName]);

  return (
    <div className="flex flex-col items-end gap-1.5">
      <button
        type="button"
        onClick={handleExport}
        disabled={isExporting || rawSheets.length === 0}
        title="Downloads the same workbook you uploaded, with Blocked rows highlighted red, Review Required rows highlighted yellow, and a Review Status column explaining why."
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
