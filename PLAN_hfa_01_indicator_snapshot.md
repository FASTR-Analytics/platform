# Plan: HFA Indicator Snapshot into Project DB

Snapshot HFA indicator definitions and their per-time-point R code into project-level tables at HFA data export time. The module's codegen reads from these project tables instead of the instance DB, guaranteeing indicators and data are always in sync.

Can be done independently of [PLAN_hfa_02_staleness_detection.md](PLAN_hfa_02_staleness_detection.md), but they complement each other: staleness detection tells the user *when* to update, and the snapshot ensures the update produces a coherent data+indicators pair.

## Why

HFA indicators are inherently coupled to HFA data. An indicator `chal_01_b == 1` is meaningless if the dataset doesn't contain `chal_01_b`. Currently, [run_module_iterator.ts:118-127](server/worker_routines/run_module/run_module_iterator.ts#L118-L127) queries `hfa_indicators` and `hfa_indicator_code` from the instance DB (mainDb) every time hfa001 runs. If an admin updates indicators at the instance level, the next module run generates an R script from new definitions against potentially stale project data — or vice versa. This produces silently wrong or silently empty results.

Snapshotting everything together at export time eliminates that class of bug. This mirrors the calculated-indicators-as-HMIS-sidecar pattern in [PLAN_SCORECARD_02_PIPELINE.md](PLAN_SCORECARD_02_PIPELINE.md).

## Current state

- `run_module_iterator.ts` queries `hfa_indicators` (instance) and `hfa_indicator_code` (instance) from mainDb at module run time.
- Script preview route at [modules.ts:237-243](server/routes/project/modules.ts#L237-L243) does the same.
- No project-level storage of indicator definitions.

## Changes

### 1. Add project-level snapshot tables

**New migration:** `server/db/migrations/project/010_add_hfa_indicator_snapshot_tables.sql`

```sql
CREATE TABLE IF NOT EXISTS hfa_indicators_snapshot (
  var_name text PRIMARY KEY NOT NULL,
  category text NOT NULL,
  definition text NOT NULL,
  type text NOT NULL,
  aggregation text NOT NULL,
  sort_order integer NOT NULL
);

CREATE TABLE IF NOT EXISTS hfa_indicator_code_snapshot (
  var_name text NOT NULL,
  time_point text NOT NULL,
  r_code text NOT NULL DEFAULT '',
  r_filter_code text,
  PRIMARY KEY (var_name, time_point),
  FOREIGN KEY (var_name) REFERENCES hfa_indicators_snapshot(var_name) ON DELETE CASCADE
);
```

These mirror the instance-level `hfa_indicators` and `hfa_indicator_code` tables exactly, but live in the project database.

Also add the same DDL to [_project_database.sql](server/db/project/_project_database.sql) for new projects.

### 2. Populate snapshot at HFA data export time

**File:** [server/db/project/datasets_in_project_hfa.ts](server/db/project/datasets_in_project_hfa.ts)

Inside `addDatasetHfaToProject`, add to the existing `projectDb.begin()` transaction block (~line 135):

```ts
sql`DELETE FROM hfa_indicator_code_snapshot`,
sql`DELETE FROM hfa_indicators_snapshot`,
// INSERT INTO hfa_indicators_snapshot from mainDb rows
// INSERT INTO hfa_indicator_code_snapshot from mainDb rows
```

The indicator definitions are read from `mainDb` (instance) and written to `projectDb` (project) within the same transaction as the rest of the HFA import. This guarantees atomicity — you can't have data without indicators or indicators without data.

### 3. Codegen reads from project snapshot

**File:** [server/worker_routines/run_module/run_module_iterator.ts](server/worker_routines/run_module/run_module_iterator.ts) (~line 112-128)

Replace instance DB queries with project DB queries:

```ts
if (moduleDetail.moduleDefinition.scriptGenerationType === "hfa") {
  // Known dataset variables — still from indicators_hfa (raw var_names from uploaded data)
  const hfaVarRows = await projectDb<{ var_name: string }[]>`
    SELECT DISTINCT var_name FROM indicators_hfa ORDER BY var_name
  `;
  knownDatasetVariables = new Set(hfaVarRows.map((r) => r.var_name));

  // Indicator definitions — from project snapshot, NOT instance DB
  const hfaRows = await projectDb<DBHfaIndicator[]>`
    SELECT * FROM hfa_indicators_snapshot ORDER BY sort_order, var_name
  `;
  hfaIndicatorsFromSnapshot = hfaRows.map(dbRowToHfaIndicator);

  if (hfaIndicatorsFromSnapshot.length === 0) {
    throw new Error(
      "No HFA indicators in project snapshot. Update your project's HFA data from the Project Data tab."
    );
  }

  hfaIndicatorCodeFromSnapshot = await getAllHfaIndicatorCodeFromSnapshot(projectDb);
}
```

The error message for empty snapshot tables explicitly tells the user what to do — projects created before this change will hit this on first run and need to re-export HFA data.

### 4. Script preview reads from project snapshot (+ fix pre-existing bug)

**File:** [server/routes/project/modules.ts](server/routes/project/modules.ts) (~line 237-257)

Same data-source change as §3: read from project snapshot instead of mainDb.

Additionally, fix a pre-existing bug: the preview route currently only passes `hfaIndicators` to `getScriptWithParameters` but not `hfaIndicatorCode` (the third HFA arg is `undefined`). The module runner ([run_module_iterator.ts:127](server/worker_routines/run_module/run_module_iterator.ts#L127)) passes both. This means the preview generates a different (incomplete) script than what actually runs. Fix by also fetching and passing `hfaIndicatorCodeFromSnapshot`:

```ts
if (res.data.moduleDefinition.scriptGenerationType === "hfa") {
  const hfaVarRows = await c.var.ppk.projectDb<{ var_name: string }[]>`
    SELECT DISTINCT var_name FROM indicators_hfa ORDER BY var_name
  `;
  knownDatasetVariables = new Set(
    hfaVarRows.map((r: { var_name: string }) => r.var_name),
  );

  const hfaRows = await c.var.ppk.projectDb<DBHfaIndicator[]>`
    SELECT * FROM hfa_indicators_snapshot ORDER BY sort_order, var_name
  `;
  hfaIndicators = hfaRows.map(dbRowToHfaIndicator);

  hfaIndicatorCode = await getAllHfaIndicatorCodeFromSnapshot(c.var.ppk.projectDb);
}

const script = getScriptWithParameters(
  res.data.moduleDefinition,
  res.data.configSelections,
  resCountryIso3.data.countryIso3,
  knownDatasetVariables,
  hfaIndicators,
  hfaIndicatorCode,  // was missing before
);
```

### 5. Add `getAllHfaIndicatorCodeFromSnapshot` helper

**File:** [server/db/project/modules.ts](server/db/project/modules.ts) or a new file

Same as `getAllHfaIndicatorCode(mainDb)` in [hfa_indicators.ts:200-207](server/db/instance/hfa_indicators.ts#L200-L207) but queries `hfa_indicator_code_snapshot` from projectDb:

```ts
export async function getAllHfaIndicatorCodeFromSnapshot(
  projectDb: Sql,
): Promise<HfaIndicatorCode[]> {
  const rows = await projectDb<DBHfaIndicatorCode[]>`
    SELECT * FROM hfa_indicator_code_snapshot ORDER BY var_name, time_point
  `;
  return rows.map(dbRowToHfaIndicatorCode);
}
```

Can reuse the existing `dbRowToHfaIndicator` and `dbRowToHfaIndicatorCode` mappers since the column shapes are identical.

### 6. Make dataset removal symmetric (cleanup for both HMIS and HFA)

**File:** [server/db/project/datasets_in_project_hmis.ts](server/db/project/datasets_in_project_hmis.ts) — the shared `removeDatasetFromProject` function (~line 276)

Today this function only deletes the `datasets` row, with a comment saying "Don't delete indicators/facilities - let them persist until next dataset is added." That's the wrong default: the UI tells the user the dataset is disabled, but stale `indicators` / `facilities` / `indicators_hfa` rows linger, and any UI that reads them is showing a lie. There's no FK reason to preserve them — `presentation_objects` and friends deliberately don't FK into indicator/facility tables (see [_project_database.sql:122](server/db/project/_project_database.sql#L122)).

Rewrite the function so disable actually disables, symmetrically across dataset types:

```ts
await projectDb.begin((sql) => [
  sql`DELETE FROM datasets WHERE dataset_type = ${datasetType}`,
  ...(datasetType === "hmis"
    ? [
        sql`DELETE FROM indicators`,
        sql`DELETE FROM facilities`,
      ]
    : [
        sql`DELETE FROM hfa_indicator_code_snapshot`,
        sql`DELETE FROM hfa_indicators_snapshot`,
        sql`DELETE FROM indicators_hfa`,
        sql`DELETE FROM facilities`,
      ]),
]);
```

Delete the "Don't delete indicators/facilities" comment — it was the reason for the bug.

**Followup:** the redundant `DELETE FROM indicators` / `DELETE FROM facilities` / `DELETE FROM indicators_hfa` at the top of `addDatasetHmisToProject` and `addDatasetHfaToProject` transactions can stay as belt-and-suspenders or be removed. Leaving them is safer against future code paths that skip `removeDatasetFromProject`.

Note: `addDatasetHfaToProject` calls `removeDatasetFromProject` as its first step (line 30), so the snapshot cleanup also runs on re-export before the new snapshot is written. There is no FK from the snapshot tables to the `datasets` table, so cascade won't handle this automatically — the explicit DELETE is required.

## Files to modify

1. `server/db/migrations/project/010_add_hfa_indicator_snapshot_tables.sql` — New migration
2. `server/db/project/_project_database.sql` — Add snapshot tables to base schema
3. `server/db/project/datasets_in_project_hfa.ts` — Populate snapshot in export transaction
4. `server/db/project/datasets_in_project_hmis.ts` — Clear snapshot on HFA removal
5. `server/worker_routines/run_module/run_module_iterator.ts` — Read from projectDb snapshot
6. `server/routes/project/modules.ts` — Script preview reads from projectDb snapshot
7. `server/db/project/modules.ts` (or new file) — `getAllHfaIndicatorCodeFromSnapshot()` helper

## What does NOT change

- [get_script_with_parameters_hfa.ts](server/server_only_funcs/get_script_with_parameters_hfa.ts) — The codegen logic stays identical. Same function signature, same input types. Only the caller's data source changes.
- [get_script_with_parameters.ts](server/server_only_funcs/get_script_with_parameters.ts) — No changes.
- Instance-level `hfa_indicators` and `hfa_indicator_code` tables — Still the source of truth for the instance admin UI. The project tables are point-in-time copies.
- The generated R script structure — Same `mutate()` chain with `case_when` per time_point.
- [hfa_dependency_analyzer.ts](server/server_only_funcs/hfa_dependency_analyzer.ts) — Unchanged; receives the same data structures regardless of source.

## Definition of done

- [ ] `hfa_indicators_snapshot` and `hfa_indicator_code_snapshot` tables exist (migration 010 + base schema)
- [ ] `addDatasetHfaToProject` copies indicator definitions + code from instance into project snapshot tables, atomic with the rest of the HFA import
- [ ] `removeDatasetFromProject` is symmetric across HMIS and HFA: clears indicators/facilities/snapshot tables for the removed dataset type (no more "persist until next add")
- [ ] `run_module_iterator.ts` reads from project snapshot tables instead of instance tables
- [ ] Script preview route reads from project snapshot tables and passes `hfaIndicatorCode` (pre-existing bug fix)
- [ ] Empty snapshot tables at module run time throw clear error directing user to update project data
- [ ] `deno task typecheck` clean
- [ ] Smoke test: configure indicators at instance → export HFA to project → snapshot tables populated → hfa001 runs using snapshot → edit indicator at instance → re-run still uses old snapshot → re-export HFA → snapshot updated → hfa001 goes dirty → re-run uses new snapshot
