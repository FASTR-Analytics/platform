# PLAN: Show "n" Values in Visualization Tables

Show sample sizes (n = number of underlying facility rows contributing to a
cell) on table visualizations. Background research: `RESEARCH_ON_N_ISSUE.md`
(kept as reference; this plan supersedes its open questions).

Three phases: (1) server always computes n, (2) panther Table gets n as a
first-class concept, (3) wb-fastr wires config + display. Phases 1 and 2 are
independent; phase 3 needs both.

## Settled design decisions

- **n semantics**: count of rows actually contributing, NULLs excluded.
  Plain SUM/AVG value → `COUNT(prop)`. PAE (ratio) value → count of rows with
  at least one referenced ingredient non-NULL.
- **Always server-computed.** No fetch-config field, no `hashFetchConfig`
  change, no new injection surface. Display is toggled client-side.
- **Eligibility**: only meaningful when `ResultsValue.hasFacilityLevelRows`
  (same flag as roll-up eligibility). For pre-aggregated rows a same-grain
  count is trivially 1. Identity values get no n.
- **panther carries n through the table transform** (not app-side lookup
  maps): the transformer is the one place that authoritatively maps
  `(item, valueProp) → (row, col)`, so per-cell and per-header n are exact —
  no header-id ambiguity under grouped axes.
- **Header n shape**: `sampleN: { val, min, max, nMatrix }` (see Phase 2).
  `val` = first cell of the header's slice in final sorted order. Digested
  fields are roll-up-excluded; `nMatrix` is the raw matrix for apps that want
  their own policy.
- **Roll-up rule**: a roll-up header on the axis being decorated is a normal
  header with its own n (whole-sample count — falls out of the rollup query's
  own COUNT). Roll-up cells on the *perpendicular* axis are excluded from
  other headers' val/min/max (else a column that is constant across districts
  reads as "varying" because the national row's summed n sits in it). Reuses
  the `liveDomainExcludeIds` id list, generalized to match on both axes.
- **v1 display scope**: header decoration (col and/or row headers) via a new
  panther header textFormatter. No secondary columns, no per-cell display, no
  scorecard-mode support in v1 (per-cell `sampleN` lands on `TableCellInfo`
  anyway, so a cell-annotation policy is a later app-side choice).

## Phase 1 — Server: emit n columns

`server/server_only_funcs_presentation_objects/query_helpers.ts`:

1. `buildAggregateColumns` (both `main` and `rollup` modes — same function,
   so UNION ALL column parity is automatic):
   - For each non-identity value: also emit `COUNT(${prop}) AS __n_${prop}`.
   - When the metric has a postAggregationExpression (caller passes a flag or
     the ingredient list): also emit
     `COUNT(CASE WHEN <i1> IS NOT NULL OR <i2> IS NOT NULL ... END) AS __n_all`
     over the ingredient props.
   - Identity values: nothing.
2. `applyPostAggregationExpression`: the wrapper SELECT currently drops every
   inner column not re-projected. Add to its projection:
   `__n_all AS __n_<target>` (target = LHS of the expression, e.g. `value`).
   Per-ingredient `__n_*` columns need not survive the wrapper in v1.
3. Roll-up branch: no special handling — its COUNT runs at the rolled-up
   grain, so the roll-up row/column naturally carries the whole-sample n.

Notes:

- `__n_` prefix: add a check (module_loader validation or a startup assert)
  that no module-authored value prop starts with `__n_` — collision guard.
- Payload: n rides through `items` with zero schema changes
  (`jsonArrayItemSchema` is an open record). Charts/maps simply ignore the
  extra keys.
- **Bump `PO_CACHE_VERSION`** (`server/routes/caches/visualizations.ts`) —
  payload shape change for unmodified rows. Client IndexedDB busts on deploy
  automatically; dev needs a manual clear-site-data (pre-existing trap).
- Old stored FigureBundles lack `__n_*` keys → downstream lookups yield
  undefined → no display. No sweep needed (feature is new and off).

## Phase 2 — panther: n as a core Table feature

Work in the panther repo (`timroberton-panther`), typecheck there, then
`./sync` (stage wb-fastr changes FIRST so the sync diff stays isolated).

1. **`TableJsonDataConfig.nProps?: Record<string, string>`** — maps each
   valueProp to the prop holding its n. Explicit map, no naming magic;
   per-value entries cover multi-value / `--v` tables.
2. **Transformer** (`get_table_data.ts`): in the existing `fillDataArray`
   pass, fill a parallel **`nMatrix: (number | undefined)[][]`** from
   `obj[nProps[vp]]` at the same (row, col) assignment (null/non-numeric →
   undefined). Add **`TableDataTransformed.nMatrix?`** (optional-additive so
   pre-transformed stored data stays valid). Same orientation and final
   sorted index space as `aoa`.
3. **`TableCellInfo.sampleN?: number`** — populated from `nMatrix` in
   `buildTableCellInfo` (`measure_table.ts`).
4. **`TableHeaderInfo.sampleN?`** — populated in `getRowHeaderInfos` /
   `getColHeaderInfos` for row, col, AND group headers:

   ```ts
   sampleN?: {
     val: number;    // first cell of this header's slice, post-sort, roll-up-excluded
     min: number;    // over this header's slice, roll-up-excluded
     max: number;    // varies ⇔ min !== max
     nMatrix: (number | undefined)[][]; // full matrix, [rowIndex][colIndex], raw
   }
   ```

   - A col header's slice is its column (`nMatrix.map(r => r[index])`), a row
     header's is its row (`nMatrix[index]`), a group header's is its span.
   - val/min/max exclude cells whose *perpendicular* header id is in
     `liveDomainExcludeIds` (generalize the existing row-only semantics to
     both axes for this computation; the color-domain use keeps its current
     behavior). `nMatrix` is raw — includes roll-up cells; document the
     contrast in the type comment.
   - NB: `TableHeaderInfo` already has `n` (= count of items on the axis) —
     do not touch it; the new field is `sampleN`.
5. **Header textFormatter hook** — the missing piece that lets the app
   control header text (labels are currently fixed at transform time):
   - `content.tableColHeaders.textFormatter?: TableHeaderInfoFunc<string> | "none"`
     and same on `tableRowHeaders` (`_2_custom_figure_style_options.ts` +
     resolution in `style_func_types.ts`, parallel to
     `tableCells.textFormatter`).
   - Applied where `getColHeaderInfos`/`getRowHeaderInfos` build the mText:
     formatter receives the full `TableHeaderInfo` (incl. `sampleN`), returns
     the final label string; absent/`"none"` → existing label unchanged.
     Multi-line output works today (`\n` splits in the text measurer).

## Phase 3 — wb-fastr wiring

1. **Config field `s.showNValues: boolean`** (required, default false).
   Touch points (the four-place reality from research §5.2):
   - `lib/types/_presentation_object_config.ts` (`presentationObjectConfigSStrict`)
   - `lib/types/_metric_installed.ts` (`configSStrict`, optional)
   - `wb-fastr-modules` `_module_definition_github.ts` (`configSGithubStrict`)
     + re-run `vendor_schema`
   - Backfill block in
     `server/db/migrations/data_transforms/po_config.ts`
     (`if (!("showNValues" in s)) s.showNValues = false;` — follow the
     `allowVerticalColHeaders` precedent, incl. the skip-gate rules in
     PROTOCOL_APP_MIGRATIONS.md).
   - No `normalizePOConfigForStorage` entry, no `styleResets` entry
     (scorecard precedent): consumers gate on `config.d.type === "table"`.
2. **Data config** (`get_data_config_from_po.ts`,
   `getTableJsonDataConfigFromPresentationObjectConfig`): when
   `config.s.showNValues && resultsValue.hasFacilityLevelRows`, pass
   `nProps = { [prop]: "__n_" + prop }` for each effectiveValueProp.
3. **Style** (`get_style_from_po/`): header textFormatters implementing the
   display policy (see Open decisions), standard table mode only
   (`!isSpecialScorecardTableActive`). Formatting `(n=42)` — thousands
   separator via existing formatter funcs; "n" is language-neutral, no
   translation needed.
4. **Editor UI**
   (`presentation_object_editor_panel_style/_table.tsx`): plain `<Checkbox>`
   in the existing Display StyleSection, mirroring "Allow vertical column
   headers"; gated on table type + `hasFacilityLevelRows` (compute in the
   parent panel like `showScorecardMode`).
5. **Export parity** (`client/src/exports/get_table_export_aoa.ts`): header
   labels are read verbatim from the transformed groups today; apply the same
   header textFormatter to header/group labels so CSV/XLSX matches the render.
6. Out of scope v1: AI-tool exposure (no `s` field is AI-editable today),
   per-cell display, scorecard mode, secondary-column layout.

## Verification

- Phase 1: `deno run --allow-all -c deno.json` harness against a real
  project DB (read-only SELECTs) — plain AVG metric, PAE ratio metric, with
  and without roll-up; confirm `__n_*` values match hand-run SQL, confirm
  UNION parity.
- Phase 2: panther typecheck + a transform-level check (nMatrix alignment
  with aoa under sorting + groups + `--v`).
- Phase 3: `deno task typecheck`; browser check on an HFA-style table
  (constant n per facility-type column), an HMIS admin-area table with
  roll-up row (perpendicular exclusion), and a CSV/XLSX export.

## Open decisions (small, display policy only)

1. **v1 placement policy**: decorate col headers only, or col + row, or a
   simple auto rule (decorate the axis where n is constant; when both vary,
   show `val` per Tim's first-row default)? Leaning: col headers by default
   is the common case (facility types / indicators as columns); confirm
   before Phase 3 step 3.
2. **Varying display**: when a header's slice varies (min !== max), show
   `(n=42)` from `val` anyway, show nothing, or show a range? (All three are
   one-line changes in the app formatter; panther surface supports any.)
