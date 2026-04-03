# HFA: Remove Versions, Manual Time Point Entry

## Summary

Two related changes:
1. **Remove `dataset_hfa_versions`** — time_points replace versions as the unit of import
2. **Manual time_point entry** — user enters time_point ID + label in the UI rather than sourcing from a CSV column

---

## 1. Remove Versions

### Why

With one-round-at-a-time import and delete-replace semantics, "version" and "time_point" are the same concept. The `version_id` on each `dataset_hfa` row is meaningless — after re-import, every row for a time_point gets the same new version_id. The `dataset_hfa_versions` table duplicates what `dataset_hfa_dictionary_time_points` provides.

### Database Changes

**Migration `013_remove_hfa_versions.sql`:**
```sql
ALTER TABLE dataset_hfa DROP COLUMN IF EXISTS version_id;
DROP TABLE IF EXISTS dataset_hfa_versions;
ALTER TABLE dataset_hfa_dictionary_time_points ADD COLUMN IF NOT EXISTS date_imported text;
```

Note: dropping `version_id` also drops its FK to `dataset_hfa_versions` and the index `idx_dataset_hfa_version_id`. Adding `date_imported` to `dataset_hfa_dictionary_time_points` preserves the useful metadata from versions.

**Update `_main_database.sql`:**
- Remove `version_id` column and its FK from `dataset_hfa`
- Remove `dataset_hfa_versions` table definition
- Remove `idx_dataset_hfa_version_id` index
- Add `date_imported text` to `dataset_hfa_dictionary_time_points`

### Type Changes

**`lib/types/dataset_hfa.ts`:**
- Remove `DatasetHfaVersion` type entirely
- Update `DatasetHfaDetail`: remove `currentVersionId` and `nVersions`. The `timePoints` field (with `dateImported`) replaces these — presence of time_points = data exists.
- Update `DatasetHfaDictionaryTimePoint`: add `dateImported: string`
- Update `ItemsHolderDatasetHfaDisplay`: remove `versionId`

**`lib/types/dataset_hfa_import.ts`:**
- `DatasetHfaCsvStagingResult`: remove `stagingTableName` (keep dictionary staging table names). Actually — the staging table name is still needed by the integration worker. Keep it.

### API Route Changes

**`lib/api-routes/instance/datasets.ts`:**
- Remove `getDatasetHfaVersions` route entirely
- `getDatasetHfaDisplayInfo`: change body from `{ versionId: number }` to `{}` (no parameter needed — just show all data)

### Server Changes

**`server/db/instance/dataset_hfa.ts`:**
- Remove `getVersionsForDatasetHfa()` function
- Remove `getCurrentDatasetHfaVersion()` function
- Remove `getCurrentDatasetHfaMaxVersionId()` function
- Update `getDatasetHfaDetail()`: remove version queries, remove `currentVersionId`/`nVersions` from returned object. The `timePoints` field (already added) tells the client whether data exists.
- Update `getDatasetHfaItemsForDisplay()`: remove `versionId` parameter
- Update `deleteDatasetHfaData()`: remove `DELETE FROM dataset_hfa_versions` in the "all" branch

**`server/db/instance/_main_database_types.ts`:**
- Remove `DBDatasetHfaVersion` type

**`server/routes/instance/datasets.ts`:**
- Remove `getDatasetHfaVersions` route handler
- Update `getDatasetHfaDisplayInfo` handler (no body param)

**Integration worker (`server/worker_routines/integrate_hfa_data/worker.ts`):**
- Remove all version-related logic: no `nextVersionId`, no `INSERT INTO dataset_hfa_versions`, no version FK on insert
- The INSERT into `dataset_hfa` drops the `version_id` column
- Remove `ANALYZE dataset_hfa` that referenced versions
- Simplify progress reporting (fewer steps)

**Staging worker (`server/worker_routines/stage_hfa_data_csv/worker.ts`):**
- No changes needed (doesn't reference versions)

### Client Changes

**`client/src/components/instance_dataset_hfa/index.tsx`:**
- Remove `currentVersionId` usage — the "has data" check becomes `keyedDatasetDetail.timePoints.length > 0`
- `DatasetItemsHolder` no longer needs a `versionId` prop

**`client/src/components/instance_dataset_hfa/dataset_items_holder.tsx`:**
- Remove `versionId` prop
- Fetch display info without versionId parameter
- Update cache key (no longer version-based)

**`client/src/state/dataset_cache.ts`:**
- Update `_DATASET_HFA_DISPLAY_INFO_CACHE`: no `versionId` in params
- Update `getDatasetHfaDisplayInfoFromCacheOrFetch`: no `versionId` parameter
- Cache version key: hash of time_points + their `dateImported` values from `DatasetHfaDetail.timePoints`. If any time_point is added/re-imported/deleted, the hash changes and cache invalidates.

**`client/src/components/instance_dataset_hfa/_previous_imports.tsx`:**
- Rename to `_time_points.tsx` / `TimePoints` component
- Rework to show time_points table: time_point ID, label, date imported
- Data comes from `DatasetHfaDetail.timePoints` (passed as prop, no separate route needed)

**`client/src/components/instance_dataset_hfa/_import_information.tsx`:**
- Remove (time_point info is visible in the time_points table directly)

**`client/src/components/instance_dataset_hfa/index.tsx`:**
- Rename "View previous imports" button to "View time points"
- Pass `timePoints` to the renamed component

---

## 2. Manual Time Point Entry

### Why

If the user is importing one round at a time, they already know the time_point identity. Sourcing it from a CSV column then validating it contains a single value is indirect. Manual entry is simpler and removes the need for a time_point column in the CSV.

### Import Flow Changes

**Step 2 currently:** Map `facility_id` and `time_point` columns.
**Step 2 new:** Map `facility_id` column only. Enter `timePointId` (text) and `timePointLabel` (text).

**Step 4 currently:** Enter `timePointLabel` after staging reveals the value.
**Step 4 new:** No label input needed (already collected at step 2).

### Type Changes

**`lib/types/dataset_hfa_import.ts`:**
- `HfaCsvMappingParams`: change from `{ facility_id: string; time_point: string }` to `{ facility_id: string; timePointId: string; timePointLabel: string }`
- `DatasetHfaCsvStagingResult`: `timePointValue` is now always the user-entered value (not extracted from CSV)

### API Route Changes

**`lib/api-routes/instance/datasets.ts`:**
- `finalizeDatasetHfaIntegration`: remove `body: { timePointLabel: string }` — label is already in step_2_result

### Server Changes

**`server/db/instance/dataset_hfa.ts`:**
- `updateDatasetHfaUploadAttempt_Step2Mappings()`: receives mappings including `timePointId` and `timePointLabel`
- `updateDatasetHfaUploadAttempt_Step4Integrate()`: remove `timePointLabel` param — get it from step_2_result

**`server/routes/instance/datasets.ts`:**
- `finalizeDatasetHfaIntegration`: remove body param, revert to `async (c) =>` (no body)

**Staging worker:**
- Remove time_point column index lookup
- Remove `seenTimePoints` validation (single time_point guaranteed by manual entry)
- Use `timePointId` from step_2_result as the time_point for all rows
- All rows get the same time_point value

**Integration worker:**
- Get `timePointLabel` from step_2_result instead of worker instantiation params
- `instantiateIntegrateHfaDataWorker()`: revert to just `(rawDUA)` — no `timePointLabel` param

### Client Changes

**`client/src/components/instance_dataset_hfa_import/step_2.tsx`:**
- Remove `time_point` from column mappings
- Add `timePointId` text input
- Add `timePointLabel` text input
- Send all three in `updateDatasetHfaMappings({ mappings: { facility_id, timePointId, timePointLabel } })`

**`client/src/components/instance_dataset_hfa_import/step_4.tsx`:**
- Remove `timePointLabel` input (already collected at step 2)
- Remove `disabled={!timePointLabel()}` from finalize button
- Show time_point ID and label from step3Result (informational)
- `finalizeDatasetHfaIntegration({})` — no body needed

---

## 3. Implementation Order

### Phase A: Remove Versions
1. Migration `013_remove_hfa_versions.sql`
2. Update `_main_database.sql`
3. Remove `DatasetHfaVersion` type, update `DatasetHfaDetail`, `ItemsHolderDatasetHfaDisplay`
4. Remove `getDatasetHfaVersions` API route
5. Update `getDatasetHfaDisplayInfo` route (no versionId)
6. Update server DB functions (remove version queries)
7. Update integration worker (remove version logic)
8. Update client: index.tsx, dataset_items_holder.tsx, cache, previous_imports
9. Remove `_main_database_types.ts` version type

### Phase B: Manual Time Point Entry
10. Update `HfaCsvMappingParams` type
11. Update step_2.tsx (remove time_point mapping, add timePointId + timePointLabel inputs)
12. Update staging worker (use manual time_point, remove CSV column lookup)
13. Update integration worker (get label from step_2_result)
14. Update step_4.tsx (remove label input)
15. Update `finalizeDatasetHfaIntegration` route (remove body)
16. Update instantiate_worker (remove timePointLabel param)

### Phase C: Typecheck
17. Server typecheck
18. Client typecheck
