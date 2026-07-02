---
system: 2
name: Persistence Core & Schema Lifecycle
globs:
  - lib/types/errors.ts
  - server/db/error_classifier.ts
  - server/db/instance/_main_database_types.ts
  - server/db/instance/mod.ts
  - server/db/migrations/**
  - server/db/mod.ts
  - server/db/postgres/**
  - server/db/project/_project_database_types.ts
  - server/db/project/mod.ts
  - server/db/utils.ts
  - server/db_startup.ts
docs_absorbed:
  - DOC_DB_ACCESS_LAYER
  - PROTOCOL_APP_MIGRATIONS
  - DOC_ACCESS_DBS
---
# S2 — Persistence Core & Schema Lifecycle

Postgres connection machinery for the multi-DB model, migrations + JSON data
transforms, fail-stop boot, backup/restore mechanics.

> Stub — full prose lands in this system's first review cycle
> (PLAN_DOC_CONSOLIDATION); the `docs_absorbed` files are inlined and
> deleted then.

## Scope

The `globs:` frontmatter above is the lint-enforced manifest
(`lint_systems.ts`); sub-file custody exceptions are in SYSTEMS.md §4.1.
`server/db/postgres/**`, `db/utils.ts`, `db/error_classifier.ts`, db barrels,
`db/migrations/**` (runner + SQL + transforms — transform *mechanics* owned
here, each transform's *schema knowledge* co-reviewed by its domain system),
base schemas + `_main_database_types.ts` / `_project_database_types.ts`,
`db_startup.ts`, root `validate_migrations`, the restore body of
`routes/instance/backups.ts`, project-DB create/drop in
`db/project/projects.ts`, `lib/types/errors.ts`.

## Contract

Project DBs named by bare UUID; pooled cached connections (READ_ONLY flag is
*nominal* — never enforced); one error funnel; boot is fail-stop; stored-JSON
evolution via transforms with skip-gates. Trap: boot success is bound to
panther schema versions via `_figure_block.ts`.

## FigureBundle backfill — the boot-time cutover (shipped 2026-06-13)

This is S2's slice of the FigureBundle refactor; the bundle shape and the render
side live in [SYSTEM_10](SYSTEM_10_figure_render_export.md). S2 owns the
**migration** that converts every stored figure from the old
`{ figureInputs?, source? }` to the new `{ bundle? }` — a textbook
PROTOCOL_APP_MIGRATIONS data-transform (one deploy, no offline script).

- **Where.**
  [server/db/migrations/data_transforms/_figure_block.ts](server/db/migrations/data_transforms/_figure_block.ts)
  holds the shared conversion; the four per-surface sweeps (`slide_config.ts`,
  `dashboard_config.ts`, `dashboard_items.ts`, `reports.ts`) call
  `transformFigureBlock` then `transformFigureBlockToBundle` on each block. The
  strict `figureBlockSchema` final-parse aborts boot if any row is still legacy
  after transform (the skip-gate gotcha made safe by strictness).
- **chart / table / map → in-place.** The raw rows already sit in the blob
  (`figureInputs.{tableData|chartData|chartOHData|mapData}.jsonArray`, never
  stripped). Reshape to `items` (+ `valueProps` from the stored `jsonDataConfig`).
  Value-exact; values are coerced to strings to match the bundle's
  `Record<string,string>` items.
- **timeseries → reverse-transform the stored grid.** Only timeseries stored the
  transformed 5-D grid instead of `jsonArray`. The forward transform is a strict
  one-cell-one-row pivot (it throws on collisions), so the grid is **lossless and
  reversible**: emit one row per non-empty cell keyed by header id + period id.
  It is **self-validating** — `validateTimeseriesRoundTrip` does a direct lookup
  for every stored cell and **throws** if any value isn't recoverable
  (fail-fast → aborts boot). It reconstructs the original rollup-aware sort and
  `dateRange` (from `timeMin`/`nTimePoints`) so a mismatch is the only reason to
  fail. **Orphans dissolve**: a timeseries whose metric is uninstalled in-project
  converts from its own grid exactly like any other — no re-query, no `mainDb`, no
  blank placeholders.
- **Localization synthesis.** `getTransformLocalization(countryIso3)` builds the
  frozen `localization`: `language`/`calendar` from the instance env
  (`_INSTANCE_LANGUAGE`/`_INSTANCE_CALENDAR`), and `countryIso3` read **once** from
  the main DB at startup ([db_startup.ts](server/db_startup.ts)) and threaded
  through every project sweep — so backfilled figures carry the real country
  (drives admin-area relabelling at render). `provenance.moduleLastRun` is
  best-effort (= `snapshotAt`); the Phase-4 stale-flag is therefore approximate for
  backfilled figures (accepted).
- **Invalid config fails fast.** A missing/invalid `source.config` **throws**
  rather than producing a silent blank (which would masquerade as "empty" past
  `figureBlockSchema`), so the dry-run surfaces it by id.
- **Shared traversal.** `walkSlideLayoutNodes` (exported from `_figure_block.ts`)
  is used by both the `slide_config` boot sweep and the dry-run, so the two cannot
  drift in how they walk a slide layout.

### The mandatory pre-deploy dry-run gate

[validate_figure_bundle_backfill.ts](validate_figure_bundle_backfill.ts) (repo
root) runs the exact reshape + round-trip in **read-only** mode against every
instance's DBs before the cutover: per-outcome counts (in-place ok / timeseries
round-trip ok / FAIL / already-bundle / empty) and the identity of every failure.
The cutover deploys only when it is clean (zero round-trip failures) on all
instances. Result of the gate: **36/36 instances, 17,142 figures, 0 FAILs.**

## Docs absorbed (Phase 2)

- [DOC_DB_ACCESS_LAYER](DOC_DB_ACCESS_LAYER.md)
- [PROTOCOL_APP_MIGRATIONS](PROTOCOL_APP_MIGRATIONS.md)
- [DOC_ACCESS_DBS](DOC_ACCESS_DBS.md)

## Open items

_Populated during this system's review cycle (review -> triage -> fix ->
document, SYSTEMS.md §5)._
