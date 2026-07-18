'use client';

import type { ImportReadyExportRow } from '../utils/importReadyExport';
import { downloadImportReadyCsv } from '../utils/importReadyExport';
import { FileDown } from 'lucide-react';
import { useCallback } from 'react';

export interface ImportReadyDownloadButtonProps {
  /** Pre-built export rows (Ready + Review Required only, Blocked excluded). */
  rows: ImportReadyExportRow[];
  fileName?: string;
}

/**
 * Downloads the clean import-ready file — the five platform fields (Address,
 * Asset Type, Floor, Room, Unit) plus Quantity — as CSV. This is the
 * deliverable the case brief describes; the annotated "Export for Review"
 * workbook is the companion output for fixing what didn't make it in.
 */
export default function ImportReadyDownloadButton({
  rows,
  fileName,
}: ImportReadyDownloadButtonProps) {
  const handleDownload = useCallback(() => {
    const baseName = fileName ? fileName.replace(/\.[^./]+$/, '') : 'building-import';
    downloadImportReadyCsv(`${baseName}-import-ready.csv`, rows);
  }, [rows, fileName]);

  return (
    <button
      type="button"
      onClick={handleDownload}
      disabled={rows.length === 0}
      title="Downloads the clean import-ready dataset (Address, Asset Type, Floor, Room, Unit, Quantity) as CSV. Blocked rows are excluded — fix them via Export for Review first."
      className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300"
    >
      <FileDown className="h-4 w-4" />
      Download Import-Ready File ({rows.length})
    </button>
  );
}
