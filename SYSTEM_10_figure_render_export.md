---
system: 10
name: Figure Rendering & Export Engine
globs:
  - client/src/exports/**
  - client/src/generate_slide_deck/**
  - client/src/generate_visualization/**
  - client/src/state/products/t2_images.ts
  - lib/brand_presets.ts
  - lib/indicator_format_metrics.ts
  - lib/key_colors.ts
  - lib/resolve_effective_format.ts
  - lib/resolve_figure_calendar.ts
  - lib/types/_figure_bundle.ts
  - lib/types/_slide_fonts.ts
docs_absorbed:
---

# S10 — Figure Rendering & Export Engine

Pure transforms from data+config to pixels and files: a stored **FigureBundle**
rebuilt to panther `FigureInputs` by one `buildFigureInputs` transform,
slide→page rendering, PDF/PPTX/DOCX/CSV/PNG export.

## Scope

The `globs:` frontmatter above is the lint-enforced manifest
(`lint_systems.ts`); sub-file custody exceptions are in SYSTEMS.md §4.1.
`client/src/generate_visualization/**` (`buildFigureInputs`, the bundle
resolvers `resolve_figure_from_metric.ts` +
`resolve_bundle_from_metric_and_config.ts`, the pure staleness predicate
`figure_staleness.ts`, special chart modes, the conditional-formatting compile
path, `GLOBAL_STYLE_OPTIONS`); `generate_slide_deck/**`
(`convertSlideToPageInputs`); `client/src/exports/**` (incl.
`get_table_export_aoa.ts`); lib render contracts (`_figure_bundle.ts`,
`brand_presets.ts`, `key_colors.ts`, slide-font types);
`state/products/t2_images.ts`. Non-lint assets reviewed here:
`client/src/font-map.json` and `client/public/fonts/` (102 font files plus
`fonts.css`).

## Contract

One renderer per artifact class shared by screen and export; stored snapshots
are pure-JSON FigureBundles rebuilt to transient `FigureInputs` at render by
`buildFigureInputs` — render never re-queries. `figureBundleSchema` (strict Zod,
[lib/types/_figure_bundle.ts](lib/types/_figure_bundle.ts)) binds every stored
figure block on both document surfaces; the legacy-block repair arm is S2's
`_figure_block.ts` transform (co-reviewed).

**Every bundle names the pair it was resolved under.** `scope: { adminArea2 }`
and `provenance.runId` are REQUIRED fields, and they are what make a stored
figure self-describing: staleness is a comparison against the product's pair
(below), and `getRollupRowLabel` reads `bundle.scope` and **never a global
store** — which is what makes an export, a thumbnail or a version preview label
its roll-up row correctly outside any authoring shell.

## FigureBundle architecture (shipped 2026-06-13)

This is the authoritative record of the FigureBundle refactor. The two planning
docs that drove it (`PLAN_FIGURE_BUNDLE.md` = vision,
`PLAN_FIGURE_BUNDLE_IMPL.md` = executable plan) were deleted on completion; this
section replaces them. Sibling slices live in S9 (the upstream capture side),
S12 (the two storage surfaces), and S2 (the boot-time backfill). The
PresentationObject → Figure vocabulary rename is the one deferred slice (Open
items below).

### The idea

Both snapshot surfaces — slides and reports — used to persist a **dehydrated
`FigureInputs`**: panther's post-transform render artifact. That was costly in
four ways:

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
3. **A half-live inconsistency.** `style`/`formatAs`/`geo` were already
   re-derived live at render while `caption`/labels/sort/data stayed frozen — a
   metric `formatAs` flip could render a "percent" style over a frozen "number"
   caption.
4. **A second serialization patch — the undefined sentinel.** Gap cells and
   optional `*Prop` fields are legitimately `undefined`, and `JSON.stringify`
   drops `undefined` (shifting array indices, losing keys). Slides/reports
   papered over this with a _second_ encode/decode layer (`@@__UNDEFINED__@@`
   swap on the client wire path; the server stored the sentinel form verbatim).

The fix: **stop storing the post-transform artifact. Store the upstream inputs
as a pure-JSON `FigureBundle`, and build `FigureInputs` at render** — with the
same transform the live editor already runs each reactive tick.

```text
FigureBundle  ──buildFigureInputs()──▶  FigureInputs  ──panther──▶  pixels
(pure JSON: stored in a document,       (in-memory, transient,
 or transient for a live figure)         never persisted)
```

Because the bundle is pure JSON (frozen `items` are plain query rows; no
transformed grid; no functions), it needs **neither** patch: the strip/hydrate
pipeline _and_ the sentinel layer are gone.

### Vocabulary

| Term | Meaning | Lifetime |
| --- | --- | --- |
| **Figure** | `{ metricId, config }` rendered inside a product, under that product's `(runId, adminArea2)` pair. Not a row — it has no id of its own. | — |
| **Live figure** | The transient render of a figure while it is authored or explored: items re-queried each tick, nothing persisted. | Live |
| **FigureBundle** | The **stored shape** of a figure: pure-JSON inputs sufficient to rebuild the render, plus the pair it resolved under. | Stored |
| **`PresentationObjectConfig`** | The figure-config type name, in `lib`. Storage vocabulary only. | — |
| **FigureInputs** | Panther's transient render-input type. **Never persisted** under this design. | In-memory |
| **`buildFigureInputs(bundle, deckStyle?)`** | The one transform inputs → `FigureInputs`. | — |

The `presentation object` / `PO` vocabulary survives in code — the config type,
`getRunPresentationObjectItems`, the cache internals — and renaming it to
_figure_ end-to-end is a separable mechanical pass (Open items).

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
  indicatorMetadata: IndicatorMetadata[];  // label replacements + scorecard sort + per-indicator formats
                                           // (8-field existing type). Sourced from the run manifest's
                                           // indicator catalog — the DB-era derivation moved into
                                           // server/runs/indicator_catalog.ts VERBATIM (audited: no
                                           // repair, so stored bundles needed no metadata sweep)
  dateRange?: PeriodBounds;                // {min,max}: DATE_RANGE caption text + earliest/latest point
  geo?: GeoRef;                            // maps only — {kind:"level"} | {kind:"data"} (see Geo)
  localization: { language; calendar; countryIso3; fiscalYear }; // REQUIRED, frozen — see Localization
  metricId: string;                        // the re-resolve pointer (never read at render)
  scope: { adminArea2: string | null };    // REQUIRED — the scope half of the pair (null = national)
  snapshotAt: string;                      // "" on a transient live bundle
  provenance: { runId; moduleLastRun; datasetsVersion }; // runId = the package half of the pair
};
```

**`scope` + `provenance.runId` are the pair, and they live HERE, not in
`config`** — the pair is a data-plane fact, so putting it in the config would
push it into the fetch hash and the cache key (S9). Both are REQUIRED: a bundle
that could not say which pair it came from could not be judged stale, so a
missing key is a fail-loud parse error rather than something to default.
`figureLocalization.fiscalYear` is the one defaulted field (`"none"`), because a
bundle without it predates fiscal-year reporting entirely — that is a reading,
not a guess.

**Why `resultsValue` is a projection, not the whole metric (proven, not
asserted):** `buildFigureInputs` and every downstream builder
(`get*JsonDataConfig`, `getDisaggregatorDisplayProp`) is typed to
`ResultsValueForVisualization` (`lib/types/modules.ts`) = exactly
`{formatAs,
valueProps, valueLabelReplacements?}`. The type system guarantees
the build _cannot_ read a fourth metric field, so the bundle stores that
existing type verbatim. `IndicatorMetadata`, `PeriodBounds`, and
`ResultsValueForVisualization` are all reused, not redefined — and each
sub-schema is `z.strictObject` locked to a `Required<T>` parse so a new field in
the source type is a compile error here (the stored shape can't silently drift
past the skip-gate).

### `buildFigureInputs` — one transform, two item sources

[client/src/generate_visualization/build_figure_inputs.ts](client/src/generate_visualization/build_figure_inputs.ts).
Signature `buildFigureInputs(bundle, deckStyle?): FigureInputs`. It folds what
used to be three steps — the data transform (`getTimeseriesDataTransformed` +
the `get*JsonDataConfig` builders), style derivation (the old `hydrate*`), and
geo resolution — into one, then branches on `effectiveConfig.d.type` (timeseries
/ table / chart / map / pie). It **throws** on bad input (callers catch).
Timeseries and pie transform their data eagerly (`get*DataTransformed`) so
transform-time throws (e.g. pie's negative-value rejection) surface inside the
caller's catch rather than at measure time in panther; the other types pass
`{jsonArray, jsonDataConfig}` untransformed. Pie never passes an explicit legend
— CF is unwired for slices (they color via the series sentinel), so a carried
`cf*` state must not surface a threshold/scale legend; panther derives the
categorical slice legend from series headers, swatched by the same
`seriesColorFunc` as the slices.

The elegant consequence the whole design turns on:

> **A FigureBundle is precisely the argument set `buildFigureInputs` consumes.**
> A snapshot is literally "capture the current build inputs into a bundle." One
> build function, two item sources: **live query** vs **baked items**.

| Caller | Surface | Items | Localization source |
| --- | --- | --- | --- |
| `t2_figure_data.ts` (`getFigureInputsFromCacheOrFetch_AsyncGenerator`) | **live figure** | live query | `getSnapshotInstanceLocalization()` — a **transient** bundle each tick, `snapshotAt: ""` |
| `convert_slide_to_page_inputs.ts`, `ReportFigureEmbed.tsx`, `_report_export_maps.ts`, the editor's PNG/CSV, AI previews | **stored figure / export** | baked in the bundle | `bundle.localization` (frozen) |

So the live figure and the stored one run **identical code**: identical code
path, and identical output when the pairs match. (When they do not, the stored
figure is stale by definition and says so — it is not a rendering discrepancy.)
The transient bundle carries the live pair for the same reason the stored one
does: `getRollupRowLabel` reads it. `deckStyle?` is the deck-level theme; slides
pass it, the others omit it.

### The four invariants (load-bearing)

1. **Render never re-queries.** A figure renders only from its baked `items`;
   `metricId` exists _solely_ for the explicit re-resolve actions (the stale
   figure's "Update to \<package\>" button, the editor's Apply).
2. **The bundle is pure serializable JSON** — no functions,
   structured-clone-safe, no `undefined`-valued keys (absent, not `undefined`).
3. **One build function** serves both live figures and stored ones.
4. **`FigureInputs` is transient** — built at render, handed to panther, never
   persisted.

### Localization is captured, not ambient (the rule that prevents regressions)

The principle, in Tim's words: **capture locale into the bundle and use the
bundle's locale for ALL rendering — every surface, never an ambient read.**
`localization = {language, calendar, countryIso3}` is frozen in the bundle
exactly like `config` and `items`, and `buildFigureInputs` resolves **all**
figure text/dates from `bundle.localization` only — it must **never** read or
write the global `t3`/`getCalendar`/`getLanguage` singletons.

- **What is captured = the INSTANCE locale**, not the per-user UI toggle:
  `getSnapshotInstanceLocalization()` (`client/src/state/instance/t1_store.ts`) returns
  `{instanceLanguage, instanceCalendar, countryIso3}`. Figures are
  instance-language artifacts.
- **The threaded reads** (all app-side; panther unchanged): the ~21
  `t3({en,fr})` calls in the build path became explicit
  `pickLang(bundle.localization.language,
  …)` (`lib/translate/t-func.ts`);
  `withReplicant` takes `bundle.localization.countryIso3`; chart/table calendar
  comes from `bundle.localization.calendar`.
- **Timeseries period axis** is the one string panther formats itself, and it
  reads its calendar from the **figure style** (`style.xPeriodAxis.calendar`,
  set by the four `get_style_from_po/_{1..4}` builders) — so it's a calendar
  concern handled by the same bundle thread, **not** a new `TimeseriesInputs`
  prop or a `FigureInputs`-shape change (panther's period formatting is
  calendar-only, no language).
- **Fiscal-year reporting is a figure-style calendar, nothing more.**
  [resolve_figure_calendar.ts](lib/resolve_figure_calendar.ts) is the ONE place
  `INSTANCE_FISCAL_YEAR=july` becomes a panther calendar: it returns
  `"gregorian-fy-july"` only for a gregorian, quarterly, timeseries figure and
  otherwise passes `localization.calendar` through. `get_style_from_po.ts` calls
  it, so the relabeled axis (large ticks on July, band reading FY2025/26) rides
  the same bundle thread as every other calendar decision. It changes nothing
  about how periods are stored, filtered, sorted or fetched — the period-range
  filter above a chart still reads calendar quarters, which is intended. The
  three guards are load-bearing (quarterly-only, timeseries-only,
  gregorian-only); the server also refuses fiscal-year + Ethiopian at boot
  ([exposed_env_vars.ts](server/exposed_env_vars.ts)), and this function is the
  second line of defence that protects already-stored bundles.
- **Deliberate behavior change (a bugfix).** Previously those `t3` calls
  followed the session toggle, so a Senegal figure showed English legends if the
  author had toggled English. Now figures are **always** instance-language; the
  EN/FR UI toggle is **chrome-only** (menus/buttons). The live editor preview
  uses instance language too (WYSIWYG: preview == capture == what every viewer
  sees).
- **Why frozen-in-bundle and not "pass current env":** anonymous public/export
  surfaces have _no_ ambient env to read, so the bundle must carry its own.
  Making it always-frozen (rather than per-surface A/B) is the simpler, single
  rule — and it deletes the old `hydrateFigureInputsForPublicRendering`
  special-casing.

### Geo

`GeoRef` is a discriminated union. `{kind:"level", level, family?}` — the
in-app case: `buildFigureInputs` re-derives the GeoJSON from the sync cache
(`getGeoJsonSync`) at render, storing no geometry. `{kind:"data", data}` — the
baked case: the full GeoJSON travels in the bundle, which is what a map
survives on when it is captured while the sync cache holds the geometry and
rendered somewhere that has no cache at all. `family` selects the registry's
map (`hmis` when absent, the same reading as an absent
`ResultsValue.datasetFamily`).

### No serialization layer, by construction

Two patches that a stored `FigureInputs` needed do not exist here and must not
come back: there is **no strip/hydrate pipeline** (a bundle holds no functions,
so nothing has to be stripped on write and rebuilt on read) and **no undefined
sentinel** (a bundle holds no `undefined`-valued keys — absent, not
`undefined` — so `JSON.stringify` is lossless over it). Anything that would
reintroduce a function or an `undefined` into the bundle shape breaks both at
once.

### The resolvers

Two functions in
[resolve_bundle_from_metric_and_config.ts](client/src/generate_visualization/resolve_bundle_from_metric_and_config.ts)
turn `{ metricId, config }` + a pair into a bundle, over one assembler
(`makeFigureBundleFromFetchedData`, for callers that already hold fetched
items). **The split is deliberate and is exactly one policy:**

- `resolveBundleFromMetricAndConfig(scope, metric, config)` validates the
  replicant **strictly** (`assertReplicantValid` throws with the valid-value
  list) — the AI path, where the model must be told what it got wrong.
- `resolveFigureBundleInteractively(scope, metric, config)` **auto-defaults** a
  replicant that is unset or no longer valid under the target package, and
  returns `{ ok: false, reason }` instead of throwing. This is the path EVERY
  human write takes — insert, replace, apply-an-edit, and the stale-figure
  update — and the auto-default is required, not lenient: a reattach must never
  throw, because a stored replicant value legitimately disappears when the
  package moves.

Both stamp `scope` and `provenance.runId` from the pair they were called with;
neither reads an ambient store for it.

### Staleness — a per-figure comparison, never a pre-flight

[figure_staleness.ts](client/src/generate_visualization/figure_staleness.ts) is
pure — no fetches, no stores, no components:

```ts
isFigureBundleStale(bundle, productScope) =
  bundle.provenance.runId !== productScope.runId ||
  bundle.scope.adminArea2 !== productScope.adminArea2;
```

A product carries exactly one pair; a bundle names the pair it resolved under; a
figure is stale when the two disagree. That happens when the product is
reattached or its scope changes, and NOT before — nothing rewrites stored
bundles behind the user's back, so a mixed-package product is a visible,
intentional state (a Q2 figure kept beside a Q3 one). The same file's
`findStaleFiguresInLayout` / `findStaleFiguresInReport` walk a slide's layout
tree and a report's figure registry, returning the block/registry id each update
writes back to.

Reattach and scope change therefore never block and have **no compatibility
pre-flight anywhere**: the per-figure badge IS the report. The badge and the
update action are S11's
([figure_editor/stale_figure_badge.tsx](client/src/components/figure_editor/stale_figure_badge.tsx));
when the re-resolve fails, the reason comes from `figurePackageIssueForMetrics`
([lib/figure_package_issue.ts](lib/figure_package_issue.ts)) — manifest-only,
shared with the server, resolving metric-absent → metric-unavailable →
dimensions-missing in that order — and it is shown ON THAT FIGURE with the old
bundle left in place.

## Special chart modes — the style pipeline

`buildFigureInputs` derives every figure's `style` through one dispatcher,
`getStyleFromPresentationObject`
([get_style_from_po.ts](client/src/generate_visualization/get_style_from_po.ts)),
which delegates to five per-mode builders (`get_style_from_po/_1_standard.ts` …
`_5_scorecard.ts`). Each builder returns a **complete**
`CustomFigureStyleOptions` — mode-specific values hardcoded, shared layout
deliberately duplicated for explicitness; common helpers (text style, table
layout/cells, map regions, pie slices, the standard series/map color funcs) live
in `_0_common.ts`, which also owns `GLOBAL_STYLE_OPTIONS`, applied app-wide via
`setGlobalStyle` at boot ([index.tsx](client/src/index.tsx)).

### Roll-up row label under an AA2 scope

`getRollupRowLabel` (in `get_data_config_from_po.ts`) has one display-side
override: when the label context resolves national but the figure's scope names
an area, it renders the pinned form ("{Area} — All areas") — the scope filter is
server-injected and never in the PO config, so without this a scoped figure's
roll-up row would read "National" while totalling one area.

**The rule: it reads `bundle.scope`, never a global store.** The scope is a
per-figure fact, and the function is handed it as an argument. That is what
makes an export, a slide thumbnail or a version preview label the row correctly
outside the authoring shell — there is no ambient scope to read there, and a
figure copied between two products of different scopes keeps its own answer.
Equally: the scope must never be pushed into the config to reach this code,
because the config reaches the fetch hash and the cache key (S9). Full ruling on
the roll-up row in SYSTEM_09; the product's scope in SYSTEM_12.

### Sample sizes in table headers (`s.showNValues`)

v1 display policy for the `__n_*` columns S9 emits. The data half is `nProps` on
the table data config
([get_data_config_from_po.ts](client/src/generate_visualization/get_data_config_from_po.ts)):
`{ <valueProp>: __n_<valueProp> }` whenever the toggle is on. The display half
is `getTableColHeadersContent` in `_0_common.ts`, wired into `_1_standard.ts`
only — scorecard tables are out of scope.

- **Column item headers only.** panther fires the header `textFormatter` for
  col-GROUP headers as well, with a span-wide digest, so the formatter gates on
  `info.isGroupHeader` — without it a group label reports the largest n beneath
  it as its own. Rows and cells stay undecorated (panther supports both;
  `TableCellInfo.sampleN` is available for a later per-cell policy).
- **`(n=max)` over the header's slice.** A column whose n is constant shows
  exactly that n, since max equals it. `n=0` is suppressed: it is a finite
  number to panther and would render.
- **Everything self-gates on the data.** No eligibility flag travels with the
  figure. Absent `sampleN` (items carry no `__n_*`, or roll-up exclusion left no
  numeric cell) leaves the label untouched, so figures stored before the feature
  render exactly as before, live and stored alike. The editor toggle is offered
  only for HFA facility-level metrics (`datasetFamily` + `hasFacilityLevelRows`
  on the enriched metric) — a UI affordance, not a gate.
- **Roll-up exclusion is perpendicular.** A roll-up row on the opposite axis
  would otherwise dominate every column's digest (verified: 212 instead of
  55/32). panther keys this off `liveDomainExcludeIds`, which the data config
  already sets whenever roll-up is active — no extra wiring.

A **special mode** is a boolean flag on `config.s` that overrides most
user-facing style properties with hardcoded rendering. A mode is active only
when its flag is set AND `config.d.type` matches its gate — the `is*Active`
checks in
[special_chart_checks.ts](client/src/generate_visualization/special_chart_checks.ts),
the single home for mode gating (its per-metric `canUse*` arrays decide whether
the editor shows a mode's toggle). Dispatch priority in
`getStyleFromPresentationObject`: scorecard → coverage → percent-change →
disruptions → standard.

| Mode           | Flag (`config.s`)         | Gate (`d.type`) | Metrics                  | Builder behavior                                                                                                        |
| -------------- | ------------------------- | --------------- | ------------------------ | ----------------------------------------------------------------------------------------------------------------------- |
| Coverage       | `specialCoverageChart`    | timeseries      | m4-01-01, m6-01/02/03-01 | hardcoded series colors (black / red / grey), forced points with `toPct0` last-value labels                             |
| Percent change | `specialBarChart`         | timeseries      | m3-01-01                 | red/green bar coloring + signed value labels from period-to-period diff vs `specialBarChartDiffThreshold` (default 0.1) |
| Disruptions    | `specialDisruptionsChart` | timeseries      | m3-02/03/04/05-01        | red/green diff areas, solid-vs-dashed lines distinguishing the two series                                               |
| Scorecard      | `specialScorecardTable`   | table           | m8-01-01                 | full table style driven by `indicatorMetadata` (`_5_scorecard.ts`)                                                      |

Legacy `diffAreas` configs are converted to `specialDisruptionsChart` by the
po_config data transform (Block 9 — S2's machinery); no render or UI adapter
remains.

**The override contract (spans S10/S11).** The UI half lives in the style panel
(S11 custody,
`components/figure_editor/presentation_object_editor_panel_style/`): the panel
gates each mode's toggle by `canUse*` — an active-but-no-longer-allowed mode is
still listed so the user can switch away — and `setMode()` in `_timeseries.tsx`
forces the hidden properties to safe defaults on every mode switch (e.g.
`barsStacked=false`). The renderer builders hardcode those same values as the
safety net for saved configs never touched via the UI.

**Legends.** `getLegendFromConfig`
([conditional_formatting.ts](client/src/generate_visualization/conditional_formatting.ts))
returns the hardcoded per-mode `LegendInput` for active special modes (localized
from the figure's `FigureLocalization` — EN/FR/PT), and otherwise falls through
to the user-facing conditional-formatting compile path (`selectCf` +
`compileCfToLegend` in `conditional_formatting/compile.ts`).

**Effective format.** Split on purpose, one authoritative site each: THE
resolution RULE is the file header of
[resolve_effective_format.ts](lib/resolve_effective_format.ts); what follows is
the WIRING map — which surface takes which of the two answers, and why.

Every metric DECLARES its format source (`formatAs: "percent" | "number" |
"indicator"`, authored in `wb-fastr-modules`). `"percent"`/`"number"` mean the
values are the metric's own quantity and the format is a constant everywhere
(m10-02 don't-know RATES stay percent on count questions; m9-02-01 CIX/SII
stays number). `"indicator"` means the values ARE the displayed indicator's own
quantity, so format is a per-value fact carried by `IndicatorMetadata.format_as`
— HFA per `getHfaIndicatorMeasure`, calculated indicators per their required
three-way field, ICEH alike. The declared metrics today: m7-01-01/02/03,
m8-01-01, m10-01-01/02, m10-03-01/02, frozen in `INDICATOR_FORMAT_METRIC_IDS`
(lib) — see "Repair and normalization" below.

`resolveEffectiveFormat` (config-based, pre-query, for the editor) and
`resolveEffectiveFormatFromItems` (render twin over a stored `FigureBundle`)
both return `{ axisFormat, formatForValue(ids) }`. Which one a consumer wants is
decided by WHAT it is formatting, never by a flag:

- `formatForValue(ids)` — THE source for any individual value. Every surface
  that writes one number calls it: table cells (`getTableCellsContent`),
  chart/timeseries data labels (`_1_standard.ts`), map regions
  (`getMapRegionsContent`), scorecard cells (`_5_scorecard.ts`). The caller
  passes the ids that identify the value, most specific first, through the two
  shared helpers `getIndicatorIdsForCell` / `getIndicatorIdsForChartValue`, and
  the first id that DECLARES a format wins — not the first id found, because
  the catalog deliberately carries label-only entries (HFA categories and
  variant items, ICEH strat codes, raw common indicators) that would otherwise
  mask the formatted indicator beside them. A cell's id list includes all FOUR
  table headers: `getStartingConfigForPresentationObject` assigns display
  options in order, so an indicator dimension routinely lands on `rowGroup` or
  `colGroup` (panther's `TableCellInfo` carries both group headers for exactly
  this reason).
- `axisFormat` — the collapsed answer (the format every displayed indicator
  agrees on, else `"number"`), and ONLY for figure-wide decisions that cannot
  be per-value: the shared scale axis and its tick labels, the `forceYMax1`
  clamp, the pie completion envelope, the scale legend. The collapse is lossy
  by nature and must never reach an individual value.

Surfaces that legitimately take `axisFormat` alone: the four special chart
modes (`_2_coverage.ts`, `_3_percent_change.ts`, `_4_disruptions.ts`, and the
percent-change bars), because every metric gated into them (m3/m4/m6) is
constant-format, so `axisFormat` equals the declaration. Pie slice labels are
also not per-value — a slice label is `label share%`, a fraction of the pie's
denominator, never a raw value — and the doughnut centre label is formatted
inside panther from the slice sum.

Consumers re-check the RESOLVED format, not stored flags: `forceYMax1` applies
`max: 1` only when `axisFormat` is percent (`_1_standard.ts` ×2,
`_2_coverage.ts`, `_3_percent_change.ts`, `_4_disruptions.ts`), the same
pattern as `isPieCompletionMode` — an `"indicator"` metric's format is
filter-sensitive, so a stranded flag degrades to auto instead of clamping
counts at 1.

**Editor/render divergence** is confined to `"indicator"` metrics whose
possible-values status disagrees with the actual rows, and only ever in
`axisFormat` (`formatForValue` reads the same catalog on both sides). The
editor resolves `"number"` on `too_many_values`, `error` AND
`no_values_available` — all three are "cannot enumerate" — while the renderer
sees the rows' unanimous format; and a possible-but-rowless indicator value
counts for the editor but not the renderer. The consequence is not cosmetic:
the CF editor picks a percent control vs a number input off `axisFormat`, so on
a diverging figure the user types a threshold in the wrong units. That is why
the CF editor's `ValueInput` scales BOTH percent and `rate_per_10k` between
stored and displayed units rather than trusting a raw number input, and why its
top cutoff has no hardcoded ceiling of 1. (Also confirmed: `resultsValueInfo`
does NOT refetch on a filter edit — its cache keys on `(runId, scopeToken,
metricId)` only — which is exactly why the resolver is config-based and reacts
to the draft config with no fetch.)

RULED (2026-08-09): the CF editor's scaling factor stays `axisFormat`-driven —
cutoffs are figure-wide, so there is no per-value answer — even though the
factor is therefore filter-sensitive on an `"indicator"` metric (add a percent
indicator to a rate figure and the same stored `0.0005` box switches from
"5 per 10k" to raw). Cutoffs are stored and compared raw, so colouring never
moves; the mitigation is that the active unit is VISIBLE on the control
(PercentSelect shows `%`, the number input shows a "per 10k" marker when the
axis is a rate, bare otherwise), so a unit switch is something the user sees
rather than discovers by mis-typing. `scaleForInput` also rounds the displayed
value to 6 decimals — ×10,000 on a stored fraction otherwise redisplays the
"3" the user just typed as `2.9999999999999996`.

**`rate_per_10k`** is stored as a bare rate and written as a per-10,000 count.
Two rules, each with one implementation: `scaleValueForFormat` owns the
scaling (×100 for percent, ×10,000 for rate — `formatIndicatorValue` and the
scorecard's threshold comparison both go through it), and `formatRateAuto` owns
the decimals — the fewest (≤3) that print the scaled value EXACTLY, decided per
value. Every rate LABEL follows `formatRateAuto`: the scale axis (via panther's
`tickLabelFormatter` escape, since panther's `format` field is two-way), data
labels, the scale legend (`scaleLegendFormat`), the threshold legend, the CF
editor preview (`buildAutoValueFormatter`) and the calculated-indicator
editor's live preview. The one deliberate non-label exception: the AI CSV
(`format_metric_data_for_ai.ts`) emits rates at a fixed `toFixed(2)` — a CSV
column wants a stable width, not per-value decimals. The `s.decimalPlaces` knob
does NOT apply to rates — it defaults to 0 and would print `1` beside an axis
tick reading `1.2` — and no list-wide auto count applies either, since sizing
for a DISTINCT list rounds a 0.25 boundary to "0.3" while the axis prints
"0.25". Because the knob is inert on a pure-rate figure, the style panels hide
the decimal-places control when `axisFormat === "rate_per_10k"`; on a MIXED
"indicator" table it stays visible, since it genuinely works on the percent
cells (the pie panel also keeps it — slice labels are percent shares whatever
the metric's format). A related acceptance: the scale legend's boundary
decimals are now per-value, so a rate boundary list prints `0 / 0.25 / 0.5 /
0.75 / 1` rather than a shared decimal count (`0.00 / 0.25 / 0.50 / …`) — the
direct consequence of the one-rule decision that fixed the duplicated-label
bug; do not "fix" it back.

**Repair and normalization.** `INDICATOR_FORMAT_METRIC_IDS`
([indicator_format_metrics.ts](lib/indicator_format_metrics.ts)) is the frozen
list of every metric that must read `"indicator"` — most predate the three-way
`formatAs` and have stored data to repair; m10-03-01/02 were authored
`"indicator"` from day one and sit there defensively, for normalization only.
It never grows — a metric authored now says `"indicator"` itself. It has two jobs: REPAIR of data written before the
declaration (`manifest_transform` block 2 for run manifests; the figure-block
sweep for stored bundles — see
[SYSTEM_02](SYSTEM_02_persistence.md) and
[PROTOCOL_APP_MIGRATIONS.md](PROTOCOL_APP_MIGRATIONS.md)), and NORMALIZATION at
the fetch boundary in `validateDefinition`
([load_module.ts](server/module_loader/load_module.ts)), which is what keeps a
definition resolved at an older gitRef from stamping a stale declaration into a
manifest that already carries the current schema version — a state no migration
could then reach.

The figure-block sweep is the one place that INFERS rather than reads a
declaration: a stored bundle carries no metric definition, so `inferFormatAs`
returns `"indicator"` for the eight listed ids and otherwise keeps the original
backfill heuristic (percent iff every stored indicator that declares a format
declares percent). It deliberately does NOT run the live resolution rule: that
one counts only values on an indicator DIMENSION, so a legacy figure displaying
no indicator dimension would resolve `"number"` and freeze a percent metric's
values as raw fractions, permanently.

**Metric-gated knobs that are not modes.** `special_chart_checks.ts` carries
`metricAllowsNegativeScale`, threaded through `buildFigureInputs`. It is the
app's whole answer to negative values on a value axis.
`ALLOW_NEGATIVE_SCALE_VALUES_METRICS` is the single list of metrics whose
displayed values can go below zero — signed-by-construction (m9-02-01,
m2-01-01..03, m3-0x-02) plus the volume metrics whose expected-value model can
predict a negative (m3-0x-01, m3-0x-03). Listed metrics get panther's
`"auto-zero"` axis minimum instead of the default `0`, which would map the
negative outside the plot box, over the x-axis tick labels. `"auto-zero"` is a
no-op on data that never crosses zero, so adding a metric cannot change how its
existing non-negative charts render — which is what makes an always-on
per-metric list the right shape here, rather than a per-chart toggle. It is
applied in `_1_standard.ts` (both `yScaleAxis` and `xScaleAxis` — horizontal
charts route through the latter) and in `_4_disruptions.ts`. **Not** in
`_3_percent_change.ts`: those bars plot raw volumes and the percent change only
drives their color and data label, so that axis never carries a negative.
`forceYMinAuto` is unrelated and unchanged — it stays the user's deliberate
tight-fit (`"auto"`), which may start above zero.

Known residue, same class: `forceYMax1` pins the axis at `1`, so a coverage
value above 100% is drawn _above_ the plot box. Unaddressed by `"auto-zero"`,
because a user who forces a max has asked for a fixed axis.

The same list drives the style-panel UI's `allowNegative`
(`metricAllowsNegativeScale` at the three CF-editor call sites), so a metric
whose axis fits below zero also accepts negative conditional-formatting
thresholds. The CF editor's cutoff bounds are format-driven: only a percent has
a natural floor (0, or -1 when signed) and ceiling (100%); counts and rates are
unbounded in both directions.

## Slide→page rendering (generate_slide_deck)

Two files:
[convert_slide_to_page_inputs.ts](client/src/generate_slide_deck/convert_slide_to_page_inputs.ts)
and `get_overlay_image.ts`. One transform,
`convertSlideToPageInputs(slide, slideIndex, config) →
APIResponse<PageInputs>`, serves every call site — screen
(`slide_editor/index.tsx`, `slide_card.tsx`, `slide_presenter.tsx`), the S16 version preview
(`version_history/deck_version_preview.tsx`), AI previews
(`copilot/ai_tools/DraftSlidePreview.tsx`, `ai_tools/tools/drafts.tsx`), and the
three deck exports — so a slide renders byte-identically everywhere. It takes no
product or package argument: everything a slide needs to render is inside the
slide and its deck config, which is why the same call serves a live editor and a
version snapshot. Every surface uses the same frame: `PAGE_WIDTH_DU` 1400 ×
`PAGE_HEIGHT_DU` 788 (`lib/consts.ts`).

The `Slide` union (`cover | section | content`, `lib/types/slides.ts`) maps to
panther `PageInputs` discriminants `cover | section | freeform`.

**Style resolution order** (`buildStyleForSlide`): 1)
`resolveColorThemeToPreset` — `custom` → panther `resolveColorTheme`, a brand id
(`gff` / `nigeria`) → `getBrandPreset`, else panther `getColorPreset`; 2)
panther `resolvePageStyle(layout, treatments, preset, pattern?)`; 3) app
overrides — per-slide title/subtitle/presenter/date font-size/bold/italic knobs
with hardcoded defaults,
`fontFamily = config.fontFamily ?? "International
Inter"`, per-family letter
spacing. A `DeckStyleContext = {fontFamily,
colorPreset}` is created per content
slide and threaded into `buildFigureInputs(bundle, deckStyle)` so embedded
figures adopt the deck's font and palette (`getFigureFont` in
`get_style_from_po/_0_common.ts`).

Other resolution steps, all in the same pass:

- **Overlay/pattern** (cover/section only; content slides never get one):
  `pattern-*` values become panther `PatternConfig`s; the four image overlays
  (`dots`/`rivers`/`waves`/`world`) load
  `/images/{overlay}_for_{light|dark}_themes.png` picked by cover-background
  luminance.
- **Split fills** (content): `plain` → preset primary; `pattern` →
  `{patternType, baseColor: primary}`; `image` → the image loads separately into
  `PageInputs.splitImage` via the image cache.
- **Logos:** per-slide `show|hide|inherit` over the deck default; FASTR builtins
  load from the client root, custom logos from the server; load failures are
  silently dropped; sizing via the `LOGO_SIZE_TARGET_AREA` /
  `LOGO_SPACING_GAP_X` maps.
- **Watermark** from `config.useWatermark`; footer =
  `config.globalFooterText
  ?? slide.footer`.

**Blocks** (`convertBlockToPageContentItem`): text → markdown item at
`baseFontSize × MARKDOWN_TEXT_SIZE_SCALE` (1.6) — the stored `textSize` key's
multiplier is commented out at render (Open item); text backgrounds via
`resolveTextBackground` (`grey`/`primary`/`success`/`danger`; note `success`
renders `_SLIDE_BACKGROUND_COLOR` = `_NIGERIA_GREEN`, not the success token —
Open item). Image blocks await `getImgFromCacheOrFetch`: no `imgFile` →
`{spacer:true}`, fetch failure → a placeholder text item rendering the shared
localized `unavailableItemMarkdown()`. Figure blocks: absent `bundle` → spacer;
a `buildFigureInputs` throw → the same placeholder. Per-block degradation never
aborts the slide.

## Image cache, fonts, brand contracts

**Image cache** ([t2_images.ts](client/src/state/products/t2_images.ts), one
export `getImgFromCacheOrFetch`): a `TimCacheD("img_cache")` — in-memory LRU
(100) over IndexedDB — keyed by URL with `versionHash = url` and `"any_version"`
reads, so an entry never invalidates (Open item). 30s abort-timeout, 3 retries
with exponential delay (CORS errors not retried), module-level per-URL failure
backoff (capped 60s), in-flight promise dedupe. Exactly three consumers:
`convertSlideToPageInputs` (logos, split images, image blocks),
`get_overlay_image.ts`, and `StylePreview.tsx` — screen render and slide exports
share it; report exports fetch directly (`_report_export_maps.ts`).

**Fonts** — two disjoint paths. Screen text uses hand-written `@font-face` rules
in `client/src/app.css` (woff2). Export PDFs embed TTFs: the three PDF exporters
pass `{basePath: "/fonts", fontMap: fontMap.ttf}` from
`client/src/font-map.json` to panther `createPdfRenderContextWithFontsBrowser`,
which fetches and `addFont`s each file into jsPDF. `SLIDE_FONTS`
(`lib/types/_slide_fonts.ts`) registers the four deck families — International
Inter (400/800), Fira Sans (400/800), Merriweather (400/700), Poppins (400/700)
— and `getAllSlideFontVariants` expands a family to its 4–6 needed variants
(markdown bold = `max(base, 700)`, so an extra 700 pair when the family's bold
is 800).

**Brand contracts:** [lib/brand_presets.ts](lib/brand_presets.ts) holds the two
brand `ColorPreset`s (`gff` #09544F, `nigeria` #027D53) consumed by the theme
picker, `resolveColorThemeToPreset`, the deck-config schema, and the S2
`slide_deck_config` transform's legacy-hex repair.
[lib/key_colors.ts](lib/key_colors.ts) is installed into panther at boot
(`setKeyColors(_KEY_COLORS, undefined, { remapNearBlackOnDark: true })`,
`client/src/index.tsx` — the dark companion and the near-black remap are
PROTOCOL_APP_UI_CONVENTIONS' dark-mode rule) and carries the CF
traffic-light palette + qualitative scales (15 consumer files, including the
style builders and the CF editor).

## The export engine (client/src/exports)

8 files, ~580 LOC, no barrel (callers import files directly). Every heavy engine
is panther-side — `PageRenderer`, `createPdfRenderContextWithFontsBrowser`,
`pagesToPptxBrowser`, `markdownToPdfBrowser` / `markdownToWordBrowser` — the app
files are orchestrators: fetch detail → build PageInputs/maps → panther →
`saveAs`. Every entry returns an `APIResponse` envelope (never throws), takes a
`progress(pct)` callback, and yields to the UI between items.

| Artifact | Formats | Pipeline |
| --- | --- | --- |
| Slide deck | PDF (download), PDF-base64 (email), PPTX | fetch deck detail + per-slide `_SLIDE_CACHE` → `convertSlideToPageInputs` → PageRenderer into jsPDF (deck-family fonts only) or `pagesToPptxBrowser`; 1400×788 |
| Report | PDF, Word | fetch report detail → build figure/image maps keyed by the literal `figure:<id>` / `image:<id>` tokens → `markdownTo{Pdf,Word}Browser` (PDF 1000×1414 with page numbers) |
| Single figure | PNG, table CSV, data CSV, JSON definition | in the editor (`visualization_editor_inner.tsx`, outside `exports/`): transient bundle → `getFigureAsCanvas` at `FIGURE_EXPORT_WIDTH_PX` 1920; multi-replicant download disabled |

The email exit is the only non-download path: `ShareSlideDeck` →
`exportSlideDeckAsPdfBase64` → `sendSlideDeckEmail` (S12's SendGrid route) with
the PDF as attachment.

**`getTableExportAoa`**
([get_table_export_aoa.ts](client/src/exports/get_table_export_aoa.ts)) exports
the **displayed** text, not raw values: it rebuilds the renderer's per-cell
`textFormatter` from the hydrated style and replicates the renderer's guard
order, emitting caption/col-group/header/row-group/footnote rows. Header labels
come from panther's `resolveTableHeaders(data, style)` — the same
label-resolution prelude the renderer runs — so header `textFormatter`s (sample
sizes today) reach exports too. Reading the raw transformed labels instead
diverges silently: nothing typechecks red. One consumer: the editor's table CSV
(with BOM for Excel). It requires hydrated FigureInputs — the formatter is a
rebuilt closure.

**Degradation contracts differ by artifact.** Reports swap a failed or orphaned
media token in place for the localized placeholder (`_media_placeholder.ts`) and
finish the document. Slide decks degrade per-block upstream in
`convertSlideToPageInputs` — an unbuildable figure or image becomes a spacer or
placeholder — but a failed slide FETCH or convert **aborts the whole deck
export**.

**UI entry points:** `DownloadSlideDeck` + `ShareSlideDeck` (deck editor),
`DownloadReport` (report editor), and the figure editor's download modal. Deck
and report exports pass the raw product label to `pdf.save` / `saveAs`; the
figure editor does spaces→underscores (Open item).

## Open items

- Sample sizes, deliberately deferred out of v1 (each is app-side only — panther
  already supports all of them): row and group headers, per-cell display via
  `TableCellInfo.sampleN`, scorecard mode, and AI-tool exposure of
  `s.showNValues` (no `s` field is AI-editable today). If a per-cell formatter
  is ever added, `getTableExportAoa` hand-builds its cell infos and would need
  to source them from panther, the way it now sources header labels.
- Should M3's expected-volume model emit a negative predicted service volume at
  all? A negative predicted count is physically impossible, so arguably it
  should be floored in the R script (`wb-fastr-modules`, m003) rather than
  rendered. A domain call, not a render one — `"auto-zero"` makes the chart
  correct either way, which is why it is not blocking. If it is ever floored
  upstream, `m3-0x-01`/`m3-0x-03`'s entries in
  `ALLOW_NEGATIVE_SCALE_VALUES_METRICS` become belt-and-braces.
- The three slide-deck exporters triplicate the fetch/convert loop (~150
  duplicated lines; the two PDF variants differ only in their tail) — extract
  one shared iterator.
- Filename rules are inconsistent: deck/report exports pass the raw product
  label (a `/` or `:` in a label hits browser munging) while the figure editor
  does spaces→underscores, and nothing sanitizes. Pick one rule.
- Deck exporters' catch drops non-Error detail
  (`e instanceof Error ?
  e.message : ""`); the report exporters use `String(e)`.
- Slide `textSize` is dead at render: the `TEXT_SIZE_REL` multiplier is
  commented out in `convertBlockToPageContentItem` while the editor's per-block
  text-size control writes the key, the schema validates it, and `lib/consts.ts`
  claims the renderer maps it. Wire it back or delete the knob — as it stands a
  user picks a size and nothing moves.
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
- `resolveTextBackground("success")` renders `_SLIDE_BACKGROUND_COLOR` (=
  `_NIGERIA_GREEN`), not the success token — misleading name or wrong color;
  needs a ruling.
- Deck PDF loads only the deck family's font variants (the report PDF passes the
  whole `fontMap.ttf`), so a figure styled with another family hits "Font not
  found in map" with no friendly-cased error — union the per-page fonts or
  friendly-case it.
- The figure editor's multi-replicant download is disabled (`allReplicants`
  hard-coded false, `downloadMultiple` commented out) — revive or delete.
- The editor PNG's transparency option is honored only in the no-padding branch
  (its comment still claims `getFigureAsCanvas` fills white; current panther no
  longer does — verify end-to-end and fix the branch or the comment).
- `buildReportFigureMap` is `async` with zero awaits.

- **Deck-themed SERIES colors** (deferred half of the deck-colors work).
  Structural figure colors — grid lines, borders, data-label backgrounds,
  strokes — now resolve against the deck's `colorPreset` when a figure renders
  inside a deck (`structuralColor()` in
  [get_style_from_po/_0_common.ts](client/src/generate_visualization/get_style_from_po/_0_common.ts));
  outside a deck they stay `{ key }` against the global palette, so report
  figures, Explore, editor previews and report exports are unchanged. Series
  colors were
  deliberately left out: the next step is a `"deck-primary"` color scale that
  returns `deckStyle.colorPreset.primary`. Note the semantic colors in
  `_2_coverage`/`_3_percent_change`/`_4_disruptions` (good/bad/neutral,
  survey/projected) are intentionally NOT theme-routed — they carry meaning.

### The one deferred slice: the PresentationObject → Figure rename

Everything else the FigureBundle work planned has landed — provenance, the pair
capture, the stale badge and its per-figure update action are documented above
and in [S11](SYSTEM_11_viz_authoring.md), [S9](SYSTEM_09_viz_query_cache.md),
[S12](SYSTEM_12_documents_sharing.md) and [S2](SYSTEM_02_persistence.md).

What remains is vocabulary: `PresentationObjectConfig`,
`ItemsHolderPresentationObject`, `getRunPresentationObjectItems`,
`normalize_po_config.ts`, `get_fetch_config_from_po.ts`, the `po_items` cache
name and the dozens of files using those names would become _figure_
end-to-end. No behavior change, a large mechanical sweep, and therefore its own
focused pass — never bundled with feature work. Two things make it cheap
whenever it happens: nothing is keyed on the string "presentation object" at
runtime, and the cache names that WOULD change (`po_items`, `metric_info`) are
version inputs, so renaming them is a deliberate one-time client-cache miss
rather than a correctness risk.
