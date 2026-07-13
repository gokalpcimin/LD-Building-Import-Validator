'use client';

import type { SheetData } from '../types';
import { parsePastedText } from '../utils/pastedTextParser';
import { classifySheet, getSheetTypeLabel } from '../utils/sheetDetection';
import { ClipboardPaste, FileSpreadsheet } from 'lucide-react';
import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import { useCallback, useRef, useState } from 'react';

type IngestMode = 'upload' | 'paste';

export interface FileUploaderProps {
  onDataLoaded: (sheets: SheetData[], fileName?: string) => void;
}

function parseCsvFile(file: File): Promise<SheetData[]> {
  return new Promise((resolve, reject) => {
    Papa.parse<string[]>(file, {
      complete: (results) => {
        const rows = results.data.map((row) => row.map((cell) => (cell ?? '').trim()));

        resolve([{ name: 'Imported Data', data: rows }]);
      },
      error: (error) => reject(error),
      skipEmptyLines: false,
    });
  });
}

function parseSheetRows(sheet: XLSX.WorkSheet): string[][] {
  const rows = XLSX.utils.sheet_to_json<string[]>(sheet, {
    header: 1,
    raw: false,
    defval: '',
    blankrows: true,
  });

  return rows.map((row) => row.map((cell) => (cell ?? '').toString().trim()));
}

function parseExcelFile(file: File): Promise<SheetData[]> {
  return file.arrayBuffer().then((arrayBuffer) => {
    const workbook = XLSX.read(arrayBuffer, { type: 'array' });

    return workbook.SheetNames.map((sheetName) => ({
      name: sheetName,
      data: parseSheetRows(workbook.Sheets[sheetName]),
    })).filter((sheet) => sheet.data.some((row) => row.some((cell) => cell.length > 0)));
  });
}

export default function FileUploader({ onDataLoaded }: FileUploaderProps) {
  const [mode, setMode] = useState<IngestMode>('upload');
  const [pasteValue, setPasteValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingSheets, setPendingSheets] = useState<SheetData[] | null>(null);
  const [pendingFileName, setPendingFileName] = useState<string | undefined>();
  const [selectedSheetNames, setSelectedSheetNames] = useState<Set<string>>(new Set());
  const fileInputRef = useRef<HTMLInputElement>(null);

  const resetPendingSelection = useCallback(() => {
    setPendingSheets(null);
    setPendingFileName(undefined);
    setSelectedSheetNames(new Set());
  }, []);

  const handleData = useCallback(
    (sheets: SheetData[], fileName?: string) => {
      const hasContent = sheets.some((sheet) =>
        sheet.data.some((row) => row.some((cell) => cell.length > 0)),
      );

      if (sheets.length === 0 || !hasContent) {
        setError('No data found. Please provide at least one row.');
        return;
      }

      setError(null);
      resetPendingSelection();
      onDataLoaded(sheets, fileName);
    },
    [onDataLoaded, resetPendingSelection],
  );

  const processFile = useCallback(
    async (file: File) => {
      const fileName = file.name.toLowerCase();
      const isCsv = fileName.endsWith('.csv');
      const isExcel = fileName.endsWith('.xlsx') || fileName.endsWith('.xls');

      if (!isCsv && !isExcel) {
        setError('Please upload a valid CSV or Excel (.xlsx / .xls) file.');
        return;
      }

      setIsLoading(true);
      setError(null);
      resetPendingSelection();

      try {
        const sheets = isExcel ? await parseExcelFile(file) : await parseCsvFile(file);

        if (sheets.length > 1) {
          setPendingSheets(sheets);
          setPendingFileName(file.name);
          setSelectedSheetNames(new Set(sheets.map((sheet) => sheet.name)));
        } else {
          handleData(sheets, file.name);
        }
      } catch (err) {
        console.error('File parsing error:', err);
        setError('Failed to parse the file. Please check the format and try again.');
      } finally {
        setIsLoading(false);
      }
    },
    [handleData, resetPendingSelection],
  );

  const handlePasteSubmit = useCallback(() => {
    handleData([{ name: 'Pasted Data', data: parsePastedText(pasteValue) }]);
  }, [handleData, pasteValue]);

  const toggleSheetSelection = useCallback((sheetName: string) => {
    setSelectedSheetNames((current) => {
      const next = new Set(current);
      if (next.has(sheetName)) {
        next.delete(sheetName);
      } else {
        next.add(sheetName);
      }
      return next;
    });
  }, []);

  const handleSelectAllSheets = useCallback(() => {
    if (!pendingSheets) {
      return;
    }
    setSelectedSheetNames(new Set(pendingSheets.map((sheet) => sheet.name)));
  }, [pendingSheets]);

  const handleConfirmSheetSelection = useCallback(() => {
    if (!pendingSheets) {
      return;
    }

    const selected = pendingSheets.filter((sheet) => selectedSheetNames.has(sheet.name));
    if (selected.length === 0) {
      setError('Select at least one sheet to continue.');
      return;
    }

    handleData(selected, pendingFileName);
  }, [handleData, pendingFileName, pendingSheets, selectedSheetNames]);

  const showSheetSelector = pendingSheets !== null && pendingSheets.length > 1;

  return (
    <div className="w-full max-w-3xl rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-200 px-6 py-5">
        <h2 className="text-lg font-semibold text-slate-900">Import Building Data</h2>
        <p className="mt-1 text-sm text-slate-500">
          {showSheetSelector
            ? 'Choose which sheets to import. All sheets are selected by default.'
            : 'Upload an Excel workbook or CSV file. Excel files with multiple sheets are supported.'}
        </p>
      </div>

      {!showSheetSelector && (
        <div className="flex gap-1 border-b border-slate-200 px-6 pt-4">
          <button
            type="button"
            onClick={() => setMode('upload')}
            className={`px-4 py-2.5 text-sm font-medium ${
              mode === 'upload' ? 'border-b-2 border-blue-600 text-blue-600' : 'text-slate-500'
            }`}
          >
            Upload File
          </button>
          <button
            type="button"
            onClick={() => setMode('paste')}
            className={`px-4 py-2.5 text-sm font-medium ${
              mode === 'paste' ? 'border-b-2 border-blue-600 text-blue-600' : 'text-slate-500'
            }`}
          >
            Paste Data
          </button>
        </div>
      )}

      <div className="p-6">
        {showSheetSelector ? (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm text-slate-600">
                <span className="font-medium text-slate-900">{pendingFileName}</span> —{' '}
                {selectedSheetNames.size} of {pendingSheets.length} sheets selected
              </p>
              <button
                type="button"
                onClick={handleSelectAllSheets}
                className="text-sm font-medium text-blue-600 hover:text-blue-700"
              >
                Select all
              </button>
            </div>

            <div className="divide-y divide-slate-100 rounded-xl border border-slate-200">
              {pendingSheets.map((sheet) => {
                const sheetType = classifySheet(sheet.name);
                const rowCount = sheet.data.filter((row) =>
                  row.some((cell) => cell.length > 0),
                ).length;
                const isSelected = selectedSheetNames.has(sheet.name);

                return (
                  <label
                    key={sheet.name}
                    className={`flex cursor-pointer items-center gap-4 px-4 py-3 transition hover:bg-slate-50 ${
                      isSelected ? 'bg-blue-50/40' : ''
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggleSheetSelection(sheet.name)}
                      className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-slate-900">{sheet.name}</p>
                      <p className="text-xs text-slate-500">
                        {getSheetTypeLabel(sheetType)} · {rowCount} rows
                      </p>
                    </div>
                  </label>
                );
              })}
            </div>

            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                onClick={handleConfirmSheetSelection}
                disabled={selectedSheetNames.size === 0}
                className="rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300"
              >
                Continue with {selectedSheetNames.size} sheet
                {selectedSheetNames.size === 1 ? '' : 's'}
              </button>
              <button
                type="button"
                onClick={resetPendingSelection}
                className="rounded-lg border border-slate-300 bg-white px-5 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
              >
                Choose another file
              </button>
            </div>
          </div>
        ) : mode === 'upload' ? (
          <div
            onClick={() => fileInputRef.current?.click()}
            onDrop={(event) => {
              event.preventDefault();
              if (event.dataTransfer.files[0]) {
                void processFile(event.dataTransfer.files[0]);
              }
            }}
            onDragOver={(event) => event.preventDefault()}
            className="flex min-h-56 cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 p-10 text-center"
          >
            <FileSpreadsheet className="mb-4 h-10 w-10 text-blue-600" />
            <p className="font-medium text-slate-900">
              {isLoading ? 'Processing...' : 'Click or drop files here'}
            </p>
            <p className="mt-2 text-xs text-slate-400">Supports .csv, .xlsx, .xls</p>
            <p className="mt-3 text-xs text-slate-500">
              Demo file:{' '}
              <code className="rounded bg-slate-200 px-1">
                samples/customer-building-portfolio.xlsx
              </code>
            </p>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,.xlsx,.xls"
              className="hidden"
              onChange={(event) =>
                event.target.files && void processFile(event.target.files[0])
              }
            />
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-start gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
              <ClipboardPaste className="mt-0.5 h-5 w-5 shrink-0 text-blue-600" />
              <p className="text-sm text-slate-600">
                Paste rows copied from Excel, Sheets, or any tab/comma-separated text.
              </p>
            </div>
            <textarea
              className="h-40 w-full rounded-lg border border-slate-300 p-3 font-mono text-xs"
              placeholder="Paste Excel data here..."
              value={pasteValue}
              onChange={(event) => setPasteValue(event.target.value)}
            />
            <button
              type="button"
              onClick={handlePasteSubmit}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-700"
            >
              Parse Data
            </button>
          </div>
        )}
        {error && <p className="mt-4 text-sm text-red-600">{error}</p>}
      </div>
    </div>
  );
}
