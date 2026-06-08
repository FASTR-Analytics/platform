# Vision: FigureBundle — store upstream inputs, build figures at render

> **Status:** Vision document. Locks the *direction* and *vocabulary*; defers detailed
> implementation steps and migration mechanics to follow-on plans. Decisions marked
> **[DECIDE]** need Tim's call before Phase 1.

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

```
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
| **`buildFigureInputs(bundle, deckStyle?)`** | The one transform from inputs → `FigureInputs`. Replaces `getFigureInputsFromPresentationObject` + `hydrateFigureInputsForRendering`. | — |

So: a **Visualization** is the live thing; a **Figure** is a frozen capture of one render of it; a
**FigureBundle** is what that capture stores; **FigureInputs** is the throwaway render value.

### Old → new (figure side — rides along with this work, because it's being rewritten anyway)

| Old | New |
|---|---|
| `FigureBlock { type, figureInputs?, source? }` | `FigureBlock { type: "figure", bundle: FigureBundle }` |
| `FigureSource` (`from_data` \| `custom`) | **deleted** — folded into `FigureBundle` |
| stored `figureInputs` field | **deleted** |
| `stripFigureInputsForStorage` / `hydrateFigureInputsForRendering*` | **deleted** — subsumed by `buildFigureInputs` |
| `getFigureInputsFromPresentationObject` | `buildFigureInputs(bundle, deckStyle?)` |

### Out of scope (separable rename pass — **decided 2026-06-08: deferred, do the refactor first**)

Renaming **Visualization** end-to-end (`presentation_objects` table, `/presentation_objects` routes,
`PresentationObjectConfig`, `ItemsHolderPresentationObject`, dozens of files) is a large mechanical
sweep with no behavior change — like `PLAN_SNAPSHOT_NAMING.md`, it should be its own focused PR, not
bundled with this feature. **Decided:** do the bundle refactor first; keep `PresentationObjectConfig`
and the PO names as-is for now; revisit the full Visualization rename as a later standalone pass. We
rationalize the names we're already rewriting (the figure side); we don't sprawl into the orthogonal
sweep.

## 4. Live vs snapshot — where the bundle applies (Consideration 1)

**Tim's instinct is correct: the bundle is for the three snapshot surfaces, not for the live
visualization.** Confirmed by the code:

- **Visualizations are already the upstream model.** `presentation_objects` stores only
  `config` + `metric_id` (`server/db/project/presentation_objects.ts`). The editor queries items live
  and derives `FigureInputs` in a memo (`t2_presentation_objects.ts:193`). There is **nothing to
  bundle** — a visualization *is* a config, and it re-queries by design.

- **A FigureBundle is exactly "a visualization render, frozen."** It's `config` + the items that were
  live at snapshot time + the metric projection. The elegant consequence:

  > **A FigureBundle is precisely the argument set that `buildFigureInputs` consumes.** A "snapshot"
  > is literally *capture the current build inputs into a bundle*. One build function, two item
  > sources: **live query** (visualization editor) vs **baked items** (figure in a document).

So the boundary is clean:

| Surface | Storage | Items at render | Uses bundle? |
|---|---|---|---|
| **Visualization** (PO) | `config` + `metric_id` | **live query** | No — already upstream |
| **Slide / Dashboard / Report figure** | `FigureBundle` | **baked** | Yes |

Visualizations are **left as-is at the storage level**. They do, however, share the *refactored*
`buildFigureInputs` (style folded in, `deckStyle` param) — so the live path and the snapshot path run
identical code. This is a feature, not incidental: it guarantees a figure renders byte-identically to
the visualization it was captured from.

## 5. Collapsing FigureSource (Consideration 3)

**Yes — delete `custom` and collapse `FigureSource` into `FigureBundle`.**

- The investigation proved `FigureSource.custom` is **vestigial dead code**: defined in the
  type/schemas but produced by **zero** code paths (no AI entry, no editor entry; public bundles drop
  any non-`from_data` source). The only `custom` literal in the repo is a schema-validation test.
  *(One-time read-only scan of stored rows to confirm none were hand-written — a correctness check,
  not a migration.)*

- With `custom` gone, `from_data` is the only variant — so the `FigureSource` union dissolves. Its
  fields (`config`, `metricId`, `snapshotAt`, `indicatorMetadata`) merge into `FigureBundle`, which
  also gains `items`, `resultsValue`, and `dateRange`. The figure block collapses from
  `{ type, figureInputs?, source? }` to `{ type: "figure", bundle }`.

- **Keep `metricId` + `snapshotAt` in the bundle** — but only as **refresh metadata** (staleness =
  compare `snapshotAt` vs the module's `lastUpdated`; "Refresh" = re-query + re-capture). See the
  invariant below: render never touches the pointer.

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
  dateRange?: PeriodBounds;                 // caption period text + effective-config

  // --- maps only ---
  geo?: GeoRef;                             // baked for public; resolved from cache in-app (§9)

  // --- refresh metadata (NEVER used for passive render) ---
  metricId: string;
  snapshotAt: string;

  // --- [DECIDE §8] captured render context, only if byte-immutability is required ---
  // renderContext?: { language; calendar; countryIso3; indicatorSortOrder; };
};
```

Note the bundle stores a **projection** of the metric (`resultsValue`), **not** full metric info —
storing the whole metric re-introduces the coupling we're removing.

## 7. Invariants (the load-bearing rules)

1. **Render never re-queries.** A figure renders only from its baked `items`. The `metricId` pointer
   exists *solely* for the explicit user "Refresh" action. (Re-querying on render would silently
   convert frozen figures into live ones and destroy the publish-time freeze — and the tempting
   pointer makes this an easy mistake.)
2. **The bundle is pure serializable JSON** — no functions, structured-clone-safe, drops straight
   into IndexedDB / Postgres JSON / a share token with no stripping.
3. **One build function** serves both the live visualization and stored figures. Diverging them
   re-opens the desync.
4. **`FigureInputs` is transient** — built at render, handed to panther, never persisted.

## 8. Snapshot immutability — make the environment an explicit input

Beyond the bundle's `config` + `items`, `buildFigureInputs` also reads a handful of instance-wide
**environment** values to finish the figure:

| Environment value | Affects |
|---|---|
| `countryIso3` | replicant label substitution + Nigeria admin-area relabeling (instance-fixed) |
| calendar (Gregorian/Ethiopian) | how periods are written ("2024 Q1", Ethiopian months) (instance-fixed) |
| UI language (EN/FR) | every translated string ("National", "No data"/"Aucune donnée", "to"/"à") (already live per-session today) |

NOT ambient (don't list them as environment): `formatAs` / `valueProps` / `valueLabelReplacements`
and **scorecard indicator sort** (`indicatorMetadata.sort_order`) live **in the bundle**, frozen. The
**common-indicator axis sort** (`get_INDICATOR_COMMON_IDS_IN_SORT_ORDER`) is a static code constant
(`_COMMON_INDICATORS`), not instance/viewer state — changes only on deploy, and you'd want that to
propagate. So the real ambient surface is just country/calendar/language, all instance-fixed or
already-live.

Today the baked `FigureInputs` freezes these *into the text and ordering* at capture. Rebuilding at
render recomputes text/order from whatever the environment is **now**. So the choice is whether a
stored figure should **re-localize/re-order to match current settings (A)** or stay **frozen as
captured (B)**:

- **A** is what you want when you flip the instance to French or fix a bad sort order in a deploy —
  old slides should pick it up. (Language is *already* live today, so this is partly the status quo.)
- **B** is what you want for a report PDF sent to a minister — identical if reopened next year.

**The decision is not A-vs-B-forever.** Make the environment an **explicit argument** to
`buildFigureInputs` instead of letting the function read ambient globals. Then in-app render passes
the **current** environment (→ A) and a public/export/share render can pass an environment **frozen
into the bundle** (→ B) — choosable **per surface**, with B as a purely additive later change
(also store the 4 values, pass those). **Decided default:** ship A everywhere now; the only firm
commitment is making the dependency explicit so B is available later without a rewrite.

## 9. Other open questions / risks

- **Backfilling existing snapshots (the hard one — but only for one figure type).** We have the old
  `figureInputs` + `config` + `metricId`, but not the frozen `items`. **Key finding:** chart/table/map
  already store the raw rows in the blob — `figureInputs.{tableData|chartData|chartOHData|mapData}
  .jsonArray` *is* `ih.items`, and `stripFigureInputsForStorage` doesn't strip it. **Only timeseries**
  stores the transformed grid and discards the rows. So:
  - **chart/table/map → in-place backfill** from `jsonArray` (+ `valueProps` from the stored
    `jsonDataConfig`). No re-query, no data-change risk, **value-exact**.
  - **timeseries → re-query** via `config`+`metricId`, **pinned to the stored `dateRange`** (pass it
    as `periodFilterExactBounds`, which `getPresentationObjectItems` already accepts — do NOT replay a
    relative period filter, which would drift forward) and to the captured indicator set. This fixes
    the *scope* (same periods, same indicators) exactly. **Decided 2026-06-08: re-query all and be
    done — no dual-read, no retained legacy render / `transformFigureInputs`.** Caveat: re-query fixes
    scope, not *values* — if the module re-ran since capture, numbers update to current (identical in
    the common case where it hasn't). Only chart/table/map in-place backfill is value-exact.
  - **Orphan tail → blank placeholder (DECIDED 2026-06-08).** Timeseries figures whose metric isn't
    installed in their project can't be re-queried and have no `jsonArray`. **Decision: replace the
    block with the empty-figure placeholder `{ type: "figure" }` (no bundle) — NO retained legacy
    `figureInputs` path for <1% of figures.** The render already turns an empty figure into a spacer
    (convert_slide_to_page_inputs.ts:553-566), so this is graceful in editor/export/viewer.
    **Empirically sized (full prod sweep, 2026-06-08):** of **16,689** stored figures across 29
    instances, **12,421 are timeseries**, and only **72 (0.58%)** are orphaned — all in **slides**,
    referencing just two metric IDs (`m4-01-01`/`m4-02-01`, module m004 coverage), concentrated in
    ghana (56), guinee (10), cameroun (6). These are NOT deleted metrics — m004 still exists and runs
    in dozens of projects; these 3 GFF/R4D projects just don't have m004 installed (cloned slide decks
    / dropped module). Backfill workload: ~12.4k one-time timeseries re-queries; chart/table/map
    (4,261) backfill in-place from `jsonArray`, value-exact. **Bonus:** the sweep found **0** figures
    with no `source.config` — upstream config is universal in prod, confirming `FigureSource.custom` is
    dead and `figureInputs` is never a sole representation.

  Reverse-engineering items from the timeseries grid is a rejected option (reconstructs from the
  transformed shape we don't trust; query-time aggregation may not round-trip).
- **Items volume for shares.** `MAX_ITEMS` (20k) bounds a single figure, but public/share bundles
  frozen in `main` with many replicant figures inline raw rows. Verify payload sizes are acceptable
  (timeseries usually *shrinks* — the dense 5-D `values` grid is often bigger than the sparse items).
- **`deckStyle` threading.** Slide/dashboard deck-level theming is injected at render today via
  `hydrate*`. `buildFigureInputs` must take a `deckStyle?` param (the current build ignores it).
- **Geo handling is unchanged.** In-app figures resolve geojson from the instance cache
  (`getGeoJsonSync`); public/exported figures bake it. `GeoRef` carries a stable level pointer for the
  former and the data for the latter — same split as today's `hydrateFigureInputsForPublicRendering`.

## 10. Surfaces touched

| Surface | Change |
|---|---|
| **Slides / Dashboards / Reports** | Store `FigureBundle`; render via `buildFigureInputs`. The bulk of the work. |
| **Visualizations (POs)** | Storage **unchanged**. Adopt the refactored `buildFigureInputs` (shared with figures). |
| **Exports / public viewer** | Call `buildFigureInputs(bundle)` instead of reading a baked blob + `hydrate*`. Stays client-side (no figure rendering runs on the server today). |
| **Panther** | **Unchanged.** Still consumes `FigureInputs`. We stop *storing* it, not *using* it. |
| **Server item cache** | **Unchanged** — `_PO_ITEMS_CACHE` already caches `ItemsHolder` (the upstream items), not figureInputs. |

## 11. Caching, after this change

- **Server-side:** nothing to remove — the server already caches *items* (`_PO_ITEMS_CACHE`), never
  figureInputs.
- **Artifacts:** the baked `figureInputs` blob is *replaced* by the baked `FigureBundle`.
- **Client in-memory:** keep a per-figure `createMemo` of the computed `FigureInputs` so we don't
  rebuild on every reactive tick (the pattern the live editor already uses). This transient memo is
  the **only** figureInputs "cache" that survives.

CPU note: the incremental render-time cost is the `O(items)` data transform (timeseries reshape;
trivial for chart/table/map). It is dwarfed by panther's measure/layout/rasterize, already runs live
in the editor without issue, and memoizes per-figure if ever needed. Crucially, the git history shows
figureInputs was baked for **snapshotting/self-containment, never for CPU** (`PLAN_AI_SLIDE_TOOLS.md`
§8.1) — so there's no hidden performance cliff being re-opened.

## 12. Rough phasing (detailed steps in follow-on plans)

- **Phase 0 — this doc + decisions** (§5 confirmed, §8 chosen, §9 backfill option chosen).
- **Phase 1 — `buildFigureInputs` refactor.** Define `FigureBundle`. Refactor the transform to take
  a bundle (fold in style, `deckStyle`, geo) and a single context arg. Wire the **live visualization**
  path to it first — no storage change, proves the function. Delete nothing yet.
- **Phase 2 — bundle storage in the three surfaces.** Capture-to-bundle on write; build-from-bundle
  on render/export. Dual-read (render old `figureInputs` *or* new `bundle`) during transition.
- **Phase 3 — cut over.** Backfill existing snapshots (§9). Delete: stored `figureInputs`, the
  strip/hydrate pipeline, `transformFigureInputs` + the force-run pre-validation blocks, the `custom`
  FigureSource variant, `FigureSource` itself.
- **Phase 4 (optional, separate PR) — Visualization rename** (§3 out-of-scope sweep).

## 13. Explicit non-goals

- Not changing panther's render contract or the `FigureInputs` shape.
- Not changing visualization (PO) storage or the items query pipeline.
- Not making figures re-query live data on render (that's the opposite of a snapshot).
- Not bundling the full `presentation_object → visualization` rename into this work.
