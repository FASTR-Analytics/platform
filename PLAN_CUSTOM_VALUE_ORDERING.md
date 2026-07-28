# PLAN: Custom ordering of indicators & disaggregation values in visualizations

Status: PROPOSED (not started). Sequencing: **after the results-runs merge**
lands and the parity rig is green (does NOT need to wait for fleet rollout —
this is an additive style-layer feature, orthogonal to run identity).

## Decision

Custom order lives **per-visualization, in `config.s` (style layer)** — not in
`config.d`, not instance-level tables, not the run manifest.

- Order is pure render policy. Per the display-only-preferences rule
  (SYSTEM_09), it must never enter the fetch config, the SQL, or the cache
  hash. No refetch, no Valkey prefix bump, no migration (additive optional Zod
  field).
- Stored figures carry the bundle with style rebuilt at render (FigureBundle
  P2), so a custom order applies retroactively to stored slide/report figures.
- The manifest is NOT the home for this: it is written once and immutable, and
  enumerates dimensions/columns, not distinct values. User-editable order can't
  live in an immutable per-run artifact. Data-level indicator `sort_order`
  already travels via the run's `inputs/*.json` dictionaries.
- Instance-level *default* ordering (a value catalog + sort_order for facility
  type/ownership/custom values, moving the hardcoded HMIS list into the DB) is
  a separate, bigger feature. Defer unless someone asks for cross-viz defaults;
  alphabetical default + per-viz override covers the need.

## How ordering works today (verified 2026-07-28)

- The items query has **no ORDER BY** — rows come back in arbitrary
  HashAggregate order. All ordering policy is applied client-side in
  `client/src/generate_visualization/get_data_config_from_po.ts` via panther's
  `HeaderSortConfig`.
- Panther already supports everything needed:
  `{ byIdOrder: string[] }` (unranked ids sink to end, label tie-break),
  `{ base, first, last }` (used for the roll-up pin), and undefined = preserve
  input order (`panther/_001_render_system/header_types.ts`).
- Order sources today:
  - HMIS indicators: hardcoded 14-entry `_COMMON_INDICATORS` list in
    `lib/table_structures/indicators.ts` (applied to tables; bypassed on
    charts, see bug below).
  - HFA/ICEH/calculated indicators: real `sort_order` columns exist and reach
    `IndicatorMetadata`, but only the scorecard-table path
    (`buildIndicatorSortOrder` in `build_figure_inputs.ts`) consumes them —
    everywhere else falls to `"by-label"` alphabetical.
  - Facility type/ownership/custom: free-text columns on the facilities
    tables, values discovered by `SELECT DISTINCT`, no lookup table, no order
    source anywhere. Alphabetical.
  - Admin areas: alphabetical + roll-up sentinel pinned via `first`/`last`.
  - Maps: no sort config at all → raw data order.

## Pre-existing bug (fix first)

`s.sortIndicatorValues` is a required enum defaulting to `"none"`, and
`panther/_010_chartov/get_chartov_data.ts:140` (and chartoh twin) checks
truthiness — `"none"` is truthy, so **`sort.indicator` is never applied to
charts**. Chart indicator axes render in raw (unstable) SQL order today, and
any custom order would be silently bypassed on charts. App-side fix: translate
`"none"` → `undefined` in the data config, the way `pinIndicatorAxis` already
does.

## Work items

1. Fix the `sortIndicatorValues: "none"` truthiness bypass (app-side).
2. Add optional `s` field, e.g.
   `customValueOrder: { disOpt, orderedIds: string[] }[]` — additive, no
   migration, no cache bump.
3. Map it in `get_data_config_from_po.ts` to
   `{ byIdOrder: orderedIds }` (base fallback `"by-label"`) for whichever axis
   the disOpt occupies; compose with the roll-up `first`/`last` pin. Degrades
   gracefully when data gains/loses values.
4. Editor UI: "custom order" affordance per active disaggregation axis in the
   style panel → drag-to-reorder modal. Item list comes free from the existing
   possible-values query (deterministic post-merge via the branch's
   `Intl.Collator` re-sort). Copy the established drag-reorder pattern
   (`indicator_manager_hmis/sort_calculated_indicators_modal.tsx`, HFA category
   managers, slide list).

Estimated: a few focused days. No migrations, no cache bumps.

## Why after the merge

- Touches exactly the heaviest merge-traffic files: PO config schema,
  `get_data_config_from_po.ts`, `get_possible_values.ts`, S9 surface.
- Builds on ordering semantics the branch already changed: TS `Intl.Collator`
  re-sort of option lists (both engines) and the DuckDB executor's
  deterministic total order. Designing against main's collation-ordered base
  would mean re-validating post-merge.
