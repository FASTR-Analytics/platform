# Axis-sort dispatcher

> **The work.** Replace the axis-sort patchwork in
> `client/src/generate_visualization/get_data_config_from_po.ts` with a single
> dispatcher keyed on what a dimension **is**, then land the two behaviour
> changes that were adjudicated onto it (chart `"none"` semantics, map sorts).
> All decisions below were ruled 2026-08-09; implement, don't re-litigate.

## Why

**Ordering is a property of the dimension, not of the axis.** The table
builder computes one `tableSort` and sprays it across all four axes, then
bolts exceptions on top. Six mechanisms now coexist: `tableSort` /
`customSortHeaders`, `getRollupAwareSort`, `getRollupPinOnlySort`,
`getPeriodAxisSort`, `customValueOrder`, and the dead `getChartIndicatorSort`.
The right shape is one `getAxisSort(dimension, context)` dispatching on the
dimension.

Two latent defects the patchwork still carries:

- On a scorecard, `{byIdOrder: indicatorIds}` is applied to **every** axis, so
  any non-indicator axis matches nothing, ties, and falls to the
  `localeCompare(label)` tie-break. Period axes made this visible (fixed);
  admin-area axes are in the same state and merely *look* right because
  alphabetical is a plausible answer there.
- `getChartIndicatorSort` is dead code — `sortIndicatorValues` is a required
  enum, so panther applies `sort.indicator` only on the paths that explicitly
  pass `sortIndicatorValues: undefined` (rollup pin, custom order, period).

## Current state (post-1.65.0 merge)

`getAxisSort(config, axisProp)` already composes the precedence for
series/lane/tier/pane axes: user `customValueOrder` wins, then chronological
`"by-id"` for period dims (`getPeriodAxisSort` — its doc comment is the
authoritative rationale for the fixed-width/by-id rule), then
rollup-aware/alphabetical. The table has its own inline variant (adds
`tableSort`, scorecard suppression, no-sort-for-absent-axis) and the chart
bars axis its own ternary chain. Panther needs nothing: `HeaderSortConfig`
already expresses every order used here, and the map transform already
honours `sort` when given one.

## The work

1. **Dispatcher refactor** — behaviour-identical. Fold the table's inline
   `axisSort` and the chart indicator chain into the one dispatcher; keep the
   load-bearing rules: an absent table axis gets NO sort (panther's group
   promotion carries `itemSort ?? groupSort`), and scorecard
   `customSortHeaders` suppresses `customValueOrder` but not the period rule.
   Verify against the existing harness cases before any behaviour change.
2. **Chart `"none"` = natural order** (Q1 remainder). `sortIndicatorValues`
   means "rank by value"; `"none"` means the dimension's natural order, not
   arbitrary Postgres row order. Period slice already shipped. Remainder:
   indicator dim → catalog `byIdOrder`, other real dims → `"by-label"`,
   `"--v"` keeps declared valueProps order (+ rollup pin). `customValueOrder`
   still wins; asc/desc untouched.
3. **Map sorts** (Q4). Maps currently pass no `sort` at all. Give pane/tier/
   lane the dispatcher's sorts — period dims chronological first, the rest
   per rule 2's natural order.

**Accepted consequence:** 2 and 3 retroactively reorder every existing
`"none"` chart and stored map at the deploy that ships them. Ruled acceptable
off the training window; do not weaken the rules to avoid it.

**Verification:** as before — execute panther's real transforms
(`getTableDataTransformed`, `getChartOVDataJsonTransformed`, map transform)
against configs reproducing each rule; typecheck + `./validate_queries`.

## Standing guardrails until the merged app deploys (post-training)

- `main` is parked at 1.65.0 for emergency hotfixes. Do **not** fast-forward
  it until the merged app is ready to deploy.
- Keep `wb-fastr-modules` `e758c69` **unpushed** — against 1.65.0's live
  schema it fails m007, m008, m010 (`formatAs: "indicator"`, m010's new
  disaggregation options), and `fetchModuleFiles` resolves from the default
  branch, so a push reaches every live instance. Deploy the merged app first,
  then push, then re-vendor the modules schema from this branch
  (`./vendor_schema` run from `main` breaks the modules repo — TS2345 at
  `build_definitions.ts:66`).
- While 1.65.0 is live: asset pins are collapsed to names and read from the
  instance uploads dir, so modules-repo authors must keep
  `name === basename(repoPath)`; rollback target is
  `timroberton/comb:wb-fastr-server-v1.64.7` (only consequence: the two
  hotfix bugs return); stored figures reordered/recoloured vs pre-training
  handouts — warn Angélica.
