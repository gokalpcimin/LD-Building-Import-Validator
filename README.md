# LD Building Import Validator

A prototype tool for support/back-office teams to parse Legionella risk assessment Excel workbooks into a standardized import model before platform import.

Built as a technical case study using **TypeScript**, **Node.js**, **Next.js**, and **React**.

## Case brief → feature traceability

| Brief requirement | Where it lives |
|---|---|
| Upload or paste a file | Upload Data step — Upload File + Paste Data tabs (`components/FileUploader.tsx`) |
| Mapping step (manual / automatic / AI-assisted / mocked) | Column Mapping step: automatic keyword matching + per-column manual override + **"Suggest with AI"** (mocked LLM with confidence & rationale, human-approved) |
| Import-ready file: Address, Asset/Outlet type, Floor, Room, Unit | **Download Import-Ready File** button — CSV with exactly those fields (+ Quantity); Blocked rows excluded (`utils/importReadyExport.ts`) |
| Cleaned preview of import-ready data | Import Ready Preview — Ready / Review Required / Blocked tabs (`components/DataPreviewTable.tsx`) |
| Number of assets imported | "Assets Imported" KPI card (`components/ValidationReport.tsx`) |
| Number of distinct locations | "Distinct Locations" KPI card |
| Gaps or uncertainties | "Critical Errors" + "Uncertainties (Warnings)" KPIs, per-row Issues / Parsing Notes badges, and the annotated **Export for Review** workbook |
| TypeScript / Node.js / Next.js / React / README | This repository |

## Balancing AI/automation with human review

The guiding rule everywhere is **correct structured data > guessing > validation warning** — the tool never invents data, and nothing uncertain is silently marked import-ready:

- **Automation proposes, the human approves.** Column mapping is auto-detected but shown for confirmation; AI mapping suggestions come with a confidence score and rationale, and are never applied without an explicit click.
- **Every automatic inference is visible.** When the parser extracts a floor from raw text or resolves the abbreviation "WM" to Washing Machine, that shows up as a blue Parsing Note on the row — transparent, but not a reason to block.
- **Uncertainty degrades gracefully.** Confidently parsed rows are Ready; a single missing location field means Review Required (a human looks); unknown asset types or badly incomplete locations mean Blocked (kept out of the import-ready file entirely, and highlighted with reasons in the Export for Review workbook).

## Problem

Customer files are not simple building lists — they are Legionella risk assessment reports with different sheets and structures (Cover Page, Monthly Outlet, Annual TMVs, Expansion Vessels, Outlet & Temperature Registers), and different customers name their columns differently (`Outlet/Location` vs. `Level` + `Area` vs. `Building Address`, etc.). Some sheets aren't even cleanly tabular — asset registers frequently flatten `[Building No] [Floor] [Room] ...readings... [asset code]` into a single line of raw text. The team needs to:

1. Upload an Excel workbook
2. Automatically detect and classify each sheet
3. Map each sheet's columns to platform fields (auto-detected, user-confirmable)
4. Parse each sheet with a dedicated, **sheet-aware** parser using the confirmed mapping — inventory registers get hierarchical text decomposition and stricter duplicate checks; historical monitoring sheets get relaxed duplicate rules since the same location legitimately repeats every inspection cycle
5. Validate import readiness and flag gaps, distinguishing real problems from transparent, automatic transformations
6. Review a unified preview split into Ready / Review Required / Blocked

## Column mapping — handling different customer column names

Customer files may use different column names for the same concept (`Building Address` vs. `Site Address`, `Equipment` vs. `Asset Type`, `Level` vs. `Floor`, `Area` vs. `Room`, or one combined `Outlet/Location` column instead of separate Floor/Room/Unit columns). Rather than hardcoding one column layout, the app runs an explicit **Column Mapping** step between Upload and Review Sheets:

- Every column of every uploaded sheet is automatically matched to a platform field — `Address`, `Asset / Outlet Type`, `Location` (combined text parsed into Unit/Floor/Room), `Floor`, `Room`, `Unit`, `Building No`, or `Ignore` — using keyword + pattern detection (`utils/columnMapping.ts`). `Building No` is kept distinct from `Unit`: a register's Building No → Floor → Room hierarchy doesn't imply the sheet has a Unit concept at all.
- The user sees this mapping (with a sample value per column) and can override any column via a dropdown before continuing — this is the "manual override" half of the automatic/AI-assisted/mocked/manual mapping spectrum the mapping step supports.
- **AI-assisted suggestions:** a "Suggest with AI" button proposes roles for columns the deterministic matcher left unmapped — synonyms ("Storey" → Floor, "Apartment" → Unit), abbreviations ("Bldg" → Building No) and sample-value cues ("Bib Tap" in the data → Asset Type). Each suggestion shows a confidence score and a one-line rationale, and is applied only when the user clicks Apply. The suggester (`utils/aiMappingSuggester.ts`) is a **mock** of an LLM call with the exact async signature a real integration would have, so swapping in a real model call changes nothing else in the app.
- The confirmed mapping is threaded into `dataSheetParser.ts` via `ParserContext.columnMapping`, so parsing always uses exactly what the user confirmed, not just a hidden guess.
- Example: a file with `Building Address / Equipment / Level / Area` columns is auto-mapped to `Address / Asset Type / Floor / Room` — no manual work needed. The real case-study file (`Outlet/Location`, `TMV / Location`, `Expansion Vessel / Location` combined-text columns) is also auto-mapped correctly out of the box.

## Sheet-aware parsing: inventory registers vs. historical monitoring

Not every asset sheet means the same thing, so the parser (`utils/parsers/dataSheetParser.ts`) behaves differently depending on sheet type:

| Sheet type | What it represents | Parsing behaviour | Duplicate detection |
|---|---|---|---|
| **Monthly Outlet** (`monthly-outlet`) | Historical inspection log — the same location is visited and re-recorded every cycle | Standard column/location-text parsing | Only flags a duplicate when the *entire* row repeats exactly (date + location + readings + comments) — a recurring location alone is normal and never flagged |
| **Outlet & Temperature Register / Asset Register** (`building-register`), and any pasted data that looks like one | Building-wide fixed-asset inventory, often with `[Building No] [Floor] [Room] ...readings... [asset code]` flattened into one raw-text line | `parseBuildingRegisterLine()` decomposes that line into Building No / Floor / Room; `extractAllAssets()` scans location text, abbreviations (see below) and comments for every asset actually present at that location | Flags a duplicate when Address + Building No/Unit + Floor + Room + Asset Type repeats exactly — in an inventory list that's almost always a data-entry mistake |
| **Annual TMVs / Expansion Vessels** | Forced single asset type per sheet | All rows get that asset type directly | Not applicable |

Duplicate detection **only ever produces a warning** (`field: 'duplicate'`, message `"Potential duplicate record"`) — it never removes or merges rows. The flagged rows still carry their Sheet, Row # and Original Raw Text so a reviewer can decide.

### Normalizing semi-structured register text

A raw line like:

```text
1 Ground Residential Laundry - 39.1 2 8.1 1 1 - - - - - - - WM
```

is decomposed using the rule **`[Building Number] + [Floor keyword]` (Lower Ground, Ground, First, Second, Third, Mezzanine, Basement, ...) `+ [Location text]`**, with the trailing numeric/telemetry columns and any asset abbreviation stripped out of the room name:

```text
Building No: 1
Floor:       Ground
Room:        Residential Laundry
Asset Type:  Washing Machine   (detected from abbreviation "WM")
```

Because the floor and asset type were *extracted* rather than missing, they never generate a "Missing floor" or "Unknown asset" issue — instead they surface as **Info**-severity notes (see Validation rules below), and the row still lands in "Ready".

Rows that mention more than one fixture (`"Bath+SH head, WC"`, `"2 x Newark Calorifiers"`) expand into **multiple** `ImportReadyRow` records — one per detected asset, each sharing the same Address/Building No/Floor/Room and carrying its own `quantity` when a count was found.

## Internal review model

Every parsed row is kept as an `ImportReadyRow`, which carries **review
metadata** (`sheetName`, `sourceRowNumber`, `rawText`) alongside the platform
fields. This metadata powers the Import Ready Preview, validation reports, error
tracking, and duplicate detection.

```typescript
// Internal working model — used for validation, tracing and review
interface ImportReadyRow {
  address: string;
  assetType: AssetType;
  buildingNo?: string;      // e.g. register hierarchy "Building No" — distinct from Unit
  floor?: string;
  room?: string;
  unit?: string;
  quantity?: number;        // e.g. "2 x Newark Calorifiers" → quantity 2
  rawText?: string;         // review metadata — original source text
  sheetName?: string;       // review metadata — which sheet it came from
  sourceRowNumber?: number; // review metadata — original row # in the file
}
```

## Architecture

```
Workbook
    ↓
Sheet Detection (classify by name)
    ↓
Column Mapping (auto-detected, user-confirmable per sheet)
    ↓
Per-sheet Parsers
    ├── CoverPageParser         (metadata only — building address)
    ├── MonthlyOutletParser     (historical inspections — repeats are normal)
    ├── TMVParser
    ├── ExpansionVesselParser
    ├── BuildingRegisterParser  (asset inventory — hierarchical text decomposition)
    └── UnknownParser
    ↓
Standard Import Model (ImportReadyRow)
    ↓
Validation Engine (sheet-aware: Unit only required where the sheet has one; duplicate detection per sheet type)
    ↓
Preview (per-sheet + final summary)
```

## Validation rules

| Severity | Meaning | Examples |
|---|---|---|
| **Error** | Import-blocking issue | Missing address; missing asset type or asset type is "Unknown" (always blocking, on every sheet type); **2 or more** of Floor/Room/Unit missing on the same row |
| **Warning** | Needs human review, not blocking | Exactly **1** of Floor/Room/Unit missing on the row (Unit only counted on sheets that actually have a Unit concept), potential duplicate record |
| **Info** | Transparent note about an automatic detection/transformation — not a problem, never affects import readiness | "Floor extracted from raw text", "Asset type detected from abbreviation "WM"" |

Asset type and location completeness are judged the same way on every sheet type (register-style or regular column-based) — there's no separate, looser rule for "clean" spreadsheet columns vs. text extracted from raw lines. An "Unknown"/missing asset type is always an Error, because importing an asset record without knowing what the asset *is* isn't useful. For location fields, one missing field alone is treated as a minor gap (Warning — still reviewable), but two or more missing at once means there's not enough left to place the record (Error).

Cover Page is metadata only — it does not produce asset rows. The detected address is applied to all asset rows automatically.

Unit is only validated on sheets that actually have a Unit concept (an explicit Unit column, or "Unit X" section-divider rows). A building register whose hierarchy is Building No → Floor → Room has no Unit field at all, so it is never penalized for lacking one.

Each row gets one of three import statuses: **Blocked** (any Error), **Review Required** (no Error, but at least one Warning), or **Ready** (no Error or Warning — Info notes don't count). The KPI cards and the Import Ready Preview tabs both count rows this way, so the same underlying data reads identically whether it came from an uploaded file or was pasted.

## Import-ready file (the clean deliverable)

The **Download Import-Ready File** button (on the final Import Ready step, and on the pasted-data review screen) produces the CSV the platform would actually ingest — exactly the fields the case brief lists:

| Address | Asset Type | Floor | Room | Unit | Quantity |
|---|---|---|---|---|---|

- **Ready and Review Required rows are included; Blocked rows are excluded** — a record with an unknown asset type or a hopelessly incomplete location would just push the data gap downstream.
- Register hierarchies without a Unit concept export their Building No as the Unit, keeping the location triple complete.
- In the paste flow, rows with multiple detected assets ("Bath+SH head, WC") expand into one record per asset.
- Implemented in `utils/importReadyExport.ts` / `components/ImportReadyDownloadButton.tsx`.

## Export for Review

From the final "Import Ready" step (Excel/CSV flow only — not the paste flow), an **Export for Review** button downloads the workbook with per-row review annotations. For `.xlsx` uploads the untouched original file bytes are kept in memory and the export **edits that exact file in place** — every font, color, border, merged cell, column width and sheet stays as uploaded. The only changes per imported sheet are a trailing **Review Status** column and a row highlight:

- **Blocked** rows get a red highlight and a `Critical: ...` reason (e.g. `Critical: Asset type could not be confidently classified`).
- **Review Required** rows get a yellow highlight and a `Warning: ...` reason (e.g. `Warning: Missing floor`).
- **Ready** rows get a green highlight and the text `Ready`.
- Non-data rows (titles, section headers, blanks) are left completely untouched.
- Cover Page and any sheets that weren't imported are copied as-is.

CSV and legacy `.xls` uploads have no original formatting to preserve, so they fall back to rebuilding the workbook from the parsed values with the same highlights. This lets a reviewer open the export in Excel and immediately scan row colors and see *why*, with the file otherwise identical to what they sent. Implemented in `utils/excelReviewExport.ts` (uses `exceljs` to load and edit the original workbook); the .xlsx annotation runs server-side via `app/api/export-review/route.ts` because exceljs's browser build hangs loading real-world workbooks, and the button lives in `components/ExportForReviewButton.tsx`.

## Features

- Upload CSV/Excel or paste tabular data
- Automatic sheet classification (Cover Page, Monthly Outlet, TMVs, Expansion Vessels, Asset Register, Unknown)
- Multi-sheet Excel support with a sheet picker (all sheets selected by default)
- **Column Mapping step**: every column auto-matched to a platform field, editable per column, so customer files with renamed columns (`Level`/`Area` instead of `Floor`/`Room`, a separate `Building No` column, etc.) import correctly
- **AI-assisted mapping (mocked LLM)**: "Suggest with AI" proposes roles for unmapped columns with confidence + rationale; user applies or dismisses each suggestion
- **Download Import-Ready File**: clean CSV with the platform fields (Address, Asset Type, Floor, Room, Unit, Quantity) — Ready + Review Required rows only, available in both the Excel and paste flows
- Sheet-aware parsing: asset registers get `[Building No] + [Floor] + [Room]` decomposition from raw text; monitoring sheets treat repeated locations as normal history, not duplicates
- Reusable location parser (`unit`, `floor`, `room` from text like `Unit 3 - 1st Floor Finance Office`, or register lines like `1 Ground Residential Laundry - ... WM`)
- Expanded, keyword + abbreviation + comment-based asset detection: Bib Tap, WC, Shower, WHB/Sink, Expansion Vessel, TMV, Washing Machine, Dishwasher, Water Boiler, Calorifier, Chilled Water Dispenser/Fountain, Water Fountain, Spray Outlet, Emergency Shower/Eyewash, Chiller Unit, Hot Drinks Machine, Ice Machine, Unknown
- Multiple assets at one location (`"Bath+SH head, WC"`) expand into separate import-ready records instead of picking just one
- Quantity detection from comments (`"2 x Newark Calorifiers"` → quantity 2)
- **Sheet-aware duplicate detection**: warns (never deletes) on likely duplicate inventory rows; never flags a monitoring sheet's naturally-repeating locations
- Smart header row detection for tabular sheets, with a confidence flag that gates riskier heuristics (like asset-count columns) when the header can't be reliably identified
- Single address input on Cover Page when auto-detection fails
- Horizontal sheet tabs — one navigation system
- **Import Ready Preview**: Ready / Review Required / Blocked tabs, each a detailed table (Sheet, Row #, Address, Building No, Unit, Floor, Room, Asset Type, Quantity, Original Raw Text, Issues, Parsing Notes) for tracing records back to the source file
- **Export for Review** (Excel/CSV flow): downloads the original workbook with all its formatting intact (for .xlsx), plus a trailing "Review Status" column and red/yellow/green row highlights for Blocked/Review Required/Ready rows — see [Export for Review](#export-for-review)
- Back button + clickable stepper for free navigation between Upload / Column Mapping / Review Sheets / Import Ready without losing data

## Tech stack

- **Next.js 16** (App Router)
- **React 19**
- **TypeScript**
- **Tailwind CSS 4**
- **papaparse** (CSV)
- **xlsx** (Excel)
- **exceljs** (styled Excel export — Export for Review)
- **lucide-react** (icons)

No database or authentication (prototype scope).

## Setup

```bash
npm install
npm run dev    # http://localhost:3000
npm run build
```

### Test with case study Excel

```bash
npx tsx scripts/test-case-workflow.mjs "/path/to/Risk Assessment input for case study.xlsx"
```

## Workflow

1. **Upload** — Excel workbook is parsed; all sheets are classified; pick which sheets to import if there are several
2. **Column Mapping** — review the auto-detected column-to-field mapping for each sheet and adjust any column before continuing
3. **Review Sheets** — use horizontal tabs to inspect each sheet's interpretation, validation, and preview
4. **Cover Page** — verify or enter building address (applied globally)
5. **Import Summary** — merged validation report across all asset sheets, split into Ready / Review Required / Blocked

## Project structure

```
app/page.tsx                    # 4-step workflow orchestration
components/
  FileUploader.tsx              # Upload / paste ingestion + multi-sheet picker
  ColumnMappingStep.tsx         # "Column Mapping" — auto-detected, per-column overrides + AI suggestions
  SheetPanel.tsx                # Per-sheet interpretation + preview
  ValidationReport.tsx          # KPI summary cards ("Validation Review")
  DataPreviewTable.tsx          # "Import Ready Preview" — Ready / Review Required / Blocked table
  ImportReadyDownloadButton.tsx # "Download Import-Ready File" — clean 5-field CSV
  ExportForReviewButton.tsx     # "Export for Review" button (Excel/CSV flow)
types/index.ts                  # Shared TypeScript types (ImportReadyRow, ImportStatus, ColumnRole, ...)
utils/
  sheetDetection.ts             # Classify sheets by name
  columnMapping.ts              # Auto-detect + apply column-to-field role mapping
  aiMappingSuggester.ts         # Mocked LLM mapping suggestions (confidence + rationale, human-approved)
  importReadyExport.ts          # Builds + downloads the clean import-ready CSV
  locationParser.ts             # Reusable unit/floor/room parsing + parseBuildingRegisterLine
  assetDetector.ts              # Keyword/abbreviation/comment asset recognition, multi-asset extraction
  validationEngine.ts           # Import readiness validation (Ready/Review Required/Blocked)
  headerDetection.ts            # Smart header row detection, section-divider/unit inheritance
  processWorkbook.ts            # Orchestrates full pipeline
  excelReviewExport.ts          # Edits the original .xlsx in place (formatting preserved) with row highlights + Review Status column; rebuild fallback for CSV/.xls
  parsers/
    coverPageParser.ts
    monthlyOutletParser.ts       # Historical monitoring — repeats are not duplicates
    tmvParser.ts
    expansionVesselParser.ts
    buildingRegisterParser.ts    # Asset inventory — register-line decomposition, stricter duplicates
    unknownParser.ts
    dataSheetParser.ts          # Shared tabular sheet logic — mapping-aware column resolution, sheet-aware duplicate detection
```

## License

Private — case study prototype.
