# PLAN_07: Every dimension's full value list

The possible-values reads stop at 500 values per dimension and answer `too_many_values` above that. On the sierraleone instance, which has more than 500 HMIS indicators, this leaves the figure editor with no way to filter indicators or to pick one as a replicant. This plan deletes the cap, so every read returns a dimension's full value list. Steps 1 to 3 make the three places that would show or send a long list handle one: the copilot's value lists, the editor's replicant picker and Explore's pinned-dimension selects. Step 4 deletes the cap.

**Next step: Do 1.**

Branch: `main`. Repos: this one. Read first: [CLAUDE.md](CLAUDE.md), [SYSTEMS.md](SYSTEMS.md), [SYSTEM_09_viz_query_cache.md](SYSTEM_09_viz_query_cache.md) "Disaggregation options" and "Caching", [SYSTEM_11_viz_authoring.md](SYSTEM_11_viz_authoring.md) "The Explore page", "Explore query model" and "Replicant machinery", [SYSTEM_13_ai_assistant.md](SYSTEM_13_ai_assistant.md) "Tool input schemas" and Open items, [SYSTEM_10_figure_render_export.md](SYSTEM_10_figure_render_export.md) "Editor/render divergence", [PROTOCOL_APP_QUERY_RIG.md](PROTOCOL_APP_QUERY_RIG.md).

## §0 How to work this plan

The instruction is "Do the next step of PLAN_07_UNCAPPED_DIMENSION_VALUES.md." Branch, floor, conditional gates, reading order and the review cadence are [PROTOCOL_APP_PLANS.md](PROTOCOL_APP_PLANS.md) and [panther/protocols/PROTOCOL_ALL_PLANS.md](panther/protocols/PROTOCOL_ALL_PLANS.md). The log is §6. The last step is 4.

### Vocabulary

- **the cap**: `MAX_REPLICANT_OPTIONS` (500) and everything that enforces or reports it: `REPLICANT_OPTIONS_QUERY_LIMIT`, `exceedsMaxReplicantOptions`, the `LIMIT` clauses of the possible-values query, and the `too_many_values` status.
- **value list**: the `{ id, label }[]` one possible-values read returns for one dimension.
- **metric info**: `ResultsValueInfoForPresentationObject`, a value list or a status for every dimension of one metric, built by `buildResultsValueInfo`.
- **replicant read**: `readRunReplicantOptions`, the value list of a figure's replicant dimension under the figure's filters and period.
- **AI value list**: a list of a dimension's values written into text the copilot reads.

## §1 The problem

**The cap.** `MAX_REPLICANT_OPTIONS = 500` ([consts.ts:8](server/server_only_funcs_presentation_objects/consts.ts#L8)). The possible-values query ends `LIMIT 502` ([possible_values_core.ts:267](server/server_only_funcs_presentation_objects/possible_values_core.ts#L267), 302, 308). Metric info sets `too_many_values` per dimension ([results_value_info_core.ts:54](server/server_only_funcs_presentation_objects/results_value_info_core.ts#L54)), and so does the replicant read ([run_data_reads.ts:487](server/run_query/run_data_reads.ts#L487)).

**What it was for.** The cap is in the initial commit (942ef169a), with no stated reason. There, filter options were drawn as plain chips in a 300px box and replicant options as a plain `SelectList`, neither with search, and the message read "Too many values (over 500) to display as filter options." The filter has since become a `MultiSelectSearch` for every list (`FILTER_SEARCH_THRESHOLD = 0`, [filters.tsx:45](client/src/components/_shared/figure_editor/editor_panel_data/filters.tsx#L45)). The comments at [run_data_reads.ts:345](server/run_query/run_data_reads.ts#L345) and [run_generation.ts:166](lib/api-routes/instance/run_generation.ts#L166) say the replicant list bounds a fan-out of one figure per value. No code renders one figure per value.

**What a dimension over 500 gets today.**

1. Editor filter: the checkbox can be ticked, shows "Too many values (over 500) to display as filter options." ([filters.tsx:593](client/src/components/_shared/figure_editor/editor_panel_data/filters.tsx#L593)) and stores `values: []`, which [get_fetch_config_from_po.ts:518](lib/get_fetch_config_from_po.ts#L518) drops.
2. Replicant picker: "Use filter options to narrow down" ([replicate_by_options.tsx:137](client/src/components/_shared/figure_editor/replicate_by_options.tsx#L137)), which item 1 blocks on the same dimension.
3. Custom value order: unavailable ([custom_value_order_section.tsx:139](client/src/components/_shared/figure_editor/editor_panel_style/custom_value_order_section.tsx#L139)).
4. The editor's axis format for an indicator metric falls back to `"number"` ([resolve_effective_indicator_facts.ts:119](lib/resolve_effective_indicator_facts.ts#L119)).
5. The AI validator skips the value check ([content_validators.ts:182](lib/ai_tools/content_validators.ts#L182)).
6. Explore: a pin over the cap shows a cap message and no data ([toolbar.tsx:96](client/src/components/explore/toolbar.tsx#L96), [explore_query.ts:287](lib/explore_query.ts#L287)).

**Size.** A value costs about 75 bytes of JSON, measured on the local packages (indicators 63, admin areas 78). 500 values come to about 37 KB, Nigeria's 8,809 wards to about 660 KB per value list.

**What would mishandle a long list once the cap is gone.**

- The three AI value lists write every value: [content_validators.ts:191](lib/ai_tools/content_validators.ts#L191), [assert_replicant_valid.ts:51](client/src/generate_visualization/assert_replicant_valid.ts#L51) and [format_figure_config_for_ai.ts:75](client/src/components/products/copilot/_shared/format_figure_config_for_ai.ts#L75).
- The replicant picker is a `SelectList` with no search ([replicate_by_options.tsx:190](client/src/components/_shared/figure_editor/replicate_by_options.tsx#L190)).
- An Explore pin is a native `<select>` ([toolbar.tsx:100](client/src/components/explore/toolbar.tsx#L100)).

## §2 The model

- `getPossibleValuesCore` returns every distinct value of the column under the filters and period it is given, with no `LIMIT`. Metric info and the replicant read answer `ok`, `no_values_available` or `error`. `too_many_values`, `MAX_REPLICANT_OPTIONS`, `REPLICANT_OPTIONS_QUERY_LIMIT` and `exceedsMaxReplicantOptions` do not exist.
- Each consumer that handled `too_many_values` takes the full list: the editor filter through its `MultiSelectSearch`, the replicant picker through its search box, custom value order through its modal's existing search, Explore pins through `SelectSearch`, and the format resolver and the AI validator directly.
- Every AI value list is written by one function, `formatValueListForAI`, which writes at most `AI_VALUE_LIST_MAX` values.
- The row caps are unchanged: `MAX_ITEMS` (20,000) per figure items read and `GRID_MAX_CELLS` (500,000) for the Explore data table.

## §3 Rulings

1. The cap is deleted, for every dimension and both reads. (Tim, 2026-11-18.)
2. No other ceiling replaces it. `facility_custom_1..5` are free text, so a column holding a different value for each facility returns a value list as long as the facility count. SYSTEM_09 states this as an accepted limit. _(proposed)_
3. Caches. `PO_CACHE_VERSION` goes from "29" to "30" with its history line: the Valkey `metric_info` and `replicant_opts` entries hold `too_many_values` payloads, and the version hash does not track code. The client caches `run_metric_info_v3` and `run_replicant_options_v3` become `_v4`: production clears client caches on a version change, but dev has no deploy, and a dev browser would keep serving a status no code handles. Neither status type has a zod schema or a stored copy, so there is no migration and no stored-figure sweep.
4. AI value lists. `formatValueListForAI(values, near)` in `lib/ai_tools/format_value_list_for_ai.ts` writes each value as `id (label)`, or `id` alone when the label equals the id. At or below `AI_VALUE_LIST_MAX` (500, the most named values any list held under the cap) it writes every value. Above it, it writes the values whose folded `id label` matches every search token of one of the `near` strings (`foldString`, `searchTokens` and `matchesSearch` from panther's `_000_utils`, the matcher every searchable list in the app uses), at most `AI_VALUE_LIST_MAX` of them, and states how many values exist and how many matched. `near` is what the copilot sent: the invalid filter values in the validator, and the selected replicant value, when there is one, in the replicant check and the figure description. _(proposed)_
5. Replicant picker search. A clearable search `Input` sits above the list when the list holds more than 20 values, and filters on the folded display label. The fold-and-filter and the threshold are one helper, `createFoldedSearch`, in `client/src/components/_shared/figure_editor/_shared/`, used by the replicant picker and by the custom-value-order modal, which holds the same code today ([custom_value_order_section.tsx:308](client/src/components/_shared/figure_editor/editor_panel_style/custom_value_order_section.tsx#L308)). _(proposed)_
6. Explore pins render as `SelectSearch`. The level, switch, period and grain selects stay `Select`. _(proposed)_
7. Query rig F9 becomes a dimension of 10,000 named values plus a blank, more than Nigeria's 8,809 wards. Metric info answers `ok` with 10,000 named values, and the replicant read returns all 10,000 ids with the blank last. The control row in PROTOCOL_APP_QUERY_RIG.md becomes "a `LIMIT` on the possible-values query", which turns F9 red. _(proposed)_

## §4 Steps

### Step 1: one bounded AI value list

**Surface.**

- `lib/ai_tools/format_value_list_for_ai.ts` (new)
- `lib/ai_tools/mod.ts`
- `lib/ai_tools/content_validators.ts`
- `client/src/generate_visualization/assert_replicant_valid.ts`
- `client/src/components/products/copilot/_shared/format_figure_config_for_ai.ts`
- `server/tests/format_value_list_for_ai_test.ts` (new)
- `SYSTEM_13_ai_assistant.md`

**Deliverable.**

- `formatValueListForAI` and `AI_VALUE_LIST_MAX` as ruling 4, exported through `lib/ai_tools/mod.ts`.
- The three AI value lists are written by it: `validateMetricInputsAgainstValueInfo`'s `Valid:` list (`near`: the invalid values), `assertReplicantValid`'s two `Valid values:` lists (`near`: the selected value, or none), and the figure description's `Available replicant values:` line (`near`: the selected replicant value, or none).
- The test file pins: a list of exactly `AI_VALUE_LIST_MAX` values is written whole; a longer list is written as only its matching values, with both counts; a longer list with no match gives the counts and no values; matching ignores case and accents; a value whose label equals its id is written as the id alone.
- SYSTEM_13's manifest lists the test file, and its "Layer-2 (data-dependent) validation" line says the value lists are bounded and how.

**Not in this step.** the cap, and a value-discovery tool for the copilot (SYSTEM_13 Open items).

**Gates.** `deno task test:files server/tests/format_value_list_for_ai_test.ts`.

**Ends with.** one commit.

### Step 2: search in the replicant picker

**Surface.**

- `client/src/components/_shared/figure_editor/_shared/folded_search.ts` (new)
- `client/src/components/_shared/figure_editor/_shared/mod.ts`
- `client/src/components/_shared/figure_editor/replicate_by_options.tsx`
- `client/src/components/_shared/figure_editor/editor_panel_style/custom_value_order_section.tsx`
- `SYSTEM_11_viz_authoring.md`

**Deliverable.**

- `createFoldedSearch` and its threshold as ruling 5, exported through `_shared/mod.ts`.
- `ReplicateByOptionsList` shows the search input when it holds more than 20 options, and its `SelectList` shows the options matching the input.
- `CustomValueOrderModal` uses the same helper and threshold in place of `MODAL_SEARCH_THRESHOLD` and its own fold-and-filter, with unchanged behaviour.
- SYSTEM_11 "Replicant machinery" describes the search.

**Not in this step.** `ReplicateByOptionsSelect`, and the `too_many_values` message in `ReplicantOptionsMessage` (step 4).

**Gates.** the floor.

**Ends with.** one commit.

### Step 3: searchable Explore pins

**Surface.**

- `client/src/components/explore/toolbar.tsx`
- `SYSTEM_11_viz_authoring.md`

**Deliverable.**

- Each pinned dimension's control is a `SelectSearch` at `size="sm"`, as ruling 6.
- SYSTEM_11 "The Explore page" says the pins are searchable selects.

**Not in this step.** `CapMessage` and its `Match` (step 4).

**Gates.** the floor.

**Ends with.** one commit.

### Step 4: delete the cap

**Surface.**

- `server/server_only_funcs_presentation_objects/consts.ts`
- `server/server_only_funcs_presentation_objects/possible_values_core.ts`
- `server/server_only_funcs_presentation_objects/results_value_info_core.ts`
- `server/run_query/run_data_reads.ts`
- `server/routes/caches/visualizations.ts`
- `lib/api-routes/instance/run_generation.ts`
- `lib/types/presentation_objects.ts`
- `lib/explore_query.ts`
- `client/src/state/products/t2_figure_data.ts`
- `client/src/state/products/t2_replicant_options.ts`
- `client/src/components/_shared/figure_editor/editor_panel_data/filters.tsx`
- `client/src/components/_shared/figure_editor/replicate_by_options.tsx`
- `client/src/components/_shared/figure_editor/editor_panel_style/custom_value_order_section.tsx`
- `client/src/components/explore/toolbar.tsx`
- `client/src/components/instance/copilot/build_system_prompt.ts`
- `query_rig/fixtures.ts`
- `query_rig/cases.ts`
- `server/tests/explore_query_test.ts`
- `SYSTEM_09_viz_query_cache.md`
- `SYSTEM_10_figure_render_export.md`
- `SYSTEM_11_viz_authoring.md`
- `PROTOCOL_APP_QUERY_RIG.md`

**Deliverable.**

- The three possible-values queries have no `LIMIT`. The blank sentinel still moves last, and its comment states only the SQL reason.
- `MAX_REPLICANT_OPTIONS`, `REPLICANT_OPTIONS_QUERY_LIMIT` and `exceedsMaxReplicantOptions` are deleted. `consts.ts` holds `MAX_ITEMS` and `GRID_MAX_CELLS`.
- `too_many_values` is gone from `DisaggregationPossibleValuesStatus`, `RunReplicantOptions` and `ExplorePin["status"]`, and from every branch that handled it: `buildResultsValueInfo`, `readRunReplicantOptions`, the editor filter, `ReplicantOptionsMessage`, the custom value order's `NOTE_TOO_MANY` and its branch, `resolvePin`, the toolbar's `CapMessage` and its `Match`, and the instance copilot's `formatResolvedSettings`.
- Comments that give the cap as a reason state the reason that remains: the `indicatorFormats` comment ([presentation_objects.ts:86](lib/types/presentation_objects.ts#L86)) cites the `error` and `no_values_available` holes; the status-loop comment ([results_value_info_core.ts:16](server/server_only_funcs_presentation_objects/results_value_info_core.ts#L16)); the `ExplorePin` comment ([explore_query.ts:89](lib/explore_query.ts#L89)); the custom value order's `OrderRow` comment; and the two fan-out comments of §1 say what the read is, the replicant dimension's value list under the figure's filters and period.
- The cache changes of ruling 3.
- Query rig F9 as ruling 7, its fixture named for what it now tests. The `dimStatus` status union in `cases.ts` loses `too_many_values`.
- `explore_query_test.ts`: the test "pin: a dimension over the cap has no value and no config" keeps only its `pending` half and is named for it.
- Docs: SYSTEM_09 "Disaggregation options" (the possible-values, cap and status paragraphs) states the full value list and ruling 2's accepted limit, and "Caching" names the `_v4` caches; SYSTEM_10 "Editor/render divergence" drops `too_many_values` from the cannot-enumerate statuses; SYSTEM_11 drops the cap from "The Explore page", "Explore query model" and "Replicant machinery"; PROTOCOL_APP_QUERY_RIG.md's control table has ruling 7's row in place of the `exceedsMaxReplicantOptions` row.

**Not in this step.** anything in §5.

**Gates.** `./validate_queries`; `deno task test:files server/tests/explore_query_test.ts`; at the close, `deno task test`.

**Ends with.** one commit, then the close commit that deletes this file.

## §5 Out of scope

- A bound on how many series or panes a figure draws. `MAX_ITEMS` (20,000 rows) stays the only bound.
- `FILTER_SEARCH_THRESHOLD = 0` in `filters.tsx` and the chip-cloud branches it makes unreachable.
- `ReplicateByOptionsSelect`, which nothing uses.
- Drawing only the visible rows of a long option list in panther's list components.
- The HMIS CSV import's limit of 2,000 distinct indicators per file.
- A value-discovery tool for the copilot (SYSTEM_13 Open items).

## §6 Log
