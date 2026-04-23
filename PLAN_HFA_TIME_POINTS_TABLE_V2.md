# Plan: HFA Time Points Standalone Table (V2)

## Overview

Restructure HFA dataset system to use a standalone `dataset_hfa_time_points` table with server-generated UUID, label, sort_order, and period_id. Downstream code (R scripts, visualizations) will use the label as the time_point identifier.

**Simplification:** No existing HFA data to preserve - drop all HFA tables and recreate cleanly.

---

## New Schema

```sql
CREATE TABLE dataset_hfa_time_points (
  id TEXT PRIMARY KEY,           -- Server-generated via crypto.randomUUID()
  label TEXT NOT NULL UNIQUE,
  sort_order INTEGER NOT NULL,
  period_id TEXT NOT NULL,       -- Format: YYYYMM
  date_imported TIMESTAMP
);

CREATE TABLE dataset_hfa_dictionary_vars (
  time_point_id TEXT NOT NULL REFERENCES dataset_hfa_time_points(id) ON DELETE CASCADE,
  var_name TEXT NOT NULL,
  var_label TEXT NOT NULL,
  var_type TEXT NOT NULL,
  PRIMARY KEY (time_point_id, var_name)
);

CREATE TABLE dataset_hfa_dictionary_values (
  time_point_id TEXT NOT NULL,
  var_name TEXT NOT NULL,
  value TEXT NOT NULL,
  value_label TEXT NOT NULL,
  PRIMARY KEY (time_point_id, var_name, value),
  FOREIGN KEY (time_point_id, var_name) REFERENCES dataset_hfa_dictionary_vars(time_point_id, var_name) ON DELETE CASCADE
);

CREATE TABLE dataset_hfa (
  facility_id TEXT NOT NULL REFERENCES facilities(id),
  time_point_id TEXT NOT NULL REFERENCES dataset_hfa_time_points(id) ON DELETE CASCADE,
  var_name TEXT NOT NULL,
  value TEXT NOT NULL,
  FOREIGN KEY (time_point_id, var_name) REFERENCES dataset_hfa_dictionary_vars(time_point_id, var_name) ON DELETE CASCADE
);

CREATE TABLE hfa_indicator_code (
  var_name TEXT NOT NULL REFERENCES hfa_indicators(var_name) ON DELETE CASCADE,
  time_point_id TEXT NOT NULL REFERENCES dataset_hfa_time_points(id) ON DELETE RESTRICT,
  r_code TEXT NOT NULL,
  r_filter_code TEXT,
  PRIMARY KEY (var_name, time_point_id)
);
```

---

## Phase 1: Database Migration

### 1.1 Create migration file
**File:** `server/db/migrations/instance/0XX_hfa_time_points_restructure.sql`

- DROP all existing HFA tables (CASCADE)
- CREATE new tables per schema above
- No data migration needed

---

## Phase 2: Type Updates

### 2.1 `lib/types/dataset_hfa.ts`

```typescript
export type DatasetHfaTimePoint = {
  id: string;
  label: string;
  sortOrder: number;
  periodId: string;           // YYYYMM
  dateImported: string | undefined;
};
```

### 2.2 `lib/types/dataset_hfa_import.ts`

```typescript
export type HfaCsvMappingParams = {
  facility_id: string;
  timePointLabel: string;     // User enters label only
  timePointPeriodId: string;  // YYYYMM from date picker
};
// Remove timePointId field
```

### 2.3 `lib/types/hfa_types.ts`

```typescript
export type HfaIndicatorCode = {
  varName: string;
  timePointId: string;
  timePointLabel: string;     // For display/R script
  rCode: string;
  rFilterCode: string | undefined;
};
```

---

## Phase 3: Database Access Functions

### 3.1 `server/db/instance/dataset_hfa.ts`

Add/update functions:

```typescript
async function createTimePoint(label: string, periodId: string): Promise<string> {
  const id = crypto.randomUUID();
  const nextSort = await getNextTimePointSortOrder();
  await db`INSERT INTO dataset_hfa_time_points (id, label, sort_order, period_id, date_imported)
           VALUES (${id}, ${label}, ${nextSort}, ${periodId}, NOW())`;
  return id;
}

async function getTimePointByLabel(label: string): Promise<DatasetHfaTimePoint | undefined>

async function getNextTimePointSortOrder(): Promise<number> {
  const result = await db`SELECT COALESCE(MAX(sort_order), 0) + 1 as next FROM dataset_hfa_time_points`;
  return result[0].next;
}

async function updateTimePoint(id: string, label: string, periodId: string): Promise<void>

async function updateTimePointSortOrders(updates: { id: string; sortOrder: number }[]): Promise<void>

async function deleteTimePoint(id: string): Promise<void>

async function getAllTimePoints(): Promise<DatasetHfaTimePoint[]>
```

---

## Phase 4: Import Flow

### 4.1 `client/src/components/instance_dataset_hfa_import/step_2.tsx`

**Remove:** `timePointId` input
**Keep:** `timePointLabel` text input
**Add:** Year/month picker → generates `periodId` as YYYYMM

### 4.2 `server/worker_routines/stage_hfa_data_csv/worker.ts`

Update to use `timePointLabel` + `timePointPeriodId` instead of `timePointId`.

### 4.3 `server/worker_routines/integrate_hfa_data/worker.ts`

```typescript
const existing = await getTimePointByLabel(timePointLabel);
let timePointId: string;

if (existing) {
  timePointId = existing.id;
  await updateTimePointPeriodId(timePointId, periodId);
} else {
  timePointId = await createTimePoint(timePointLabel, periodId);
}

// Use timePointId for all downstream inserts
```

---

## Phase 5: R Script Generation

### 5.1 `server/server_only_funcs/get_script_with_parameters_hfa.ts`

- Fetch time_point labels via JOIN
- R scripts use label for matching (already the case conceptually)

### 5.2 `server/db/project/datasets_in_project_hfa.ts`

- Export `label` as the `time_point` column value
- JOIN with `dataset_hfa_time_points` to get labels
- ORDER BY `sort_order`

---

## Phase 6: Time Points Editor UI

### 6.1 `client/src/components/instance/instance_data.tsx`

Add section/link to time points editor.

### 6.2 `client/src/components/instance_dataset_hfa/_time_points_editor.tsx` (new)

**Features:**
- List time points ordered by sort_order
- Edit label (inline or modal)
- Edit period (year/month picker)
- Reorder (drag-drop or up/down buttons)
- Delete (with confirmation, warns about cascade)

### 6.3 Server routes (new)

**File:** `server/routes/instance/hfa_time_points.ts`

```
GET  /hfa-time-points           - List all
PUT  /hfa-time-points/:id       - Update label/periodId
POST /hfa-time-points/reorder   - Batch update sort_order
DELETE /hfa-time-points/:id     - Delete (CASCADE)
```

Register in `server/routes/route-tracker.ts`.

---

## Phase 7: Visualization Updates

### 7.1 `server/db/project/metric_enricher.ts`

- Time point disaggregation uses labels
- Order by sort_order

---

## Files to Modify

### Database
- [ ] `server/db/migrations/instance/0XX_hfa_time_points_restructure.sql` (new)
- [ ] `server/db/instance/dataset_hfa.ts`
- [ ] `server/db/instance/dataset_hfa_dict.ts`

### Types
- [ ] `lib/types/dataset_hfa.ts`
- [ ] `lib/types/dataset_hfa_import.ts`
- [ ] `lib/types/hfa_types.ts`

### Import Flow
- [ ] `client/src/components/instance_dataset_hfa_import/step_2.tsx`
- [ ] `server/worker_routines/stage_hfa_data_csv/worker.ts`
- [ ] `server/worker_routines/integrate_hfa_data/worker.ts`

### R Scripts / Export
- [ ] `server/server_only_funcs/get_script_with_parameters_hfa.ts`
- [ ] `server/db/project/datasets_in_project_hfa.ts`

### Editor UI
- [ ] `client/src/components/instance/instance_data.tsx`
- [ ] `client/src/components/instance_dataset_hfa/_time_points_editor.tsx` (new)
- [ ] `server/routes/instance/hfa_time_points.ts` (new)
- [ ] `server/routes/route-tracker.ts`

### Visualizations
- [ ] `server/db/project/metric_enricher.ts`

---

## Implementation Order

1. Migration (drop + recreate tables)
2. Types
3. DB access functions
4. Import flow (step_2 UI + workers)
5. R script generation + export
6. Editor UI + routes
7. Visualization updates
8. Testing

**Estimated effort:** 1-2 days
