# Vision: FigureBundle — store upstream inputs, build figures at render

> **Status:** Vision document. Locks the *direction* and *vocabulary*; defers detailed
> implementation steps to follow-on plans. Most open decisions are now resolved (see inline dates).

## 1. The problem (recap)

Today the three snapshot surfaces — slides, dashboards, reports — persist a **dehydrated
`FigureInputs`** blob (the post-transform render artifact). The big-picture review found this
costs us three ways:

1. **Schema-invisible drift.** `figureInputs` is `z.unknown()` in every stored schema, so the
   migration skip-gate can't see it. When panther's internal shapes change we hand-migrate frozen
   blobs — `server/db/migrations/data_transforms/_figure_block.ts` (`transformFigureInputs`:
   `yScaleAxisData→scaleAxisLimits`, the 75-line `computeScaleAxisLimitsFromValues` reimplementation
   of panther's own math, `string[]→HeaderItem[]`). All of it is gated on `isTransformed === true`,
   which **only timeseries** sets. Chart/table/map already store raw `{ jsonArray, jsonDataConfig }`
   and incur **zero** such migrations.

2. **A serializability hazard.** The stored `FigureInputs` is *lossy*. Its `style`
   (`CustomFigureStyleOptions`) is full of **functions** — `seriesColorFunc`, `valuesColorFunc`,
   `TableCellInfoFunc`, … — which can't go into Postgres JSON or IndexedDB. That is the entire
   reason `stripFigureInputsForStorage` strips `style` (+ `geoData`) on store and
   `hydrateFigureInputsForRendering` rebuilds it at render. We store a function-stripped artifact and
   reconstruct the missing functions every time. (They even had to keep `jsonDataConfig.sort`
   declarative *on purpose* — see the comment at `get_data_config_from_po.ts:66`.)

3. **A half-live inconsistency.** `style` / `formatAs` / `geo` are already re-derived live from
   config at render, while `caption` / labels / sort / data stay frozen. A metric `formatAs` flip can
   render a "percent" style over a frozen "number"-worded caption.

## 2. The core idea

**Stop storing the post-transform `FigureInputs`. Store the upstream inputs (a pure-JSON
`FigureBundle`) and build `FigureInputs` at render time** — using the same transform the live
visualization editor already runs on every reactive tick.

```text
                build()                 panther
FigureBundle ───────────▶ FigureInputs ────────▶ pixels
(pure JSON, stored)       (transient, in-memory)
```

The build is **already** mostly render-time: style and geo are re-derived in `hydrate*` today. This
finishes that pattern by moving the **data transform** (`getTimeseriesDataTransformed` + the
`get*JsonDataConfig` builders) to render too, so the *whole* figure derives from one source of truth.

## 3. Conceptual model & vocabulary

This refactor is the moment to rationalize the figure/visualization vocabulary, which is currently
inconsistent (DB column `is_default_visualization` vs type `PresentationObjectConfig` vs route
`/presentation_objects` vs UI "visualization" vs stored "figure").

### Target vocabulary

| Term | Meaning | Lifetime |
|---|---|---|
| **Visualization** | The live, user-facing, editable object. Stored as `config` + `metric_id` only; re-queries data each render. *(Today: "presentation object" / PO.)* | Live |
| **Figure** | A visualization **captured into a document** (slide / dashboard / report). A frozen snapshot. | Snapshot |
| **FigureBundle** | The **stored shape** of a Figure: pure-JSON inputs sufficient to rebuild the render. Replaces `figureInputs` + `FigureSource`. | Stored |
| **FigureInputs** | Panther's transient render-input type. **Never persisted** under this design. | In-memory |
| **`buildFigureInputs(bundle, env, deckStyle?)`** | The one transform from inputs → `FigureInputs`. Replaces `getFigureInputsFromPresentationObject` + `hydrateFigureInputsForRendering`. `env` = the ambient render context (§9). | — |

So: a **Visualization** is the live thing; a **Figure** is a frozen capture of one render of it; a
**FigureBundle** is what that capture stores; **FigureInputs** is the throwaway render value.

### Old → new (figure side — rides along with this work, because it's being rewritten anyway)

| Old | New |
|---|---|
| `FigureBlock { type, figureInputs?, source? }` | `FigureBlock { type: "figure", bundle?: FigureBundle }` (bundle absent = empty placeholder) |
| `FigureSource` (`from_data` \| `custom`) | **deleted** — folded into `FigureBundle` |
| stored `figureInputs` field | **deleted** |
| `stripFigureInputsForStorage` / `hydrateFigureInputsForRendering*` | **deleted** — subsumed by `buildFigureInputs` |
| `getFigureInputsFromPresentationObject` | `buildFigureInputs(bundle, env, deckStyle?)` |

The schema home: `figureBundleSchema` (Zod) lives in a new `lib/types/_figure_bundle.ts` (underscore
= stored shape; `type FigureBundle = z.infer<…>`), imported by the slide / dashboard / report figure
schemas. The new `FigureBlock` is **strict** (`z.strictObject`, no `figureInputs`/`source`), which is
what lets the migration skip-gate catch legacy blocks and makes deleting the force-run safe.

### Out of scope (separable rename pass — **decided 2026-06-08: deferred, do the refactor first**)

Renaming **Visualization** end-to-end (`presentation_objects` table, `/presentation_objects` routes,
`PresentationObjectConfig`, `ItemsHolderPresentationObject`, dozens of files) is a large mechanical
sweep with no behavior change — like `PLAN_SNAPSHOT_NAMING.md`, it should be its own focused PR, not
bundled with this feature. **Decided:** do the bundle refactor first; keep `PresentationObjectConfig`
and the PO names as-is for now; revisit the full Visualization rename as a later standalone pass.

## 4. Live vs snapshot — where the bundle applies

**The bundle is for the three snapshot surfaces, not for the live visualization.** Confirmed by code:

- **Visualizations are already the upstream model.** `presentation_objects` stores only
  `config` + `metric_id` (`server/db/project/presentation_objects.ts`). The editor queries items live
  and derives `FigureInputs` in a memo (`t2_presentation_objects.ts:193`). There is **nothing to
  bundle** — a visualization *is* a config, and it re-queries by design.

- **A FigureBundle is exactly "a visualization render, frozen."** It's `config` + the items that were
  live at snapshot time + the metric projection. The elegant consequence:

  > **A FigureBundle is precisely the argument set that `buildFigureInputs` consumes.** A "snapshot"
  > is literally *capture the current build inputs into a bundle*. One build function, two item
  > sources: **live query** (visualization editor) vs **baked items** (figure in a document).

| Surface | Storage | Items at render | Uses bundle? |
|---|---|---|---|
| **Visualization** (PO) | `config` + `metric_id` | **live query** | No — already upstream |
| **Slide / Dashboard / Report figure** | `FigureBundle` | **baked** | Yes |

Visualizations are **left as-is at the storage level**; they share the *refactored* `buildFigureInputs`
so the live path and the snapshot path run identical code — guaranteeing a figure renders
byte-identically to the visualization it was captured from.

## 5. Collapsing FigureSource

**Delete `custom` and collapse `FigureSource` into `FigureBundle`.** `FigureSource.custom` is
vestigial dead code (produced by zero paths; the prod sweep found **0** figures lacking
`source.config`). With `custom` gone, `from_data` is the only variant, so the union dissolves; its
fields (`config`, `metricId`, `snapshotAt`, `indicatorMetadata`) merge into `FigureBundle`. `metricId`
+ `snapshotAt` survive only as **refresh metadata** for the "Update data" action (§7) — render never
touches the pointer (invariant 1).

## 6. The FigureBundle shape (exact fields finalized in Phase 1)

```ts
type FigureBundle = {
  // --- inputs to buildFigureInputs (all pure JSON) ---
  config: PresentationObjectConfig;        // already schema'd + migrated
  items: Record<string, string>[];         // FROZEN queried rows (post replicant-resolution)
  resultsValue: {                          // the projection the transform reads — NOT the whole metric
    formatAs: "percent" | "number";
    valueProps: string[];
    valueLabelReplacements?: Record<string, string>;
  };
  indicatorMetadata: IndicatorMetadata[];  // label replacements + scorecard sort
  dateRange?: PeriodBounds;                 // caption period text; ALSO earliest/latest data point (§7)

  // --- maps only ---
  geo?: GeoRef;                             // baked for public; resolved from cache in-app (§10)

  // --- refresh + provenance metadata (NEVER used for passive render; §7) ---
  metricId: string;                         // re-query pointer for "Update data" only
  snapshotAt: string;                       // when this figure was captured
  provenance: {
    moduleLastRun: string;                  // metric's module last-run time   [FREE — in ItemsHolder]
    datasetsVersion: string;                // datasets.last_updated fingerprint [FREE — in ItemsHolder]
    instanceDataImportedAt?: string;        // when dataset(s) imported into instance  [needs wiring]
    projectDataAddedAt?: string;            // when dataset version brought into project [needs wiring]
  };

  // --- captured render context, only if byte-immutability is required (§9) ---
  // renderContext?: { language; calendar; countryIso3; };
};
```

The bundle stores a **projection** of the metric (`resultsValue`), **not** full metric info. Every
field is plain JSON — no functions — so it drops straight into Postgres JSON / IndexedDB with no
stripping.

## 7. Provenance & the "Update data" action (the two collapse into one mechanism)

The original reason for snapshotting figures was to support an explicit **"Update data"** button per
figure (re-fetch latest project data on demand; never automatic). The bundle makes this natural, and
the **freshness fingerprint users are asking for is the same data that drives the stale-flag.**

**"Update data" = re-query + reassemble.** The bundle already carries `config` + `metricId`, so the
action re-runs the *same* query the live viz editor runs (`getPresentationObjectItems(config,
metricId)`) → fresh items → reassemble the bundle (re-derive `dateRange`, re-capture `provenance`, bump
`snapshotAt`). Per-figure; an "Update all" at deck/dashboard/report level is the same call in a loop.
It stays an explicit user action, preserving the publish-time freeze until clicked.

**Stale-flag without re-query.** The data-freshness key is `(moduleLastRun, datasetsVersion)` — both
already produced by the ItemsHolder, so captured for free in `provenance`. "Needs update?" = compare
the bundle's captured pair against the **current** values for that metric, which the client already
holds cheaply (module summaries carry `lastRunAt`; `datasetsVersion` is instance metadata). Diff → a
stale badge, **zero per-figure queries**. Semantics: this flags "the data *version* moved," not "the
values definitely changed" (a re-run can be identical) — exactly right for an "update available" nudge;
the re-query confirms.

**The user-facing fingerprint = the provenance block.** Mapping of what users asked for:

| Requested field | Source | Status |
|---|---|---|
| earliest / latest data point | `dateRange.min` / `.max` | **already in bundle** |
| time module was run | `provenance.moduleLastRun` | **free** — in ItemsHolder |
| datasets version | `provenance.datasetsVersion` | **free** — in ItemsHolder |
| time data imported into **instance** | `instanceDataImportedAt` | **needs wiring** (dataset `last_updated` / time-point `importedAt` exist; surface them) |
| time data brought into **project** | `projectDataAddedAt` | **needs wiring** (verify `datasets_in_project_*` is even timestamped) |

Three of five are free; the two import timestamps are **additive** — ship the core bundle with the
free fields, wire the import times later (the metric→source-datasets→import-time path is a multi-hop
join not yet traced; may need a column, not just a read).

**Edge:** a figure whose metric isn't installed in its project can't re-query, so "Update data" is
disabled / "source unavailable" there. (It still *converts* at migration via reverse-transform §10 —
being un-updatable ≠ being un-migratable.)

## 8. Invariants (the load-bearing rules)

1. **Render never re-queries.** A figure renders only from its baked `items`. The `metricId` pointer
   exists *solely* for the explicit "Update data" action (§7).
2. **The bundle is pure serializable JSON** — no functions, structured-clone-safe.
3. **One build function** serves both the live visualization and stored figures.
4. **`FigureInputs` is transient** — built at render, handed to panther, never persisted.

## 9. Snapshot immutability — make the environment an explicit input

Beyond `config` + `items`, `buildFigureInputs` reads a few instance-wide **environment** values:

| Environment value | Affects |
|---|---|
| `countryIso3` | replicant label substitution + Nigeria admin-area relabeling (instance-fixed) |
| calendar (Gregorian/Ethiopian) | how periods are written (instance-fixed) |
| UI language (EN/FR) | every translated string (already live per-session today) |

NOT ambient: `formatAs` / `valueProps` / `valueLabelReplacements` and **scorecard sort**
(`indicatorMetadata.sort_order`) live **in the bundle**, frozen; the **common-indicator axis sort**
(`get_INDICATOR_COMMON_IDS_IN_SORT_ORDER`) is a static code constant. So the real ambient surface is
just country/calendar/language.

Rebuilding at render recomputes text/order from whatever the environment is **now**, so a stored
figure can **re-localize/re-order to match current settings (A)** or stay **frozen as captured (B)**.
**The decision is not A-vs-B-forever:** make `env` an **explicit argument** to `buildFigureInputs`
(not an ambient read). In-app render passes the **current** env (→ A); a public/export render can pass
an env **frozen into `bundle.renderContext`** (→ B) — choosable **per surface**, B purely additive.
**Decided default:** ship A everywhere now; the firm commitment is making the dependency explicit.
(Caveat from the conformity review: anonymous public/export/share surfaces have *no* ambient env, so
if any such surface ships, it must pass a frozen env — B is required day-one *there*, not deferrable.)

## 10. Backfill — reverse-transform, one pure-JSON sweep (supersedes the earlier re-query plan)

We have the old `figureInputs` + `config` + `metricId`, but not the frozen `items`. **All figure types
backfill as a pure-JSON, in-sweep data-transform — no re-query, no `mainDb`, no slow boot:**

- **chart/table/map → in-place from `jsonArray`.** The raw rows are already in the blob
  (`figureInputs.{tableData|chartData|chartOHData|mapData}.jsonArray`, never stripped). Reshape to a
  bundle (+ `valueProps` from the stored `jsonDataConfig`). Value-exact.
- **timeseries → reverse-transform the stored grid → items.** Only timeseries stores the transformed
  grid instead of `jsonArray`. The forward transform is a **strict one-cell-one-row pivot** — it
  `throw`s `"Duplicate values"` on a collision (`get_timeseries_data.ts:115-117`), the headers keep
  `{id, label}` (original ids), and the period axis is fully encoded (`timeMin/timeMax/periodType`). So
  the grid is a **lossless, reversible** reshape: emit one row per non-empty cell, keyed by header
  `id` + period id; feed back through the current transform → identical grid. **Self-validating:**
  reverse → re-forward → compare grid; flag any figure that doesn't round-trip instead of silently
  corrupting it. Bounded extra cases to handle: the `--v` wide-format convention, uncertainty `bounds`,
  and pre-2026 `string[]` headers (run the existing header-normalization first → `{id:s, label:s}`).

**Why this is the right approach (supersedes re-query + orphan-blank):** reverse-transform needs no
metric, no project, no DB — so it (a) runs as a standard startup data-transform (DOC_MIGRATIONS-
conformant, one deploy, no offline script); (b) is **faithful** (exact frozen values, no re-query
drift); and (c) **dissolves the orphan problem** — the ~72 timeseries figures whose metric is
uninstalled in-project convert *exactly like any other* from their stored grid. **No blank
placeholders.** (The earlier orphan-blank decision was only forced by the re-query approach, which
can't reach an uninstalled metric; it is now moot.) The strict-schema ordering knot also dissolves:
everything converts in-sweep, so the strict bundle schema validates clean immediately after.

Empirical scale (full prod sweep, 2026-06-08): **16,689** figures across 29 instances — 12,421
timeseries (reverse-transform), 4,261 chart/table/map (in-place), 7 already-empty; **0** lacked
`source.config`.

Other backfill notes:
- **Items volume.** `MAX_ITEMS` (20k) bounds a figure. Timeseries usually *shrinks* (the dense 5-D
  `values` grid is often bigger than the sparse items it derives from). Verify payloads for any
  inline-data surface that survives.
- **`deckStyle` threading.** Deck-level theming is injected at render today via `hydrate*`;
  `buildFigureInputs` takes a `deckStyle?` param (slides pass it; others omit).
- **Geo handling unchanged.** `GeoRef = {kind:'level'}` (in-app, resolve via `getGeoJsonSync`) |
  `{kind:'baked'}` (public/export). Same split as today's `hydrateFigureInputsForPublicRendering`.

## 11. Surfaces touched

| Surface | Change |
|---|---|
| **Slides / Dashboards / Reports** | Store `FigureBundle`; render via `buildFigureInputs`. The bulk of the work. |
| **Visualizations (POs)** | Storage **unchanged**. Adopt the refactored `buildFigureInputs` (shared). |
| **Exports / public viewer** | Call `buildFigureInputs(bundle, env)` instead of a baked blob + `hydrate*`. Stays client-side. Anonymous routes pass a frozen env (§9). |
| **Shares (`share_tokens`)** | **Deleted** (landed on main 2026-06-10). The fourth figureInputs surface no longer exists. |
| **Panther** | **Unchanged.** Still consumes `FigureInputs`. We stop *storing* it, not *using* it. |
| **Server item cache** | **Unchanged** — `_PO_ITEMS_CACHE` already caches `ItemsHolder` (upstream items). |

## 12. Caching, after this change

- **Server-side:** nothing to remove — the server already caches *items* (`_PO_ITEMS_CACHE`).
- **Artifacts:** the baked `figureInputs` blob is *replaced* by the baked `FigureBundle`.
- **Client in-memory:** keep a per-figure `createMemo` of the computed `FigureInputs` (the pattern the
  live editor already uses) — the **only** figureInputs "cache" that survives.

CPU note: the incremental render-time cost is the `O(items)` data transform — dwarfed by panther's
measure/layout/rasterize, already run live in the editor, memoizable. The git history shows figureInputs
was baked for **snapshotting, never for CPU** (`PLAN_AI_SLIDE_TOOLS.md` §8.1).

## 13. Rough phasing (detailed steps in follow-on plans)

- **Phase 0 — this doc + decisions.** (Shares deleted separately — **done, landed 2026-06-10**.)
- **Phase 1 — `buildFigureInputs` refactor.** Define `figureBundleSchema` in `lib/types/_figure_bundle.ts`.
  Refactor the transform to take `(bundle, env, deckStyle?)` (fold in style/geo; env explicit, ambient
  read deleted). Wire the **live visualization** path to it first — no storage change. Delete nothing yet.
- **Phase 2 — bundle storage in the three surfaces.** Capture-to-bundle on write (including
  `provenance`); build-from-bundle on render/export. Dual-read during transition.
- **Phase 3 — cut over.** Backfill all existing snapshots via the §10 pure-JSON sweep (chart/table/map
  in-place; timeseries reverse-transform; orphans included). Then delete: stored `figureInputs`, the
  strip/hydrate pipeline, `transformFigureInputs` + the force-run, `FigureSource`.
- **Phase 4 (additive) — wire the two import timestamps** into `provenance`; ship the stale-badge +
  "Update data" UI.
- **Phase 5 (optional, separate PR) — Visualization rename.**

## 14. Explicit non-goals

- Not changing panther's render contract or the `FigureInputs` shape.
- Not changing visualization (PO) storage or the items query pipeline.
- Not making figures re-query live data on render (that's the opposite of a snapshot).
- Not bundling the full `presentation_object → visualization` rename into this work.
