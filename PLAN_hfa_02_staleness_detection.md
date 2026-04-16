# Plan: HFA Staleness Detection

Surface a "data needs updating" warning on the HFA card in Project Data when instance-level HFA data, indicators, structure, or facility config have changed since the project's last export.

Depends on nothing. Can ship independently of [PLAN_hfa_01_indicator_snapshot.md](PLAN_hfa_01_indicator_snapshot.md). However, shipping Plan 02 alone means the "Update data" action re-exports the CSV but does not guarantee indicator/data consistency — the next module run still reads live indicators from mainDb. The staleness warning is only fully actionable once Plan 01's snapshot is also in place. Prefer shipping both together.

## Current state

- [project_data.tsx:319](client/src/components/project/project_data.tsx#L319) has `projectVersion = () => 999999` — the HFA card never shows staleness.
- [datasets_in_project_hfa.ts:140](server/db/project/datasets_in_project_hfa.ts#L140) stores `info = JSON.stringify({})` — no metadata to compare against.
- The HFA variant of `DatasetInProject` has `info: undefined` — no type support for HFA metadata.
- HMIS already has comprehensive staleness detection with reasons list. HFA should match.

## Changes

### 1. Add `DatasetHfaInfoInProject` type

**File:** [lib/types/datasets_in_project.ts](lib/types/datasets_in_project.ts)

```ts
export type DatasetHfaInfoInProject = {
  hfaCacheHash: string;
  hfaIndicatorsVersion: string;
  structureLastUpdated?: string;
  facilityColumnsConfig?: InstanceConfigFacilityColumns;
};
```

Change the HFA variant of `DatasetInProject` from `info: undefined` to `info: DatasetHfaInfoInProject`.

### 2. Store metadata snapshot at export time

**File:** [server/db/project/datasets_in_project_hfa.ts](server/db/project/datasets_in_project_hfa.ts) (~line 140)

Replace `JSON.stringify({})` with actual snapshots. The function already has `facilityConfig` in scope (line 44). Additionally fetch:

- `hfaCacheHash` via `computeHfaCacheHash()` — requires querying `dataset_hfa_dictionary_time_points` from mainDb. This hash captures whether HFA data rounds have changed.
- `hfaIndicatorsVersion` via `getHfaIndicatorsVersion(mainDb)` — MD5 of indicator count + last updated timestamp. Captures whether indicator definitions or their R code have changed.
- `structureLastUpdated` — from `instance_config` table, key `'structure_last_updated'`. This is a shared value (same one HMIS uses) because facilities/admin areas are shared across both dataset types.

**Why `facilityColumnsConfig`:** The HFA export uses `getEnabledOptionalFacilityColumns(facilityConfig)` ([line 68](server/db/project/datasets_in_project_hfa.ts#L68)) to decide which columns to include in the exported CSV. If facility config changes, the exported CSV structure would be different, but `hfaCacheHash` (based on time points only) wouldn't catch this.

### 3. Parse HFA info in getProjectDetail

**File:** [server/db/project/projects.ts](server/db/project/projects.ts) (~line 77-81)

```ts
// Before:
return { datasetType: "hfa", info: undefined, dateExported: row.last_updated };

// After:
return { datasetType: "hfa", info: parseJsonOrThrow(row.info), dateExported: row.last_updated };
```

Legacy projects have `info = '{}'` in the DB. `parseJsonOrThrow` returns `{}`, so all snapshot fields are `undefined`. The client treats missing fields as stale — this is intentional, forcing legacy projects to re-export.

### 4. Client staleness detection

**File:** [client/src/components/project/project_data.tsx](client/src/components/project/project_data.tsx) (~lines 318-407)

Replace the `999999` TODO with:

```ts
const stalenessCheck = () => {
  const reasons: string[] = [];

  // hfaCacheHash tracks time-point IDs + import dates (e.g. "2020:2024-01-15|2021:2024-02-10").
  // This catches reimports of existing time points and time-point swaps, which
  // datasetVersions.hfa (a simple count of time points) would miss.
  if (!keyedProjectDatasetHfa.info.hfaCacheHash ||
      instanceState.hfaCacheHash !== keyedProjectDatasetHfa.info.hfaCacheHash) {
    reasons.push(t3({ en: "HFA dataset updated", fr: "Données HFA mises à jour" }));
  }

  if (!keyedProjectDatasetHfa.info.hfaIndicatorsVersion ||
      instanceState.hfaIndicatorsVersion !== keyedProjectDatasetHfa.info.hfaIndicatorsVersion) {
    reasons.push(t3({ en: "HFA indicators changed", fr: "Indicateurs HFA modifiés" }));
  }

  if (
    instanceState.structureLastUpdated &&
    keyedProjectDatasetHfa.info.structureLastUpdated &&
    instanceState.structureLastUpdated > keyedProjectDatasetHfa.info.structureLastUpdated
  ) {
    reasons.push(t3({ en: "Facilities or admin areas changed", fr: "Établissements ou unités administratives modifiés" }));
  }

  if (
    keyedProjectDatasetHfa.info.facilityColumnsConfig &&
    JSON.stringify(instanceState.facilityColumns) !== JSON.stringify(keyedProjectDatasetHfa.info.facilityColumnsConfig)
  ) {
    reasons.push(t3({ en: "Facility configuration changed", fr: "Configuration des établissements modifiée" }));
  }

  return { isStale: reasons.length > 0, reasons };
};

const isStale = () => stalenessCheck().isStale;
```

Update the HFA card UI to show the reasons list with bullets (matching HMIS pattern) instead of the current raw version numbers display.

**Dirty state propagation is already handled.** [project.ts:234](server/routes/project/project.ts#L234) calls `setModulesDirtyForDataset(c.var.ppk, body.datasetType)` after any dataset update, so clicking "Update data" on the HFA card marks hfa001 dirty automatically.

## Files to modify

1. `lib/types/datasets_in_project.ts` — Add `DatasetHfaInfoInProject`, change HFA variant
2. `server/db/project/datasets_in_project_hfa.ts` — Store snapshot in info JSON
3. `server/db/project/projects.ts` — Parse HFA info
4. `client/src/components/project/project_data.tsx` — Staleness checks + reasons UI

## Definition of done

- [ ] `DatasetHfaInfoInProject` type exists with `hfaCacheHash`, `hfaIndicatorsVersion`, `structureLastUpdated`, `facilityColumnsConfig`
- [ ] `addDatasetHfaToProject` stores snapshot values in the `info` JSON
- [ ] `getProjectDetail` parses HFA `info` (legacy `{}` handled gracefully)
- [ ] HFA card shows staleness reasons matching HMIS pattern (badge + reasons list + Update button)
- [ ] Legacy projects with `info = {}` show as stale
- [ ] Clicking "Update data" refreshes data + marks hfa001 dirty (already wired via `setModulesDirtyForDataset`)
- [ ] `deno task typecheck` clean
