---
system: 11
name: Visualization Authoring UI
globs:
  - client/src/components/explore/**
  - client/src/components/_shared/figure_editor/**
  - client/src/components/_shared/figure_preview.ts
  - client/src/components/products/_shared/insert_figure/**
  - client/src/state/instance/_util_disaggregation_label.ts
  - lib/convert_visualization_type.ts
  - lib/derive_default_visualizations.ts
  - lib/disaggregation_labels.ts
  - lib/explore_grid_query.ts
  - lib/format_nigeria_admin_label.ts
  - lib/get_disaggregator_display_prop.ts
  - lib/group_metrics.ts
  - lib/legacy_cf_presets.ts
  - lib/normalize_po_config.ts
  - lib/types/_metric_installed.ts
  - lib/types/_presentation_object_config.ts
  - lib/types/conditional_formatting.ts
  - lib/types/conditional_formatting_standalone.ts
  - lib/types/dimension_definitions.ts
  - lib/types/disaggregation_options.ts
  - lib/types/presentation_object_defaults.ts
  - lib/types/presentation_objects.ts
  - server/tests/explore_grid_query_test.ts
docs_absorbed:
---

# S11: Visualization Authoring UI

The embedded figure editor, the insert-figure wizard, and the figure-config
semantics in `lib/`. A visualization is a figure inside a product
(PLAN_PRODUCTS_RESTRUCTURE D3): there is no visualization product, no library
and no standalone editor since step 9a.

## Scope

The `globs:` frontmatter above is the lint-enforced manifest
(`lint_systems.ts`); sub-file custody exceptions are in SYSTEMS.md §4.1.
`components/_shared/figure_editor/**`: the editor (`visualization_editor.tsx` = `VisualizationEditor`,
the wrapper the slide and report editors open; `figure_editor.tsx`
+ the three panel tabs and their sub-panels; `replicate_by_options.tsx`;
`conditional_formatting_editor.tsx` + `conditional_formatting_store.ts`) and
`stale_figure_badge.tsx` (the per-figure stale badge, its "Update to
<package>" action and the "Update all figures" header button of
PLAN_PRODUCTS_RESTRUCTURE D4, the contract being S10's "The captured pair and
staleness"). `components/products/_shared/insert_figure/**` (the insert-figure wizard
and the preset gallery it renders, below). `components/explore/**` (the
instance Explore tab's page, S14 mounts it: "The Explore page" below). The
figure modals in `_shared/figure_editor/` (download, results-file viewer,
custom series styles). `products/slide_deck/editor_snapshot.ts`
(`snapshotForSlideEditor`, the one thing the slide editor freezes at open) and
`products/slide_deck/slide_editor/conflict_resolution_modal.tsx` are S12's
now, under its slide deck glob. Lib config semantics
(`normalize_po_config.ts`, `convert_visualization_type.ts`, the PO config type
families, the conditional-formatting family). `withReplicant` lives in
kernel-owned `lib/utils.ts` (S00).

## Contract

The editor has one mode: a figure `{ metricId, config }` edited under the
host's live `PackageScope`. It never persists: Apply closes with a
**normalized** config (`getConfigForSave()`) and the caller owns storage, or,
when the host passes a live `collabBinding`, edits stream into the host doc
and the editor closes with the same normalized config for a final coherent
rebuild. Reactivity is deep-tracked at both sites, the refetch effect
(`trackStore(tempConfig.d)`) and the figureInputs memo (`trackStore` over
`tempConfig.s` and `.t`), so new config fields need no wiring at either.
Neither carries a hand-enumerated dependency list; do not add one.

## The embedded figure editor

[_shared/figure_editor/visualization_editor.tsx](client/src/components/_shared/figure_editor/visualization_editor.tsx)
takes `{ label, scope, metric, configSnapshot, authoringContext,
collabBinding? }`, resolves the metric's queryable shape
(`resultsValueInfo`, S9's scope-keyed `t2_figure_data.ts`) under the pair,
and mounts `VisualizationEditorInner`. Three hosts open it: `slide_editor/slide_editor.tsx`
(edits `figureBlock.bundle.config`, then re-queries items and rebuilds the
bundle), `report/report.tsx` (rebuilds the figure block), and the package
page's module pane (`ModuleVisualizations` in
`results_packages/package_view/visualizations.tsx`, S8), which opens it
`viewOnly`: no collab binding, Back is the only way
out, and the draft never leaves the editor. The product hosts pass
the scope LIVE from the T1 products row, so a reattach or rescope mid-edit
re-previews under the new package (S10 "The captured pair"); the package
page's scope cannot change while the editor covers it.

**Snapshot isolation.** The draft is `createStore(structuredClone(p.configSnapshot))`,
so editor writes never reach the host's store.
[editor_snapshot.ts](client/src/components/products/slide_deck/editor_snapshot.ts) holds only
the slide editor's `snapshotForSlideEditor` (the deck config at open): the
pair is deliberately NOT snapshotted (D16).

## Draft state & the refetch contract

- **`tempConfig`** is a Solid store cloned from the snapshot. The panel writes
  through **`manuallyUpdateTempConfig`** (= `setTempConfig`; the copilot is
  told about figure edits by the HOST, whose own "edited locally" interaction
  fires when it applies the coherent bundle). Raw `setTempConfig` is also the
  replicant auto-resolution commit-back, wrapped in the
  `isAutoResolvingReplicant` flag so `needsSave` doesn't treat it as a user
  edit.
- **`needsSave`**: a `trackStore(tempConfig)` effect (deep-tracks the whole
  store), skipping first run and auto-resolution; it gates the Apply button
  and nothing else.
- **The refetch effect**
  ([figure_editor.tsx](client/src/components/_shared/figure_editor/figure_editor.tsx))
  re-queries items when `tempConfig.d` changes, via
  `trackStore(tempConfig.d)` plus a tracked read of the host's pair, so a
  reattach or rescope mid-edit re-previews under the new package. Superseded
  fetches are dropped via a monotonic `itemsFetchRunId`.
- **The figureInputs memo** deep-tracks ALL of `tempConfig.s` and `.t` via
  `trackStore(tempConfig.s)` / `trackStore(tempConfig.t)` (subscribes to every
  nested property, including in-place-reconciled collaborator edits). Net
  contract:
  `d.*` changes refetch; `s.*`/`t.*` changes re-render locally only.
- The items generator auto-resolves an unset/invalid replicant to the first
  valid option (`resolveDefaultReplicant`) on a **fresh config copy** (it never
  mutates the passed unwrapped store) and the editor commits the resolved value
  back into the draft, guarded on inequality. This is also the D4 auto-default:
  a replicant stored under a previous package that the current one lacks is
  replaced, never thrown on.
- Preview guards before render: duplicate display-slot check
  (`hasDuplicateDisaggregatorDisplayOptions` on the effective config), "You must
  select a replicant" fallback, and `too_many_items` (20,000-point message) /
  `no_data_available` statuses.

## Live co-editing

When the host passes a `collabBinding` whose `isLive()` is true, the editor
adopts the figure's config Y.Map from the host doc, reconciles remote changes
into `tempConfig`, streams local edits back (transacted with the binding's
`localOrigin`, so a per-user `Y.UndoManager` tracks them and the remote
observer skips them), and binds the caption editors to the map's `Y.Text`s.
The "Live" badge, the undo/redo buttons and the "Not saving" pill read
`isCollabLive()` (binding ready AND the socket open, `collabSocketOpen()`) and
`docSaveFailing` for the HOST doc. Live cursors and the "who is on which
tab" avatars ride the host session's awareness under a `fig:<figureId>` scope
(`_shared/figure_editor/viz_editor_cursors.tsx`; the `vizTab` field is cleared on unmount
because the host's awareness outlives the editor). Without a live binding
the editor is Apply/Cancel with no target; contract in
[SYSTEM_16_collaboration.md](SYSTEM_16_collaboration.md).

## Downloads

One `download()` action (blocked while items aren't ready): PNG rendered at the
canonical frame supersampled to `FIGURE_EXPORT_WIDTH_PX` 1920 (not the
on-screen reflow canvas); formatted table CSV via S10's `getTableExportAoa`
with BOM; underlying-data CSV (re-queries items); a JSON definition (the draft
config plus the pair it resolves under; a figure has no id of its own); a
results-file viewer. Multi-replicant export is parked: the download modal
hard-codes `allReplicants: false` and the editor has no branch for it (Open
item).

## The insert-figure wizard

`InsertFigureModal` (`components/products/_shared/insert_figure/insert_figure.tsx`) takes `{
scope: PackageScope, context: Pick<RunAuthoringContext, "metrics" |
"modules">, preselectedMetricId }`: the metrics and modules come from the
package's authoring context (S9's `t2_run_authoring_context.ts`) and the pair
is used only by the preset previews. It is a 3-step stepper: **Metric** (module
sidebar + `MetricCard` grid; the sidebar opens on "Primary results", the
primary modules' metrics of every family in the package, then "All modules",
then the modules under a family heading in module order, since
`groupMetricsByModule` sorts with `compareModules`; a card is selectable only
when single-variant and
`status === "ready"`; multi-variant metrics render per-variant chips) →
**Presets** (`PresetSelector`: one live-rendered `PresetPreview` per
`metric.vizPresets` entry + an always-appended `CUSTOM_OPTION` card; selecting
a real preset skips step 3) → **Configure** (five `TypeCard`s gated by
`get_PRESENTATION_SELECT_OPTIONS`: timeseries needs a period column, map needs
an admin-level disaggregation; table/chart/pie are always offered; required
disaggregations are checked+disabled; `FILTER_ONLY_DISAGGREGATION_OPTIONS`
excluded). The wizard derives every preset's config ONCE through
`deriveConfigFromVizPreset` (the one preset-to-config derivation, resolving
the `t` TranslatableStrings at insertion time; stored figure text fields are
plain strings), after cloning the preset to plain data because the context may
be a Solid store; the previews render that list and the inserted figure is
picked from it by id, so preview and figure cannot drift. A preview renders
through the one shared helper, `components/_shared/figure_preview.ts`
(`fetchFigureInputs`, and `createFigurePreview`, the tracked signal over it):
it reads its rows through the scope-keyed `state/products/t2_figure_data.ts`
(S9) and assembles them with `makeFigureBundleFromFetchedData(scope, ...)` +
`buildFigureInputs`, so reopening a preset under the same `(runId,
scopeToken)` is a cache hit and a preset is never a row (D6). The package
page's default-visualization cards (S8) render through the same helper, so a
default seen there and later inserted under the same pair is one cache
entry. Custom configs
go through `getStartingConfigForPresentationObject` (type defaults from
`VIZ_TYPE_CONFIG`, display slots assigned via
`getNextAvailableDisaggregationDisplayOption`). **The wizard never persists**.
It closes with `InsertFigureResult = { metric, config }` (a figure IS `{
metricId, config }`, D3) and its two callers, the slide and report editors,
build a figure block directly from their live pair and context; the Explore
page is read-only and does not call it.

## The Explore page

`components/explore/explore.tsx` renders one package at one scope for an
approved user: a compact `HeadingBar` whose tabs are the families the
package has any module for, in `MODULE_FAMILY_ORDER`, with a package
`Select` over `instanceState.readyPackages` (opening on the pin, else the
newest ready package) and an area `Select` over `listAdminArea2s` whose
first option is National. The package and area are page signals, never
stored, so a deleted package can never be a stored default; the family
(`exploreFamily`) and the chosen module per family (`exploreModules`)
persist in `t4_ui` (S14) and are resolved against the package on every read,
so a stored choice the package lacks falls back to the first offered. The
authoring context is read through `t2_run_authoring_context`. The page
writes nothing: no insert into a product, no persisted draft, no copilot, no
help buttons.

Under a family tab, `FrameLeft` holds the module nav (`module_nav.tsx`) and
the chosen module's view (`module_view.tsx`). The nav is the family's
modules in module order (`compareModules`), a `SelectList` per tier (Primary
results, Supporting analyses). A view is one named reading of a module, a
metric bound to a presentation, and `viewsFor` in `module_view.tsx` is the
one place that says which views a module offers: "Indicator values as
counts" (the data table, columns Indicators) and "Indicator values over
time" (the timeseries) for the HMIS primary module's first ready metric
(`primaryMetricFor`), and nothing for any other module. A `Select` over the
module's view names, the pane's main control at the default size, is always
shown; the view places it on its top row, with the query controls beneath. A module with no view shows a placeholder listing its metrics,
and a module with no ready metric shows the stamped reason. When module
definitions declare views, `viewsFor` reads them and nothing else on the
page changes. The views share the family's `GridQuery` and the controls
over it (`explore/_shared/query_controls.tsx`: indicators, period, grain,
the dropped-indicators notice and the `queryEditors` pair that keeps
dropped indicators through a package switch).

**Data table** (`explore/data_table/`) reads its metric as a grid whose rows
are the unit (admin areas at one level, or an ICEH stratifier's levels) and
whose columns are indicators or time, the view's choice. Its controls' state
is a `GridQuery` per family
("Grid query model" below), owned by the page so a package, scope or module
change never resets it; until the user edits a family's query it is
`defaultGridQuery` for the current scope. Every read resolves the query
first (`resolveGridQuery`); indicators the package lacks stay in state and a
one-line notice above the grid offers Clear. The toolbar's top row holds
the view `Select` with a find box and Download on the right; the row
beneath holds level or stratifier, indicators (`MultiSelectSearch`, empty
means all), period (`periodChoicesFor`) and grain (HMIS Time mode only). The reads are tracked (`createTrackedQuery`,
`data_table/tracked_query.ts`), so they re-run on any change of the pair or
the query: the metric info (`t2_figure_data`, for the package's HFA time
points, in the instance's declared order, ICEH's years and stratifiers, and
formats and rules) and the grid read (`t2_grid_items`, S9 "The grid read")
on the fetch config of `deriveGridConfig`'s config. A read carries the
config and columns mode it was issued for, and the grid is built from those,
so a newer query is never paired with older rows; a change that leaves the
fetch config and columns alone makes no new read. The decoded rows go
through the canvas table's own pipeline, `buildFigureInputs` over a figure
bundle built in memory, so the effective config, roll-up pin and label,
label replacements (indicators, dates, Nigeria admin cleaning) and header
order are the canvas table's; then panther's `getTableDataTransformed` pivot
and `dataGridPropsFromTableData` with the cell function
(`data_table/cell_function.ts`): each value formatted by its indicator's
effective format (`resolveEffectiveIndicatorFacts`, `formatIndicatorValue`),
the raw number as the sort key, and HMIS cells coloured by the indicator's
own threshold rule; HFA and ICEH are uncoloured. `DataGrid` fills the height
with a hover line beneath, sorts by header click (transient, never stored),
and scrolls to the first column whose label contains the find text
(`focusColumnId`). Download saves the grid's text as CSV, in the pivot's row
order. Its empty states are typed: no preset, no data, and too many cells
(narrow the indicators or coarsen the grain). No preset, no modules and the
unavailable metric are the page's shared `explore/_shared/empty_state.tsx`;
no ready package is `explore.tsx`'s own.

**Timeseries** (`explore/timeseries.tsx`) reads the same metric as lines
over time, one pane per indicator: `deriveTimeseriesConfig` over the
resolved query (columns Time, so every window is readable) gives the
primary preset with `d` replaced by type `timeseries`, the query's grain as
`timeseriesGrouping`, the indicator dimension as `cell`, the chosen
indicators as a filter and the window as `periodFilter`, `s` set to lines
in three pane columns, since the preset's style is a table's, and `t`
cleared, since the view's name is the caption. The figure is
fetched and built through `createFigurePreview` (S11's one path for a figure
that is not a row, so it shares the scope-keyed items cache with products)
and rendered by panther's `FigureHolder` at its ideal height in a pane that
scrolls, with the default `sizing="reflow"`, which lays the figure out at
the container width so one design unit is one CSS pixel and lines are as
crisp as the UI. Its
controls are indicators, period and grain; the level control is the table's
alone, since the lines are the scope's total. HMIS only: HFA time points
and ICEH years are not period columns.

## lib config semantics

- **`normalizePOConfigForStorage`**: drops empty `filterBy` entries, collapses
  empty `valuesFilter`, canonicalizes the roll-up off-state to _both entry
  fields absent_ (`rollup`/`rollupPosition` kept only on the entry the
  `getEffectiveRollupDimension` gate selects). Deliberately apply-time-only: the
  editor does not eagerly clear the flag on transient gate closures.
- **`getEffectivePOConfig`**: filters ineffective disaggregators with four
  recorded reasons (`filtered_to_one_value`, `single_value`, `single_period`,
  `single_year`); the **replicant exemption** applies to `single_value` only
  (fetches are pinned to one replicant value, so items-derived counts would see
  every replicant as single-valued). Two `singleValueDims` derivations:
  post-fetch from items (slice semantics) and editor-side from possible-values
  (whole-table).
- **`convertVisualizationType`**: drops disallowed disaggregations, remaps
  display slots through `VIZ_TYPE_CONFIG[newType].disDisplayOptFallbacks`,
  re-adds required disaggregations, resets content/style to type defaults.
  `usedOpts` is seeded with the destination's `defaultValuesDisDisplayOpt`
  BEFORE remapping, so a type's default values slot must not be a target of its
  own fallbacks, or the fallback is dead on arrival and the dimension gets
  shunted by the collision escape. This is why pie's values default is `cell`,
  not `series` (its `mapArea` fallback points at `series`, so a converted map's
  region dimension lands on Slices). It is also not `indicator`, for a sharper
  reason: `getDisaggregatorDisplayProp` returns `"--v"` for any slot the VALUE
  props claim and never reaches the disaggregation loop, so a dimension sharing
  that slot resolves to no axis at all and its rows collapse into panther's
  `Duplicate values` throw. Defaulting the values onto a slot the user is
  likely to want (Pies, Bars) makes that collision the common case rather than
  a hand-made one. Note chart→pie therefore KEEPS an `indicator` dimension on
  Pies rather than remapping it to Slices: that is the meaning-preserving
  conversion, since five coverage indicators repeat a mark, they do not
  partition a whole.
- **The pie type**: slices are panther's series axis and `indicator` is
  panther's repeat dimension: N pies tiled INSIDE each sub-chart, costing no
  disaggregation axis (slots: `series` = Slices, `indicator` = Pies,
  `cell` = Grid, `row`/`col`, `replicant`). `s.sortIndicatorValues` is REUSED as
  pie's slice sort (`sortSeriesValues`), which is why pie's `styleResets`,
  unlike map's, do not reset it (resets apply on switching TO a type and would
  wipe the sort on every entry). Both the `series` and
  `indicator` axes route through the `getAxisSort` dispatcher, which gives
  `indicator_common_id` the dictionary order on whichever axis it occupies.
  Four optional `s` fields: `pieInnerRadiusRatio`
  (0/absent = pie, `0.55` = doughnut; read `?? 0`), `pieGroupSmallSlices`
  (global-share fraction; 0/absent = off; maps to panther `groupSmallSlices`
  with a localized "Other" slice, id `--other`, sorted last),
  `pieCompletionMode` and `pieShowCenterValue`. Roll-up is excluded
  (`isRollupCandidateDimension`), CF is not offered (slices color via the series
  sentinel, not the values sentinel), calendar time dims are never offered, and
  `time_point` is allowed (survey rounds take a display slot, one pie per round,
  never pooled, same exception as map).
- **Completion pies**: `isPieCompletionMode(config, effectiveFormatAs)` in
  `presentation_objects.ts` is THE gate: the data config's
  `total: PIE_COMPLETION_TOTAL` and the style's `centerLabel` must both consult
  it, or the hole reports a share against a denominator the geometry never used.
  The envelope is `1`, not `100`: percent values are 0-1 fractions app-wide. It
  is checked against the EFFECTIVE format, so a flag stranded by a format change
  degrades to a plain cell-sum pie rather than drawing every count as a sliver.
  The editor's "Show each value against 100%" checkbox is gated on that same
  effective format, not on the metric's stored `formatAs`. Gating on the
  stored value is what made the toggle unreachable for every HFA pie back when
  HFA metrics declared `"number"` (they now declare `"indicator"`; the
  effective format resolves per display, SYSTEM_10 § Effective format).
  Without it panther defaults to `total: "sum"` (each pie normalized by its own
  slices). The unfilled arc is panther's `remainder` track; slice data labels
  drop the series name when the slice axis carries the
  `NO_DISAGGREGATION_HEADER_ID` sentinel (every completion pie, since the
  indicator header beside the pie already names it).
- **PO config schema** (`_presentation_object_config.ts`): `d` = `configDStrict`
  (shared with the module-authoring repo), `s` = all-required flat style incl.
  the `cf*` fields, `t` = six plain-string/number fields. Reads are strict-throw
  (`parsePresentationObjectConfig`), no permissive fallback. Duplicate display
  slots are allowed in storage; the UI warns and blocks render.
- **Conditional formatting**: storage = 16 flat `cf*` fields
  (`conditional_formatting_standalone.ts`, vendored to wb-fastr-modules);
  semantics = the `ConditionalFormatting` union with `selectCf` (flat→union) /
  `flattenCf` (union→flat) bridges and display-time `deriveBucketLabels`. The
  editor works purely on the union; `applyCfToTempConfig` fans the flat fields
  into batched store writes. `legacy_cf_presets.ts` maps the 9 legacy preset
  ids, consumed by the S2 po_config transform (Blocks 5/6) and as the
  thresholds editor's preset dropdown.
- **Replicant helpers**: `getReplicateByProp` is the filter-aware single source
  of truth for "active replicant" (safe on raw config);
  `getDisaggregatorDisplayProp` / `hasDuplicateDisaggregatorDisplayOptions` are
  deliberately NOT filter-aware (they receive effective configs).

### Grid query model

`lib/explore_grid_query.ts` holds the Explore Data table's controls' state
as a `GridQuery` (family, unit, indicators, period, grain) and the pure
steps over it; the columns mode (Indicators or Time) is the view's and is
passed beside the query to `resolveGridQuery` and `deriveGridConfig`.
`deriveTimeseriesConfig` derives the timeseries view's config from the same
query ("Timeseries" above). `primaryMetricFor` is the family's primary module's first
ready metric by id, the one metric the page offers a data table for.
`defaultGridQuery` opens at the scope's level plus one
(national: admin area 2; an admin area 2 scope: 3), every indicator, HMIS on
the last 12 months, HFA on its latest time point and ICEH on its first
stratifier and latest year. `resolveGridQuery` maps the
query onto what the current package and scope can answer on every read and
never rewrites the caller's state: an unoffered family becomes the first
offered, a level becomes one the metric's `disaggregationOptions` carry and
deeper than the scope (`levelOptionsFor`), a stratifier becomes an available
one, indicators are intersected with the family's dictionary (the dropped ids
are returned for the page's notice), and time values are intersected with
the available ones. Time is never a column group: HFA survey rounds and ICEH
years are never pooled, so HFA and ICEH in Indicators mode resolve to exactly
one time point or year (the latest chosen, else the latest available), and
`deriveGridConfig` returns undefined for such a query without one.
`deriveGridConfig` takes the primary metric's first preset through
`deriveConfigFromVizPreset` and replaces `d` whole with a table: the unit as
`row` (admin levels carry `rollup: true`, position top; ICEH's `level` has
no roll-up), then the indicator dimension as `col` in Indicators mode, or
the time dimension as `col` and the indicator dimension as `colGroup` in
Time mode; filters for the ICEH stratifier, chosen indicators and HFA or
ICEH time values; HMIS windows as `periodFilter`. `periodChoicesFor` lists
the period control's choices, offering HFA and ICEH "All" only in Time mode.
Tested in `server/tests/explore_grid_query_test.ts`.

## Replicant machinery

`replicate_by_options.tsx` exports a sidebar `SelectList` variant
(`ReplicateByOptionsList`, the editor's) and a `Select` dropdown variant
(`ReplicateByOptionsSelect`, exported through the editor folder's entry;
no consumer). Both fetch replicant options through the S9
scope-keyed cache (`getReplicantOptionsFromCacheOrFetch`) with
`excludeReplicantFilter: true` and deep-tracked `filterBy`/`periodFilter`
reads; statuses `too_many_values` (>500) / `no_values_available` / `error` are
surfaced inline. Labels get Nigeria-admin cleaning
(`formatReplicantLabelForDisplay`), re-sorted only when cleaning changed
something.

## Open items

- **Custom value orders are never pruned: ruling pending.**
  `normalizePOConfigForStorage` canonicalizes roll-up flags at apply but does not
  touch `s.customValueOrder`, so entries survive for dimensions that were
  removed from the display and ids the data no longer returns. Current behavior
  is deliberate-latent: the style section always lists such an order with its
  reason and a clear button, and an unranked id is simply not ranked, so nothing
  renders wrong. The open question is prune-on-apply versus keep-latent, and it
  turns on whether re-adding a dimension later should silently recover its old
  order (keep) or start clean (prune).
- **Dead code (zero importers/consumers):**
  `lib/types/dimension_definitions.ts` (barrel-exported, zero uses); the
  download modal's `allReplicants` result field (hard-coded false).
- **Stale white-fill comment**: the download path claims `getFigureAsCanvas`
  fills white pending a panther flag. Panther does not fill; verify
  transparent PNG end-to-end and update or delete.
- **i18n gaps**: `window.alert` in `custom_series_styles.tsx`.
- Commented-out remnants: disaggregation chips (`metric_card.tsx`).
