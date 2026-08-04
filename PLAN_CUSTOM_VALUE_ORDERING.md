# PLAN: Custom ordering of indicators & disaggregation values in visualizations

Status: IMPLEMENTED 2026-08-04 on tim-branch (typecheck + execution harnesses
green), then 3-agent adversarial review + fix batch applied same day.
Remaining: browser walkthrough of the editor affordance, then delete this
file.

## Review outcome (2026-08-04)

Persistence layer and sort seam held under adversarial review (both verified
by execution). Fixed same day: orphaned/stale orders now always visible +
clearable in the style section (with reason notes for too_many_values /
unavailable / not-displayed); inert states annotated (scorecard, sorted-by-
value on chart indicator axis + pie slices, no-display-position); single-value
dims suppressed; rows memoized with values built lazily; clear button
confirmed + aria-labeled; modal gains search + move-to-top/bottom above 20
items; file renamed `_custom_value_order.tsx`; sentinel-id schema refine
(byIdOrder rank map is last-wins, so a sentinel in orderedIds would defeat
the pin); duplicate-axis comment corrected.

Open rulings for Tim (deliberately NOT fixed):

1. AI surface: customValueOrder is invisible to AI projections and `config.s`
   is unpatchable by policy — first `s` field aliasing something the AI
   controls (ordering), so AI sort requests can silently lose to a hidden
   order (the inert-patch class).
2. Stale entries are kept latent (visible + clearable now, but never pruned
   on save) — consistent with the latent-rollup-flag policy; prune-on-save
   would be the alternative.

## Decision (unchanged)

Custom order lives **per-visualization, in `config.s` (style layer)** —
`customValueOrder: { disOpt, orderedIds: string[] }[]`, additive optional Zod
field (schema + both `.partial()` twins). Pure render policy: no fetch-config
change, no cache bump, no migration. Stored figures rebuild style at render, so
the order applies retroactively.

## Design rulings that changed at implementation (vs the 2026-07-28 draft)

1. **The "sortIndicatorValues none-truthiness bug" was NOT fixed — it had
   already been ruled deliberate** by the facility-rollup work: any string
   (incl. "none") keeps the chart indicator axis in DATA order because "--v"
   axes carry the module-defined valueProps order. Custom order instead rides
   the same seam `pinIndicatorAxis` uses: when a custom order targets the
   indicator-axis disOpt under "none", the app passes
   `sortIndicatorValues: undefined` + `sort.indicator: { byIdOrder }`.
   Verified by execution against panther's chartov.
2. **Roll-up pin composition**: panther has no `{ byIdOrder, first, last }`
   variant, so when the rolled-up dimension sits on a custom-ordered axis the
   sentinel ids are folded into the id order at the pinned end
   (`getCustomOrderSort`). Accepted degradation: with a bottom pin, values the
   data gained after the user ordered sink below the sentinel (alphabetical
   unranked sink) until re-ordered. No panther change.
3. **Pie** (didn't exist at drafting): slices = series axis, plain
   `{ byIdOrder }`; pie's panther gate already applies `sort.series` under
   "none". Pane/tier/lane axes also custom-orderable.
4. **Precedence**: scorecard `customSortHeaders` owns whole-table ordering
   (custom order inert in scorecard mode); asc/desc value sorting beats custom
   order on chart/pie (panther bypasses header sorts there); maps untouched
   (no sort config).

## Where it lives

- Schema: `lib/types/_presentation_object_config.ts` (+ twins in
  `_metric_installed.ts`, `_module_definition_github.ts`)
- Render mapping: `client/src/generate_visualization/get_data_config_from_po.ts`
  (`getCustomOrderForAxis` / `getCustomOrderSort` / `getAxisSort`)
- Editor UI: style tab "Custom value order" section, one row per displayed
  non-replicant dim with possible-values status "ok" →
  `presentation_object_editor_panel_style/custom_value_order.tsx`
  (SortableList modal, pre-sorted to render semantics)
