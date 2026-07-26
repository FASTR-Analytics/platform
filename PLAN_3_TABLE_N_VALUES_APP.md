# PLAN: Table "n" Values — wb-fastr

Show sample sizes on table visualizations: server emits n alongside each value,
the client passes it to panther's table and appends `(n=…)` to column headers.

Depends on [PLAN_2_TABLE_N_VALUES_PANTHER.md](PLAN_2_TABLE_N_VALUES_PANTHER.md) for
display; Phase 1 (server) is independent and can land first. Correctness of n
on composite HFA indicators depended on the M10 composite-missingness fix
(result-gating + scoped sentinel bindings, see
[SYSTEM_05_facilities_indicators.md](SYSTEM_05_facilities_indicators.md)) —
committed 2026-07-25 (`07c8001f`) but **not yet deployed**, so n reports the
true denominator only once that ships. Background: `RESEARCH_ON_N_ISSUE.md`
(reference; this plan supersedes its open questions — delete it when this plan
closes).

## 0. For the implementing agent

**Status (verified 2026-07-26): nothing implemented.** Confirmed by grep — no
`showNValues` anywhere in `lib/` or `client/`, no `__n_` emission in
`query_helpers.ts`. Implement this plan as written.

- **Scope:** this repo plus the panther repo (via the companion plan). No
  `wb-fastr-modules` changes except running `vendor_schema` after the Phase 2
  github-schema edit, as Phase 2 already states.
- **Phase order is forced by the panther sync**, which only Tim can run:
  1. **Phase 1 (server)** and **Phase 2 (config)** — no panther dependency.
     Build and commit these first.
  2. **[PLAN_2_TABLE_N_VALUES_PANTHER.md](PLAN_2_TABLE_N_VALUES_PANTHER.md)** in
     the panther source repo.
  3. **Tim runs `./sync`.** Stage the wb-fastr changes from steps 1–2 first so
     the sync diff stays isolated.
  4. **Phase 3 (client wiring)** — references `nProps` and
     `tableColHeaders.textFormatter`, so it cannot typecheck before the sync.
     Do not start it earlier and do not stub the panther API to get green.
- **Verify by executing** (CLAUDE.md): Phase 1's SQL claims are settled with a
  `deno run --allow-all -c deno.json` harness against a real project DB using
  read-only SELECTs, not by reading the builder.
- Line anchors in this plan were checked 2026-07-26 but the repo is under
  active parallel work — re-grep each symbol before editing.
- **Take nothing in this plan on trust.** Every path, line number and status
  claim here is a measurement from a specific date, including the "nothing
  implemented" status above and the M10 deploy state below — re-confirm before
  acting. Where the plan and the repo disagree, **the repo is right and the plan
  is stale**; fix the plan in the same commit rather than coding to it. Check
  `git status` first: parallel work in this tree is normal, and errors you find
  may not be yours to fix.

### Known downstream rework (do not try to avoid it)

Phase 3 adds `datasetFamily` to
[metric_enricher.ts](server/db/project/metric_enricher.ts) purely so the editor
can hide the toggle where it would do nothing. The results-runs branch deletes
that probe-based enricher outright (`enrichMetric` becomes a manifest lookup),
so this field has to move to the run manifest's per-metric stamp when that
merges. This is accepted, recorded in SYSTEM_09 Open items, and is **not** a
reason to redesign the gate — the renderer self-gates on whether `__n_*` keys
are present in the items, so `datasetFamily` is only ever a UI affordance.

The Phase 1 server half needs no such rework: it rides the shared SQL builders
through the runs engine seam. One caveat for whoever runs the runs rollout —
Phase 1 introduces `COUNT(DISTINCT …) FILTER (WHERE …)`, and the results-runs
§2.4 dialect inventory explicitly recorded `FILTER` as *absent* from the S9 SQL
surface, so that construct needs a case in the golden-diff parity rig.

## Settled design

- **n is a survey concept, and the only survey data is HFA.** Emit it for HFA
  modules only. Not HMIS: its rows are a monthly facility panel, so a count over
  a table that doesn't group by period returns facility-months (40 facilities ×
  36 months → `n=1440`), which no reader interprets as a sample size. Not ICEH:
  pre-aggregated.
- **No forked query path.** `datasetFamily` is already a `QueryContext` field
  ([get_query_context.ts:80](server/server_only_funcs_presentation_objects/get_query_context.ts#L80),
  [types.ts:20](server/server_only_funcs_presentation_objects/types.ts#L20)),
  computed once per fetch, and the builder already branches on it
  ([cte_manager.ts:89](server/server_only_funcs_presentation_objects/cte_manager.ts#L89)
  picks `facilities_hmis` vs `facilities_hfa`). Scoping to HFA is one
  conditional inside `buildAggregateColumns`.
- **n = distinct facilities contributing to the denominator of the displayed
  statistic.** `AVG(prop)` / `SUM(prop)` → facilities with non-NULL `prop`;
  ratio `value = num / denom` → facilities with non-NULL `denom`. One rule, not
  a case per value func. `COUNT(DISTINCT facility_id)` rather than a row count
  is exact regardless of how the table groups (HFA rows are facility ×
  time_point, so a row count doubles across two survey rounds), and the HFA-only
  scope makes the DISTINCT cost a non-issue — an HFA results table is facilities
  × rounds, not a monthly panel.
- **Always server-computed.** No fetch-config field, no `hashFetchConfig`
  change, no new injection surface. Display is toggled client-side.
- **The client self-gates on the data.** No eligibility flag travels with the
  figure: set `nProps` whenever the toggle is on, and if the items carry no
  `__n_*` keys the matrix is empty, `sampleN` is omitted and labels render
  unchanged. Live and stored figures behave identically by construction. (The
  bundle's `ResultsValueForVisualization` is a strict three-field projection —
  `formatAs`, `valueProps`, `valueLabelReplacements?` — so a flag-based gate
  could not be evaluated by stored figures at all.)
- **v1 display policy** (ruled 2026-07-24): col-header formatter only; rows and
  groups are a later app-side change with zero panther work. The label always
  shows `(n=max)` over the header's slice, per the wb-client product manager; a
  constant slice shows its exact n since max equals it. No secondary columns, no
  per-cell display, no scorecard-mode support in v1 — per-cell `sampleN` lands
  on `TableCellInfo` anyway, so a cell-annotation policy stays a later app-side
  choice.
- **Roll-up**: a roll-up header on the decorated axis is a normal header with
  its own n (whole-sample count, straight out of the roll-up query's own
  aggregate). Roll-up cells on the *perpendicular* axis are excluded from other
  headers' digests — otherwise a column that is constant across districts reads
  as varying because the national row's n sits in it.

## Phase 1 — Server: emit n columns

[query_helpers.ts](server/server_only_funcs_presentation_objects/query_helpers.ts):

1. `buildAggregateColumns` (both `main` and `rollup` modes — same function, so
   UNION ALL column parity is automatic), **only when
   `queryContext.datasetFamily === "hfa"`**:
   - Non-PAE, per non-identity value:
     `COUNT(DISTINCT facility_id) FILTER (WHERE ${prop} IS NOT NULL) AS __n_${prop}`.
   - PAE metrics: one column over the denominator ingredient,
     `COUNT(DISTINCT facility_id) FILTER (WHERE ${denom} IS NOT NULL) AS __n_all`.
     The denominator token is already captured — `applyPostAggregationExpression`
     regex-replaces `/\s*(\w+)` to wrap divisors in `NULLIF(…, 0)`
     ([line 323](server/server_only_funcs_presentation_objects/query_helpers.ts#L323));
     reuse that capture rather than parsing the expression again.
   - Identity values: nothing.
   - The function needs the query context (or an explicit flag + denominator
     name) passed in; it currently takes only `(values, mode)`.
2. `applyPostAggregationExpression`: the wrapper SELECT drops every inner column
   not re-projected. Add `__n_all AS __n_<target>` (target = LHS of the
   expression, e.g. `value`). Per-ingredient `__n_*` need not survive the
   wrapper.
3. Roll-up branch: no special handling — the same aggregate runs at the
   rolled-up grain, and DISTINCT means a facility spanning sub-areas is counted
   once.

Notes:

- `COUNT(CASE WHEN … END)` is invalid SQL (no `THEN`) — use `FILTER (WHERE …)`,
  verified against the running pg.
- `__n_` prefix: assert (module_loader validation or a startup check) that no
  module-authored value prop starts with `__n_`.
- Payload: n rides through `items` with zero schema changes —
  `jsonArrayItemSchema` is an open record. Charts/maps ignore the extra keys.
- **Bump `PO_CACHE_VERSION`** ([visualizations.ts](server/routes/caches/visualizations.ts)):
  payload shape change for unmodified rows. Client IndexedDB busts on deploy;
  dev needs a manual clear-site-data (pre-existing trap).
- Old stored FigureBundles have no `__n_*` keys → no display, by the same
  self-gating rule. No sweep needed.
- [format_metric_data_for_ai.ts:274](client/src/components/project_ai/ai_tools/tools/_internal/format_metric_data_for_ai.ts#L274)
  does `Object.keys(items[0])` and pivots every non-dimension column, so
  `__n_*` would land in every AI metric-data CSV regardless of the display
  toggle. Filter the prefix there, or expose it deliberately as labelled sample
  size — decide, don't let it leak by default.

## Phase 2 — Config

1. **`s.showNValues?: boolean`** — optional, read as `?? false`. Direct
   precedent in the same schema: `mapShowRegionLabels` is optional and read that
   way at
   [_0_common.ts:217](client/src/generate_visualization/get_style_from_po/_0_common.ts#L217),
   with the editor checkbox bound `?? false` at
   [_map.tsx:81](client/src/components/visualization/presentation_object_editor_panel_style/_map.tsx#L81).
   Optional is what keeps historical figures valid: every stored slide, report
   and dashboard figure embeds a copy of the PO config inside `bundle.config`,
   and `transformFigureBlock` only repairs the pre-P2 `block.source.config`
   shape — a post-P2 bundle gets no backfill, so a *required* field would fail
   the sweep's final parse and abort boot. Verified: the transform is a no-op on
   a bundle-shaped block, and a missing required `s` field fails
   `presentationObjectConfigSchema`.
   - Historical figures simply have no n. That is also the honest end state:
     their stored `items` carry no `__n_*` either, so a backfilled `false` would
     render identically.
2. Touch points:
   - [_presentation_object_config.ts](lib/types/_presentation_object_config.ts)
     `presentationObjectConfigSStrict`
   - [_metric_installed.ts](lib/types/_metric_installed.ts) `configSStrict`
   - [_module_definition_github.ts](lib/types/_module_definition_github.ts)
     `configSGithubStrict` — the source of truth lives **here**; run
     `vendor_schema` from wb-fastr-modules afterwards, which copies wb-fastr →
     `wb-fastr-modules/.validation/`
   - [presentation_object_defaults.ts](lib/types/presentation_object_defaults.ts)
     `DEFAULT_S_CONFIG` — set `showNValues: false` so new POs are explicit
   - No migration block, no `normalizePOConfigForStorage` entry, no
     `styleResets` entry (scorecard precedent): consumers gate on
     `config.d.type === "table"`.

## Phase 3 — Client wiring

1. **Data config**
   ([get_data_config_from_po.ts](client/src/generate_visualization/get_data_config_from_po.ts),
   `getTableJsonDataConfigFromPresentationObjectConfig`): when
   `config.s.showNValues`, pass `nProps = { [prop]: "__n_" + prop }` for each
   `effectiveValueProp`. No eligibility check here — absent columns self-gate.
2. **Style** ([get_style_from_po/_1_standard.ts](client/src/generate_visualization/get_style_from_po/_1_standard.ts)):
   add `tableColHeaders.textFormatter` beside the existing `tableCells` entry
   (harmless for non-table figures). `sampleN` absent → label unchanged; else
   append `(n=${max})` (space-prefixed). Thousands separator via the existing formatter funcs;
   "n" is language-neutral, no translation needed.
3. **Editor UI**
   ([presentation_object_editor_panel_style/_table.tsx](client/src/components/visualization/presentation_object_editor_panel_style/_table.tsx)):
   plain `<Checkbox>` in the existing Display `StyleSection`, mirroring "Allow
   vertical column headers". Visible only for HFA metrics and only outside
   scorecard mode — the panel already receives the full `ResultsValue`
   (`p.poDetail.resultsValue`), so add `datasetFamily` at metric enrichment
   ([metric_enricher.ts](server/db/project/metric_enricher.ts), which already
   derives `hasFacilityLevelRows` the same way) and compute the gate in the
   parent panel like `showScorecardMode`. The renderer keeps self-gating on
   data; this flag exists only so the toggle isn't offered where it does
   nothing.
4. **Export parity**
   ([get_table_export_aoa.ts](client/src/exports/get_table_export_aoa.ts)):
   header labels are read verbatim from the transformed groups today. Read the
   resolved labels panther exposes (PANTHER plan §5) rather than re-deriving
   `sampleN` app-side.
5. Out of scope v1: AI-tool exposure (no `s` field is AI-editable today),
   per-cell display, scorecard mode, secondary-column layout.

## Verification

- Phase 1: `deno run --allow-all -c deno.json` harness against a real project DB
  (read-only SELECTs) — an HFA AVG metric and an HFA PAE ratio metric, with and
  without roll-up; confirm `__n_*` matches hand-run SQL, confirm UNION parity,
  confirm an HMIS metric emits no `__n_*` column at all.
- A table spanning two HFA time points without grouping by time point: n must be
  the facility count, not double it.
- Phase 2: boot the server against a project with existing slides/reports/
  dashboards and confirm the migration sweep still passes (the check the
  optional field is there to protect).
- Phase 3: `deno task typecheck`; browser check on an HFA table with a
  constant-n column and one with a varying-n column, an HFA table with a roll-up
  row (perpendicular exclusion), and a CSV/XLSX export matching the render.

## Closeout

When all three phases are in, **delete this plan file and
`RESEARCH_ON_N_ISSUE.md`**, and record the settled semantics in
SYSTEM_09 (the `__n_*` aggregate contract and the HFA-only scope) and
SYSTEM_10 (the v1 display policy: col-header formatter, `(n=max)` over the
header's slice, roll-up excluded on the perpendicular axis). The deferred v1
exclusions — row/group headers, per-cell display, scorecard mode, AI-tool
exposure — become SYSTEM_10 Open items, not a surviving plan.
