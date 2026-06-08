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

### Out of scope for v1 (separable rename pass — **[DECIDE]** whether to do at all)

Renaming **Visualization** end-to-end (`presentation_objects` table, `/presentation_objects` routes,
`PresentationObjectConfig`, `ItemsHolderPresentationObject`, dozens of files) is a large mechanical
sweep with no behavior change — like `PLAN_SNAPSHOT_NAMING.md`, it should be its own focused PR, not
bundled with this feature. **Recommendation:** adopt "Visualization" as the conceptual/UI term now,
keep `PresentationObjectConfig` as the config type name for v1, and schedule the full rename
separately. We rationalize the names we're already rewriting (the figure side); we don't sprawl into
the orthogonal sweep.

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

## 8. The one real decision: snapshot immutability **[DECIDE]**

`buildFigureInputs` reads ~5 ambient globals (`countryIso3`, calendar, UI language, the indicator
sort order, `formatAs`). Re-deriving at render makes a figure's **text / sort / period-format** track
*current* instance state. A 6-month-old share could re-localize or re-format if those change. This is
the inverse of today's drift (frozen-blob drift → live-render drift).

- **Option A — accept live re-derivation (recommended default).** Simpler; arguably *correct*
  (auto-retranslate, auto-reformat). Note language is *already* live per-session today, so frozen
  captions are already a latent inconsistency, not a guarantee.
- **Option B — snapshot the globals.** Add `renderContext` to the bundle (§6) and have
  `buildFigureInputs` prefer it over ambient state. Guarantees byte-identical-forever published
  artifacts at the cost of a few more stored fields.

**Recommendation:** ship **Option A**, structure `buildFigureInputs` so the globals enter through a
single context argument, so Option B is a later additive change (populate the context from the bundle
instead of ambient state) rather than a rewrite.

## 9. Other open questions / risks

- **Backfilling existing snapshots.** We have the old `figureInputs` + `config` + `metricId`, but
  **not** the frozen `items` (the transform is forward-only/lossy). Options: (a) re-query items via
  stored `config`+`metricId` at backfill time — faithful only if data hasn't moved; (b) keep the
  legacy "render baked figureInputs" path for pre-existing blocks and use bundles only for new ones,
  retiring legacy as snapshots get refreshed; (c) one-time rebuild. **[DECIDE]** in the migration
  plan; the vision doesn't depend on which.
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
