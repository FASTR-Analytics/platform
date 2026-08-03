# Plan: Results-package generation — always full capture (drop windowing at generation)

**Status: IMPLEMENTED 2026-08-03** (uncommitted). All open items resolved by
code verification before implementation: capture functions had exactly one
caller each (`prepare_inputs.ts`; the backfill synthesizer
`server/runs/synthesize_run.ts` copies legacy project `datasets.info`
verbatim and needed no change); no `RUN_MANIFEST_SCHEMA_VERSION` bump
(`runDatasetSchema.info` is `z.unknown()` and nothing reads
`info.windowing`/`info.serviceCategoryScope`); legacy windowed packages
coexist with no gate; no defaults migration (`getRunGenerationDefaultsConfig`
safeParse-degrades by design, and the step1 field now carries `.catch(null)`
so module/parameter defaults survive the shape change); item 5 was moot (no
client rendered the windowing stamps). Windowing types stay in `lib` (Tim's
ruling) for reuse by [PLAN_PROJECT_DATA_SUBSETTING.md](PLAN_PROJECT_DATA_SUBSETTING.md),
as do `WindowingSelector` + `hmis_windowing_validation.ts` (the instance
delete-data tool still uses the selector). SYSTEM_08 updated. Written 2026-08-03.

**Ruling (Tim, 2026-08-03):** generation always captures the FULL HMIS
dataset — entire time period, all indicators, all admin areas, all facility
types/ownerships — and the FULL HFA dataset (all service categories). No
windowing at generation. Reasons:

1. The R scripts (disruptions analysis, completion imputation, etc.) need the
   full dataset to compute correctly — a windowed input silently degrades
   their output.
2. Generation is now instance-level (SYSTEM_08). "Run once on everything,
   then filter into projects" is strictly better than re-running generation
   per subset.

Subsetting is relocated to attach time, as a per-project filter applied at
query time against the (always-full) package — see the companion plan,
[PLAN_PROJECT_DATA_SUBSETTING.md](PLAN_PROJECT_DATA_SUBSETTING.md). Ship this
plan first: it's the R-script-correctness-critical half and stands on its own
even before subsetting exists (every project just sees the full package,
same as today's "no windowing selected" case).

This corrects SYSTEM_08_results_packages.md, which currently documents
generation-time windowing as if it were the ruled design (invariant 1/3
language about immutable, non-project-FK'd packages was right; the windowing
step baked into that package was not). Update SYSTEM_08 once this plan lands.

## Current state (verified 2026-08-03)

- Wizard step 1 (`client/src/components/results_package_wizard/step_1.tsx`)
  embeds `WindowingSelector` (`client/src/components/WindowingSelector.tsx`)
  for HMIS (period range + indicator/admin-area/facility-type/ownership
  scoping) and a smaller service-category picker for HFA
  (`step_1.tsx:98-145`).
- That selection becomes `RunGenerationStep1Result` (`lib/types/run_generation.ts:21-25`)
  — `hmis: {windowing} | null`, `hfa: {serviceCategoryScope} | null` — saved
  onto the wizard attempt and, optionally, into the instance defaults store
  (see [PLAN_MODULE_INSTANCE_DEFAULTS.md](PLAN_MODULE_INSTANCE_DEFAULTS.md)).
- At launch, `prepareRunInputs`
  (`server/worker_routines/generate_run/prepare_inputs.ts:108-146`) calls:
  - `computeDatasetHmisRunCapture(mainDb, runCsvTarget("hmis"), step1.hmis.windowing)`
    → `server/db/project/datasets_in_project_hmis.ts:150-260` — builds a
    Postgres `COPY … TO` scoped by the windowing (`getDatasetHmisExportStatement`),
    writes the filtered extract into `runs/.tmp-{runId}/inputs/datasets/hmis.csv`.
  - `computeDatasetHfaRunCapture(..., step1.hfa.serviceCategoryScope)` →
    `server/db/project/datasets_in_project_hfa.ts:70-292` — filters which
    indicator definitions/R-code ship in the run by service category
    (lines 105-134); note the `hfa_data` row export itself (174-192) is
    **already unconditional** — all facilities/time_points/vars, every
    project. Only the indicator/definition set is scoped today.
- The resulting windowing is recorded in `manifest.json` via
  `DatasetHmisInfoInProject.windowing` / `DatasetHfaInfoInProject.serviceCategoryScope`
  (`lib/types/datasets_in_project.ts:24-48`), surfaced on the project's
  Datasets tab (`getProjectDatasetsFromManifest`, `server/run_query/run_read.ts:323-331`).

## Work items

1. **Capture functions**: `computeDatasetHmisRunCapture` /
   `computeDatasetHfaRunCapture` always export full scope. Decide: keep the
   parameter but force it to a canonical "full" value at the one call site
   (`prepare_inputs.ts`) — least churn — vs. remove the windowing/scope
   parameter from the function signatures entirely — cleaner, more churn.
   **Needs investigation**: enumerate every caller of both functions (confirm
   whether `backfill_runs.ts` also calls them, and with what — synthetic
   backfills may need different treatment since they're built from frozen
   pre-cutover project Postgres state, not a fresh COPY).
2. **Wizard step 1 UI**: drop `WindowingSelector` and the HFA service-category
   picker from `step_1.tsx`. Step 1 becomes plain family-inclusion checkboxes
   (HMIS on/off, HFA on/off) — no scoping form.
3. **Types**: `RunGenerationStep1Result` loses its windowing/scope payload
   (becomes just which families are included, if that's still needed as a
   distinct step, or folds into step 2). `DatasetHmisWindowingCommon`
   (`lib/types/dataset_hmis.ts:27-59`) itself is NOT necessarily dead — **needs
   investigation**: it's also used by the still-live instance "delete a
   period/window of raw data" tool
   (`client/src/components/instance_dataset_hmis/_delete_data.tsx`), which is
   a genuinely different feature (destroying raw ingested data, not
   generation input scoping) and must keep working. Confirm before deleting
   or renaming the shared type.
4. **Manifest fields**: `DatasetHmisInfoInProject.windowing` and
   `DatasetHfaInfoInProject.serviceCategoryScope` become misleading under
   full capture. **Needs investigation/decision**:
   - Force them to canonical "full" values (min churn, but keeps a
     now-meaningless field around) vs. drop the fields from the info shape
     entirely (cleaner, but `info` is `z.unknown()` in the manifest schema —
     `runDatasetSchema`, `lib/types/run_manifest.ts:98-103` — so check whether
     dropping a field here counts as a shape change requiring a
     `RUN_MANIFEST_SCHEMA_VERSION` bump per SYSTEM_08 invariant 4, or whether
     `z.unknown()` sidesteps that).
   - Whether existing already-generated (windowed) packages need to be
     regenerated, or whether the reader should treat a present `windowing`
     object as "this specific legacy package really was windowed" and a
     missing/forced-full one as "full capture" — i.e. can the two package
     generations coexist without a hard schema-version gate.
5. **Datasets tab display**: update the client copy that renders
   `info.windowing` / `info.serviceCategoryScope` (consumer of
   `getProjectDatasetsFromManifest`) to reflect full-capture packages
   correctly, and decide how it should render for any surviving legacy
   windowed packages (see item 4).
6. **Instance defaults store migration**: `run_generation_defaults.step1`
   shrinks along with the type change (see
   [PLAN_MODULE_INSTANCE_DEFAULTS.md](PLAN_MODULE_INSTANCE_DEFAULTS.md)).
   Since this is a stored JSON blob in `instance_config`, apply the CLAUDE.md
   rule for renaming/deleting a stored JSON field: a transform + forced
   skip-gate is normally required (Zod strip mode silently drops unknown
   keys with no error). **Needs investigation**: does `instance_config`
   go through the same migration/validation machinery as project/instance
   SQL migrations (`PROTOCOL_APP_MIGRATIONS.md`), or is it read with a
   looser parse that tolerates stale keys already? Confirm before deciding
   whether a real migration step is needed here or whether "old stored
   defaults just lose their windowing sub-object on next read" is safe.
7. **HFA capture**: drop `serviceCategoryScope` filtering entirely at
   generation (always ship every service category's indicator
   definitions/R-code). Confirm no other generation-time consumer depends on
   a narrowed indicator set (e.g. R execution time/resource concerns from
   always running the full HFA indicator set — worth a sanity check, not
   expected to be a blocker given HMIS is the larger dataset).

## Open items (explicitly left for investigation, not yet ruled)

- Full caller list for both capture functions, including `backfill_runs.ts`.
- Whether dropping/forcing manifest windowing fields requires a
  `RUN_MANIFEST_SCHEMA_VERSION` bump (breaking — every existing package would
  need regeneration) or can be additive.
- Whether legacy windowed packages remain queryable/displayable as-is
  indefinitely, or get superseded/regenerated as part of rollout.
- Whether `instance_config.run_generation_defaults` needs a real migration
  step or tolerates the shrinking schema safely on next read/write.
