# PLAN: HFA variant dimension (per-indicator response-option breakdown)

Status: PROPOSED (not started). Designed with Tim 2026-07-28. Sequencing:
**after the results-runs merge** — PLAN_RESULTS_RUNS §2.4 replaces the
probe-based `metric_enricher` with a manifest lookup, so the viz-layer stage
here lands against the manifest model, not the probe list. The modules repo
(`wb-fastr-modules`) moves in lockstep at stage 3.

## Goal

Some HFA indicators have 2+ binary variants of one question — e.g. "Does the
facility provide vaccinations?" → through campaigns / through routine services
/ through both. Authoring each variant as its own indicator works today but
the variants can only be displayed *as* indicators. The goal: author them as
ONE indicator with per-variant numerator R code, and expose the variant as an
independent, display-groupable disaggregation dimension in visualizations —
including the cross (indicators as rows × variant items as columns).

## Decisions (settled)

**D1 — Separate results object (option 3).** Variant rows go to a NEW
`M10_hfa_results_variants.csv` results object with its own metric; the
existing `M10_hfa_results.csv` / m10-01-01 stay byte-identical. Rejected:

- *Variant varNames in the existing table + grouping column (option 1)*:
  `hfa_indicator` is required-and-grouped in every viz
  (`validate_display_slots.ts` "Required dimensions must stay grouped"; the
  editor locks required options), so the variant dimension is always displayed
  too and each variant intersects exactly one item → the parent × item cross
  degenerates to a diagonal. The single-parent breakdown it *can* do is
  achievable today with separate indicators — the option already rejected.
- *Shared varName + item column in the existing table (option 2)*: every viz
  (and every already-saved figure) not grouping/filtering the item column
  silently aggregates across variants (3–4× denominator → mean of
  percentages). Fixing that needs new default-filter invariant machinery in
  every HFA query path (main, roll-up union, possible-values) whose failure
  mode is silently wrong numbers. Not worth the nicer one-metric UX unless
  mixing overall + breakdown in a single figure becomes a hard requirement.

The separate-RO metric declares
`requiredDisaggregationOptions: ["hfa_indicator", "hfa_variant_item", "time_point"]`
— the existing enforcement lever makes the item dimension impossible to drop.
Precedent for a second RO with its own metrics: `M10_hfa_response_status.csv`.

**D2 — Parent identity in emitted rows.** Variant rows carry
`hfa_indicator = <parent varName>` and a new single-valued TEXT column
`hfa_variant_item = <item id>`. This is what makes the cross possible and
keeps variant names out of every viz-land picker/possible-values list.

**D3 — Overall value stays authored, and the feature is purely additive.**
The parent keeps its existing overall rCode and its rows/behavior in
`M10_hfa_results.csv` (current metric, carried, response status) unchanged.
Opting into a variant group only *adds* per-item numerator code feeding the
new RO. Overall is never derived from variants (ambiguous for numeric,
breaks for non-exhaustive items).

**D4 — Shared per-indicator plumbing.** Filter code (`rFilterCode`) is per
(indicator, time_point), shared by all items. Type and aggregation are the
parent's, applying to all items. Response status stays indicator-level (no
per-item status output). One group per indicator (nullable FK, like
category); each variant row carries exactly one item id.

**D5 — Plain groupable dimension.** `hfa_variant_item` goes in NONE of the
special registries (`FILTER_ONLY_…`, `MULTI_MEMBERSHIP_…`, `INTEGER_…`) in
`lib/validate_fetch_config.ts` — the generic physical-column path provides
GROUP BY / filter / replicant / blank-fold / possible-values with zero
query-engine code. This is `hfa_category` mechanics, not
`hfa_service_category` (which is multi-membership and filter-only).

## Open decisions

**O1 — Authoring storage** (both feed identical downstream stages via the
script generator; decide before stage 1):

- *(a) Real variant rows* in `hfa_indicators` (generated varNames, parent
  link + item tag; shared fields parent-owned — script gen reads
  type/aggregation/filter/labels from the parent row, never per-variant
  copies). Pro: code storage, syntax validation, sentinel bindings,
  dependency analysis, and the AI code-editing tools work on variants for
  free. Con: variant varNames enter the authoring namespace — indicator list
  UI, xlsx round-trip, `HfaTaxonomyForAI`, unused-variables each need a
  grouping/hiding rule, plus scaffold/delete lifecycle.
- *(b) One row + sibling code table*
  `hfa_indicator_variant_code(var_name, time_point, item_id, r_code)`.
  Pro: "one indicator" by construction, no namespace/lifecycle/drift
  surfaces. Con: script gen must expand per-item wide columns, and the
  editor, `hfa_r_code_validator`, dependency union graph, xlsx, and AI code
  tools all need explicit item-code support.

**O2 — Naming.** Working names in this plan: `hfa_variant_group` /
`hfa_variant_item` (entity tables `hfa_indicator_variant_groups` /
`hfa_indicator_variant_items`). The column name lands in SQL, CSV headers,
generated R, and the UI label switch — settle before stage 2.

**O3 — Item id constraints.** Item ids must be globally unique across groups
(value labels resolve through the flat `get_indicator_metadata` id→label
map, like sub-categories) and R/SQL-identifier-safe (they become wide-column
suffixes in generated R): enforce `^[a-z][a-z0-9_]*$` at creation and in the
xlsx import.

**O4 — Carried twin.** No `_carried` variant of the new RO initially; add
later if breakdown figures need carried rounds.

## The four stages

### 1. Indicator authoring

- Instance DB migration: `hfa_indicator_variant_groups(id, label, sort_order)`,
  `hfa_indicator_variant_items(id, group_id FK, label, sort_order)`,
  `hfa_indicators.variant_group_id` (nullable FK), plus O1's storage (columns
  or sibling code table). Template: migrations 042/051.
- Project DB migration: snapshot tables + copy in
  `server/db/project/datasets_in_project_hfa.ts` (DELETE-then-reinsert inside
  the integration transaction, alongside the category snapshots).
- `lib/types/hfa_types.ts`: group/item types, `HfaIndicator.variantGroupId`,
  workbook import types; `HfaTaxonomyForAI` gains groups/items.
- Client: group manager (clone `hfa_categories_manager.tsx`), code editor
  gains group select + per-item numerator slots (layout decision: item tabs
  inside the existing time-point selection — the surface is
  time_points × items), xlsx workbook sheets + import form, AI taxonomy
  formatting.

### 2. R script generation

- `getScriptWithParametersHfa`: emit per-item value columns (reuse
  `buildPerTimePointMutateExpression` per item with that item's snippets and
  the shared filter code); metadata frame gains `hfa_variant_item` and a
  parent mapping; dependency extraction unions item-code deps.
- `m010/script.R`: route rows — item rows (`hfa_variant_item != ''`, with
  `hfa_indicator` remapped to the parent) → `M10_hfa_results_variants.csv`;
  everything else exactly as today. Weighted sum/avg columns identical in
  shape to the main RO. Per-item denominators legitimately differ (each item
  gates on its own expression's NA) — this is correct, and per-item n-values
  (n = distinct facilities in the denominator, landed `eac81c66`) follow
  automatically.
- **Back-compat gate**: emit the new CSV/columns only when the *installed*
  definition declares the new RO (same pattern as `supportsResponseStatus` /
  `supportsServiceCategory` in `get_script_with_parameters_hfa.ts`) — ingest
  throws on CSV headers missing from `createTableStatementPossibleColumns`,
  and old installed definitions persist per project.

### 3. Results object + metric (wb-fastr-modules, lockstep)

- `m010/_results_objects.ts`: add `M10_hfa_results_variants.csv` — identity
  columns as the main RO + `hfa_variant_item TEXT NOT NULL`, values
  `sum_val/avg_num/avg_weight`.
- New metric file (e.g. `m10-03-01.ts`): same PAE as m10-01-01,
  `requiredDisaggregationOptions: ["hfa_indicator", "hfa_variant_item", "time_point"]`,
  label "HFA indicators by variant" (wording TBD), viz preset for the
  parent × item table. `deno task build` regenerates `definition.json`; ship
  with the app changes.

### 4. Viz layer (app)

- `lib/types/disaggregation_options.ts`: add `hfa_variant_item` (propagates
  to the runtime Set and both Zod enums).
- `lib/disaggregation_labels.ts`: label case (default fallthrough would show
  the raw column name).
- Availability: post-results-runs manifest equivalent of the
  `metric_enricher.ts` probe list.
- `get_indicator_metadata.ts`: fifth snapshot read (groups/items → flat
  id→label+sort map).
- Query rig: cases per PROTOCOL_APP_QUERY_RIG for group-by, filter, blank
  fold (non-applicable here — column is NOT NULL on this RO), replicant.
- AI: `format_metrics_list_for_ai.ts` taxonomy lines.
- No `PO_CACHE_VERSION` bump: a new RO/table rides `moduleLastRun`.

## Verification

- Generated-R inspection harness (`deno run --allow-all -c deno.json`) over a
  fixture indicator with 3 items × 2 time points; assert column set, CSV
  routing, and that the main CSV is byte-identical for non-opted indicators.
- Disposable module run on the dev instance (create+delete fixtures only);
  check both RO tables and the new metric's disaggregation options.
- Rig green; typecheck gate includes lint:systems.
