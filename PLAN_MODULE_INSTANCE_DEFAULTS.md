# Plan: Module instance-level defaults — a dedicated settings surface

**Status: not started.** Written 2026-08-03 from Tim's ask: "we need a place
to set module settings at instance level. then, any new results packages
should take those defaults as the starting point."

## What already exists (verified 2026-08-03)

The storage and the seeding behavior are already built — what's missing is a
place to reach them without running the wizard.

- **Storage**: `instance_config` table, key `run_generation_defaults`, one row
  per instance. `getRunGenerationDefaultsConfig` /
  `updateRunGenerationDefaultsConfig` in `server/db/instance/config.ts:287-336`.
  Shape (`runGenerationDefaultsSchema`, `lib/types/run_generation.ts:46-61`):
  `step1` (data-family/windowing selection — see
  [PLAN_FULL_CAPTURE_GENERATION.md](PLAN_FULL_CAPTURE_GENERATION.md), this
  sub-shape is shrinking), `moduleIds` (default module set), and
  `parameterSelections` (per-module param key → value).
- **Routes**: `getRunGenerationDefaults` / `saveRunGenerationDefaults`,
  `server/routes/instance/run_generation.ts:96-119`, gated
  `can_configure_data`.
- **Write path**: wizard step 3 "Save these selections as instance defaults"
  button, `client/src/components/results_package_wizard/step_3.tsx:95-105,
  255-266`. Attach targets are deliberately excluded from the save (per-run
  act, not a config default).
- **Read/seed path**: wizard step 2 merges "resume beats the instance
  defaults store beats definition defaults" when pre-filling module selection
  and param forms (`getMergedModuleConfigSelections`,
  `client/src/components/results_package_wizard/step_2.tsx:136-170`); step 1
  does the same for the data-family selection (`step_1.tsx:30-34, 63`).

So the *mechanism* — store, seed order, save action — is already correct and
already satisfies "new results packages take those defaults as the starting
point." The gap is purely discoverability: today the only way to see or
change the current defaults is to open the generation wizard, walk through
it, and hit Save. There's no page to review or edit them independently.

## What this plan needs to add

1. **A dedicated view to see and edit current defaults**, outside the wizard
   flow — list modules with their default param values and the default
   moduleIds selection, editable without re-running generation.
2. Placement — needs investigation:
   - Where do other instance-level settings live? Check
     `SYSTEM_15_admin_ops.md` and its `server/routes/instance/` +
     `client/src/components` surfaces for the existing pattern (users/roles,
     backups, health, disk) and follow it rather than inventing a new shell.
   - Is this a full standalone page, or a section bolted onto an existing
     instance-admin screen?
3. **Sequencing with [PLAN_FULL_CAPTURE_GENERATION.md](PLAN_FULL_CAPTURE_GENERATION.md).**
   That plan drops the windowing sub-object out of `RunGenerationStep1Result`
   (and therefore out of `runGenerationDefaultsSchema.step1`). Build this
   defaults-surface work either after that schema change lands, or in a way
   that doesn't hard-code the current `step1` shape, to avoid rework.
4. Confirm the existing routes (`getRunGenerationDefaults` /
   `saveRunGenerationDefaults`) are the right shape for a standalone editor,
   or whether an edit-only view needs its own narrower route (e.g. editing a
   single module's params without touching `moduleIds`/`step1`).

## Open items (investigate before implementation)

- Exact placement (new instance-admin page vs. existing screen section).
- Whether module param editing needs per-field validation surfaced outside
  the wizard's existing param-form component, or whether that component can
  be reused standalone (`client/src/components/results_package_wizard/`
  param form — identify the exact component during implementation).
- Whether `moduleIds` selection (which modules are pre-checked) needs its own
  UI here or is out of scope for "module settings" (Tim's phrasing leans
  toward per-module parameter defaults; confirm scope before building).
