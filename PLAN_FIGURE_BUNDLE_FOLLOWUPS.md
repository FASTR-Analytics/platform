# FigureBundle — follow-on work (backlog)

> The FigureBundle refactor (P1 + P2) shipped 2026-06-13. Its two driving plans
> were deleted on completion; the **architecture** now lives durably in the SYSTEM
> docs — primary: [SYSTEM_10](SYSTEM_10_figure_render_export.md) §FigureBundle;
> slices in [S9](SYSTEM_09_viz_query_cache.md), [S12](SYSTEM_12_documents_sharing.md),
> [S2](SYSTEM_02_persistence.md). This file holds only the **deferred** work that
> was explicitly out of scope, plus small residual cleanups the shipped-state audit
> turned up. Fold each item into the owning system's next review cycle.

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

## Residual cleanups (small — from the 2026-06-13 shipped-state audit)

These are leftovers where the cutover landed the new path but did not finish
removing the old one. None is load-bearing; each is a safe tidy.

1. **Delete the dead old build path.** `getFigureInputsFromPresentationObject`
   ([client/src/generate_visualization/get_figure_inputs_from_po.ts](client/src/generate_visualization/get_figure_inputs_from_po.ts))
   is the pre-bundle ambient-localization builder — superseded by
   `buildFigureInputs`, now **zero importers** and not exported from `mod.ts`. Safe
   to delete the file. (Owner: S10.)
2. **Tighten the now-schemable route bodies.** With the sentinel layer gone, the
   slide/report write bodies that PLAN_API_ZOD batch 6 left at `z.unknown()` can
   validate against `figureBlockSchema`. (Owner: S1/S12 — a ZOD follow-up.)
3. ~~**Fix a stale comment** in `lib/types/reports.ts`.~~ Done 2026-06-13 — the
   pre-bundle "figureInputs validated as unknown" wording now describes the strict
   `figureBlockSchema`.
4. **The `json_slide_serialize.ts` tombstone.** Now a two-line comment after the
   sentinel layer was deleted. Either remove the file entirely or keep it as an
   intentional breadcrumb — trivial either way. It is still claimed by the S10
   manifest, so deleting it means dropping that glob line. (Owner: S10.)

## Explicitly NOT closed by FigureBundle (do not conflate)

The §7.1 fetch-config SQL-injection / membership residual is a **separate S9
item**. The membership-validation fix already shipped; FigureBundle does not close
the rest, because the re-query path still derives `fetchConfig` the same way. Track
it under S9 (see [project_systems_topology] / PLAN_SYSTEMS §6.1), not here.
