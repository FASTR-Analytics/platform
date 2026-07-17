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
---
# S10 — Figure Rendering & Export Engine

Pure transforms from data+config to pixels and files: a stored
**FigureBundle** rebuilt to panther `FigureInputs` by one `buildFigureInputs`
transform, slide→page rendering, PDF/PPTX/XLSX/DOCX export.

## Scope

The `globs:` frontmatter above is the lint-enforced manifest
(`lint_systems.ts`); sub-file custody exceptions are in SYSTEMS.md §4.1.
`client/src/generate_visualization/**` (`buildFigureInputs`, the bundle
resolvers `resolve_figure_from_{metric,visualization}.ts` +
`resolve_bundle_from_metric_and_config.ts`, special chart modes, the
conditional-formatting compile path, `GLOBAL_STYLE_OPTIONS`);
`generate_slide_deck/**` (`convertSlideToPageInputs`);
`client/src/exports/**` (incl. `get_table_export_aoa.ts`); lib render
contracts (`_figure_bundle.ts`, `brand_presets.ts`, `key_colors.ts`,
slide-font types); `state/project/t2_images.ts`. Non-lint assets reviewed
here: `client/src/font-map.json` and `client/public/fonts/` (102 font files
plus `fonts.css`).

## Contract

One renderer per artifact class shared by screen and export; stored snapshots
are pure-JSON FigureBundles rebuilt to transient `FigureInputs` at render by
`buildFigureInputs` — render never re-queries. `figureBundleSchema` (strict
Zod, [lib/types/_figure_bundle.ts](lib/types/_figure_bundle.ts)) binds every
stored figure block across all three document surfaces; the legacy-block
repair arm is S2's `_figure_block.ts` transform (co-reviewed).

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
  items: Record<string, string | number | null>[]; // FROZEN queried rows (post replicant-resolution)
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

### What this deleted

Gone: `FigureSource` (the `from_data | custom` union — `custom` was vestigial
dead code, 0 figures in prod); the `stripFigureInputsForStorage` /
`hydrateFigureInputsForRendering*` pipeline (one comment-only tombstone
survives: `generate_visualization/strip_figure_inputs.ts`, zero importers —
Open item); the stored `figureInputs` field; the `lib/json_slide_serialize.ts`
sentinel layer and the old ambient-localization build path
(`get_figure_inputs_from_po.ts`) — both files deleted.

The `resolve_figure_from_*` resolvers are live machinery, not residue:
`generate_visualization/resolve_figure_from_{metric,visualization}.ts` (+
`resolve_bundle_from_metric_and_config.ts`) are the shared
snapshot-a-viz-into-FigureBlock core consumed by dashboards
(`add_dashboard_item_modal.tsx`), reports (`report/index.tsx`), and the slide
editor; the same-named files under `slide_deck/slide_ai/` are thin S13 AI
adapters (26/23 LOC) that delegate to them.

## Special chart modes — the style pipeline

`buildFigureInputs` derives every figure's `style` through one dispatcher,
`getStyleFromPresentationObject`
([get_style_from_po.ts](client/src/generate_visualization/get_style_from_po.ts)),
which delegates to five per-mode builders
(`get_style_from_po/_1_standard.ts` … `_5_scorecard.ts`). Each builder returns
a **complete** `CustomFigureStyleOptions` — mode-specific values hardcoded,
shared layout deliberately duplicated for explicitness; common helpers (text
style, table layout/cells, map regions, the standard series/map color funcs)
live in `_0_common.ts`, which also owns `GLOBAL_STYLE_OPTIONS`, applied
app-wide via `setGlobalStyle` at boot
([index.tsx:12](client/src/index.tsx#L12)).

A **special mode** is a boolean flag on `config.s` that overrides most
user-facing style properties with hardcoded rendering. A mode is active only
when its flag is set AND `config.d.type` matches its gate — the `is*Active`
checks in
[special_chart_checks.ts](client/src/generate_visualization/special_chart_checks.ts),
the single home for mode gating (its per-metric `canUse*` arrays decide
whether the editor shows a mode's toggle). Dispatch priority in
`getStyleFromPresentationObject`: scorecard → coverage → percent-change →
disruptions → standard.

| Mode | Flag (`config.s`) | Gate (`d.type`) | Metrics | Builder behavior |
| --- | --- | --- | --- | --- |
| Coverage | `specialCoverageChart` | timeseries | m4-01-01, m6-01/02/03-01 | hardcoded series colors (black / red / grey), forced points with `toPct0` last-value labels |
| Percent change | `specialBarChart` | timeseries | m3-01-01 | red/green bar coloring + signed value labels from period-to-period diff vs `specialBarChartDiffThreshold` (default 0.1) |
| Disruptions | `specialDisruptionsChart` | timeseries | m3-02/03/04/05-01 | red/green diff areas, solid-vs-dashed lines distinguishing the two series |
| Scorecard | `specialScorecardTable` | table | m8-01-01 | full table style driven by `indicatorMetadata` (`_5_scorecard.ts`) |

Legacy `diffAreas` configs are converted to `specialDisruptionsChart` by the
po_config data transform (Block 9 — S2's machinery); no render or UI adapter
remains.

**The override contract (spans S10/S11).** The UI half lives in the style
panel (S11 custody,
`components/visualization/presentation_object_editor_panel_style/`): the panel
gates each mode's toggle by `canUse*` — an active-but-no-longer-allowed mode is
still listed so the user can switch away — and `setMode()` in `_timeseries.tsx`
forces the hidden properties to safe defaults on every mode switch (e.g.
`barsStacked=false`). The renderer builders hardcode those same values as the
safety net for saved configs never touched via the UI.

**Legends.** `getLegendFromConfig`
([conditional_formatting.ts](client/src/generate_visualization/conditional_formatting.ts))
returns the hardcoded per-mode `LegendInput` for active special modes
(localized from the figure's `FigureLocalization` — EN/FR/PT), and otherwise
falls through to the user-facing conditional-formatting compile path
(`selectCf` + `compileCfToLegend` in `conditional_formatting/compile.ts`).

**Metric-gated knobs that are not modes.** `special_chart_checks.ts` also
carries `metricAlwaysObeysFormatAs` and `metricAllowsNegativeScale` (both
currently `["m9-02-01"]`, whose CIX/SII values are derived measures and can be
legitimately negative): threaded through `buildFigureInputs` into the standard
builder, they force the metric's own `formatAs` to win over the displayed
indicators' format and set the value-axis min to `"auto"`.
`_0_conditional_consts.ts` holds only `METRICS_WITH_NEGATIVE_PCT_VALUES`,
consumed by the style-panel UI.

## Slide→page rendering (generate_slide_deck)

Two files:
[convert_slide_to_page_inputs.ts](client/src/generate_slide_deck/convert_slide_to_page_inputs.ts)
(579 LOC) and `get_overlay_image.ts` (49 LOC). One transform,
`convertSlideToPageInputs(projectId, slide, slideIndex, config) →
APIResponse<PageInputs>`, serves all eight call sites — screen
(`slide_editor/index.tsx`, `slide_card.tsx`, `slide_deck_thumbnail.tsx`), AI
previews (`DraftSlidePreview.tsx`, `ai_tools/tools/drafts.tsx`), and the three
deck exports — so a slide renders byte-identically everywhere. Every surface
uses the same frame: `PAGE_WIDTH_DU` 1400 × `PAGE_HEIGHT_DU` 788
(`lib/consts.ts:171-173`).

The `Slide` union (`cover | section | content`, `lib/types/slides.ts`) maps to
panther `PageInputs` discriminants `cover | section | freeform`.

**Style resolution order** (`buildStyleForSlide`): 1)
`resolveColorThemeToPreset` — `custom` → panther `resolveColorTheme`, a brand
id (`gff` / `nigeria`) → `getBrandPreset`, else panther `getColorPreset`; 2)
panther `resolvePageStyle(layout, treatments, preset, pattern?)`; 3) app
overrides — per-slide title/subtitle/presenter/date font-size/bold/italic
knobs with hardcoded defaults, `fontFamily = config.fontFamily ?? "International
Inter"`, per-family letter spacing. A `DeckStyleContext = {fontFamily,
colorPreset}` is created per content slide and threaded into
`buildFigureInputs(bundle, deckStyle)` so embedded figures adopt the deck's
font and palette (`getFigureFont` in `get_style_from_po/_0_common.ts`).

Other resolution steps, all in the same pass:

- **Overlay/pattern** (cover/section only; content slides never get one):
  `pattern-*` values become panther `PatternConfig`s; the four image overlays
  (`dots`/`rivers`/`waves`/`world`) load
  `/images/{overlay}_for_{light|dark}_themes.png` picked by cover-background
  luminance.
- **Split fills** (content): `plain` → preset primary; `pattern` →
  `{patternType, baseColor: primary}`; `image` → the image loads separately
  into `PageInputs.splitImage` via the image cache.
- **Logos:** per-slide `show|hide|inherit` over the deck default; FASTR
  builtins load from the client root, custom logos from the server; load
  failures are silently dropped; sizing via the `LOGO_SIZE_TARGET_AREA` /
  `LOGO_SPACING_GAP_X` maps.
- **Watermark** from `config.useWatermark`; footer = `config.globalFooterText
  ?? slide.footer`.

**Blocks** (`convertBlockToPageContentItem`): text → markdown item at
`baseFontSize × MARKDOWN_TEXT_SIZE_SCALE` (1.6) — the stored `textSize` key's
multiplier is commented out at render (Open item); text backgrounds via
`resolveTextBackground` (`grey`/`primary`/`success`/`danger`; note `success`
renders `_SLIDE_BACKGROUND_COLOR` = `_NIGERIA_GREEN`, not the success token —
Open item). Image blocks await `getImgFromCacheOrFetch`: no `imgFile` →
`{spacer:true}`, fetch failure → a placeholder text item rendering the shared
localized `unavailableItemMarkdown()`. Figure blocks: absent `bundle` →
spacer; a `buildFigureInputs` throw → the same placeholder. Per-block
degradation never aborts the slide.

## Image cache, fonts, brand contracts

**Image cache** ([t2_images.ts](client/src/state/project/t2_images.ts), one
export `getImgFromCacheOrFetch`): a `TimCacheD("img_cache")` — in-memory LRU
(100) over IndexedDB — keyed by URL with `versionHash = url` and
`"any_version"` reads, so an entry never invalidates (Open item). 30s
abort-timeout, 3 retries with exponential delay (CORS errors not retried),
module-level per-URL failure backoff (capped 60s), in-flight promise dedupe.
Exactly three consumers: `convertSlideToPageInputs` (logos, split images,
image blocks), `get_overlay_image.ts`, and `StylePreview.tsx` — screen render
and slide exports share it; report/dashboard exports fetch directly.

**Fonts** — two disjoint paths. Screen text uses hand-written `@font-face`
rules in `client/src/app.css` (woff2). Export PDFs embed TTFs: the four PDF
exporters pass `{basePath: "/fonts", fontMap: fontMap.ttf}` from
`client/src/font-map.json` to panther
`createPdfRenderContextWithFontsBrowser`, which fetches and `addFont`s each
file into jsPDF. `SLIDE_FONTS` (`lib/types/_slide_fonts.ts`) registers the
four deck families — International Inter (400/800), Fira Sans (400/800),
Merriweather (400/700), Poppins (400/700) — and `getAllSlideFontVariants`
expands a family to its 4–6 needed variants (markdown bold = `max(base, 700)`,
so an extra 700 pair when the family's bold is 800).

**Brand contracts:** [lib/brand_presets.ts](lib/brand_presets.ts) holds the
two brand `ColorPreset`s (`gff` #09544F, `nigeria` #027D53) consumed by the
theme picker, `resolveColorThemeToPreset`, the deck-config schema, and the S2
`slide_deck_config` transform's legacy-hex repair.
[lib/key_colors.ts](lib/key_colors.ts) is installed into panther at boot
(`setKeyColors(_KEY_COLORS)`, `client/src/index.tsx`) and carries the CF
traffic-light palette + qualitative scales (15 consumer files, including the
style builders and the CF editor).

## The export engine (client/src/exports)

13 files, ~1.1k LOC, no barrel (callers import files directly). Every heavy
engine is panther-side — `PageRenderer`,
`createPdfRenderContextWithFontsBrowser`, `pagesToPptxBrowser`,
`markdownToPdfBrowser` / `markdownToWordBrowser` — the app files are
orchestrators: fetch detail → build model/PageInputs → panther → `saveAs`.
All eight entries return `APIResponse` envelopes (never throw), take a
`progress(pct)` callback, and yield to the UI between items.

| Artifact | Formats | Pipeline |
| --- | --- | --- |
| Slide deck | PDF (download), PDF-base64 (email), PPTX | fetch deck detail + per-slide `_SLIDE_CACHE` → `convertSlideToPageInputs` → PageRenderer into jsPDF (deck-family fonts only) or `pagesToPptxBrowser`; 1400×788 |
| Dashboard | PDF, PPTX, XLSX, single-figure PNG | fetch-free: `buildDashboardExportModel(PublicDashboardBundle)` flattens groups to per-member figures → `prepareFigures` render-validates each at 200px + white-bakes → per-figure pages (PDF 1200-wide, ideal-height, portrait/landscape flip; PPTX 1200×675) or one XLSX sheet per **table** figure |
| Report | PDF, Word | fetch report detail → hydrate figure/image maps keyed by literal `figure:<id>` / `image:<id>` tokens → `markdownTo{Pdf,Word}Browser` (PDF 1000×1414 with page numbers) |
| Single viz | PNG, table CSV, data CSV, JSON definition | in the editor (`visualization_editor_inner.tsx`, outside `exports/`): transient bundle → `getFigureAsCanvas` at `FIGURE_EXPORT_WIDTH_PX` 1920; multi-replicant download disabled |

The email exit is the only non-download path: `ShareSlideDeck` →
`exportSlideDeckAsPdfBase64` → `sendSlideDeckEmail` (S12's SendGrid route)
with the PDF as attachment.

**`getTableExportAoa`**
([get_table_export_aoa.ts](client/src/exports/get_table_export_aoa.ts))
exports the **displayed** text, not raw values: it rebuilds the renderer's
per-cell `textFormatter` from the hydrated style and replicates the renderer's
guard order, emitting caption/col-group/header/row-group/footnote rows.
Exactly two consumers: dashboard XLSX and the editor's table CSV (with BOM for
Excel). It requires hydrated FigureInputs — the formatter is a rebuilt
closure.

**Degradation contracts differ by artifact.** Dashboards degrade twice
(build-time `tryItemFigureInputs` catch → null, then render-validation catch →
null) and a null figure becomes a placeholder page — one bad figure never
aborts. Reports swap failed/orphaned media tokens in place for the localized
placeholder. Slide decks degrade per-block upstream in
`convertSlideToPageInputs`, but a failed slide fetch or convert **aborts the
whole deck export**. XLSX silently skips non-table figures by design and
catches per-sheet.

**UI entry points:** `DownloadSlideDeck` + `ShareSlideDeck` (deck page),
`DownloadReport` (report page), `DownloadDashboardModal` — public viewer
only; the in-app dashboard editor builds the same bundle type but has no
export entry — and the viz editor's download modal. Dashboard exports
sanitize filenames (`sanitizeFilename`); deck/report exports pass the raw DB
label to `pdf.save`/`saveAs` (Open item).

## Open items

- Delete the `strip_figure_inputs.ts` comment-only tombstone (zero importers;
  its "kept for the import chain" rationale is void).
- The three slide-deck exporters triplicate the fetch/convert loop (~150
  duplicated lines; the two PDF variants differ only in their tail) — extract
  one shared iterator.
- Filename rules are inconsistent: dashboards sanitize, deck/report exports
  pass the raw label (a `/` or `:` in a label hits browser munging), the viz
  editor does spaces→underscores. Pick one rule.
- `exportDashboardAsXlsx`'s per-figure loop never yields — its progress bar
  cannot repaint mid-workbook.
- Deck exporters' catch drops non-Error detail (`e instanceof Error ?
  e.message : ""`); dashboard/report use `String(e)`.
- Slide `textSize` is dead at render: the `TEXT_SIZE_REL` multiplier is
  commented out in `convertBlockToPageContentItem` while the editor still
  writes the key, the schema validates it, and `lib/consts.ts:175-179` claims
  the renderer maps it. Wire it back or delete the knob.
- `config.showPageNumbers` is unwired: `PageInputs.pageNumber` is never set
  anywhere (the `slideIndex` param is unread; the style block computes a
  page-number color for text that never renders). `headerSize` is likewise a
  dead stored knob.
- Stale contract comments in the S2 migration transforms
  (`slide_config.ts:26,84,188`; `reports.ts:56,75`) still describe
  `figureInputsSchema`/`zFigureInputs` validation that no longer exists.
- The image cache never invalidates (version = URL): replacing a logo/image
  asset at the same server path serves the stale image until site data is
  cleared.
- `client/index.html` preloads three nonexistent `/fonts/Inter-*.woff2` files
  (404 on every load); `font-map.json` exists as byte-identical copies at
  `client/src/` and `client/public/fonts/`, and its `woff2`/`boldVariants`
  sections have zero consumers.
- `loadLogos` logic is duplicated (`convert_slide_to_page_inputs.ts` vs
  `StylePreview.tsx`).
- `resolveTextBackground("success")` renders `_SLIDE_BACKGROUND_COLOR`
  (= `_NIGERIA_GREEN`), not the success token — misleading name or wrong
  color; needs a ruling.
- Deck PDF loads only the deck family's font variants while dashboard PDF
  unions per-page fonts — a figure styled with another family hits "Font not
  found in map", and only dashboard PDF friendly-cases that error.
- The viz editor's multi-replicant download is disabled (`allReplicants`
  hard-coded false, `downloadMultiple` commented out) — revive or delete.
- `_0_conditional_consts.ts` is a single-const file whose three importers are
  all style-panel UI files — merge into `special_chart_checks.ts` or move to
  the UI side.
- Two transparency mechanisms for the same user option: the editor PNG honors
  transparency only in the no-padding branch (`getFigureAsCanvas` fills
  white); the dashboard PNG bakes `backgroundColor:"none"` — unify (blocked on
  a panther transparent flag).
- `buildReportFigureMap` is `async` with zero awaits.
