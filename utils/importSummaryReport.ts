import type { ImportReadyRow, ParsedSheet, ValidationError } from '../types';
import type { PastedAssetRow } from './pasteRegisterParser';
import { getSheetStatusLabel, groupRowsByImportStatus } from './validationEngine';

/**
 * Small human-readable import summary for the final step — KPI counts,
 * per-sheet status, asset-type breakdown, and top issues. Complements the
 * Import-Ready / Needs Review CSV downloads (those are row data; this is
 * the one-page report a support user can keep or forward).
 */

export interface ImportSummarySheetLine {
  name: string;
  rowCount: number;
  statusLabel: string;
}

export interface ImportSummaryReportInput {
  fileName?: string;
  buildingAddress: string;
  totalAssets: number;
  distinctLocations: number;
  readyCount: number;
  reviewCount: number;
  blockedCount: number;
  sheets: ImportSummarySheetLine[];
  assetTypeCounts: Record<string, number>;
  topIssues: Array<{ severity: string; message: string; count: number }>;
}

function countByAssetType(rows: ImportReadyRow[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const row of rows) {
    const key = row.assetType || 'Unknown';
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return counts;
}

function topIssueMessages(
  errors: ValidationError[],
  limit = 8,
): Array<{ severity: string; message: string; count: number }> {
  const map = new Map<string, { severity: string; message: string; count: number }>();

  for (const error of errors) {
    if (error.severity === 'info') {
      continue;
    }
    const key = `${error.severity}|${error.message}`;
    const existing = map.get(key);
    if (existing) {
      existing.count += 1;
    } else {
      map.set(key, {
        severity: error.severity,
        message: error.message,
        count: 1,
      });
    }
  }

  return [...map.values()]
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);
}

/** Build summary input from the Excel / workbook final merge. */
export function buildWorkbookSummaryReport(options: {
  fileName?: string;
  buildingAddress: string;
  rows: ImportReadyRow[];
  errors: ValidationError[];
  sheets: ParsedSheet[];
  distinctLocations: number;
}): ImportSummaryReportInput {
  const { readyRows, reviewRows, blockedRows } = groupRowsByImportStatus(
    options.rows,
    options.errors,
  );

  const sheets = options.sheets
    .filter((sheet) => sheet.sheetType !== 'cover-page')
    .map((sheet) => ({
      name: sheet.name,
      rowCount: sheet.rows.length,
      statusLabel: getSheetStatusLabel(sheet.rows.length, sheet.errors),
    }));

  return {
    fileName: options.fileName,
    buildingAddress: options.buildingAddress,
    totalAssets: options.rows.length,
    distinctLocations: options.distinctLocations,
    readyCount: readyRows.length,
    reviewCount: reviewRows.length,
    blockedCount: blockedRows.length,
    sheets,
    assetTypeCounts: countByAssetType(options.rows),
    topIssues: topIssueMessages(options.errors),
  };
}

/** Build summary input from the paste-register review flow. */
export function buildPasteSummaryReport(options: {
  address: string;
  rows: PastedAssetRow[];
  distinctLocations: number;
}): ImportSummaryReportInput {
  const readyCount = options.rows.filter((row) => row.importStatus === 'READY').length;
  const reviewCount = options.rows.filter((row) => row.importStatus === 'REVIEW_REQUIRED').length;
  const blockedCount = options.rows.filter((row) => row.importStatus === 'BLOCKED').length;

  const assetTypeCounts: Record<string, number> = {};
  for (const row of options.rows) {
    if (row.detectedAssets && row.detectedAssets.length > 0) {
      for (const asset of row.detectedAssets) {
        assetTypeCounts[asset.assetType] = (assetTypeCounts[asset.assetType] ?? 0) + 1;
      }
    } else {
      const key = row.assetType.value ?? 'Unknown';
      assetTypeCounts[key] = (assetTypeCounts[key] ?? 0) + 1;
    }
  }

  const issueMap = new Map<string, { severity: string; message: string; count: number }>();
  for (const row of options.rows) {
    for (const issue of row.issues) {
      const severity = issue.severity === 'critical' ? 'error' : 'warning';
      const key = `${severity}|${issue.message}`;
      const existing = issueMap.get(key);
      if (existing) {
        existing.count += 1;
      } else {
        issueMap.set(key, { severity, message: issue.message, count: 1 });
      }
    }
  }

  return {
    fileName: 'Pasted Data',
    buildingAddress: options.address,
    totalAssets: options.rows.length,
    distinctLocations: options.distinctLocations,
    readyCount,
    reviewCount,
    blockedCount,
    sheets: [
      {
        name: 'Pasted Data',
        rowCount: options.rows.length,
        statusLabel: `✔ ${readyCount} ready · ⚠ ${reviewCount} review · ✕ ${blockedCount} blocked`,
      },
    ],
    assetTypeCounts,
    topIssues: [...issueMap.values()].sort((a, b) => b.count - a.count).slice(0, 8),
  };
}

export function formatImportSummaryReport(input: ImportSummaryReportInput): string {
  const generatedAt = new Date().toISOString().slice(0, 19).replace('T', ' ');
  const lines: string[] = [
    'LD Building Import Validator — Import Summary Report',
    '====================================================',
    '',
    `Generated:        ${generatedAt}`,
    `Source file:      ${input.fileName?.trim() || '—'}`,
    `Building address: ${input.buildingAddress.trim() || '—'}`,
    '',
    'Overview',
    '--------',
    `Total asset rows:     ${input.totalAssets}`,
    `Distinct locations:   ${input.distinctLocations}`,
    `Ready (importable):   ${input.readyCount}`,
    `Review required:      ${input.reviewCount}`,
    `Blocked:              ${input.blockedCount}`,
    '',
  ];

  lines.push('Sheets');
  lines.push('------');
  if (input.sheets.length === 0) {
    lines.push('(no asset sheets)');
  } else {
    for (const sheet of input.sheets) {
      lines.push(`• ${sheet.name} — ${sheet.rowCount} rows — ${sheet.statusLabel}`);
    }
  }
  lines.push('');

  lines.push('Asset types');
  lines.push('-----------');
  const assetEntries = Object.entries(input.assetTypeCounts).sort((a, b) => b[1] - a[1]);
  if (assetEntries.length === 0) {
    lines.push('(none)');
  } else {
    for (const [type, count] of assetEntries) {
      lines.push(`• ${type}: ${count}`);
    }
  }
  lines.push('');

  lines.push('Top issues (errors & warnings)');
  lines.push('------------------------------');
  if (input.topIssues.length === 0) {
    lines.push('(none)');
  } else {
    for (const issue of input.topIssues) {
      const label = issue.severity === 'error' ? 'ERROR' : 'WARNING';
      lines.push(`• [${label}] ${issue.message} (×${issue.count})`);
    }
  }
  lines.push('');
  lines.push('Notes');
  lines.push('-----');
  lines.push('• Ready rows can be downloaded as Import-Ready CSV for platform ingest.');
  lines.push('• Review Required rows can be downloaded as Needs Review CSV for human check.');
  lines.push('• Blocked rows are excluded from both CSV exports.');
  lines.push('');

  return lines.join('\n');
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const STATUS_COLORS = {
  ready: '#059669',
  review: '#d97706',
  blocked: '#dc2626',
};

const ASSET_PALETTE = [
  '#0f766e',
  '#0369a1',
  '#b45309',
  '#334155',
  '#be123c',
  '#3f6212',
  '#0e7490',
  '#9a3412',
  '#1e3a5f',
  '#57534e',
];

interface ChartSlice {
  label: string;
  value: number;
  color: string;
}

function polar(cx: number, cy: number, r: number, angleDeg: number) {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

function donutSvg(slices: ChartSlice[], centerMain: string, centerSub: string): string {
  const total = slices.reduce((sum, slice) => sum + slice.value, 0);
  const size = 220;
  const cx = size / 2;
  const cy = size / 2;
  const r = 78;
  const stroke = 32;

  if (total === 0) {
    return `<div class="empty-chart">No data</div>`;
  }

  let angle = 0;
  const paths: string[] = [
    `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="#e2e8f0" stroke-width="${stroke}" />`,
  ];

  for (const slice of slices.filter((s) => s.value > 0)) {
    const sweep = (slice.value / total) * 360;
    const start = angle;
    const end = angle + sweep;
    angle = end;

    if (sweep >= 359.9) {
      paths.push(
        `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${slice.color}" stroke-width="${stroke}" />`,
      );
      continue;
    }

    const a = polar(cx, cy, r, end);
    const b = polar(cx, cy, r, start);
    const large = sweep > 180 ? 1 : 0;
    paths.push(
      `<path d="M ${a.x} ${a.y} A ${r} ${r} 0 ${large} 0 ${b.x} ${b.y}" fill="none" stroke="${slice.color}" stroke-width="${stroke}" />`,
    );
  }

  return `
    <div class="donut-wrap">
      <svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">${paths.join('')}</svg>
      <div class="donut-center">
        <div class="donut-main">${escapeHtml(centerMain)}</div>
        <div class="donut-sub">${escapeHtml(centerSub)}</div>
      </div>
    </div>
  `;
}

function legendHtml(slices: ChartSlice[]): string {
  const total = slices.reduce((sum, slice) => sum + slice.value, 0) || 1;
  return `<ul class="legend">${slices
    .map((slice) => {
      const pct = Math.round((slice.value / total) * 100);
      return `<li>
        <span class="legend-left">
          <span class="dot" style="background:${slice.color}"></span>
          <span>${escapeHtml(slice.label)}</span>
        </span>
        <span class="legend-right">${slice.value.toLocaleString()} <em>${pct}%</em></span>
      </li>`;
    })
    .join('')}</ul>`;
}

/** Self-contained HTML report with charts — open in browser or download. */
export function formatImportSummaryReportHtml(input: ImportSummaryReportInput): string {
  const generatedAt = new Date().toISOString().slice(0, 19).replace('T', ' ');
  const fileName = escapeHtml(input.fileName?.trim() || '—');
  const address = escapeHtml(input.buildingAddress.trim() || '—');

  const statusSlices: ChartSlice[] = [
    { label: 'Ready', value: input.readyCount, color: STATUS_COLORS.ready },
    { label: 'Review Required', value: input.reviewCount, color: STATUS_COLORS.review },
    { label: 'Blocked', value: input.blockedCount, color: STATUS_COLORS.blocked },
  ].filter((slice) => slice.value > 0);

  const assetSlices: ChartSlice[] = Object.entries(input.assetTypeCounts)
    .sort((a, b) => b[1] - a[1])
    .map(([label, value], index) => ({
      label,
      value,
      color: ASSET_PALETTE[index % ASSET_PALETTE.length],
    }));

  const maxSheet = Math.max(...input.sheets.map((sheet) => sheet.rowCount), 1);
  const sheetsHtml =
    input.sheets.length === 0
      ? '<p class="muted">No asset sheets.</p>'
      : `<ul class="bars">${input.sheets
          .map((sheet) => {
            const width = Math.max(8, Math.round((sheet.rowCount / maxSheet) * 100));
            return `<li>
              <div class="bar-head">
                <strong>${escapeHtml(sheet.name)}</strong>
                <span>${sheet.rowCount} rows</span>
              </div>
              <div class="bar-track"><div class="bar-fill" style="width:${width}%"></div></div>
              <div class="bar-sub">${escapeHtml(sheet.statusLabel)}</div>
            </li>`;
          })
          .join('')}</ul>`;

  const issuesHtml =
    input.topIssues.length === 0
      ? `<div class="ok-box">No blocking or review issues — clean enough for import review.</div>`
      : `<ul class="issues">${input.topIssues
          .map((issue) => {
            const cls = issue.severity === 'error' ? 'issue error' : 'issue warn';
            const label = issue.severity === 'error' ? 'Critical' : 'Warning';
            return `<li class="${cls}">
              <span><strong>${label}:</strong> ${escapeHtml(issue.message)}</span>
              <span class="badge">×${issue.count}</span>
            </li>`;
          })
          .join('')}</ul>`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Import Summary Report — LD Building Import Validator</title>
  <style>
    :root {
      --ink: #0f172a;
      --muted: #64748b;
      --line: #e2e8f0;
      --card: #ffffff;
      --bg: #f8fafc;
      --teal: #0f766e;
      --sky: #0369a1;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: "Segoe UI", ui-sans-serif, system-ui, -apple-system, sans-serif;
      color: var(--ink);
      background:
        radial-gradient(circle at 12% 0%, rgba(15,118,110,0.12), transparent 42%),
        radial-gradient(circle at 90% 8%, rgba(3,105,161,0.10), transparent 40%),
        linear-gradient(180deg, #f1f5f9 0%, var(--bg) 40%, #fff 100%);
      min-height: 100vh;
    }
    .page { max-width: 1080px; margin: 0 auto; padding: 32px 20px 48px; }
    .hero {
      background: linear-gradient(135deg, #fff 0%, #f0fdfa 55%, #e0f2fe 100%);
      border: 1px solid var(--line);
      border-radius: 24px;
      padding: 28px 28px 22px;
      box-shadow: 0 10px 30px rgba(15, 23, 42, 0.06);
    }
    .eyebrow {
      font-size: 11px;
      letter-spacing: 0.18em;
      text-transform: uppercase;
      font-weight: 700;
      color: var(--teal);
      margin: 0 0 8px;
    }
    h1 { margin: 0; font-size: 28px; letter-spacing: -0.03em; }
    .meta { margin-top: 8px; color: var(--muted); font-size: 14px; line-height: 1.5; }
    .kpis {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 12px;
      margin-top: 22px;
    }
    .kpi {
      background: rgba(255,255,255,0.85);
      border: 1px solid var(--line);
      border-radius: 16px;
      padding: 14px 16px;
    }
    .kpi .label { font-size: 11px; text-transform: uppercase; letter-spacing: 0.08em; color: var(--muted); font-weight: 600; }
    .kpi .value { margin-top: 6px; font-size: 24px; font-weight: 700; letter-spacing: -0.03em; }
    .kpi.ready { border-color: #a7f3d0; background: #ecfdf5; }
    .kpi.review { border-color: #fde68a; background: #fffbeb; }
    .kpi.blocked { border-color: #fecaca; background: #fef2f2; }
    .grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 16px;
      margin-top: 16px;
    }
    .card {
      background: var(--card);
      border: 1px solid var(--line);
      border-radius: 20px;
      padding: 20px;
      box-shadow: 0 6px 18px rgba(15, 23, 42, 0.04);
    }
    .card h2 { margin: 0 0 14px; font-size: 15px; }
    .donut-wrap { position: relative; width: 220px; height: 220px; margin: 0 auto; }
    .donut-center {
      position: absolute; inset: 0;
      display: flex; flex-direction: column; align-items: center; justify-content: center;
      text-align: center; pointer-events: none;
    }
    .donut-main { font-size: 26px; font-weight: 700; letter-spacing: -0.03em; }
    .donut-sub { font-size: 11px; text-transform: uppercase; letter-spacing: 0.12em; color: var(--muted); font-weight: 600; }
    .legend { list-style: none; margin: 16px 0 0; padding: 0; }
    .legend li {
      display: flex; justify-content: space-between; gap: 12px;
      padding: 6px 0; font-size: 13px; border-bottom: 1px solid #f1f5f9;
    }
    .legend li:last-child { border-bottom: 0; }
    .legend-left { display: flex; align-items: center; gap: 8px; min-width: 0; }
    .dot { width: 10px; height: 10px; border-radius: 999px; flex: 0 0 auto; }
    .legend-right { font-weight: 600; white-space: nowrap; }
    .legend-right em { font-style: normal; color: var(--muted); font-weight: 500; margin-left: 6px; font-size: 12px; }
    .bars { list-style: none; margin: 0; padding: 0; display: grid; gap: 14px; }
    .bar-head { display: flex; justify-content: space-between; gap: 10px; font-size: 13px; margin-bottom: 6px; }
    .bar-head span { color: var(--muted); }
    .bar-track { height: 8px; background: #e2e8f0; border-radius: 999px; overflow: hidden; }
    .bar-fill {
      height: 100%;
      border-radius: 999px;
      background: linear-gradient(90deg, var(--teal), var(--sky));
    }
    .bar-sub { margin-top: 4px; font-size: 12px; color: var(--muted); }
    .issues { list-style: none; margin: 0; padding: 0; display: grid; gap: 8px; }
    .issue {
      display: flex; justify-content: space-between; gap: 12px;
      border-radius: 12px; padding: 10px 12px; font-size: 13px; line-height: 1.4;
    }
    .issue.error { background: #fef2f2; color: #7f1d1d; }
    .issue.warn { background: #fffbeb; color: #78350f; }
    .badge {
      flex: 0 0 auto; align-self: flex-start;
      background: rgba(255,255,255,0.75);
      border-radius: 999px; padding: 2px 8px; font-size: 12px; font-weight: 700;
    }
    .ok-box {
      border: 1px dashed #a7f3d0; background: #ecfdf5; color: #065f46;
      border-radius: 14px; padding: 28px 16px; text-align: center; font-size: 14px;
    }
    .footer {
      margin-top: 18px; color: var(--muted); font-size: 12px; text-align: center;
    }
    .empty-chart {
      width: 220px; height: 220px; margin: 0 auto;
      display: flex; align-items: center; justify-content: center;
      border-radius: 999px; background: #f1f5f9; color: var(--muted);
    }
    @media (max-width: 820px) {
      .kpis, .grid { grid-template-columns: 1fr; }
    }
    @media print {
      body { background: #fff; }
      .page { padding: 0; }
      .hero, .card { box-shadow: none; }
      .no-print { display: none !important; }
    }
    .hero-top {
      display: flex;
      flex-wrap: wrap;
      align-items: flex-start;
      justify-content: space-between;
      gap: 16px;
    }
    .toolbar {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
    }
    .toolbar button {
      appearance: none;
      border: 1px solid #99f6e4;
      background: #f0fdfa;
      color: #115e59;
      border-radius: 10px;
      padding: 10px 14px;
      font-size: 13px;
      font-weight: 600;
      cursor: pointer;
    }
    .toolbar button.secondary {
      border-color: var(--line);
      background: #fff;
      color: #334155;
    }
    .toolbar button:hover { filter: brightness(0.97); }
  </style>
</head>
<body>
  <div class="page">
    <header class="hero">
      <div class="hero-top">
        <div>
          <p class="eyebrow">LD Building Import Validator</p>
          <h1>Import Summary Report</h1>
          <p class="meta">
            Generated ${escapeHtml(generatedAt)}<br />
            Source: <strong>${fileName}</strong><br />
            Building: <strong>${address}</strong>
          </p>
        </div>
        <div class="toolbar no-print">
          <button type="button" onclick="downloadReport()">Download HTML</button>
          <button type="button" class="secondary" onclick="window.print()">Print / PDF</button>
        </div>
      </div>
      <div class="kpis">
        <div class="kpi"><div class="label">Total assets</div><div class="value">${input.totalAssets.toLocaleString()}</div></div>
        <div class="kpi"><div class="label">Distinct locations</div><div class="value">${input.distinctLocations.toLocaleString()}</div></div>
        <div class="kpi ready"><div class="label">Ready</div><div class="value">${input.readyCount.toLocaleString()}</div></div>
        <div class="kpi ${input.blockedCount > 0 ? 'blocked' : 'review'}"><div class="label">Review / blocked</div><div class="value">${(input.reviewCount + input.blockedCount).toLocaleString()}</div></div>
      </div>
    </header>

    <div class="grid">
      <section class="card">
        <h2>Import readiness</h2>
        ${donutSvg(statusSlices, input.totalAssets.toLocaleString(), 'rows')}
        ${legendHtml(statusSlices)}
      </section>
      <section class="card">
        <h2>Asset type mix</h2>
        ${donutSvg(assetSlices, String(assetSlices.length), 'types')}
        ${legendHtml(assetSlices)}
      </section>
    </div>

    <div class="grid">
      <section class="card">
        <h2>Sheets</h2>
        ${sheetsHtml}
      </section>
      <section class="card">
        <h2>Top issues</h2>
        ${issuesHtml}
      </section>
    </div>

    <p class="footer">
      Ready CSV = platform ingest · Needs Review CSV = human queue · Blocked rows are excluded from both exports
    </p>
  </div>
  <script>
    function downloadReport() {
      var html = "<!DOCTYPE html>\\n" + document.documentElement.outerHTML;
      var blob = new Blob([html], { type: "text/html;charset=utf-8" });
      var url = URL.createObjectURL(blob);
      var link = document.createElement("a");
      link.href = url;
      link.download = ${JSON.stringify(
        `${(input.fileName || 'building-import').replace(/\.[^./]+$/, '')}-import-summary.html`,
      )};
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    }
  </script>
</body>
</html>`;
}

function openOrDownloadHtml(filename: string, html: string, mode: 'download' | 'view'): void {
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);

  if (mode === 'view') {
    window.open(url, '_blank', 'noopener,noreferrer');
    // Revoke later so the new tab can load the blob.
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    return;
  }

  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function downloadImportSummaryReport(
  filename: string,
  input: ImportSummaryReportInput,
): void {
  const htmlName = filename.replace(/\.txt$/i, '.html');
  openOrDownloadHtml(htmlName, formatImportSummaryReportHtml(input), 'download');
}

/** Opens the colorful HTML report in a new browser tab. */
export function viewImportSummaryReport(input: ImportSummaryReportInput): void {
  openOrDownloadHtml('import-summary.html', formatImportSummaryReportHtml(input), 'view');
}
