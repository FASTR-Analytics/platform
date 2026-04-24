# Plan: HFA Schema Redesign (V3)

## Overview

Clean redesign of HFA schema with:

- `label` as primary key (no UUID - sufficient for ~10 time points)
- Period ID (YYYYMM) and sort order
- Cleaner table naming (`hfa_*` prefix)
- `ON UPDATE CASCADE` for label renames
- Consistent naming: `timePoint` for all references to label value

**No existing HFA data to preserve** - drop all HFA tables and recreate.

---

## Instance Database Schema

```sql
-- ============================================================================
-- HFA TIME POINTS
-- ============================================================================

CREATE TABLE hfa_time_points (
  label TEXT PRIMARY KEY,
  period_id TEXT NOT NULL,
  sort_order INTEGER NOT NULL,
  imported_at TIMESTAMPTZ
);

-- ============================================================================
-- HFA VARIABLES
-- ============================================================================

CREATE TABLE hfa_variables (
  time_point TEXT NOT NULL REFERENCES hfa_time_points(label) ON UPDATE CASCADE ON DELETE CASCADE,
  var_name TEXT NOT NULL,
  var_label TEXT NOT NULL,
  var_type TEXT NOT NULL,
  PRIMARY KEY (time_point, var_name)
);

-- ============================================================================
-- HFA VARIABLE VALUES
-- ============================================================================

CREATE TABLE hfa_variable_values (
  time_point TEXT NOT NULL,
  var_name TEXT NOT NULL,
  value TEXT NOT NULL,
  value_label TEXT NOT NULL,
  PRIMARY KEY (time_point, var_name, value),
  FOREIGN KEY (time_point, var_name) REFERENCES hfa_variables(time_point, var_name) ON UPDATE CASCADE ON DELETE CASCADE
);

-- ============================================================================
-- HFA DATA
-- ============================================================================

CREATE TABLE hfa_data (
  facility_id TEXT NOT NULL REFERENCES facilities(facility_id),
  time_point TEXT NOT NULL REFERENCES hfa_time_points(label) ON UPDATE CASCADE ON DELETE CASCADE,
  var_name TEXT NOT NULL,
  value TEXT NOT NULL,
  PRIMARY KEY (facility_id, time_point, var_name),
  FOREIGN KEY (time_point, var_name) REFERENCES hfa_variables(time_point, var_name) ON UPDATE CASCADE ON DELETE CASCADE
);

CREATE INDEX idx_hfa_data_var_name ON hfa_data(var_name);
CREATE INDEX idx_hfa_data_facility_id ON hfa_data(facility_id);
CREATE INDEX idx_hfa_data_time_point ON hfa_data(time_point);

-- ============================================================================
-- HFA INDICATORS (unchanged - var_name is natural key for R code)
-- ============================================================================

CREATE TABLE hfa_indicators (
  var_name TEXT PRIMARY KEY NOT NULL,
  category TEXT NOT NULL DEFAULT '',
  definition TEXT NOT NULL DEFAULT '',
  type TEXT NOT NULL CHECK (type IN ('binary', 'numeric')),
  aggregation TEXT NOT NULL DEFAULT 'sum' CHECK (aggregation IN ('sum', 'avg')),
  sort_order INTEGER NOT NULL DEFAULT 0,
  has_syntax_error BOOLEAN NOT NULL DEFAULT FALSE,
  code_consistent BOOLEAN NOT NULL DEFAULT TRUE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================================
-- HFA INDICATOR CODE
-- ============================================================================

CREATE TABLE hfa_indicator_code (
  var_name TEXT NOT NULL REFERENCES hfa_indicators(var_name) ON DELETE CASCADE,
  time_point TEXT NOT NULL REFERENCES hfa_time_points(label) ON UPDATE CASCADE ON DELETE RESTRICT,
  r_code TEXT NOT NULL DEFAULT '',
  r_filter_code TEXT,
  PRIMARY KEY (var_name, time_point)
);

-- ============================================================================
-- HFA UPLOAD ATTEMPTS
-- ============================================================================

CREATE TABLE hfa_upload_attempts (
  id TEXT PRIMARY KEY NOT NULL DEFAULT 'single_row' CHECK (id = 'single_row'),
  date_started TEXT NOT NULL,
  step INTEGER NOT NULL,
  status TEXT NOT NULL,
  status_type TEXT NOT NULL,
  source_type TEXT NOT NULL,
  step_1_result TEXT,
  step_2_result TEXT,
  step_3_result TEXT
);
```

---

## Project Database Schema

```sql
CREATE TABLE hfa_indicators_snapshot (
  var_name TEXT PRIMARY KEY NOT NULL,
  category TEXT NOT NULL,
  definition TEXT NOT NULL,
  type TEXT NOT NULL,
  aggregation TEXT NOT NULL,
  sort_order INTEGER NOT NULL
);

CREATE TABLE hfa_indicator_code_snapshot (
  var_name TEXT NOT NULL REFERENCES hfa_indicators_snapshot(var_name) ON DELETE CASCADE,
  time_point TEXT NOT NULL,
  r_code TEXT NOT NULL DEFAULT '',
  r_filter_code TEXT,
  PRIMARY KEY (var_name, time_point)
);
```

---

## TypeScript Types

### `lib/types/dataset_hfa.ts`

```typescript
// RENAMED from DatasetHfaDictionaryTimePoint
export type HfaTimePoint = {
  label: string;
  periodId: string;
  sortOrder: number;
  importedAt: string | undefined;
};

// REMOVE: DatasetHfaDictionaryVar (internal only)
// REMOVE: DatasetHfaDictionaryValue (internal only)

export type DatasetHfaDetail = {
  uploadAttempt: DatasetHfaUploadAttemptSummary | undefined;
  timePoints: HfaTimePoint[];
  cacheHash: string;
};

export type HfaVariableRow = {
  varName: string;
  varType: string;
  timePoint: string;           // REMOVE timePointLabel (was redundant)
  varLabel: string;
  count: number;
  missing: number;
  questionnaireValues: string;
  dataValues: string;
};

export type ItemsHolderDatasetHfaDisplay = {
  rows: HfaVariableRow[];
  cacheHash: string;
};
```

### `lib/types/dataset_hfa_import.ts`

```typescript
export type HfaCsvMappingParams = {
  facilityIdColumn: string;    // RENAMED from facility_id (clarifies it's a column name)
  timePoint: string;           // RENAMED from timePointId (the label value)
  periodId: string;            // RENAMED from timePointPeriodId (YYYYMM)
};
// REMOVED: old timePointLabel field

export type DatasetHfaCsvStagingResult = {
  stagingTableName: string;
  dictionaryVarsStagingTableName: string;
  dictionaryValuesStagingTableName: string;
  dateImported: string;
  assetFileName: string;
  nRowsInFile: number;
  nRowsValid: number;
  nRowsInvalidMissingFacilityId: number;
  nRowsInvalidFacilityNotFound: number;
  nRowsDuplicated: number;
  nRowsTotal: number;
  byVariable: [];
  timePoint: string;           // RENAMED from timePointValue
  nDictionaryVars: number;
  nDictionaryValues: number;
  nXlsFormVarsNotInCsv: number;
  nCsvColsNotInXlsForm: number;
  nSelectMultipleExpanded: number;
};
```

### `lib/types/hfa_types.ts`

```typescript
export type HfaIndicator = {
  varName: string;
  category: string;
  definition: string;
  type: "binary" | "numeric";
  aggregation: "sum" | "avg";
  sortOrder: number;
  hasSyntaxError: boolean;
  codeConsistent: boolean;
};

export type HfaIndicatorCode = {
  varName: string;
  timePoint: string;           // NO CHANGE (already correct)
  rCode: string;
  rFilterCode: string | undefined;
};

export type HfaDictionaryForValidation = {
  timePoints: {
    timePoint: string;         // REMOVE timePointLabel (was redundant)
    vars: { varName: string; varLabel: string; varType: string }[];
    values: { varName: string; value: string; valueLabel: string }[];
  }[];
};
```

### `lib/types/instance_sse.ts`

```typescript
import type { HfaTimePoint } from "./dataset_hfa.ts";  // RENAMED from DatasetHfaDictionaryTimePoint

export type InstanceState = {
  // ... other fields ...
  hfaTimePoints: HfaTimePoint[];  // CHANGED type
  // ...
};

export type InstanceDatasetsSummary = {
  // ... other fields ...
  hfaTimePoints: HfaTimePoint[];  // CHANGED type
  // ...
};
```

---

## Data Flow

```
IMPORT (Step 2 UI):
  User enters:
    - facilityIdColumn: selects CSV column from dropdown
    - timePoint: types label (e.g., "Round 1")
    - periodId: selects from year (2020-2035) + month (1-12) dropdowns → "202501"

STAGING (Step 3 Worker):
  Stores in DatasetHfaCsvStagingResult:
    - timePoint: "Round 1"
  Creates staging tables with time_point = "Round 1"

INTEGRATION (Step 4 Worker):
  Reads timePoint from staging result
  UPSERT into hfa_time_points:
    - label = "Round 1"
    - period_id = "202501"
    - sort_order = COALESCE(MAX(sort_order), 0) + 1  (if new)
    - imported_at = NOW()

STORAGE:
  hfa_time_points: {label: "Round 1", period_id: "202501", sort_order: 1, imported_at: ...}
  hfa_data: {facility_id: "F1", time_point: "Round 1", var_name: "q1", value: "1"}
  hfa_indicator_code: {var_name: "ind1", time_point: "Round 1", r_code: "q1 == 1"}

EXPORT TO PROJECT:
  CSV column time_point = "Round 1" (direct copy, no JOIN needed)
  Snapshot hfa_indicator_code_snapshot.time_point = "Round 1"

R SCRIPT:
  case_when(time_point == "Round 1" ~ ...)

LABEL RENAME (via editor UI):
  UPDATE hfa_time_points SET label = 'Round 1 (Dec 2025)' WHERE label = 'Round 1'
  CASCADE automatically updates all referencing tables
```

---

## Files to Modify

### Phase 1: Database Migration

**`server/db/migrations/instance/023_hfa_schema_redesign.sql`** (new)

```sql
-- Drop all existing HFA tables
DROP TABLE IF EXISTS hfa_indicator_code CASCADE;
DROP TABLE IF EXISTS dataset_hfa CASCADE;
DROP TABLE IF EXISTS dataset_hfa_dictionary_values CASCADE;
DROP TABLE IF EXISTS dataset_hfa_dictionary_vars CASCADE;
DROP TABLE IF EXISTS dataset_hfa_dictionary_time_points CASCADE;
DROP TABLE IF EXISTS dataset_hfa_upload_attempts CASCADE;

-- Create hfa_time_points
CREATE TABLE hfa_time_points (
  label TEXT PRIMARY KEY,
  period_id TEXT NOT NULL,
  sort_order INTEGER NOT NULL,
  imported_at TIMESTAMPTZ
);

-- Create hfa_variables
CREATE TABLE hfa_variables (
  time_point TEXT NOT NULL REFERENCES hfa_time_points(label) ON UPDATE CASCADE ON DELETE CASCADE,
  var_name TEXT NOT NULL,
  var_label TEXT NOT NULL,
  var_type TEXT NOT NULL,
  PRIMARY KEY (time_point, var_name)
);

-- Create hfa_variable_values
CREATE TABLE hfa_variable_values (
  time_point TEXT NOT NULL,
  var_name TEXT NOT NULL,
  value TEXT NOT NULL,
  value_label TEXT NOT NULL,
  PRIMARY KEY (time_point, var_name, value),
  FOREIGN KEY (time_point, var_name) REFERENCES hfa_variables(time_point, var_name) ON UPDATE CASCADE ON DELETE CASCADE
);

-- Create hfa_data
CREATE TABLE hfa_data (
  facility_id TEXT NOT NULL REFERENCES facilities(facility_id),
  time_point TEXT NOT NULL REFERENCES hfa_time_points(label) ON UPDATE CASCADE ON DELETE CASCADE,
  var_name TEXT NOT NULL,
  value TEXT NOT NULL,
  PRIMARY KEY (facility_id, time_point, var_name),
  FOREIGN KEY (time_point, var_name) REFERENCES hfa_variables(time_point, var_name) ON UPDATE CASCADE ON DELETE CASCADE
);

CREATE INDEX idx_hfa_data_var_name ON hfa_data(var_name);
CREATE INDEX idx_hfa_data_facility_id ON hfa_data(facility_id);
CREATE INDEX idx_hfa_data_time_point ON hfa_data(time_point);

-- Create hfa_indicators (unchanged structure, just ensuring it exists)
CREATE TABLE IF NOT EXISTS hfa_indicators (
  var_name TEXT PRIMARY KEY NOT NULL,
  category TEXT NOT NULL DEFAULT '',
  definition TEXT NOT NULL DEFAULT '',
  type TEXT NOT NULL CHECK (type IN ('binary', 'numeric')),
  aggregation TEXT NOT NULL DEFAULT 'sum' CHECK (aggregation IN ('sum', 'avg')),
  sort_order INTEGER NOT NULL DEFAULT 0,
  has_syntax_error BOOLEAN NOT NULL DEFAULT FALSE,
  code_consistent BOOLEAN NOT NULL DEFAULT TRUE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Create hfa_indicator_code
CREATE TABLE hfa_indicator_code (
  var_name TEXT NOT NULL REFERENCES hfa_indicators(var_name) ON DELETE CASCADE,
  time_point TEXT NOT NULL REFERENCES hfa_time_points(label) ON UPDATE CASCADE ON DELETE RESTRICT,
  r_code TEXT NOT NULL DEFAULT '',
  r_filter_code TEXT,
  PRIMARY KEY (var_name, time_point)
);

-- Create hfa_upload_attempts
CREATE TABLE hfa_upload_attempts (
  id TEXT PRIMARY KEY NOT NULL DEFAULT 'single_row' CHECK (id = 'single_row'),
  date_started TEXT NOT NULL,
  step INTEGER NOT NULL,
  status TEXT NOT NULL,
  status_type TEXT NOT NULL,
  source_type TEXT NOT NULL,
  step_1_result TEXT,
  step_2_result TEXT,
  step_3_result TEXT
);
```

**`server/db/instance/_main_database.sql`**
- Replace old HFA table definitions with new schema

**`server/db/project/_project_database.sql`**
- Verify snapshot tables are correct (should be unchanged)

---

### Phase 2: Types

**`lib/types/dataset_hfa.ts`**
- Rename `DatasetHfaDictionaryTimePoint` → `HfaTimePoint`
- Update `HfaTimePoint` fields: `{ label, periodId, sortOrder, importedAt }`
- Remove `DatasetHfaDictionaryVar`, `DatasetHfaDictionaryValue`
- Update `HfaVariableRow`: remove `timePointLabel` field

**`lib/types/dataset_hfa_import.ts`**
- Update `HfaCsvMappingParams`: `{ facilityIdColumn, timePoint, periodId }`
- Update `DatasetHfaCsvStagingResult`: rename `timePointValue` → `timePoint`

**`lib/types/hfa_types.ts`**
- Update `HfaDictionaryForValidation.timePoints[]`: remove `timePointLabel`

**`lib/types/instance_sse.ts`**
- Change import: `HfaTimePoint` from `dataset_hfa.ts`
- Update `InstanceState.hfaTimePoints` type
- Update `InstanceDatasetsSummary.hfaTimePoints` type

**`lib/types/mod.ts`**
- Verify exports (should auto-export via `dataset_hfa.ts`)

---

### Phase 3: Instance DB Access

**`server/db/instance/dataset_hfa.ts`**

Table name changes:
- `dataset_hfa_upload_attempts` → `hfa_upload_attempts`
- `dataset_hfa_dictionary_time_points` → `hfa_time_points`
- `dataset_hfa_dictionary_vars` → `hfa_variables`
- `dataset_hfa_dictionary_values` → `hfa_variable_values`
- `dataset_hfa` → `hfa_data`

Column changes in queries:
- `time_point` → `label` (only in hfa_time_points)
- `time_point_label` → removed (label IS the identifier now)
- `date_imported` → `imported_at`

Function changes:
- `computeHfaCacheHash()`: update signature and include sort_order

```typescript
export function computeHfaCacheHash(
  rows: { label: string; sort_order: number; imported_at: string | null }[]
): string {
  return rows
    .map((r) => `${r.label}:${r.sort_order}:${r.imported_at ?? ""}`)
    .join("|");
}
```

- `getDatasetHfaDetail()`: return `HfaTimePoint[]` with new field names
- `getDatasetHfaItemsForDisplay()`: remove `timePointLabel` from `HfaVariableRow`
- `deleteDatasetHfaData()`: update table/column names

**`server/db/instance/hfa_indicators.ts`**

- `getHfaDictionaryForValidation()`: update query, remove `timePointLabel` from result

**`server/db/instance/instance.ts`**

- `getInstanceStartingData()`: update query for `hfa_time_points`, return `HfaTimePoint[]`
- `getDatasetsSummaryData()`: same updates

**`server/db/instance/_main_database_types.ts`**

- Update `DBDatasetHfaUploadAttempt` if needed (table name reference)

**`server/routes/instance/datasets.ts`**

- Update any direct table references

**`server/routes/instance/health.ts`**

- Update table name in health check query

---

### Phase 4: Import Flow

**`client/src/components/instance_dataset_hfa_import/step_2.tsx`**

```typescript
// Old state:
{ facility_id: "", timePointId: "", timePointLabel: "" }

// New state:
{ facilityIdColumn: "", timePoint: "", periodId: "" }

// UI changes:
// - facility_id dropdown → facilityIdColumn dropdown (same behavior, new name)
// - Remove timePointId input
// - Remove timePointLabel input
// - Add single "Time point label" input for timePoint
// - Add year dropdown (2020-2035) + month dropdown (1-12) for periodId
```

**`server/worker_routines/stage_hfa_data_csv/worker.ts`**

```typescript
// Old:
const timePointValue = mappings.timePointId;

// New:
const timePoint = mappings.timePoint;

// Update staging table names:
// - uploaded_hfa_dictionary_vars_staging (unchanged)
// - uploaded_hfa_dictionary_values_staging (unchanged)

// Update staging result:
// - timePointValue → timePoint

// Update column mapping access:
// - mappings.facility_id → mappings.facilityIdColumn
```

**`server/worker_routines/integrate_hfa_data/worker.ts`**

```typescript
// Old:
const timePointLabel = mappings.timePointLabel;
const timePointValue = stagingResult.timePointValue;

// New:
const timePoint = stagingResult.timePoint;
const periodId = mappings.periodId;

// Update table names in queries:
// - dataset_hfa → hfa_data
// - dataset_hfa_dictionary_vars → hfa_variables
// - dataset_hfa_dictionary_values → hfa_variable_values
// - dataset_hfa_dictionary_time_points → hfa_time_points
// - dataset_hfa_upload_attempts → hfa_upload_attempts

// Update UPSERT for time point:
INSERT INTO hfa_time_points (label, period_id, sort_order, imported_at)
VALUES (${timePoint}, ${periodId}, (SELECT COALESCE(MAX(sort_order), 0) + 1 FROM hfa_time_points), NOW())
ON CONFLICT (label) DO UPDATE SET
  period_id = EXCLUDED.period_id,
  imported_at = EXCLUDED.imported_at

// Update column references:
// - time_point = ${timePointValue} → time_point = ${timePoint}
// - time_point_label → removed
```

---

### Phase 5: Project Export & R Scripts

**`server/db/project/datasets_in_project_hfa.ts`**

```typescript
// Update table names:
// - dataset_hfa → hfa_data
// - dataset_hfa_dictionary_time_points → hfa_time_points

// Update export query (time_point column copies directly, no JOIN needed for label):
SELECT h.facility_id, ..., h.time_point, h.var_name, h.value
FROM hfa_data h
...

// Update snapshot copy:
// - time_point column in hfa_indicator_code_snapshot = label value (direct copy)

// Update computeHfaCacheHash call with new signature
```

**`server/server_only_funcs/get_script_with_parameters_hfa.ts`**

- No changes needed (already uses `timePoint` from `HfaIndicatorCode`)

---

### Phase 6: Time Points Editor UI (new)

**`client/src/components/instance_hfa_time_points/`** (new folder)

- `index.tsx` - main editor component
- List time points ordered by sort_order
- Edit label (inline or modal)
- Edit period (year/month dropdowns)
- Reorder (drag or up/down buttons)
- Delete (confirm dialog, warn about RESTRICT if indicator code exists)

**`server/routes/instance/hfa_time_points.ts`** (new)

```typescript
// GET /hfa-time-points
// Returns: HfaTimePoint[]

// PUT /hfa-time-points/:label
// Body: { label?: string, periodId?: string }
// Updates label and/or periodId (label change uses CASCADE)

// POST /hfa-time-points/reorder
// Body: { order: string[] }  // array of labels in new order
// Updates sort_order for all time points

// DELETE /hfa-time-points/:label
// Deletes time point (fails with 409 if indicator code exists due to RESTRICT)
```

**`server/routes/route-tracker.ts`**

- Register new routes

**`client/src/server_actions/`**

- Add API calls for new endpoints

---

### Phase 7: Cleanup

**`server/routes/instance/health.ts`**

- Update table name: `dataset_hfa_dictionary_time_points` → `hfa_time_points`

---

## Table Name Changes

| Old | New |
|-----|-----|
| `dataset_hfa_dictionary_time_points` | `hfa_time_points` |
| `dataset_hfa_dictionary_vars` | `hfa_variables` |
| `dataset_hfa_dictionary_values` | `hfa_variable_values` |
| `dataset_hfa` | `hfa_data` |
| `dataset_hfa_upload_attempts` | `hfa_upload_attempts` |

---

## Column Name Changes

| Table | Old | New |
|-------|-----|-----|
| `hfa_time_points` | `time_point` | `label` |
| `hfa_time_points` | `time_point_label` | (removed) |
| `hfa_time_points` | `date_imported` | `imported_at` |
| `hfa_time_points` | (new) | `period_id` |
| `hfa_time_points` | (new) | `sort_order` |

---

## TypeScript Field Renames

| Type | Old Field | New Field |
|------|-----------|-----------|
| `HfaCsvMappingParams` | `facility_id` | `facilityIdColumn` |
| `HfaCsvMappingParams` | `timePointId` | `timePoint` |
| `HfaCsvMappingParams` | `timePointLabel` | (removed) |
| `HfaCsvMappingParams` | (new) | `periodId` |
| `DatasetHfaCsvStagingResult` | `timePointValue` | `timePoint` |
| `HfaTimePoint` | `timePoint` | `label` |
| `HfaTimePoint` | `timePointLabel` | (removed) |
| `HfaTimePoint` | `dateImported` | `importedAt` |
| `HfaTimePoint` | (new) | `periodId` |
| `HfaTimePoint` | (new) | `sortOrder` |
| `HfaVariableRow` | `timePointLabel` | (removed) |
| `HfaDictionaryForValidation.timePoints[]` | `timePointLabel` | (removed) |

---

## Key Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Time point PK | `label` (text) | Simpler than UUID, sufficient for ~10 time points |
| Label renames | `ON UPDATE CASCADE` | Automatic, atomic, fast for small data |
| hfa_indicator_code FK | `ON DELETE RESTRICT` | Prevent deleting time point with indicator code |
| Other FKs | `ON DELETE CASCADE` | Clean up data when time point deleted |
| sort_order | Auto-increment on insert | `COALESCE(MAX(sort_order), 0) + 1` |
| Period picker | Year (2020-2035) + Month (1-12) | Fixed range, ensures valid YYYYMM |
| Cache hash | Includes sort_order | Reordering invalidates project cache |
| Naming: column refs | `facilityIdColumn` | Clarifies it's a column name, not a value |
| Naming: time point refs | `timePoint` | Consistent everywhere for label value |

---

## Implementation Order

1. Migration (drop all HFA tables, recreate with new schema)
2. Types (all type changes)
3. Instance DB access functions
4. Import flow (step_2 UI + workers)
5. Project export
6. Time points editor UI + routes
7. Test end-to-end
