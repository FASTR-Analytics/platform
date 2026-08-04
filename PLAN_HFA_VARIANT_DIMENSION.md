# PLAN: HFA variant dimension (per-indicator response-option breakdown)

Status: READY TO IMPLEMENT. All design decisions are settled (D1–D10 below,
with Tim, 2026-07-28 → 2026-08-04, including a 2-agent adversarial review
whose findings are folded in). This document is the complete spec — implement
it as written; open questions that survive contact with the code go to Tim
rather than being decided unilaterally.

## How to work (read before starting)

- **Two repos move in lockstep.** App: `wb-fastr` (this repo). Modules:
  `../wb-fastr-modules` (authored R modules; edit `_metrics/*.ts` /
  `_results_objects.ts` / `script.R`, then `deno task build` there regenerates
  `definition.json`). Stage 3 lives in the modules repo.
- **Read first**: `SYSTEM_08_results_packages.md` (results-package format,
  generation pipeline — authoritative), `SYSTEM_09_viz_query_cache.md` (query
  layer), `PROTOCOL_APP_MIGRATIONS.md` (migration recipe),
  `PROTOCOL_APP_QUERY_RIG.md` (adding rig cases),
  `panther/protocols/PROTOCOL_ALL_TYPESCRIPT.md` (code rules).
- **Gates**: `deno task typecheck` (app; includes lint:systems) must stay
  green; `./validate_queries` for rig runs (needs Docker).
- **Never**: modify `panther/`; create a git branch; commit without being
  asked. Expect unrelated parallel work in the working tree — leave it alone.
- **Deploy order is a hard constraint** — see "Back-compat & deploy order".

## Goal

Some HFA indicators have 2+ binary variants of one question — e.g. "Does the
facility provide vaccinations?" → through campaigns / through routine services
/ through both. Authoring each variant as its own indicator works today but
the variants can only be displayed *as* indicators. The goal: author them as
ONE indicator with per-variant numerator R code, and expose the variant as an
independent, display-groupable disaggregation dimension in visualizations —
including the cross (indicators as rows × variant items as columns).

## Decisions (settled — do not re-litigate)

**D1 — Separate results object (option 3).** Variant rows go to a NEW
`M10_hfa_results_variants.csv` results object with its own metric; the
existing `M10_hfa_results.csv` / m10-01-01 stay byte-identical. Rejected:

- *Variant varNames in the existing table + grouping column (option 1)*:
  `hfa_indicator` is required-and-grouped in every viz (the editor locks
  required options; the AI edit path enforces "Required dimensions must stay
  grouped" in `client/src/generate_visualization/validate_figure_config_edit.ts`;
  the server rejects non-grouped required dims in the items route), so the
  variant dimension is always displayed too and each variant intersects
  exactly one item → the parent × item cross degenerates to a diagonal.
- *Shared varName + item column in the existing table (option 2)*: every viz
  (and every already-saved figure) not grouping/filtering the item column
  silently aggregates across variants (3–4× denominator → mean of
  percentages). Fixing that needs default-filter invariant machinery whose
  failure mode is silently wrong numbers.

The separate-RO metric declares
`requiredDisaggregationOptions: ["hfa_indicator", "hfa_variant_item", "time_point"]`.
Precedent for a second RO with its own metric: `M10_hfa_response_status.csv`.
**Production prior art for the whole pattern**: m9's `strat`/`level` are plain
physical TEXT columns serving as required dims of 3-required metrics
(`m9-01-01`: `["iceh_indicator","level","year"]`) — the 3-required-grouped
slot layouts, generic query path, and availability stamping are all already
exercised in production.

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
(indicator, time_point), shared by all items. Type, aggregation, sentinel
bindings, and response status are the parent's, applying to all items. One
group per indicator (nullable FK, like category); each variant row carries
exactly one item id.

**D5 — Plain groupable dimension.** `hfa_variant_item` goes in NONE of the
special registries (`FILTER_ONLY_…`, `MULTI_MEMBERSHIP_…`, `INTEGER_…`) in
`lib/validate_fetch_config.ts` — the generic physical-column path provides
GROUP BY / filter / replicant / possible-values with zero query-engine code.
This is `hfa_category` mechanics, not `hfa_service_category`.

**D6 — Authoring storage: one indicator row + sibling code table.** No
variant rows in `hfa_indicators`. Schema (instance DB):

```text
hfa_indicator_variant_groups(id, label, sort_order)
hfa_indicator_variant_items(id PK globally unique, group_id FK, label, sort_order)
hfa_indicators.variant_group_id                  -- nullable FK
hfa_indicator_variant_code(var_name FK, time_point, item_id FK, r_code,
                           PK (var_name, time_point, item_id))
```

Why this over real variant rows: the failure mode of variant rows is a hiding
rule at every surface that iterates `hfa_indicators` (manager, xlsx,
`HfaTaxonomyForAI`, unused-variables, the run capture and every run-reader
downstream) — miss one and variant varNames leak into user-facing lists,
discovered by users. The code table's cost is explicit extensions at the
code-handling sites, where a miss means a variant lacks a feature —
discovered by the author at authoring time. "One indicator" and D4's
parent-ownership hold by construction: variants have no fields to drift. The
table mirrors the existing `hfa_indicator_code(var_name, time_point, r_code,
r_filter_code)` pattern, minus `r_filter_code` (shared, stays on the parent's
row). A merged table (item_id column + widened PK on `hfa_indicator_code`)
was considered and rejected: it makes every existing reader variant-aware on
day one; a separate table keeps the feature purely additive (D3).

Time_point stays in the key: each survey round has its own questionnaire, so
snippets reference round-specific variables — same reason all HFA code is per
(indicator, time_point). A round whose questionnaire lacks an item simply has
no code row for that (item, time_point) and the item drops out of that round
with its own denominator.

Integrity invariants (enforce in `server/db/instance/hfa_indicators.ts`, same
transaction as the triggering write):

- Changing/nulling an indicator's `variant_group_id` deletes its code rows
  whose `item_id` is not in the new group (else stale code silently
  re-activates on reassignment).
- `ON DELETE CASCADE` items → code rows; deleting a group that any indicator
  still references is refused.
- Every code row's item belongs to its indicator's current group — holds by
  construction given the two rules above; code writes validate it.

**D7 — Naming.** Tables as in D6; disaggregation column `hfa_variant_item`;
RO `M10_hfa_results_variants.csv`; metric `m10-03-01`; snapshot files
`hfa_indicator_variant_groups_snapshot.json` /
`hfa_indicator_variant_items_snapshot.json`.

**D8 — Item id + composed-name constraints.** Item ids: `^[a-z][a-z0-9_]*$`,
enforced at creation and xlsx import, and globally unique across ALL HFA id
namespaces — other items, indicator varNames, categories, sub-categories,
service-categories (labels resolve through one flat id→label map; a collision
silently mislabels).

Generated per-item wide columns are `<parent>__<item>`, and no charset rule
makes composition collision-free (varNames legally contain `__`; survey
variables are broader still). Two validations are therefore load-bearing, at
authoring time AND as a generation-time hard error:

- every composed name is unique against {all indicator varNames} ∪ {all
  survey variables} ∪ {all other composed names} — a collision silently
  corrupts the MAIN results (duplicate metadata keys → many-to-many join →
  inflated aggregates, or an overwritten raw question column);
- no composed name matches `/__status$/` — `script.R` collects response-status
  columns by that suffix pattern, so e.g. item id `status` would double-route
  into the status pivot (apply `isReservedHfaVarName`'s suffix rule to
  composed names; see `lib/hfa_r_code_analysis.ts`).

Routing/item-recovery in R is metadata-driven only — parent varName and item
id ride the metadata frame to rows via the join. Parsing the composed name is
NOT a permissible shortcut (no separator is unambiguous: parent `vacc_a` +
item `b` vs parent `vacc` + item `a_b`).

**D9 — No carried twin initially.** Add a `_carried` variant of the new RO
later if breakdown figures need carried rounds.

**D10 — Broken-variant skip semantics.** In STOP=FALSE (skip) mode, a variant
snippet that fails validation skips THAT ITEM ONLY (warning names indicator +
item + time point); the parent's overall code and main-CSV rows are never
affected — follows from D3 ("opting in only adds"). The skip-name extraction
regex (`^Indicator "([^"]+)"` in `get_script_with_parameters_hfa.ts`) must be
extended deliberately for item errors, not reused by accident — reusing the
parent's name there would skip the parent. Corollary, enforced at authoring:
an indicator with variant code must have overall code (a variant-only parent
is today silently discarded by the "no code" skip).

## Stage 1 — Indicator authoring (instance plane)

- Instance DB migration in `server/db/migrations/instance/` (next free
  number; current max is 067): the D6 schema. Templates:
  `042_hfa_indicator_categories.sql`,
  `051_hfa_indicator_service_categories.sql`. No project-DB migration —
  project mirror tables are frozen (results-runs Phase 3); the viz plane is
  fed by run-package capture in stage 2.
- `lib/types/hfa_types.ts`: group/item types, `HfaIndicator.variantGroupId`,
  variant-code type (parallel to `HfaIndicatorCode`, plus `itemId`),
  `HfaWorkbookImport` additions; `HfaTaxonomyForAI` gains groups/items.
- `server/db/instance/hfa_indicators.ts`: group/item/code CRUD + the D6
  integrity invariants + the D8 authoring-time validations + D10's
  "opted-in parent must have overall code". Routes:
  `server/routes/instance/hfa_indicators.ts` (register new routes in
  `route-tracker.ts` per `PROTOCOL_APP_ROUTES.md`).
- Client (`client/src/components/indicator_manager_hfa/`): group manager
  (clone `hfa_categories_manager.tsx`); the code editor gains a group select
  and per-item numerator slots (item slots inside the existing time-point
  selection — the surface is time_points × items, mapping 1:1 onto the code
  table's key); xlsx workbook sheets + import (`_xlsx_workbook.ts`,
  `hfa_indicators_xlsx_upload_form.tsx`). The unused-variables computation
  (`hfa_indicators_manager.tsx`, unions `extractRIdentifiers` over code rows)
  must union variant code too, else variables used only by variant snippets
  report as unused.

**Done when**: groups/items/code author round-trip through UI and xlsx; the
D6/D8/D10 invariants provably reject bad writes; typecheck green.

## Stage 2 — Run capture + R script generation

- `server/worker_routines/generate_run/prepare_inputs.ts` (HFA branch) +
  `computeDatasetHfaRunCapture` (`server/db/project/datasets_in_project_hfa.ts`):
  capture groups/items into the two D7 snapshot files + `extraInputFiles`
  (alongside the category captures); variant code + group assignments into
  `scriptInputs` (parallel to `scriptInputs.hfaIndicatorCode` — R code is
  generation-input only, never a package input file; the executed script is
  already captured as `___script___.R`). Capture queries need explicit
  `ORDER BY (var_name, time_point, item_id)` — script text feeds the module
  inputKey, so nondeterministic order churns memoized reuse.
- `server/server_only_funcs/get_script_with_parameters_hfa.ts`: emit per-item
  value columns (reuse `buildPerTimePointMutateExpression` per item with that
  item's snippets and the shared filter code — sentinel NA-ification composes
  per expression for free); metadata frame gains `hfa_variant_item` and a
  parent mapping (D8: metadata-driven routing, never name-parsing); run the
  D8 composed-name validations as a hard error. Dependency extraction unions
  item-code deps **excluding the parent itself** — an item snippet
  referencing its own parent (`vacc == 1 & q12 == 2`, a natural authoring
  pattern) must not create a self-edge, or `topologicalSort` reports a cycle
  and the whole run throws. The shared filter for an item's time point is
  looked up from ALL parent code rows, not `activeSnippets` (parents with
  empty `rCode` + non-empty `rFilterCode` are excluded from the latter); a
  variant code row for a time point with no parent code row at all is dropped
  with a warning.
- `wb-fastr-modules/m010/script.R`: variants get a SEPARATE pipeline (own
  metadata frame, own select/pivot, own write) rather than a write-time split
  of the shared long frame — that keeps the existing lines textually
  untouched, makes main-CSV byte-identity trivial, and structurally prevents
  the two silent failure modes: interleaved pivot columns reordering main
  rows, and the carried loop (which iterates the shared long frame) absorbing
  parent-remapped variant rows — silent aggregate inflation the ingest layer
  cannot catch (no new column). Item rows carry `hfa_indicator = <parent>` +
  `hfa_variant_item` → `M10_hfa_results_variants.csv`; weighted sum/avg
  columns identical in shape to the main RO. Per-item denominators
  legitimately differ (each item gates on its own expression's NA) — correct;
  per-item n-values (n = distinct facilities in the denominator, `eac81c66`)
  follow automatically.
- **The zero-variant case is first-class**: on day one nearly every instance
  has no variant groups while the new definition declares the RO, and
  `generate_run/execute_module.ts` hard-errors on a missing declared-RO file.
  The variant pipeline writes a header-only CSV when empty (same fallback
  pattern the response-status section uses), and the metadata splice must not
  produce mixed-length vectors.
- **Definition gate**: emit the new CSV/columns only when the resolved
  definition declares the new RO (same `moduleDefinition.resultsObjects.some`
  pattern as `supportsResponseStatus` in `get_script_with_parameters_hfa.ts`).
  This is what keeps generation at older pinned gitRefs byte-identical —
  wizard runs re-fetch definitions at their pinned refs, and parquet ingest
  (`server/run_query/write_results_object_parquet.ts`) hard-errors on
  undeclared CSV headers. The gate must cover item mutates, item columns,
  AND metadata item entries atomically — a partial gate that emits item
  columns without the metadata column produces composed varNames as fake
  indicators in the main table, which ingests cleanly. Module inputKeys
  change only for definitions declaring the new RO, so §3.7 memoized reuse is
  undisturbed for old refs.

**Done when**: the stage-2 items in Verification pass (harness assertions
including byte-identity as script text, zero-variant, collisions,
self-reference).

## Stage 3 — Results object + metric (wb-fastr-modules repo)

- `m010/_results_objects.ts`: add `M10_hfa_results_variants.csv` — identity
  columns as the main RO + `hfa_variant_item TEXT NOT NULL`, values
  `sum_val/avg_num/avg_weight`.
- New metric file `m010/_metrics/m10-03-01.ts`: same PAE as m10-01-01,
  `requiredDisaggregationOptions: ["hfa_indicator", "hfa_variant_item", "time_point"]`,
  label "HFA indicators by variant" (confirm wording with Tim), viz preset
  for the parent × item table. The preset must scope per category/group
  (replicant or filter, as m10-01-01's preset does with `hfa_category`): with
  2+ variant groups in one RO, an unscoped cross is block-sparse — each
  indicator blank outside its own group's columns.
- Update the vendored validation enum
  `wb-fastr-modules/.validation/disaggregation_options.ts` (add
  `hfa_variant_item`) — without it `deno task build` fails loudly.
- `deno task build` in the modules repo regenerates `definition.json`. Do NOT
  push the modules repo before the app deploys (see deploy order).

**Done when**: modules-repo build green; `definition.json` shows the new RO +
metric.

## Stage 4 — Viz layer (app)

- `lib/types/disaggregation_options.ts`: add `hfa_variant_item` to
  `ALL_DISAGGREGATION_OPTIONS` — **immediately after `hfa_indicator`**, not
  at the end: starting-config slot assignment follows list order, so
  appended-at-end would make the no-preset default table time_point=col /
  item=rowGroup instead of the headline indicator-row × item-col cross. Both
  Zod enums (`disaggregationOption` in `lib/types/_metric_installed.ts`,
  `disaggregationOptionGithub` in `lib/types/_module_definition_github.ts`)
  derive from the const automatically.
- `lib/disaggregation_labels.ts`: label case in
  `getDisaggregationOptionLabel` (the default fallthrough would show the raw
  column name). No entry in `getDisaggregationAllowedPresentationOptions`
  (unrestricted, like `hfa_category`).
- Availability: add `hfa_variant_item` to `PHYSICAL_DISAGGREGATION_COLUMNS`
  (`server/db/project/metric_enricher.ts`) — again immediately after
  `hfa_indicator`. Shared by `deriveAvailableDisaggregationOptions`
  (`server/runs/disaggregation_availability.ts`), which stamps the manifest
  at finalize. One edit serves both paths.
- `server/run_query/run_read.ts`: `getIndicatorMetadataFromRun` reads the two
  new snapshot files → flat item id→label+sort map;
  `getHfaTaxonomyFromManifestInputs` gains groups/items for the AI surface.
  Old packages lack the snapshot files and `readInputRows` returns `[]` for
  files absent from a manifest — graceful, no manifest schema-version bump.
  Do NOT extend `server_only_funcs_presentation_objects/get_indicator_metadata.ts`
  — it is the frozen pg twin (parity rig only, dropped in results-runs Phase
  4), and the new RO never exists in the pg plane.
- AI: `client/src/components/project_ai/ai_tools/tools/_internal/format_metrics_list_for_ai.ts`
  taxonomy lines for groups/items.
- Query rig: cases per `PROTOCOL_APP_QUERY_RIG.md` for group-by, filter,
  replicant (blank fold non-applicable — the column is NOT NULL on this RO).
  Confirm the rig's coverage holds for an RO with no pg-plane twin.
- No `PO_CACHE_VERSION` bump: caches fold `runId`, and the new RO exists only
  in packages generated after the change (new runIds → new keys).

**Done when**: a wizard-generated dev package stamps `hfa_variant_item`, the
new metric renders the cross in the PO editor, rig green, typecheck green.

## Back-compat & deploy order

- **App deploys BEFORE the modules repo pushes.** Definitions are
  zod-validated at fetch with no silent normalization;
  `requiredDisaggregationOptions` validates against
  `ALL_DISAGGREGATION_OPTIONS`, so a definition declaring `hfa_variant_item`
  against an app that lacks it makes m010 fail to load entirely (fetch-time
  parse error).
- **Old packages need nothing.** Absent snapshot files read as `[]`;
  additive fields + additive snapshot files only — no `manifestSchemaVersion`
  bump.
- **Mixed-package world is already handled**: packages from older module refs
  lack the new metric in their manifest catalog, and the attach-time
  compatibility report surfaces "metric absent" per authored visualization.
- **Rollback hazard after first generation**: `availableDisaggregationOptions`
  is a strict `z.enum` in the manifest schema and manifests parse strictly —
  once a package stamped with `hfa_variant_item` exists, rolling the app back
  to a build without the enum value makes that whole manifest unparseable
  (attached projects' run reads fail loudly). Rolling back past this feature
  also means detaching/deleting any packages generated with it.

## Related fixes already landed (do not redo; context only)

Two pre-existing gaps surfaced by the adversarial review were fixed on
tim-branch 2026-08-04, ahead of this plan:

- **Server-side requiredness guard**: the items route now rejects fetch
  configs missing a required dim (`findMissingRequiredGroupBys` in
  `server/run_query/run_read.ts`, called from the
  `getPresentationObjectItems` route). Two structural exemptions, both
  deliberate: time-based dims (the request is type-erased and legacy stored
  maps omit `time_point`), and only dims required by EVERY metric of the RO
  (metrics sharing an RO differ, e.g. m9 strat/level). `hfa_variant_item` IS
  enforced by this guard (unrestricted dim, sole metric on its RO).
- **Maps no longer force-drop `time_point`**: it now allows `"map"` in
  `getDisaggregationAllowedPresentationOptions`, so on maps it takes a
  display slot like any other dimension (pane/lane/tier/replicant — the map
  data path is fully generic). Stored map configs created before the fix
  still lack it until edited — accepted, no sweep (Tim's ruling 2026-08-04).

## Verification

- Generated-R inspection harness (`deno run --allow-all -c deno.json` with
  absolute-path imports, script in a scratch dir) over a fixture indicator
  with 3 items × 2 time points; assert column set, CSV routing, and — **as
  script text, byte-identical** — the generated script for a definition not
  declaring the new RO (text comparison is what catches a partial gate).
  Additional fixtures: zero variant groups (header-only CSV, no mixed-length
  metadata splice); a D8 collision fixture asserting the hard error (composed
  name vs varName, vs survey variable, and a `/__status$/` composition); an
  item snippet referencing its own parent (no cycle error).
- Disposable wizard run on the dev instance (create+delete fixtures only —
  never touch existing named rows): check both RO parquets, the new metric's
  options, and that the manifest stamps `hfa_variant_item` in the RO's
  `availableDisaggregationOptions`.
- Integrity invariants: group reassignment deletes out-of-group code rows;
  referenced-group delete refused; opted-in parent without overall code
  rejected.
- `./validate_queries` green with the new cases; `deno task typecheck` green
  in the app; `deno task build` green in the modules repo.
