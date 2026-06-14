---
system: 10
name: Figure Rendering & Export Engine
globs:
  - client/src/exports/**
  - client/src/generate_slide_deck/**
  - client/src/generate_visualization/**
  - client/src/state/project/t2_images.ts
  - lib/brand_presets.ts
  - lib/key_colors.ts
  - lib/types/_figure_bundle.ts
  - lib/types/_slide_fonts.ts
docs_absorbed:
  - DOC_SPECIAL_CHART_MODES
---
# S10 — Figure Rendering & Export Engine

> **Phase 1 stub for most of the system** — full scope/contract/size in
> PLAN_SYSTEMS.md §3 (S10); the `docs_absorbed` file is still to be inlined
> (Phase 2, PLAN_DOC_CONSOLIDATION §2). **Exception:** the **FigureBundle
> architecture** below is the first prose landed from this system's review cycle
> (PLAN_SYSTEMS §5) — it is the durable, authoritative record of the bundle
> refactor and supersedes the two now-deleted planning docs.

_pure transforms from data+config to pixels and files: a stored **FigureBundle** rebuilt to panther `FigureInputs` by one `buildFigureInputs` transform, slide->page rendering, PDF/PPTX/XLSX/DOCX export_

## FigureBundle architecture (shipped 2026-06-13)

This is the authoritative record of the FigureBundle refactor. The two planning
docs that drove it (`PLAN_FIGURE_BUNDLE.md` = vision, `PLAN_FIGURE_BUNDLE_IMPL.md`
= executable plan) were deleted on completion; this section replaces them.
Sibling slices live in S9 (the upstream capture side), S12 (the three storage
surfaces), and S2 (the boot-time backfill). Deferred follow-ons:
[PLAN_FIGURE_BUNDLE_FOLLOWUPS.md](PLAN_FIGURE_BUNDLE_FOLLOWUPS.md).

### The idea

The three snapshot surfaces — slides, dashboards, reports — used to persist a
**dehydrated `FigureInputs`**: panther's post-transform render artifact. That was
costly in four ways:

1. **Schema-invisible drift.** Stored `figureInputs` was `z.unknown()` in every
   document schema, so the migration skip-gate could not see it. Each panther
   internal-shape change meant hand-migrating frozen blobs (the
   `yScaleAxisData→scaleAxisLimits`, `string[]→HeaderItem[]`, recompute-limits
   blocks — all gated on `isTransformed`, which only timeseries set).
2. **A serializability hazard.** `FigureInputs.style` is full of **functions**
   (`seriesColorFunc`, `valuesColorFunc`, `TableCellInfoFunc`, …) that cannot go
   into Postgres JSON / IndexedDB. That was the entire reason for the
   `stripFigureInputsForStorage` / `hydrateFigureInputsForRendering` pipeline:
   strip `style` (+`geoData`) on write, rebuild it on read.
3. **A half-live inconsistency.** `style`/`formatAs`/`geo` were already re-derived
   live at render while `caption`/labels/sort/data stayed frozen — a metric
   `formatAs` flip could render a "percent" style over a frozen "number" caption.
4. **A second serialization patch — the undefined sentinel.** Gap cells and
   optional `*Prop` fields are legitimately `undefined`, and `JSON.stringify`
   drops `undefined` (shifting array indices, losing keys). Slides/reports papered
   over this with a *second* encode/decode layer (`@@__UNDEFINED__@@` swap on the
   client wire path; the server stored the sentinel form verbatim).

The fix: **stop storing the post-transform artifact. Store the upstream inputs as
a pure-JSON `FigureBundle`, and build `FigureInputs` at render** — with the same
transform the live editor already runs each reactive tick.

```text
FigureBundle  ──buildFigureInputs()──▶  FigureInputs  ──panther──▶  pixels
(pure JSON: stored in a document,       (in-memory, transient,
 or transient for the live viz)          never persisted)
```

Because the bundle is pure JSON (frozen `items` are plain query rows; no
transformed grid; no functions), it needs **neither** patch: the strip/hydrate
pipeline *and* the sentinel layer are gone.

### Vocabulary

| Term | Meaning | Lifetime |
|---|---|---|
| **Visualization** (a.k.a. presentation object / PO) | The live, editable object. Stored as `config` + `metric_id`; re-queries data each render. | Live |
| **Figure** | A visualization **captured into a document** (slide / dashboard / report) — a frozen snapshot. | Snapshot |
| **FigureBundle** | The **stored shape** of a Figure: pure-JSON inputs sufficient to rebuild the render. | Stored |
| **FigureInputs** | Panther's transient render-input type. **Never persisted** under this design. | In-memory |
| **`buildFigureInputs(bundle, deckStyle?)`** | The one transform inputs → `FigureInputs`. | — |

The rename of *presentation object* → *Visualization* end-to-end (the
`presentation_objects` table, `/presentation_objects` routes,
`PresentationObjectConfig`) is deliberately **not** part of this work — it is a
separable mechanical pass (Phase 5, see the followups doc). PO names persist in
code for now.

### The bundle shape

Defined in [lib/types/_figure_bundle.ts](lib/types/_figure_bundle.ts) —
`figureBundleSchema` (a `z.strictObject`) and the document-embedded wrapper
`figureBlockSchema = { type: "figure", bundle?: FigureBundle }` (bundle absent =
empty placeholder). Every field is plain JSON; nothing is stripped on write.

```ts
FigureBundle = {
  config: PresentationObjectConfig;        // already schema'd + migrated
  items: Record<string, string>[];         // FROZEN queried rows (post replicant-resolution)
  resultsValue: ResultsValueForVisualization; // {formatAs, valueProps, valueLabelReplacements?}
                                           // — the EXISTING type, verbatim (see gate below)
  indicatorMetadata: IndicatorMetadata[];  // label replacements + scorecard sort (8-field existing type)
  dateRange?: PeriodBounds;                // {min,max}: DATE_RANGE caption text + earliest/latest point
  geo?: GeoRef;                            // maps only — {kind:"level"} | {kind:"data"} (see Geo)
  localization: { language; calendar; countryIso3 }; // REQUIRED, frozen — see Localization
  metricId: string;                        // re-query pointer for "Update data" ONLY (never render)
  snapshotAt: string;
  provenance: { moduleLastRun; datasetsVersion }; // freshness fingerprint (both free from ItemsHolder)
};
```

**Why `resultsValue` is a projection, not the whole metric (proven, not
asserted):** `buildFigureInputs` and every downstream builder
(`get*JsonDataConfig`, `getDisaggregatorDisplayProp`) is typed to
`ResultsValueForVisualization` (`lib/types/modules.ts`) = exactly `{formatAs,
valueProps, valueLabelReplacements?}`. The type system guarantees the build
*cannot* read a fourth metric field, so the bundle stores that existing type
verbatim. `IndicatorMetadata`, `PeriodBounds`, and `ResultsValueForVisualization`
are all reused, not redefined — and each sub-schema is `z.strictObject` locked to
a `Required<T>` parse so a new field in the source type is a compile error here
(the stored shape can't silently drift past the skip-gate).

### `buildFigureInputs` — one transform, two item sources

[client/src/generate_visualization/build_figure_inputs.ts](client/src/generate_visualization/build_figure_inputs.ts).
Signature `buildFigureInputs(bundle, deckStyle?): FigureInputs`. It folds what
used to be three steps — the data transform (`getTimeseriesDataTransformed` +
the `get*JsonDataConfig` builders), style derivation (the old `hydrate*`), and
geo resolution — into one, then branches on `effectiveConfig.d.type`
(timeseries / table / chart / map). It **throws** on bad input (callers catch).

The elegant consequence the whole design turns on:

> **A FigureBundle is precisely the argument set `buildFigureInputs` consumes.** A
> snapshot is literally "capture the current build inputs into a bundle." One build
> function, two item sources: **live query** vs **baked items**.

| Caller | Surface | Items | Localization source |
|---|---|---|---|
| `t2_presentation_objects.ts` (the live FigureInputs memo, ~:195) | **Visualization** | live query | `getInstanceLocalization()` — a **transient** bundle each tick |
| `convert_slide_to_page_inputs.ts`, `dashboard_item_grid.tsx`, `ReportFigureEmbed.tsx`, `exports/**`, public viewer, AI previews | **stored Figure / export** | baked in the bundle | `bundle.localization` (frozen) |

So the live editor and every stored figure run **identical code** — a figure
renders byte-identically to the visualization it was captured from. `deckStyle?`
is the deck-level theme; slides pass it, the others omit it.

### The four invariants (load-bearing)

1. **Render never re-queries.** A figure renders only from its baked `items`;
   `metricId` exists *solely* for the explicit (future) "Update data" action.
2. **The bundle is pure serializable JSON** — no functions, structured-clone-safe,
   no `undefined`-valued keys (absent, not `undefined`).
3. **One build function** serves both the live visualization and stored figures.
4. **`FigureInputs` is transient** — built at render, handed to panther, never
   persisted.

### Localization is captured, not ambient (the rule that prevents regressions)

The principle, in Tim's words: **capture locale into the bundle and use the
bundle's locale for ALL rendering — every surface, never an ambient read.**
`localization = {language, calendar, countryIso3}` is frozen in the bundle exactly
like `config` and `items`, and `buildFigureInputs` resolves **all** figure
text/dates from `bundle.localization` only — it must **never** read or write the
global `t3`/`getCalendar`/`getLanguage` singletons.

- **What is captured = the INSTANCE locale**, not the per-user UI toggle:
  `getInstanceLocalization()` (`client/src/state/instance/t1_store.ts`) returns
  `{instanceLanguage, instanceCalendar, countryIso3}`. Figures are
  instance-language artifacts.
- **The threaded reads** (all app-side; panther unchanged): the ~21 `t3({en,fr})`
  calls in the build path became explicit `pickLang(bundle.localization.language,
  …)` (`lib/translate/t-func.ts`); `withReplicant` takes
  `bundle.localization.countryIso3`; chart/table calendar comes from
  `bundle.localization.calendar`.
- **Timeseries period axis** is the one string panther formats itself, and it
  reads its calendar from the **figure style** (`style.xPeriodAxis.calendar`, set
  by the four `get_style_from_po/_{1..4}` builders) — so it's a calendar concern
  handled by the same bundle thread, **not** a new `TimeseriesInputs` prop or a
  `FigureInputs`-shape change (panther's period formatting is calendar-only, no
  language).
- **Deliberate behavior change (a bugfix).** Previously those `t3` calls followed
  the session toggle, so a Senegal figure showed English legends if the author had
  toggled English. Now figures are **always** instance-language; the EN/FR UI
  toggle is **chrome-only** (menus/buttons). The live editor preview uses instance
  language too (WYSIWYG: preview == capture == what every viewer sees).
- **Why frozen-in-bundle and not "pass current env":** anonymous public/export
  surfaces have *no* ambient env to read, so the bundle must carry its own. Making
  it always-frozen (rather than per-surface A/B) is the simpler, single rule — and
  it deletes the old `hydrateFigureInputsForPublicRendering` special-casing.

### Geo

`GeoRef` is a discriminated union. `{kind:"level", level}` — the in-app case:
`buildFigureInputs` re-derives the GeoJSON from the sync cache (`getGeoJsonSync`)
at render, storing no geometry. `{kind:"data", data}` — the baked case
(public/export, and dashboard items that carry a `geo_data` column): the full
GeoJSON travels in the bundle. Same split the old public-render path had.

### What this deleted — and the one residual

Gone (no references remain): `FigureSource` (the `from_data | custom` union —
`custom` was vestigial dead code, 0 figures in prod); `stripFigureInputsForStorage`
/ `hydrateFigureInputsForRendering*`; the stored `figureInputs` field; the
`lib/json_slide_serialize.ts` sentinel layer (the file is now a two-line tombstone).

**Residual not-yet-deleted:** `getFigureInputsFromPresentationObject`
([client/src/generate_visualization/get_figure_inputs_from_po.ts](client/src/generate_visualization/get_figure_inputs_from_po.ts))
is the **old ambient-localization build path** — superseded by `buildFigureInputs`
and now **dead** (zero importers; not exported from `mod.ts`). A safe deletion,
tracked in the followups doc. (Its twin `resolve_figure_from_*` files are *not*
residual: `generate_visualization/resolve_figure_from_{metric,visualization}.ts`
are the live plain-inputs resolvers that produce bundles; the same-named files
under `slide_deck/slide_ai/` are thin S13 AI adapters that delegate to them.)

## Scope

See `globs:` in the frontmatter above (the manifest — lint-enforced by
`lint_systems.ts`) and the full scope text in PLAN_SYSTEMS.md §3 (S10).

## Docs absorbed (Phase 2)

- [DOC_SPECIAL_CHART_MODES](DOC_SPECIAL_CHART_MODES.md)

## Open items

**FigureBundle residuals** — tracked in
[PLAN_FIGURE_BUNDLE_FOLLOWUPS.md](PLAN_FIGURE_BUNDLE_FOLLOWUPS.md) §"Residual
cleanups": deleting the dead `get_figure_inputs_from_po.ts`, and the
`json_slide_serialize.ts` tombstone (drop its glob line if removed).

**Rest of S10 still Phase-1 stub** (the FigureBundle section above is the only
prose landed so far). The remaining review-cycle work:

- Inline `DOC_SPECIAL_CHART_MODES` — the coverage / percent-change / disruptions /
  scorecard style modes (`get_style_from_po/_{1..5}`), which are core S10.
- Document the **export engine** — `client/src/exports/**` (PDF/PPTX/XLSX/DOCX) and
  `generate_slide_deck/` slide→page rendering — not yet covered here.
