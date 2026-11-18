# PLAN_08: The copilot can look up a dimension's values

Status: STUB, to be fleshed out before `Do 1`.

The copilot can see a metric's dimension names but not, for most dimensions, their values. To set a filter it guesses a value and learns the right one from the validator's error text. This plan gives the copilot a way to look up the values of any dimension of a metric in the open package at the open scope.

**Next step: flesh out the plan.**

Branch: `main`. Repos: this one. Read first: [CLAUDE.md](CLAUDE.md), [SYSTEMS.md](SYSTEMS.md), [SYSTEM_13_ai_assistant.md](SYSTEM_13_ai_assistant.md) "Tool input schemas", "Layer-2 (data-dependent) validation" and Open items, [SYSTEM_09_viz_query_cache.md](SYSTEM_09_viz_query_cache.md) "Disaggregation options", [PROTOCOL_APP_AI_TOOLS.md](PROTOCOL_APP_AI_TOOLS.md).

## §0 How to work this plan

To be written: the bindings of [PROTOCOL_APP_PLANS.md](PROTOCOL_APP_PLANS.md), the last step, the vocabulary.

## §1 The problem

- [SYSTEM_13_ai_assistant.md:242](SYSTEM_13_ai_assistant.md#L242), the open item marked HIGH: `get_available_metrics` lists dimension names. It lists values only for ICEH and HFA ([format_metrics_list_for_ai.ts](lib/ai_tools/format_metrics_list_for_ai.ts)). No tool returns the values of `admin_area_2/3/4`, `facility_type`, `facility_ownership`, non-HFA `indicator_common_id`, `denominator`, `target_population` and the like.
- The values exist server-side, as metric info's `disaggregationPossibleValues`. `validateMetricInputsAgainstValueInfo` ([content_validators.ts](lib/ai_tools/content_validators.ts)) fetches them only to reject a bad value after the copilot has sent it.
- `get_metric_data` lists the values of a dimension the copilot groups by, up to 20 per dimension ([format_metric_data_for_ai.ts:396](lib/ai_tools/format_metric_data_for_ai.ts#L396)). The gap is the dimensions the copilot only filters on.
- With the possible-values cap removed, a dimension can hold thousands of values. `formatValueListForAI` writes at most `AI_VALUE_LIST_MAX` of them, chosen by closeness to what the copilot sent. On a long dimension, a guess that matches nothing gets counts and no values.

## §2 The model

To be written. The two fix directions in the open item are a lazy `get_dimension_values(metricId, disOpt)` tool, and a bounded value list added to the metric-list formatter. A lazy tool scales to long dimensions, and with a search argument it could reuse `formatValueListForAI`'s `near` matching.

## §3 Rulings

To be written.

## §4 Steps

To be written.

## §5 Out of scope

To be written.

## §6 Log
