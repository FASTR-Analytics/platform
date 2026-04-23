# Plan: HFA Time Points Standalone Table

## Overview

Restructure HFA dataset system to use a proper standalone `dataset_hfa_time_points` table with auto-generated UUID, label, sort_order, and period_id. Downstream code (R scripts, visualizations) will use the label as the time_point identifier.

## Current State

**Current Schema:**
- `dataset_hfa_dictionary_time_points` uses `time_point` (TEXT) as primary key
- All downstream tables reference this text PK directly
- No sort_order, no period_id relationship
- User manually enters both ID and label during import

**Current Tables Using time_point:**
- `dataset_hfa_dictionary_time_points(time_point PK, time_point_label, date_imported)`
- `dataset_hfa_dictionary_vars(time_point FK, var_name, ...)`
- `dataset_hfa_dictionary_values(time_point FK, var_name FK, value, ...)`
- `dataset_hfa(facility_id, time_point FK, var_name FK, value)`
- `hfa_indicator_code(var_name, time_point FK, r_code, ...)`

## Target State

**New Table:**
```sql
CREATE TABLE dataset_hfa_time_points (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  label TEXT NOT NULL UNIQUE,
  sort_order INTEGER NOT NULL,
  period_id TEXT NOT NULL  -- Format: YYYYMM
);
```

**Changes:**
- All downstream tables use `time_point_id UUID FK` referencing new table
- Import step 2 only asks for label + date (year/month → period_id)
- `id` auto-generated, `sort_order` auto-incremented
- R scripts and visualizations use `label` as the time_point column value

---

## Phase 1: Database Migration

### 1.1 Create new migration file
**File:** `server/db/migrations/instance/0XX_hfa_time_points_restructure.sql`

```sql
-- Create new time_points table
CREATE TABLE dataset_hfa_time_points (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  label TEXT NOT NULL UNIQUE,
  sort_order INTEGER NOT NULL,
  period_id TEXT NOT NULL,
  date_imported TIMESTAMP
);

-- Migrate existing data
INSERT INTO dataset_hfa_time_points (id, label, sort_order, period_id, date_imported)
SELECT 
  gen_random_uuid(),
  time_point_label,
  ROW_NUMBER() OVER (ORDER BY date_imported NULLS LAST, time_point),
  time_point,  -- Existing time_point as period_id fallback
  date_imported
FROM dataset_hfa_dictionary_time_points;

-- Add FK columns to dependent tables (before dropping old)
ALTER TABLE dataset_hfa_dictionary_vars ADD COLUMN time_point_id UUID;
ALTER TABLE dataset_hfa_dictionary_values ADD COLUMN time_point_id UUID;
ALTER TABLE dataset_hfa ADD COLUMN time_point_id UUID;
ALTER TABLE hfa_indicator_code ADD COLUMN time_point_id UUID;

-- Populate new FK columns
UPDATE dataset_hfa_dictionary_vars v
SET time_point_id = t.id
FROM dataset_hfa_dictionary_time_points old
JOIN dataset_hfa_time_points t ON t.label = old.time_point_label
WHERE v.time_point = old.time_point;

-- Similar updates for other tables...

-- Add FK constraints
ALTER TABLE dataset_hfa_dictionary_vars 
  ADD CONSTRAINT fk_vars_time_point 
  FOREIGN KEY (time_point_id) REFERENCES dataset_hfa_time_points(id) ON DELETE CASCADE;

-- Drop old columns after migration verified
-- (Consider doing this in a separate migration for safety)
```

### 1.2 Update database access functions
**Files:**
- `server/db/instance/dataset_hfa.ts`
- `server/db/instance/dataset_hfa_dict.ts`

**Changes:**
- Add CRUD for `dataset_hfa_time_points` table
- Update all queries to use `time_point_id` UUID FK
- Add `getNextSortOrder()` function
- Add `getTimePointByLabel()` for R script generation

---

## Phase 2: Type System Updates

### 2.1 Update types
**File:** `lib/types/dataset_hfa.ts`

```typescript
// New type
export type DatasetHfaTimePoint = {
  id: string;           // UUID
  label: string;
  sortOrder: number;
  periodId: string;     // YYYYMM format
  dateImported: string | undefined;
};

// Remove old DatasetHfaDictionaryTimePoint or alias it
```

**File:** `lib/types/dataset_hfa_import.ts`

```typescript
// Simplify mapping params
export type HfaCsvMappingParams = {
  facility_id: string;      // CSV column name
  timePointLabel: string;   // User enters label only
  timePointPeriodId: string; // YYYYMM from date picker
};
// Remove timePointId - it's now auto-generated
```

**File:** `lib/types/hfa_types.ts`

```typescript
export type HfaIndicatorCode = {
  varName: string;
  timePointId: string;      // UUID now
  timePointLabel: string;   // For display/R script
  rCode: string;
  rFilterCode: string | undefined;
};
```

---

## Phase 3: Import Flow Changes

### 3.1 Update step_2.tsx
**File:** `client/src/components/instance_dataset_hfa_import/step_2.tsx`

**Changes:**
- Remove `timePointId` input field
- Keep `timePointLabel` text input
- Add year/month date picker for period_id
- Auto-generate period_id as `YYYYMM` from selected date

**New UI:**
```
Label: [____________]  (text input, e.g., "Round 1 - December 2025")
Date:  [2025] [12]     (year + month dropdowns → generates "202512")
```

### 3.2 Update staging worker
**File:** `server/worker_routines/stage_hfa_data_csv/worker.ts`

**Changes:**
- Accept `timePointLabel` and `timePointPeriodId` instead of `timePointId`
- Pass these to integration step

### 3.3 Update integration worker
**File:** `server/worker_routines/integrate_hfa_data/worker.ts`

**Changes:**
- Check if time_point with same label exists
- If exists: update period_id if changed, get existing ID
- If new: calculate next sort_order, generate UUID, insert
- Use the UUID for all downstream inserts

```typescript
// Pseudo-code
const existingTp = await db.getTimePointByLabel(timePointLabel);
let timePointId: string;

if (existingTp) {
  timePointId = existingTp.id;
  await db.updateTimePointPeriodId(timePointId, periodId);
} else {
  const nextSort = await db.getNextTimePointSortOrder();
  timePointId = await db.createTimePoint({
    label: timePointLabel,
    sortOrder: nextSort,
    periodId: periodId,
  });
}
```

---

## Phase 4: R Script Generation

### 4.1 Update script generator
**File:** `server/server_only_funcs/get_script_with_parameters_hfa.ts`

**Current:** Uses `time_point == "round_1"` string comparison
**New:** Still use label but fetch from joined table

```r
# The time_point column in data will contain labels, not IDs
indicator_name = case_when(
  time_point == "Round 1" ~ ...,
  time_point == "Round 2" ~ ...,
)
```

**Key insight:** The label becomes the actual value in the `time_point` column of exported data, so R scripts use label for matching.

### 4.2 Update HFA data export to projects
**File:** `server/db/project/datasets_in_project_hfa.ts`

**Changes:**
- When exporting HFA data to project, include `label` as the `time_point` column value
- Join with `dataset_hfa_time_points` to get labels
- Order by `sort_order` for consistent output

---

## Phase 5: Time Points Editor UI

### 5.1 Add editor to instance_data.tsx
**File:** `client/src/components/instance/instance_data.tsx`

Add new component or section for managing time points:

**Features:**
- List all time points with current sort order
- Edit label (with uniqueness validation)
- Edit period_id (year/month picker)
- Drag-to-reorder or up/down buttons for sort_order
- Delete time point (with cascade warning)

### 5.2 Create new component
**File:** `client/src/components/instance_dataset_hfa/_time_points_editor.tsx`

```typescript
// Component for editing time points
// - Table with columns: Sort Order, Label, Date (Period), Actions
// - Reorder via drag-drop or buttons
// - Inline edit for label
// - Date picker for period
// - Delete button with confirmation
```

### 5.3 Add server routes
**File:** `server/routes/instance/hfa_time_points.ts` (new file)

```typescript
// GET /hfa-time-points - List all time points
// PUT /hfa-time-points/:id - Update label/period_id
// POST /hfa-time-points/reorder - Update sort_order for multiple
// DELETE /hfa-time-points/:id - Delete (with cascade check)
```

---

## Phase 6: Visualization/Presentation Objects

### 6.1 Update metric enricher
**File:** `server/db/project/metric_enricher.ts`

**Changes:**
- When building disaggregation options for `time_point`, use labels
- Order by `sort_order` from time_points table

### 6.2 Update query builders
**Files:**
- `server/visualization_definitions/` (various)
- `client/src/generate_*/` (various)

**Changes:**
- Time point disaggregation values are now labels
- Display should show labels (already does if using label as value)

---

## Phase 7: Testing & Validation

### 7.1 Migration testing
- [ ] Test migration with existing data
- [ ] Verify all FKs resolve correctly
- [ ] Verify sort_order assigned in sensible order

### 7.2 Import testing
- [ ] New HFA import creates time_point correctly
- [ ] Re-import to existing time_point updates correctly
- [ ] Period ID stored correctly

### 7.3 R script testing
- [ ] Run HFA module after migration
- [ ] Verify time_point column contains labels
- [ ] Verify indicator code matches on labels

### 7.4 UI testing
- [ ] Time points editor displays correctly
- [ ] Reorder functionality works
- [ ] Edit label/date works
- [ ] Visualizations display correctly

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

### R Scripts
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

## Migration Strategy

1. **Phase 1-2:** Schema + types (breaking change, requires coordinated deploy)
2. **Phase 3:** Import flow updates
3. **Phase 4:** R script generation
4. **Phase 5:** Editor UI (can be done in parallel after Phase 1-2)
5. **Phase 6:** Visualization updates
6. **Phase 7:** Testing

**Estimated effort:** 2-3 days for core changes, +1 day for testing

---

## Open Questions

1. **Existing data migration:** How to derive period_id from existing time_point strings? 
   - Option A: Use existing time_point as period_id (may not be valid YYYYMM)
   - Option B: Require manual mapping during migration
   - Option C: Set to placeholder, require user to update via editor

2. **Label uniqueness:** Should labels be unique? (Currently assuming yes)

3. **Delete behavior:** What happens when deleting a time_point with data?
   - Option A: CASCADE delete all data
   - Option B: RESTRICT (must delete data first)
   - Option C: RESTRICT with UI to delete data

4. **Sort order gaps:** Allow gaps in sort_order or always compact?
