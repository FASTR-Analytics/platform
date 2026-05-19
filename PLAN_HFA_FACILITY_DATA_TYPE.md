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

**Composite PK: `(facility_id, data_type)`**

Complete separation between HMIS and HFA. Same facility_id can exist independently in both data types as separate records. They don't touch each other.

This requires FK changes:

- `dataset_hmis` needs `data_type` column (always 'hmis', with CHECK constraint) + FK to `(facility_id, data_type)`
- `hfa_data` needs `data_type` column (always 'hfa', with CHECK constraint) + FK to `(facility_id, data_type)`

### Admin Areas

**No changes to `admin_areas_*` tables.**

Admin areas are shared across data types. HFA may add new admin area values, but they coexist in the same tables. Filtering happens at the facility level.

### Structure Upload

Extend structure upload to support data_type:

- Add data_type selector to structure upload flow
- User uploads HMIS structure with data_type='hmis'
- User uploads HFA structure separately with data_type='hfa'
- Same upload flow, different data_type value
- HMIS and HFA work independently - uploading one doesn't touch the other

---

## Implementation

### 1. Schema Migration

File: `server/db/migrations/instance/038_add_data_type_to_facilities.sql`

```sql
-- Step 1: Drop existing FKs that reference facilities
ALTER TABLE dataset_hmis DROP CONSTRAINT IF EXISTS dataset_hmis_facility_id_fkey;
ALTER TABLE hfa_data DROP CONSTRAINT IF EXISTS hfa_data_facility_id_fkey;

-- Step 2: Add data_type column to facilities (existing facilities are HMIS)
ALTER TABLE facilities
ADD COLUMN data_type TEXT NOT NULL DEFAULT 'hmis'
CHECK (data_type IN ('hmis', 'hfa'));

-- Step 3: Drop old PK and create composite PK
ALTER TABLE facilities DROP CONSTRAINT facilities_pkey;
ALTER TABLE facilities ADD PRIMARY KEY (facility_id, data_type);

-- Step 4: Add data_type to dataset_hmis
ALTER TABLE dataset_hmis
ADD COLUMN data_type TEXT NOT NULL DEFAULT 'hmis'
CHECK (data_type = 'hmis');

-- Step 5: Add data_type to hfa_data
ALTER TABLE hfa_data
ADD COLUMN data_type TEXT NOT NULL DEFAULT 'hfa'
CHECK (data_type = 'hfa');

-- Step 6: Recreate FKs with composite key
ALTER TABLE dataset_hmis
ADD CONSTRAINT dataset_hmis_facility_fkey
FOREIGN KEY (facility_id, data_type) REFERENCES facilities(facility_id, data_type)
ON DELETE RESTRICT DEFERRABLE;

ALTER TABLE hfa_data
ADD CONSTRAINT hfa_data_facility_fkey
FOREIGN KEY (facility_id, data_type) REFERENCES facilities(facility_id, data_type)
ON DELETE RESTRICT DEFERRABLE;

-- Step 7: Index for filtering
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
- Structure upload replaces only facilities of same data_type (independent operation)

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
