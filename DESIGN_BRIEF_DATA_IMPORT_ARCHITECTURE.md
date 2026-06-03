# Design Brief — Generic Data Import + Facilities Split + Population Table

> **Status: research + analysis, NOT an implementation plan.** This captures the current-state map and the design seams for a co-design session. It deliberately stops short of a chosen design. Decisions in §5 are open.

Three intertwined goals motivated this:

- **Goal A — Generic import.** Replace the per-table custom import wizards + custom server workers with a generic, robust upload *process* (server stage+integrate) and generic client wizards, extensible to N future tables. Must still serve: HMIS-direct-from-DHIS2 (now the most common path), HFA XLSForm `select_multiple` expansion, geojson file upload, and plain CSV.
- **Goal B — Split facilities.** One `facilities` table → `facilities_hmis` + `facilities_hfa`, both referencing the *same* shared admin-area tables. Geography common; facility IDs and counts differ per dataset.
- **Goal C — Population table.** A new admin-area-keyed population table (total population, proportion U5/WRA, …) referencing the shared AA tables.

---

## 1. Current-state map

### 1.1 The seven import paths

| Path | Source | Execution | Staging | Refs facilities | Wizard steps | What's special |
|---|---|---|---|---|---|---|
| **HMIS-CSV** | CSV asset | Worker (stage+integrate), client polls 2s | UNLOGGED, fixed name | Yes (facilities + indicators_raw) | 0 src → 1 file → 2 map → 3 stage → 4 integrate | Row upsert on `(facility_id,indicator_raw_id,period_id)`; numbered `dataset_hmis_versions` |
| **HMIS-DHIS2** *(most common)* | DHIS2 analytics API | Worker, client polls | UNLOGGED, same fixed name | Yes (reads facilities for OU list) | 0 → 1 creds → 2 indicator+period → 3 → 4 | No file; bypasses TUS; needs structure imported first (ordering dep) |
| **HFA-CSV** | CSV **+** XLSForm `.xlsx` (2 assets) | Worker, client polls | UNLOGGED raw → 4-col final + 2 dict tables | Yes (facilities) | 1 dual-file → 2 map → 3 → 4 | Wide→long; `select_multiple` → `{var}_{choice}` 1→N fan-out; partition-replace by `time_point`; no versions |
| **ICEH** | ZIP (CSV+XLSX) | Synchronous fire-and-forget; client polls | None (in-process) | **No** (survey estimates by strat/level) | 1 zip → 2 confirm | Full-replace; minimal 2-step wizard; no `source_type` |
| **structure-CSV** | CSV asset | **Synchronous + streaming** (NDJSON) | UNLOGGED `temp_structure_staging` | **Writes** facilities + admin_areas | 0 → 1 file → 2 dynamic map → 3 stream-stage (live preview) → 4 preview + **6-way strategy** | 100 MB cap; pads to 4 AA levels; interactive preview→strategy handshake is *why* it's sync |
| **structure-DHIS2** | DHIS2 org units | Synchronous + streaming | `temp_structure_staging`; `pg_try_advisory_lock(12345,67890)` | Writes facilities + admin_areas | 0 → 1 creds → 2 levels → 3 → 4 | Path-heuristic AA derivation; only pipeline with a real lock |
| **geojson** | `.geojson`/`.json` OR DHIS2 | Synchronous handler | None (one blob) | **No** (keyed by `admin_area_level`) | 0 src → 1 file → 2 prop → 3 map names→AA → 4 save | Opaque text blob; joins AA by **name string**; no version |

*(Population has no import path today — see §4.)*

### 1.2 Canonical schema (instance/main DB)

**Shared geography — already normalized, already separate from facilities:**
```
admin_areas_1 (admin_area_1 PK)
admin_areas_2 (admin_area_2, admin_area_1 PK; FK→AA1)
admin_areas_3 (admin_area_3, admin_area_2, admin_area_1 PK; FK→AA2)
admin_areas_4 (admin_area_4, admin_area_3, admin_area_2, admin_area_1 PK; FK→AA3)
```
> PKs are the **full composite path of text NAMES** — names are unique only per-parent, never globally. All FKs `ON DELETE CASCADE`.

**Facilities — single shared table both datasets hang off:**
```
facilities (
  facility_id text PRIMARY KEY,           -- globally unique today
  admin_area_4/3/2/1 text NOT NULL,       -- denormalized; FK→admin_areas_4
  facility_name/type/ownership/custom_1..5 text  -- optional, gated by instance config
)
```

**The dataset tables (note how differently they're shaped):**
```
dataset_hmis (facility_id, indicator_raw_id, period_id int YYYYMM, count int, version_id)
   PK (facility_id,indicator_raw_id,period_id); FK facility_id→facilities, version_id→dataset_hmis_versions
hfa_data     (facility_id, time_point text, var_name text, value text)
   PK (facility_id,time_point,var_name); FK facility_id→facilities; NO version
iceh_data    (iceh_indicator, year, source, strat, level, estimate, standard_error, sample_size)
   PK (5 cols); NO facility ref, NO version
geojson_maps (admin_area_level int [2/3/4] PK, geojson text, uploaded_at)
```

**Indicators (three independent models):** HMIS uses `indicators` (common) + `indicators_raw` + `indicator_mappings` (raw→common at query time). HFA uses `hfa_indicators`/`hfa_variables`/`hfa_variable_values`/`hfa_indicator_code` (R code per indicator, categories). ICEH uses `iceh_indicators`. `calculated_indicators` references `indicators.indicator_common_id` and already has `denom_kind ∈ {none,indicator,population}` + `denom_population_type` + `denom_population_multiplier`.

### 1.3 The state machine is already copy-pasted 4×

`structure_upload_attempts`, `dataset_hmis_upload_attempts`, `hfa_upload_attempts`, `iceh_upload_attempts` are near-identical **singleton** tables (`id='single_row'`) with `step / status / status_type / source_type? / step_1..3_result` (JSON blobs). Client side, the four `index.tsx` orchestrators are ~85% duplicated (query attempt → `getStepper` → header → cascading `<Switch>` → 2s poll). **This duplication is the genericization target, not an accident.**

### 1.4 The data also lives in the project DB

When a dataset is added to a project, facilities are **copied** `SELECT * FROM facilities` (main) → project DB's own `facilities` table ([datasets_in_project_hmis.ts:200](server/db/project/datasets_in_project_hmis.ts#L200), [datasets_in_project_hfa.ts:167](server/db/project/datasets_in_project_hfa.ts#L167)). HMIS copies a *windowed subset*. The viz query pipeline ([cte_manager.ts:106](server/server_only_funcs_presentation_objects/cte_manager.ts#L106)) and per-dataset queries (`INNER JOIN facilities` at [datasets_in_project_hmis.ts:513](server/db/project/datasets_in_project_hmis.ts#L513), [datasets_in_project_hfa.ts:99](server/db/project/datasets_in_project_hfa.ts#L99)) join *that project-local copy*. So facilities exists in **two databases** and the split propagates to both.

---

## 2. Genericization analysis (Goal A)

**Finding: the boilerplate is ~85–95% uniform already.** A generic engine is mostly *consolidation*, with a few genuinely irreducible variation points.

### 2.1 Already common — hoist into the engine
- Upload-attempt envelope (singleton + `step/status/status_type/source_type/step_N_result`).
- Worker handshake (`instantiate_worker_generic.ts` — READY → postMessage → COMPLETED).
- Connection factories + `SET LOCAL work_mem/synchronous_commit/maintenance_work_mem` tuning (char-identical across HMIS/HFA integrate).
- Staging shape: UNLOGGED temp → validated final, buffered `INSERT…VALUES` at BUFFER_SIZE.
- CSV primitives: `getCsvStreamComponents`, `getCsvColumnIndex`, `encodeRawCsvHeader`, `:::` strip — already generic.
- TUS/Uppy asset substrate (`FileUploadSelector` + `upload.ts`) — already the generic front door (3 of 4 wizards).
- DHIS2 client (`getDHIS2`/`validateDhis2Connection`/`withRetry`) — generic; only callers diverge.
- Generic merge skeleton: verify-staging → validate-FK → [version] → begin(tune) → merge → counts → drop+complete.
- Client wizard shell: query → `getStepper` → header → `<Switch>` → poll.

### 2.2 Genuine variation points (must be hooks/config). Hardest case in **bold**.

| Variation | What varies | Hardest case |
|---|---|---|
| Source mode | CSV / DHIS2 / zip / geojson / XLSForm-dual-file | **DHIS2-direct** — no asset file; `{credentials, mode, selection}` first-class |
| Column-mapping spec | fixed-N / dynamic / none | **Structure** — columns gated by `maxAdminArea` + enabled facility cols |
| External metadata loader | none / XLSForm / ICEH indicators.xlsx | **HFA XLSForm** — var types, labels, choice lists |
| Row transform (1→N) | identity / wide→long / binary fan-out | **HFA `select_multiple`** — engine must not assume 1:1 |
| Row validation | period CHECK / count≥0 / strat-enum / freeform | **HMIS + ICEH** — pluggable validator + drop-reason buckets |
| Reference checks | facilities / indicators_raw / none / (future) admin_areas_4 | **HMIS-CSV** — two checks. *This is also the exact Goal-B parameterization point* |
| Conflict key + value cols | 4 different shapes | declarative `{conflictKeyCols[], valueCols[]}` |
| Integration mode | row-upsert / partition-replace / full-replace / 6-strategy | **Structure's 6 strategies** + HFA partition-replace + HMIS versioned upsert |
| Versioning | numbered (HMIS) / none (rest) | `{hasVersioning, replaceScope}` |
| Period typing | INT YYYYMM / TEXT label / year INT / none | engine must not assume one period type |
| Aux output tables | none / 2 HFA dict tables | HFA dictionary emission |
| Execution + progress | worker+poll / sync+stream / fire-and-forget | **Structure sync+stream** — interactivity is load-bearing |
| Worker slot | 2 named singletons | N tables → keyed registry + per-table locks |

**Engine shape implied:** a **descriptor per table** (source modes, mapping spec, reference-check list, conflict key, value cols, integration mode, versioning) feeding *shared* stage/integrate workers — with **two code escape hatches** that resist pure config: the XLSForm metadata loader and the `select_multiple` 1→N transform (model as named pluggable transforms referenced by the descriptor).

---

## 3. Facilities split — blast radius & options (Goal B)

**Good news:** `admin_areas_1..4` are already separate and shared, and **R never sees `facilities`** — modules receive a pre-joined denormalized CSV ([get_script_with_parameters.ts](server/server_only_funcs/)), so **no R/module changes are needed.** Blast radius is entirely TS/SQL.

### 3.1 Every site that changes

**Schema/DDL (both DBs):**
- `_main_database.sql:189` → two CREATE TABLEs, both keep `(aa4,aa3,aa2,aa1)→admin_areas_4` FK.
- `dataset_hmis.facility_id` FK → `facilities_hmis`; `hfa_data.facility_id` FK → `facilities_hfa`.
- `_project_database.sql` facilities → two project tables. Migration must land in **both** `instance/` and `project/`.

**Import/staging/integration (parameterize target+validation table):**
- `integrate_structure_from_staging.ts` — `INSERT INTO facilities` + `cleanupUnusedAdminAreas` (`NOT IN (SELECT … FROM facilities)` must **UNION both** facility tables). AA inserts untouched.
- `deleteAllStructureData` exists in **two places** with different guard logic ([structure.ts:106](server/db/instance/structure.ts#L106) guarded + integrator force-delete) — both reference `facilities`.
- Validators: `stage_hmis_data_csv`, `stage_hmis_data_dhis2`, `stage_hfa_data_csv`, `integrate_hfa_data`.

**The reference-validation join to fork** ([integrate_hmis_data/worker.ts:78](server/worker_routines/integrate_hmis_data/worker.ts#L78), HFA `:92`):
```sql
SELECT DISTINCT a.facility_id FROM <staging> a
LEFT JOIN facilities f ON a.facility_id = f.facility_id WHERE f.facility_id IS NULL
```
→ HMIS joins `facilities_hmis`, HFA joins `facilities_hfa`.

**Project export-to-R + viz pipeline (hardest seam — no `datasetType` in scope at JOIN time):**
- `datasets_in_project_hmis.ts:513` / `datasets_in_project_hfa.ts:99` `INNER JOIN facilities` → family-specific.
- Project copy `DELETE FROM facilities; INSERT…` (hmis `:292`, hfa `:225`) → two tables.
- `cte_manager.ts:104` `facility_subset AS (… FROM facilities)`; `get_possible_values.ts:139/166/175` (three hardcoded `FROM facilities` that bypass CTEManager); `metric_enricher.ts` (custom columns).
- **Critical:** `getPresentationObjectItems` knows only `resultsObjectId → module_id`, not HMIS-vs-HFA → must **propagate dataset family into `buildQueryContext`/CTEManager** (absent today).

**Client + caches:** `getStructureItems`/CSV export/`InstanceStructureSummary.facilities` (single number)/`facilityColumns` config (global) all assume one table. Caches (`facilityColumnsHash`, structure summary) must fork per table.

**DHIS2-UID hazard:** `stage_hmis_data_dhis2` filters facilities by regex `^[a-zA-Z][a-zA-Z0-9]{10}$` — couples HMIS-DHIS2 to DHIS2-shaped IDs; revisit once HMIS IDs become independent.

### 3.2 Schema options

| Option | Shape | Trade-offs |
|---|---|---|
| **A. Two physical tables** | `facilities_hmis` + `facilities_hfa`, both FK shared `admin_areas_4` | Cleanest provenance; matches "IDs & counts differ" exactly; per-table uniqueness natural. Largest mechanical blast radius; must thread dataset family into viz JOIN. **Maps favor this.** |
| **B. One table + `dataset_type` discriminator** | `WHERE dataset_type IN ('hmis','both')` | Smallest schema delta; but leaks discriminator into every query; single global `facility_id` PK → collision risk if HMIS/HFA IDs overlap. |

**Forcing question:** is `facility_id` unique across HMIS+HFA, or independent per table? Counts differ by design → independent is natural → favors **A** and forces project `facilities` to be family-scoped anyway.

---

## 4. Population table (Goal C)

### 4.1 Today
Population is **not a table** — a single instance-wide flat `population.csv` asset, consumed by exactly one module (M8 scorecard). Long/tidy: `admin_area_2..4` (text names) + `year` + `population_type ∈ {total_population,u5,u1,wra,births,pregnancies}` + `count` (**absolute counts**). R reads it, joins by **admin-area name string**, interpolates annual→monthly, computes `denominator = data[[type]] * multiplier * PERIOD_FRACTION`. Only DB footprint: `calculated_indicators.denom_population_type` + multiplier (no FK).

### 4.2 First-class AA-keyed table
Likely a sibling of `facilities` (parent `admin_areas_4`, CASCADE):
```sql
population (
  admin_area_4/3/2/1 text,   -- composite text-name FK → admin_areas_4
  year integer,
  <population columns>,
  PRIMARY KEY (aa4,aa3,aa2,aa1, year)
)
```
**Lowest-risk seam:** materialize table → `population.csv` into the sandbox, leaving R nearly unchanged.

### 4.3 Two semantic landmines
1. **Counts vs proportions.** User's wording ("proportion U5/WRA") is a format shift — today *every* type is an absolute count; zero proportion columns exist. Proportions require deriving counts (`total × prop`) and changing `POPULATION_TYPES` + the R denom expr.
2. **Name-join → FK.** Real composite FK to `admin_areas_4` fixes a bug class (R errors on mismatched names) but adds an import-ordering dependency (AA names must exist first).

### 4.4 Population = ideal first customer of the generic engine
Pure long/tidy `area × year × type × count`; **no legacy wizard to retire** (net-new only); **no facility coupling** (validation targets `admin_areas_4` instead — proving the reference-check parameterization); CSV-only (simplest source); partition-replace-by-year. Exercises the generic seams *without* the hard cases (no DHIS2, no XLSForm, no 1→N).

---

## 5. Open decisions (for co-design) + initial recommendations

> Recommendations are starting positions, not commitments.

1. **Engine style — config-driven vs interface-driven vs hybrid.** *Rec: hybrid* — a declarative descriptor for the 85% (envelope, mapping, reference checks, conflict key, integration mode, versioning) + named pluggable transforms for the two real-code cases (XLSForm loader, `select_multiple` 1→N).
2. **Facilities: two tables (A) vs discriminator (B); `facility_id` uniqueness.** *Rec: A, IDs independent per table.*
3. **Execution model: unify on worker+poll, or keep both (worker + sync-streaming)?** *Rec: keep a "stage→counts→pick→integrate" interactive handshake as a first-class mode* — structure's strategy preview is load-bearing.
4. **Sequencing: is population the pilot? Does geojson stay out?** *Rec: yes, population first; yes, geojson stays separate* (lift only its name→AA mapping UI).
5. One generic `*_upload_attempts` table (keyed by `tableType`) vs one-per-table? Must the singleton constraint die for concurrent imports of *different* tables?
6. Viz pipeline: propagate dataset family through `buildQueryContext`, or tag results objects with their facility-table family?
7. Population: counts or proportions (canonical)?
8. Population: keep R interpolation + materialize-to-CSV, or move interpolation to TS/SQL?
9. Do the 6 structure integration strategies generalize, or stay structure-only?
10. Unify status enum (`importing` vs `staging/integrating`); poll-2s vs SSE (the app has SSE infra but wizards poll)?
11. Per-attempt staging table names (vs fixed) for concurrency?
12. Replace hand-rolled SQL-string escaping with `COPY`/parameterized?
13. Population instance-level (like admin_areas) or per-project? *Rec: instance-level.*

---

## 6. Risks & landmines

1. **SQL-escaping divergence** — every stager builds INSERTs by string interpolation guarded only by `replace(/'/g,"''")` or `cleanValStrForSql` (which strips `"` `'` `,` — behaviorally different). Centralizing is a win but merging carelessly silently corrupts. Governed by DOC_DB_ACCESS_LAYER.
2. **Fixed staging-table names + soft concurrency guard** — two concurrent same-type imports clobber; **server restart mid-stage wedges the pipeline forever** (`status_type='staging'`, no live worker, guard blocks all future imports; only fix = delete attempt row). N tables have no slots (`worker_store.ts` = 2 named singletons).
3. **Dual locking desync** — DB `status_type` + in-process worker ref drift.
4. **`status_type` denormalization / enum divergence** — `step_N_result` typed `any`, no runtime validation; risky if reused for arbitrary payloads.
5. **DHIS2 dominant-path coupling** — worker logs credentials+URL (violates never-log rule), inlines its own analytics URL-building, filters by DHIS2-UID regex (drops non-UID facilities), hidden ordering dependency on structure.
6. **R contracts — relief w/ caveat.** R never reads facilities; but verify no module-emitted `ro_<uuid>` results carrying `facility_id` get JOINed to project `facilities` needing family-routing. M8/population *does* care about counts-vs-proportions + name→FK ordering.
7. **Cache version keys** — split forks `InstanceStructureSummary.facilities` (single number) + `facilityColumnsHash` (global); population needs its own `populationLastUpdated` key + instance-state field.
8. **Two physical `facilities` tables (main + per-project)** — easy to patch one, miss the other; `deleteAllStructureData` in two places; `cleanupUnusedAdminAreas` must UNION both or delete AAs still used by the other family.
9. **Manual version-id race** (`MAX(id)+1`, not serial) + WHERE-less `SELECT *` singleton idiom both break under concurrency.
10. **AA name-uniqueness trap** — names unique only per full path; geojson + population name-joins silently mismatch on duplicate child names; any new table must carry the full `(aa4..aa1)` tuple. Structure pads to 4 levels by duplicating the highest present level when `maxAdminArea<4`.

---

*Full per-subsystem research maps (18) are archived in the workflow transcript; key file:line references are inlined above.*
