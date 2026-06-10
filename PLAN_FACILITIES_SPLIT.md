# Plan — Facilities Split + HFA Weights

> **Status: implementation plan.** Supersedes `PLAN_DATA_IMPORT_ARCHITECTURE.md` (deleted 2026-06-10): its generic import engine and merged-`upload_attempts` decisions are rejected (see `PLAN_IMPORTER_CONSOLIDATION.md` for the surviving wizard/toolkit work); its facilities-split site map is absorbed here, corrected and extended. Every `file:line` below was verified against the working tree on 2026-06-10 by a multi-agent review with adversarial verification.

## Goals

- **A — Split facilities.** `facilities` → `facilities_hmis` + `facilities_hfa` (identical 13 columns), both with the composite FK → `admin_areas_4` in the instance DB. Project-DB copies split too (no FK there — existing design; project DBs have no admin_areas tables). Facility IDs become independent per dataset family.
- **B — HFA sampling weights.** Weights vary by time point (confirmed), so they live at facility × time_point grain: new instance table `hfa_facility_weights`, not a column on `facilities_hfa`. Schema-only in this pass — no import path, no export, no analysis wiring yet.
- **C — Family threading.** The viz pipeline needs the dataset family at its facility-join sites to fork the table name. This is the old plan's "Step 0" folded in as part of the split — not a separate no-op refactor (forking is impossible without it; `ro_<uuid>` table names carry no family).

## Locked decisions

| # | Decision | Choice |
|---|---|---|
| 1 | Facilities shape | Two physical tables, identical columns; structure import remains the sole populator and writes **both** identically (tables are clones until a family-specific importer exists) |
| 2 | Base schema | **Final post-split state** — no `facilities` table anywhere. Old migrations get existence guards (see §1). The keep-a-shell-table alternative **fails `validate_migrations`** (it pg_dump-diffs before/after replay) |
| 3 | FK semantics | `dataset_hmis.facility_id` → `facilities_hmis`, `hfa_data.facility_id` → `facilities_hfa`, both **`ON DELETE RESTRICT DEFERRABLE`** preserved; constraint names **exactly** `dataset_hmis_facility_id_fkey` / `hfa_data_facility_id_fkey` (runtime coupling, §4). AA FK `ON DELETE CASCADE` replicated on both tables |
| 4 | Weights grain | `hfa_facility_weights (facility_id, time_point, weight)`, instance DB only (`hfa_data` is instance-only; project DB has no HFA data tables). FK facility → `facilities_hfa` `ON DELETE CASCADE` (keeps the force-delete path edit-free) |
| 5 | Weight export name | When weights later reach the R export, the column must be named `weight`, **never `facility_weight`** — m010's `^(facility_|admin_area_|time_point)` regex + `getCreateTableStatementFromCsvHeaders`'s throw makes any new `facility_`-prefixed exported column a module-run breaker |
| 6 | Viz family source | Derive via existing `getDatasetTypes` (module_definition `dataSources[].datasetType`); helper `facilitiesTableForFamily(family)` **throws** when a facility join is reached with family ∉ {hmis, hfa} |
| 7 | Single-table reads | Reads where the tables are clones (structure UI/CSV export, instance counts) point at `facilities_hmis`; per-family UI deferred |
| 8 | Not tonight | A3 escaper swap (byte-affecting; never the same night as the split), wizard ports (own plan), per-family `facilityColumnsHash` (hashes config, not table contents — no fork needed) |

---

## 1. Migration strategy (the riskiest part — read first)

**The hazard:** `runner.ts:32-34` has no baseline stamping — on every fresh install, `db_startup.ts:43-57` applies the base schema then runs **all** instance migrations; `projects.ts:340-343` does the same for new project DBs. Three instance migrations reference `facilities` and would hard-fail (`Deno.exit(1)`) once base no longer creates it:

- `001_add_facility_custom_columns.sql:1-3` — unguarded `ALTER TABLE facilities`
- `003_add_cache_warming_indexes.sql:16-22` — `CREATE INDEX ... ON facilities(...)`
- `029_make_hfa_data_fk_deferrable.sql:16-21` — re-adds `hfa_data_facility_id_fkey REFERENCES facilities`; guarded only on `hfa_data` existing
- (`023_hfa_schema_redesign.sql:44` also mentions `facilities` but no-ops on fresh installs — `CREATE TABLE IF NOT EXISTS hfa_data` and base already creates it. Verify, don't edit.)

**The fix (conforms to DOC_MIGRATIONS' idempotency golden rule — base = current state, migrations must tolerate replay):**

1. Wrap 001, 003, and 029's facilities-touching statements in `to_regclass('facilities') IS NOT NULL` / `pg_tables` guards (pattern precedent: `server/db/migrations/project/001_add_facility_custom_columns.sql:4`). Safe: these are stamped in `schema_migrations` on every existing DB, so the edits never re-run there — they only change fresh-replay behavior. This is guard-adding for replay-idempotency, not a semantic rewrite, and is the sanctioned move when base advances past an old migration's referent.
2. New **instance migration `047_split_facilities.sql`**, entirely guarded on `facilities` existing (no-op on fresh installs):
   - `CREATE TABLE IF NOT EXISTS facilities_hmis (... )` + `facilities_hfa` (13 columns, AA FK `ON DELETE CASCADE`, full index set with per-table names) + `hfa_facility_weights`
   - Backfill: `INSERT INTO facilities_hmis SELECT * FROM facilities;` same for `_hfa`
   - Repoint FKs inside `DO $$` guards, **naming them explicitly**: drop `dataset_hmis_facility_id_fkey`, re-add `CONSTRAINT dataset_hmis_facility_id_fkey ... REFERENCES facilities_hmis ... ON DELETE RESTRICT DEFERRABLE`; same for `hfa_data_facility_id_fkey` → `facilities_hfa`
   - `DROP TABLE facilities;`
3. Paired **project migration `024_split_facilities.sql`** — same create/backfill/drop, no FKs, 5 indexes per table, wrapped in the project-001-style existence guard. **Same commit** as the instance half (`validate_migrations` exercises instance only — the pair is discipline, not tooling).
4. Update both base schemas to the final state in the same commit (`_main_database.sql`, `_project_database.sql`).
5. **Run `./validate_migrations` before the first server restart.** Pass condition: fresh base + full replay produces zero schema diff.

Project-DB creation paths that inherit this correctly: fresh create (`projects.ts:340-343`, migrations no-op via guards), template copy (`projects.ts:1053-1055`, copies migrated source). Known pre-existing gap: backup restore (`routes/instance/backups.ts:~474-518`) never runs project migrations — a restored pre-split backup hard-fails `facilities_hmis` queries until the next server restart. Optional ride-along: call `runProjectMigrations` after restore.

## 2. Schema

Instance (`_main_database.sql` — replaces `facilities` block at :188-212; FK lines :281, :356):

```sql
CREATE TABLE facilities_hmis ( -- and facilities_hfa, identical
  facility_id text PRIMARY KEY NOT NULL,
  admin_area_4 text NOT NULL, admin_area_3 text NOT NULL,
  admin_area_2 text NOT NULL, admin_area_1 text NOT NULL,
  facility_name text, facility_type text, facility_ownership text,
  facility_custom_1 text, facility_custom_2 text, facility_custom_3 text,
  facility_custom_4 text, facility_custom_5 text,
  FOREIGN KEY (admin_area_4, admin_area_3, admin_area_2, admin_area_1)
    REFERENCES admin_areas_4 ON DELETE CASCADE
);
-- + the 7 indexes each, renamed idx_facilities_hmis_* / idx_facilities_hfa_*
-- dataset_hmis: CONSTRAINT dataset_hmis_facility_id_fkey FOREIGN KEY (facility_id)
--   REFERENCES facilities_hmis(facility_id) ON DELETE RESTRICT DEFERRABLE
-- hfa_data:     CONSTRAINT hfa_data_facility_id_fkey FOREIGN KEY (facility_id)
--   REFERENCES facilities_hfa(facility_id) ON DELETE RESTRICT DEFERRABLE
```

Weights (instance only, placed after `hfa_data` — depends on `hfa_time_points`):

```sql
CREATE TABLE hfa_facility_weights (
  facility_id text NOT NULL,
  time_point text NOT NULL,
  weight double precision NOT NULL CHECK (weight >= 0),
  PRIMARY KEY (facility_id, time_point),
  FOREIGN KEY (facility_id) REFERENCES facilities_hfa(facility_id) ON DELETE CASCADE,
  FOREIGN KEY (time_point) REFERENCES hfa_time_points(label) ON UPDATE CASCADE ON DELETE CASCADE
);
CREATE INDEX idx_hfa_facility_weights_time_point ON hfa_facility_weights(time_point);
```

FK rationale: `ON DELETE CASCADE` on facility means the structure force-delete path (§4) and `SET CONSTRAINTS` list need no weights edits; time-point FK matches the `hfa_data`/`hfa_variables` convention so relabel/delete of a time point flows through. m010 already declares an inert `USE_SAMPLE_WEIGHTS` parameter (`wb-fastr-modules/m010/definition.json:16-27`) — the future wiring point for weighted means; all of export + script + `definition.json` possibleColumns must land as one lockstep change later (§8).

## 3. Family threading (viz pipeline) — ~50-70 LOC, 8 files

No family exists at the join sites today; thread it with real table names directly (no intermediate no-op):

1. Export `getDatasetFamily(moduleDefinition): DatasetType | undefined` from [get_indicator_metadata.ts](server/server_only_funcs_presentation_objects/get_indicator_metadata.ts#L15) (reuse `getDatasetTypes`; also mirror its `scriptGenerationType === "hfa"` signal).
2. [get_presentation_object_items.ts:38](server/server_only_funcs_presentation_objects/get_presentation_object_items.ts#L38): the row fetch reads `module_id` from `results_objects`; `module_definition` lives on `modules` — add a small modules lookup (or JOIN) between :34 and :38, pass family into `buildQueryContext`.
3. `buildQueryContext` ([get_query_context.ts:13](server/server_only_funcs_presentation_objects/get_query_context.ts#L13)) + `QueryContext` (types.ts): add `datasetFamily`.
4. Helper `facilitiesTableForFamily(family)`: returns `facilities_hmis` / `facilities_hfa`; **throws** for iceh/undefined when a facility join is actually reached (ICEH results objects have no `facility_id`; derived modules yield `[]` from `getDatasetTypes` — both are unreachable today, keep it that way loudly).
5. Route **four** sites through it: [cte_manager.ts:106](server/server_only_funcs_presentation_objects/cte_manager.ts#L106) (`facility_subset` CTE) and get_possible_values.ts — the two CTEs at [:164](server/server_only_funcs_presentation_objects/get_possible_values.ts#L164)/[:173](server/server_only_funcs_presentation_objects/get_possible_values.ts#L173) **and the `detectColumnExists` probe at :136** (the old plan excluded it; post-split it returns false and every facility-column possible-values request fails).
6. `getPossibleValues` has **no module in scope** — add its own `results_objects → modules` lookup (~10 LOC mirroring item 2) or thread family from its two callers ([get_results_value_info.ts:93/:125](server/server_only_funcs_presentation_objects/get_results_value_info.ts#L93), [routes/project/presentation_objects.ts:~651](server/routes/project/presentation_objects.ts#L651) — both already hold `moduleId`).
7. **`metric_enricher.ts` needs NO edit** — it has zero facilities-table SQL (the old plan was wrong; it probes the results table only).

## 4. Site map — every other `facilities` reference (verified current line numbers)

**Structure import (sole populator — writes BOTH tables):**
- [integrate_structure_from_staging.ts](server/server_only_funcs_importing/integrate_structure_from_staging.ts): **six** write paths, all doubled — INSERTs :161, :191, :217, :241; UPDATEs :275, :324
- Force-delete :404-405: `SET CONSTRAINTS dataset_hmis_facility_id_fkey, hfa_data_facility_id_fkey DEFERRED;` — **hardcoded constraint names**; works only because §1 preserves them. `DELETE` clears both tables (weights cascade)
- `cleanupUnusedAdminAreas` :496/:502/:508/:514: each `NOT IN (SELECT … FROM facilities)` becomes a **UNION of both tables** — miss one and cross-family AA cleanup throws RESTRICT errors (or, worse with future CASCADE referents like population, silently deletes). Write as an obviously-extendable list
- Guarded delete [structure.ts:139](server/db/instance/structure.ts#L139): clear both tables
- Staging untouched (`stage_structure_from_csv.ts` / `_dhis2.ts` write staging tables only)

**Workers (one-line table-name swaps):**
- [integrate_hmis_data/worker.ts:81](server/worker_routines/integrate_hmis_data/worker.ts#L81) → `facilities_hmis`
- [stage_hmis_data_csv/worker.ts](server/worker_routines/stage_hmis_data_csv/worker.ts#L382) :382/:395/:403/:433 → `facilities_hmis`
- [stage_hmis_data_dhis2/worker.ts:147](server/worker_routines/stage_hmis_data_dhis2/worker.ts#L147) → `facilities_hmis` (ride-along: delete the DEBUG logs at :108-120 and :150-168 — :112 logs the DHIS2 URL)
- [integrate_hfa_data/worker.ts:95](server/worker_routines/integrate_hfa_data/worker.ts#L95) → `facilities_hfa`
- [stage_hfa_data_csv/worker.ts:279](server/worker_routines/stage_hfa_data_csv/worker.ts#L279) (temp_valid_facilities) → `facilities_hfa`

**Instance reads:**
- [dataset_hmis.ts](server/db/instance/dataset_hmis.ts#L170) :170/:183 (DHIS2-scoped-delete subqueries), :326/:338 (DISTINCT type/ownership) → `facilities_hmis`
- [structure.ts:78/:93](server/db/instance/structure.ts#L78) `getStructureItems` (feeds structure UI + CSV export route) → `facilities_hmis`
- [instance.ts:177/:360](server/db/instance/instance.ts#L177) facility counts → `facilities_hmis` (clones; per-family counts deferred)
- [config.ts:31-40](server/db/instance/config.ts#L31) `updateMaxAdminArea` guard → check **both** tables

**Project copies (fixes a live bug):** the shared project `facilities` table is last-writer-wins today — HMIS add inserts a windowed subset (:200-215, :292/:302), HFA add inserts everything (:168, :225/:230); whichever synced last silently clobbers the other family's viz facility joins, and each family's remove path (:341/:349) wipes the shared table. The split scopes every path to its own table:
- [datasets_in_project_hmis.ts](server/db/project/datasets_in_project_hmis.ts#L200): :200 (instance windowed SELECT), :292/:302 (project DELETE+INSERT), :341 (hmis-branch remove), :513 (R-export JOIN) → `facilities_hmis`; :349 (hfa-branch remove) → `facilities_hfa`
- [datasets_in_project_hfa.ts](server/db/project/datasets_in_project_hfa.ts#L99): :99 (R-export JOIN), :168 (instance SELECT *), :225/:230 (project DELETE+INSERT) → `facilities_hfa`. The :230-263 INSERT hand-interpolates values unescaped (an apostrophe in a facility name breaks it) — recommended ride-along: parameterize like the HMIS twin at hmis:302
- R untouched: modules read pre-joined CSVs (hmis:513, hfa:99); m010 reads by name

**No change needed (verified):** `metric_enricher.ts`; geojson/maps (zero facility joins); `facilityColumnsHash` everywhere (hashes the shared config, not table contents); Valkey dataset caches; `lib/`/`client/` (only the count type `lib/types/instance.ts:89`, SSE twins `instance_sse.ts:44/:92`, AI prompt count `build_system_prompt.ts:190` — all single-sourced from `instance.ts`); `dataset_iceh.ts` (zero facility coupling).

## 5. Night sequencing

1. **Commit the in-flight admin-area-rollup work first** (shares files with §3, different hunks — committing keeps this diff reviewable; the pending panther resync stays staged per the usual app-before-panther rule).
2. **A1 startup reset (~20 LOC in `db_startup.ts`):** `UPDATE … SET status_type='error' WHERE status_type IN ('staging','integrating')` per attempt table. Lands first because tonight's own restarts mid-import would otherwise wedge importers (guards at dataset_hmis.ts:796/:924, dataset_hfa.ts:535/:615; verified no reset exists anywhere).
3. **The split, batched:** schemas + both migrations + old-migration guards + weights table + all §3/§4 edits → `deno task typecheck` → `./validate_migrations` → restart **once** → smoke tests. (No server `--watch`: batching keeps this to ~8-15 restarts instead of 20+.)
4. Wizard shell + ICEH port per `PLAN_IMPORTER_CONSOLIDATION.md` (client-only, hot-reloads, zero coupling to the split). Do **not** port the structure wizard the same night the split changes structure-import server behavior.

## 6. Done when

- `deno task typecheck` and `./validate_migrations` pass.
- Viz items byte-identical before/after for one HMIS PO and one HFA PO (save the items JSON pre-change).
- Structure CSV import populates both facility tables identically; HMIS CSV and HFA CSV imports validate and integrate against their own tables.
- In a project with both dataset families: removing the HFA dataset leaves the HMIS project facilities intact (and vice versa) — the clobber bug is gone.
- `hfa_facility_weights` exists, empty, FKs in place.

## 7. Risks

| # | Risk | Mitigation |
|---|---|---|
| R1 | Old-migration replay breaks fresh installs / `validate_migrations` | §1 guards on 001/003/029; base = final state; run `./validate_migrations` before first restart |
| R2 | FK constraint names drift → `SET CONSTRAINTS` throws at runtime on the structure replace-all path | Explicit `CONSTRAINT` names in base + migration (§1, §2) |
| R3 | `cleanupUnusedAdminAreas` misses a UNION arm → cross-family AA deletion attempts | All four subqueries UNION both tables; RESTRICT FKs throw rather than corrupt |
| R4 | Forgotten project-side migration | Same-commit pairing; manual project-DB check (`validate_migrations` is instance-only) |
| R5 | A structure write path missed → tables silently diverge | §4 lists all six; post-import sanity check `SELECT count(*)` equal on both tables |
| R6 | Restored pre-split project backup | Pre-existing gap; optional `runProjectMigrations` after restore (§1) |

## 8. Deferred (explicitly out of scope)

- **Weights ingestion** — likely a per-time-point upload alongside the HFA import (grain matches `hfa_upload_attempts`' time-point model); needs the wizard shell anyway. Until then the table stays empty.
- **Weighted means** — one lockstep change later: R-export SELECT (hfa:87-104) + m010 `script.R` (`USE_SAMPLE_WEIGHTS`) + `definition.json` possibleColumns; viz-side weighted means need weight on the results-object table (SUM(value*weight)/SUM(weight) ingredients), not a facilities join. Check no HFA survey `var_name` is literally `weight` before exporting (pivot_wider collision).
- Per-family structure UI / counts / CSV export; DHIS2-UID regex revisit (stage_hmis_data_dhis2:148) once HMIS facility IDs diverge from HFA's.
- A2 keyed worker registry (15 LOC, buys nothing until a 5th worker importer); A3 escaper retirement (own row-diff-gated pass); population table (nothing here paints it into a corner — the AA-cleanup UNION is written extendable for it).
