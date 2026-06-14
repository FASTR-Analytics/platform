# FigureBundle — follow-on work (backlog)

> The FigureBundle refactor (P1 + P2) shipped 2026-06-13. Its two driving plans
> were deleted on completion; the **architecture** now lives durably in the SYSTEM
> docs — primary: [SYSTEM_10](SYSTEM_10_figure_render_export.md) §FigureBundle;
> slices in [S9](SYSTEM_09_viz_query_cache.md), [S12](SYSTEM_12_documents_sharing.md),
> [S2](SYSTEM_02_persistence.md). This file holds only the **deferred** work that
> was explicitly out of scope (Phase 4, Phase 5), plus the one open follow-on the
> shipped-state audit surfaced. Fold each into the owning system's next review cycle.

## Phase 4 (additive) — provenance wiring + the stale-badge / "Update data" UI

The bundle already reserves room: `provenance` carries `moduleLastRun` and
`datasetsVersion` (both free from the ItemsHolder). Phase 4 adds the rest.

- **Wire the two import timestamps** into `provenance` (the schema currently omits
  them; add as optional):
  - `instanceDataImportedAt` — when the dataset(s) were imported into the instance.
  - `projectDataAddedAt` — when the dataset version was brought into the project.
  The metric → source-datasets → import-time path is a multi-hop join not yet
  traced; may need a column, not just a read (verify `datasets_in_project_*` is even
  timestamped). Owners: S6/S5 (timestamps) + S9 (capture them onto the bundle).
- **Stale-badge — no re-query.** "Needs update?" = compare the bundle's captured
  `(moduleLastRun, datasetsVersion)` against the current values the client already
  holds cheaply (module summaries carry `lastRunAt`; `datasetsVersion` is instance
  metadata). Diff → a badge, zero per-figure queries. Semantics: flags "the data
  **version** moved," not "values definitely changed" — exactly right for an
  "update available" nudge. **Caveat:** backfilled figures have an approximate
  `moduleLastRun` (= `snapshotAt`), so their badge is best-effort until first
  re-capture.
- **"Update data" action.** Re-run the same live query the editor runs
  (`config` + `metricId`) → fresh items → reassemble the bundle (re-derive
  `dateRange`, re-capture `provenance`, bump `snapshotAt`). Per-figure; "Update all"
  is the same call in a loop. Stays an explicit user action (preserves the
  publish-time freeze). Edge: a figure whose metric is uninstalled in-project can't
  re-query → action disabled / "source unavailable" (it still rendered fine — being
  un-updatable ≠ un-migratable).
- **User-facing freshness fingerprint** = the provenance block. Five requested
  fields: earliest/latest point (`dateRange.min/.max` — already in bundle), module
  run time + datasets version (free), instance/project import times (the two above,
  need wiring). Three of five already free.

Owner: S12 (the UI) + S9 (re-query/reassemble) + S6/S5 (import timestamps).

## Phase 5 (optional, separate mechanical PR) — the Visualization rename

Rename **presentation object → Visualization** end-to-end: the
`presentation_objects` table, `/presentation_objects` routes,
`PresentationObjectConfig`, `ItemsHolderPresentationObject`, and the dozens of
files that use those names. No behavior change — a large mechanical sweep, so its
own focused PR (like the snapshot-naming pass), never bundled with feature work.
The FigureBundle refactor deliberately kept the PO names to stay separable.

## Slide write-route body validation → its own plan

The shipped-state audit found `createSlide`/`updateSlide` still use
`slide: z.unknown()` — a real ZOD/panther type reconciliation (not the trivial
sentinel tidy first assumed; reports already validate via `reportFiguresSchema`).
Tracked separately: [PLAN_SLIDE_BODY_SCHEMA.md](PLAN_SLIDE_BODY_SCHEMA.md).
