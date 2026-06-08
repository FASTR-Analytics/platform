# Plan — Generic Data Import + Facilities Split + Population Table

> **Status: implementation plan.** Supersedes `DESIGN_BRIEF_DATA_IMPORT_ARCHITECTURE.md` (the research/current-state map). Claims here were fact-checked against the codebase (64 claims, 57 confirmed). Decisions in §1 are locked; reopen only with reason.

## Goals

- **A — Generic import engine.** Replace four near-identical per-table import pipelines (server stage+integrate workers + client wizards) with one descriptor-driven engine + a small set of named pluggable transforms for the genuinely-irreducible cases. Must keep serving: HMIS-CSV, HMIS-direct-from-DHIS2, HFA (CSV + XLSForm), structure (CSV/DHIS2), ICEH, geojson, and N future tables.
- **B — Split facilities.** One `facilities` table → `facilities_hmis` + `facilities_hfa`, both FK→shared `admin_areas_4`. Geography stays common; facility IDs and counts become independent per dataset family.
- **C — Population table.** New instance-level, `admin_areas_4`-keyed `population` table (total population, U5, U1, WRA, births, pregnancies), replacing the flat `population.csv` name-string join.

---

## 1. Locked decisions

| # | Decision | Choice |
|---|---|---|
| 1 | Engine style | **Hybrid** — declarative descriptor for the ~85% + registry of named code transforms for the 2 escape hatches (XLSForm metadata loader, `select_multiple` 1→N) |
| 2 | Facilities shape | **Two physical tables** (`facilities_hmis`, `facilities_hfa`); `facility_id` independent per family |
| 3 | Execution model | Keep **interactive sync-streaming** as a first-class engine mode (structure's stage→preview→pick-strategy→integrate handshake is load-bearing); worker+poll is the default mode |
| 4 | Pilot | **Population first** (net-new, no legacy wizard, no facility coupling) |
| 5 | Upload-attempt tables | **One generic `upload_attempts` keyed by `table_type`**; singleton `CHECK (id='single_row')` dies; `source_type` normalized to nullable |
| 6 | Family in viz pipeline | **Propagate `datasetFamily` through `buildQueryContext` → CTEManager** (Step 0) |
| 7 | Population values | **Absolute counts** (canonical). "Proportions" are a presentation concern, never stored. Zero change to `POPULATION_TYPES` or the R denom expr |
| 8 | Population interpolation | **Keep in R**; materialize table → `population.csv` into the sandbox so R is nearly unchanged |
| 9 | Structure 6-strategy | Stays a structure-specific integration mode inside the engine (not generalized) |
| 10 | Status enum | Unify (`importing` vs `staging/integrating`); keep 2s poll for now (SSE later, out of scope) |
| 11 | Staging table names | **Per-attempt** (drop fixed names) — required for N tables + concurrency |
| 12 | SQL safety | **Centralize on parameterized / `COPY`** — retire both hand-rolled escapers |
| 13 | Population scope | **Instance-level** (sibling of `admin_areas`/`facilities`) |

---

## 2. Sequencing

Four steps, each independently shippable and verifiable. Plus three standalone reliability fixes that can land any time (§7).

```
Step 0  Thread dataset family through the viz pipeline   (no schema change — verifiable no-op)
Step 1  Population table (Goal C)                         (net-new; first customer of the thin engine)
Step 2  Generic engine (Goal A)                           (absorb HMIS, HFA, DHIS2, structure)
Step 3  Facilities split (Goal B)                          (now mechanical — family already threaded)
```

Rationale: Step 0 makes Step 3 cheap (the viz JOIN becomes a per-family table-name lookup instead of a hardcoded `FROM facilities`). Step 1 proves the engine's reference-check parameterization on a table where mistakes are cheap. Step 3 last means the facility-table surgery happens once, after the stagers/validators are already centralized.

---

## 3. Step 0 — Thread dataset family (no schema change)

**Why first:** the viz pipeline has no HMIS-vs-HFA in scope at JOIN time today — but the family is already derivable a few lines away. Plumb it now, resolving to the single `facilities` table, so the output is byte-identical. When Step 3 forks the table, this seam is already in place.

**Verified facts**
- Family derivation already exists: [`getDatasetTypes()`](server/server_only_funcs_presentation_objects/get_indicator_metadata.ts#L15) parses `dataSources[].datasetType` → `"hmis"|"hfa"|"iceh"`; runs inside `getIndicatorMetadata`, called from [getPresentationObjectItems:51](server/server_only_funcs_presentation_objects/get_presentation_object_items.ts#L51).
- [`buildQueryContext`](server/server_only_funcs_presentation_objects/get_query_context.ts#L13) signature is `(mainDb, projectDb, tableName, fetchConfig)` — no family.
- Hardcoded facility-table refs to route through a helper: [cte_manager.ts:104-106](server/server_only_funcs_presentation_objects/cte_manager.ts#L104), [get_possible_values.ts:166 & :175](server/server_only_funcs_presentation_objects/get_possible_values.ts#L166) (two, not three — line 139 is a `detectColumnExists` probe), and `metric_enricher.ts`.
- Canonical type exists: `DatasetType = "hmis" | "hfa" | "iceh"` in `lib/types/datasets.ts`.

**Changes**
1. In [get_presentation_object_items.ts](server/server_only_funcs_presentation_objects/get_presentation_object_items.ts#L29): the row fetch already reads `module_id`; also read `module_definition`, derive `datasetFamily` via the existing `getDatasetTypes`, and pass it into `buildQueryContext` (currently called at line 38, before `getIndicatorMetadata`).
2. Add `datasetFamily: DatasetType` to `QueryContext` (`get_query_context.ts` return + `types.ts`) and to the `buildQueryContext` signature.
3. Add helper `facilitiesTableForFamily(family): string` (a one-line map). In Step 0 it returns `"facilities"` for every family. Route cte_manager's `facility_subset`, the two `get_possible_values` CTEs, and `metric_enricher` through it.
4. **Assert ICEH never reaches the facility-join path** (`iceh_data` has no `facility_id`). Throw loudly, don't silently fall through.

**Done when:** viz output is byte-identical to pre-change (diff a saved presentation object's items before/after). This is a pure refactor.

---

## 4. Step 1 — Population table (Goal C)

**Why:** today population joins **by admin-area name string** in R — silently mismatches on duplicate child names (AA names are unique only per full path). A real composite FK to `admin_areas_4` converts silent wrong-denominator bugs into load-time errors. Net-new: no legacy wizard, no facility coupling, single consumer (M8).

**Verified facts**
- `POPULATION_TYPES` = 6 absolute-count types in [lib/types/indicators.ts:35](lib/types/indicators.ts#L35).
- R denom expr is exactly `data[["${type}"]] * ${multiplier} * PERIOD_FRACTION` at [get_script_with_parameters_calculated_indicators.ts:128](server/server_only_funcs/get_script_with_parameters_calculated_indicators.ts#L128).
- DB hook already present: `calculated_indicators.denom_kind ∈ {none,indicator,population}` + `denom_population_type` + `denom_population_multiplier` ([_main_database.sql:434-476](server/db/instance/_main_database.sql#L434)), no FK to population.
- No `population_upload_attempts`, no import endpoint, no wizard — confirmed net-new. Format spec: [DOC_POPULATION_CSV.md](DOC_POPULATION_CSV.md).

**Changes**
1. **Schema** (instance migration): new `population` table, sibling of `facilities`.
   ```sql
   CREATE TABLE population (
     admin_area_4 text NOT NULL, admin_area_3 text NOT NULL,
     admin_area_2 text NOT NULL, admin_area_1 text NOT NULL,
     year integer NOT NULL,
     population_type text NOT NULL,   -- one of POPULATION_TYPES
     count integer NOT NULL,
     PRIMARY KEY (admin_area_4, admin_area_3, admin_area_2, admin_area_1, year, population_type),
     FOREIGN KEY (admin_area_4, admin_area_3, admin_area_2, admin_area_1)
       REFERENCES admin_areas_4 ON DELETE CASCADE
   );
   ```
   (Long/tidy, matching today's CSV. Counts only — decision #7.)
2. **Importer** — the thin engine's first descriptor (CSV-only, `mappingSpec: "dynamic"` on AA columns, reference-check target = `admin_areas_4`, integration = partition-replace-by-`year`, no versioning, no aux tables). Import ordering dep: AA names must exist first (same as facilities).
3. **Materialize → CSV**: on module run, `COPY (SELECT … FROM population …) TO population.csv` into the sandbox in the legacy column shape. R stays as-is (interpolation, name lookup `data[[type]]`).
4. **Client**: a population import wizard built on the new `<ImportWizardShell>` (§6) — minimal (1 file → 2 map → 3 stage → 4 integrate).

**Done when:** uploading a population CSV populates the table; M8 scorecard denominators are unchanged vs. the old flat-CSV path (compare a calculated indicator's output before/after).

---

## 5. Step 2 — Generic engine (Goal A)

Generalize the Step-1 engine to absorb the existing pipelines, **one at a time, retiring each legacy path only after its replacement is proven.** Order by ascending nastiness: HMIS-CSV → HFA → HMIS-DHIS2 → structure.

**Engine shape**
```ts
type ImportDescriptor = {
  tableType: string;                       // "population" | "hmis" | "hfa" | "iceh" | "structure"
  sourceModes: SourceMode[];               // ["csv"] | ["csv","dhis2"] | ["zip"] | ["csv","xlsx"] ...
  mappingSpec: "fixed" | "dynamic" | "none";
  referenceChecks: RefCheck[];             // [{table:"facilities_hmis"},{table:"indicators_raw"}] | [{table:"admin_areas_4"}]
  conflictKey: string[];
  valueCols: string[];
  periodType: "int_yyyymm" | "text" | "year_int" | "none";
  integration: "row_upsert" | "partition_replace" | "full_replace" | "structure_6way";
  partitionCol?: string;                   // "time_point" | "year"
  versioning: { enabled: boolean };        // only HMIS
  auxTables?: AuxTableSpec[];              // HFA's 2 dict tables
  executionMode: "worker_poll" | "sync_stream" | "fire_and_forget";
  rowTransform?: NamedTransform;           // ESCAPE HATCH 1 — registry-referenced
  metadataLoader?: NamedTransform;         // ESCAPE HATCH 2 — registry-referenced
};
```

**What's already shared (hoist, don't rebuild)** — all verified present:
- Worker handshake [instantiate_worker_generic.ts](server/worker_routines/instantiate_worker_generic.ts) (READY → postMessage → COMPLETED).
- `SET LOCAL work_mem/synchronous_commit/maintenance_work_mem` — char-identical at [integrate_hmis_data/worker.ts:120](server/worker_routines/integrate_hmis_data/worker.ts#L120) and [integrate_hfa_data/worker.ts:117](server/worker_routines/integrate_hfa_data/worker.ts#L117).
- Staging shape: UNLOGGED temp → validated final, buffered INSERT at `BUFFER_SIZE` ([stage_hfa_data_csv/worker.ts:177](server/worker_routines/stage_hfa_data_csv/worker.ts#L177)).
- CSV primitives `getCsvStreamComponents` / `getCsvColumnIndex` / `encodeRawCsvHeader` / `:::` strip.
- TUS/Uppy `FileUploadSelector` (3 of 4 wizards) + `getStepper`.
- DHIS2 client `getDHIS2` / `validateDhis2Connection` / `withRetry`.

**The two escape hatches** (genuinely code, keep in one registry, referenced by string in the descriptor):
- `select_multiple` 1→N fan-out: [stage_hfa_data_csv/worker.ts:236-252](server/worker_routines/stage_hfa_data_csv/worker.ts#L236).
- XLSForm metadata loader (var types, labels, choice lists).

**Must-absorb, not paper over:**
- **SQL escaping → parameterized/`COPY`.** Today divergent and one path is lossy: [`cleanValStrForSql`](lib/utils.ts#L5) strips `'` `"` `,` (corrupts values with commas) vs. [quote-doubling at stage_hmis_data_csv:217](server/worker_routines/stage_hmis_data_csv/worker.ts#L217). Do **not** standardize on either escaper — go parameterized/`COPY` (DOC_DB_ACCESS_LAYER). This is the single most dangerous merge; verify row-for-row output equality per pipeline before retiring the legacy path.
- **Period typing** differs per table (`int_yyyymm` / `text` / `year_int`) — descriptor carries it, engine never assumes one.
- **Reference checks** are the exact Goal-B parameterization point — HMIS validates against `facilities` + `indicators_raw` ([stage_hmis_data_csv/worker.ts:482](server/worker_routines/stage_hmis_data_csv/worker.ts#L482)); the family-specific `facilities_hmis`/`_hfa` target flows from the descriptor.
- **Concurrency** (do this when population becomes the 5th importer, not later): per-attempt staging table names (decision #11) + keyed worker registry replacing the two named singletons in [worker_store.ts:4](server/worker_routines/worker_store.ts#L4). Fixes the restart-wedge (Risk R2).

**Upload-attempt unification:** one `upload_attempts` table keyed by `table_type` (decision #5). Reconcile `source_type` (today `NOT NULL` on HFA, absent on ICEH, nullable on HMIS/structure → normalize to nullable). Kill the singleton constraint.

**Done when:** each legacy stager/integrator + wizard is deleted and its dataset imports through the engine with identical stored output.

---

## 6. Client — `<ImportWizardShell>`

The four orchestrators ([instance_dataset_hmis_import/index.tsx](client/src/components/instance_dataset_hmis_import/index.tsx), `…hfa…`, `…iceh…`, `structure_import/index.tsx`) are ~78% identical (query attempt → `getStepper` → header → cascading `<Switch>` → 2s poll at [index.tsx:148](client/src/components/instance_dataset_hmis_import/index.tsx#L148)). Extract one shell taking a per-dataset descriptor (`{steps, pollTarget, stepComponents, serverActions}`). The variation is purely which actions/types/step-components get wired in. Can land alongside Step 1 (population uses it first) and back-fills the others during Step 2.

---

## 7. Step 3 — Facilities split (Goal B)

**Relief (verified):** R never sees `facilities` — modules get a pre-joined denormalized CSV via the `INNER JOIN facilities` exports ([datasets_in_project_hmis.ts:513](server/db/project/datasets_in_project_hmis.ts#L513), [datasets_in_project_hfa.ts:99](server/db/project/datasets_in_project_hfa.ts#L99)). So **no R / `module_defs/` changes.** Entirely TS/SQL.

**Schema (both DBs):**
- Instance: split [facilities @ _main_database.sql:189](server/db/instance/_main_database.sql#L189) → `facilities_hmis` + `facilities_hfa`, both keep `(aa4,aa3,aa2,aa1)→admin_areas_4`. Backfill both from existing `facilities`. Repoint `dataset_hmis.facility_id → facilities_hmis`, `hfa_data.facility_id → facilities_hfa`. **Preserve `ON DELETE RESTRICT DEFERRABLE`** on the facility FKs — they are *not* CASCADE today ([:282](server/db/instance/_main_database.sql#L282), [:357](server/db/instance/_main_database.sql#L357)); do not "tidy."
- Project: split [facilities @ _project_database.sql:87](server/db/project/_project_database.sql#L87) → two tables. **Paired migration commit** — landing the instance migration without the project one is the classic trap (`validate_migrations` is instance-only).

**Import / integrate:**
- [integrate_structure_from_staging.ts](server/server_only_funcs_importing/integrate_structure_from_staging.ts#L496): `cleanupUnusedAdminAreas`'s `NOT IN (SELECT … FROM facilities)` must **UNION both** facility tables (lines 496-514) — miss this and you delete admin areas still used by the other family. AA inserts untouched.
- `deleteAllStructureData` in **two places** — guarded [structure.ts:106](server/db/instance/structure.ts#L106) + force-delete [integrate_structure_from_staging.ts:399](server/server_only_funcs_importing/integrate_structure_from_staging.ts#L399) — both clear both tables.
- Reference-validation joins fork by family: [integrate_hmis_data/worker.ts:78](server/worker_routines/integrate_hmis_data/worker.ts#L78) → `facilities_hmis`; [integrate_hfa_data/worker.ts:92](server/worker_routines/integrate_hfa_data/worker.ts#L92) → `facilities_hfa`. (After Step 2 these are one descriptor-driven check.)

**Project export-to-R + viz:**
- The `facilitiesTableForFamily()` helper from Step 0 now returns the real per-family table. cte_manager, the two `get_possible_values` CTEs, and `metric_enricher` need no further edits — just the helper's map.
- Project copy `DELETE FROM facilities; INSERT…` already runs in family-specific files — point each at its own table: add-path [hmis:292](server/db/project/datasets_in_project_hmis.ts#L292) / [hfa:225](server/db/project/datasets_in_project_hfa.ts#L225); **remove-path [hmis:341 & :349](server/db/project/datasets_in_project_hmis.ts#L341)** (these currently wipe the shared table unconditionally — scope each to its own family table). HMIS keeps its windowed-subset copy ([:200](server/db/project/datasets_in_project_hmis.ts#L200)); HFA copies all.

**Client / caches:** fork `getStructureItems` / structure CSV export / `InstanceStructureSummary.facilities` (single count → per-family) / `facilityColumns` config / `facilityColumnsHash` cache key per family.

**DHIS2-UID hazard:** [stage_hmis_data_dhis2/worker.ts:148](server/worker_routines/stage_hmis_data_dhis2/worker.ts#L148) filters facilities by `^[a-zA-Z][a-zA-Z0-9]{10}$` — couples HMIS-DHIS2 to DHIS2-shaped IDs. Revisit once HMIS facility IDs are independent of HFA's.

**Done when:** a project with both an HMIS and an HFA dataset shows correct, independent facility sets for each; removing one leaves the other intact.

---

## 8. Standalone reliability fixes (land any time, gate on nothing)

- **Restart-wedge** (R2): per-attempt staging names + reset stale `status_type` on startup. Today a server restart mid-stage wedges the pipeline forever (status stuck `staging`, soft guard blocks all future imports; only fix = delete the attempt row). Folds naturally into decision #11.
- **Version-id race** (R9): replace `MAX(id)+1` ([dataset_hmis.ts:1015](server/db/instance/dataset_hmis.ts#L1015) + [integrate_hmis_data/worker.ts:105](server/worker_routines/integrate_hmis_data/worker.ts#L105)) with a sequence.
- **DHIS2 credential logging** (R5): remove `console.log("DEBUG: credentials.url …")` at [stage_hmis_data_dhis2/worker.ts:112](server/worker_routines/stage_hmis_data_dhis2/worker.ts#L112).

---

## 9. Risks & landmines

| # | Risk | Mitigation |
|---|---|---|
| R1 | Centralizing SQL escaping onto the lossy `cleanValStrForSql` → silent corruption of values with commas/quotes | Go parameterized/`COPY`; verify row-for-row output equality per pipeline before retiring legacy |
| R2 | Restart-wedge + fixed staging names + 2 named worker singletons | Per-attempt staging names + keyed registry + startup status reset (§8) |
| R3 | `cleanupUnusedAdminAreas` not UNIONing both facility tables post-split → deletes AAs still in use | UNION both (§7). RESTRICT FKs help by throwing instead of silently cascading |
| R4 | Forgetting the per-project migration while landing the instance one | Paired-commit discipline; manual project-DB check (`validate_migrations` is instance-only) |
| R5 | Population proportions decided implicitly → breaks the live scorecard denom | Decision #7: counts canonical, zero R-formula change |
| R6 | `MAX(id)+1` version race under concurrency | Sequence (§8) |
| R7 | `select_multiple` / XLSForm forced into config | Keep as named code transforms in the registry (§5) |
| R8 | No server `--watch` — every engine/stager edit needs a manual restart | Budget for the slow inner loop on Steps 1–2 |

---

## 10. Verified-facts appendix (fact-check summary)

Brief claims checked: **64 — 57 confirmed, 6 partial, 1 refuted.** Corrections folded into this plan:
- **"All FKs ON DELETE CASCADE" — refuted.** Facility FKs on `dataset_hmis`/`hfa_data` are `ON DELETE RESTRICT DEFERRABLE`; CASCADE applies only to the `admin_areas` hierarchy + `facilities→admin_areas`. (Plan preserves RESTRICT — §7.)
- **"source_type uniformly optional" — refuted.** `NOT NULL` on HFA, absent on ICEH. (Plan normalizes to nullable — decision #5.)
- **"three `FROM facilities` in get_possible_values" — partial.** Two (lines 166, 175); line 139 is a `detectColumnExists` probe.
- **"two FKs on dataset_hmis" — partial.** Three (incl. `indicators_raw`).
- Everything else in §§1.1–1.4, 2, 3.1, 4, 6 of the brief confirmed accurate.
