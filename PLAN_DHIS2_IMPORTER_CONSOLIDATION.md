# Plan — Import consolidation: config-on-client, run-on-server, for HMIS + HFA + ICEH

**Status (2026-07-16): complete plan, nothing built. All four phases are
mechanically specced** (B/C specs verified against a full inventory of the
HFA/ICEH machinery, 2026-07-16). Supersedes two deleted plans (both in git
history): PLAN_DHIS2_IMPORTER.md's §9 (Phase 5, CSV re-flow — everything it
ruled: launch-and-observe, the conditional review gate,
hold-with-diagnostics, survives here as run states instead of attempt
states; the gate rationale is restated in full in §2), and
PLAN_IMPORTER_CONSOLIDATION.md (the dormant "toolkit" plan — this plan
deletes the attempt machinery it abstracted over, and absorbs its
philosophy: extract shared parts only against concrete consumers, never an
engine). Designed with Tim 2026-07-15/16.

**Hand-off: "implement this" means implement all four phases, A → B → C → D,
in order.** Each phase has its own verification section which must pass
before the next phase begins. Phases stay severable — if work stops after
any phase, the completed families are coherent and the remaining families
keep working untouched on their old machinery.

## 0. For the implementing agent

- **Scope:** this repo only — no panther or wb-fastr-modules changes. Commit
  to the current branch (one commit per phase is a good shape). Nothing
  deploys until Tim runs the deploy.
- **Read first:** DOC_API_ROUTES.md (registry-as-contract),
  DOC_DB_ACCESS_LAYER.md (SQL-safety rule — no parameterized table names),
  PROTOCOL_APP_MIGRATIONS.md, DOC_WORKER_ROUTINES.md (READY handshake,
  teardown contract), DOC_TASK_EXECUTION_DIRTY_STATE.md,
  DOC_STATE_RULES.md + DOC_STATE_MGT_INSTANCE.md (wizard state is
  component-local), PROTOCOL_UI_STRUCTURE. SYSTEM_06_ingestion.md describes
  the machinery being replaced (its "HMIS DHIS2 import runs" section is the
  authority on the runs plane this plan extends).
- **Orientation — the three families today:**
  - HMIS: runs plane = `server/db/instance/dataset_hmis_import_runs.ts` +
    `server/worker_routines/import_hmis_data_dhis2/` (worker, scheduler,
    dispatch). Attempts plane (dies in Phase A) = the "Upload workflow"
    routes in `lib/api-routes/instance/datasets.ts` + their handlers in
    `server/routes/instance/datasets.ts` + client
    `instance_dataset_hmis_import/`. Imports surface =
    `client/src/components/instance_dataset_hmis/dhis2_run/`. CSV
    staging/integration internals (wrap, never rewrite) =
    `server/worker_routines/stage_hmis_data_csv/` +
    `server/worker_routines/integrate_hmis_data/`.
  - HFA: singleton `hfa_upload_attempts` row; lifecycle in
    `server/db/instance/dataset_hfa.ts`; two workers
    (`worker_routines/stage_hfa_data_csv/`, `integrate_hfa_data/`), fixed
    staging-table names in `server/exposed_env_vars.ts`; client wizard
    `instance_dataset_hfa_import/`, sidebar in `instance_dataset_hfa/`.
    Outcome plane = `hfa_time_points` (imported_at stamp) + `hfa_data`/
    `hfa_variables`/`hfa_variable_values`.
  - ICEH: singleton `iceh_upload_attempts` row; everything in
    `server/db/instance/dataset_iceh.ts`; **no worker** — ingest is a
    fire-and-forget un-awaited promise (`stageAndIntegrateIcehData`, called
    without await from `updateDatasetIcehUploadAttemptStep2`); client wizard
    `instance_dataset_iceh_import/` (the only consumer of the shared
    `_import_wizard/import_wizard_shell.tsx`), sidebar in
    `instance_dataset_iceh/`. Outcome plane = `iceh_indicators` +
    `iceh_data` (cumulative upsert, no versions).
- **Line anchors in this plan drift** (the repo is under active parallel
  work) — treat every `file:line` as a hint; re-grep the symbol before
  editing.
- **Verification:** each phase ends with a Verify section (typecheck +
  `./validate_migrations` + a harness + live click-throughs). Live
  click-throughs run against the dev instance (`./run`, or `deno task dev` +
  client dev server; server has no --watch — restart it after server
  changes). CSV/zip phases need no DHIS2 access — drive them with synthetic
  files.

**Tim's values ruling the design (2026-07-16):** simplicity, maintainability,
robustness — explicitly NOT more code/features. The end state must be
net-negative lines. Phase D's definition of done includes: the rewritten
SYSTEM_06 ingestion doc is SHORTER than today's, or we've failed the brief.

## 1. The four invariants (the whole system)

1. **Every import is a run row — in its family's own table.** No second
   lifecycle. The attempt machinery (draft rows, step-resync routes,
   babysat staging) is deleted family by family, not abstracted over.
2. **At most one import running per family, ever.** Enforced the proven
   way: a partial unique index on the family's runs table
   (`WHERE status = 'running'`), the same single-running claim
   `dataset_hmis_import_runs` uses today (migration 057). Cross-family
   imports may overlap (disjoint data planes — HFA never blocked HMIS
   anyway; verified: worker_store keys are family-scoped, no cross-family
   guard exists today); within a family, never.
3. **Nothing persists before launch.** Wizard state is client-local
   signals in a modal (single-user by construction). The only pre-launch
   server artifact is the uploaded file itself — a temp upload keyed by
   token, orphan-swept if never launched. Abandoning a wizard is a no-op
   by construction: zombie drafts stop being *possible* rather than being
   handled.
4. **Runs are operations; outcomes live in each family's own plane.**
   HMIS: the `dataset_hmis_versions` table (runs carry `version_id`).
   HFA: the time-point plane (`hfa_time_points.imported_at` stamp + the
   per-time-point data tables); the run row keeps the staging diagnostics
   that today die with the deleted attempt row. ICEH: the cumulative
   `iceh_indicators`/`iceh_data` store; the run row is the only durable
   import record (today's machinery keeps NO import history at all).
   Runs link to outcomes; History rows click through where an outcome
   detail exists. Never merged.

## 2. Ruled decisions (2026-07-15/16, not open)

- **Separate runs tables per family. No mega-table, no rename.** The
  diagnostics ARE the schema: HMIS runs carry pairs/progress/shadow/
  dhis2_url; an HFA file import shares none of that. One table would be
  nullable-column soup. `dataset_hmis_import_runs` is genuinely
  HMIS-only and keeps its name.
- **Reuse is contracts and components, not storage and not a framework.**
  Shared: worker-contract helpers (progress-write throttling, the
  finalize/reconcile retry pattern, error classification, boot-sweep
  registration, teardown rules) and client components (modal wizard
  shell pattern, upload step, review-step frame, run-row/status
  rendering, history table). NOT shared: SQL (per-family DB functions
  stay thin and family-owned — also keeps the DOC_DB_ACCESS_LAYER
  SQL-safety rule intact: no parameterized table names), and NO
  config-driven wizard engine — three plain wizards sharing parts beat
  one clever abstraction (variants are bounded at four, forever).
  (The existing `_import_wizard/import_wizard_shell.tsx` descriptor
  shell — one consumer, ICEH — dies in Phase C with its consumer.)
- **Asymmetry by design.** HMIS is the main event (DHIS2 primary source,
  huge, always updating) and gets the full machine: queue, scheduler,
  needs_review, per-pair DHIS2 + single-transaction CSV. HFA and ICEH
  are small single-file families and get deliberately smaller machines:
  one-at-a-time claim + **explicit refusal** ("an import is running —
  wait"), NO queue, NO scheduler/tick involvement, NO Future tab — just
  a Current card and a History table. If refusal ever genuinely hurts,
  a queue can be added then, not speculatively now.
- **CSV keeps single-transaction integration** in every family. Per-pair
  atomicity is right for DHIS2 because pairs are independent fetch
  units; a file is one coherent authored artifact. The run model changes
  who schedules and displays the work, not the atomicity that's right
  for the source.
- **The §9 conditional review gate stays, generalized** (Tim's earlier
  ruling, unchanged): clean staging → auto-integrate unattended; dropped
  rows → run holds in `needs_review` with diagnostics + "Integrate
  anyway" / "Discard" actions; zero staged rows → loud `error`. Files
  are user-authored; a bad mapping silently dropping 90% of rows must
  not merge the surviving 10% unattended. **The clean condition is
  family-specific** and defined mechanically in each phase (HMIS A4,
  HFA B4, ICEH C4) — the principle is one rule, the counters differ.
- **One deliberate change from §9:** a `needs_review` run RELEASES the
  single-running slot instead of occupying it. §9 said a held attempt
  occupies the CSV slot; under the runs model that would let one
  unreviewed CSV block scheduled DHIS2 imports indefinitely —
  unacceptable now both share a lane. Made safe per family: HMIS by
  per-run staging tables (A4); HFA likewise (B4); ICEH by deterministic
  re-ingest from the retained zip (C4). "Integrate anyway" re-claims the
  slot (HMIS: queues if busy; HFA/ICEH: explicit refusal if busy).

## 3. End-state (what exists when Phase D closes)

- Per family: one runs table, one worker (wrapping that family's
  existing staging/validation/integration internals untouched), one
  modal wizard, one Current/History surface (HMIS also has Future).
- Deleted: `dataset_hmis_upload_attempts`, `hfa_upload_attempts`,
  `iceh_upload_attempts`; every step-resync route; the cross-guard
  lattice; all sidebar draft/staging/integrating attempt cards and
  their polling; the resumable-wizard client logic;
  `_import_wizard/import_wizard_shell.tsx`; the fixed staging-table
  name constants; HMIS "View previous imports" as an entry point
  (content reachable from History click-through; versions tables and
  `_import_information.tsx` unchanged).
- The failure-mode knowledge from the Phase 3/4 reviews (claim races,
  status-guarded writes, finalize reconciliation, crash sweeps,
  teardown) lives once, in the shared contract helpers.

---

## Phase A — the machine + HMIS CSV (the big one; all design risk lives here)

HMIS CSV import becomes a run in the existing `dataset_hmis_import_runs`
table. The HMIS attempt machinery is deleted. This is where the shared
contract helpers and shared wizard components get extracted — against a
second concrete consumer, not speculatively.

### A1. Migration 063 + base schema (`_main_database.sql`)

(061/062 were consumed by the credential-store consolidation on
2026-07-16 — use the next free number at build time; B and C add their
own migrations after it.)

`dataset_hmis_import_runs` (057/058 shape, verified 2026-07-16):

- `ADD COLUMN source text NOT NULL DEFAULT 'dhis2' CHECK (source IN
  ('dhis2', 'csv'))`, then `ALTER COLUMN source DROP DEFAULT` (backfill
  via the default; inserts thereafter explicit — no default arguments).
- `dhis2_url` → nullable (CSV runs have none). Enforce the pairing in
  code at the write boundary (dhis2 → required, csv → NULL), same
  pattern as `validateScheduleFields`.
- `ADD COLUMN csv_config text` (nullable) — the CSV launch payload:
  `{ uploadToken, fileName, mappings }` as JSON. Deliberately NOT folded
  into `selection` (that column is the DHIS2 selection domain; keep the
  unions honest).
- Status CHECK gains `'needs_review'` (the 058 pattern: drop + re-add
  the constraint with the new value).
- `DROP TABLE IF EXISTS dataset_hmis_upload_attempts` + remove from base
  schema (base-schema-born at `_main_database.sql:412` — confirm no older
  migration creates it; if one does, the unconditional `IF EXISTS` drop
  still leaves fresh-DB and deployed-DB schemas identical, which is what
  `./validate_migrations` checks).
- Run `./validate_migrations`.

Pair counters (`total_pairs` etc.) stay 0 for CSV runs — pair columns
are DHIS2 diagnostics; CSV diagnostics ride `run_stats`/`csv_config` and
the staging result on the version row, as today.

### A2. Types + schemas (`lib/`)

- `DatasetHmisImportRunSummary` (`lib/types/dataset_hmis_import.ts`):
  add `source: "dhis2" | "csv"`, optional `csvFileName`, status union
  gains `"needs_review"`. Zod schemas in
  `lib/api-routes/instance/datasets.ts` follow (discriminated where the
  wire shape forks).
- New `DatasetHmisCsvRunConfig` type (uploadToken/fileName/mappings) —
  reuse the existing step-2 mappings type verbatim; do not redesign the
  mapping shape.
- Delete with the routes (A5): `DatasetUploadAttemptDetail`,
  `DatasetUploadStatusResponse`, `DatasetUploadAttemptSummary`, and the
  `uploadAttempt` field on `DatasetHmisDetail`
  (`lib/types/dataset_hmis.ts`).

### A3. Temp uploads (invariant 3's server half)

- The CSV file lands exactly as today (same upload plumbing/endpoint the
  step-1 wizard uses — **verify the exact keying at build time**), but
  keyed by a generated upload token instead of the single attempt row.
- Orphan sweep: on `db_startup` (alongside the existing stale-run
  sweep), delete temp uploads older than 24 h (builder default) that no
  run row references.
- Wizard parse/validate endpoints are **stateless**: `parse headers for
  uploadToken` (feeds the mappings step; reuse the existing step-2
  parsing logic as-is, re-exposed without the attempt row) — nothing is
  persisted by these calls.

### A4. The CSV run worker (`server/worker_routines/import_hmis_data_csv/`)

Wraps — does not rewrite — the internals of `stage_hmis_data_csv` and
`integrate_hmis_data`. Two legs, one worker module, registered under the
existing `"hmis"` worker key:

- **Stage leg** (run status `running`): stage the file, evaluate the
  clean condition server-side. **HMIS clean condition (the exact §9
  rule):** every `validation.*.rowsDropped` = 0 AND
  `finalStagingRowCount > 0`.
  - Clean → proceed straight to the integrate leg (auto-integrate,
    no human).
  - Dropped rows → write diagnostics to the run, flip to
    `needs_review`, **release the claim** (§2's ruled change), exit
    worker.
  - Zero staged rows → `error`, loud.
- **Integrate leg**: the existing single-transaction CSV integration
  (version minted MAX(id)-inline as today, ledger writes unchanged,
  scoped-delete interplay unchanged).
- **Per-run staging table** (`staging_hmis_csv_run_{runId}` or an
  equivalent suffix scheme): staging output must survive a
  `needs_review` hold across other imports running in between, and be
  dropped on integrate/discard/sweep. This replaces the fixed-name
  staging table assumption — it is the one piece of new mechanism in
  the whole phase, and what makes releasing the slot safe. Delete the
  HMIS fixed staging-table-name constants once nothing reads them.
- Contract compliance throughout: READY handshake, status-guarded
  progress writes (the 2 s throttle helper), finalize on every exit
  path, boot sweep covers `running` CSV runs (flip to `error`, drop the
  staging table), workers never self-close.
- **This is where the shared helpers get extracted**: pull the
  throttled-progress writer, finalize-retry shape, error classification,
  and sweep registration out of `import_hmis_data_dhis2/` into shared
  worker-contract helpers consumed by both workers (and by B/C's workers
  later). Extraction with two concrete consumers, no speculation.

### A5. Routes (registry-first, per DOC_API_ROUTES)

Deleted (registry + handlers + client callers — the "Upload workflow"
block in `lib/api-routes/instance/datasets.ts`, names verified
2026-07-16): `createDatasetUploadAttempt`, `setDatasetUploadSourceType`,
`getDatasetUpload`, `getDatasetUploadStatus`, `deleteDatasetUploadAttempt`,
`uploadDatasetCsv`, `updateDatasetMappings`, `updateDatasetStaging`,
`finalizeDatasetIntegration`.
`getDatasetHmisDetail` loses its `uploadAttempt` field.

Added:

- `launchDatasetHmisCsvRun` — validates config at the boundary
  (mappings shape, uploadToken exists), then the same
  launch-or-enqueue fork as DHIS2 (C6: explicit queue, never silent;
  the wizard's review step carries the fork copy). Queued CSV runs are
  drained by the existing tick FIFO — **the tick's queued-fire path
  gains a by-source branch**: CSV fires need no credentials and no
  unattended gate (the file is already on the server and user-authored
  consent happened at launch).
- `resolveDatasetHmisCsvReview` — body `{ runId, action:
  "integrate_anyway" | "discard" }`. Integrate-anyway re-claims the
  slot (or queues); discard flips to `cancelled` + drops the staging
  table + deletes the temp upload.
- Stateless `parseDatasetHmisCsvHeaders` (A3) for the mappings step.

### A6. Cross-guard deletion

- `countActiveCsvAttempts` (`dataset_hmis_import_runs.ts:176`) and ALL
  five call sites — deleted: the two scheduler gates (`scheduler.ts:362`,
  `:531`), the launch read-guard (`dataset_hmis_import_runs.ts:275`),
  and the two **post-claim re-checks** (launch `:300`, queued-fire
  `:425`). The re-checks deserve emphasis: they exist solely to defend
  against the cross-table race (a CSV attempt claiming between the
  read-guard and the runs-table INSERT). Once CSV imports live inside
  the same partial-unique-index claim, that race is structurally
  impossible — the whole two-phase guard ceremony deletes, not just the
  guard calls. (Zombie states stop being possible rather than being
  handled — invariant 3's argument, applied to concurrency.)
- The attempt-side guards in `dataset_hmis_import_runs.ts` (the "CSV
  staging/integration and windowed deletion call this before claiming"
  comment block) — the CSV halves die; **windowed deletes keep a
  guard**, now a single runs-table check instead of runs + attempts.
- `db_startup`'s attempt sweep → deleted (run sweep already exists;
  temp-upload sweep added per A3).

### A7. Client

- New CSV wizard: modal, `openComponent` + `getStepper` +
  `StepperChipsWithTitles`, client-local signals, the no-overlay hard
  rule (inline confirms/errors only). Steps: **Upload** (reuse the
  existing step-1 upload component against a fresh uploadToken) →
  **Mappings** (reuse step-2's UI, fed by the stateless parse endpoint)
  → **Review & launch** (shared review frame; live Start-vs-Queue fork,
  same as DHIS2 step 5; pair-free summary: file name, row count,
  mappings summary). Launch → close → land on Current.
- Current tab renders CSV runs: staging progress (existing progress
  components relocated), and the `needs_review` card — step-4's
  diagnostics render relocated here, with Integrate-anyway (inline
  confirm) and Discard.
- History gains a Source column (DHIS2/CSV) — rows click through to
  version detail where one exists (the History↔versions navigation
  dedup starts here; "View previous imports" retires in Phase D).
- Sidebar (`instance_dataset_hmis/index.tsx`): "Upload CSV file" button
  now opens the modal wizard; the draft/staging/integrating/complete
  attempt cards and their 5 s poll die (Current tab + existing queued
  count + attention banner are the signal set — same reasoning as the
  DHIS2 card removal, which Tim ruled).
- Deleted client code: `instance_dataset_hmis_import/` (verified file
  list: index, step_1_csv, step_2_csv, step_3, step_4_csv,
  progress_staging_csv, progress_integrating, progress_complete) —
  reusable pieces (upload widget, mappings UI, diagnostics render,
  progress bars) move to their new homes rather than being rewritten.
- Wizard-shell/naming note (builder): the imports-surface folder is
  currently `dhis2_run/`; with a CSV wizard moving in, renaming the
  folder (e.g. `imports/`) is consistent with the ruled source-neutral
  naming — do it in this phase or not at all (no half-renames).

### A8. Verify (Phase A)

1. `deno task typecheck` + `./validate_migrations`.
2. Harness (rolled-back txn where possible): claim exclusion CSV↔DHIS2
   (launch CSV while DHIS2 run active → queued, and vice versa);
   needs_review releases the slot (launch DHIS2 import while a CSV
   hold exists → runs); discard drops the per-run staging table;
   orphan sweep deletes an unreferenced temp upload and spares a
   referenced one.
3. Live click-throughs (synthetic CSVs, no DHIS2 needed): clean CSV →
   auto-integrates unattended, the version and ledger rows land,
   History row links the version; dirty CSV (bad mapping) →
   needs_review card with correct dropped-row diagnostics →
   Integrate anyway completes; zero-row CSV → loud error; cancel
   mid-staging keeps nothing.
4. SYSTEM_06's HMIS-CSV sections rewritten to the run model (shorter).

---

## Phase B — HFA (the same shape, smaller machine)

HFA import becomes a run in a new `hfa_import_runs` table; the singleton
`hfa_upload_attempts` machinery is deleted. Facts verified 2026-07-16
against `dataset_hfa.ts`, the two HFA workers, and the client wizard.

### B1. Migration 064 + base schema

New table `hfa_import_runs`:

```sql
CREATE TABLE hfa_import_runs (
  id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  triggered_by text,
  csv_config text NOT NULL,      -- { csvUploadToken, csvFileName,
                                 --   xlsFormUploadToken, xlsFormFileName,
                                 --   mappings: HfaCsvMappingParams }
  time_point text NOT NULL,      -- outcome linkage (denormalized from mappings)
  status text NOT NULL CHECK (status IN
    ('running', 'needs_review', 'complete', 'error', 'cancelled')),
  error text,
  progress text,
  diagnostics text,              -- DatasetHfaCsvStagingResult JSON
  n_rows_integrated integer,
  started_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz
);
CREATE UNIQUE INDEX idx_hfa_import_runs_single_running
  ON hfa_import_runs ((true)) WHERE status = 'running';
```

No `queued` status, no trigger column (manual-only, no scheduler), no
version_id (HFA's outcome plane is the time point — invariant 4). The
run row now DURABLY keeps the staging diagnostics that today die when
the completed attempt row is deleted.

- `DROP TABLE IF EXISTS hfa_upload_attempts` + remove from base schema.
  Note: migration `023_hfa_schema_redesign.sql` re-creates it with
  `CREATE TABLE IF NOT EXISTS` on a fresh DB (023 stays unrewritten per
  PROTOCOL_APP_MIGRATIONS) — the unconditional `IF EXISTS` drop in 064
  runs after 023 and removes it, so fresh-DB and deployed-DB schemas
  converge (same pattern migration 061 used for the credentials table).
  No data migration: attempt rows are transient wizard state; an
  in-flight import at deploy time dies with the restart (existing
  delete-and-relaunch note).
- Run `./validate_migrations`.

### B2. Types + schemas

- New `HfaImportRunSummary` type (id, status, timePoint, csvFileName,
  diagnostics?, nRowsIntegrated?, error?, startedAt, endedAt,
  triggeredBy) in `lib/types/dataset_hfa_import.ts`; Zod schemas in
  `lib/api-routes/instance/datasets.ts`.
- `HfaCsvMappingParams` (`{facilityIdColumn, timePoint}`) reused
  verbatim as the mappings shape — do not redesign.
- `DatasetHfaCsvStagingResult` reused verbatim as the diagnostics shape,
  EXCEPT the three staging-table-name fields become the per-run names
  (B4).
- Delete with the routes (B5): `DatasetHfaUploadAttemptDetail`,
  `DatasetHfaUploadStatusResponse`, `DatasetHfaUploadAttemptSummary`,
  `DatasetHfaUploadAttemptStatus`, and the `uploadAttempt` field on
  `DatasetHfaDetail` (`lib/types/dataset_hfa.ts:21`).

### B3. Temp uploads

Same mechanism as A3, two files per run: the CSV and the XLSForm
(`.xlsx`, must contain 'survey' + 'choices' sheets — today's step-1
validation, now run statelessly at parse/launch time). Both keyed by
upload tokens, both covered by the A3 orphan sweep, both deleted on
discard/complete.

### B4. The HFA run worker (`server/worker_routines/import_hfa_data_csv/`)

One worker module (registered under the existing `"hfa"` worker key)
wrapping — not rewriting — the internals of the two existing HFA
workers. The stage internals (XLSForm parse, CSV stream + wide→long
pivot, `select_multiple` expansion, facility validation, dictionary
build, sentinel classification) and the integrate internals (the single
`mainDb.begin` transaction stamping `hfa_time_points.imported_at`,
delete + insert per time point) move into plain functions the new
worker calls; the old worker entry files die.

- **Stage leg**: stage into per-run tables, evaluate the clean
  condition. **HFA clean condition:**
  `(nRowsInvalidMissingFacilityId + nRowsInvalidFacilityNotFound +
  nRowsDuplicated) = 0 AND nRowsTotal > 0` — exactly the counters the
  old step-4 warning banner summed, now enforced server-side. (Note the
  units: the three drop counters are facility-row counts; `nRowsTotal`
  is the long-format value count. That asymmetry is fine for the gate —
  zero drops is zero drops.)
  - Clean → integrate leg directly (auto-integrate).
  - Drops → diagnostics onto the run, `needs_review`, release claim,
    exit.
  - `nRowsTotal = 0` → `error`, loud.
- **Integrate leg**: the existing single transaction, unchanged
  semantics (time-point stamp, per-time-point delete + insert).
- **Per-run staging tables**: replace the three fixed names from
  `exposed_env_vars.ts` (`uploaded_hfa_data_staging_ready_for_integration`,
  `uploaded_hfa_dictionary_vars_staging`,
  `uploaded_hfa_dictionary_values_staging`) and the two intra-worker
  temps with `_run_{runId}`-suffixed names recorded in the run's
  diagnostics JSON. Delete the fixed-name constants. Dropped on
  integrate/discard/sweep.
- Contract compliance via the Phase A shared helpers: READY handshake,
  throttled status-guarded progress writes, finalize on every exit
  path, boot sweep flips stranded `running` HFA runs → `error` + drops
  their staging tables, workers never self-close.
- Launch-time validations (moved from the old step functions, all
  stateless): `facilities_hfa` non-empty (old create-attempt guard),
  timePoint exists in `hfa_time_points` (old step-2 guard), XLSForm
  sheets present (old step-1 guard), reserved var name `weight`
  rejected (stays inside the stage internals).

### B5. Routes

Deleted (registry + handlers + client callers, names verified
2026-07-16): `createDatasetHfaUploadAttempt`, `getDatasetHfaUpload`,
`getDatasetHfaUploadStatus`, `deleteDatasetHfaUploadAttempt`,
`uploadDatasetHfaCsv`, `updateDatasetHfaMappings`,
`updateDatasetHfaStaging`, `finalizeDatasetHfaIntegration`.
`getDatasetHfaDetail` loses its `uploadAttempt` field (its cache hash is
safe — `computeHfaCacheHash` reads only time-point rows, verified).

Added (all `can_configure_data` except the GET, which follows the
family's existing read guard):

- `launchDatasetHfaCsvRun` — body `{ csvUploadToken, xlsFormUploadToken,
  mappings }`; runs the B4 launch-time validations, claims via INSERT
  (partial unique index), spawns the worker. If a run is already
  running: **explicit refusal** (no queue) — "An HFA import is already
  running — wait for it to finish."
- `getDatasetHfaImportRuns` — current + recent runs for the
  Current/History surface.
- `resolveDatasetHfaReview` — body `{ runId, action: "integrate_anyway"
  | "discard" }`. Integrate-anyway re-claims (refusal if busy); discard
  → `cancelled` + drop staging tables + delete temp uploads.
- Stateless `parseDatasetHfaCsvHeaders` — body `{ csvUploadToken,
  xlsFormUploadToken }`; returns CSV headers (+ XLSForm sheet check
  errors) for the mappings step. Reuses today's step-1 parse internals.

Completion keeps firing `notifyInstanceDatasetsUpdated` (today's step-4
onComplete), from the worker's finalize path.

### B6. Guard deletion

- `getWorker("hfa")` pre-checks and the singleton-row conditional-UPDATE
  claims in `dataset_hfa.ts` die with the attempt functions; the runs
  table's partial unique index is the only claim.
- No cross-family guards exist for HFA (verified) — nothing else to
  unpick.

### B7. Client

- Modal wizard (shared components from A7): **Upload** (two
  `FileUploadSelector`s: CSV + XLSForm — today's step_1 relocated) →
  **Mappings** (today's step_2 UI relocated verbatim: `facilityIdColumn`
  Select over parsed headers + `timePoint` Select over
  `instanceState.hfaTimePoints`; time points are created on the
  time-points page, not here) → **Review & launch** (file names, header
  count, time point; Start button only — no queue fork; refusal error
  renders inline).
- HFA page sidebar (`instance_dataset_hfa/index.tsx`): "Start new
  import" opens the modal; the singleton attempt card + its 5 s
  `getDatasetHfaDetail` poll die. In their place: a Current card
  (running progress / needs_review with relocated step-4 diagnostics
  render + Integrate-anyway/Discard) and a History list (time point,
  file, status, rows integrated, date; click-through shows the run's
  diagnostics). No tabs — no Future.
- Delete `instance_dataset_hfa_import/` (verified file list: index,
  step_1, step_2, step_3, step_4, progress_staging,
  progress_integrating, progress_complete); step_2's mapping form and
  step_4's diagnostics render relocate, the rest dies ("Remove completed
  upload form" ceases to exist — History holds outcomes).

### B8. Verify (Phase B)

1. `deno task typecheck` + `./validate_migrations`.
2. Harness: second launch while running → explicit refusal;
   needs_review releases the claim and a new launch succeeds while the
   hold exists; discard drops the per-run staging tables and temp
   uploads; boot sweep flips a stranded running row.
3. Live click-throughs (synthetic HFA CSV + minimal XLSForm): clean
   file → auto-integrates, `hfa_time_points.imported_at` stamped, data
   tables populated, History row present with diagnostics; dirty file
   (unknown facility ids) → needs_review with the three drop counters →
   Integrate anyway completes; delete-data flows unchanged.
4. SYSTEM_06's HFA sections rewritten to the run model (shorter).

---

## Phase C — ICEH (smallest; proves marginal cost ≈ 0)

ICEH import becomes a run in a new `iceh_import_runs` table; the
singleton `iceh_upload_attempts` machinery is deleted. ICEH gets a real
worker for the first time — today's ingest is an un-awaited in-process
promise, and a server restart mid-ingest permanently wedges the
singleton row (`status_type` guards block create/delete/step2 forever
with no recovery path). The run model + boot sweep fixes that defect
outright. Facts verified 2026-07-16 against `dataset_iceh.ts` and the
client.

### C1. Migration 065 + base schema

New table `iceh_import_runs`:

```sql
CREATE TABLE iceh_import_runs (
  id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  triggered_by text,
  zip_config text NOT NULL,      -- { zipUploadToken, zipFileName }
  status text NOT NULL CHECK (status IN
    ('running', 'needs_review', 'complete', 'error', 'cancelled')),
  error text,
  progress text,
  diagnostics text,              -- IcehStagingResult + final counts JSON
  n_rows_integrated integer,
  started_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz
);
CREATE UNIQUE INDEX idx_iceh_import_runs_single_running
  ON iceh_import_runs ((true)) WHERE status = 'running';
```

No versions table and none created — ICEH's outcome plane is the
cumulative `iceh_indicators`/`iceh_data` store (invariant 4); the run
rows are ICEH's first-ever durable import history.

- `DROP TABLE IF EXISTS iceh_upload_attempts` + remove from base schema.
  Migration `037_iceh_tables.sql` re-creates it on a fresh DB (037 stays
  unrewritten) — the unconditional drop in 065 runs after and removes
  it, same pattern as B1/061.
- **Cache-hash re-derivation (required, verified):** `getIcehCacheHash`
  (`dataset_iceh.ts:46`) currently hashes the ATTEMPT row's
  `date_started:status_type` plus data counts. Re-derive from the latest
  `iceh_import_runs` row (`id:status`) plus the same data counts —
  otherwise the client display cache never invalidates after imports.
- Run `./validate_migrations`.

### C2. Types + schemas

- New `IcehImportRunSummary` type in `lib/types` + Zod schemas in
  `lib/api-routes/instance/iceh.ts`.
- `IcehStep1Result` (zip preview) and `IcehStagingResult` reused
  verbatim.
- Delete with the routes (C5): `IcehUploadAttemptDetail`,
  `IcehUploadAttemptStatus`, and the attempt summary on
  `getDatasetIcehDetail`'s response type.

### C3. Temp uploads

The zip lands via the same asset-upload plumbing, keyed by upload token
(A3 mechanism), orphan-swept, deleted on discard/complete. The zip is
RETAINED while a run is in `needs_review` — it is what "Integrate
anyway" re-ingests from (C4).

### C4. The ICEH run worker (`server/worker_routines/import_iceh_data/`)

One worker module (new `"iceh"` key added to `WorkerKey` in
`worker_store.ts`) wrapping the internals of `stageAndIntegrateIcehData`
— the zip extract, CSV/xlsx parse, per-row validation, and the single
`mainDb.begin` transaction (delete-by-uploaded-codes + upsert) move into
plain functions; the fire-and-forget call site dies.

- **Stage leg** (in-memory, as today — ICEH is small; no staging
  tables): parse + validate, then evaluate the clean condition.
  **ICEH clean condition:** `nRowsSkippedUnknownStrat = 0 AND
  validDataRows > 0`. Deliberately family-specific:
  `nRowsSkippedMissingEstimate` does NOT hold the run — "NA" estimates
  are a normal feature of ICEH Retriever exports, not a mapping error;
  they are reported in the diagnostics but never block. Unknown strats,
  by contrast, mean the file doesn't match the strat vocabulary and a
  silent partial merge is exactly what the §9 gate exists to prevent.
  - Clean → integrate leg directly.
  - Unknown-strat drops → diagnostics (counts + the ≤5 raw samples)
    onto the run, `needs_review`, release claim, exit. Because staging
    is in-memory, nothing persists across the hold except the retained
    zip: **"Integrate anyway" re-claims the run and re-runs the full
    ingest from the zip with the gate skipped** — deterministic, and
    seconds at ICEH scale. (No per-run staging tables for ICEH; this is
    the simplicity trade ruled in §2.)
  - Zero valid rows → `error`, loud.
- **Integrate leg**: the existing single transaction, unchanged
  (cumulative upsert; country-ISO pre-check from today's step-2 moves
  to launch validation).
- Contract compliance via the shared helpers: READY handshake,
  throttled progress writes (fixes today's frozen 0% progress),
  finalize on every exit path, boot sweep flips stranded `running` runs
  → `error` (this is the wedged-singleton fix), workers never
  self-close.
- Completion fires `notifyInstanceDatasetsUpdated` from the finalize
  path (today's onComplete callback).

### C5. Routes

Deleted (registry + handlers + client callers, names verified
2026-07-16): `createDatasetIcehUploadAttempt`,
`getDatasetIcehUploadAttempt`, `getDatasetIcehUploadStatus`,
`deleteDatasetIcehUploadAttempt`, `updateDatasetIcehUploadAttemptStep1`,
`updateDatasetIcehUploadAttemptStep2`.

Added:

- Stateless `parseDatasetIcehZipPreview` — body `{ zipUploadToken }`;
  returns `IcehStep1Result` (today's step-1 parse re-exposed without
  the attempt row: zip contents check, sheet check, country/indicator/
  row/year/strat preview). Nothing persisted.
- `launchDatasetIcehRun` — body `{ zipUploadToken }`; re-validates
  (country-ISO match vs instance config, zip parseable), claims via
  INSERT (partial unique index; explicit refusal if a run is running),
  spawns the worker.
- `getDatasetIcehImportRuns` — Current/History data.
- `resolveDatasetIcehReview` — `{ runId, action }`; integrate_anyway
  re-claims and re-ingests gate-skipped (C4); discard → `cancelled` +
  delete the temp zip.

Kept forever (unchanged): `getDatasetIcehDetail` (minus the attempt
summary, plus the C1 cache-hash change), `getDatasetIcehDisplayData`,
`deleteDatasetIcehData`, `deleteDatasetIcehIndicators`.

### C6. Guard deletion

The `status_type NOT IN ('staging','integrating')` singleton guards die
with the attempt functions. ICEH has no worker_store presence today and
no cross-family guards (verified) — the new `"iceh"` key + runs-table
claim is the entire concurrency story.

### C7. Client

- Modal wizard, two steps: **Upload** (zip `FileUploadSelector`, then
  the zip-contents preview panel from today's step_1, fed by
  `parseDatasetIcehZipPreview`) → **Review & launch** (today's step_2
  confirm panel: summary + cumulative-replace warning; Start button,
  refusal inline).
- ICEH page sidebar (`instance_dataset_iceh/index.tsx`): "Start new
  import" opens the modal; the singleton attempt card, its 5 s poll,
  and the "Remove completed upload form" flow die. Current card
  (running / needs_review with unknown-strat samples +
  Integrate-anyway/Discard) + History list.
- Delete `instance_dataset_iceh_import/` (verified file list: index,
  step_1, step_2, progress_staging, progress_integrating,
  progress_complete) — the preview/confirm panels relocate into the
  modal steps.
- **Delete `_import_wizard/import_wizard_shell.tsx`** — ICEH's wizard
  was its only consumer (verified by grep 2026-07-16; the descriptor
  shell is the last remnant of the superseded toolkit plan).

### C8. Verify (Phase C)

1. `deno task typecheck` + `./validate_migrations`.
2. Harness: refusal while running; needs_review releases the claim;
   integrate_anyway re-ingests from the retained zip and lands
   identical data to a gate-clean run of the same file; discard deletes
   the temp zip; boot sweep flips a stranded running row (the old wedge
   scenario, now recoverable); cache hash changes after a completed
   run.
3. Live click-throughs (synthetic Retriever-shaped zip): clean zip →
   auto-integrates, data tabs populate, History row present; zip with
   unknown strats → needs_review showing the strat samples → Integrate
   anyway completes and skips those rows; zip with only NA estimates →
   integrates clean (missing-estimate skips reported, not blocking).
4. SYSTEM_06's ICEH sections rewritten to the run model (shorter).

---

## Phase D — burn the scaffolding

Mechanical closeout; every item is a deletion or a doc rewrite.

1. Grep-verify zero remaining references to `upload_attempt`,
   `uploadAttempt`, and `UploadAttempt` across `server/`, `lib/`, and
   `client/src` (types, DB helpers, routes, components, SSE notify
   payloads). Delete stragglers.
2. Delete any shared helper or component orphaned by A–C (including the
   old `stage_hmis_data_csv`/`integrate_hmis_data`/`stage_hfa_data_csv`/
   `integrate_hfa_data` worker entry files if their internals were
   relocated rather than the folders reused, and the fixed
   staging-table-name constants in `exposed_env_vars.ts`).
3. Retire HMIS "View previous imports" as an entry point
   (`instance_dataset_hmis/_previous_imports.tsx`; verified HFA/ICEH
   never had one): History click-through to `_import_information.tsx`
   replaces the navigation; versions tables and the detail view itself
   unchanged (runs=operations / outcomes=outcomes, never merged).
4. SYSTEM_06 rewritten around the run model — **must come out shorter
   than today's, or the consolidation failed its own brief**. Update the
   SYSTEM docs' `globs` lists for every file added/deleted
   (`lint:systems` inside `deno task typecheck` enforces exactly-one
   owner and will list orphans).
5. Final verify: `deno task typecheck` + `./validate_migrations` + one
   clean import per family end-to-end.

---

## Sequencing + housekeeping

- A → B → C → D in one hand-off, each phase's Verify section green
  before the next begins; one commit per phase. Severable at every
  boundary: if priorities shift after any phase, the completed families
  are coherent and the remaining ones keep working untouched on the old
  machinery indefinitely.
- Deploy reality: none of this is deployed until Tim runs the deploy
  (note the DHIS2-importer Phases 1–4 themselves are also still
  awaiting their first deploy); leftover mid-wizard attempts at deploy
  time are discarded by the drop migrations — users relaunch through
  the new wizards once.

## Out of scope (all phases)

- No CSV scheduling, anywhere. Schedules stay HMIS-DHIS2-only.
- No queue for HFA/ICEH (explicit refusal; revisit only on real pain).
- No changes to staging/validation/integration internals in any family
  — wrap, never rewrite. (Relocating internals into callable functions
  is wrapping; changing their SQL/semantics is not.)
- No versions/runs merge, no versions schema changes, no new versions
  tables for HFA/ICEH.
- No wizard engine, no cross-family runs table, no new caches.
- No parallel imports within a family; cross-family overlap is allowed
  (invariant 2) but not otherwise engineered for.
