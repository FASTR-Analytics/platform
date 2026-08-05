# Plan — Import consolidation: config-on-client, run-on-server, for HMIS + HFA + ICEH

**Status (2026-08-06): Phases A and B are BUILT, VERIFIED, and adversarially
reviewed (A also confirmed in the browser by Tim; B's browser walkthrough is
pending). Phases C and D are not started.** Phase A landed on tim-branch
(swept into commit `d81a96cb` by a concurrent panther sync — the message says
"panther sync 4 files" but it contains the whole Phase A change set). Phase B
= commits `04dfd51f` (the phase) + `bd351629` (the review fix batch).
Migrations 070 and 071 are applied on the dev instance. Each built phase's
section is annotated with its as-built deviations; everything a C implementer
reuses (shared helpers, temp-upload mechanism, client patterns, lessons) is
listed under the "as-built facts" blocks in §0.

**Hand-off: "start work" / "continue work" means implement Phase C, then D,
in order.** Each phase has its own verification section which must pass before
the next phase begins. Phases stay severable — if work stops after any phase,
the completed families are coherent and the remaining families keep working
untouched on their old machinery.

All four phases were mechanically specced 2026-07-16 and re-verified against
the codebase 2026-08-04. Supersedes two deleted plans (both in git history):
PLAN_DHIS2_IMPORTER.md's §9 (Phase 5, CSV re-flow — everything it ruled:
launch-and-observe, the conditional review gate, hold-with-diagnostics,
survives here as run states instead of attempt states; the gate rationale is
restated in full in §2), and PLAN_IMPORTER_CONSOLIDATION.md (the dormant
"toolkit" plan — this plan deletes the attempt machinery it abstracted over, and
absorbs its philosophy: extract shared parts only against concrete consumers,
never an engine). Designed with Tim 2026-07-15/16.

## 0. For the implementing agent

- **Scope:** this repo only — no panther or wb-fastr-modules changes. Commit to
  the current branch (Tim ruled 2026-08-05: all work lands on **tim-branch**;
  one commit per phase is a good shape — and beware Tim's panther-sync tool,
  which auto-commits anything staged: don't leave a phase half-staged). Nothing
  deploys until Tim runs the deploy.
- **Phase A as-built facts (what B/C reuse — go read these files first):**
  - Shared worker-contract helpers = `server/worker_routines/worker_contract.ts`
    (`createThrottledProgressWriter`, `truncateWorkerError`,
    `PROGRESS_WRITE_INTERVAL_MS`). The READY handshake was already shared
    (`instantiate_worker_generic.ts`). The finalize/sweep patterns were NOT
    extracted as functions — copy the shape from `import_hmis_data_csv/`
    (worker.ts error path, spawn-site listeners in
    `dataset_hmis_import_runs.ts`).
  - Temp uploads = `server/import_temp_uploads.ts`
    (`resolveImportTempUpload`/`deleteImportTempUpload`/
    `sweepOrphanImportTempUploads`, dir `.import-uploads/`) + the TUS
    wizard-temp mode in `server/routes/instance/upload.ts`. **The client
    GENERATES the uuid token** and sends it in TUS metadata
    (`wizardTemp`/`uploadToken`) — no token ever travels back in a response.
    Client widget = `client/src/components/_temp_file_upload.tsx`
    (`TempFileUpload`, returns `{ token, fileName }` via `onUploaded`). The
    orphan boot sweep reads `dataset_hmis_import_runs` + `hfa_import_runs`
    (B extended it; per-family token field names are collected in one place
    in `sweepOrphanImportTempUploads`) — **C must extend it** to
    `iceh_import_runs` (as already noted in A3).
  - Client model to copy: `instance_dataset_hmis/imports/` (the dhis2_run/
    folder was renamed; surface component = `DatasetHmisImports`).
    `_csv_wizard.tsx` = the modal-wizard shape (ModalContainer + getStepper +
    StepperChipsWithTitles, client-local signals, inline errors only);
    `_csv_needs_review_card.tsx` + `_csv_staging_summary.tsx` +
    `_csv_run_view.tsx` + `_csv_run_detail.tsx` = the review-card /
    diagnostics / progress / detail shapes C7 mirrors (B7 already did; the
    HFA copies in `instance_dataset_hfa/imports/` are the leaner variant to
    copy for a no-queue family).
  - Integrate-anyway resume mechanism (HMIS): the resolve route rewrites
    `csv_config` with `resumeFromStaging: true`; the worker payload carries the
    recorded staging result and the worker skips the stage leg. The queued-fire
    path (`scheduler.ts` → `launchQueuedDatasetHmisCsvImportRun`) spawns
    by-source. HFA copies this shape; ICEH re-ingests from the zip instead
    (C4).
  - CSV run diagnostics live in `run_stats` as `{ csvStagingResult }` (written
    at needs_review AND at complete); the detail route serves them as
    `csvStagingResult` on `DatasetHmisImportRunDetail`.
  - Two schema deviations from the original A1 spec: `selection` was ALSO made
    nullable (it is DHIS2-only, same argument as `dhis2_url` — the original
    spec missed that a CSV insert would violate its NOT NULL), and
    `DatasetHmisImportRunProgress` became a by-source union (pairs vs
    `{ phase: "staging"|"integrating", percent }`).
  - Already done in Phase A (don't redo in D): old `stage_hmis_data_csv/` +
    `integrate_hmis_data/` worker folders deleted; the
    `UPLOADED_HMIS_DATA_STAGING_TABLE_NAME` constant deleted; SYSTEM_06
    rewritten for the HMIS run model; SYSTEM_04 documents the wizard-temp
    mode; PROTOCOL_APP_WORKER_ROUTINES inventory + PROTOCOL_APP_STATE T3
    updated; system globs updated (new files claimed by S4/S6/S8).
- **Phase B as-built facts (what C reuses — beyond the A facts above):**
  - The whole Phase B change set is the closest template for C: DB layer =
    `server/db/instance/dataset_hfa_import_runs.ts` (explicit-refusal
    `assertHfaImportSlotFree`, one `spawn*RunWorker` shared by launch +
    integrate-anyway, status-first conditional cancel, boot sweep fn);
    worker = `server/worker_routines/import_hfa_data_csv/`; client surface =
    `client/src/components/instance_dataset_hfa/imports/` (no-tabs Current
    card + History table + 4-step wizard, opened from two sidebar buttons —
    a History table does not fit the `w-64` sidebar, so C's surface should be
    an editor too).
  - **Completion flip lives INSIDE the integrate transaction** (B review fix,
    commit `bd351629`): conditional on `status='running'`, throw-on-zero →
    a cancel racing the commit either rolls the merge back whole or no-ops
    after completion. C's worker must adopt the same shape (ICEH's integrate
    is already one transaction). Likewise the needs_review flip checks its
    rowcount and cleans up when a cancel won.
  - **Wizard chip lesson (B review fix):** panther's stepper makes the NEXT
    chip clickable whenever `canGoNext`, and a chip click calls
    `setCurrentStep` directly — any wizard whose step-advance has a side
    effect MUST pass `onStepClick` routing forward clicks through the same
    advance function as the Next button (`_wizard.tsx` shows the shape).
    C's two-step wizard has no side-effect advance, but check before assuming.
  - Diagnostics ride the runs LIST (`HfaImportRunSummary.diagnostics`) — no
    detail route; sound while the blob is a handful of scalars. ICEH's
    diagnostics include ≤5 raw sample rows (C4) — still small; same pattern
    fits.
  - Harness gotchas (Sequencing section has the run recipe):
    `facilities_hfa`/`facilities_*` fixture rows need a real `admin_areas_4`
    composite-FK parent (SELECT an existing row); mapping column names travel
    ENCODED (`encodeRawCsvHeader` → `"Col 1: fid"`); XLSForm/xlsx fixtures
    are authorable with SheetJS (`utils.aoa_to_sheet` + `writeFile` from
    `xlsx/xlsx.mjs`).
  - Already done in Phase B (don't redo in D): old `stage_hfa_data_csv/` +
    `integrate_hfa_data/` worker folders deleted; the three
    `UPLOADED_HFA_*_STAGING_TABLE_NAME` constants deleted; the HFA arm removed
    from `resetWedgedUploadAttempts`; SYSTEM_06 rewritten for the HFA run
    model; PROTOCOL_APP_WORKER_ROUTINES inventory + PROTOCOL_APP_STATE T3
    updated; system globs updated.
  - Accepted-not-fixed review findings (do not re-litigate; full record in the
    Phase B section's review block): crash-path cleanup can destroy a
    needs_review hold's staging tables in a narrow window (recoverable via
    discard; HMIS parity), and the LIMIT 50 runs list could hide a
    needs_review hold older than 50 runs. The F2/F3 cancel-vs-commit shape
    still exists in Phase A's HMIS CSV worker (bigger fix — its flip spans
    version/ledger writes); optional hardening candidate alongside Phase D.
- **Read first:** SYSTEM_01_api_contract.md + PROTOCOL_APP_ROUTES.md
  (registry-as-contract), SYSTEM_02_persistence.md (SQL-safety rule — no
  parameterized table names), PROTOCOL_APP_MIGRATIONS.md,
  PROTOCOL_APP_WORKER_ROUTINES.md (READY handshake, teardown contract),
  SYSTEM_04_assets_upload.md (the TUS front door A3 extends),
  SYSTEM_08_results_packages.md, PROTOCOL_APP_STATE.md (wizard state is
  component-local), PROTOCOL_UI_STRUCTURE. SYSTEM_06_ingestion.md is current
  as of Phases A+B: its "HMIS import runs" section is the authority on the
  shared run mechanism, "HFA import runs" lists HFA's deltas, and its ICEH
  sections describe the machinery Phase C replaces.
- **Orientation — the families today:**
  - HMIS: DONE (Phase A). Everything is the runs plane —
    `server/db/instance/dataset_hmis_import_runs.ts` +
    `server/worker_routines/import_hmis_data_dhis2/` (DHIS2) +
    `server/worker_routines/import_hmis_data_csv/` (CSV); imports surface =
    `client/src/components/instance_dataset_hmis/imports/`. The attempts
    plane is deleted.
  - HFA: DONE (Phase B). Everything is the runs plane —
    `server/db/instance/dataset_hfa_import_runs.ts` +
    `server/worker_routines/import_hfa_data_csv/`; imports surface =
    `client/src/components/instance_dataset_hfa/imports/`. The attempts
    plane, both old workers, and the fixed staging-table-name constants are
    deleted. Outcome plane unchanged = `hfa_time_points` (imported_at stamp) plus
    `hfa_data`/`hfa_variables`/`hfa_variable_values`; duplicates preview =
    the stateless `scanHfaDuplicates` in
    `server/server_only_funcs_csvs/scan_hfa_rows.ts`.
  - ICEH: singleton `iceh_upload_attempts` row; everything in
    `server/db/instance/dataset_iceh.ts`; **no worker** — ingest is a
    fire-and-forget un-awaited promise (`stageAndIntegrateIcehData`, called
    without await from `updateDatasetIcehUploadAttemptStep2`); client wizard
    `instance_dataset_iceh_import/` (a consumer — no longer the only one — of
    the shared `_import_wizard/import_wizard_shell.tsx`; see C7), sidebar in
    `instance_dataset_iceh/`. Outcome plane = `iceh_indicators` + `iceh_data`
    (cumulative upsert, no versions).
- **Vocabulary: "runs" is overloaded since 2026-07-28.** Migrations 065–067
  added the results-runs plane (`runs`, `run_generation_attempts`,
  `server/runs/`, `worker_routines/generate_run/`) — verified disjoint from
  every import table. In this plan "run" always means an import run in a
  family's own `*_import_runs` table; keep the planes verbally distinct in
  code, UI copy, and the Phase D doc rewrite.
- **Line anchors in this plan drift** (the repo is under active parallel work) —
  anchors re-verified 2026-08-04; still treat every `file:line` as a hint and
  re-grep the symbol before editing.
- **Verification:** each phase ends with a Verify section (typecheck +
  `./validate_migrations` + a harness + live click-throughs). Live
  click-throughs run against the dev instance (`./run`, or `deno task dev` +
  client dev server; server has no --watch — restart it after server changes).
  CSV/zip phases need no DHIS2 access — drive them with synthetic files.

**Tim's values ruling the design (2026-07-16):** simplicity, maintainability,
robustness — explicitly NOT more code/features. The end state must be
net-negative lines. Phase D's definition of done includes: the rewritten
SYSTEM_06 ingestion doc is SHORTER than today's, or we've failed the brief.

## 1. The four invariants (the whole system)

1. **Every import is a run row — in its family's own table.** No second
   lifecycle. The attempt machinery (draft rows, step-resync routes, babysat
   staging) is deleted family by family, not abstracted over.
2. **At most one import running per family, ever.** Enforced the proven way: a
   partial unique index on the family's runs table (`WHERE status = 'running'`),
   the same single-running claim `dataset_hmis_import_runs` uses today
   (migration 057). Cross-family imports may overlap (disjoint data planes — HFA
   never blocked HMIS anyway; verified: worker_store keys are family-scoped, no
   cross-family guard exists today); within a family, never.
3. **Nothing persists before launch.** Wizard state is client-local signals in a
   modal (single-user by construction). The only pre-launch server artifact is
   the uploaded file itself — a temp upload keyed by token, orphan-swept if
   never launched. Abandoning a wizard is a no-op by construction: zombie drafts
   stop being _possible_ rather than being handled.
4. **Runs are operations; outcomes live in each family's own plane.** HMIS: the
   `dataset_hmis_versions` table (runs carry `version_id`). HFA: the time-point
   plane (`hfa_time_points.imported_at` stamp + the per-time-point data tables);
   the run row keeps the staging diagnostics that today die with the deleted
   attempt row. ICEH: the cumulative `iceh_indicators`/`iceh_data` store; the
   run row is the only durable import record (today's machinery keeps NO import
   history at all). Runs link to outcomes; History rows click through where an
   outcome detail exists. Never merged.

## 2. Ruled decisions (2026-07-15/16, not open)

- **Separate runs tables per family. No mega-table, no rename.** The diagnostics
  ARE the schema: HMIS runs carry pairs/progress/dhis2_url; an HFA file
  import shares none of that. One table would be nullable-column soup.
  `dataset_hmis_import_runs` is genuinely HMIS-only and keeps its name.
- **Reuse is contracts and components, not storage and not a framework.**
  Shared: worker-contract helpers (progress-write throttling, the
  finalize/reconcile retry pattern, error classification, boot-sweep
  registration, teardown rules) and client components (modal wizard shell
  pattern, upload step, review-step frame, run-row/status rendering, history
  table). NOT shared: SQL (per-family DB functions stay thin and family-owned —
  also keeps the SYSTEM_02_persistence.md SQL-safety rule intact: no
  parameterized table names), and NO config-driven wizard engine — three plain
  wizards sharing parts beat one clever abstraction (variants are bounded at
  four, forever). (The existing `_import_wizard/import_wizard_shell.tsx`
  descriptor shell does NOT die: it gained a second consumer on 2026-07-13 —
  `results_package_wizard/` — so ICEH merely stops consuming it in Phase C and
  its ownership moves to SYSTEM_08 in Phase D.)
- **State tiers (fits PROTOCOL_APP_STATE.md unchanged).** Wizards = T5
  (client-local signals, invariant 3). Run Current/History fetches = T3
  polling in the dataset components, same as `dhis2_run/` today — no new
  state files. Completion propagates through the existing triangle:
  worker finalize → `notifyInstanceDatasetsUpdated` → `datasets_updated` →
  `hfaCacheHash`/`icehCacheHash` → T2 invalidation. NO new T1 fields: the
  HMIS `hmisImportRunActive` bypass exists for per-pair DHIS2 integration;
  HFA/ICEH stay single-transaction, so no run-active flag or cache bypass is
  needed (and `hmisImportRunActive` automatically covers CSV runs once they
  share the runs table — harmless-conservative).
- **Asymmetry by design.** HMIS is the main event (DHIS2 primary source, huge,
  always updating) and gets the full machine: queue, scheduler, needs_review,
  per-pair DHIS2 + single-transaction CSV. HFA and ICEH are small single-file
  families and get deliberately smaller machines: one-at-a-time claim +
  **explicit refusal** ("an import is running — wait"), NO queue, NO
  scheduler/tick involvement, NO Future tab — just a Current card and a History
  table. If refusal ever genuinely hurts, a queue can be added then, not
  speculatively now.
- **CSV keeps single-transaction integration** in every family. Per-pair
  atomicity is right for DHIS2 because pairs are independent fetch units; a file
  is one coherent authored artifact. The run model changes who schedules and
  displays the work, not the atomicity that's right for the source.
- **The §9 conditional review gate stays, generalized** (Tim's earlier ruling,
  unchanged): clean staging → auto-integrate unattended; dropped rows → run
  holds in `needs_review` with diagnostics + "Integrate anyway" / "Discard"
  actions; zero staged rows → loud `error`. Files are user-authored; a bad
  mapping silently dropping 90% of rows must not merge the surviving 10%
  unattended. **The clean condition is family-specific** and defined
  mechanically in each phase (HMIS A4, HFA B4, ICEH C4) — the principle is one
  rule, the counters differ.
- **One deliberate change from §9:** a `needs_review` run RELEASES the
  single-running slot instead of occupying it. §9 said a held attempt occupies
  the CSV slot; under the runs model that would let one unreviewed CSV block
  scheduled DHIS2 imports indefinitely — unacceptable now both share a lane.
  Made safe per family: HMIS by per-run staging tables (A4); HFA likewise (B4);
  ICEH by deterministic re-ingest from the retained zip (C4). "Integrate anyway"
  re-claims the slot (HMIS: queues if busy; HFA/ICEH: explicit refusal if busy).

## 3. End-state (what exists when Phase D closes)

- Per family: one runs table, one worker (wrapping that family's existing
  staging/validation/integration internals untouched), one modal wizard, one
  Current/History surface (HMIS also has Future).
- Deleted: `dataset_hmis_upload_attempts`, `hfa_upload_attempts`,
  `iceh_upload_attempts`; every step-resync route; the cross-guard lattice; all
  sidebar draft/staging/integrating attempt cards and their polling; the
  resumable-wizard client logic; the fixed staging-table name constants; HMIS
  "View previous imports" as an entry
  point (content reachable from History click-through; versions tables and
  `_import_information.tsx` unchanged).
- The failure-mode knowledge from the Phase 3/4 reviews (claim races,
  status-guarded writes, finalize reconciliation, crash sweeps, teardown) lives
  once, in the shared contract helpers.

---

## Phase A — the machine + HMIS CSV — ✅ BUILT 2026-08-05 (verified + Tim-confirmed)

**Do not re-implement.** Kept below as the record of what was specced; the
as-built deviations are in §0's "Phase A as-built facts". Verification that
passed: `deno task typecheck` (incl. lint:systems), `./validate_migrations`, a
9-check concurrency harness (claim exclusion both directions, needs_review
releases the slot, discard drops the staging table + temp upload, orphan sweep
spares referenced tokens), a 25-check end-to-end harness driving the real
worker on the dev DB (clean CSV auto-integrates with version+ledger rows;
dirty CSV → needs_review with correct diagnostics → integrate-anyway merges
only survivors; zero-valid-row CSV errors loudly; cancel mid-staging keeps
nothing), and Tim's browser walkthrough. Migration 070 is applied on dev.

HMIS CSV import becomes a run in the existing `dataset_hmis_import_runs` table.
The HMIS attempt machinery is deleted. This is where the shared contract helpers
and shared wizard components get extracted — against a second concrete consumer,
not speculatively.

### A1. Migration (next free — 070 as of 2026-08-04) + base schema (`_main_database.sql`)

(Numbering: 063–069 are all consumed — 063 dropped `shadow_passed` from this
very table, 064 schedule recurrence, 065–067 results runs, 068 structure
recodes, 069 HFA variants. Use the next free number at build time; B and C add
their own migrations after it.)

`dataset_hmis_import_runs` (057/058 shape minus `shadow_passed`, which 063
dropped; re-verified 2026-08-04):

- `ADD COLUMN source text NOT NULL DEFAULT 'dhis2' CHECK (source IN
  ('dhis2', 'csv'))`,
  then `ALTER COLUMN source DROP DEFAULT` (backfill via the default; inserts
  thereafter explicit — no default arguments).
- `dhis2_url` → nullable (CSV runs have none). Enforce the pairing in code at
  the write boundary (dhis2 → required, csv → NULL), same pattern as
  `validateScheduleFields`.
- `ADD COLUMN csv_config text` (nullable) — the CSV launch payload:
  `{ uploadToken, fileName, mappings }` as JSON. Deliberately NOT folded into
  `selection` (that column is the DHIS2 selection domain; keep the unions
  honest).
- Status CHECK gains `'needs_review'` (the 058 pattern: drop + re-add the
  constraint with the new value).
- `DROP TABLE IF EXISTS dataset_hmis_upload_attempts` + remove from base schema
  (base-schema-born at `_main_database.sql:449`, plus its two indexes
  `idx_dataset_hmis_upload_attempts_status_type`/`_date_started`; verified
  2026-08-04 that no migration creates it, so the unconditional `IF EXISTS`
  drop leaves fresh-DB and deployed-DB schemas identical, which is what
  `./validate_migrations` checks).
- Run `./validate_migrations`.

Pair counters (`total_pairs` etc.) stay 0 for CSV runs — pair columns are DHIS2
diagnostics; CSV diagnostics ride `run_stats`/`csv_config` and the staging
result on the version row, as today.

### A2. Types + schemas (`lib/`)

- `DatasetHmisImportRunSummary` (`lib/types/dataset_hmis_import.ts`): add
  `source: "dhis2" | "csv"`, optional `csvFileName`, status union gains
  `"needs_review"`. Zod schemas in `lib/api-routes/instance/datasets.ts` follow
  (discriminated where the wire shape forks).
- New `DatasetHmisCsvRunConfig` type (uploadToken/fileName/mappings) — reuse the
  existing step-2 mappings type verbatim; do not redesign the mapping shape.
- Delete with the routes (A5): `DatasetUploadAttemptDetail` (+ its
  `Initial`/`Csv` variants), `DatasetUploadStatusResponse`,
  `DatasetUploadAttemptSummary`, `DatasetUploadAttemptStatusLight` — all in
  `lib/types/dataset_hmis_import.ts`, NOT `dataset_hmis.ts` — and the
  `uploadAttempt` field on `DatasetHmisDetail` (`lib/types/dataset_hmis.ts:8`).
  `DatasetCsvStagingResult` SURVIVES: `DatasetHmisVersion.stagingResult`
  references it.

### A3. Temp uploads (invariant 3's server half — net-new mechanism)

Verified 2026-08-04: **no token-keyed temp-upload mechanism exists anywhere in
the repo.** Today the step-1 CSV rides `FileUploadSelector` → the TUS endpoint
(`server/routes/instance/upload.ts`) → `Deno.rename` into the assets dir as a
PERMANENT named instance asset, and the step route receives just the asset file
name (ICEH zips likewise — nothing ever deletes them). The closest precedent is
TUS's internal store — `crypto.randomUUID()` id, `.tus-uploads/` dir, 24 h
`cleanupOldUploads()` sweep — but its keying Map is in-memory: not
restart-safe, not referenceable from a run row.

Build (keeping SYSTEM_04's one-front-door rule — a mode on the existing TUS
endpoint, never a parallel upload endpoint):

- TUS creation gains a wizard-temp mode (metadata flag passed by
  `FileUploadSelector`): on completion the file lands at
  `{instance dir}/.import-uploads/{uploadToken}__{sanitizedFileName}` with NO
  asset-metadata row. The token (a fresh UUID) is the durable key — it lives in
  the filename, so a restart loses nothing. `FileUploadSelector` returns the
  token directly instead of waiting for the asset to appear over SSE.
- Orphan sweep on `db_startup` (alongside the existing sweeps): delete
  `.import-uploads` files older than 24 h whose token appears in no run row
  with status `running`/`queued`/`needs_review` (across every family's runs
  table as B/C land). Workers delete the files on complete/discard via
  finalize.
- Wizard parse/validate endpoints are **stateless**:
  `parse headers for
  uploadToken` (feeds the mappings step; reuse the existing
  step-2 parsing logic as-is, re-exposed without the attempt row) — nothing is
  persisted by these calls.
- SYSTEM_04's doc gains the mode (Phase D).

### A4. The CSV run worker (`server/worker_routines/import_hmis_data_csv/`)

Wraps — does not rewrite — the internals of `stage_hmis_data_csv` and
`integrate_hmis_data`. Two legs, one worker module, registered under the
existing `"hmis"` worker key:

- **Stage leg** (run status `running`): stage the file, evaluate the clean
  condition server-side. **HMIS clean condition (the exact §9 rule):** every
  `validation.*.rowsDropped` = 0 AND `finalStagingRowCount > 0` (the five
  counters: invalidPeriods, invalidCounts, missingRequiredFields,
  invalidFacilities, unmappedIndicators). `validation` is optional on
  `DatasetCsvStagingResult` — the worker treats a missing `validation` as
  `error`, never as clean.
  - Clean → proceed straight to the integrate leg (auto-integrate, no human).
  - Dropped rows → write diagnostics to the run, flip to `needs_review`,
    **release the claim** (§2's ruled change), exit worker.
  - Zero staged rows → `error`, loud.
- **Integrate leg**: the existing single-transaction CSV integration (version
  minted MAX(id)-inline as today, ledger writes unchanged, scoped-delete
  interplay unchanged).
- **Per-run staging tables** (`_run_{runId}` suffix scheme): staging output
  must survive a `needs_review` hold across other imports running in between,
  and be dropped on integrate/discard/sweep. The stage worker builds FOUR
  tables (the final `uploaded_hmis_data_staging_ready_for_integration` plus
  three throwaway UNLOGGED temps, `stage_hmis_data_csv/worker.ts:125,272,376`)
  — all four get the suffix and all four drop on every exit path. This
  replaces the fixed-name staging table assumption — it is the one piece of new
  mechanism in the whole phase, and what makes releasing the slot safe. Delete
  the HMIS fixed staging-table-name constant once nothing reads it.
- Contract compliance throughout: READY handshake, status-guarded progress
  writes (the 2 s throttle helper), finalize on every exit path, boot sweep
  covers `running` CSV runs (flip to `error`, drop the staging table), workers
  never self-close.
- **This is where the shared helpers get extracted**: pull the
  throttled-progress writer (`import_hmis_data_dhis2/worker.ts:201-223`),
  finalize-retry shape, error classification (the ad-hoc catch block at
  `worker.ts:1003-1038`), and sweep registration out of
  `import_hmis_data_dhis2/` into shared worker-contract helpers consumed by
  both workers (and by B/C's workers later). Extraction with two concrete
  consumers, no speculation. Two corrections from the 2026-08-04 verification:
  the READY handshake is ALREADY shared (`instantiate_worker_generic.ts`, all
  worker families) — do not re-extract it; and the results-runs work
  (`generate_run/`) built NO reusable run/worker helpers — it has its own
  copies, so there is nothing there to reuse.

### A5. Routes (registry-first, per PROTOCOL_APP_ROUTES)

Deleted (registry + handlers + client callers — the "Upload workflow" block in
`lib/api-routes/instance/datasets.ts`, names re-verified 2026-08-04):
`createDatasetUploadAttempt`, `setDatasetUploadSourceType`, `getDatasetUpload`,
`getDatasetUploadStatus`, `deleteDatasetUploadAttempt`, `uploadDatasetCsv`,
`updateDatasetMappings`, `updateDatasetStaging`, `finalizeDatasetIntegration`.
`getDatasetHmisDetail` loses its `uploadAttempt` field.

Added:

- `launchDatasetHmisCsvRun` — validates config at the boundary (mappings shape,
  uploadToken exists), then the same launch-or-enqueue fork as DHIS2 (the
  ruled queue model: queueing is EXPLICIT — the user confirms "queue behind the
  running import", never a silent default; the wizard's review step carries the
  fork copy, same as the DHIS2 wizard's step 5 today).
  Queued CSV runs are drained by the existing tick FIFO — **`fireQueuedRun`
  gains a by-source branch** (`scheduler.ts:487-521`): CSV fires skip the two
  stored-credential checks (existence + URL-match) and the hardcoded
  `credentialsSource: { kind: "stored" }`
  (`dataset_hmis_import_runs.ts:434`). That is the whole branch — there is no
  unattended gate on the queued-fire path (the `shadow_passed` gate died with
  migration 063; `assertUnattendedReady` guards only schedule create/enable).
- `resolveDatasetHmisCsvReview` — body
  `{ runId, action:
  "integrate_anyway" | "discard" }`. Integrate-anyway
  re-claims the slot (or queues); discard flips to `cancelled` + drops the
  staging table + deletes the temp upload.
- Stateless `parseDatasetHmisCsvHeaders` (A3) for the mappings step.

### A6. Cross-guard deletion

- `countActiveCsvAttempts` (`dataset_hmis_import_runs.ts:175`) and ALL five call
  sites — deleted: the two scheduler gates (`scheduler.ts:432`, `:582`), the
  launch read-guard (`dataset_hmis_import_runs.ts:274`), and the two
  **post-claim re-checks** (launch `:299`, queued-fire `:424`). The re-checks
  deserve emphasis: they exist solely to defend against the cross-table race (a
  CSV attempt claiming between the read-guard and the runs-table INSERT). Once
  CSV imports live inside the same partial-unique-index claim, that race is
  structurally impossible — the whole two-phase guard ceremony deletes, not just
  the guard calls. (Zombie states stop being possible rather than being handled
  — invariant 3's argument, applied to concurrency.)
- The attempt-side guards die too: `assertNoRunningDatasetHmisImportRun`'s CSV
  consumers in `dataset_hmis.ts` — the step-3 staging claim + post-claim run
  re-check (`:842`, `:877`) and the step-4 integrate pair (`:961`, `:990`) —
  go with the machinery; **windowed deletes keep a guard**
  (`datasets_in_project_hmis.ts:161`, `dataset_hmis.ts:189`), now a single
  runs-table check instead of runs + attempts.
- `db_startup`'s attempt sweep: delete only the `dataset_hmis_upload_attempts`
  line from `resetWedgedUploadAttempts` (`db_startup.ts:132-149`; B and C
  delete their lines). **The `structure_upload_attempts` arm survives all four
  phases** — the structure family still runs on attempts (migration 068,
  2026-08-04). Run sweep already exists; temp-upload sweep added per A3.

### A7. Client

- New CSV wizard: modal, `openComponent` + `getStepper` +
  `StepperChipsWithTitles`, client-local signals, the no-overlay hard rule
  (inline confirms/errors only). Steps: **Upload** (reuse the existing step-1
  upload component against a fresh uploadToken) → **Mappings** (reuse step-2's
  UI, fed by the stateless parse endpoint) → **Review & launch** (shared review
  frame; live Start-vs-Queue fork, same as DHIS2 step 5; pair-free summary: file
  name, row count, mappings summary). Launch → close → land on Current.
- Current tab renders CSV runs: staging progress (existing progress components
  relocated), and the `needs_review` card — step-4's diagnostics render
  relocated here, with Integrate-anyway (inline confirm) and Discard.
- History gains a Source column (DHIS2/CSV) — rows click through to version
  detail where one exists (the History↔versions navigation dedup starts here;
  "View previous imports" retires in Phase D).
- Sidebar (`instance_dataset_hmis/index.tsx`): "Upload CSV file" button now
  opens the modal wizard; the draft/staging/integrating/complete attempt cards
  and their 5 s poll die (Current tab + existing queued count + attention banner
  are the signal set — same reasoning as the DHIS2 card removal, which Tim
  ruled).
- Deleted client code: `instance_dataset_hmis_import/` (verified file list:
  index, step_1_csv, step_2_csv, step_3, step_4_csv, progress_staging_csv,
  progress_integrating, progress_complete) — reusable pieces (upload widget,
  mappings UI, diagnostics render, progress bars) move to their new homes rather
  than being rewritten.
- Wizard-shell/naming note (builder): the imports-surface folder is currently
  `dhis2_run/`; with a CSV wizard moving in, renaming the folder (e.g.
  `imports/`) is consistent with the ruled source-neutral naming AND keeps
  "run" from colliding with the results-runs plane — do it in this phase or not
  at all (no half-renames).

### A8. Verify (Phase A)

1. `deno task typecheck` + `./validate_migrations`.
2. Harness (rolled-back txn where possible): claim exclusion CSV↔DHIS2 (launch
   CSV while DHIS2 run active → queued, and vice versa); needs_review releases
   the slot (launch DHIS2 import while a CSV hold exists → runs); discard drops
   the per-run staging table; orphan sweep deletes an unreferenced temp upload
   and spares a referenced one.
3. Live click-throughs (synthetic CSVs, no DHIS2 needed): clean CSV →
   auto-integrates unattended, the version and ledger rows land, History row
   links the version; dirty CSV (bad mapping) → needs_review card with correct
   dropped-row diagnostics → Integrate anyway completes; zero-row CSV → loud
   error; cancel mid-staging keeps nothing.
4. SYSTEM_06's HMIS-CSV sections rewritten to the run model (shorter).

---

## Phase B — HFA (the same shape, smaller machine) — ✅ BUILT 2026-08-06

**Do not re-implement.** Verification that passed: `deno task typecheck` (incl.
`lint:systems` with everything staged), `./validate_migrations`, a 21-check
concurrency harness (index refuses a second running row, explicit refusal on
launch, needs_review releases the slot, integrate-anyway refused while busy and
leaves the hold intact, discard drops all three staging tables + both temp
uploads, boot sweep flips a stranded row, orphan sweep spares referenced HFA
tokens), and a 33-check end-to-end harness driving the real worker on the dev DB
(clean file auto-integrates with `imported_at` stamped and the dictionary
sentinel captured; dirty file → needs_review with both facility counters and its
staging tables retained → integrate-anyway merges only survivors; zero-staged
errors loudly without touching integrated data; row filter + "last" dedup land
exactly the intended rows). Migration 071 is applied on dev.

**As-built deviations from the B spec below:**

- `DatasetHfaCsvStagingResult` **dropped** its three staging-table-name fields
  rather than carrying per-run names: the names are derived from the run id
  (`hfaStagingTableNames`), so storing them too would be a second source.
- Diagnostics ride `HfaImportRunSummary` instead of a detail route — the HFA
  blob is ~20 scalars (no samples), so one route serves the list, the
  needs_review card, and the run detail. `getDatasetHfaImportRuns` is the only
  read route.
- Added `cancelDatasetHfaRun` (not in the B route list): the deleted
  `deleteDatasetHfaUploadAttempt` was the only way to kill a wedged HFA worker,
  and dropping it with no replacement would leave a stuck run blocking every
  import until a restart. Same shape as the HMIS cancel.
- The launch body is `HfaCsvRunLaunchInput` (tokens + mappings); file names are
  re-derived server-side from the temp uploads rather than trusted from the
  client (HMIS trusts the client's `fileName`).
- The client surface mirrors HMIS's rather than living in the sidebar:
  `instance_dataset_hfa/imports/` is an editor surface (Current card + History
  table, no tabs) opened by two sidebar buttons. A History table does not fit a
  `w-64` sidebar.
- Phase D items done early because leaving them would have left known-wrong
  docs/code: the old `stage_hfa_data_csv`/`integrate_hfa_data` worker folders and
  the `UPLOADED_HFA_*_STAGING_TABLE_NAME` constants are deleted, and
  PROTOCOL_APP_WORKER_ROUTINES + PROTOCOL_APP_STATE's T3 inventory are updated.
- SYSTEM_06 is 464 lines (was 453): the new HFA section points at the HMIS
  section for the shared mechanism and lists only HFA's differences. Phase D
  still owns getting the whole doc under 425.

**Adversarial review 2026-08-06 (1 agent, findings verified before fixing):**
semantic parity of both relocated legs confirmed line-by-line; all four
deviations ruled sound. Fixes applied same day: (F1) wizard chips now route
through `onStepClick` so chip-clicks can never bypass the duplicates scan
(panther's stepper makes the next chip clickable whenever `canGoNext`, and
`setCurrentStep` skips the Next button's side effects — remember this for any
future wizard whose advance has side effects; Phase A's HMIS wizard is
unaffected, its advances are side-effect-free); (F2/F3) the completion flip
moved INSIDE the integrate transaction, conditional on `status='running'` with
throw-on-zero → a cancel racing the commit either rolls the merge back whole or
no-ops after completion (proven by a dedicated 5-check harness: cancelled run →
integrate throws, zero rows merged, stamp untouched), and the needs_review flip
checks its rowcount so a run cancelled before `setWorker` keeps no
tables/uploads. NOT fixed (accepted): F4 crash-path cleanup could destroy a
needs_review hold's tables in a narrow window (recoverable via discard; exact
parity with HMIS Phase A); F6 `LIMIT 50` could hide a needs_review hold older
than 50 runs (edge; revisit if holds ever linger); F5 was retracted on
verification (main.ts HAS a global onError — stateless-route throws surface
inline as "Server error: " + the real message). **The F2/F3 cancel-vs-commit shape also
exists in Phase A's HMIS CSV worker (inherited, not fixed there — its complete
flip + version/ledger writes span worker code, so the same in-txn fix is a
bigger change); candidates for Phase D or a separate pass.**

### Original Phase B spec

HFA import becomes a run in a new `hfa_import_runs` table; the singleton
`hfa_upload_attempts` machinery is deleted. Facts re-verified 2026-08-04 —
NOTE: the 2026-07-23 row-filter/dedup work is the largest source of change
since this plan was drafted (five-field mappings, a duplicates-review wizard
step, `scan_hfa_rows.ts`); it is folded into B2/B4/B5/B7 below. Migration 069
(HFA indicator variants) does NOT touch the import pipeline — verified.

### B1. Migration (next free — 071; 070 was Phase A's) + base schema

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

No `queued` status, no trigger column (manual-only, no scheduler), no version_id
(HFA's outcome plane is the time point — invariant 4). The run row now DURABLY
keeps the staging diagnostics that today die when the completed attempt row is
deleted.

- `DROP TABLE IF EXISTS hfa_upload_attempts` + remove from base schema. Note:
  migration `023_hfa_schema_redesign.sql` re-creates it with
  `CREATE TABLE IF NOT EXISTS` on a fresh DB (023 stays unrewritten per
  PROTOCOL_APP_MIGRATIONS) — the unconditional `IF EXISTS` drop here runs
  after 023 and removes it, so fresh-DB and deployed-DB schemas converge (same
  pattern migration 061 used for the credentials table). No data migration:
  attempt rows are transient wizard state; an in-flight import at deploy time
  dies with the restart (existing delete-and-relaunch note).
- Run `./validate_migrations`.

### B2. Types + schemas

- New `HfaImportRunSummary` type (id, status, timePoint, csvFileName,
  diagnostics?, nRowsIntegrated?, error?, startedAt, endedAt, triggeredBy) in
  `lib/types/dataset_hfa_import.ts`; Zod schemas in
  `lib/api-routes/instance/datasets.ts`.
- `HfaCsvMappingParams` reused verbatim as the mappings shape — do not
  redesign. It is FIVE fields since 2026-07-23
  (`lib/types/dataset_hfa_import.ts:94`): `{facilityIdColumn, timePoint,
  rowFilters, dedupStrategy, dedupOverrides}`; the run's `csv_config` carries
  all five.
- `DatasetHfaCsvStagingResult` reused verbatim as the diagnostics shape (it
  gained `nRowsFilteredOut`/`dedupStrategy`/`nDedupOverridesApplied` on
  2026-07-23), EXCEPT the three staging-table-name fields become the per-run
  names (B4).
- `HfaDuplicatePreview`/`HfaDuplicateGroup` survive (consumed by the stateless
  preview route, B5); `HfaRowFilter`/`HfaDedupOverride` survive inside the
  mappings type.
- Delete with the routes (B5): `DatasetHfaUploadAttemptDetail`,
  `DatasetHfaUploadStatusResponse`, `DatasetHfaUploadAttemptSummary`,
  `DatasetHfaUploadAttemptStatus`, `DatasetHfaUploadAttemptStatusLight`, and
  the `uploadAttempt` field on `DatasetHfaDetail`
  (`lib/types/dataset_hfa.ts:21`).

### B3. Temp uploads

Same mechanism as A3, two files per run: the CSV and the XLSForm (`.xlsx`, must
contain 'survey' + 'choices' sheets — today's step-1 validation, now run
statelessly at parse/launch time). Both keyed by upload tokens, both covered by
the A3 orphan sweep, both deleted on discard/complete.

### B4. The HFA run worker (`server/worker_routines/import_hfa_data_csv/`)

One worker module (registered under the existing `"hfa"` worker key) wrapping —
not rewriting — the internals of the two existing HFA workers. The stage
internals (XLSForm parse, CSV stream + wide→long pivot, `select_multiple`
expansion, facility validation, dictionary build, sentinel classification) and
the integrate internals (the single `mainDb.begin` transaction stamping
`hfa_time_points.imported_at`, delete + insert per time point) move into plain
functions the new worker calls; the old worker entry files die.

- **Stage leg**: stage into per-run tables, evaluate the clean condition. **HFA
  clean condition (re-derived 2026-08-04 — the dedup work changed what the
  counters mean):**
  `(nRowsInvalidMissingFacilityId + nRowsInvalidFacilityNotFound) = 0
  AND nRowsTotal > 0`.
  `nRowsDuplicated` does NOT gate: duplicates are RESOLVED at wizard time by
  `dedupStrategy` + `dedupOverrides`, so a nonzero count is normal, not a drop.
  `nRowsFilteredOut` does not gate either — row filters are user-authored
  intent. (Units note: the drop counters are facility-row counts; `nRowsTotal`
  is the long-format value count. That asymmetry is fine for the gate — zero
  drops is zero drops.)
  - Clean → integrate leg directly (auto-integrate).
  - Drops → diagnostics onto the run, `needs_review`, release claim, exit.
  - `nRowsTotal = 0` → `error`, loud.
- **Integrate leg**: the existing single transaction, unchanged semantics
  (time-point stamp, per-time-point delete + insert), including the
  pre-transaction re-validation of staged facilities against `facilities_hfa`
  (`integrate_hfa_data/worker.ts:91-105`).
- **Per-run staging tables**: replace the three fixed names from
  `exposed_env_vars.ts` (`uploaded_hfa_data_staging_ready_for_integration`,
  `uploaded_hfa_dictionary_vars_staging`,
  `uploaded_hfa_dictionary_values_staging`) and the THREE intra-worker temps
  (`uploaded_data_staging_raw_hfa`, `temp_valid_facilities_hfa`,
  `temp_keep_rows_hfa`) with `_run_{runId}`-suffixed names recorded in the
  run's diagnostics JSON. Delete the fixed-name constants. Dropped on
  integrate/discard/sweep — which incidentally fixes today's leak
  (`deleteDatasetHfaUploadAttempt` never drops the first two temps).
- Contract compliance via the Phase A shared helpers: READY handshake, throttled
  status-guarded progress writes, finalize on every exit path, boot sweep flips
  stranded `running` HFA runs → `error` + drops their staging tables, workers
  never self-close.
- Launch-time validations (moved from the old step functions, all stateless):
  `facilities_hfa` non-empty (old create-attempt guard), timePoint exists in
  `hfa_time_points` (old step-2 guard), XLSForm sheets present (old step-1
  guard), reserved var names rejected via `isReservedHfaVarName`
  (`lib/hfa_r_code_analysis.ts` — the full set: R keywords, and/or aliases,
  `weight`, `time_point`, `facility_*`; no longer just `weight`; stays inside
  the stage internals).

### B5. Routes

Deleted (registry + handlers + client callers, names re-verified 2026-08-04):
`createDatasetHfaUploadAttempt`, `getDatasetHfaUpload`,
`getDatasetHfaUploadStatus`, `deleteDatasetHfaUploadAttempt`,
`uploadDatasetHfaCsv`, `updateDatasetHfaMappings`,
`getDatasetHfaDuplicatePreview` (added 2026-07-23; its `scan_hfa_rows.ts`
internals survive, re-consumed by the stateless preview below),
`updateDatasetHfaStaging`, `finalizeDatasetHfaIntegration`. `getDatasetHfaDetail` loses its `uploadAttempt`
field (its cache hash is safe — `computeHfaCacheHash` reads only time-point
rows, verified).

Added (all `can_configure_data` except the GET, which follows the family's
existing read guard):

- `launchDatasetHfaCsvRun` — body
  `{ csvUploadToken, xlsFormUploadToken,
  mappings }`; runs the B4 launch-time
  validations, claims via INSERT (partial unique index), spawns the worker. If a
  run is already running: **explicit refusal** (no queue) — "An HFA import is
  already running — wait for it to finish."
- `getDatasetHfaImportRuns` — current + recent runs for the Current/History
  surface.
- `resolveDatasetHfaReview` — body
  `{ runId, action: "integrate_anyway"
  | "discard" }`. Integrate-anyway
  re-claims (refusal if busy); discard → `cancelled` + drop staging tables +
  delete temp uploads.
- Stateless `parseDatasetHfaCsvHeaders` — body
  `{ csvUploadToken,
  xlsFormUploadToken }`; returns CSV headers (+ XLSForm
  sheet check errors) for the mappings step. Reuses today's step-1 parse
  internals.
- Stateless `previewDatasetHfaDuplicates` — body
  `{ csvUploadToken, facilityIdColumn, rowFilters }`; returns
  `HfaDuplicatePreview` for the duplicates step by streaming the temp upload
  through the `scan_hfa_rows.ts` internals (today's stateful
  `getDatasetHfaDuplicatePreview` reads saved step results off the attempt
  row; this re-exposes the same scan without it).

Completion keeps firing `notifyInstanceDatasetsUpdated` (today's step-4
onComplete), from the worker's finalize path.

### B6. Guard deletion

- `getWorker("hfa")` pre-checks and the singleton-row conditional-UPDATE claims
  in `dataset_hfa.ts` die with the attempt functions; the runs table's partial
  unique index is the only claim.
- No cross-family guards exist for HFA (verified) — nothing else to unpick.

### B7. Client

- Modal wizard (shared components from A7), four steps: **Upload** (two
  `FileUploadSelector`s: CSV + XLSForm — today's step_1 relocated) →
  **Mappings** (today's step_2 UI relocated verbatim: `facilityIdColumn` Select
  over parsed headers + `timePoint` Select over `instanceState.hfaTimePoints` +
  the row-filter editor and dedup-strategy control that live there today; time
  points are created on the time-points page, not here) → **Duplicates**
  (today's step_3 relocated, fed by the stateless
  `previewDatasetHfaDuplicates`; auto-skipped when the preview finds none — the
  attempt row's `reviewConfirmed` threading dies) → **Review & launch** (file
  names, header count, time point, filter/dedup summary; Start button only — no
  queue fork; refusal error renders inline).
- HFA page sidebar (`instance_dataset_hfa/index.tsx`): "Start new import" opens
  the modal; the singleton attempt card + its 5 s `getDatasetHfaDetail` poll
  die. In their place: a Current card (running progress / needs_review with
  relocated step-5 diagnostics render + Integrate-anyway/Discard) and a History
  list (time point, file, status, rows integrated, date; click-through shows the
  run's diagnostics). No tabs — no Future.
- Delete `instance_dataset_hfa_import/` (verified file list 2026-08-04: index,
  step_1, step_2, step_3, step_4, step_5, progress_staging,
  progress_integrating, progress_complete — nine files); step_2's
  mapping/filter form, step_3's duplicates review, and step_5's staging-results
  render relocate (step_5, not step_4, holds the diagnostics render today), the
  rest dies ("Remove completed upload form" ceases to exist — History holds
  outcomes).

### B8. Verify (Phase B)

1. `deno task typecheck` + `./validate_migrations`.
2. Harness: second launch while running → explicit refusal; needs_review
   releases the claim and a new launch succeeds while the hold exists; discard
   drops the per-run staging tables and temp uploads; boot sweep flips a
   stranded running row.
3. Live click-throughs (synthetic HFA CSV + minimal XLSForm): clean file →
   auto-integrates, `hfa_time_points.imported_at` stamped, data tables
   populated, History row present with diagnostics; file with duplicate
   facility rows → Duplicates step shows the groups, chosen strategy/overrides
   land in the staged output, no needs_review; dirty file (unknown facility
   ids) → needs_review with the two facility drop counters → Integrate anyway
   completes; delete-data flows unchanged.
4. SYSTEM_06's HFA sections rewritten to the run model (shorter).

---

## Phase C — ICEH (smallest; proves marginal cost ≈ 0)

ICEH import becomes a run in a new `iceh_import_runs` table; the singleton
`iceh_upload_attempts` machinery is deleted. ICEH gets a real worker for the
first time — today's ingest is an un-awaited in-process promise: uncancellable,
progress frozen at 0% for the whole run (the only progress writes are two
literal zeros, `dataset_iceh.ts:414`/`:590`), and no durable import history.
(Correction 2026-08-04: the restart-wedge this plan originally cited is already
recovered at boot — `resetWedgedUploadAttempts` has flipped stuck ICEH attempts
to `error` since 2026-06-11, `db_startup.ts:140`; that sweep arm becomes a
deletion target here. The intra-process wedge — an abandoned promise nothing
can cancel — remains real and is what the worker model fixes.) Facts
re-verified 2026-08-04 against `dataset_iceh.ts` and the client.

### C1. Migration (next free after B's — 072) + base schema

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

No versions table and none created — ICEH's outcome plane is the cumulative
`iceh_indicators`/`iceh_data` store (invariant 4); the run rows are ICEH's
first-ever durable import history.

- `DROP TABLE IF EXISTS iceh_upload_attempts` + remove from base schema.
  Migration `037_iceh_tables.sql` re-creates it on a fresh DB (037 stays
  unrewritten) — the unconditional drop here runs after and removes it, same
  pattern as B1/061.
- **Cache-hash re-derivation (required, verified):** `getIcehCacheHash`
  (`dataset_iceh.ts:46`) currently hashes the ATTEMPT row's
  `date_started:status_type` plus indicator/data-row counts and the
  distinct-years list. Re-derive from the latest `iceh_import_runs` row
  (`id:status`) plus the same data facts — otherwise the client display cache
  never invalidates after imports. **It now has TWO consumers** (2026-07-29):
  the client display cache (`instance.ts:271`) AND the results-run capture
  staleness hash (`datasets_in_project_iceh.ts:53`, read before CSV export) —
  the re-derivation must keep "hash changes iff import state changed" for both;
  C8 verifies the run-capture side.
- Run `./validate_migrations`.

### C2. Types + schemas

- New `IcehImportRunSummary` type in `lib/types` + Zod schemas in
  `lib/api-routes/instance/iceh.ts`.
- `IcehStep1Result` (zip preview) and `IcehStagingResult` reused verbatim.
- Delete with the routes (C5): `IcehUploadAttemptDetail`,
  `IcehUploadAttemptStatus`, `IcehUploadAttemptStatusLight`,
  `IcehUploadAttemptSummary`, `IcehUploadStatusResponse`, and the attempt
  summary on `getDatasetIcehDetail`'s response type.

### C3. Temp uploads

The zip lands via the same asset-upload plumbing, keyed by upload token (A3
mechanism), orphan-swept, deleted on discard/complete. The zip is RETAINED while
a run is in `needs_review` — it is what "Integrate anyway" re-ingests from (C4).

### C4. The ICEH run worker (`server/worker_routines/import_iceh_data/`)

One worker module (new `"iceh"` key added to `WorkerKey` in `worker_store.ts`)
wrapping the internals of `stageAndIntegrateIcehData` — the zip extract,
CSV/xlsx parse, per-row validation, and the single `mainDb.begin` transaction
(delete-by-uploaded-codes + upsert) move into plain functions; the
fire-and-forget call site dies.

- **Stage leg** (in-memory, as today — ICEH is small; no staging tables):
  parse + validate, then evaluate the clean condition. **ICEH clean condition
  (extended 2026-08-04):**
  `(nRowsSkippedUnknownStrat + nRowsSkippedInvalidYear +
  nRowsSkippedUnknownIndicator) = 0 AND validDataRows > 0`. The last two
  counters are NEW — today `isNaN(year)` rows (`dataset_iceh.ts:546`) and rows
  whose indicator code is absent from `indicators.xlsx` (an insert-time
  `continue`, `:616`) drop silently with no counter; both are silent partial
  merges of exactly the kind the gate exists to prevent, so the stage leg
  counts them (the indicator check moves from insert time into stage
  validation — a counted diagnostic, not a change to integration semantics).
  Deliberately
  family-specific: `nRowsSkippedMissingEstimate` does NOT hold the run — "NA"
  estimates are a normal feature of ICEH Retriever exports, not a mapping error;
  they are reported in the diagnostics but never block. Unknown strats, by
  contrast, mean the file doesn't match the strat vocabulary and a silent
  partial merge is exactly what the §9 gate exists to prevent.
  - Clean → integrate leg directly.
  - Unknown-strat drops → diagnostics (counts + the ≤5 raw samples) onto the
    run, `needs_review`, release claim, exit. Because staging is in-memory,
    nothing persists across the hold except the retained zip: **"Integrate
    anyway" re-claims the run and re-runs the full ingest from the zip with the
    gate skipped** — deterministic, and seconds at ICEH scale. (No per-run
    staging tables for ICEH; this is the simplicity trade ruled in §2.)
  - Zero valid rows → `error`, loud.
- **Integrate leg**: the existing single transaction, unchanged (cumulative
  upsert; country-ISO pre-check from today's step-2 moves to launch validation).
- Contract compliance via the shared helpers: READY handshake, throttled
  progress writes (fixes today's frozen 0% progress), finalize on every exit
  path, boot sweep flips stranded `running` runs → `error` (this is the
  wedged-singleton fix), workers never self-close.
- Completion fires `notifyInstanceDatasetsUpdated` from the finalize path
  (today's onComplete callback).

### C5. Routes

Deleted (registry + handlers + client callers, names re-verified 2026-08-04):
`createDatasetIcehUploadAttempt`, `getDatasetIcehUploadAttempt`,
`getDatasetIcehUploadStatus`, `deleteDatasetIcehUploadAttempt`,
`updateDatasetIcehUploadAttemptStep1`, `updateDatasetIcehUploadAttemptStep2`.

Added:

- Stateless `parseDatasetIcehZipPreview` — body `{ zipUploadToken }`; returns
  `IcehStep1Result` (today's step-1 parse re-exposed without the attempt row:
  zip contents check, sheet check, country/indicator/ row/year/strat preview).
  Nothing persisted.
- `launchDatasetIcehRun` — body `{ zipUploadToken }`; re-validates (country-ISO
  match vs instance config, zip parseable), claims via INSERT (partial unique
  index; explicit refusal if a run is running), spawns the worker.
- `getDatasetIcehImportRuns` — Current/History data.
- `resolveDatasetIcehReview` — `{ runId, action }`; integrate_anyway re-claims
  and re-ingests gate-skipped (C4); discard → `cancelled` + delete the temp zip.

Kept forever (unchanged): `getDatasetIcehDetail` (minus the attempt summary,
plus the C1 cache-hash change), `getDatasetIcehDisplayData`,
`deleteDatasetIcehData`, `deleteDatasetIcehIndicators`.

### C6. Guard deletion

The `status_type NOT IN ('staging','integrating')` singleton guards die with the
attempt functions. ICEH has no worker_store presence today and no cross-family
guards (verified) — the new `"iceh"` key + runs-table claim is the entire
concurrency story.

### C7. Client

- Modal wizard, two steps: **Upload** (zip via `TempFileUpload` — the A3
  wizard-temp widget, NOT the old `FileUploadSelector`, which mints permanent
  assets — then the
  zip-contents preview panel from today's step_1, fed by
  `parseDatasetIcehZipPreview`) → **Review & launch** (today's step_2 confirm
  panel: summary + cumulative-replace warning; Start button, refusal inline).
- ICEH page sidebar (`instance_dataset_iceh/index.tsx`): "Start new import"
  opens the modal; the singleton attempt card, its 5 s poll, and the "Remove
  completed upload form" flow die. Current card (running / needs_review with
  unknown-strat samples + Integrate-anyway/Discard) + History list.
- Delete `instance_dataset_iceh_import/` (verified file list: index, step_1,
  step_2, progress_staging, progress_integrating, progress_complete) — the
  preview/confirm panels relocate into the modal steps.
- **ICEH stops consuming `_import_wizard/import_wizard_shell.tsx` — the shell
  is NOT deleted.** It gained a second consumer on 2026-07-13
  (`results_package_wizard/index.tsx:7` — three days before this plan's
  original "only consumer" grep, which was wrong when written). The shell
  survives with that consumer; Phase D moves its `globs` ownership from
  SYSTEM_06 to SYSTEM_08.

### C8. Verify (Phase C)

1. `deno task typecheck` + `./validate_migrations`.
2. Harness: refusal while running; needs_review releases the claim;
   integrate_anyway re-ingests from the retained zip and lands identical data to
   a gate-clean run of the same file; discard deletes the temp zip; boot sweep
   flips a stranded running run row → `error` (replacing the attempt-sweep arm
   deleted from `resetWedgedUploadAttempts`); cache hash changes after a
   completed run AND `computeDatasetIcehRunCapture`'s staleness hash tracks it
   (the second consumer, C1).
3. Live click-throughs (synthetic Retriever-shaped zip): clean zip →
   auto-integrates, data tabs populate, History row present; zip with unknown
   strats → needs_review showing the strat samples → Integrate anyway completes
   and skips those rows; zip with a malformed year or an indicator missing from
   `indicators.xlsx` → needs_review (the two new counters); zip with only NA
   estimates → integrates clean (missing-estimate skips reported, not
   blocking).
4. SYSTEM_06's ICEH sections rewritten to the run model (shorter).

---

## Phase D — burn the scaffolding

Mechanical closeout; every item is a deletion or a doc rewrite.

1. Grep-verify zero remaining references to `upload_attempt`, `uploadAttempt`,
   and `UploadAttempt` across `server/`, `lib/`, and `client/src` (types, DB
   helpers, routes, components; SSE notify payloads are already attempt-free —
   verified 2026-08-04). EXCEPTION: the structure family (`structure_upload_*`)
   stays on attempts and is out of scope. Delete stragglers.
2. Delete any shared helper or component orphaned by A–C. Phases A and B
   already deleted their own leavings (HMIS + HFA worker folders, all
   staging-table-name constants, the HFA `resetWedgedUploadAttempts` arm) —
   what remains is whatever C orphans (the ICEH attempt machinery,
   `instance_dataset_iceh_import/`, the ICEH `resetWedgedUploadAttempts` arm;
   if C leaves the sweep with no arms but structure's, consider whether the
   helper simplifies).
3. Retire HMIS "View previous imports" as an entry point
   (`instance_dataset_hmis/_previous_imports.tsx`; verified HFA/ICEH never had
   one): History click-through to `_import_information.tsx` replaces the
   navigation; versions tables and the detail view itself unchanged
   (runs=operations / outcomes=outcomes, never merged).
4. SYSTEM_06 rewritten around the run model — **must come out shorter than
   the pre-consolidation 425 lines, or the consolidation failed its own
   brief** (Phases A and B already rewrote the HMIS and HFA sections, but at
   464 lines the doc is currently LONGER than the 453-line pre-B baseline —
   C/D must rewrite the ICEH sections AND compress) — and must keep "import
   runs" verbally distinct from the results-runs plane. Fix SYSTEM_06's stale
   wizard-shell note ("consumed by ICEH and the results-package wizard"
   becomes results-package-only) and move `_import_wizard/**` from
   SYSTEM_06's `globs` to SYSTEM_08's (C7). SYSTEM_04 already documents the
   wizard-temp mode (done in A). PROTOCOL_APP_STATE.md's T3 inventory: the
   HMIS line came out in A, HFA in B; the ICEH attempt fetcher comes out
   here, the ICEH import-run fetch goes in. Update the SYSTEM docs' `globs`
   lists for every file added/deleted (`lint:systems` inside
   `deno task typecheck` enforces exactly-one owner and will list orphans —
   note it reads `git ls-files`, so deletions/adds must be STAGED before the
   lint verdict is meaningful).
5. Final verify: `deno task typecheck` + `./validate_migrations` + one clean
   import per family end-to-end.

---

## Sequencing + housekeeping

- **Branch ruling (2026-08-05, supersedes the original merge-to-main
  precondition):** all work lands on **tim-branch**. Phase A was implemented
  there on that ruling (tim-branch already contains the results-runs work the
  original precondition was guarding for).
- C → D in order, each phase's Verify section green before the next begins;
  one commit per phase (Phase B additionally carried a separate review-fix
  commit — an adversarial review pass after the phase commit is a good
  pattern to repeat for C). Severable at every boundary: if priorities shift
  after any phase, the completed families are coherent and the remaining
  ones keep working untouched on the old machinery indefinitely.
- Verification machinery that worked for Phases A and B (rebuild the
  equivalents per phase — the harness files themselves were
  session-scratchpad and are gone): direct-DB harnesses via
  `deno run --allow-all --env-file -c deno.json <file>.ts` with absolute-path
  imports of the server functions — they can spawn the real workers and drive
  launch→gate→integrate end-to-end against the dev DB with disposable
  fixtures (synthetic rows/time points/facilities, deleted in a finally; see
  the B harness gotchas in §0). Run the harness from the REPO ROOT (the
  `-c deno.json` path and `--env-file` resolve relative to cwd). The dev
  server must be RESTARTED for server changes (no --watch), and migrations
  apply at its boot (or call `runInstanceMigrations` from the harness).
- Deploy reality: none of this is deployed until Tim runs the deploy (the
  DHIS2-importer Phases 1–4 are deployed as of 2026-07-20 and working OK;
  Phases A and B are NOT yet deployed); leftover mid-wizard attempts at
  deploy time are discarded by the drop migrations — users relaunch through
  the new wizards once.

## Out of scope (all phases)

- No CSV scheduling, anywhere. Schedules stay HMIS-DHIS2-only.
- No queue for HFA/ICEH (explicit refusal; revisit only on real pain).
- No changes to staging/validation/integration internals in any family — wrap,
  never rewrite. (Relocating internals into callable functions is wrapping;
  changing their SQL/semantics is not.)
- No versions/runs merge, no versions schema changes, no new versions tables for
  HFA/ICEH.
- No wizard engine, no cross-family runs table, no new caches.
- No parallel imports within a family; cross-family overlap is allowed
  (invariant 2) but not otherwise engineered for.
