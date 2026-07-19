'use client';

import type { ImportReadyExportRow } from '../utils/importReadyExport';
import { downloadImportReadyCsv } from '../utils/importReadyExport';
import { AlertTriangle, FileDown } from 'lucide-react';
import { useCallback } from 'react';

export interface ExportDownloadButtonsProps {
  readyRows: ImportReadyExportRow[];
  reviewRows: ImportReadyExportRow[];
  fileName?: string;
}

/**
 * Two CSV downloads with the same columns (Address, Asset Type, Floor, Room,
 * Unit), split by import status:
 * - Import-Ready → only READY rows (platform ingest)
 * - Needs Review → only REVIEW_REQUIRED rows (human queue)
 * Blocked rows are in neither file.
 */
export default function ExportDownloadButtons({
  readyRows,
  reviewRows,
  fileName,
}: ExportDownloadButtonsProps) {
  const baseName = fileName ? fileName.replace(/\.[^./]+$/, '') : 'building-import';

  const handleReadyDownload = useCallback(() => {
    downloadImportReadyCsv(`${baseName}-import-ready.csv`, readyRows);
  }, [baseName, readyRows]);

  const handleReviewDownload = useCallback(() => {
    downloadImportReadyCsv(`${baseName}-needs-review.csv`, reviewRows);
  }, [baseName, reviewRows]);

  return (
    <div className="flex flex-wrap items-start justify-end gap-2">
      <button
        type="button"
        onClick={handleReadyDownload}
        disabled={readyRows.length === 0}
        title="Downloads only Ready rows — the clean file the platform can ingest. Blocked and Review Required rows are excluded."
        className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-slate-300"
      >
        <FileDown className="h-4 w-4" />
        Download Import-Ready ({readyRows.length})
      </button>
      <button
        type="button"
        onClick={handleReviewDownload}
        disabled={reviewRows.length === 0}
        title="Downloads only Review Required rows — uncertain records for a human to check before import. Blocked and Ready rows are excluded."
        className="inline-flex items-center gap-2 rounded-lg border border-amber-300 bg-amber-50 px-5 py-2.5 text-sm font-medium text-amber-900 transition hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-50"
      >
        <AlertTriangle className="h-4 w-4" />
        Download Needs Review ({reviewRows.length})
      </button>
    </div>
  );
}
