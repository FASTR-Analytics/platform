# PLAN: ICEH Data Integration

## Background

### What is ICEH?

The **International Center for Equity in Health (ICEH)** maintains the "Retriever" data platform (https://www.equidade.org/retriever), which provides open access to standardized health coverage data across 120+ countries. The data comes from nationally representative household surveys (DHS, MICS) and covers 100+ Reproductive, Maternal, Newborn, Child Health and Nutrition (RMNCH+N) indicators.

The key value of ICEH data is its **equity focus**: every indicator is disaggregated by multiple equity dimensions (wealth, education, urban/rural, etc.), enabling analysis of health inequalities within countries.

### Why add ICEH to FASTR?

FASTR currently supports two data types:
- **HMIS**: Facility-level routine health data, disaggregated by geography (admin areas, facilities), with monthly periodicity
- **HFA**: Facility-level survey data from Health Facility Assessments, with survey rounds as time points

ICEH fills a different need:
- **National-level** coverage data (not facility-level)
- **Equity disaggregations** (wealth quintiles, education, etc.) rather than geographic
- **Annual** survey data from population-based surveys (DHS/MICS)
- Enables **equity analysis** that complements routine HMIS monitoring

This data will feed into a new module (m009) focused on equity analysis.

### How users obtain ICEH data

Users visit https://www.equidade.org/retriever and:
1. Select a country (or multiple countries)
2. Select indicators (up to 12 at a time)
3. Register with email
4. Download a zip file

The zip file always contains three files:
- `results_csv.csv` - the actual data
- `indicators.xlsx` - full indicator dictionary (same in every download)
- `readme.pdf` - documentation (same in every download)

### Relationship to HMIS indicators

ICEH indicators (e.g., "Percentage of children fully vaccinated") are conceptually similar to HMIS "common indicators" (e.g., coverage rates), but:
- Different data sources (surveys vs routine reporting)
- Different disaggregation (equity vs geographic)
- Different periodicity (annual vs monthly)

Future work may map ICEH indicators to HMIS common indicators for comparison, but initially they will be a standalone indicator namespace (`iceh_indicators`).

## Overview

Add ICEH data as a new data type in FASTR. Users upload zip files downloaded from the ICEH Retriever, and the system parses and stores the data for use in equity analysis modules.

**Key characteristics**:
- National-level coverage data (not facility-level)
- Yearly data from DHS/MICS surveys
- Equity disaggregators: wealth quintiles/deciles, education, area, sex, etc.
- Downloaded as zip file containing: `results_csv.csv`, `indicators.xlsx`, `readme.pdf`
- One country per instance (validate ISO code matches)

## Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Import method | Zip upload | What ICEH provides; dictionary stays in sync with data |
| Indicator namespace | Standalone `iceh_indicators` | Like `hfa_indicators`; separate from HMIS |
| Country policy | One country only | Instance is country-specific; validate ISO matches |
| Disaggregators | Separate table | Equity analysis is the core purpose; need labels/metadata |
| Initial module | m009 | Dedicated equity analysis module |

## Data Model

### Tables (in main/instance database)

```sql
-- ICEH Disaggregators (stratification types)
CREATE TABLE iceh_disaggregators (
  strat TEXT PRIMARY KEY,              -- "wealth quintiles", "area", etc.
  label TEXT NOT NULL,                 -- display label
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_equity_dimension BOOLEAN NOT NULL DEFAULT TRUE
);

-- ICEH Indicators
CREATE TABLE iceh_indicators (
  indicator_code TEXT PRIMARY KEY,     -- "anc12", "vfull", etc.
  indicator_name TEXT NOT NULL,        -- full name
  category TEXT NOT NULL DEFAULT '',   -- "Antenatal care", "Vaccination", etc.
  numerator TEXT NOT NULL DEFAULT '',  -- definition
  denominator TEXT NOT NULL DEFAULT '',
  sort_order INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ICEH Data
CREATE TABLE iceh_data (
  indicator_code TEXT NOT NULL REFERENCES iceh_indicators(indicator_code) ON DELETE CASCADE,
  year INTEGER NOT NULL,               -- survey year
  source TEXT NOT NULL,                -- "DHS", "MICS"
  strat TEXT NOT NULL REFERENCES iceh_disaggregators(strat) ON DELETE RESTRICT,
  level TEXT NOT NULL,                 -- "urban", "Q1", "all", etc.
  estimate REAL,                       -- the coverage value
  standard_error REAL,
  sample_size INTEGER,
  PRIMARY KEY (indicator_code, year, source, strat, level)
);

CREATE INDEX idx_iceh_data_indicator ON iceh_data(indicator_code);
CREATE INDEX idx_iceh_data_year ON iceh_data(year);
CREATE INDEX idx_iceh_data_strat ON iceh_data(strat);

-- ICEH Upload Attempts (for import wizard state)
CREATE TABLE iceh_upload_attempts (
  id TEXT PRIMARY KEY NOT NULL DEFAULT 'single_row' CHECK (id = 'single_row'),
  date_started TEXT NOT NULL,
  step INTEGER NOT NULL,
  status TEXT NOT NULL,                -- JSON status object
  status_type TEXT NOT NULL,           -- configuring, staging, integrating, complete, error
  step_1_result TEXT,                  -- zip validation result
  step_2_result TEXT,                  -- preview/confirmation
  step_3_result TEXT                   -- integration result
);
```

## Data Structure (from examining sample files)

Three sample zip files were examined to confirm structure stability:
- `compiled_CSV_data_20260518.zip` (Ethiopia, 4100 rows)
- `compiled_CSV_data_20260518_b.zip` (Afghanistan, 3700 rows)
- `compiled_CSV_data_20260518_c.zip` (Senegal, 5500 rows)

**Findings**:
- All zips contain exactly the same 3 files: `results_csv.csv`, `indicators.xlsx`, `readme.pdf`
- `indicators.xlsx` is **identical** across all downloads (MD5 match) - it's the complete dictionary every time
- `readme.pdf` is identical across all downloads
- Only `results_csv.csv` varies based on country/indicator selection
- CSV structure is consistent across all files

### CSV Structure (results_csv.csv)

```
Row 1: "This dataset was obtained through the ICEH retriever, a data platform developed by the International Center for Equity in Health (https://www.equidade.org/retriever)"
Row 2: "Database version: 2026-04"
Row 3: ISO,Country,Year,Final Year,Source,UNICEF Region,Indicator Code,Indicator,Reference,Strat,Level,Estimate,Standard Error,Sample Size
Row 4+: Data rows
```

Note: Rows 1-2 are metadata and must be skipped when parsing. Row 3 contains the actual column headers.

**Sample data row**:
```
ETH,Ethiopia,2000,2000,DHS,Eastern & Southern Africa,asfr1,Adolescent fertility rate,,area,urban,60.2,878.2,NA
```

**Column mapping**:
| CSV Column | DB Column | Notes |
|------------|-----------|-------|
| ISO | (validate against instance) | Must match instance country |
| Country | (skip) | Redundant with ISO |
| Year | year | |
| Final Year | (skip or use if different) | Usually same as Year |
| Source | source | DHS, MICS |
| UNICEF Region | (skip) | |
| Indicator Code | indicator_code | FK to iceh_indicators |
| Indicator | (skip) | Name comes from dictionary |
| Reference | (skip) | |
| Strat | strat | FK to iceh_disaggregators |
| Level | level | |
| Estimate | estimate | |
| Standard Error | standard_error | |
| Sample Size | sample_size | May be "NA" |

### Disaggregators (Strat column values)

The `Strat` column indicates the stratification/disaggregation type. From sample data, these are the observed values:

| Strat Value | Description | Is Equity Dimension |
|-------------|-------------|---------------------|
| national | National average (Level = "all") | No |
| area | Urban/rural residence (Level = "urban", "rural") | Yes |
| wealth quintiles | Wealth quintiles (Level = "Q1" to "Q5") | Yes |
| wealth deciles | Wealth deciles (Level = "D1" to "D10") | Yes |
| woman's education | Education level (Level varies) | Yes |
| woman's education (4 groups) | Education in 4 categories | Yes |
| woman's age (current) | Current age groups | Partial |
| woman's age (at birth) | Age at childbirth | Partial |
| sex | Sex of child (Level = "male", "female") | Yes |
| subnational unit | Geographic regions within country | No |

The `Level` column contains the specific value within each stratification (e.g., "urban", "Q1", "Tigray").

### Indicators Dictionary (indicators.xlsx)

The xlsx file contains two sheets:
- "About" - general information (can be ignored)
- "ICEH Indicators Definition" - the indicator dictionary

Sheet: "ICEH Indicators Definition"

| XLSX Column | DB Column | Notes |
|-------------|-----------|-------|
| CATEGORY | category | e.g., "Antenatal care", "Vaccination" |
| INDICATOR CODE | indicator_code | e.g., "anc12", "vfull" |
| INDICATOR NAME | indicator_name | Full descriptive name |
| INDICATOR DENOMINATOR | denominator | Definition of denominator |
| INDICATOR NUMERATOR | numerator | Definition of numerator |
| STRATIFIERS | (informational) | Lists available stratifications |
| SOURCE | (informational) | "DHS", "MICS", or "DHS/MICS" |
| AVAILABILITY | (informational) | Year ranges |
| DON'T KNOW/MISSING TREATMENT | (informational) | How missing values handled |
| OBSERVATIONS | (informational) | Additional notes |

## File Parsing

### Zip Extraction

Use JSZip (`npm:jszip`) to extract uploaded zip files:

```typescript
import JSZip from "npm:jszip";

const zipData = await Deno.readFile(zipPath);
const zip = await JSZip.loadAsync(zipData);

// Extract CSV as text
const csvText = await zip.file("results_csv.csv")?.async("string");
if (!csvText) throw new Error("results_csv.csv not found in zip");

// Extract XLSX as binary (write to temp file for panther to read)
const xlsxData = await zip.file("indicators.xlsx")?.async("uint8array");
if (!xlsxData) throw new Error("indicators.xlsx not found in zip");
await Deno.writeFile(tempXlsxPath, xlsxData);
```

### CSV/XLSX Parsing

```typescript
import { parseCSV } from "panther/_100_csv/mod.ts";
import { readXlsxFileAsSheets } from "../../server_only_funcs_csvs/read_xlsx_raw.ts";

// Parse CSV string directly (from JSZip extraction above)
const rows = parseCSV(csvText);  // returns string[][]
const headerRow = rows[2];       // ISO,Country,Year,... (rows 0-1 are metadata)
const dataRows = rows.slice(3);  // Actual data

// Parse indicators dictionary from xlsx
// NOTE: Cannot use panther's readXlsxFileAsSingleCsv - xlsx has trailing empty 
// columns that create duplicate empty headers, failing Csv validation.
// Use readXlsxFileAsSheets which returns raw string[][] without validation.
const sheets = readXlsxFileAsSheets(tempXlsxPath);
const indicatorRows = sheets.get("ICEH Indicators Definition")!;
const indicatorHeaders = indicatorRows[0];  // CATEGORY, INDICATOR CODE, ...
const indicatorData = indicatorRows.slice(1);
```

## Import Wizard Flow

The wizard follows the same pattern as HFA import (stepper, polling, progress states) but with simpler steps since ICEH has a fixed structure requiring no user column mapping.

**Client-side server actions are auto-generated** from `routeRegistry` via `createAllServerActions()`. Once routes are added to combined.ts, `serverActions.getDatasetIcehDetail({})` etc. are automatically available.

### Step 1: Upload Zip
- User uploads zip via Uppy (TUS protocol) to assets folder (same as HFA)
- User selects uploaded zip from asset list (filter: `isZip`)
- Client calls `serverActions.updateDatasetIcehUploadAttemptStep1({ zipAssetFileName })`
- Server validates zip contains required files (`results_csv.csv`, `indicators.xlsx`)
- Server extracts to sandbox temp location, parses contents
- Parse indicators.xlsx to get indicator definitions
- Parse CSV to extract: country ISO, years, indicator codes, strat types, row count
- Save step1Result with summary
- Display to user: indicator count, data row count, country, year range, strats found

### Step 2: Confirmation & Options
- Show what will be imported (preview from step 1)
- Validate country ISO matches instance (error if mismatch)
- Show list of indicators to be imported
- Show list of disaggregators to be imported
- **Future expansion options:**
  - Select subset of indicators to import
  - Select country if zip contains multiple countries
  - Select year range
- User confirms to proceed with staging

### Step 3: Staging & Integration
- Stage data (validate all rows, prepare for insert)
- Show staging results:
  - Total rows processed
  - Valid rows
  - Skipped rows (with reasons: invalid indicator, invalid strat, missing values)
  - Indicators to upsert
  - Disaggregators to upsert
- User clicks "Integrate and finalize"
- Upsert `iceh_disaggregators`
- Upsert `iceh_indicators` (from dictionary)
- Upsert/replace `iceh_data`
- Show completion summary

### Progress States (same as HFA)
- `configuring` - wizard steps (steps 1-2)
- `staging` - background staging in progress
- `staged` - staging complete, showing results, awaiting user confirmation
- `integrating` - background integration in progress  
- `complete` - done
- `error` - failed with message

## File Structure

```
server/
├── db/
│   └── instance/
│       ├── dataset_iceh.ts           # DB access functions
│       └── instance.ts               # UPDATE: add iceh to getInstanceDatasetsSummary()
├── routes/
│   └── instance/
│       └── iceh.ts                   # API routes

client/
├── src/
│   └── components/
│       ├── instance_dataset_iceh/         # Main ICEH data view
│       └── instance_dataset_iceh_import/  # Import wizard
│           ├── index.tsx
│           ├── step_1.tsx
│           ├── step_2.tsx
│           └── step_3.tsx

lib/
├── api-routes/
│   └── instance/
│       └── iceh.ts                   # NEW: Route registry definitions
├── api-routes/
│   └── combined.ts                   # UPDATE: Import and add icehRouteRegistry
└── types/
    ├── dataset_iceh.ts               # Data types (indicators, disaggregators, data rows)
    ├── dataset_iceh_import.ts        # Import types (upload attempt, step results)
    ├── datasets.ts                   # UPDATE: Add "iceh" to DatasetType union
    └── mod.ts                        # UPDATE: Export dataset_iceh*.ts
```

## Types

### lib/types/dataset_iceh.ts (data types)

```typescript
import { IcehUploadAttemptSummary } from "./dataset_iceh_import.ts";

export type IcehDisaggregator = {
  strat: string;
  label: string;
  sortOrder: number;
  isEquityDimension: boolean;
};

export type IcehIndicator = {
  indicatorCode: string;
  indicatorName: string;
  category: string;
  numerator: string;
  denominator: string;
  sortOrder: number;
};

export type IcehDataRow = {
  indicatorCode: string;
  year: number;
  source: string;
  strat: string;
  level: string;
  estimate: number | null;
  standardError: number | null;
  sampleSize: number | null;
};

export type IcehDataDetail = {
  uploadAttempt: IcehUploadAttemptSummary | undefined;
  indicators: number;
  dataRows: number;
  years: number[];
  disaggregators: string[];
};
```

### lib/types/dataset_iceh_import.ts (import types)

```typescript
export type IcehUploadAttemptStatus =
  | { status: "configuring" }
  | { status: "staging"; progress: number }
  | { status: "staged"; result: IcehStagingResult }
  | { status: "integrating"; progress: number }
  | { status: "complete"; nRowsIntegrated: number }
  | { status: "error"; err: string };

export type IcehUploadAttemptSummary = {
  id: string;
  dateStarted: string;
  status: IcehUploadAttemptStatus;
};

export type IcehStep1Result = {
  zipFileName: string;
  indicatorCount: number;
  dataRowCount: number;
  countryIso: string;
  countryName: string;
  years: number[];
  strats: string[];
};

export type IcehStagingResult = {
  nRowsTotal: number;
  nRowsValid: number;
  nRowsSkippedMissingEstimate: number;
  nIndicators: number;
  nDisaggregators: number;
  years: number[];
};
```

### lib/types/mod.ts (add exports)

```typescript
export * from "./dataset_iceh.ts";
export * from "./dataset_iceh_import.ts";
```

### lib/types/datasets.ts (update DatasetType)

```typescript
// Add "iceh" to the union (line 5)
export type DatasetType = "hmis" | "hfa" | "iceh";
```

### server/db/instance/_main_database_types.ts (add DB row type)

```typescript
export type DBIcehUploadAttempt = {
  id: string;
  date_started: string;
  step: number;
  status: string;
  status_type: string;
  step_1_result: string | null;
  step_2_result: string | null;
  step_3_result: string | null;
};
```

## API Routes

| Method | Path | Description |
|--------|------|-------------|
| GET | `/iceh/detail` | Get ICEH data summary |
| GET | `/iceh/indicators` | List all ICEH indicators |
| GET | `/iceh/disaggregators` | List all disaggregators |
| GET | `/iceh/data` | Query ICEH data (with filters) |
| POST | `/iceh/upload-attempt` | Start new import |
| GET | `/iceh/upload-attempt` | Get current import state |
| DELETE | `/iceh/upload-attempt` | Cancel import |
| POST | `/iceh/upload-attempt/step1` | Upload zip, validate |
| POST | `/iceh/upload-attempt/step2` | Confirm and stage |
| POST | `/iceh/upload-attempt/step3` | Integrate |
| DELETE | `/iceh/data` | Delete all ICEH data |

## Route Registration

Routes must be registered in the route registry for type-safe API calls.

### lib/api-routes/instance/iceh.ts (new file)

```typescript
import { route } from "../route-utils.ts";
import type {
  IcehDataDetail,
  IcehIndicator,
  IcehDisaggregator,
  IcehDataRow,
  IcehUploadAttemptSummary,
  IcehStep1Result,
} from "../../types/mod.ts";

export const icehRouteRegistry = {
  getDatasetIcehDetail: route({
    method: "GET",
    path: "/iceh/detail",
    response: {} as IcehDataDetail,
  }),
  getDatasetIcehIndicators: route({
    method: "GET",
    path: "/iceh/indicators",
    response: {} as IcehIndicator[],
  }),
  getDatasetIcehDisaggregators: route({
    method: "GET",
    path: "/iceh/disaggregators",
    response: {} as IcehDisaggregator[],
  }),
  getDatasetIcehData: route({
    method: "GET",
    path: "/iceh/data",
    response: {} as IcehDataRow[],
  }),
  createDatasetIcehUploadAttempt: route({
    method: "POST",
    path: "/iceh/upload-attempt",
  }),
  getDatasetIcehUploadAttempt: route({
    method: "GET",
    path: "/iceh/upload-attempt",
    response: {} as IcehUploadAttemptSummary,
  }),
  deleteDatasetIcehUploadAttempt: route({
    method: "DELETE",
    path: "/iceh/upload-attempt",
  }),
  updateDatasetIcehUploadAttemptStep1: route({
    method: "POST",
    path: "/iceh/upload-attempt/step1",
    response: {} as IcehStep1Result,
  }),
  updateDatasetIcehUploadAttemptStep2: route({
    method: "POST",
    path: "/iceh/upload-attempt/step2",
  }),
  updateDatasetIcehUploadAttemptStep3: route({
    method: "POST",
    path: "/iceh/upload-attempt/step3",
  }),
  deleteDatasetIcehData: route({
    method: "DELETE",
    path: "/iceh/data",
  }),
};
```

### lib/api-routes/combined.ts (update)

Add import at top with other instance imports:

```typescript
import { icehRouteRegistry } from "./instance/iceh.ts";
```

Add to routeRegistry spread:

```typescript
export const routeRegistry = {
  // ... existing spreads ...
  ...icehRouteRegistry,
} as const;
```

## Instance Detection

### server/db/instance/instance.ts (update getInstanceDatasetsSummary)

```typescript
// Add ICEH detection alongside existing HMIS and HFA checks
if (await detectHasAnyRows(mainDb, "iceh_data")) {
  datasetsWithData.push("iceh");
}
```

## UI Integration

Update `instance_data.tsx` to add ICEH section with **one card**:

```tsx
{/* ICEH */}
<div class="flex gap-6">
  <div class="w-44 shrink-0 pt-3">
    <div class="font-700 text-base">
      {t3({ en: "ICEH", fr: "ICEH" })}
    </div>
  </div>
  <div class="ui-gap flex flex-1 flex-wrap">
    <div class="ui-pad ui-hoverable ..." onClick={() => setSelecteDatasource("iceh")}>
      <div class="font-700 pb-2">{t3({ en: "Equity data", fr: "Données d'équité" })}</div>
      {/* Show: has data / no data, indicator count, disaggregator count, year range */}
    </div>
  </div>
</div>
```

The ICEH view (`instance_dataset_iceh/`) will have **three tabs**:

1. **Data** - import wizard, view imported data rows, summary stats (years, sources, row counts)
2. **Indicators** - browse/search indicator definitions (code, name, category, numerator/denominator)
3. **Disaggregators** - view equity dimensions with labels, is_equity_dimension flag

## Implementation Order

1. **Types setup**:
   - Add `"iceh"` to `DatasetType` union in `lib/types/datasets.ts`
   - Add `isZip: boolean` to `AssetInfo` in `lib/types/assets.ts`
   - Create `lib/types/dataset_iceh.ts` (data types)
   - Create `lib/types/dataset_iceh_import.ts` (import types)
   - Export from `lib/types/mod.ts`
2. **Asset detection**: Update `server/db/instance/assets.ts` to detect `.zip` files
3. **Route registry**:
   - Create `lib/api-routes/instance/iceh.ts`
   - Update `lib/api-routes/combined.ts` to include icehRouteRegistry
4. **Database**:
   - Create migration `server/db/migrations/instance/037_iceh_tables.sql`
   - Add DB row type to `server/db/instance/_main_database_types.ts`
5. **Server DB layer**: `server/db/instance/dataset_iceh.ts` with CRUD functions
6. **Instance detection**: Update `server/db/instance/instance.ts` to detect ICEH data
7. **Server routes**: `server/routes/instance/iceh.ts` with API endpoints
8. **Client import wizard**: `instance_dataset_iceh_import/` step-by-step flow
   - Uses existing Uppy/TUS upload system (same as HFA)
   - User uploads zip → selects from asset list → step1 processes
9. **Client data view**: `instance_dataset_iceh/` with tabs for data, indicators, disaggregators
10. **UI integration**: Add ICEH card to `instance_data.tsx`
11. **Testing**: Test with sample zip files

## Open Questions

- [x] ~~Where is instance country ISO stored?~~ → `instance_config` table, key `'country_iso3'`, via `getCountryIso3Config()`
- [ ] Should we support multiple imports (append) or always replace? → Recommend: replace all on import
- [ ] Do we need translations for disaggregator labels (EN/FR)? → HFA is English-only, can follow same pattern
- [ ] Should `iceh_indicators` mapping to HMIS common indicators be a future feature?

## Sample Data Files

Test files available:
- `compiled_CSV_data_20260518.zip` (Ethiopia, 19 indicators, 4100 rows)
- `compiled_CSV_data_20260518_b.zip` (Afghanistan, 3700 rows)
- `compiled_CSV_data_20260518_c.zip` (Senegal, 5500 rows)
