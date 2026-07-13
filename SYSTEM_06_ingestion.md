---
system: 6
name: Dataset Ingestion
globs:
  - client/src/components/PeriodSelector.tsx
  - client/src/components/TimeIndexSelector.tsx
  - client/src/components/WindowingSelector.tsx
  - client/src/components/_import_wizard/**
  - client/src/components/instance/instance_data.tsx
  - client/src/components/instance_dataset_hfa/**
  - client/src/components/instance_dataset_hfa_import/**
  - client/src/components/instance_dataset_hmis/**
  - client/src/components/instance_dataset_hmis_import/**
  - client/src/components/instance_dataset_iceh/**
  - client/src/components/instance_dataset_iceh_import/**
  - client/src/state/instance/t2_datasets.ts
  - lib/hfa_sentinel_classification.ts
  - lib/table_structures/**
  - lib/types/dataset_hfa.ts
  - lib/types/dataset_hfa_import.ts
  - lib/types/dataset_hmis.ts
  - lib/types/dataset_hmis_import.ts
  - lib/types/dataset_iceh.ts
  - lib/types/dataset_iceh_import.ts
  - lib/types/datasets.ts
  - lib/types/datasets_in_project.ts
  - server/db/instance/dataset_hfa.ts
  - server/db/instance/dataset_hmis.ts
  - server/db/instance/dataset_iceh.ts
  - server/db/project/calculated_indicators_snapshot.ts
  - server/db/project/datasets_in_project_hfa.ts
  - server/db/project/datasets_in_project_hmis.ts
  - server/db/project/datasets_in_project_iceh.ts
  - server/routes/instance/datasets.ts
  - server/routes/instance/iceh.ts
  - server/server_only_funcs_csvs/**
  - server/worker_routines/integrate_hfa_data/**
  - server/worker_routines/integrate_hmis_data/**
  - server/worker_routines/stage_hfa_data_csv/**
  - server/worker_routines/stage_hmis_data_csv/**
  - server/worker_routines/stage_hmis_data_dhis2/**
  - server/worker_routines/worker_store.ts
---
# S6 — Dataset Ingestion

The stage→integrate machinery for the three dataset families — HMIS
(CSV + DHIS2), HFA (CSV + XLSForm), ICEH (zip) — plus their wizards, the
upload-attempt state machines, and the per-project attach/snapshot seam.
Reviewed against code 2026-07-02 (first review cycle; fixes landed in
commits `80a9996e`, `958132fd`, `b012ad3d`).

Structure/facility ELT (`server_only_funcs_importing/**`) is **S5** — its
execution model (synchronous streamed, 100 MB cap, per-family staging
tables, integrate strategies) is documented in S5's cycle, not here. The
worker lifecycle (spawn, READY handshake, teardown) is S8's
DOC_WORKER_ROUTINES. DHIS2 fetching/retry is S7.

## Three execution models

| Family | Source | Model | Progress |
| --- | --- | --- | --- |
| HMIS | CSV or DHIS2 (chosen at step 0) | background Web Worker per phase (`stage_hmis_data_csv` / `stage_hmis_data_dhis2` / `integrate_hmis_data`) | client HTTP-polls status |
| HFA | CSV + XLSForm | background Web Worker per phase (`stage_hfa_data_csv` / `integrate_hfa_data`) | client HTTP-polls status |
| ICEH | zip (results_csv.csv + indicators.xlsx) | **no worker** — step 2 fires an un-awaited in-process async function (`stageAndIntegrateIcehData`); uncancellable once started | client HTTP-polls status |

There is **no SSE for import progress** — wizards poll every 2 s, dataset
side panels every 5 s. The only SSE push is `notifyInstanceDatasetsUpdated`
after integration completes (refreshes the datasets summary, not progress).

## The upload-attempt state machine

One single-row attempt table per family (`dataset_hmis_upload_attempts`,
`hfa_upload_attempts`, `iceh_upload_attempts`; `CHECK (id='single_row')`),
holding `step` (HMIS 0–4, HFA 1–4, ICEH 1–3), `step_N_result` JSON blobs,
`status` JSON, and a denormalized `status_type` — every write site updates
`status` and `status_type` together.

- `status_type` values: `configuring`, `staging`, `integrating` (the two
  lock states), `staged`, `complete`, `error`. Structure (S5) uses
  `importing`. The HMIS status JSON additionally has `staging_dhis2`
  (work-item progress), which is a lock state for polling purposes.
- **All claims are race-free conditional UPDATEs + rowcount checks**
  (`WHERE status_type NOT IN ('staging','integrating')`), not
  read-then-write. Integration claims additionally exclude `complete`
  (re-integrating a finished attempt could only fail and flip it to
  error). ICEH's create/delete-attempt refuse while an ingest runs —
  the ingest cannot be terminated, so the row must not be reset under it.
- **Staging claims null `step_3_result` (and reset `step`)**: a staging
  run that dies mid-flight can never leave a previous run's result armed
  against staging tables it doesn't describe. Workers write
  `step = 4` + `step_3_result` only on success.
- **All step-config writes are conditional on no active worker phase**
  (same WHERE), so a mappings/selection/credentials edit cannot race a
  running worker into marking data staged under a different config. The
  worker payload is re-read from the row **after** the claim UPDATE, so a
  config write landing between the initial read and the claim cannot run
  the worker on a pre-claim snapshot.
- Earlier-step writes null all downstream `step_N_result`s; the integrate
  gate requires steps 1–3 results present.
- Crash/deploy recovery: `resetWedgedUploadAttempts` (db_startup) flips
  `staging`/`integrating` → `error` at boot. **`staged` survives a
  restart** — which is why HMIS integration re-verifies the staging table
  (below). Cancel (`deleteDataset*UploadAttempt`) hard-terminates the
  HMIS/HFA worker, deletes the row, and drops the staging tables; on
  worker crash the error status is written twice by design (worker catch +
  parent error listener).

## Staging (phase 1)

Rows stream into fixed-name UNLOGGED staging tables
(`UPLOADED_{HMIS,HFA}_DATA_STAGING_TABLE_NAME` — hardcoded constants in
`exposed_env_vars.ts`, not env vars) via buffered `VALUES` inserts.
UNLOGGED = no WAL = fast, but **truncated by a Postgres crash** (they
survive clean restarts). Dropped on integration success/error, on staging
worker error, and on cancel; staging also pre-drops stale tables at start.

- Buffer sizes are per-pipeline: HMIS CSV 10 000, HFA CSV 100 000;
  HMIS-DHIS2 inserts per response batch (`FACILITY_BATCH_SIZE = 100`,
  hard 2048-char URL guard that throws rather than risk truncation).
- Escaping is uniform: `''`-doubling only (HFA via the shared
  `escapeSqlString` in `server/db/utils.ts`, HMIS/structure inline).
- Row-level validation counts and samples drops (persisted in
  `step_3_result`); reference validation (facility exists) runs at staging
  AND again at integration (facilities can be deleted between phases;
  `dataset_hmis.facility_id` / `hfa_data.facility_id` FKs are RESTRICT).
- CSV parsing goes through `getCsvStreamComponents`
  (`get_csv_components_streaming_fast.ts`) — streaming, 2 MB chunks, one
  persistent `TextDecoder` in stream mode, quote-parity-aware chunk
  boundaries (cut only at newlines outside quotes, so quoted fields with
  embedded newlines survive chunking; fixed `c237008e`).
- HMIS-DHIS2 semantics: values `parseInt`-truncated, negatives silently
  dropped; a 200 response missing `rows` is a **failed fetch**, not empty
  data; `succeededWorkItems` records every cleanly-fetched
  (indicator, period) pair including zero-row ones, and
  `fetchedFacilityIds` snapshots the exact queried facility set (the
  UID-shape-filtered `facilities_hmis` list). Failed pairs stage nothing
  and are excluded from the delete scope, so a transient failure can never
  cause deletion.
- HFA XLSForm: `survey`+`choices` sheets required; only
  `select_one`/`select_multiple`/`integer`/`decimal` vars are staged;
  `select_multiple` expands to one binary var per choice
  (`{var}_{choice}`): selected → `1`, unselected → `0`, unanswered parent →
  `""` (missing) on every expanded var, and a parent answered `-99`
  (don't know) marks unselected choices `-99` so downstream sentinel
  handling sees it (PLAN_HFA_FEATURES.md); the name `weight` (any
  case, incl. expanded names) is reserved and aborts staging; duplicate
  var names are a hard error.
- ICEH stages nothing: the zip is parsed in memory and written row-by-row
  inside one transaction at integration.

## Integration (phase 2) — three different contracts

All HMIS/HFA integration runs in **one transaction** (`mainDb.begin`,
tuned `SET LOCAL`s; note `synchronous_commit = OFF` trades durability on
OS crash for speed — atomicity holds).

**HMIS** first verifies the staging table exists AND that its `COUNT(*)`
equals the recorded `finalStagingRowCount` — the table and the recorded
scope are separate artifacts that desynchronize on crash-truncation or an
interrupted re-stage, and the DHIS2 branch would otherwise convert that
into deletions. Then:

- **CSV branch — merge**: UPDATE matched rows → DELETE matched from
  staging → INSERT remainder. Absent cells keep their prior value (by
  design).
- **DHIS2 branch — scoped delete-then-insert**: DELETE every
  (indicator, period) pair in `succeededWorkItems`, scoped to
  `fetchedFacilityIds`, then INSERT exactly what DHIS2 returned
  (`DISTINCT ON` dedupe; `ON CONFLICT` backstop). DHIS2 is authoritative
  over the fetched scope — this is what removes phantom cells DHIS2
  stopped reporting. Old-format staging results (no scope fields) fall
  back to the merge. The `dhis2-deletion-preview` route mirrors the DELETE
  predicate exactly, server-derived from `step_3_result`; step 4 shows a
  confirm modal with the per-pair counts. Caveats: a CSV-origin facility
  with a UID-shaped id is inside the scope (no per-row source marker
  exists); DHIS2 *analytics* staleness is trusted as ground truth.
- Version records (`dataset_hmis_versions`): id = MAX+1 minted **inside**
  the transaction; windowed deletes also mint one (negative counts) inside
  their own transaction and are refused while an import is active — the
  two writers can no longer PK-collide. Ids are monotonic and never reset;
  the id is the client cache key component and the staleness marker.
  Post-commit: drop staging → mark `complete` → notify. Death between
  commit and `complete` leaves error-state-with-data-integrated; the
  count invariant then blocks a blind re-integrate (table dropped).

**HFA — full replace per time_point**: stamp `hfa_time_points.imported_at`
(the time point must pre-exist), DELETE `hfa_data` + `hfa_variables` for
that time point (FK cascades to values), insert dictionary + data from
staging. No merge → **no phantom-value hazard** within a time point; other
time points untouched (rounds). **No version records** — staleness
identity is a hash over `hfa_time_points` (label, sort_order,
imported_at). Weights (`hfa_facility_weights`) are populated by the
structure import (S5), never here; HFA data deletion preserves time
points, weights, and indicator code.

**ICEH — cumulative per-indicator replace**: only indicators present in
the uploaded file are replaced (DELETE cascades to `iceh_data`, then
re-insert); others kept, because the upstream Retriever caps exports at 12
indicators. Data rows whose code is absent from the xlsx are silently
skipped. No staging table, no versions; staleness identity is
`getIcehCacheHash` = md5 of attempt lifecycle + indicator/data counts +
years (see Open items — lifecycle in a content hash causes false
staleness).

## Client

- Wizards render a cascading Switch: status arms (error/complete/
  staging/integrating) before step arms; steps are server step numbers,
  `minStep` = the family's first real step. Resume-after-reload = the
  attempt fetcher sets the stepper to the server `step` column.
- `ImportWizardShell` (`_import_wizard/`) is the descriptor-driven
  extraction of the query/stepper/poll/delete machinery — **adopted only
  by ICEH**; HMIS/HFA still run pre-extraction copies (Open items).
- Pollers keep the status tag in a closure; on a tag change they
  `silentFetch` the full attempt, which remounts the step subtree
  (`StateHolderWrapper` is keyed). `createQuery` is one-shot with
  requestId superseding.
- Destructive data deletes require typing "yes please delete" in all
  three families.
- Display caches: HMIS items keyed
  `versionId_indicatorMappingsVersion_maxAdminArea`; HFA/ICEH use
  server-provided cache hashes from the T1 SSE store.

## Project attach/snapshot seam

Attach = wipe + re-export, per family: validate and capture staleness
metadata FIRST, then `removeDatasetFromProject` (datasets row, snapshot
tables, CSV), then COPY main-DB data to
`{SANDBOX}/{projectId}/datasets/{type}.csv`, then one projectDb
transaction writing `datasets(dataset_type, info, last_updated)` +
snapshot tables. Staleness hashes/versions are captured **before** the
export (hash-after-export could mask a concurrent instance import).
Attach concurrency is an in-memory `_datasetLocks` set keyed
`{projectId}_{datasetType}` in the route.

- Snapshot tables are the metadata twins of the CSVs:
  `calculated_indicators_snapshot` (HMIS), `hfa_indicator*_snapshot`
  (HFA, service-category-scoped), `iceh_indicators_snapshot`. Modules
  read `../datasets/{type}.csv`; PO metadata and module runs read the
  snapshots.
- **Project-level attach/staleness UI is gone** (PLAN_RESULTS_RUNS item 5):
  datasets reach a project only as results-package run inputs — the wizard's
  choose-data step drives the same attach/export functions
  (`generate_run/prepare_inputs.ts`), and the run captures dataset version
  stamps in its manifest. The dirty cascade and the per-dataset staleness
  indicators died with the Data tab.

## Traps

- **`COUNT(*)` returns a string** through the worker/bulk connections (no
  int8 parser configured) — always `Number()` it. Older staging results
  persisted `finalStagingRowCount` etc. as JSON strings; comparisons must
  coerce.
- The staging-table name constants live in `exposed_env_vars.ts` but are
  not env-configurable.
- The DHIS2 URL-length guard measures a URL missing two dimensions
  (~40–50 chars short of the real request).
- JS row validation is narrower than the staging tables' CHECK
  constraints (e.g. period year bounds), so one out-of-range row aborts
  the whole batch with a raw Postgres error instead of a counted drop.

## Open items

Deferred findings from the 2026-07-02 review cycle, plus standing reform:

- **select_multiple missingness** (RESOLVED 2026-07-06): unanswered now
  expands to `""` (missing) and don't-know parents mark unselected choices
  `-99` (see Staging above). Data staged before this change keeps the old
  explicit-`0` rows until re-imported.
- **icehCacheHash**: mixes attempt lifecycle (`date_started:status_type`)
  into a data-content hash → removing a completed attempt flips every
  attached project to "stale" with zero data change; attempt create/delete
  also change the hash without `notifyInstanceDatasetsUpdated`.
- **Wizard shell migration**: port HMIS/HFA onto `ImportWizardShell`
  (drifted hand-rolled copies; every poll fix currently lands 3×). Also
  replace the copy-pasted `@ts-ignore` progress casts with keyed
  narrowing.
- DHIS2 credentials (password) remain plaintext at rest in
  `step_1_result` (API projection is redacted; at-rest encryption is a
  pending ruling — same item in SYSTEM_05).
- HFA: the final staging table is LOGGED while the dict tables are
  UNLOGGED (mixed crash durability); duplicate CSV columns die on a
  cryptic PK error.
- ICEH: progress is written once as 0 and never updated (the percentage
  UI and the `staged` status arm are dead weight); step_2/3_result
  columns written but never read.
- `getCsvDetails` (HFA/HMIS step 1) reads the whole file into memory for
  headers; the streaming variant's header read is one 64 KB `file.read()`
  (wide XLSForm exports / short reads → confusing failure).
- Ethiopian-calendar period math in `step_2_dhis2.tsx` assumes 12 months
  (no Pagume); untranslated strings in the delete flows and
  Period/TimeIndex selectors.
- `facilityOwnwershipsToInclude` typo is the persisted canonical field
  (fixing it = stored-JSON migration).
- **Decoupling — heal the db→worker inversion.** The dataset orchestrators
  in `server/db/instance/` spawn and manage Web Workers (the biggest
  directory lie). [PLAN_IMPORTER_CONSOLIDATION.md](PLAN_IMPORTER_CONSOLIDATION.md)
  is the natural vehicle, along with the single fixed staging-table names.
- **Decoupling — dual CSV parsers.** papaparse vs panther `parseCSV`;
  evaluate consuming panther's `_100_csv`/`_232_csv`
  (PLAN_IMPORTER_CONSOLIDATION §8).
