# PLAN: Explore data table

Give the Explore tab its purpose: the package's data portal. An approved user
picks a data family, sees every indicator for every area at one admin level,
narrows by indicator and period, flips the columns between indicators and
time, sorts by clicking a header, and downloads what is on screen. The page
is a tab rail with two tabs: **Data table**, built by this plan on panther's
`DataGrid`, and **Visualization**, the existing inline figure editor moved
under its tab. The table's state is a small typed query from which one pure
function derives an ordinary figure config. That config feeds a new grid read
with no 20,000-item cap, and the rows go through the canvas table's own pivot
and a panther adapter into `DataGrid`, so the DOM table and a canvas table of
the same query share every step but the last.

**Next step: Fix 4.** Each session sets this line in its final commit.

Branch: `version2`. Repos touched: this app and
`/Users/timroberton/projects/panther/timroberton-panther` (step 3 only).
Read first: `CLAUDE.md`, `SYSTEMS.md`, then §2 and §3 here.

---

## 0. How to work this plan

Cadence, session shapes, the two-things rule and the step rules are
`panther/protocols/PROTOCOL_ALL_PLANS.md`; the app bindings are
`PROTOCOL_APP_PLANS.md`. This plan binds them as follows.

- Instruction: "Do the next step of PLAN_EXPLORE_DATA_TABLE.md."
- Branch: `version2` (this plan's ruling; `PROTOCOL_APP_PLANS.md` names
  `tim-branch`, and the version 2 work is on `version2`).
- Floor: `deno task typecheck`, `deno task test`, `./validate_protocols`,
  `./run`. Step 2 touches `server/run_query/`, so it also passes
  `./validate_queries`. No step touches a migration, the seed or help text.
- Build log: §8. Last step: 4.
- A step reads, in order: `CLAUDE.md`, `SYSTEMS.md`, the SYSTEM file for
  each area the step names, §2 and §3 here, the step's own section in §4,
  and §8.

Rules peculiar to this plan:

- **`panther/` is never edited here.** Step 3 builds its change in the
  panther repo, confirms `deno task typecheck` there, and lands the sync as
  one app commit holding only synced files (CLAUDE.md "Boundaries"). The
  panther repo's own commit is listed in the build log like an app commit.
- **The scorecard product is not this plan.** §6 names it. Nothing here adds
  a product type, a table, a route under `products/`, or a handoff from
  Explore into a product. The grid query type is designed so that plan can
  store it unchanged; that is the whole of this plan's obligation to it.
- **Verified facts, not descriptions.** Every count in §1 that the author
  did not read from the code (the 500-indicator dictionaries) is marked as
  Tim's. A step that finds a §1 fact wrong records it in §8 and builds to
  the code.

## 1. The problem

- The Explore page mounts the figure editor inline over one preset
  ([explore.tsx:28-34](client/src/components/explore/explore.tsx#L28-L34)).
  It offers no metric or indicator choice: `familiesInPackage` picks the
  primary module's first ready metric
  ([explore_query.ts:24-39](client/src/components/explore/explore_query.ts#L24-L39))
  and the editor's Metric field is a read-only label
  ([summary.tsx:19-29](client/src/components/_shared/figure_editor/editor_panel_data/summary.tsx#L19-L29)).
  The Style and Text panels are shown
  ([figure_editor.tsx:361](client/src/components/_shared/figure_editor/figure_editor.tsx#L361))
  though nothing on this page is kept.
- Its table is a picture. The canvas table shrinks to fit the preview box and
  reports only that it is cramped
  ([figure_holder.tsx:40-42](panther/_303_components/charts/figure_holder.tsx#L40-L42));
  it cannot be sorted, hovered or copied, and a matrix of hundreds of areas
  does not fit a slide-sized frame at any scale.
- The page has had three purposes in three weeks: a catalog with an add-to-
  product action (PLAN_PRODUCTS_RESTRUCTURE D6), a lookup grid
  (PLAN_EXPLORE_PRIMARY_RESULTS ruling 5a, built at `dc940b05`, refined at
  `57af81b2`), and a sandbox (`d7e08b7b`, which deleted the grid because it
  "could not be pivoted"). The grid was right and its controls were missing.
- Facts that shape the fix:
  - The figure items read stops at `MAX_ITEMS` = 20,000
    ([consts.ts:3](server/server_only_funcs_presentation_objects/consts.ts#L3))
    and answers `too_many_items`
    ([presentation_object_items_core.ts:130-138](server/server_only_funcs_presentation_objects/presentation_object_items_core.ts#L130-L138)).
    Rows are tens to hundreds of areas and columns tens to hundreds of
    indicators (an HMIS dictionary reaches 500 in some instances: Tim), and
    the read sees their product: every level-3 area by fifty indicators is
    already 38,700 cells. The existing read cannot serve ordinary views.
  - `DataGrid` renders every cell as DOM
    ([data_grid.tsx:183-221](panther/_303_components/tables/data_grid/data_grid.tsx#L183-L221)).
    Hundreds by hundreds paints fine; the one corner that does not, every
    level-3 area of the largest instance by every indicator, is deferred
    (§6, virtualization).
  - The canvas table already pivots long-form rows into groups, columns,
    rows and a value matrix (`getTableDataTransformed`,
    [get_table_data.ts:27-35](panther/_010_table/get_table_data.ts#L27-L35)),
    and the app already maps a figure config to that pivot's config
    ([get_data_config_from_po.ts:336](client/src/generate_visualization/get_data_config_from_po.ts#L336)),
    roll-up pin and label replacements included. The deleted scorecard
    re-implemented this pivot by hand.
  - `DataGrid` takes formatted, coloured cells and flat headers
    ([types.ts](panther/_303_components/tables/data_grid/types.ts)); the
    pivot's output is raw values and nested headers. Nothing joins the two.
  - ICEH has no admin areas. Its results are indicator, year, source,
    stratifier and level
    ([m009/_results_objects.ts](../wb-fastr-modules/m009/_results_objects.ts)).
    HMIS carries admin_area_2 to 4
    ([m012/_results_objects.ts](../wb-fastr-modules/m012/_results_objects.ts)),
    as does HFA.
  - The roll-up whitelist is exactly admin_area_2, 3 and 4 with a national
    sentinel row ([rollup.ts:15-19](lib/rollup.ts#L15-L19)); the flag lives
    on the `disaggregateBy` entry
    ([_metric_installed.ts:167-181](lib/types/_metric_installed.ts#L167-L181))
    and exactly one flagged entry is honoured
    ([get_fetch_config_from_po.ts:407-427](lib/get_fetch_config_from_po.ts#L407-L427)).
  - A package's rates are aggregated at its population level
    ([run_manifest.ts:254-262](lib/types/run_manifest.ts#L254-L262)),
    carried on the authoring context as `population`.
  - Period columns are ordinary groupBys
    ([get_fetch_config_from_po.ts:41-44](lib/get_fetch_config_from_po.ts#L41-L44));
    a table of areas by year already ships as a preset
    (`m1-04-01`), and column groups are in the config (`colGroup`), in the
    pivot (`colGroups`) and in the grid (`columnGroups`).
  - The period choices per family and the tracked query were deleted at
    `d7e08b7b` and are readable at `57af81b2` under
    `client/src/components/explore/`.

## 2. The model

Vocabulary, used throughout:

- **Explore**: the instance tab. Two page tabs: **Data table** and
  **Visualization**.
- **Family**: `hmis`, `hfa`, `iceh`, in that order. The Data table's metric
  is the family's primary module's first ready metric by id (today
  `m12-01-01`, `m10-01-01`, `m9-01-01`).
- **Unit**: what a row is. HMIS and HFA: one admin area at the chosen
  **level** (2, 3 or 4). ICEH: one level of the chosen **stratifier**
  (wealth quintiles, residence, and so on).
- **Indicator dimension**: `indicator_common_id`, `hfa_indicator`,
  `iceh_indicator`.
- **Time dimension**: HMIS `period_id`, `quarter_id` or `year` by **grain**;
  HFA `time_point`; ICEH `year`.
- **Grid query**: the page's whole state for the table, a small typed value
  (below). Controls edit it; nothing else does.
- **Derived config**: the `PresentationObjectConfig` one pure function
  produces from a grid query and an authoring context. It is what the reads
  are keyed on and what a product would store if it ever kept the view.
- **Resolution**: the pure step that turns a grid query the user built under
  one package into the one that is valid under the current package.
- **Grid read**: a new run-keyed read returning a dictionary-encoded long
  form with no 20,000 cap.
- **Pivot**: panther's `getTableDataTransformed`, the canvas table's own
  long-form to matrix step, driven by the app's
  `getTableJsonDataConfigFromPresentationObjectConfig`.
- **Adapter**: a panther function from the pivot's output plus one cell
  function to `DataGrid` props.

The page:

```text
[Package ▾]  [National ▾]                     Data table | Visualization
──────────────────────────────────────────────────────────────────────────
[HMIS ▾] [Level: District ▾] [Indicators: all (512) ▾] [Last 12 months ▾]
[Columns: Indicators | Time] [Grain: Month ▾]   [Find column…]  [Download]
──────────────────────────────────────────────────────────────────────────
              ANC 1   ANC 4   Penta 3   …                  (sticky header)
 National     72.1    48.0    61.3      …                  (roll-up row)
 Abia         70.2    44.9    58.8      …
 Adamawa      …
──────────────────────────────────────────────────────────────────────────
 Abia · ANC 4: 44.9                                        (hover line)
```

The grid query:

```ts
export type GridColumns = "indicators" | "time";
export type GridGrain = "period_id" | "quarter_id" | "year";

export type GridUnit =
  | { kind: "admin"; level: AdminLevel }
  | { kind: "strat"; strat: string };

export type GridPeriod =
  | { kind: "window"; filter: PeriodFilter }
  | { kind: "values"; values: string[] };

export type GridQuery = {
  family: DatasetType;
  unit: GridUnit;
  indicators: string[];
  period: GridPeriod;
  columns: GridColumns;
  grain: GridGrain;
};
```

`indicators: []` means every indicator; `period: { kind: "values", values:
[] }` means every time point or year (for HMIS, every month: no window).
`grain` is read only when the family is HMIS and `columns` is `"time"`.
Time is never a column group (ruling 19), so HFA and ICEH in Indicators mode
read exactly one time point or year, which resolution supplies.

The derived config starts from the primary metric's first preset through
`deriveConfigFromVizPreset` (so `s` and `t` are valid and carry the family's
decimals and formatting) and replaces `d` whole, with `type: "table"` and
`valuesDisDisplayOpt: "col"` (ICEH's first preset is a chart):

| Family, columns | `disaggregateBy` (in order) | `filterBy` | `periodFilter` |
| --- | --- | --- | --- |
| HMIS, indicators | unit level `row` with `rollup: true`, position top; indicator dim `col` | indicators when chosen | HMIS window |
| HFA, indicators | as HMIS | indicators when chosen; `time_point` = the one resolved time point | none |
| HMIS or HFA, time | unit level `row` with `rollup: true`, position top; time dim `col`; indicator dim `colGroup` | indicators when chosen; HFA time points when chosen | HMIS window |
| ICEH, indicators | `level` `row`; `iceh_indicator` `col` | `strat` = the chosen stratifier; indicators; `year` = the one resolved year | none |
| ICEH, time | `level` `row`; `year` `col`; `iceh_indicator` `colGroup` | `strat`; indicators; years when chosen | none |

Resolution, applied on every read against the current package and scope:

| Control | Rule |
| --- | --- |
| family | not offered by the package: the first offered |
| unit (admin) | level must be one the metric's `disaggregationOptions` carries and deeper than the scope's level (national: 2 or deeper; an admin area 2 scope: 3 or deeper). Otherwise the shallowest valid level. Default on first mount: the scope's level plus one. |
| unit (strat) | not in the metric's possible values: the first value |
| indicators | intersected with the package's dictionary for the family; the dropped ids stay in state |
| period (values) | intersected with the available time points or years; empty means all |
| period (HFA or ICEH, Indicators mode) | exactly one value: the latest of the chosen values that is available, else the latest available; the chosen set stays in state |
| period (window) | unchanged; relative windows are always valid |

The reads: the derived config goes through `getFetchConfigFromPO` as any
figure does, then to the **grid read** instead of the items read. The grid
read shares the SQL path and the concurrency queue, but its cap is
`GRID_MAX_CELLS` (500,000, ruling 6) and its payload is dictionary-encoded:

```ts
type GridItemsHolder = {
  resultsObjectId: string;
  fetchConfig: GenericLongFormFetchConfig;
  runId: string;
  scopeToken: string;
  dateRange: PeriodBounds | undefined;
} & (
  | {
    status: "ok";
    // One entry per groupBy in fetchConfig.groupBys order; each holds that
    // column's distinct values, and rows index into them.
    levels: string[][];
    rows: number[][];
    // Every returned column that is not a groupBy, in first-row key order
    // (the metric's value column, and any __n_* column the server emits).
    // The fetch config's `values` are ingredients, not these.
    valueProps: string[];
    // values[row][valueProp index]
    values: (number | null)[][];
    indicatorMetadata: IndicatorMetadataDisplay[];
  }
  | { status: "too_many_cells" }
  | { status: "no_data_available" }
);
```

`decodeGridItems(holder)` in lib turns an `ok` holder back into the plain
long-form array the canvas path consumes (`JsonArrayItem[]`, one key per
groupBy plus each value prop). The holder's `indicatorMetadata` feeds the
pivot's indicator labels and order as the items read's does. Encoding and decoding are one file,
tested as a round trip.

Rendering, in this order, none of it new except the adapter and the cell
function:

1. `getTableJsonDataConfigFromPresentationObjectConfig` from the derived
   config, called as `build_figure_inputs.ts` calls it, so the roll-up pin,
   the label replacements and the header sort are the canvas table's.
2. `getTableDataTransformed` over the decoded rows: column groups, columns,
   rows and the value matrix.
3. The panther adapter, with the app's cell function: the effective
   indicator format for the text, the raw number for the sort key, and for
   HMIS the indicator's threshold rule for the background.
4. `DataGrid`, with `fitToAvailableHeight`, a hover line beneath, and
   `focusColumnId` driven by the find box. Sort is the grid's header click.
   Download writes the visible grid as CSV.

## 3. Rulings

1. **Purpose.** Explore is where an approved user reads the numbers in a
   package. Products are where a picture is kept. The Data table is the
   page's first tab and opens by default.
2. **Two tabs, persisted.** A `TabsNavigation` rail with **Data table** and
   **Visualization**. The active tab persists in `t4_ui` beside
   `exploreFamily`. The Visualization tab holds the existing inline editor
   mount, moved under `components/explore/visualization/`, unchanged in
   behaviour. Ruled (Tim, 2026-09-23).
3. **One fixed shape per family.** Rows are the unit; columns are indicators
   or time. No other disaggregation is offered. ICEH rows are the levels of
   one stratifier because ICEH has no admin areas (§1); the level select is a
   stratifier select for that family.
4. **The controls are exactly:** family, level or stratifier, indicators
   (`MultiSelectSearch`, empty = all), period (HMIS: last 12 months, last
   quarter, last year, all; HFA: time points; ICEH: years; for HFA and ICEH
   one value in Indicators mode, any set in Time mode), columns
   (`ButtonGroup`: Indicators | Time), grain (HMIS Time mode only: month,
   quarter, year), find, download. The package and area selects stay on the
   heading row as today.
5. **Everything by default.** The indicator filter opens empty, which means
   all. No control caps the selection.
6. **The grid read is the only cap.** A new run-keyed read
   (`getRunGridItems`) with `GRID_MAX_CELLS` = 500,000 and the payload in
   §2. Over the cap it answers `too_many_cells` and the page says to narrow
   the indicators or coarsen the grain. `MAX_ITEMS` and the items read are
   untouched. Ruled (Tim, 2026-09-23); the alternative, a per-call limit on
   the items read, was rejected because the limit would have to enter the
   cache key and the long-form payload is several times larger.
7. **Roll-up always on.** The unit level entry carries `rollup: true`,
   position top. Under a national scope the row is National; under an admin
   area 2 scope it is that area's all-areas row, by the existing label
   context. ICEH has no roll-up.
8. **Level follows scope.** Rules in §2. A level the package cannot answer
   is never offered: the options come from the metric's
   `disaggregationOptions`, so a package aggregated at level 2 offers level
   2 only.
9. **Controls hold intent; every read resolves it.** Nothing resets on a
   package or scope change. Resolution is one pure function in `lib`
   returning the resolved query and what was dropped. The page shows a
   one-line notice when indicators were dropped, with a Clear action that
   removes them from state.
10. **Columns mode swaps one `disaggregateBy` list for another.** Time mode
    with several indicators is column groups. Time mode with one indicator
    is areas by periods with no groups.
11. **Sort is a header click, transient.** Never stored, never in the query.
12. **Colouring.** HMIS cells by the indicator's own threshold rule through
    `resolveEffectiveIndicatorFacts` and `thresholdBucketIndex`. HFA and
    ICEH are uncoloured in this plan.
13. **The state is the grid query, not a config.** The config is derived,
    never held. A later scorecard product stores `GridQuery` and reuses the
    derivation, the resolution and the grid read unchanged.
14. **One pivot, two renderers.** The DOM table is the canvas table's
    pipeline up to `TableDataTransformed`, then a panther adapter into
    `DataGrid` props. The adapter takes the transformed data and one cell
    function `(value, rowId, colId) => DataGridCell | undefined`; it maps
    column groups to `columnGroups`, columns to their group id, and rows
    flattened across row groups (a row group label, if any, prefixes the
    row label; the grid has no row groups). `DataGrid`'s own props stay the
    low-level contract and it computes nothing new. It gains one prop,
    `focusColumnId`, which scrolls the column into view and marks its
    header. No filter, no find box, no formatting, no virtualization.
15. **The page writes nothing.** No insert into a product, no persisted
    draft, no copilot view, no help buttons, no tour.
16. **Download is the visible grid as CSV**, built client-side from the
    adapter's output and saved with panther's `downloadCsv`. The editor's
    download modal is not used by the Data table.
17. **Tracked reads.** The page's reads re-run on every change of the pair,
    the query or the resolution inputs, through the `createTrackedQuery`
    recovered from `57af81b2`, not panther's mount-once `createQuery`.
18. **Labels.** What the canvas path produces: the pivot's label
    replacements for indicators, dates and the roll-up row, and
    `instanceState.adminAreaLabels` where the canvas path reads them.
    Nigeria admin cleaning applies as it does in the editor.
19. **Time is never a column group.** HFA and ICEH declare their time
    dimension required and their values must never be pooled across rounds
    or years, so Indicators mode reads one time point or year (resolution
    in §2). Ruled (Tim, 2026-09-23).

## 4. Steps

### Step 1: the grid query model in lib

**Surface.**

- `lib/explore_grid_query.ts` (new)
- `lib/mod.ts` (export)
- `server/tests/explore_grid_query_test.ts` (new)
- `SYSTEM_11_viz_authoring.md` (globs: the two new files; prose: a new
  "Grid query model" section under "lib config semantics")

**Deliverable.**

- The types of §2 (`GridQuery`, `GridUnit`, `GridPeriod`, `GridColumns`,
  `GridGrain`) and these pure functions:
  - `INDICATOR_DIMENSION` and `UNIT_DIMENSION` per family
    (`UNIT_DIMENSION.iceh` is `"level"`).
  - `primaryMetricFor(family, ctx)`: the primary module's first ready metric
    by id, else undefined.
  - `defaultGridQuery(family, scope, ctx)`: ruling 8's default level, empty
    indicators, the family's default period (HMIS last 12 months, HFA the
    latest time point, ICEH the latest year), columns `"indicators"`, grain `"period_id"`,
    ICEH's first stratifier.
  - `resolveGridQuery(query, scope, ctx, available)`: the table in §2, where
    `available` is `{ hfaTimePoints: string[]; icehYears: string[];
    icehStrats: string[] }`. Returns `{ query, droppedIndicators: string[] }`.
  - `deriveGridConfig(query, ctx)`: the table in §2, from the primary
    metric's first preset with `d` replaced; returns `{ metric, config }` or
    undefined when the family has no ready metric or no preset.
  - `periodChoicesFor(family, available)`: recovered from `57af81b2` and
    retyped to produce `GridPeriod` values.
- A test file covering, per family: the default query under a national and
  an admin area 2 scope; resolution dropping an indicator, clamping a level
  deeper than the metric offers, and mapping an unoffered family; the
  derived `disaggregateBy` for both columns modes, including the roll-up
  flag on the unit entry for HMIS and HFA and its absence for ICEH; the
  ICEH stratifier filter; and HFA and ICEH Indicators mode resolving a
  multi-value or empty period to one value (ruling 19). The test builds its authoring context by hand.

**Not in this step.** No server read, no client file, no panther change.

**Gates.** The floor. `deno task test` runs the new file.

**Ends with.** One commit.

### Step 2: the grid read

**Surface.**

- `lib/grid_items.ts` (new: `GridItemsHolder`, `encodeGridItems`,
  `decodeGridItems`)
- `lib/mod.ts` (export)
- `lib/api-routes/instance/run_generation.ts` (the `getRunGridItems` route
  beside `getRunPresentationObjectItems`, same params and body shape)
- `server/server_only_funcs_presentation_objects/consts.ts`
  (`GRID_MAX_CELLS`)
- `server/server_only_funcs_presentation_objects/grid_items_core.ts` (new)
- `server/run_query/run_data_reads.ts` (`readRunGridItems`)
- `server/routes/caches/visualizations.ts` (`_GRID_ITEMS_CACHE`,
  prefix `grid_items`)
- `server/routes/instance/run_generation.ts` (the mount)
- `server/runs/delete_run.ts` (the prefix scan covers `grid_items`)
- `server/tests/grid_items_test.ts` (new: the encode and decode round trip,
  including a null value, a sentinel value, a blank and a second value
  column)
- `SYSTEM_09_viz_query_cache.md` (globs: the new lib and server files and
  the test; prose: the Caching table gains a row, "Client query flow" names
  the read and the codec)

**Deliverable.**

- `readRunGridItems` validates the fetch config, checks the module and the
  required groupBys and the catalog-evaluation guards exactly as
  `readRunItems` does, builds the same SQL with `limit: GRID_MAX_CELLS + 1`,
  and encodes the rows with `encodeGridItems`: one distinct-value list per
  groupBy in `groupBys` order, each row as indices into those lists, and
  per row one value for each non-groupBy column (§2). Sentinel rows
  (`__NATIONAL`, blank) pass through as values of their column. The `ok`
  holder carries the indicator metadata the items read carries.
- `decodeGridItems` reproduces `JsonArrayItem[]` with one key per groupBy
  and per value prop, so the canvas pivot consumes it unchanged.
- Cached in `_GRID_ITEMS_CACHE` with the items cache's uniqueness shape
  (runId, results object, `hashFetchConfig`, scopeToken trailing) and
  `PO_CACHE_VERSION` as the version hash. No bump: the prefix is new.
- Mounted under the run-keyed routes, `requireApprovedUser()`, ready gate,
  the items queue.
- `delete_run.ts` deletes `grid_items` entries for the run.

**Not in this step.** No client cache, no page. `MAX_ITEMS` and
`readRunItems` are untouched.

**Gates.** The floor plus `./validate_queries`. The query rig needs no new
case because the SQL builder is unchanged; if the doer finds it does, the
case is added in this step and the build log says why.

**Ends with.** One commit.

### Step 3: the DataGrid adapter and column focus (panther)

**Surface.**

- Panther repo: `modules/_303_components/tables/data_grid/data_grid.tsx`,
  `modules/_303_components/tables/data_grid/types.ts`,
  `modules/_303_components/tables/data_grid/from_table_data.ts` (new),
  `modules/_303_components/tables/data_grid/mod.ts`,
  `modules/_303_components/deps.ts` (re-export the table types), and the component's
  entry in panther's docs if `DOC_CODING_CONVENTIONS.md` requires one.
- This app, sync commit only: `panther/_303_components/tables/data_grid/**`
  and whatever else the panther sync copies.

**Deliverable.**

- `dataGridPropsFromTableData(data: TableDataTransformed, cell)` per
  ruling 14, returning `Pick<DataGridProps, "columns" | "columnGroups" |
  "rows" | "cells">`. Column and row ids are the pivot's ids, falling back
  to the label, then the index, so a hit can always be traced back. It
  imports the table types through the module's `deps.ts` idiom, never a
  deep path.
- `DataGridProps.focusColumnId?: string | null`. A known column scrolls
  into view (`scrollIntoView` with `inline: "nearest"`) and its header
  takes the hover class; unknown or null does nothing.
- Panther typechecks (`deno task typecheck` in the panther repo).
- The sync lands as one app commit holding only synced files, made after
  any app commit of the session.

**Not in this step.** No app code beyond the sync. No virtualization, no
filter, no find box.

**Gates.** Panther `deno task typecheck`; then the app floor on the sync
commit.

**Ends with.** One panther commit and one app sync commit.

### Step 4: the page

**Surface.**

- `client/src/components/explore/explore.tsx` (the tab rail and heading row)
- `client/src/components/explore/mod.ts`
- `client/src/components/explore/data_table/` (new: `data_table.tsx`,
  `toolbar.tsx`, `grid.tsx`, `cell_function.ts`, `tracked_query.ts`,
  `mod.ts`)
- `client/src/components/explore/visualization/` (new: `visualization.tsx`,
  `mod.ts`; the current `FamilyDefault` and `PackageExplorer` moved here)
- `client/src/components/explore/explore_query.ts` (deleted; its survivors
  moved to `lib/explore_grid_query.ts` in step 1 or to
  `visualization/visualization.tsx`)
- `client/src/state/products/t2_grid_items.ts` (new)
- `client/src/state/t4_ui.ts` (`exploreTab`)
- `SYSTEM_11_viz_authoring.md` ("The Explore page" rewritten; globs)
- `SYSTEM_09_viz_query_cache.md` (globs: `t2_grid_items.ts`; prose: the
  client cache paragraph names it)
- `SYSTEM_14_client_shell.md` (the Explore line and the `t4_ui` list)

**Deliverable.**

- `explore.tsx`: heading row as today (package and area selects), a
  `TabsNavigation` with the two tabs, `exploreTab` persisted in `t4_ui`
  (ruling 2).
- `data_table.tsx`: holds one `GridQuery` signal per mount, seeded by
  `defaultGridQuery` on the first ready package. Reads the authoring
  context, the metric info (for possible values, formats and rules), and
  the grid read through `t2_grid_items.ts`, all as tracked reads (ruling
  17). Every read uses `resolveGridQuery` first; the notice and Clear action
  of ruling 9 sit above the grid. Then §2 "Rendering" steps 1 to 3:
  the canvas table's data config from the derived config, the pivot over
  the decoded rows, the adapter with the cell function.
- `toolbar.tsx`: the controls of ruling 4, editing the query. The family
  select writes `exploreFamily` as today. Grain shows only in HMIS Time
  mode.
- `cell_function.ts`: the cell function of ruling 14: text through
  `formatIndicatorValue` with the effective facts, `value` the raw number,
  HMIS background per ruling 12.
- `grid.tsx`: `DataGrid` with `fitToAvailableHeight`, the hover line, and
  `focusColumnId` driven by the find box. Typed empty states: no ready
  package, a family with no ready metric (its stamped reason), no data,
  `too_many_cells` (narrow or coarsen).
- Download: CSV of the visible grid (ruling 16).
- `t2_grid_items.ts`: the `t2_figure_data.ts` idiom for the new read, keyed
  `runId | scopeToken | resultsObjectId | hashFetchConfig`, version
  `"immutable"`, yielding the decoded rows.
- `visualization.tsx`: the current editor mount, behaviour unchanged.
- The old `explore_query.ts` is gone; nothing imports it.
- SYSTEM prose describes the page as built.

**Not in this step.** No product, no handoff, no copilot, no help buttons.

**Gates.** The floor plus `./validate_protocols`. `lint:structure` passes on
the new folders (rule 2: pages nest under what opens them; rule 4: no
`_shared/` under `explore/` unless two children need it).

**Ends with.** Several commits are allowed (state and cache, then the page,
then the docs), each green.

## 5. Gates catalogue

| Gate | First reached |
| --- | --- |
| `deno task typecheck` (server, client, lint:systems, lint:structure) | every step |
| `deno task test` including `explore_grid_query_test.ts` | step 1 |
| `deno task test` including `grid_items_test.ts`, `./validate_queries` | step 2 |
| panther `deno task typecheck` | step 3 |
| `./validate_protocols` | step 4 |
| `./run` | every step |

## 6. Out of scope

- **The scorecard product**, a third `ProductType` storing a `GridQuery`
  with explicit indicator and period restriction, in folders, at a scope,
  with staleness and a CSV or image export. It is the next plan and reuses
  step 1, step 2, step 3 and step 4's cell function unchanged.
- **Row virtualization in `DataGrid`.** Not urgent (Tim). It is what lifts
  the one corner the DOM cannot paint, every level-3 area of the largest
  instance by every indicator; until then that view answers within the
  read cap and paints slowly.
- Column virtualization.
- A handoff from Explore into a deck or report (D6's "Add to deck").
- Interactive canvas charts in panther (hit regions, tooltips).
- A metric picker beyond the family's primary metric. The grid model
  qualifies any metric with a unit dimension and an indicator dimension, so
  data quality and disruptions can follow without a schema change.
- HFA and ICEH cell colouring.
- Row groups in `DataGrid`; the adapter flattens them.
- A find over row labels.
- HMIS indicator categories and grouped indicator columns.
- The copilot's Explore view, help buttons and a tour.
- Any change to `MAX_ITEMS` or the items read.

## 7. Rollout and rollback

Nothing ships before the last step's review passes. Then Tim deploys
through the release path. Rollback is a revert of the plan's commits in
reverse order and a panther re-sync from the pre-step-3 panther commit;
the `grid_items` cache prefix is new, so no entries need flushing and no
`PO_CACHE_VERSION` bump is involved either way.

## 8. Build log

Append-only, newest last.

- Step 1, deviation: `defaultGridQuery(family, scope, ctx, available)` takes
  the `available` lists, because ICEH's first stratifier and the HFA and ICEH
  latest period are not in the authoring context.
- Step 1, deviation: `deriveGridConfig(query, ctx, language)` takes the
  language `deriveConfigFromVizPreset` requires. It returns undefined for an
  HFA or ICEH Indicators-mode query without exactly one period (ruling 19).
- Step 1, deviation: `UNIT_DIMENSION` is `unitDimension(unit)`: for HMIS and
  HFA the unit dimension is the chosen level, not a per-family constant.
  Also exported for step 4: `timeDimension`, `familiesOffered`,
  `levelOptionsFor`, `periodChoiceId`, `GridAvailable`.
- Step 1, deviation: `periodChoicesFor(family, columns, available)` takes the
  columns mode, since HFA and ICEH offer "All" only in Time mode. HMIS "All"
  is `{ kind: "values", values: [] }`.
- Step 1, gate note: `./run` replaces and on exit stops the machine-global
  `pg` and `valkey-local` containers, which Tim's own session uses. The boot
  gate is run as its server half against the running containers:
  `deno task dev` until `http://localhost:8000/` answers, then stop it.
- Step 1 built.
- Step 1, review finding: `lib/explore_grid_query.ts:13`, `:159`, `:272`
  and `:346` cite this plan ("PLAN_EXPLORE_DATA_TABLE §2", "§2", "ruling
  19"). The plan is deleted when it closes, so these pointers will dangle.
  The reason is already stated in place at `:159` and `:346`, so drop the
  citations, and point `:13` and `:272` at SYSTEM_11 "Grid query model" or
  drop them.
- Step 1, review finding: `lib/explore_grid_query.ts:105-106` and `:405`
  are comments that restate what the code does. Delete them.
- Step 1, review finding: `lib/explore_grid_query.ts:125-128` makes a choice
  the rulings do not cover, and the build log does not record it. When no
  level is valid under the scope (a package aggregated at level 2, read
  under an admin area 2 scope), §2's "shallowest valid level" does not
  exist. The code then falls back to the deepest level the metric offers,
  which is not deeper than the scope, and `levelOptionsFor` returns `[]` for
  that same case. Record the choice in this log. No code change.
- Step 1 reviewed: 3 findings.
- Step 1, fix: the plan citations are gone; the file header points at
  SYSTEM_11 "Grid query model", the other two sites keep their stated
  reason. The two restating comments are deleted.
- Step 1, decision (review finding 3): when no admin level is deeper than
  the scope (a package aggregated at level 2 read under an admin area 2
  scope), resolution falls back to the deepest level the metric offers, so
  the table still answers with the scoped area's own row rather than
  nothing; `levelOptionsFor` is then empty and the page's level select has
  no choices to offer.
- Step 1 fixed.
- Step 1 reviewed: pass.
- Step 2, fact wrong in the plan: the items read's scope filters and the
  catalog-expression evaluation (which turns HMIS ingredient columns into
  `value`) live in `getPresentationObjectItemsFromRun` in
  `server/run_query/run_read.ts`, and encoding must follow them. A separate
  `grid_items_core.ts` would have duplicated both the core and that wrapper.
- Step 2, deviation (surface): the grid read reuses the items pipeline with
  a row limit. `getPresentationObjectItemsCore` takes `maxItems` (default
  `MAX_ITEMS`) and `getPresentationObjectItemsFromRun` passes it through;
  both files are outside the listed surface, and `grid_items_core.ts` is not
  created. The items read's behaviour and cache key are unchanged.
  `server/run_query/mod.ts` exports `readRunGridItems`.
- Step 2, deviation: in `run_data_reads.ts` the request checks (module,
  required groupBys, catalog guards) are extracted to `checkRowsRequest`
  and the cache-then-queue flow to `readRowsCached`, which `readRunItems`
  and `readRunGridItems` both call, so neither is a copy of the other.
- Step 2, deviation: cells keep the type SQL gave them (`GridCell`, string,
  number or null) in both `levels` and `values`, so decoding reproduces the
  items read's rows exactly rather than stringified levels and numeric
  values. `decodeGridItems(encoded, groupBys)` takes the groupBys, which the
  caller reads from the holder's `fetchConfig`.
- Step 2, deviation (docs): SYSTEM_03's cache catalog restates the caches,
  so it gains the `grid_items` row in this step.
- Step 2, gate: `./validate_queries` fails at `d999eed3` (before this step)
  and after it. Every case throws in `moduleFamilyFromDefinition`: commit
  `e4919154` made `family`, `tier` and `sortOrder` required on installed
  module definitions and `query_rig/build_package.ts` does not write them.
  With those three fields added to the rig's module definition as a
  temporary, uncommitted edit, both `d999eed3` and this step give 75 of 76
  passing; the same case fails at both ("scope: an admin RO whose scope
  cannot be derived fails CLOSED", expected `no_data_available`, got
  `ok`). Both failures predate this plan and are outside its surface; they
  are left for Tim.
- Step 2, verification: a harness over the dev packages that carry m012
  (HMIS Indicators mode, and Time mode by quarter) found `decodeGridItems`
  of the grid read equal to the items read's rows on every one, at 21 to
  34% of its JSON size. No dev package carries HFA or ICEH.
- Step 2 built.
- Step 2, review: the surface deviations are accepted. `run_read.ts` and
  `presentation_object_items_core.ts` carry the scope filters and the
  catalog evaluation the grid rows must follow, so a separate
  `grid_items_core.ts` would have copied them; `server/run_query/mod.ts` is
  the module's export file; SYSTEM_03's catalog restates the caches.
  `readRunItems` is unchanged in behaviour: same checks in the same order
  before the cache, same log lines, and the one move (`getRunVersionInfo`
  after the checks) is a pure field read.
- Step 2, review: `./validate_queries` verified as not attributable to this
  step. Unmodified it throws in `moduleFamilyFromDefinition` on every case;
  with `family`, `tier` and `sortOrder` added to the rig's module definition
  (temporary, restored), both `d999eed3` and `d7234917` give 1 failing of
  76, the same case ("scope: an admin RO whose scope cannot be derived fails
  CLOSED", expected `no_data_available`, got `ok`). Recorded, left for Tim.
- Step 2, review finding: `server/routes/caches/visualizations.ts:156-193`
  copies `_PO_ITEMS_CACHE`'s options verbatim, so the
  `runId|resultsObjectId|hashFetchConfig|scopeToken` key is now written four
  times across two caches that are meant to be keyed identically. Extract
  one key function (or one options factory) that both caches use in
  `uniquenessHashFromParams` and `parseData`.
- Step 2, review finding: `server/routes/instance/run_generation.ts:233` and
  `lib/api-routes/instance/run_generation.ts:121` say /mcp "reaches the first
  two" routes of the block; `getRunGridItems` is now second in both and is
  not in `HEADLESS_ALLOWED_ROUTE_NAMES`. Name the two routes instead.
- Step 2 reviewed: 2 findings.
- Step 2, fix: `server/routes/caches/visualizations.ts` keys both row
  caches through one `rowsCacheOptions` (the uniqueness hash is written
  once and `parseData` reuses it). Checked against a live Valkey: both
  caches store and hit under keys of the same form as before
  (`runId|resultsObjectId|hashFetchConfig|scopeToken`).
- Step 2, fix: the two route comments name the headless routes
  (`getRunPresentationObjectItems`, `getRunResultsValueInfo`).
- Step 2 fixed.
- Step 2, re-review: both findings are resolved. `rowsCacheOptions` keys
  both caches, and its uniqueness hash and `parseData` hash join the same
  four fields in the same order as `_PO_ITEMS_CACHE` at `d999eed3`, so
  existing `po_items` entries still hit. Both route comments name
  `getRunPresentationObjectItems` and `getRunResultsValueInfo`, which
  match `HEADLESS_ALLOWED_ROUTE_NAMES`. Typecheck, test,
  `./validate_protocols` and the boot gate pass.
- Step 2, review finding: `server/run_query/run_data_reads.ts:160-165`
  declares `RowsCacheKey`, a copy of `RowsCacheParams` at
  `server/routes/caches/visualizations.ts:115-120`, so the key's shape is
  still written in two files. Export `RowsCacheParams` beside
  `PoDataVersionParams` and use it in `readRowsCached` and its `cacheKey`.
- Step 2, review finding: `lib/api-routes/instance/run_generation.ts:120-122`
  leaves a short line ("through the headless allowlist. Guarded") in the
  middle of the comment. Reflow it.
- Step 2 reviewed: 2 findings.
- Step 2, fix: `RowsCacheParams` is exported from
  `server/routes/caches/visualizations.ts` and `readRowsCached` takes it,
  so the key's shape is declared once; the figure-data route comment is
  reflowed.
- Step 2 fixed.
- Step 2, re-review: both findings are resolved. `RowsCacheParams` is
  declared once, in `server/routes/caches/visualizations.ts`, and types both
  row caches and `readRowsCached`'s cache parameter; the figure-data route
  comment reads without a short line. The step read as a whole again (codec,
  shared checks and cache flow, `maxItems` threading, route, mount, run
  purge) raises nothing new. Typecheck, test, `./validate_protocols` and the
  boot gate pass.
- Step 2 reviewed: pass.
- Step 3, panther commit: `1789731` in
  `/Users/timroberton/projects/panther/timroberton-panther` ("DataGrid: an
  adapter from the canvas table's pivot, and focusColumnId"). App sync
  commit: the one before this row's commit, holding only `panther/` files.
- Step 3, deviation (ruling 14's cell function): the pivot's item ids
  repeat across groups (the same period under every indicator in Time
  mode), so a bare column id cannot identify a cell's indicator and would
  collide in `DataGrid`. Column and row ids are group-qualified
  (`group::item`, with the id, label, index fallback at each level) when
  the axis has groups, and the cell function is
  `(value, { rowId, rowGroupId, colId, colGroupId }) => DataGridCell |
  undefined` with the pivot's own ids. `value` is the pivot's matrix entry
  (`string | number`), undefined where the pivot has no value (its `.`
  placeholder). Exported types: `DataGridCellFunction`,
  `DataGridCellPosition`.
- Step 3, note: `focusColumnId` marks the header with `bg-base-200-hover`,
  the colour `ui-hoverable-base-200` uses on hover. Panther's
  `DOC_CODING_CONVENTIONS.md` asks for no per-component doc entry, so none
  was added. Panther's `tests/` admits only five-gate tests, so the adapter
  was exercised by a throwaway harness (grouped Time-mode pivot and a flat
  pivot: qualified ids, positions and missing cells as expected).
- Step 3, note: the sync also carried panther's three AI proxy commits made
  since the last sync (`cbf0a5a`, `9816ab3`, `8a15e95`), as the sync copies
  the working tree wholesale.
- Step 3 built.
- Step 3, review: the surface matches. Panther `1789731` touches only the
  four data_grid files and `_303_components/deps.ts`; the sync commit holds
  only `panther/` files, and each synced data_grid file, `deps.ts` and the
  three `_221_ai_proxy` files equal panther at `1789731` once the header is
  dropped. The adapter, exercised by a harness (grouped Time-mode and
  row-grouped pivots), gives qualified ids, the pivot's own ids in each
  position and undefined for missing cells. Panther typecheck, the app's
  typecheck, test, `./validate_protocols` and the boot gate pass.
- Step 3, review finding (panther change): `data_grid.tsx:100-108` scrolls
  with `inline: "nearest"`, which aligns a column left of the viewport to the
  scroller's left edge, underneath the sticky row-header column
  (`data_grid.tsx:165`). Checked in a browser: with a 200px sticky column,
  the focused column lands at 8-90px under a sticky column spanning 8-210px,
  so it is fully hidden. The scroll must leave the row-header column's width
  clear on the left (for example `scroll-padding-left` on the container set
  to that column's measured width). Fix in the panther repo and re-sync.
- Step 3 reviewed: 1 finding.
- Step 3, fix: panther `5b285ba` sets the scroller's `scroll-padding-left`
  to the sticky row-header cell's width before `scrollIntoView`, so a
  column focused from the left lands just right of the row-header column.
  Checked in a browser on a sticky-column table of the same structure
  (a 200px row header, 120px columns): without the padding the column sat
  at 1 to 123px under the header (1 to 203px); with it, at 203 to 325px; a
  column to the right still lands at the right edge, and a visible column
  does not move. App sync commit: the one before this row's commit.
- Step 3 fixed.
- Step 3, re-review: the finding is resolved. Panther `5b285ba` sets the
  scroller's `scroll-padding-left` to the sticky row-header cell's
  `offsetWidth` before `scrollIntoView` (`data_grid.tsx:108-113`), with both
  refs on the scroller and the row-header `th`. Checked in a browser on a
  table of the same structure (200px sticky row header, 120px columns, a
  column-group row, sticky head): a column focused from the left lands at
  201 to 321px beside a header spanning 1 to 201px (1 to 121px, hidden,
  without the padding); a column to the right lands at the right edge; a
  visible column does not move; the vertical scroll is untouched. The sync
  commit holds only `panther/` files and every data_grid file and
  `_303_components/deps.ts` equal panther `5b285ba` once the header is
  dropped. The step read as a whole again raises nothing new. Panther
  typecheck, the app's typecheck, test, `./validate_protocols` and the boot
  gate pass.
- Step 3 reviewed: pass.
- Step 4, deviation: the state is one `GridQuery` per family
  (`QueriesByFamily`), owned by `Explore` above the package key rather than
  by the Data table's mount. Held in the tab, a package change (which
  remounts everything under the package key) or a tab switch would have
  reset it, against ruling 9. A family with no stored query reads
  `defaultGridQuery` for the current scope until the user edits it, so its
  default level follows the scope.
- Step 4, deviation: the canvas pipeline is reached through
  `buildFigureInputs` over a figure bundle built in memory from the grid
  rows, not by calling `getTableJsonDataConfigFromPresentationObjectConfig`
  directly. That is exactly how the canvas table calls it (effective config,
  indicator labels and order from the rows' indicator metadata, roll-up
  label, date labels, Nigeria cleaning), and needs nothing exported from
  `build_figure_inputs.ts`.
- Step 4, deviation: the page tab rail sits beneath the heading row (a
  `FrameTop` panel, as the Data page's tabs), not on it as §2's sketch
  draws.
- Step 4, decision: Download writes each cell's displayed text, in the
  pivot's row order (the grid's header sort is transient and internal to
  `DataGrid`); a column's header is its group label and its label joined by
  " · "; the corner cell is blank (panther's `Csv`).
- Step 4, decision: the find box focuses the first column whose full label
  (group, then column) contains the text, case-insensitively.
- Step 4, deviation (docs): `PROTOCOL_APP_STATE.md`'s products cache
  inventory gains the `t2_grid_items.ts` row.
- Step 4, verification (not a gate): the app was run against the dev
  database with auth bypassed (server with `CLIENT_ORIGIN` set to a spare
  Vite port, since :3000 was another project's). On the newest HMIS package:
  Indicators mode (National roll-up row first, 13 provinces, 54 indicator
  columns), Time mode (indicator column groups over months), the find box
  (scrolls to and marks the first match), a province scope (level moves to
  admin area 3, a "GAZA — All areas" roll-up row, Time mode kept across the
  scope change), the Visualization tab (the editor as before) and back (the
  query kept), and Download (a CSV of the grid's text). No console errors.
  No dev package carries an indicator threshold, so the colouring path was
  exercised in the browser by calling `gridCellFunction` with a rule:
  bucket colours in Indicators mode, Time mode and a collapsed single
  indicator; none for an indicator without a rule or for HFA. No dev
  package carries HFA or ICEH.
- Step 4 built.
- Step 4, review: the surface matches, with `PROTOCOL_APP_STATE.md` added
  for its products cache inventory row, which is accepted (the inventory
  restates the caches, as SYSTEM_03's did in step 2). The recorded
  deviations are accepted: the per-family queries held above the package
  key are what ruling 9 requires, reaching the pivot through
  `buildFigureInputs` is the canvas table's own call, and the tab rail
  beneath the heading row matches the Data page. Nothing imports
  `explore_query.ts`. Typecheck (with `lint:systems` and `lint:structure`),
  test, `./validate_protocols` and the boot gate pass.
- Step 4, review finding: `client/src/components/explore/data_table/data_table.tsx:272-287`
  builds the grid from the current `derived()` and `resolved().query.columns`
  paired with whatever `rows()` holds. When the query or scope changes, the
  memo re-runs before the tracked query's effect sets loading, so it runs
  `buildFigureInputs`, the pivot and the adapter over the previous read's
  rows with the new config, and the keyed `Match` mounts a `DataGrid` for
  that mismatched pair, only to unmount it in the same flush. Proved with a
  Solid harness of the same shape: after a query change the memo logs
  "rows for A, config B" and renders it before going to loading. It also
  rebuilds and remounts the grid (losing the header sort) when `derived`
  changes but the fetch config does not, as on Clear. Build the grid from
  the config and columns the read was made for, captured in the tracked
  query's source with the rows, so the grid depends only on the read's
  result.
- Step 4, review finding: `client/src/components/explore/data_table/data_table.tsx:200-204`
  takes HFA's time points from `instanceState.hfaTimePoints`, the instance's
  current list, while ICEH's years come from the package's metric info.
  Resolution is against the current package (§2), so a package made before
  the newest time point was imported opens HFA Indicators mode on a time
  point it does not carry ("No data for this selection") and offers it in
  the period select. The package's values are in
  `disaggregationPossibleValues.time_point` of the same metric info
  (`time_point` is a required disaggregation of `m10-01-01`). The order is
  also its own (period id, then sort order) where every other time-point
  list and query uses `sort_order`. Use the package's time points, in the
  instance's `sortOrder` order.
- Step 4, review finding: the two tabs restate each other.
  `client/src/components/explore/visualization/visualization.tsx:30-45`
  (`familiesInPackage`) re-derives what `familiesOffered` and
  `primaryMetricFor` in `lib/explore_grid_query.ts` already compute, and
  `client/src/components/explore/data_table/data_table.tsx:116-131`
  (`unavailableReason`) repeats its "primary module's first metric by id"
  lookup and fallback text. The "no primary module" message
  (`data_table.tsx:79-84`, `visualization.tsx:78-82`), the "no metric"
  message (`data_table.tsx:127-131`, `visualization.tsx:130-135`) and the
  "no preset" message (`data_table/grid.tsx:66-70`,
  `visualization.tsx:148-152`) are each written twice. Extract the family
  lookup (into lib beside `primaryMetricFor`) and the shared empty states
  (an `explore/_shared/`, which rule 4 admits since both children use it).
- Step 4 reviewed: 3 findings.
