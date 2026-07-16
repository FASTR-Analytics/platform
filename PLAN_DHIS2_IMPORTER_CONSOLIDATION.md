# Plan — Import consolidation: config-on-client, run-on-server, for HMIS + HFA + ICEH

**Status (2026-07-16): proposal, nothing built. Supersedes PLAN_DHIS2_IMPORTER.md
§9 (Phase 5, CSV re-flow)** — everything §9 ruled (launch-and-observe, the
conditional review gate, hold-with-diagnostics) survives here as run states
instead of attempt states. Designed with Tim 2026-07-15/16. Multi-phase,
multi-session; each phase independently shippable and severable. Phase A is
specced mechanically; B/C/D are sketched and get their mechanical detail
when their turn comes (after A's design survives contact with reality).

**Hand-off rule: "implement this" means implement Phase A, then stop.**
Phases B/C/D are deliberately not specced yet — after Phase A lands and
survives Tim's live verification, the next session writes B's mechanical
spec as a diff-of-a-diff against A.

## 0. For the implementing agent

- **Scope:** this repo only — no panther or wb-fastr-modules changes. Commit
  to the current branch. Nothing deploys until Tim runs the deploy.
- **Read first:** DOC_API_ROUTES.md (registry-as-contract),
  DOC_DB_ACCESS_LAYER.md (SQL-safety rule — no parameterized table names),
  PROTOCOL_APP_MIGRATIONS.md, DOC_WORKER_ROUTINES.md (READY handshake,
  teardown contract), DOC_TASK_EXECUTION_DIRTY_STATE.md,
  DOC_STATE_RULES.md + DOC_STATE_MGT_INSTANCE.md (wizard state is T3/T5
  client-local), PROTOCOL_UI_STRUCTURE. SYSTEM_06_ingestion.md describes the
  machinery being replaced; PLAN_DHIS2_IMPORTER.md §9 holds the review-gate
  rationale.
- **Orientation (today's HMIS import machinery):** runs plane =
  `server/db/instance/dataset_hmis_import_runs.ts` +
  `server/worker_routines/import_hmis_data_dhis2/` (worker, scheduler,
  dispatch); attempts plane (dies in Phase A) = the CSV upload-attempt
  routes in `lib/api-routes/instance/datasets.ts` ("Upload workflow"
  block) + `server/routes/instance/datasets.ts` handlers + client
  `instance_dataset_hmis_import/`; imports surface =
  `client/src/components/instance_dataset_hmis/dhis2_run/`; CSV
  staging/integration internals (wrap, never rewrite) =
  `server/server_only_funcs_importing/stage_hmis_data_csv.ts` +
  `server/worker_routines/integrate_hmis_data/`.
- **Line anchors in this plan drift** (the file is under active parallel
  work) — treat every `file:line` as a hint; re-grep the symbol before
  editing.
- **Verify per A8.** Live click-throughs need a dev instance with HMIS
  facilities imported; the harness checks run against the dev DB
  (rolled-back transactions where possible).

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
   anyway); within a family, never.
3. **Nothing persists before launch.** Wizard state is client-local
   signals in a modal (single-user by construction). The only pre-launch
   server artifact is the uploaded file itself — a temp upload keyed by
   token, orphan-swept if never launched. Abandoning a wizard is a no-op
   by construction: zombie drafts stop being *possible* rather than being
   handled.
4. **Runs are operations, versions are outcomes.** Per-family version
   tables keep the rich outcome metadata (rows inserted/updated, staging
   diagnostics). Runs link to versions; History rows click through to
   version detail. Never merged.

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
  shell pattern, upload step, review-step frame with the live
  Start-vs-Queue fork, run-row/status rendering, history table). NOT
  shared: SQL (per-family DB functions stay thin and family-owned — also
  keeps the DOC_DB_ACCESS_LAYER SQL-safety rule intact: no parameterized
  table names), and NO config-driven wizard engine — three plain wizards
  sharing parts beat one clever abstraction (variants are bounded at
  four, forever).
- **Asymmetry by design.** HMIS is the main event (DHIS2 primary source,
  huge, always updating) and gets the full machine: queue, scheduler,
  needs_review, per-pair DHIS2 + single-transaction CSV. HFA and ICEH
  are small single-CSV families and get deliberately smaller machines:
  one-at-a-time claim + **explicit refusal** ("an import is running —
  wait"), NO queue, NO scheduler/tick involvement, NO Future tab — just
  a Current card and a History table. If refusal ever genuinely hurts,
  a queue can be added then, not speculatively now.
- **CSV keeps single-transaction integration** in every family. Per-pair
  atomicity is right for DHIS2 because pairs are independent fetch
  units; a CSV is one coherent authored artifact. The run model changes
  who schedules and displays the work, not the atomicity that's right
  for the source.
- **The §9 conditional review gate stays, generalized** (Tim's earlier
  ruling, unchanged): clean staging (every `validation.*.rowsDropped`
  = 0 AND staged rows > 0) → auto-integrate unattended; any dropped
  rows → run holds in `needs_review` with the step-4 diagnostics +
  "Integrate anyway" / "Discard" actions on the imports surface; zero
  staged rows → loud `error`. CSVs are user-authored; a bad mapping
  silently dropping 90% of rows must not merge the surviving 10%
  unattended.
- **One deliberate change from §9 (flagged for Tim; rationale below):**
  a `needs_review` run RELEASES the single-running slot instead of
  occupying it. §9 said a held attempt occupies the CSV slot; under the
  runs model that would let one unreviewed CSV block scheduled DHIS2
  imports indefinitely — unacceptable now both share a lane. Made safe
  by per-run staging tables (§4.4): the held run's staged rows can't be
  clobbered by an intervening import. "Integrate anyway" re-claims the
  slot (queues if busy).

## 3. End-state (what exists when Phase D closes)

- Per family: one runs table, one worker (wrapping that family's
  existing staging/validation/integration internals untouched), one
  modal wizard, one Current/History surface (HMIS also has Future).
- Deleted: `dataset_hmis_upload_attempts`, `hfa_upload_attempts`,
  `iceh_upload_attempts`; every step-resync route; the cross-guard
  lattice; all sidebar draft/staging/integrating attempt cards and
  their polling; the resumable-wizard client logic; "View previous
  imports" as an entry point (content reachable from History
  click-through; versions tables and `ImportInformation` unchanged).
- The failure-mode knowledge from Phase 3/4 reviews (claim races,
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
2026-07-16 — use the next free number at build time.)

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
- `DROP TABLE dataset_hmis_upload_attempts` + remove from base schema.
  Build-time check per the base-schema-vs-drop rule: verify no older
  migration references it before dropping from base (it appears to be
  base-schema-born, `_main_database.sql:412` — confirm, then delete
  cleanly).
- Run `./validate_migrations`.

Pair counters (`total_pairs` etc.) stay 0 for CSV runs — pair columns
are DHIS2 diagnostics; CSV diagnostics ride `run_stats`/`csv_config` and
the staging result on the version row, as today.

### A2. Types + schemas (`lib/`)

- `DatasetHmisImportRunSummary`: add `source: "dhis2" | "csv"`, optional
  `csvFileName`, status union gains `"needs_review"`. Zod schemas in
  `lib/api-routes/instance/datasets.ts` follow (discriminated where the
  wire shape forks).
- New `DatasetHmisCsvRunConfig` type (uploadToken/fileName/mappings) —
  reuse the existing step-2 mappings type verbatim; do not redesign the
  mapping shape.

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
`integrate_hmis_data`. Two legs, one worker module:

- **Stage leg** (run status `running`): stage the file, evaluate the
  clean condition server-side (the exact §9 condition: every
  `validation.*.rowsDropped` = 0 AND `finalStagingRowCount > 0`).
  - Clean → proceed straight to the integrate leg (auto-integrate,
    no human).
  - Dropped rows → write diagnostics to the run, flip to
    `needs_review`, **release the claim** (§2's flagged decision),
    exit worker.
  - Zero staged rows → `error`, loud.
- **Integrate leg**: the existing single-transaction CSV integration
  (version minted MAX(id)-inline as today, ledger writes unchanged,
  scoped-delete interplay unchanged).
- **Per-run staging table** (`staging_hmis_csv_run_{runId}` or
  equivalent suffix scheme): staging output must survive a
  `needs_review` hold across other imports running in between, and be
  dropped on integrate/discard/sweep. This replaces the fixed-name
  staging table assumption — it is the one piece of new mechanism in
  the whole phase, and what makes releasing the slot safe.
- Contract compliance throughout: READY handshake, status-guarded
  progress writes (the 2 s throttle helper), finalize on every exit
  path, boot sweep covers `running` CSV runs (flip to `error`, drop the
  staging table), workers never self-close.
- **This is where the shared helpers get extracted**: pull the
  throttled-progress writer, finalize-retry shape, error classification,
  and sweep registration out of `import_hmis_data_dhis2/` into shared
  worker-contract helpers consumed by both workers. Extraction with two
  concrete consumers, no speculation.

### A5. Routes (registry-first, per DOC_API_ROUTES)

Deleted (registry + handlers + client callers — the "Upload workflow"
block in `lib/api-routes/instance/datasets.ts`, names verified
2026-07-16): `createDatasetUploadAttempt`, `setDatasetUploadSourceType`,
`getDatasetUpload`, `getDatasetUploadStatus`, `deleteDatasetUploadAttempt`,
`uploadDatasetCsv`, `updateDatasetMappings`, `updateDatasetStaging`,
`finalizeDatasetIntegration`.
`getDatasetHmisDetail` loses its `uploadAttempt` field
(`lib/types/dataset_hmis.ts`).

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
- Deleted client code: `instance_dataset_hmis_import/` (index,
  step_1_csv, step_2_csv, step_3, step_4_csv, progress_*) — reusable
  pieces (upload widget, mappings UI, diagnostics render, progress
  bars) move to their new homes rather than being rewritten.
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
3. Live click-throughs: clean CSV → auto-integrates unattended, the
   version and ledger rows land, History row links the version; dirty CSV (bad
   mapping) → needs_review card with correct dropped-row diagnostics →
   Integrate anyway completes; zero-row CSV → loud error; cancel
   mid-staging keeps nothing.
4. SYSTEM_06's HMIS-CSV sections rewritten to the run model (shorter).

---

## Phase B — HFA (mechanical repetition, smaller machine)

- `hfa_import_runs` table: id, status
  (`running | needs_review | complete | error | cancelled` — **no
  `queued`**), csv_config, diagnostics, version/time-point linkage per
  HFA semantics, started/ended/triggered_by, partial unique index on
  running. Claim = insert-running; concurrent attempt → explicit
  refusal with today's copy conventions ("an import is already
  running — wait for it to finish").
- Worker wraps `stage_hfa_data_csv` + `integrate_hfa_data` internals
  under the shared contract helpers. Same §9 gate semantics (HFA's
  validation is the most intricate — biggest beneficiary of
  hold-with-diagnostics).
- Modal wizard: upload → HFA mappings/time-point step (reuse existing
  UI) → review. No queue fork (refusal instead).
- HFA page: Current card + History table (no tabs needed — no Future).
- Delete: `hfa_upload_attempts` + its step routes +
  `updateDatasetHfaUploadAttempt_Step1-4` + sidebar attempt states.
- Mechanical spec written when Phase A lands (it will mostly be a
  diff-of-a-diff against A).

## Phase C — ICEH (smallest; proves marginal cost ≈ 0)

- Same shape as B: `iceh_import_runs`, worker wrapping the ICEH ingest,
  near-trivial wizard (upload → review), Current card + History,
  delete `iceh_upload_attempts` + routes.
- If the framework is right, this phase is days. If it isn't, that's
  the signal to stop and rethink before Phase D.

## Phase D — burn the scaffolding

- Delete every remaining attempt-machinery remnant and shared helper
  now orphaned; grep-verify `upload_attempt` is gone from the codebase.
- Retire "View previous imports" as an entry point on all family pages
  (History click-through to `ImportInformation` replaces the
  navigation; versions tables and the detail view unchanged —
  runs=operations / versions=outcomes, never merged).
- SYSTEM_06 rewritten around the run model — **must come out shorter
  than today's, or the consolidation failed its own brief**.
- PLAN_DHIS2_IMPORTER.md: §9 marked superseded by this plan at Phase A
  (see below); once Phases A–D land the old plan is deletable per its
  own rule (Phases 0–4 are complete as-built record; relocate the
  deploy loose end before deleting).

---

## Sequencing + housekeeping

- A → B → C → D, severable at every boundary: if priorities shift after
  A, HMIS is complete and coherent, and HFA/ICEH keep working untouched
  on the old machinery indefinitely.
- **At Phase A start**: add a dated line to PLAN_DHIS2_IMPORTER.md's
  Status block marking §9 SUPERSEDED → this plan (do not delete §9's
  text — it holds the gate rationale referenced above).
- Deploy reality (unchanged from the parent plan): none of this is
  deployed until Tim runs the deploy; leftover mid-wizard attempts at
  deploy time = the existing delete-and-relaunch note.

## Out of scope (all phases)

- No CSV scheduling, anywhere. Schedules stay HMIS-DHIS2-only.
- No queue for HFA/ICEH (explicit refusal; revisit only on real pain).
- No changes to staging/validation/integration internals in any family
  — wrap, never rewrite.
- No versions/runs merge, no versions schema changes.
- No wizard engine, no cross-family runs table, no new caches.
- No parallel imports within a family; cross-family overlap is allowed
  (invariant 2) but not otherwise engineered for.
