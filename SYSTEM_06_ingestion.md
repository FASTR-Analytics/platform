---
system: 6
name: Dataset Ingestion
globs:
  - client/src/components/PeriodSelector.tsx
  - client/src/components/TimeIndexSelector.tsx
  - client/src/components/WindowingSelector.tsx
  - client/src/components/instance/instance_data.tsx
  - client/src/components/instance_dataset_hfa/**
  - client/src/components/instance_dataset_hmis/**
  - client/src/components/instance_dataset_iceh/**
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
  - lib/types/dhis2.ts
  - server/db/instance/dataset_hfa.ts
  - server/db/instance/dataset_hfa_import_runs.ts
  - server/db/instance/dataset_hmis.ts
  - server/db/instance/instance_dhis2_credentials.ts
  - server/db/instance/dataset_hmis_import_ledger.ts
  - server/db/instance/dataset_hmis_import_runs.ts
  - server/db/instance/dataset_hmis_scheduled_imports.ts
  - server/db/instance/dataset_iceh.ts
  - server/db/instance/dataset_iceh_import_runs.ts
  - server/db/project/datasets_in_project_hfa.ts
  - server/db/project/datasets_in_project_hmis.ts
  - server/db/project/datasets_in_project_iceh.ts
  - server/routes/instance/datasets.ts
  - server/routes/instance/dhis2_credentials.ts
  - server/routes/instance/iceh.ts
  - server/server_only_funcs_csvs/**
  - server/worker_routines/import_hfa_data_csv/**
  - server/worker_routines/import_hmis_data_csv/**
  - server/worker_routines/import_hmis_data_dhis2/**
  - server/worker_routines/import_iceh_data/**
  - server/worker_routines/worker_store.ts
---

# S6 — Dataset Ingestion

The stage→integrate machinery for the three dataset families — HMIS (CSV +
DHIS2), HFA (CSV + XLSForm), ICEH (zip) — plus their wizards, the import-run
state machines, and the per-project attach/snapshot seam. Every family is
import runs (PLAN_DHIS2_IMPORTER_CONSOLIDATION Phases A–C); only the
structure family (S5) still uses upload attempts. Reviewed against code
2026-07-02 (fixes in `80a9996e`, `958132fd`, `b012ad3d`).

Structure/facility ELT (`server_only_funcs_importing/**`) is **S5**. The
worker lifecycle (spawn, READY handshake, teardown) is
[PROTOCOL_APP_WORKER_ROUTINES.md](PROTOCOL_APP_WORKER_ROUTINES.md) (machinery
owned by S8). DHIS2 fetching/retry is S7.

## One execution model

Every import is a background Web Worker over a run row, no attempt row
anywhere: `import_hmis_data_csv` (CSV — stages into per-run tables, gates,
integrates), `import_hmis_data_dhis2` (DHIS2 — fetches AND integrates per
(indicator, month) pair; no staged-review step), `import_hfa_data_csv`
(CSV + XLSForm), `import_iceh_data` (zip of results_csv.csv +
indicators.xlsx; stages in memory). The client HTTP-polls the run row
(HMIS-DHIS2 also the ledger); there is **no SSE for import progress** — the
imports surfaces poll every 2 s while a run is active. The only SSE push is
`notifyInstanceDatasetsUpdated` after integration/run completion (refreshes
the datasets summary, not progress).

## HMIS import runs (DHIS2 per-pair + CSV stage-gate-integrate)

This section is the authority. Every HMIS import — DHIS2 or CSV — is a row
in `dataset_hmis_import_runs`; there is no second lifecycle (the attempt
machinery died in Phase A; PLAN_DHIS2_IMPORTER's as-built record is in git
history). Shape:

- `dataset_hmis_import_runs` (main DB): one row per run — trigger/user,
  `source` (`dhis2|csv`), selection JSON (DHIS2: window or explicit pairs) or
  `csv_config` JSON (CSV: `{ fileName, filePin, mappings }`; the
  source→fields pairing is enforced in code), status
  (`queued|running|needs_review|complete|error|cancelled`), pair counters
  (DHIS2 only), throttled `progress` JSON (by-source union: in-flight pairs vs
  a staging/integrating percentage), `run_stats` (DHIS2: classification +
  per-pair fetch stats; CSV: the staging diagnostics), `version_id`. A partial
  unique index allows at most one `running` row — the INSERT (or the
  queued→running UPDATE) is the launch claim, shared by both sources; queued
  rows of either source drain FIFO through the same scheduler tick. Inline
  credentials travel only in the worker message; stored credentials
  (`instance_dhis2_credentials`, instance-wide, password AES-GCM-encrypted
  with `DHIS2_CREDENTIALS_ENCRYPTION_KEY`) are decrypted only inside the
  worker via `resolveDhis2Credentials`; CSV fires need no credentials.
- **CSV runs** (`import_hmis_data_csv/` worker, `"hmis"` worker key): the
  wizard is client-local — its file input is an ordinary instance asset
  (uploaded or picked, S4), named by `fileName` in the launch payload and
  byte-pinned at launch validation (S4's `AssetFilePin` +
  `resolveAssetFileOrThrow`; every deferred read re-checks the pin, so an
  overwrite while a run queues or holds fails loudly). Inputs persist after
  the run.
  The stage leg streams the CSV into **per-run staging tables**
  (`_run_{runId}` suffix), then gates: every validation drop counter zero AND
  >0 rows staged → auto-integrate unattended; dropped rows → `needs_review`
  with diagnostics on the run row, **releasing the running slot** (the
  per-run table survives the hold; "Integrate anyway" re-claims — or queues;
  "Discard" cancels and drops it); zero staged rows → loud `error`. The
  integrate leg is the old single-transaction CSV merge unchanged; the
  version link and the `complete` flip land together as the transaction's
  last statement (readers hide a running run's version; a committed one is
  already complete).
- **Auto-pull (Phase 4, C4/C6)**: `dataset_hmis_scheduled_imports` (one-shot
  and recurring rows, rolling-window selection resolved at fire time) is
  fired by a ~60 s tick in main.ts (`import_hmis_data_dhis2/scheduler.ts`) —
  queued runs drain FIFO first, then due schedules (occurrence math per IANA
  timezone, 4 h grace at every cadence, deterministic per-row jitter,
  `last_fired_at` CAS idempotency). Recurring rows carry a `recurrence` JSON
  union (migration 064): daily / weekly / monthly-nth-weekday-only (ruled
  2026-07-25), each with an explicit anchor (weekly `firstRunDate`, monthly
  `anchorMonth`); occurrences are exact arithmetic from the anchor, never
  counted from the last fire; the weekly UI offers 1/2/4 weeks (server
  accepts 1–13). Schedules have no URL of their own — runs pin (the
  queued-run URL guard), policies follow the stored connection.
  Refusals/misses are loud (`last_outcome` + datasets-summary attention
  flag). Two accepted limitations (2026-07-15): a crash between the CAS claim
  and the outcome write silently consumes that occurrence, and
  rolling-window "current month" resolves from the server clock, not the
  schedule's timezone (≤hours of skew, self-correcting).
- The worker classifies every selected raw indicator per run from DHIS2
  metadata (dispatcher): bare data elements + operands → dataValueSets
  country-pulls, one per base element × month selected by
  `period=<instance period id>` (an opaque token the DHIS2 server interprets
  in its own calendar, same contract as analytics `pe:` — the app never
  converts calendars/dates; a calendar-configured server does not read
  startDate/endDate as Gregorian), level-2 subtree split on size/timeout;
  computed DHIS2 indicators → analytics; unknown ids → permanent ledger
  errors with no fetch; a response containing any period other than the
  requested one fails the pull loudly (permanent). The evidence base
  (verdicts E1–E13, incl. the calendar finding and the sizing fact that DVS
  deep-history backfill ≈ 10 MB per dense element-month) lives in the retired
  lab repo `~/projects/apps/wb-fastr-dhis2-lab` (RESULTS.md; DHIS2 caches
  analytics responses — never time a repeated identical request).
- Each pair integrates in its own small transaction: scoped delete (against an
  UNLOGGED facility-scope snapshot table captured at run start) → insert →
  ledger upsert → run counters. A run that dies keeps every completed pair. The
  version row is minted lazily at the first successful pair
  (dataset_hmis.version_id is a NOT NULL FK; no empty versions) and its
  counts/staging_result are finalized at run end.
- Shadow verification (`shadow_passed`) was removed 2026-07-24 — DVS-analytics
  divergence is normal on real servers, so the gate aborted healthy first
  runs. dataValueSets is the source of truth; migration 063 dropped the
  column; older `run_stats` blobs may still carry a `shadow` key.
- Concurrency: the partial unique index is the whole story — CSV and DHIS2
  share the claim, so the old cross-table guard lattice is gone. Windowed
  deletes refuse while a run is `running`. db_startup sweeps stale `running`
  rows to `error` after a restart (dropping a CSV run's staging tables). Run
  cancel terminates the worker; completed DHIS2 pairs stay, a CSV run's
  single transaction rolls back whole.

## HFA import runs

Every HFA import is a row in `hfa_import_runs` (main DB), running the HMIS
CSV run shape (`import_hfa_data_csv/` worker, `"hfa"` worker key); the
attempt machinery died in Phase B. The HMIS section above is the authority on
the shared mechanism; HFA differs only here:

- **Smaller machine, by design**: no queue, no scheduler, no versions plane. A
  second launch while one runs is **refused explicitly**, not queued.
- Row shape: `csv_config` JSON (`{ csvFileName, csvFilePin, xlsFormFileName,
  xlsFormFilePin, mappings }` — two pinned assets),
  `time_point` denormalized from the mappings as the outcome link (HFA
  outcomes live in the time-point plane, not a versions table), `diagnostics`
  (the staging result, written at the hold AND at complete; rides the polled
  list, no detail route), `n_rows_integrated`.
- **Clean condition**: `nRowsInvalidMissingFacilityId +
  nRowsInvalidFacilityNotFound = 0 AND nRowsTotal > 0`. Duplicates and
  filtered-out rows never gate — both are resolved by user intent at wizard
  time. Nothing staged → loud `error`.
- Launch re-validates statelessly (all relocated from the deleted step
  functions): facilities exist, the time point exists, both assets resolve
  (stamping the pins), the XLSForm has `survey`+`choices`, and the mappings
  clean up (trimmed time point, non-blank filter values, no duplicate
  override facility).

## ICEH import runs

Every ICEH import is a row in `iceh_import_runs` (main DB), running the same
shape (`import_iceh_data/` worker, `"iceh"` worker key); the singleton
`iceh_upload_attempts` machinery died in Phase C. ICEH differs only here:

- **Smallest machine**: no queue, no scheduler, no versions plane, no staging
  tables — the zip is parsed and validated **in memory** (ICEH is small). A
  second launch while one runs is refused explicitly. The run rows are ICEH's
  first-ever durable import history.
- Row shape: `zip_config` JSON (`{ zipFileName, zipFilePin }` — one pinned
  asset), `diagnostics` (the staging result, written at the hold AND at
  complete; rides the polled list, no detail route), no outcome-link column
  (the outcome plane is the cumulative `iceh_indicators`/`iceh_data` store).
- **Clean condition**: `nRowsSkippedUnknownStrat + nRowsSkippedInvalidYear +
  nRowsSkippedUnknownIndicator = 0 AND nRowsValid > 0`. The year and
  indicator counters were silent skips before Phase C (an `isNaN` drop and an
  insert-time `continue`); the gate now counts them (≤5 samples each).
  `nRowsSkippedMissingEstimate` never gates — "NA" estimates are a normal
  feature of Retriever exports. Zero valid rows → loud `error`.
- **needs_review holds re-ingest**: staging is in-memory, so nothing survives
  the hold — "Integrate anyway" re-claims and re-runs the full ingest from
  the zip asset with the gate skipped (`skipReviewGate` on `zip_config`);
  deterministic, seconds at ICEH scale. The spawn re-checks the pin, so a
  zip deleted or overwritten during the hold errors the run loudly.
- Launch re-validates statelessly: zip parseable (preview parse) and the
  country-ISO match against instance config (the old step-2 check).
- The completion flip lives inside the merge transaction (the Phase B
  cancel-vs-commit fix, adopted from birth here).

## Staging (phase 1)

Rows stream into UNLOGGED staging tables via buffered `VALUES` inserts. Both
CSV families name their tables per run (`_run_{runId}` suffix, derived from the
run id — never recorded), which is what lets a `needs_review` hold release the
running slot. UNLOGGED = no WAL = fast, but **truncated by a Postgres crash**
(they survive clean restarts). Dropped on integration success/error, on worker
error, and on cancel/discard/sweep; staging also pre-drops stale tables at
start.

- Buffer sizes are per-pipeline: HMIS CSV 10 000, HFA CSV 100 000. (HMIS-DHIS2
  no longer stages to a table — the run worker holds each pull in memory and
  integrates per pair.)
- Escaping is uniform: `''`-doubling only (HFA via the shared `escapeSqlString`
  in `server/db/utils.ts`, HMIS/structure inline).
- Row-level validation counts and samples drops (on the run row); reference
  validation (facility exists) runs at staging AND again at integration
  (facilities can be deleted between phases; the facility FKs are RESTRICT).
- CSV parsing goes through `getCsvStreamComponents`
  (`get_csv_components_streaming_fast.ts`) — streaming, 2 MB chunks,
  quote-parity-aware chunk boundaries (quoted fields with embedded newlines
  survive chunking; fixed `c237008e`).
- HMIS-DHIS2 semantics (run worker): analytics values `parseInt`-truncated,
  negatives dropped; dataValueSets values summed per facility across COC×AOC
  (operands restricted to their COC first), the SUM truncated, negative
  totals dropped. A 200 analytics response missing `rows` is a **failed
  fetch**; a dataValueSets body without `dataValues` IS a legitimate empty
  month. The facility scope is the UID-shape-filtered `facilities_hmis` list
  snapshotted at run start; failed pairs never delete anything.
- HFA XLSForm: `survey`+`choices` sheets required; only
  `select_one`/`select_multiple`/`integer`/`decimal` vars are staged;
  `select_multiple` expands to one binary var per choice (`{var}_{choice}`:
  selected `1`, unselected `0`, unanswered parent `""` on every expanded var,
  a `-99` don't-know parent marks unselected choices `-99`); the name
  `weight` (any case, incl. expanded) is reserved and aborts staging;
  duplicate var names are a hard error.
- HFA row filtering + dedup (order fixed: **filter → review → resolve**; all
  fields in the run's mappings JSON): `rowFilters` (ANDed; trimmed-string
  `equals`/`not_equals` on the raw cell) drop rows before any duplicate
  handling, then facilities with >1 surviving row resolve to one each via
  `dedupStrategy` ("first"/"last" in file order; the review UI's bulk
  quick-set) plus per-facility `dedupOverrides` (wizard duplicates step,
  auto-skipped when the scan finds none). Row numbers everywhere are the
  **1-based data-row position in the file** (header excluded), computed by
  `server_only_funcs_csvs/scan_hfa_rows.ts` (shared by the stage leg and the
  stateless `previewDatasetHfaDuplicates` route) — never read from a column.
  The stage leg stamps `row_seq` into the raw temp table, materializes the
  resolved keep-set into the per-run keep-rows table, and joins it; every
  override is validated against the post-filter duplicate structure and a
  stale override fails staging loudly — never a silent fallback.
- ICEH stages no tables: the run worker's stage leg parses and validates the
  zip in memory; rows are written inside one transaction at integration.

## Integration (phase 2) — three different contracts

All HMIS/HFA integration runs in **one transaction** (`mainDb.begin`, tuned
`SET LOCAL`s; note `synchronous_commit = OFF` trades durability on OS crash for
speed — atomicity holds).

**HMIS (CSV)** first verifies the per-run staging table exists AND that its
`COUNT(*)` equals the recorded `finalStagingRowCount` — the table and the
recorded diagnostics are separate artifacts that desynchronize on
crash-truncation or an interrupted re-stage. Then:

- **Merge**: UPDATE matched rows → DELETE matched from staging → INSERT
  remainder. Absent cells keep their prior value (by design).
- **DHIS2 scoped delete-then-insert lives in the run worker, per pair**:
  DELETE the pair's rows for the snapshotted facility scope, INSERT what DHIS2
  returned. DHIS2 is authoritative over the fetched scope — this is what removes
  phantom cells DHIS2 stopped reporting. Caveats unchanged: a CSV-origin
  facility with a UID-shaped id is inside the scope (no per-row source marker
  exists); DHIS2 staleness is trusted as ground truth.
- Version records (`dataset_hmis_versions`): id = MAX+1 minted **inside** the
  writing transaction (CSV integrate leg; DHIS2 lazy mint; windowed deletes
  with negative counts); all writers are mutually excluded by the
  single-running claim + delete guard. Ids are monotonic, never reset — the
  client cache key component and staleness marker. The CSV run's
  `version_id` and its `complete` flip land in ONE guarded statement, last in
  the merge transaction (HFA/ICEH's model): a cancel that flips first rolls
  the merge back whole; a merge that commits is already complete. So a CSV
  run can never be error/cancelled with a version, and the crash / cancel /
  sweep paths reconcile version rows for DHIS2 runs only. Post-commit: drop
  staging → notify.

**HFA — full replace per time_point**: stamp `hfa_time_points.imported_at` (the
time point must pre-exist), DELETE `hfa_data` + `hfa_variables` for that time
point (FK cascades to values), insert dictionary + data from staging. No merge →
**no phantom-value hazard** within a time point; other time points untouched
(rounds). **No version records** — staleness identity is a hash over
`hfa_time_points` (label, sort_order, imported_at). Weights
(`hfa_facility_weights`) are populated by the structure import (S5), never here;
HFA data deletion preserves time points, weights, and indicator code.

**ICEH — cumulative per-indicator replace**: only indicators with valid data
rows in the uploaded file are replaced (DELETE cascades to `iceh_data`, then
re-insert); others kept, because the upstream Retriever caps exports at 12
indicators. Rows whose code is absent from the xlsx are counted stage-side
(`nRowsSkippedUnknownIndicator`, gates the review hold) and never inserted. No
staging table, no versions; staleness identity is `getIcehCacheHash` = md5 of
the latest run's `id:status` + indicator/data counts + years (two consumers:
the client display cache and the results-run capture staleness hash).

## Client

One imports surface per family, opened from a single `Imports` button in the
dataset page's admin sidebar — the sidebar is the seam between the viewer
and the imports layer: the SSE status flags (HMIS only: running / queued /
attention), that one button, and `Delete data` (HFA also `Manage time
points`); no wizard shortcuts, no heading (ruled 2026-08-17). The surface's toolbar owns
the actions; no attempt cards anywhere. The runs query polls every 2 s while
a run is active, needs_review runs render as Current cards with the staging
diagnostics + Integrate-anyway/Discard, History rows click through to a run
detail, and the wizard is a client-local modal (nothing persists before
launch). Every wizard file slot is S4's `FileUploadSelector` — upload a new
file or pick an existing instance asset; either way the wizard holds an asset
`fileName`, which is what launch/parse payloads name. Selection re-parses via
the slot's direct `onChange` callback (never an effect on the fileName
signal: re-uploading the same name leaves the signal unchanged, and only the
callback re-parses the new bytes).

- **HMIS** (`instance_dataset_hmis/imports/`): Current / Future / History /
  By indicator tabs (SSE summary fields as the wake-up signal, routed through
  the shell's `refresh()`). The shell owns every read — the tabs are
  stateless: panther's `StateHolderWrapper` keys its ready branch on the data
  object, so every silent runs/scheduling fetch (the 2 s poll included)
  remounts the tab area, and a tab-owned query would refetch on every poll.
  The ledger is a full-table read, so it is a shell-level
  `createSignal<StateHolder>` + `createEffect` fetched only while the
  By-indicator tab is showing (every switch to it, and every `refresh()` /
  toolbar refresh via a `ledgerVersion` signal; stale rows stay visible until
  fresh ones arrive). By indicator is the import ledger — import history
  pivoted by raw indicator, click-through to a per-month detail
  (`_ledger_indicator_detail.tsx`). "Re-import this indicator" closes the
  detail with a pair list and "Retry failed pairs" hands the tab's pair list
  to the shell; both feed the wizard's `presetPairs` entry, the same contract
  as History → run detail (a cancelled wizard lands on the tab, not back in
  the detail — same as run detail; accepted). Two wizards
  — DHIS2 (credentials/indicators/time/config/review) and CSV (upload →
  mappings → review) — both with the launch-or-queue fork. A run detail's
  Version row opens the version's `_import_information.tsx` — this replaced
  the "View previous imports" entry point (Phase D); the versions table and
  detail view are unchanged.
- **HFA** (`instance_dataset_hfa/imports/`): Current card + History table, no
  tabs; four-step wizard (upload both files → mappings + filters → duplicates
  → review; Start only, refusal inline). The run row is HFA's only durable
  import record.
- **ICEH** (`instance_dataset_iceh/imports/`): the leaner twin — Current
  card plus History table; two-step wizard (upload zip + preview → review);
  needs_review cards show the skip counters/samples.
- The old `ImportWizardShell` (`_import_wizard/`) descriptor machinery is
  gone (2026-08-17): every wizard — the three import families and the
  results-package wizard — is now an ephemeral modal.
- Destructive data deletes require typing "yes please delete" in all three
  families.
- Display caches: HMIS items keyed
  `versionId_indicatorMappingsVersion_structureLastUpdated`, with the HMIS
  schema hash in the uniqueness keys; HFA/ICEH use server-provided cache
  hashes from the T1 SSE store.

## Run capture seam

Datasets reach a project only as results-package run inputs: the wizard's
choose-data step drives the per-family capture functions
(`computeDataset*RunCapture` in `server/db/project/datasets_in_project_*.ts`,
called from `generate_run/prepare_inputs.ts`). Each capture validates and
records the staleness metadata FIRST (hash-after-export could mask a
concurrent instance import), then `COPY`s main-DB data to the run's tmp dir
(`DatasetCsvTarget` names the SAME file by its Postgres-container path and its
Deno path), and returns the rows the run mirrors into its inputs plus the
dataset version stamps the manifest records. No project table is written.

- The run's input mirrors are the metadata twins of the CSVs:
  `hfa_*_snapshot.json` (HFA, service-category-scoped),
  `iceh_indicators_snapshot.json`, and `indicators.json` (the whole common
  dictionary, resolved at capture). Modules read `../datasets/{type}.csv`; PO
  metadata reads the manifest's indicator catalog, built from the mirrors at
  finalize. The frozen project-DB `calculated_indicators_snapshot` table is
  read by nothing and drops with PLAN_RESULTS_RUNS Phase 4.
- **Project-level attach/staleness UI is gone**: the dirty cascade and the
  per-dataset staleness indicators died with the Data tab.

## Traps

- **`COUNT(*)` returns a string** through the worker/bulk connections (no int8
  parser configured) — always `Number()` it. Older staging results persisted
  `finalStagingRowCount` etc. as JSON strings; comparisons must coerce.
- The DHIS2 URL-length guard measures a URL missing two dimensions (~40–50 chars
  short of the real request).
- JS row validation is narrower than the staging tables' CHECK constraints (e.g.
  period year bounds), so one out-of-range row aborts the whole batch with a raw
  Postgres error instead of a counted drop.

## Open items (deferred findings + standing reform)

- select_multiple missingness resolved 2026-07-06 (see Staging); data staged
  before the change keeps the old explicit-`0` rows until re-imported.
- DHIS2 credentials (password) remain plaintext at rest in `step_1_result` (API
  projection is redacted; at-rest encryption is a pending ruling — same item in
  SYSTEM_05).
- HFA: the final staging table is LOGGED while the dict tables are UNLOGGED
  (mixed crash durability); duplicate CSV columns die on a cryptic PK error.
- `getCsvDetails` (both CSV families' header parse) reads the whole file into memory for
  headers; the streaming variant's header read is one 64 KB `file.read()` (wide
  XLSForm exports / short reads → confusing failure).
- Ethiopian-calendar period math in `step_2_dhis2.tsx` assumes 12 months (no
  Pagume); untranslated strings in the delete flows and Period/TimeIndex
  selectors; `facilityOwnwershipsToInclude` typo is the persisted canonical
  field (fixing it = stored-JSON migration).
- **Decoupling — heal the db→worker inversion.** The run spawn sites
  (`dataset_*_import_runs.ts`) still live in `server/db/instance/` and spawn
  Web Workers (the directory lie survived the consolidation; the fixed
  staging-table names did not).
- **Decoupling — dual CSV parsers.** papaparse vs panther `parseCSV`; evaluate
  consuming panther's `_100_csv`/`_232_csv` (panther's modules are whole-string
  today — adoption would mean adding streaming there first).

### HFA follow-on work (from the retired HFA plans)

- **Sierra Leone R1 re-import (operational, not code).** Re-upload the
  corrected 365-row weights file (`HFA_SL_R1_weigths_NEW.csv`; `id_fac_txt`
  is the safe key), fix the instance's `ind274` from `binary`/`sum` to
  `numeric`/`avg`, re-import R1 with filter `id_resp_consent equals 1`, dedup
  `first`, overrides 433 → row 60 and 442 → row 430, rerun M10. Oracle: the
  six vaccine indicators must match `vaccine_availability_viviane.do`
  (measles 0.94505 N=364, penta 0.92603 N=365, bcg 0.93699, polio 0.93681,
  pcv 0.95068, hpv 0.89779).
- **Remove dataset rows in-platform** (M, app-only). Hard-delete rows after
  ingest so ODK→platform direct upload stays usable (settled: hard-delete).
  Open: UI entry point, selection model, whether a delete mints a new dataset
  version (almost certainly — cache-key advance + history), and the
  re-validation/weights recompute trigger. Touches
  `worker_routines/import_hfa_data_csv/`, `dataset_hfa.ts`, version handling +
  Valkey invalidation.
- **Sentinel Layer 1 — import review/correction UI** (M, app-only). The
  deferred human-correction step: a review screen between staging and
  finalize reading the staged classification from the per-run dict-values
  staging table (in `main`, so an ordinary `mainDb` route can read/correct
  it), a class dropdown to reclassify, corrections persisted back to staging
  so finalize promotes them. Work: get/update staged-sentinels routes + a new
  wizard step.
- **Parked, on-demand:** upload bugs (admin areas / facilities / weights) —
  revisit with concrete repros; `"Other"` (`-96`) coding with AI —
  exploratory.
