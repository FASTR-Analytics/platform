# Research: Showing "n" Values on Table Visualizations

Research only — no code changed. Compiled 2026-07-23 to hand off to whoever
makes the final design/implementation call. Covers the full pipeline: SQL
query layer (S9), data transport/caching (S9/S10), rendering (S10 + panther),
and config/editor UI (S11).

## 1. Framing the question

"n" almost always means **"how many underlying records/facilities went into
this aggregated cell."** Two presentation shapes were asked about:

- **(a) Secondary column** — e.g. a "Value" column and an "n" column side by
  side per indicator.
- **(b) Attached to column header** — e.g. `"Indicator X (n=42)"`.

A third shape came up repeatedly in research and is included for completeness:

- **(c) Secondary line / annotation inside the cell itself** — e.g. the value
  on one line, a smaller/greyed `n=42` underneath (or in a tooltip).

**The single biggest fact to internalize before choosing a shape: no "n" /
sample-size value exists anywhere in the current data pipeline.** It is not
in `IndicatorMetadata`, not in `ResultsValueForVisualization`, not in
`FigureBundle`, not silently computed and discarded anywhere. This is a
green-field feature on the data side — the query has to be taught to produce
it, on top of whatever UI shape is chosen. That data-side question turns out
to have its own nuance (§2) that constrains which UI shape (§4) is even
sensible.

There's also a variance dimension that decides feasibility of (b) vs (a)/(c):
**does n vary only by column-header id, or does it vary per cell (both row
and column)?** A coverage-rate table where n = "facilities reporting" will
typically vary by *both* the indicator (column) and the admin area / period
(row) — i.e. per-cell, not per-column. If so, (b) header-suffix is
semantically wrong for the common case (see §4.2) and (a) or (c) is required.

---

## 2. Query layer (SQL / server) — S9

Files: `server/server_only_funcs_presentation_objects/query_helpers.ts`
(formerly referenced as `cte_manager.ts`/`get_combined_query.ts` split — the
agent found the aggregate-building logic consolidated in
`query_helpers.ts:278-292` for `buildAggregateColumns` and `:302-333` for
`applyPostAggregationExpression`), `lib/get_fetch_config_from_po.ts`,
`lib/validate_fetch_config.ts`, `lib/admin_area_rollup.ts`,
`lib/types/_metric_installed.ts`.

### 2.1 COUNT already exists as a value func — but it's not "auto-n"

`valueFuncStrict` (`lib/types/_metric_installed.ts:305-312`) is
`z.enum(["SUM", "AVG", "COUNT", "MIN", "MAX", "identity"])` — **COUNT is
already a fully wired, first-class aggregation func**: emitted by
`buildAggregateColumns` (`query_helpers.ts:278-292`) as
`COUNT(prop) AS prop`, treated as roll-up-eligible/additive by
`isRollupEligibleResultsValue` (`lib/admin_area_rollup.ts:52-61`), accepted by
`validateFetchConfig` and the wire schema, and even authorable by module
definitions (`valueFuncGithub`, `_module_definition_github.ts:81-88`).

But this is a **user-selected metric value**, not an automatic sample-size
companion to some other metric. A module author has to define a metric whose
own `valueFunc` is `COUNT` (e.g. "number of facilities reporting stockouts")
and a viz author has to select it as one of the displayed values. There is
**no existing mechanism anywhere in the pipeline that silently rides a
`COUNT(*)` alongside a different requested aggregate** (e.g., attaching a
row-count automatically to an AVG). The building block exists; the "auto-n"
feature does not, even latent.

### 2.2 What "n" means domain-wise (this determines correctness, not just plumbing)

This hinges on `ResultsValue.hasFacilityLevelRows` (set once at metric
enrichment, `server/db/project/metric_enricher.ts:30-37`, carried on
`lib/types/modules.ts:34-37`) — whether the underlying `ro_*` table holds raw
per-facility observations or already-pre-aggregated area/period rows. This is
the exact same flag `isRollupEligibleResultsValue` already uses to decide
whether re-averaging across a roll-up is statistically sound (re-averaging
raw facility rows = correct; re-averaging pre-aggregated area rows = a
population-blind mean, forbidden). The same logic applies to "n":

- **`hasFacilityLevelRows === true`, value func AVG or SUM**: a
  `COUNT(*)` computed in the *same* `GROUP BY` as the value gives exactly "the
  number of facility rows behind this cell" — a real, statistically
  meaningful sample size (e.g. "this district's coverage average is over 12
  facilities").
- **`hasFacilityLevelRows === false`** (rows are already one-per-area/period):
  a same-grain `COUNT(*)` is trivially 1 (the row *is* the group) and tells
  you nothing, UNLESS the requested `groupBys` are *coarser* than the row
  grain (e.g. grouping to admin_area_1 while rows live at admin_area_2) — then
  it means "how many admin_area_2 summary-rows folded into this cell," a
  different but still legitimate n (count of area-units, not facilities).
- **`identity` values**: the prop is already folded into `GROUP BY`
  (`query_helpers.ts:31-33,41`), so output rows are unique by construction — a
  same-grain COUNT is meaningless here.

**Decision needed**: should "n" only be surfaced (and labeled "sample size")
for SUM/AVG on facility-level data, with everything else either hidden or
carefully re-labeled ("n areas" vs "n facilities")? Or shown uniformly with a
generic caveat? This is a domain-owner call, not an engineering one.

### 2.3 Mechanical feasibility of adding n to the query

Adding `COUNT(*) AS n` to `buildAggregateColumns` (`query_helpers.ts:278-292`)
is cheap string-concatenation — no new query shape, plugs into both
`buildMainQuery` and `buildAdminAreaRollupQuery` since both already call the
same function with a `mode` parameter.

- **UNION ALL column-parity** (main query ∪ roll-up query) is naturally
  preserved if `n` is added identically to both branches — same function,
  same column position in both SELECTs.
- **Roll-up "n" is a fresh COUNT at the rolled-up grain, not a SUM of
  per-area n's** — confirmed architecturally, not by choice:
  `buildAdminAreaRollupQuery` is a sibling query built from scratch against
  raw source rows with its own (coarser) `GROUP BY`; it never re-aggregates
  the main query's *output*. So a roll-up `n` naturally becomes "count of
  raw rows in the whole rolled-up area," which is almost certainly the
  right semantics — but flag it as a decision point, not an assumption,
  especially if "n" should mean "count of area-units" above the roll-up
  rather than "count of facility rows."
- **The real complication: `applyPostAggregationExpression`**
  (`query_helpers.ts:302-333`). For PAE/ratio metrics (the common case for
  coverage indicators — numerator/denominator `ingredientValues`), the
  combined query is *wrapped*:
  `SELECT groupBys, (expr) as value FROM (innerQuery) AS subq` — this outer
  SELECT **silently drops any column from the inner query that isn't
  explicitly re-projected**, including a new `n`. This wrapper is a second,
  separate site that needs its own change (`groupByPrefix + "n"` added to the
  outer projection), plus a decision about *which* ingredient's row-count
  becomes `n` when numerator and denominator could theoretically have
  different underlying counts (they should be equal for a well-formed ratio,
  but that's an assumption, not a type-level guarantee).

### 2.4 SQL-injection / validator surface

If `n` is **always server-computed** (a hardcoded `COUNT(*) AS n` literal,
never client-influenced), there is **no new attacker-controlled surface** —
no validator changes needed. If instead it becomes **client-requestable**
(e.g. a boolean `includeN` in the fetch-config contract, or worse, a
client-chosen count target), it needs the same three-place treatment every
other fetch-config field gets: `validateFetchConfig` (boolean type-check,
same shape as `includeAdminAreaRollup`), the wire zod schema
(`genericLongFormFetchConfigSchema` in `lib/api-routes/project/presentation-objects.ts`),
and — critically — inclusion in `hashFetchConfig`
(`get_fetch_config_from_po.ts:253-288`), else two configs differing only in
`includeN` collide in the cache and one silently serves without n. **The
always-on/server-computed path is simpler and safer**; it only makes sense to
go client-requestable if n should be optional per-viz (see §4 — it likely
should be, via a style flag, but that flag need not reach the wire contract
if n is just always computed and the *display* of it is what's toggled
client-side).

---

## 3. Data transport & caching — S9/S10

Files: `lib/types/_figure_bundle.ts`, `lib/types/instance.ts`,
`server/routes/caches/visualizations.ts`, `client/src/state/project/t2_presentation_objects.ts`.

### 3.1 Carrying n through `items` needs no schema change

`ItemsHolderPresentationObject.items` is typed `JsonArrayItem[]` where
`jsonArrayItemSchema` (`lib/types/_figure_bundle.ts:95-100`) is
`z.record(z.string(), z.union([z.string(), z.number(), z.null()]))` — an
**open-keyed record**, explicitly documented as "a cell is whatever SQL
returns for that column." This means **adding a new SQL output column (e.g.
`n`, or `"__n__" + prop` if multiple values need their own n) rides through
`items` and the stored `FigureBundle.items` with zero type/schema changes** —
it just starts appearing as an extra key in the already-generic row record.
This is the cheapest possible transport option.

A dedicated parallel structure (e.g. a top-level `nByGroup` field on
`FigureBundle`) is also possible but *does* require an explicit schema
addition, since `figureBundleSchema` is a `z.strictObject` at the top level
(`_figure_bundle.ts:104-118`) — new top-level fields must be declared, unlike
same-row extra columns.

### 3.2 Cache versioning — one bump needed, client side is a non-issue

- **Server (Valkey)**: `PO_CACHE_VERSION`
  (`server/routes/caches/visualizations.ts:13-27`) is *exactly* the
  documented mechanism for "payload meaning changed without a data change" —
  four prior bumps ("2"–"5") are precedent for shape/semantics changes just
  like this. Adding `n` passively (server-computed, no new fetch-config
  field) needs exactly one `PO_CACHE_VERSION` bump and **no**
  `hashFetchConfig` change (since that hash only covers fields that change
  *what* is queried, and n would not be one of them if always-on).
- **Client (IndexedDB) — not actually a gap.** The client's `_PO_ITEMS_CACHE`
  (`t2_presentation_objects.ts:55-71`) has no client-side analog of
  `PO_CACHE_VERSION` in its own version key — its version key is only
  `moduleLastRun|datasetsVersion`. In isolation that would leave an
  already-cached `po_items` entry stale until the module/dataset reruns —
  **but this is a non-issue in practice**: all client-side caches (this one
  included) are automatically busted on server version update — the app's
  deploy-time mechanism clears site caches wholesale on a version change
  (`LoggedInWrapper`), independent of any per-cache version-key logic. The
  `PO_CACHE_VERSION` bump on the server (above) is sufficient; no
  client-side version-key change is needed. The only environment where this
  doesn't apply is local dev, which has no deploy step — a stale IndexedDB
  entry there needs a manual "clear site data," a pre-existing, already-known
  trap unrelated to this feature.

### 3.3 Existing precedent for "secondary value alongside primary"

- **`indicatorMetadata`** is the closest structural precedent for *header
  decoration*: a sibling array keyed by indicator id, converted to a
  `Record<string,string>` label-override map
  (`indicatorMetadataToLabelMap`, `lib/types/indicators.ts:244-252`) and
  spread into `labelReplacements`
  (`client/src/generate_visualization/get_data_config_from_po.ts:49-72`),
  which panther's table consumes directly as header text
  (`TableJsonDataConfig.labelReplacements`, panther
  `_010_table/get_table_data.ts`). The mechanism an "(n=42)" header-suffix
  needs is structurally identical — a header-axis-id → decorated-string map —
  except `n` must be *computed from the fetched items* (group by header prop,
  read the new `n` column, format) rather than looked up from a static
  metadata table. It slots into the *same* `labelReplacements` field with
  zero panther changes.
- **`dateRange`** — a single whole-figure value spliced into
  caption/subcaption/footnote text. Precedent for "secondary contextual value
  decorating figure text," but only at whole-figure grain, not per-cell/column.
- **PAE `ingredientValues`** is *not* actually a working precedent for
  "secondary value survives" — the opposite: it's proof that extra columns
  get **consumed and discarded** by the wrapper SELECT (§2.3) unless
  explicitly preserved. It's the same mechanism that would need patching for
  n to survive PAE-based metrics.
- **Multiple simultaneous `values[]` entries** (e.g. SUM(a) + AVG(b) selected
  together) is the most directly reusable precedent for the **secondary
  column** shape: `buildAggregateColumns` already emits N aggregate columns
  per row when N values are requested, and the table builder
  (`getTableJsonDataConfigFromPresentationObjectConfig`,
  `get_data_config_from_po.ts:213-214`) already knows how to render multiple
  `valueProps` as separate table columns. Emitting `n` as one more
  values-like column (auto-appended, not user-selectable as a "value") is the
  cheapest, most mechanically-proven path to shape (a) — **no new
  panther/table-renderer logic required at all**.

---

## 4. Rendering — S10 + panther's Table module

Files: `client/src/generate_visualization/build_figure_inputs.ts`,
`client/src/generate_visualization/get_data_config_from_po.ts`,
`client/src/generate_visualization/get_style_from_po/_0_common.ts` and
`_5_scorecard.ts`, `client/src/exports/get_table_export_aoa.ts`,
panther `_010_table/types.ts`, `_010_table/get_table_data.ts`,
`_010_table/_internal/{measure_table,generate_table_primitives}.ts`,
`_001_render_system/chart_info_types.ts`, `_010_simpleviz/*` (precedent only).

### 4.0 panther's Table data model is barebones — no built-in secondary-value concept

There is no dedicated `get_table_json_data_config.ts`; the table path is
`build_figure_inputs.ts:102-125` (assembles `tableData` + `style`) plus
`get_data_config_from_po.ts:173-236`
(`getTableJsonDataConfigFromPresentationObjectConfig`, which maps item-props
to `colProp`/`rowProp`/`colGroupProp`/`rowGroupProp` and builds
`labelReplacements` — it does not touch cell values).

panther's actual data (`_010_table/types.ts:23-97`,
`get_table_data.ts:91-119`): a header is just `HeaderItem = {id, label}`
(`label: string`, nothing else); a cell, once transformed, is a plain
`string` inside a `string[][]` AOA grid (`aoa: (string|number)[][]`) — no
per-cell object, no secondary-text slot, no tooltip concept at all (panther
is a static primitive-emitter for canvas/SVG/PPTX, not a DOM widget — hover
tooltips are foreign to its whole model). During measurement only, a cell is
briefly wrapped in `TableCellInfo` (`chart_info_types.ts:98-109`, includes an
internal `n` field on `TableHeaderInfo` — but that's "count of items on this
header axis" for internal style-function context, not an exposed sample-size
value; do not confuse the two).

Two things ARE already supported and matter here:
- **Whole-table footnotes** (`TableInputs.footnote?: string | string[]`,
  `_010_table/types.ts:230-232`) — but only at the whole-table level, not
  per-column/per-cell.
- **Multi-line text via embedded `\n`** — the text measurer
  (`_002_canvas/_internal/text/measure_text.ts:60-63`) already splits on
  `\n` and wraps, so a header or cell string containing `"Value\n(n=42)"`
  renders as two visual lines **today, with zero panther changes** — but
  both lines share the same font/size/color (no independent secondary
  styling).

**Precedent for a genuinely distinct secondary style** (smaller/greyed second
line) exists elsewhere in panther but not in Table: `_010_simpleviz` (a
stat-box figure type) has independent `text`/`secondaryText` fields with
independent `primaryTextStyle`/`secondaryTextStyle`, rendered as two stacked
`mText` calls (`_010_simpleviz/_internal/build_box_primitives.ts:89-102,
186-211`). This is the template an eventual "real" secondary-style Table
feature would mirror — but it requires new panther fields/rendering, not
just an app-side change.

### 4.1 Option (a): genuine secondary column ("Value" | "n")

Very likely achievable **without any panther core change**, using
`TableJsonDataConfig`'s existing `"--v"` sentinel mechanism for iterating
`valueProps` as a column axis (`get_table_data.ts:187-196`: `resolveId`
returns the value-prop when the axis prop is `"--v"`). Concretely: emit `n`
as an extra entry in `items`/`valueProps` (§3.3's "multiple values"
precedent) and let the existing column-axis machinery render "Value | n"
sub-columns per indicator.

- Files touched: `get_data_config_from_po.ts` (config shaping — deciding
  when/how to add the second valueProp), possibly `build_figure_inputs.ts`;
  no panther type or renderer change.
- **Export is free**: `get_table_export_aoa.ts` already iterates
  `cols = colGroups.flatMap(g => g.cols)` generically — a real extra column
  round-trips into CSV/XLSX with **zero export-code changes**.
- Con: adds visual/column-count overhead to every table, and needs a design
  answer for how "n" columns interleave with multiple real value columns.

### 4.2 Option (b): baked into the header string ("Indicator X (n=42)")

Cheapest option. Touches only `buildLabelReplacements`
(`get_data_config_from_po.ts:49-72`) — concatenate the n-suffix onto the
label when building that id's `labelReplacements` entry. No panther change
(`ColGroupCol.label` is already a plain string). **Export is free** —
`get_table_export_aoa.ts` reads `c.label`/`g.label` verbatim, so whatever
string is baked in exports as-is, no special-casing needed.

**The catch (semantic, not mechanical, and important):** `labelReplacements`
is a flat `id → string` map used identically **everywhere that id's label
appears** — whichever axis it happens to be displayed on. Baking in a suffix
is only correct when n is genuinely constant per id across the *other* axis
(e.g. one overall sample size per indicator, not varying by row/admin-area).
As flagged in §1, the common real-world case — n = facilities-reporting,
varying by both indicator AND area/period — makes this approach
**semantically wrong**: it would show one static n on a column header when
the true n differs row-by-row underneath it. This option is really only
sound for tables where n is provably constant across rows for a given
column.

### 4.3 Option (c): secondary line / annotation inside the cell (or tooltip)

- **Cheap version (same-style, `\n`-joined second line)**: fully achievable
  today with no panther changes. Two existing app-side precedents already do
  "look up per-cell metadata by header id, inject into cell text":
  `getTableCellsContent` (`get_style_from_po/_0_common.ts:137-181`, the
  **default/standard table's** textFormatter — the more important precedent
  since it's the common non-scorecard path) and `buildScorecardStyle`
  (`get_style_from_po/_5_scorecard.ts:47-109`, keys off
  `info.colHeader?.id ?? info.rowHeader?.id` into a `metadataById` map). An
  n-value could be threaded into either exactly the way `indicatorMetadata`
  already is, appended as `` `${value}\n(n=${n})` ``. This correctly handles
  the per-cell-varying-n case that breaks option (b).
  - **Export needs a small check, not a rewrite**: `get_table_export_aoa.ts`
    rebuilds the same `textFormatter` closure and pushes its return string
    directly (line ~84) — a `\n`-joined string round-trips automatically,
    but embedded-newline behavior in whatever CSV/XLSX writer sits downstream
    should be verified (not confirmed by this research).
- **Deeper version (genuinely distinct secondary style, or a real tooltip)**:
  requires new panther capability — `TableCellStyle` needs a secondary-style
  field, `MeasuredCellInfo` needs a second `mText`, and the cell-rendering
  loop (`generate_table_primitives.ts:207-244`, `measure_table.ts`) needs to
  measure+render a second run — directly modeled on simpleviz's
  `mTextPrimary`/`mTextSecondary` split (§4.0). A true hover **tooltip** has
  no analog anywhere in panther at all (static renderer, no DOM/hover
  concept) — would be an orthogonal new capability, and would need a
  deliberate decision about CSV/XLSX export (there is no natural
  representation for a tooltip in a spreadsheet cell; on-screen and exported
  output would necessarily diverge).
  - **Export in this branch is NOT free**: `get_table_export_aoa.ts` only
    ever calls one `fmt(info)` per cell and pushes one string — a truly
    separate secondary field would need explicit new code here to stay in
    parity with the two-line/tooltip on-screen rendering.

### 4.4 Conditional-formatting compile path — not a text-injection precedent

Checked as requested: CF (`conditional_formatting.ts` /
`conditional_formatting/compile.ts`) only compiles rules into
`LegendInput`/color-scale data for the legend; actual per-cell CF coloring
goes through `getTableCellsContent`'s background-color sentinel
(`_0_common.ts:121,143-157`), not through text injection. So CF is a
styling-only precedent (color), not a content-injection one — the
scorecard/`_0_common` textFormatters (§4.3) are the actually-relevant
precedent for text-content manipulation per cell.

---

## 5. Config schema & editor UI — S11

Files: `lib/types/_presentation_object_config.ts`,
`lib/types/_metric_installed.ts`, `lib/types/_module_definition_github.ts`,
`lib/normalize_po_config.ts`, `lib/convert_visualization_type.ts`,
`client/src/components/visualization/presentation_object_editor_panel_style.tsx`
and `.../presentation_object_editor_panel_style/_table.tsx`,
`client/src/generate_visualization/special_chart_checks.ts`,
`client/src/components/project_ai/ai_tools/tools/visualization_editor.tsx`.

### 5.1 Where would the option live: `d` or `s`?

`PresentationObjectConfig = {d, s, t}` (`_presentation_object_config.ts:100-104`).

- **`s` (style)** is the natural home if "include Ns" is purely a *display*
  toggle over data that's already fetched (e.g. n rides passively per §2.4's
  always-on server computation, and the toggle only controls whether it's
  *shown*). Direct precedent: `specialScorecardTable` is a plain required
  boolean on `s` (`_presentation_object_config.ts:68`) that gates a
  rendering-only special mode, with zero query-side effect.
- **`d` (data/query config)** would be appropriate if showing n actually
  changes what's fetched (which — per §2 — it may need to, at least
  server-internally, even if not client-triggered). No existing "N" concept
  was found anywhere in `d` (`IndicatorMetadata` has no count field either),
  reinforcing that this is genuinely new ground, not a field that already
  exists half-wired.
- **A plausible split**: n is *always computed* server-side (no `d` change,
  no wire-contract change, per §2.4's simpler path) and a single boolean on
  `s` controls whether the editor/renderer displays it. This avoids adding
  anything to the fetch-config contract or `hashFetchConfig` at all.

### 5.2 The schema-duplication/vendoring reality (relevant to ANY new field, not n-specific, but must be accounted for)

`configDStrict` is a literal shared reference within wb-fastr (imported both
by `_presentation_object_config.ts` and `_metric_installed.ts`'s installed
vizPreset config) — one edit covers both. **`s` is not shared this way**:
`presentationObjectConfigSStrict` (`_presentation_object_config.ts:32-87`,
all-required) is a **hand-duplicated near-twin** of `configSStrict`
(`_metric_installed.ts:190-251`, all-optional) — two separately-declared Zod
objects with ~25 overlapping fields, kept in sync only by developer
discipline (a header comment says so explicitly).

Beyond wb-fastr itself, `_module_definition_github.ts` in the **separate**
`wb-fastr-modules` repo has its own `configSGithubStrict`, vendored via a
manual shell script (`wb-fastr-modules/vendor_schema`, plain `cp`, not
CI-enforced) — and the two copies **have already drifted** in this checkout
(an `assetsToImport` feature exists in the modules-repo copy but not yet in
the wb-fastr source). So: adding a new `s` field like `includeNs` means
touching up to **four** places to stay consistent —
`presentationObjectConfigSStrict`, `configSStrict`, `configSGithubStrict` in
wb-fastr, then re-running `vendor_schema` to push it into
`wb-fastr-modules/.validation/`. Adding it to `d` instead is one place
cheaper inside wb-fastr (the shared reference) but still needs the same
manual vendoring step for `configDGithubStrict`.

### 5.3 Is `_5_scorecard.ts` the right pattern to follow, or does it not generalize?

`buildScorecardStyle` (`_5_scorecard.ts:47-109`) only **styles
already-existing cells** (background color + text formatting) — it never
adds rows/columns; table structure itself comes from
`getTableJsonDataConfigFromPresentationObjectConfig`
(`get_data_config_from_po.ts:173`), driven by `d`, not `s`. More importantly,
it's dispatched through the **metric-scoped "special mode" registry**
(`special_chart_checks.ts`'s `SPECIAL_SCORECARD_TABLE_METRICS = ["m8-01-01"]`
— only that one metric is eligible), which is purpose-built for hardcoded
per-metric overrides (coverage/disruptions/percent-change/scorecard), a
materially different shape than "any table author can turn Ns on."

**Two real design options, not obviously equivalent:**
- Reuse the scorecard-style *decoration* mechanism (style builder reads a
  side-channel lookup keyed by header id) but as a **generic, type-agnostic
  but table-only flag** — `if (config.d.type === "table" &&
  config.s.includeNs)` inside `buildStandardStyle`/`_0_common.ts`, independent
  of the metric-scoped special-mode registry entirely. This matches option
  (c)'s "cheap version" in §4.3 and is likely the better fit given the
  doc's framing that this should be broadly available, not per-metric.
- If instead n-column addition (option (a), §4.1) is chosen, this is not a
  `get_style_from_po` concern at all — it's a `get_data_config_from_po.ts`
  (and possibly upstream query) concern; the style layer only needs to know
  how to format/label the new column once it exists.

### 5.4 Editor UI placement

The table-specific style tab already exists:
`presentation_object_editor_panel_style/_table.tsx` (115 lines), dispatched
from `presentation_object_editor_panel_style.tsx:87-94` via a `<Switch>` on
`config.d.type`. `specialScorecardTable`'s toggle there is a `RadioGroup`
(mutually-exclusive mode switch, since scorecard replaces the whole table
style), gated by `p.showScorecardMode` (computed from
`canUseSpecialScorecardTable(metricId())` in the parent panel).

An "include Ns" checkbox is **additive, not a mode switch** — the natural
widget is a plain `<Checkbox>` inside the existing `<StyleSection
label="Display">` block (lines 59-95), mirroring the existing "Allow
vertical column headers" checkbox (lines 61-69), bound to
`p.tempConfig.s.includeNs`. Open sub-question: should it be available
**both** in standard and scorecard sub-modes (would need explicit exclusion
from the `<Show when={!specialScorecardTable}>` guards already wrapping some
controls, plus support inside `_5_scorecard.ts`'s own textFormatter), or
**standard-mode only** (simpler — just add inside existing guards)?

### 5.5 Save-time normalization

`normalizePOConfigForStorage` (`lib/normalize_po_config.ts:13-37`) only
touches `config.d` today; the roll-up flag needs normalization because it has
a *coupled sibling field* (`adminAreaRollupPosition`) and an eligibility gate
that can flicker while editing. `specialScorecardTable` — a single standalone
boolean with no coupled field and no flickering eligibility gate distinct
from its own `is*Active` read-time check — gets **no normalization at all**.
**A plain `includeNs` boolean would very likely need none either**, following
the scorecard precedent rather than the rollup one — unless it grows a
coupled second field (e.g. "which position to show n in") later.

### 5.6 Type-conversion reset

`convertVisualizationType`'s `styleResets` per target type
(`lib/types/presentation_objects.ts:139-229`) do **not** include
`specialScorecardTable` — confirmed via grep, zero hits outside its own
declaration/consumption sites. Converting a scorecard table to
timeseries/chart/map leaves the flag `true` in storage but permanently
inert, because `isSpecialScorecardTableActive`
(`special_chart_checks.ts:60-62`) double-gates on `config.d.type === "table"`
at **read** time — the type-gate in the `is*Active` check is the actual
safety net, not an explicit strip. **Precedent says `includeNs` needs no
entry in `styleResets` either**, as long as wherever it's consumed also gates
on `config.d.type === "table"`. Being more defensive (adding it to
`styleResets` anyway) is a legitimate stricter choice but not required by the
existing pattern.

### 5.7 AI-tool exposure

Quick check, as scoped: `config.s` fields are **not** currently exposed to
any AI tool at all. `vizConfigUpdateSchema`
(`ai_tools/tools/visualization_editor.tsx:26-70`) is hand-enumerated
field-by-field from `configDStrict`/`presentationObjectConfigTStrict` only;
its sibling `AiFigureConfigPatchSchema`
(`lib/types/ai_input.ts:152-190`) explicitly says "style (`config.s`) is
excluded by design." So `includeNs` (if placed on `s`) would need a **new,
manually-added line** in the AI schema plus a handler branch to become
AI-editable — there is zero existing precedent for any `s` field being
AI-editable, so this establishes new ground rather than following a pattern.
If it's placed on `d` instead, it would still need a manual addition (nothing
auto-derives), but would at least be extending an existing, actively-used
enumeration rather than breaking new ground.

---

## 6. Summary decision matrix for the implementer

| Question | Options | Key constraint |
|---|---|---|
| What does n mean? | facility-row count (needs `hasFacilityLevelRows`) vs area-unit count vs "n/a for identity values" | Domain-owner ruling needed (§2.2) — mechanical choice can't resolve this |
| Is n per-column-constant or per-cell? | If per-cell (the likely common case, e.g. varies by row/area too) | Rules out header-suffix (§4.2) as semantically correct; needs column (a) or cell-annotation (c) |
| Where is n computed? | Always server-side (simple, safe, no wire-contract change) vs client-requestable flag (needed only if n itself should be optional in the query, not just in display) | §2.4 — always-on is simpler and has no injection surface |
| How does n survive PAE-wrapped (ratio) metrics? | Needs explicit re-projection through `applyPostAggregationExpression`'s wrapper SELECT regardless of UI shape | §2.3 — a mandatory fix if any ratio-type table needs n |
| UI shape | (a) secondary column — free export, works for per-cell n, adds column width | (b) header suffix — cheapest, free export, but only correct if n is column-constant | (c) cell secondary line — works for per-cell n, cheap `\n` version free-ish, deep version (distinct style/tooltip) needs new panther work + export special-casing |
| Config location | `s` (style-only toggle, if n always computed) vs `d` (if fetching n is itself conditional) | Precedent (`specialScorecardTable`) favors `s` for a pure display toggle |
| Cache versioning | Server: bump `PO_CACHE_VERSION` (simple, precedented) | Client: non-issue — all client caches auto-bust on server version update (deploy-time flush), so no client-side version-key change is needed; dev-only exception is pre-existing and unrelated to this feature |
| Cross-repo schema | Any new `s`/`d` field needs manual updates in up to 4 places (`_presentation_object_config.ts`, `_metric_installed.ts`, `wb-fastr-modules`' `_module_definition_github.ts`, then `vendor_schema`) — already-observed drift between the last two | Process risk independent of which UI shape is chosen |

## 7. Suggested reading order for whoever picks this up

1. Get a domain ruling on §2.2 first — it changes everything downstream.
2. Confirm whether n is column-constant or per-cell for the actual tables in
   scope (probably per-cell) — decides between (a)/(c) and ruling out (b) as
   a general solution.
3. Decide always-server-computed vs client-requestable (§2.4) — favor
   always-computed unless there's a real reason to make it opt-in at the
   query level (cheap toggling is instead handled at the `config.s` display
   layer, per §5.1).
4. Pick the UI shape from §4 given the per-cell-vs-column-constant answer.
5. Only then work out schema placement/editor UI details (§5) and cache
   versioning (§3.2) for the chosen shape.
