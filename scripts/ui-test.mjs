/**
 * Browser UI test — uploads Excel and walks through all 3 workflow steps.
 * Run: npx tsx scripts/ui-test.mjs
 */
import puppeteer from 'puppeteer';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { mkdtempSync, readdirSync, readFileSync } from 'fs';
import { tmpdir } from 'os';

const __dirname = dirname(fileURLToPath(import.meta.url));
const EXCEL = join(__dirname, '../samples/risk-assessment-case-study.xlsx');

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    passed += 1;
    console.log(`  ✓ ${message}`);
  } else {
    failed += 1;
    console.log(`  ✗ FAIL: ${message}`);
  }
}

async function wait(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

console.log('\n═══════════════════════════════════════════════════');
console.log('  Browser UI Test — Full Workflow');
console.log('═══════════════════════════════════════════════════\n');

const browser = await puppeteer.launch({ headless: true });
const page = await browser.newPage();

try {
  // STEP 1: Upload page
  console.log('UI STEP 1 — Upload page loads');
  await page.goto('http://localhost:3000', { waitUntil: 'networkidle0' });
  const title = await page.title();
  assert(title.includes('LD Building Import Validator'), `Page title: "${title}"`);

  const uploadHeading = await page.$eval('h2', (el) => el.textContent);
  assert(uploadHeading?.includes('Import Building Data'), 'Upload screen visible');

  // STEP 2: Upload Excel file + multi-sheet selection
  console.log('\nUI STEP 2 — Upload Excel file & sheet selection');
  const fileInput = await page.$('input[type=file]');
  assert(!!fileInput, 'File input found');
  await fileInput.uploadFile(EXCEL);
  await wait(2000);

  const sheetSelectorVisible = await page.evaluate(() =>
    document.body.textContent?.includes('Choose which sheets to import'),
  );
  assert(sheetSelectorVisible, 'Multi-sheet selector shown after Excel upload');

  const allCheckboxesChecked = await page.evaluate(() => {
    const boxes = [...document.querySelectorAll('input[type=checkbox]')];
    return boxes.length === 4 && boxes.every((box) => box.checked);
  });
  assert(allCheckboxesChecked, 'All 4 sheets selected by default');

  const continued = await page.evaluate(() => {
    const btn = [...document.querySelectorAll('button')].find((b) =>
      b.textContent?.includes('Continue with'),
    );
    if (btn) {
      btn.click();
      return true;
    }
    return false;
  });
  assert(continued, 'Clicked Continue with selected sheets');
  await wait(2000);

  // Should advance to the Column Mapping step
  const mappingStepLabel = await page.evaluate(() => {
    const spans = [...document.querySelectorAll('span')];
    return spans.find((s) => s.textContent === 'Column Mapping')?.className ?? '';
  });
  assert(mappingStepLabel.includes('slate-900'), 'Advanced to Step 2: Column Mapping');

  // STEP 2b: Column Mapping — auto-detected defaults, per-sheet tables
  console.log('\nUI STEP 2b — Column Mapping screen');
  const mappingHeading = await page.evaluate(() =>
    document.body.textContent?.includes('Confirm Column Mapping'),
  );
  assert(mappingHeading, 'Column Mapping heading visible');

  const locationRolesDetected = await page.evaluate(() => {
    const selects = [...document.querySelectorAll('select')];
    return selects.filter((s) => s.value === 'location').length;
  });
  assert(
    locationRolesDetected === 3,
    `3 columns auto-mapped to "location" role (got ${locationRolesDetected})`,
  );

  const mappingConfirmed = await page.evaluate(() => {
    const btn = [...document.querySelectorAll('button')].find((b) =>
      b.textContent?.includes('Confirm Mapping'),
    );
    if (btn) {
      btn.click();
      return true;
    }
    return false;
  });
  assert(mappingConfirmed, 'Clicked "Confirm Mapping & Continue"');
  await wait(1500);

  // Should advance to workspace step
  const step2Label = await page.evaluate(() => {
    const spans = [...document.querySelectorAll('span')];
    return spans.find((s) => s.textContent === 'Review Sheets')?.className ?? '';
  });
  assert(step2Label.includes('slate-900'), 'Advanced to Step 3: Review Sheets');

  // STEP 3: Sheet tabs visible
  console.log('\nUI STEP 3 — Sheet tabs navigation');
  const tabs = await page.$$eval('button', (buttons) =>
    buttons
      .map((b) => b.textContent?.trim())
      .filter((t) =>
        ['Cover Page', 'Monthly Outlet', 'Annual TMVs', 'Expansion Vessels'].includes(t ?? ''),
      ),
  );
  assert(tabs.length === 4, `4 sheet type tabs visible: ${tabs.join(', ')}`);

  // Click each tab and verify content
  for (const tabName of ['Cover Page', 'Monthly Outlet', 'Annual TMVs', 'Expansion Vessels']) {
    await page.evaluate((name) => {
      const btn = [...document.querySelectorAll('button')].find((b) => b.textContent?.trim() === name);
      btn?.click();
    }, tabName);
    await wait(500);

    const panelHeading = await page.$eval('h2', (el) => el.textContent?.trim());
    assert(!!panelHeading, `Tab "${tabName}" shows panel (sheet: ${panelHeading})`);
  }

  // STEP 4: Cover Page — address detected
  console.log('\nUI STEP 4 — Cover Page address');
  await page.evaluate(() => {
    const btn = [...document.querySelectorAll('button')].find((b) => b.textContent?.trim() === 'Cover Page');
    btn?.click();
  });
  await wait(500);

  const addressValue = await page.$eval('input[type=text]', (el) => el.value);
  assert(addressValue.includes('52 North Lane'), `Address input shows: "${addressValue.slice(0, 40)}..."`);

  const globalBanner = await page.evaluate(() => {
    return document.body.textContent?.includes('applied to all asset rows');
  });
  assert(globalBanner, 'Global address banner visible');

  // STEP 5: Monthly Outlet — preview table
  console.log('\nUI STEP 5 — Monthly Outlet preview');
  await page.evaluate(() => {
    const btn = [...document.querySelectorAll('button')].find((b) => b.textContent?.trim() === 'Monthly Outlet');
    btn?.click();
  });
  await wait(500);

  const kpiAssets = await page.evaluate(() => {
    const labels = [...document.querySelectorAll('p')].map((p) => p.textContent);
    return labels.some((l) => l?.includes('Assets Imported'));
  });
  assert(kpiAssets, 'Validation KPI cards visible on Monthly Outlet');

  const readyTab = await page.evaluate(() => {
    const btn = [...document.querySelectorAll('button')].find((b) => b.textContent?.includes('Ready for Import'));
    return !!btn;
  });
  assert(readyTab, 'Data Preview "Ready for Import" tab visible');

  const reviewTab = await page.evaluate(() => {
    const btn = [...document.querySelectorAll('button')].find((b) => b.textContent?.includes('Requires Review'));
    btn?.click();
    return true;
  });
  await wait(300);
  assert(reviewTab, 'Switched to "Requires Review" tab');

  const reviewRows = await page.$$eval('tbody tr', (rows) => rows.length);
  assert(reviewRows > 0, `Requires Review shows ${reviewRows} rows`);

  // STEP 5b: Row # column on Review Sheets (per-sheet preview)
  console.log('\nUI STEP 5b — Row # column on Review Sheets');
  const rowNumberHeaderOnWorkspace = await page.evaluate(() => {
    const preview = [...document.querySelectorAll('h2')].find((h) =>
      h.textContent?.includes('Import Ready Preview'),
    );
    if (!preview) return false;
    const table = preview.closest('div')?.parentElement?.querySelector('table');
    if (!table) return false;
    return [...table.querySelectorAll('th')].some((th) => th.textContent?.trim() === 'Row #');
  });
  assert(rowNumberHeaderOnWorkspace, '"Row #" column visible on Review Sheets preview');

  const sampleRowNumberOnWorkspace = await page.evaluate(() => {
    const preview = [...document.querySelectorAll('h2')].find((h) =>
      h.textContent?.includes('Import Ready Preview'),
    );
    const table = preview?.closest('div')?.parentElement?.querySelector('table');
    if (!table) return null;
    for (const row of [...table.querySelectorAll('tbody tr')]) {
      const cells = [...row.querySelectorAll('td')];
      const rowNumCell = cells[1]?.textContent?.trim();
      if (rowNumCell && rowNumCell.startsWith('#')) return rowNumCell;
    }
    return null;
  });
  assert(
    !!sampleRowNumberOnWorkspace,
    `Review Sheets row shows source row number: "${sampleRowNumberOnWorkspace}"`,
  );

  // STEP 6: View Import Summary
  console.log('\nUI STEP 6 — Final Import Summary');
  const summaryBtn = await page.evaluate(() => {
    const btn = [...document.querySelectorAll('button')].find((b) =>
      b.textContent?.includes('View Import Summary'),
    );
    if (btn && !btn.disabled) {
      btn.click();
      return true;
    }
    return false;
  });
  assert(summaryBtn, 'Clicked "View Import Summary" button');
  await wait(1000);

  const finalHeading = await page.evaluate(() => {
    return document.body.textContent?.includes('Validation Complete');
  });
  assert(finalHeading, 'Final step: "Validation Complete" heading');

  const finalKpis = await page.evaluate(() => {
    const values = [...document.querySelectorAll('.text-3xl')].map((el) => el.textContent);
    return values;
  });
  assert(finalKpis.length >= 4, `Final KPIs displayed: ${finalKpis.join(', ')}`);

  const assetsCount = parseInt(finalKpis[0]?.replace(/,/g, '') ?? '0', 10);
  assert(assetsCount === 362, `Final assets count = 362 (got ${assetsCount})`);

  // STEP 6b: Import Ready preview hides Sheet and Row # columns
  console.log('\nUI STEP 6b — Import Ready hides Sheet/Row # columns');
  const importReadyTableHeaders = await page.evaluate(() => {
    const preview = [...document.querySelectorAll('h2')].find((h) =>
      h.textContent?.includes('Import Ready Preview'),
    );
    const table = preview?.closest('div')?.parentElement?.querySelector('table');
    if (!table) return [];
    return [...table.querySelectorAll('th')].map((th) => th.textContent?.trim() ?? '');
  });
  assert(
    !importReadyTableHeaders.includes('Sheet'),
    'Import Ready preview does not show Sheet column',
  );
  assert(
    !importReadyTableHeaders.includes('Row #'),
    'Import Ready preview does not show Row # column',
  );
  assert(importReadyTableHeaders.includes('Address'), 'Import Ready preview shows Address column');

  // STEP 6c: Renamed sections — "Import Ready Preview" and "Validation Review"
  console.log('\nUI STEP 6c — Renamed sections');
  const hasPreviewHeading = await page.evaluate(() =>
    document.body.textContent?.includes('Import Ready Preview'),
  );
  assert(hasPreviewHeading, '"Import Ready Preview" section heading visible');

  const hasReviewHeading = await page.evaluate(() =>
    document.body.textContent?.includes('Validation Review'),
  );
  assert(hasReviewHeading, '"Validation Review" section heading visible');

  // STEP 6d: Export Import Ready File — downloads a clean CSV (no Sheet/Row#/RawText)
  console.log('\nUI STEP 6d — Export Import Ready File button');
  const downloadDir = mkdtempSync(join(tmpdir(), 'import-export-'));
  const client = await page.target().createCDPSession();
  await client.send('Page.setDownloadBehavior', {
    behavior: 'allow',
    downloadPath: downloadDir,
  });

  const exportClicked = await page.evaluate(() => {
    const btn = [...document.querySelectorAll('button')].find((b) =>
      b.textContent?.includes('Export Import Ready File'),
    );
    if (btn && !btn.disabled) {
      btn.click();
      return true;
    }
    return false;
  });
  assert(exportClicked, 'Export Import Ready File button found and clicked');
  await wait(1500);

  const downloadedFiles = readdirSync(downloadDir).filter((f) => f.endsWith('.csv'));
  assert(downloadedFiles.length > 0, `CSV file downloaded: ${downloadedFiles.join(', ') || 'none'}`);

  if (downloadedFiles.length > 0) {
    const csvContent = readFileSync(join(downloadDir, downloadedFiles[0]), 'utf-8');
    const header = csvContent.split('\n')[0];
    assert(header === 'Address,Asset Type,Floor,Room,Unit', `CSV header is clean: "${header}"`);
    assert(!header.includes('Sheet') && !header.includes('Row'), 'CSV excludes Sheet/Row # metadata');
  }

  // STEP 6e: Back button navigates from Import Ready to Review Sheets (without losing data)
  console.log('\nUI STEP 6e — Back button (Import Ready → Review Sheets)');
  await page.evaluate(() => {
    const btn = [...document.querySelectorAll('button')].find((b) => b.textContent?.trim() === 'Back');
    btn?.click();
  });
  await wait(500);

  const backToWorkspace = await page.evaluate(() => {
    return !!document.body.textContent?.includes('View Import Summary');
  });
  assert(backToWorkspace, 'Back button returned to Review Sheets (workspace still has data)');

  // STEP 6f: Stepper — jump forward again to Import Ready, then back to Upload Data
  console.log('\nUI STEP 6f — Clickable stepper navigation');
  const jumpedForward = await page.evaluate(() => {
    const btn = [...document.querySelectorAll('button')].find((b) => b.textContent?.includes('Import Ready'));
    if (btn && !btn.disabled) {
      btn.click();
      return true;
    }
    return false;
  });
  await wait(500);
  assert(jumpedForward, 'Stepper "Import Ready" step is clickable and navigates forward');

  const onFinalAgain = await page.evaluate(() => document.body.textContent?.includes('Validation Complete'));
  assert(onFinalAgain, 'Back on Import Ready step via stepper click');

  const jumpedToUpload = await page.evaluate(() => {
    const btn = [...document.querySelectorAll('button')].find((b) => b.textContent?.includes('Upload Data'));
    if (btn && !btn.disabled) {
      btn.click();
      return true;
    }
    return false;
  });
  await wait(500);
  assert(jumpedToUpload, 'Stepper "Upload Data" step is clickable and navigates back');

  const onUploadScreen = await page.evaluate(() => document.body.textContent?.includes('Import Building Data'));
  assert(onUploadScreen, 'Upload screen shown after stepper navigation (data not lost)');

  const reachedWorkspaceAgain = await page.evaluate(() => {
    const btn = [...document.querySelectorAll('button')].find((b) => b.textContent?.includes('Review Sheets'));
    if (btn && !btn.disabled) {
      btn.click();
      return true;
    }
    return false;
  });
  await wait(500);
  assert(reachedWorkspaceAgain, 'Stepper "Review Sheets" step still clickable from Upload (workbook retained)');

  const tabsStillThere = await page.evaluate(() => {
    return [...document.querySelectorAll('button')].some((b) => b.textContent?.trim() === 'Monthly Outlet');
  });
  assert(tabsStillThere, 'Sheet tabs still populated after round-trip navigation');

  // STEP 7: Reset
  console.log('\nUI STEP 7 — Reset workflow');
  await page.evaluate(() => {
    const btn = [...document.querySelectorAll('button')].find((b) =>
      b.textContent?.includes('Reset'),
    );
    btn?.click();
  });
  await wait(500);

  const backToUpload = await page.$eval('h2', (el) => el.textContent);
  assert(backToUpload?.includes('Import Building Data'), 'Reset returns to upload screen');

  // STEP 8: Paste Data flow
  console.log('\nUI STEP 8 — Paste Data alternative');
  await page.evaluate(() => {
    const btn = [...document.querySelectorAll('button')].find((b) => b.textContent === 'Paste Data');
    btn?.click();
  });
  await wait(300);

  const pasteData = [
    'Date\tOutlet/Location\tCold Mains Water Temperature °C\tName',
    '01/01/2025\tUnit 3 - 1st Floor Finance Office\t15\tJohn',
    '01/01/2025\t1st Floor- Kitchen Sink\t14\tJohn',
  ].join('\n');

  await page.type('textarea', pasteData);
  await page.evaluate(() => {
    const btn = [...document.querySelectorAll('button')].find((b) => b.textContent === 'Parse Data');
    btn?.click();
  });
  await wait(1000);

  const pasteReachedMapping = await page.evaluate(() =>
    document.body.textContent?.includes('Confirm Column Mapping'),
  );
  assert(pasteReachedMapping, 'Paste Data advances to Column Mapping');

  await page.evaluate(() => {
    const btn = [...document.querySelectorAll('button')].find((b) =>
      b.textContent?.includes('Confirm Mapping'),
    );
    btn?.click();
  });
  await wait(1500);

  const pasteAdvanced = await page.evaluate(() => {
    const spans = [...document.querySelectorAll('span')];
    return spans.some((s) => s.textContent === 'Review Sheets' && s.className.includes('slate-900'));
  });
  assert(pasteAdvanced, 'Paste Data advances to Review Sheets after confirming mapping');

} catch (err) {
  failed += 1;
  console.log(`  ✗ ERROR: ${err.message}`);
} finally {
  await browser.close();
}

console.log('\n═══════════════════════════════════════════════════');
console.log(`  UI RESULT: ${passed} passed, ${failed} failed`);
console.log('═══════════════════════════════════════════════════\n');

if (failed > 0) process.exit(1);
