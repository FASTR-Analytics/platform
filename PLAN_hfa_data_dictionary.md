# HFA Data Dictionary Implementation Plan

## Summary

Add a data dictionary system to HFA that stores variable labels and value labels per time_point, populated from XLSForm files uploaded alongside CSV data during import. Import changes to one-round-at-a-time. The staging worker expands `select_multiple` columns into binary variables and handles ODK group-prefixed column names.

---

## 1. Database Changes

### 1.1 New Tables

Add to `server/db/instance/_main_database.sql` and create migration `012_add_hfa_dictionary_tables.sql`:

```sql
CREATE TABLE IF NOT EXISTS dataset_hfa_dictionary_time_points (
  time_point text NOT NULL PRIMARY KEY,
  time_point_label text NOT NULL
);

CREATE TABLE IF NOT EXISTS dataset_hfa_dictionary_vars (
  time_point text NOT NULL,
  var_name text NOT NULL,
  var_label text NOT NULL,
  PRIMARY KEY (time_point, var_name)
);

CREATE TABLE IF NOT EXISTS dataset_hfa_dictionary_values (
  time_point text NOT NULL,
  var_name text NOT NULL,
  value text NOT NULL,
  value_label text NOT NULL,
  PRIMARY KEY (time_point, var_name, value),
  FOREIGN KEY (time_point, var_name) REFERENCES dataset_hfa_dictionary_vars(time_point, var_name) ON DELETE CASCADE
);

-- Clear any in-progress upload attempts (format is changing)
DELETE FROM dataset_hfa_upload_attempts;
```

Notes:
- `dataset_hfa_dictionary_values` FKs to `dataset_hfa_dictionary_vars` so deleting a var cascades to its value labels
- `dataset_hfa_dictionary_time_points` is standalone — labels the time_point values
- No FK to `dataset_hfa` — dictionary tables are independent reference data
- Migration clears `dataset_hfa_upload_attempts` because the `step_1_result` JSON format is changing (breaking change for any in-progress upload)

### 1.2 Relationship to `hfa_indicators` Table

The existing `hfa_indicators` table is **unrelated** to this work. It stores R code expressions for calculating derived metrics from raw HFA data (e.g., `r_code`, `r_filter_code`, `type: binary|numeric`). The new dictionary tables store labels from the XLSForm questionnaire. Different purpose, no overlap, no changes needed.

### 1.3 On Re-Import for Same Time Point

During integration (step 4), **within a single transaction**:
1. DELETE FROM `dataset_hfa` WHERE `time_point = $timePoint`
2. DELETE FROM `dataset_hfa_dictionary_vars` WHERE `time_point = $timePoint` (cascades to `dataset_hfa_dictionary_values`)
3. DELETE FROM `dataset_hfa_dictionary_time_points` WHERE `time_point = $timePoint`
4. INSERT fresh data + dictionary + time_point label

All DELETEs and INSERTs MUST be in the same transaction. If the process crashes after DELETE but before INSERT, we'd lose the time_point's data with no recovery.

---

## 2. Type Changes

### 2.1 Update `step_1_result` Type

**File: `lib/types/dataset_hfa_import.ts`**

Currently `step1Result` is `CsvDetails | undefined`. Extend to hold both CSV and XLSForm info:

```typescript
type DatasetHfaStep1Result = {
  csv: CsvDetails;
  xlsForm: {
    fileName: string;
    filePath: string;
  };
};
```

Update `DatasetHfaUploadAttemptDetail.step1Result` type from `CsvDetails` to `DatasetHfaStep1Result`. The DB column `step_1_result` stays `string | null` — it stores the JSON of this combined object.

### 2.2 Step 2 — No time_point_label Change

`HfaCsvMappingParams` stays as-is:
```typescript
type HfaCsvMappingParams = {
  facility_id: string;
  time_point: string;
};
```

The `time_point_label` is collected at **step 4** (review screen), after staging has extracted the actual time_point value from the data. At step 2, the user hasn't seen the time_point value yet, so asking for a label is premature.

### 2.3 Update Staging Result Type

**File: `lib/types/dataset_hfa_import.ts`**

Add fields to `DatasetHfaCsvStagingResult`:
```typescript
type DatasetHfaCsvStagingResult = {
  // ... existing fields ...
  timePointValue: string;           // The single time_point value found in CSV
  nDictionaryVars: number;          // Number of variable labels extracted
  nDictionaryValues: number;        // Number of value labels extracted
  nXlsFormVarsNotInCsv: number;     // Informational (allowed, not an error)
  nSelectMultipleExpanded: number;  // Number of select_multiple columns expanded to binary
};
```

Removed `nCsvVarsNotInXlsForm` — validation rejects the file before reaching the result, so this would always be 0.

### 2.4 New Dictionary Types

**File: `lib/types/dataset_hfa.ts`** (add to existing file)

```typescript
type DatasetHfaDictionaryVar = {
  timePoint: string;
  varName: string;
  varLabel: string;
};

type DatasetHfaDictionaryValue = {
  timePoint: string;
  varName: string;
  value: string;
  valueLabel: string;
};

type DatasetHfaDictionaryTimePoint = {
  timePoint: string;
  timePointLabel: string;
};
```

### 2.5 Update `DBDatasetHfaUploadAttempt`

**File: `server/db/instance/_main_database_types.ts`**

No structural changes needed — `step_1_result` column remains `string | null`, just the JSON shape changes.

---

## 3. Server Changes

### 3.1a XLSX Raw Reading Utility (candidate for panther)

**New file: `server/server_only_funcs_csvs/read_xlsx_raw.ts`**

Add `"xlsx": "npm:xlsx@0.18.5"` to root `deno.json` (matching panther's pinned version).

```typescript
import { readFile, utils } from "xlsx/xlsx.mjs";

// Returns raw array-of-arrays per sheet. Candidate for moving to panther later.
export function readXlsxFileAsSheets(filePath: string): Map<string, string[][]> {
  const wb = readFile(filePath);
  const result = new Map<string, string[][]>();
  for (const name of wb.SheetNames) {
    const ws = wb.Sheets[name];
    const aoa: string[][] = utils.sheet_to_json(ws, { header: 1 });
    result.set(name, aoa);
  }
  return result;
}
```

This is the general-purpose primitive that handles duplicate headers, multiple sheets, etc. The existing panther functions (`readXlsxFileAsSingleCsv`, `getXlsxSheetNames`) are built on the same underlying library but wrap results in the `Csv` class which requires unique headers.

### 3.1b XLSForm Parsing Utility

**New file: `server/server_only_funcs_csvs/parse_xlsform.ts`**

This function reads an XLSForm Excel file and extracts variable definitions and choice lists.

```typescript
type XlsFormVarInfo = {
  name: string;
  label: string;
  type: "select_one" | "select_multiple" | "other";
  listName?: string;  // Only for select_one / select_multiple
};

type XlsFormChoiceInfo = {
  name: string;       // The choice value (stored in data)
  label: string;      // Human-readable label
};

type ParsedXlsForm = {
  vars: Map<string, XlsFormVarInfo>;                    // var_name → info
  choiceLists: Map<string, XlsFormChoiceInfo[]>;        // list_name → choices
};

export function parseXlsForm(filePath: string): ParsedXlsForm
```

**Implementation:**

1. Import `readXlsxFileAsSheets` from a new local utility (see section 3.1a below)
2. Read the XLSForm as raw arrays of arrays per sheet (NOT `readXlsxFileAsSingleCsv` — XLSForm survey sheets can have duplicate column headers which causes the panther Csv class to error)
3. Verify `survey` and `choices` sheets exist

**Survey sheet processing:**
- Required columns: `type`, `name`, plus at least one label column
- For each row:
  - Skip structural/metadata types: `begin_group`, `end_group`, `begin_repeat`, `end_repeat`, `note`, `start`, `end`, `today`, `deviceid`, `phonenumber`, `username`, `audit`, `hidden`
  - Include `calculate` fields — they produce data columns in ODK exports and must be in the vars map for CSV validation to pass
  - Extract `name` → var_name, label column → var_label
  - If `type` starts with `select_one `: extract list_name, mark as select_one
  - If `type` starts with `select_multiple `: extract list_name, mark as select_multiple
  - Store in vars map

**Choices sheet processing:**
- Required columns: `list_name`, `name`, plus at least one label column
- For each row: store by list_name → [(name, label), ...]

**Label column detection:**
- XLSForm label columns can be: `label`, `label::English`, `label::English (en)`, `label::Français (fr)`, etc.
- Priority: exact `label` column → first `label::*` column
- Same logic for both survey and choices sheets
- If no label column found → error

**Error handling:**
- Missing `survey` or `choices` sheet → error
- Missing required columns → error
- Duplicate var_names in survey → error

### 3.2 Update Step 1 Handler

**File: `server/db/instance/dataset_hfa.ts`**

New signature:
```typescript
async (mainDb: Sql, csvAssetFileName: string, xlsFormAssetFileName: string) => Promise<APIResponseNoData>
```

Changes:
1. Validate CSV file (existing logic via `getCsvDetails()`)
2. Validate XLSForm file exists at `join(_ASSETS_DIR_PATH, xlsFormAssetFileName)`
3. Verify XLSForm has `survey` and `choices` sheets (basic validation — full parsing at staging)
4. Store combined result as `DatasetHfaStep1Result` JSON in `step_1_result`

### 3.3 Step 2 Handler — Unchanged

No changes to `updateDatasetHfaUploadAttempt_Step2Mappings()`. The `time_point_label` moves to step 4.

### 3.4 Update Staging Worker

**File: `server/worker_routines/stage_hfa_data_csv/worker.ts`**

This is the most complex change. The staging worker currently:
1. Reads CSV
2. Transforms wide → long format
3. Validates facilities
4. Creates staging table
5. Gathers statistics

#### New Step 1b: Parse XLSForm

- Read XLSForm file path from `step_1_result.xlsForm.filePath`
- Call `parseXlsForm(filePath)` to get vars and choice lists

#### New Step 1c: Validate Single time_point

- After reading CSV, scan the time_point column
- Collect all unique time_point values
- If more than one unique value → error: "CSV contains multiple time points ({values}). Import one round at a time."
- Store the single `timePointValue` for use in dictionary

#### New Step 1d: Match CSV Columns to XLSForm

CSV column names from ODK exports may include group path prefixes (e.g., `section_a/subsection/var_name`). The XLSForm `name` field only has the local name (e.g., `var_name`).

**Column matching strategy:**
1. Build a map from XLSForm var names to their info
2. For each CSV data column (excluding facility_id and time_point):
   - Extract the "local name" by taking everything after the last `/` (e.g., `section_a/b2` → `b2`)
   - Look up the local name in the XLSForm vars map
   - If not found → error: "CSV column '{col}' not found in XLSForm. The data file must match the questionnaire."
3. XLSForm having extra vars not in CSV is allowed (informational count)

#### Updated Step 2: Wide-to-Long Transformation with select_multiple Expansion

The existing wide-to-long transformation changes for `select_multiple` columns:

**For regular columns (non-select_multiple):**
- Same as current: one record per (facility_id, time_point, var_name, value)
- var_name = CSV column local name

**For `select_multiple` columns:**
- The CSV cell contains space-separated choice codes (e.g., `"1 2 7 8"`)
- Expand into binary variables — one var_name per choice from the choices sheet
- var_name format: `{original_var_name}_{choice_name}` (e.g., `c8a_1`, `c8a_2`, ..., `c8a_8`)
- value: `"1"` if the choice code appears in the cell, `"0"` if not
- Empty cell → all choices get `"0"`

**Example:**
- CSV column `c8a` is `select_multiple early_foods`
- Choices for `early_foods`: 1 (Breastmilk), 2 (Water), 3 (Formula), ..., 8 (Not sure)
- CSV cell value: `"1 2 7 8"`
- Produces records:
  - `(facility_id, time_point, "c8a_1", "1")`
  - `(facility_id, time_point, "c8a_2", "1")`
  - `(facility_id, time_point, "c8a_3", "0")`
  - `(facility_id, time_point, "c8a_4", "0")`
  - `(facility_id, time_point, "c8a_5", "0")`
  - `(facility_id, time_point, "c8a_6", "0")`
  - `(facility_id, time_point, "c8a_7", "1")`
  - `(facility_id, time_point, "c8a_8", "1")`

This means the number of records per row increases significantly for datasets with many select_multiple questions.

#### New Step 5b: Populate Dictionary Staging Tables

Create temporary staging tables for dictionary data:
```sql
CREATE UNLOGGED TABLE uploaded_hfa_dictionary_vars_staging (
  time_point text NOT NULL,
  var_name text NOT NULL,
  var_label text NOT NULL,
  PRIMARY KEY (time_point, var_name)
);
CREATE UNLOGGED TABLE uploaded_hfa_dictionary_values_staging (
  time_point text NOT NULL,
  var_name text NOT NULL,
  value text NOT NULL,
  value_label text NOT NULL,
  PRIMARY KEY (time_point, var_name, value)
);
```

**Dictionary population:**
- For each CSV column that maps to an XLSForm var:
  - Insert `(timePoint, varName, varLabel)` into vars staging
  - For `select_one`: insert `(timePoint, varName, choiceName, choiceLabel)` for each choice into values staging
  - For `select_multiple`: each expanded binary variable gets a **composite label** combining the parent question and the choice label. Format: `"{question_label} - {choice_label}"` (e.g., `c8a_1` → `"What foods were given to the child? - Breastmilk"`). This makes each variable self-describing without requiring UI grouping logic. Truncate the question portion if excessively long.
  - Also insert a parent entry for the original select_multiple var_name with its question label (for reference/grouping if desired)

**Update staging result:**
- Add `timePointValue`, `nDictionaryVars`, `nDictionaryValues`, `nXlsFormVarsNotInCsv`, `nSelectMultipleExpanded` to the result JSON
- Include staging table names for dictionary tables in the result

### 3.5 Update Integration Worker

**File: `server/worker_routines/integrate_hfa_data/worker.ts`**

All operations in a **single transaction**:

```sql
BEGIN;

-- 1. Delete existing data for this time_point
DELETE FROM dataset_hfa WHERE time_point = $timePoint;
DELETE FROM dataset_hfa_dictionary_vars WHERE time_point = $timePoint;
  -- (cascades to dataset_hfa_dictionary_values)
DELETE FROM dataset_hfa_dictionary_time_points WHERE time_point = $timePoint;

-- 2. Insert time_point label
INSERT INTO dataset_hfa_dictionary_time_points (time_point, time_point_label)
VALUES ($timePoint, $timePointLabel);

-- 3. Insert dictionary data from staging
INSERT INTO dataset_hfa_dictionary_vars (time_point, var_name, var_label)
SELECT time_point, var_name, var_label FROM uploaded_hfa_dictionary_vars_staging;

INSERT INTO dataset_hfa_dictionary_values (time_point, var_name, value, value_label)
SELECT time_point, var_name, value, value_label FROM uploaded_hfa_dictionary_values_staging;

-- 4. Insert HFA data from staging (INSERT only — no UPDATE needed since we deleted first)
INSERT INTO dataset_hfa (facility_id, time_point, var_name, value, version_id)
SELECT facility_id, time_point, var_name, value, $nextVersionId
FROM uploaded_hfa_data_staging_ready_for_integration;

-- 5. Create/update version record
INSERT INTO dataset_hfa_versions (id, n_rows_total_imported, n_rows_inserted, n_rows_updated, staging_result)
VALUES ($nextVersionId, $nRows, $nRows, 0, $stagingResultJson);

COMMIT;
```

**Cleanup:** Drop all staging tables (data + dictionary) after commit.

**Simplified logic:** Since we delete all data for the time_point first, the current UPDATE-then-INSERT pattern simplifies to just INSERT.

### 3.6 Update Step 4 — Collect time_point_label

The integration endpoint now accepts `timePointLabel`:

**Route body:** `{ timePointLabel: string }`

The user provides the label at step 4 (review screen) after staging has extracted and displayed the actual `timePointValue`. The label is passed to the integration worker along with the rest of the staging result.

### 3.7 Update Route Handlers

**File: `server/routes/instance/datasets.ts`**

**`uploadDatasetHfaCsv` route:**
- Update body type: `{ csvAssetFileName: string, xlsFormAssetFileName: string }`

**`finalizeDatasetHfaIntegration` route:**
- Update body type: `{ timePointLabel: string }`

### 3.8 Update API Route Definitions

**File: `lib/api-routes/instance/datasets.ts`**

Update `uploadDatasetHfaCsv` body type from `{ assetFileName: string }` to `{ csvAssetFileName: string, xlsFormAssetFileName: string }`.

Update `finalizeDatasetHfaIntegration` body type to include `{ timePointLabel: string }`.

### 3.9 Dictionary Usage (Out of Scope)

How the dictionary data gets surfaced to users (e.g., labeled variable names in the HFA data viewer, value labels in visualizations/exports) is a separate piece of work to tackle after the dictionary tables are populated and working. This plan covers population only.

The existing `getDatasetHfaItemsForDisplay()` function returns `variableLabels: Record<string, string>` — a future change could JOIN to `dataset_hfa_dictionary_vars` to populate this, but that's not part of this plan.

### 3.10 Update `deleteAllDatasetHfaData()`

**File: `server/db/instance/dataset_hfa.ts`**

Add deletion of dictionary tables (correct FK order):
```sql
DELETE FROM dataset_hfa_dictionary_values;
DELETE FROM dataset_hfa_dictionary_vars;
DELETE FROM dataset_hfa_dictionary_time_points;
DELETE FROM dataset_hfa;
DELETE FROM dataset_hfa_versions;
```

### 3.11 Add `isXlsx` to AssetInfo

**File: `server/db/instance/assets.ts`** and **`lib/types/assets.ts`**

Add `isXlsx: boolean` to `AssetInfo` type, detected by `.xlsx` or `.xls` extension. Used to filter the asset dropdown in step 1. The upload system itself already accepts any file type — no upload changes needed.

---

## 4. Client Changes

### 4.1 Step 1: Add XLSForm Upload

**File: `client/src/components/instance_dataset_hfa_import/step_1.tsx`**

Currently: Single file upload (CSV) + dropdown selector.

New UI layout:
```
┌─────────────────────────────────────────┐
│  CSV Data File                          │
│  [Upload new CSV file]                  │
│  Select: [dropdown of .csv assets ▼]    │
│                                         │
│  XLSForm Questionnaire File             │
│  [Upload new XLSForm file]              │
│  Select: [dropdown of .xlsx assets ▼]   │
│                                         │
│  [Save]                                 │
└─────────────────────────────────────────┘
```

Changes:
- Add second Uppy instance for XLSForm upload (trigger: `#select-xlsform-button`)
- Add `selectedXlsFormFileName` signal
- Filter dropdowns: CSV shows `.csv` files, XLSForm shows `.xlsx`/`.xls` files via `isXlsx`
- Save sends both: `serverActions.uploadDatasetHfaCsv({ csvAssetFileName, xlsFormAssetFileName })`
- Both files required for save to enable

**Props update:**
```typescript
type Props = {
  step1Result: DatasetHfaStep1Result | undefined;  // Changed from CsvDetails
  silentFetch: () => Promise<void>;
};
```

### 4.2 Step 2: Column Mapping — Unchanged

No changes. The time_point_label has moved to step 4.

### 4.3 Step 4: Show Dictionary Info + Collect time_point_label

**File: `client/src/components/instance_dataset_hfa_import/step_4.tsx`**

Add to the review display:
```
┌─────────────────────────────────────────┐
│  ... existing row count stats ...       │
│                                         │
│  Data Dictionary                        │
│  Time point value: "3"                  │
│  Variable labels extracted: 245         │
│  Value labels extracted: 1,830          │
│  select_multiple expanded: 14 questions │
│  XLSForm vars not in CSV: 12 (ok)       │
│                                         │
│  Time Point Label                       │
│  (e.g. "December 2025", "Round 3")      │
│  [________________________]             │
│                                         │
│  [Integrate and finalize]               │
└─────────────────────────────────────────┘
```

The time_point_label text input appears here because:
- The user can now see the actual `timePointValue` extracted during staging
- They label what they can see, not something abstract

The finalize action sends `{ timePointLabel }` to `finalizeDatasetHfaIntegration`.

### 4.4 Update Server Actions

**File: `client/src/server_actions/` (relevant HFA file)**

Update `uploadDatasetHfaCsv` payload: `{ csvAssetFileName, xlsFormAssetFileName }`.
Update `finalizeDatasetHfaIntegration` payload: `{ timePointLabel }`.

### 4.5 Update Import Index Component

**File: `client/src/components/instance_dataset_hfa_import/index.tsx`**

Update references to `step1Result` — it's now `DatasetHfaStep1Result` instead of `CsvDetails`. Access CSV details via `.csv` (e.g., `step1Result.csv.headers`).

---

## 5. XLSForm Parsing Details

### 5.1 XLSForm Structure Reference

**Survey sheet columns:**
| Column | Required | Description |
|--------|----------|-------------|
| `type` | Yes | Question type (text, integer, select_one listname, etc.) |
| `name` | Yes | Variable name (becomes var_name in our DB) |
| `label` (or variant) | Yes | Human-readable question text (becomes var_label) |

**Choices sheet columns:**
| Column | Required | Description |
|--------|----------|-------------|
| `list_name` | Yes | Choice list identifier |
| `name` | Yes | Choice value (stored in data) |
| `label` (or variant) | Yes | Human-readable choice text (becomes value_label) |

### 5.2 Question Types to Handle

**Include (extract var_name + var_label):**
- `text`, `integer`, `decimal`, `date`, `time`, `datetime`
- `select_one {list_name}` — also extract value labels from choices
- `select_multiple {list_name}` — also extract value labels, AND flag for binary expansion
- `calculate` — include; these produce data columns in ODK exports
- `geopoint`, `geotrace`, `geoshape`
- `image`, `audio`, `video`, `file`
- `barcode`, `range`, `rank`
- Any other type with a `name` that isn't structural

**Skip (no data column):**
- `begin_group`, `end_group`
- `begin_repeat`, `end_repeat`
- `note` (display only, no data)
- Metadata types: `start`, `end`, `today`, `deviceid`, `phonenumber`, `username`, `audit`, `hidden`

### 5.3 Label Column Resolution

Priority order:
1. Exact column named `label`
2. First column matching `label::*` pattern
3. Error if no label column found

Same logic for both survey and choices sheets.

Note: XLSForm survey sheets can have duplicate column headers (e.g., multiple `label::` variants). Must use `readXlsxFileAsSheets()` from the new local xlsx utility (section 3.1a) instead of panther's `readXlsxFileAsSingleCsv` which errors on duplicate headers.

### 5.4 Group Path Prefix Handling

ODK exports may prefix variable names with their group path:
- XLSForm `name`: `b2`
- CSV column: `section_a/subsection/b2`

**Matching strategy:** Strip everything before and including the last `/` in CSV column names when matching to XLSForm names. Use the full CSV column name for display/error messages, but the local name (after last `/`) for XLSForm lookup.

### 5.5 select_multiple Binary Expansion

When a CSV column corresponds to a `select_multiple` question:

1. The CSV cell contains space-separated choice codes (e.g., `"1 2 7 8"`)
2. Get the full list of choices from the XLSForm choices sheet for that list_name
3. For each possible choice, create a binary variable:
   - var_name: `{original_name}_{choice_name}` (e.g., `c8a_1`)
   - value: `"1"` if choice code is in the space-separated string, `"0"` otherwise
   - var_label in dictionary: the choice label (e.g., "Breastmilk")
   - Separator is single underscore `_` — valid in R and Postgres, readable by users
4. Empty cell → all binary vars get `"0"`

### 5.6 Edge Cases

- **Empty labels**: If a var has an empty label, use the var_name as the label
- **select_one or_other**: Creates an additional `{var_name}_other` column — handle if present in CSV
- **Spaces in list_name**: `select_one` type format is `select_one {list_name}` — split on first space only

---

## 6. File-by-File Change Summary

### New Files
| File | Description |
|------|-------------|
| `server/db/migrations/instance/012_add_hfa_dictionary_tables.sql` | Migration for 3 new tables + clear upload attempts |
| `server/server_only_funcs_csvs/read_xlsx_raw.ts` | Raw xlsx reading utility (candidate for panther later) |
| `server/server_only_funcs_csvs/parse_xlsform.ts` | XLSForm parsing utility |

### Modified Files
| File | Changes |
|------|---------|
| `server/db/instance/_main_database.sql` | Add 3 new table definitions |
| `server/db/instance/dataset_hfa.ts` | Update step 1 handler (accept both files), add dictionary functions, update delete function |
| `server/db/instance/assets.ts` | Add `isXlsx` detection |
| `server/routes/instance/datasets.ts` | Update route handler body types for step 1 and finalize |
| `server/worker_routines/stage_hfa_data_csv/worker.ts` | XLSForm parsing, single time_point validation, column matching with group prefix stripping, select_multiple expansion, dictionary staging |
| `server/worker_routines/integrate_hfa_data/worker.ts` | Single-transaction delete+insert for time_point, insert dictionary data, simplified (no UPDATE, just INSERT) |
| `lib/types/dataset_hfa.ts` | Add dictionary types |
| `lib/types/dataset_hfa_import.ts` | New `DatasetHfaStep1Result` type, update `DatasetHfaCsvStagingResult` |
| `lib/types/assets.ts` | Add `isXlsx: boolean` to `AssetInfo` |
| `lib/api-routes/instance/datasets.ts` | Update body types for uploadDatasetHfaCsv and finalizeDatasetHfaIntegration |
| `client/src/components/instance_dataset_hfa_import/step_1.tsx` | Add XLSForm upload UI, dual file selection |
| `client/src/components/instance_dataset_hfa_import/step_4.tsx` | Show dictionary stats, add time_point_label input |
| `client/src/components/instance_dataset_hfa_import/index.tsx` | Update step1Result type references |
| `client/src/server_actions/` (HFA file) | Update payload types |

---

## 7. Implementation Order

### Phase 1: Database & Types
1. Create migration `012_add_hfa_dictionary_tables.sql`
2. Add table definitions to `_main_database.sql`
3. Add new types to `lib/types/dataset_hfa.ts`
4. Update types in `lib/types/dataset_hfa_import.ts`
5. Add `isXlsx` to `AssetInfo`

### Phase 2: XLSX Utility & XLSForm Parser
6. Add `"xlsx": "npm:xlsx@0.18.5"` to root `deno.json`
7. Create `server/server_only_funcs_csvs/read_xlsx_raw.ts`
8. Create `server/server_only_funcs_csvs/parse_xlsform.ts` (imports from read_xlsx_raw)
9. Test with sample XLSForm files

### Phase 3: Server — Step 1 Update
8. Update `updateDatasetHfaUploadAttempt_Step1CsvUpload()` to accept both files
9. Update route handler and API route definition

### Phase 4: Server — Staging Worker Updates
10. Add XLSForm parsing to staging worker
11. Add single time_point validation
12. Add CSV-XLSForm column matching with group prefix stripping
13. Add select_multiple binary expansion to wide-to-long transformation
14. Add dictionary staging table creation and population
15. Update staging result with new fields

### Phase 5: Server — Integration Worker Updates
16. Wrap all operations in single transaction
17. Add delete-for-time_point logic (data + dictionary)
18. Add dictionary data insertion
19. Add time_point_label insertion (from finalize request body)
20. Simplify to INSERT-only (no UPDATE needed after delete)
21. Drop all staging tables after commit
22. Update `deleteAllDatasetHfaData()` to include dictionary tables

### Phase 6: Client Updates
23. Update step_1.tsx with XLSForm upload (dual file selection)
24. Update step_4.tsx with dictionary stats + time_point_label input
25. Update index.tsx and server actions for new types
26. Update asset dropdown filtering (isXlsx)

### Phase 7: Testing & Polish
27. End-to-end test with real XLSForm + CSV pair
28. Test select_multiple expansion produces correct binary variables
29. Test group-prefixed CSV column names match correctly
30. Test re-import for same time_point (delete + re-insert in single transaction)
31. Test error cases (multi time_point CSV, mismatched columns, malformed XLSForm)
32. Verify existing HFA display still works with dictionary data available

---

## 8. Decisions Made

| Item | Decision | Rationale |
|------|----------|-----------|
| XLSForm mandatory | Yes, required | User confirmed — always available for HFA surveys |
| Single time_point per import | Yes, enforced | User confirmed — one round at a time |
| `calculate` fields | Include in vars map | They produce CSV data columns; must be in map for validation to pass |
| Group prefixes | Strip at last `/` when matching | XLSForm spec defines groups; ODK exports may prefix column names |
| select_multiple | Expand to binary variables | One var per choice, value 0/1; var_name format `{name}_{choice}` |
| time_point_label | Collected at step 4 | User sees actual value after staging, labels what they can see |
| Transaction safety | Single transaction for delete+insert | Prevents data loss on crash |
| In-progress uploads | Cleared in migration | step_1_result format is changing |
| `nCsvVarsNotInXlsForm` | Removed from staging result | Always 0 — validation rejects first |
| `hfa_indicators` table | Unrelated, no changes | Different purpose (R script generation vs labels) |
| XLSX parsing | Use raw XLSX_utils | Survey sheets can have duplicate column headers |
