# Plan: Add data_type to Facilities Table

## Problem

HMIS and HFA data may have different facility ID schemes. Currently both share a single `facilities` table with no way to distinguish source. We need to support:
- HMIS facilities with their own IDs
- HFA facilities with potentially different IDs
- Queries that filter facilities by data source

## Solution

Add `data_type` column to `facilities` table with values `'hmis'` or `'hfa'`.

## Design Decisions

### Primary Key

**Keep PK as `facility_id` alone.** 

Rationale: The "messy" reality is that the same physical facility may have different IDs in HMIS vs HFA (not that different facilities share the same ID). If a collision occurs (same facility_id in both sources), it likely represents the same physical facility and should error rather than create duplicates.

If this assumption proves wrong, we can revisit composite PK later.

### Admin Areas

**No changes to `admin_areas_*` tables.** 

Admin areas are shared across data types. HFA may add new admin area values, but they coexist in the same tables. Filtering happens at the facility level.

### HFA Facility Creation

**Option A (Recommended): Extend structure upload to support data_type**
- Add data_type selector to structure upload flow
- User uploads HMIS structure with data_type='hmis'
- User uploads HFA structure separately with data_type='hfa'
- Same upload flow, different data_type value

**Option B: Create HFA facilities during HFA data integration**
- HFA data contains facility metadata
- Auto-create facilities with data_type='hfa' during integration
- More automatic but mixes data and structure concerns

---

## Implementation

### 1. Schema Migration

File: `server/db/migrations/instance/031_add_data_type_to_facilities.sql`

```sql
-- Add data_type column with default 'hmis' for existing facilities
ALTER TABLE facilities 
ADD COLUMN data_type TEXT NOT NULL DEFAULT 'hmis' 
CHECK (data_type IN ('hmis', 'hfa'));

-- Index for filtering
CREATE INDEX idx_facilities_data_type ON facilities(data_type);
```

### 2. Type Updates

File: `lib/types/structure_types.ts` (or similar)

```typescript
export type FacilityDataType = "hmis" | "hfa";
```

Update facility-related types to include `dataType` field where needed.

### 3. Structure Upload Changes

Files:
- `server/db/instance/structure.ts`
- `server/server_only_funcs_importing/integrate_structure_from_staging.ts`
- `server/server_only_funcs_importing/stage_structure_from_csv.ts`
- Client components for structure upload

Changes:
- Add data_type parameter to structure upload flow
- Pass data_type through staging to integration
- INSERT facilities with specified data_type
- Consider: should structure upload replace only facilities of same data_type, or all?

### 4. HMIS Query Changes

File: `server/db/instance/dataset_hmis.ts`

Change admin area dropdown queries from:
```sql
SELECT admin_area_2 FROM admin_areas_2
```
To:
```sql
SELECT DISTINCT admin_area_2 FROM facilities WHERE data_type = 'hmis' ORDER BY LOWER(admin_area_2)
```

Same pattern for admin_area_3.

### 5. HFA Upload Changes

Files:
- `server/worker_routines/stage_hfa_data_csv/worker.ts`
- `server/worker_routines/integrate_hfa_data/worker.ts`

Change facility validation from:
```sql
SELECT DISTINCT facility_id FROM facilities WHERE ...
```
To:
```sql
SELECT DISTINCT facility_id FROM facilities WHERE data_type = 'hfa' AND ...
```

### 6. Instance Stats Changes

File: `server/db/instance/instance.ts`

Add facility counts by data_type:
```sql
SELECT data_type, COUNT(*) as count FROM facilities GROUP BY data_type
```

Update response types to include breakdown.

### 7. Project Export Changes

Files:
- `server/db/project/datasets_in_project_hmis.ts`
- `server/db/project/datasets_in_project_hfa.ts`

Ensure exports filter by appropriate data_type when joining facilities.

---

## Questions to Resolve

1. **Structure upload behavior**: When uploading HFA structure, should it:
   - a) Only delete/replace facilities where data_type='hfa'?
   - b) Delete all facilities and require re-upload of both?
   
   Recommend (a) for flexibility.

2. **Existing HFA data**: If there's existing HFA data pointing to facilities without data_type, migration needs to handle this. Current facilities get data_type='hmis' by default - is this correct, or should some be 'hfa'?

3. **UI changes**: Does the structure management UI need to show data_type? Filter by it? Allow switching views?

4. **Validation messages**: When HFA upload fails due to missing facility, should it suggest "upload HFA structure first" rather than generic "facility not found"?

---

## Migration Checklist

- [ ] Create migration SQL
- [ ] Update TypeScript types
- [ ] Update structure upload (staging + integration)
- [ ] Update structure upload UI (data_type selector)
- [ ] Update dataset_hmis.ts queries
- [ ] Update HFA staging/integration facility validation
- [ ] Update instance stats
- [ ] Update project export queries
- [ ] Test HMIS flow end-to-end
- [ ] Test HFA flow end-to-end
- [ ] Test mixed scenario (both data types)