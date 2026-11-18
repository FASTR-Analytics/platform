# PLAN_09: What the copilot reads is bounded, and its lists are looked up

Text written for the copilot grows with an instance's data in two ways. Some lists are written whole whether or not the copilot asked for them: on the sierraleone instance, whose packages hold 1,591 HMIS indicators, the package block alone is 215,778 characters. Other values are written nowhere: for most dimensions the copilot sets a filter by guessing a value and learns the right one from the validator's error. This plan gives the copilot one lookup for the values of any dimension of a metric, bounds every list the copilot is given without asking, and bounds every read whose size follows the data: metric rows, module scripts and logs, and the record lists. It also shrinks four payloads the same review found: the authoring context's dataset entries, the manifest's copy of an import's staging result, the manifest's indicator catalog, stored once per module, and the catalog that every items read and stored figure carries whole. And it lets an HMIS indicator declare no direction.

**Next step: Do 5.**

Branch: `main`. Repos: this one. Read first: [CLAUDE.md](CLAUDE.md), [SYSTEMS.md](SYSTEMS.md), [SYSTEM_13_ai_assistant.md](SYSTEM_13_ai_assistant.md) "Principles" 2, "What a message carries" in "The client copilot", "Tools, view gating, and approval", "Tool input schemas", "System prompt, documents, prompt library", "The HFA tools" and Open items, [SYSTEM_09_viz_query_cache.md](SYSTEM_09_viz_query_cache.md) "Disaggregation options", [PROTOCOL_APP_AI_TOOLS.md](PROTOCOL_APP_AI_TOOLS.md). For steps 7 to 9, also [SYSTEM_08_results_packages.md](SYSTEM_08_results_packages.md) "Module settings and the run-keyed mounts" and "The results package format (authoritative)", and [PROTOCOL_APP_MIGRATIONS.md](PROTOCOL_APP_MIGRATIONS.md) "Run Manifest Transforms". For step 10, also [SYSTEM_09_viz_query_cache.md](SYSTEM_09_viz_query_cache.md) "SQL assembly", "Caching" and "FigureBundle: the capture side", [SYSTEM_10_figure_render_export.md](SYSTEM_10_figure_render_export.md) "The bundle shape", [SYSTEM_03_realtime_cache.md](SYSTEM_03_realtime_cache.md) on `PO_CACHE_VERSION`, [SYSTEM_16_collaboration.md](SYSTEM_16_collaboration.md) on the staleness rule, [PROTOCOL_APP_MIGRATIONS.md](PROTOCOL_APP_MIGRATIONS.md) "JSON Data Transforms" and [PROTOCOL_APP_QUERY_RIG.md](PROTOCOL_APP_QUERY_RIG.md). For step 11, also [SYSTEM_05_facilities_indicators.md](SYSTEM_05_facilities_indicators.md) "The four indicator dictionaries", [PROTOCOL_APP_MIGRATIONS.md](PROTOCOL_APP_MIGRATIONS.md) "SQL Migrations" and "Run Input Transforms", [PROTOCOL_APP_UI_CONVENTIONS.md](PROTOCOL_APP_UI_CONVENTIONS.md) and [panther/protocols/PROTOCOL_ALL_TRANSLATION.md](panther/protocols/PROTOCOL_ALL_TRANSLATION.md).

## §0 How to work this plan

The instruction is "Do the next step of PLAN_09_COPILOT_BOUNDED_READS.md." Branch, floor, conditional gates, reading order and the review cadence are [PROTOCOL_APP_PLANS.md](PROTOCOL_APP_PLANS.md) and [panther/protocols/PROTOCOL_ALL_PLANS.md](panther/protocols/PROTOCOL_ALL_PLANS.md). The log is §6. The last step is 11.

### Vocabulary

- **value info**: `ResultsValueInfoForPresentationObject`, a value list or a status for every dimension of one metric under one scope (`disaggregationPossibleValues`), read through `AIToolEnv.getResultsValueInfo`.
- **value list**: the `{ id, label }[]` value info holds for one dimension.
- **the lookup**: the tool `get_dimension_values`.
- **indicator dimension**: a member of `INDICATOR_DISAGGREGATION_OPTIONS` ([disaggregation_options.ts:42](lib/types/disaggregation_options.ts#L42)): `indicator_common_id`, `hfa_indicator`, `iceh_indicator`.
- **indicator facts**: what the package states about one indicator. HMIS: format, direction, thresholds, target and a calculated indicator's formula (`RunHmisIndicator`). HFA: measure, category, sub-category, service categories and variant group (`HfaTaxonomyForAI.indicators`). ICEH: category.
- **pushed list**: a list whose length follows the instance's data, written into text the copilot did not ask for by asking for that list: the package block, the overview, the metrics listing, a view's state, a figure's read-back, an error message.
- **the package block**: the text `buildPackageBlock` writes. **The overview**: the result of `/mcp`'s `get_overview`. **The metrics listing**: the text `formatMetricsListForAI` writes, the result of `get_available_metrics`.
- **the inline cap**: `AI_INLINE_LIST_MAX`, 100. The most entries a pushed list writes.
- **value page**: `AI_VALUE_PAGE_MAX`, 500. The most values one call of the lookup writes for a named dimension.
- **record page**: `AI_RECORD_PAGE_MAX`, 100. The most one-line records a record list writes in one call.
- **the row ceiling**: `AI_DATA_ROWS_MAX`, 1,000. The most CSV rows one metric data read writes.
- **text window**: the part of a module's script or log one call writes: whole lines, at most `AI_TEXT_WINDOW_MAX_CHARS` (40,000) characters, each line cut at `AI_TEXT_LINE_MAX_CHARS` (2,000).
- **the staging result**: `DatasetHmisVersion.stagingResult`, what one HMIS import recorded of its fetches.
- **the catalog**: a module's indicator catalog in the manifest, the `IndicatorMetadata` entries `getIndicatorMetadataFromRun` returns: the module's indicators and, for HFA, its category, sub-category, service-category and variant-item labels.
- **undeclared**: an HMIS indicator whose `direction` is NULL.

### Rules peculiar to this plan

- A step deletes everything its change leaves unused, in the same commit: functions, constants, types, parameters, imports, translations, fixtures, tests and the doc lines that describe them. A step's Deliverable names the leftovers known when the plan was written, and the rule covers any it missed. A review treats anything left unused as a finding. `panther/` is excluded: it is a synced library with other consumers.
- The bounds of steps 1 to 6 are applied where text is written for the copilot. No route, server read or cache changes its payload for one (ruling 14). Steps 7 to 10 change a payload, each under its own ruling.
- The sizes in §1 were measured on 2026-11-18. No step needs production access: every Deliverable is pinned by a test over a fixture.

## §1 The problem

### Measured

Every size below is from the sierraleone instance on 2026-11-18, package "2026-11-10 (2)", whose manifest holds 1,591 HMIS indicators and whose HFA mirror holds 499 HFA indicators. The texts were produced by running the app's own formatters (`buildPackageBlock`, `formatMetricsListForAI`, `getMetricDataForAI`, `formatValueListForAI`) over that manifest and its input mirrors. Sizes are characters.

| Text                                             | Size       | Of which                                                                     |
| ------------------------------------------------ | ---------- | ---------------------------------------------------------------------------- |
| The package block                                | 215,778    | 214,557 are the 1,591 indicator lines                                        |
| `get_available_metrics`                          | 73,481     | 55,636 are the HFA taxonomy; the 28 ready metrics are 17,844                 |
| `get_metric_data` for `m12-01-01` with no filter | 171,375    | 79,871 are the Dimension Summary; 90,973 are 1,591 CSV rows                  |
| A validator error on a dimension of 500 values   | 47,436     | the package's first 500 indicators as the value list, written whole          |
| `get_module_r_script` for m012                   | 664,247    | 306 lines, six of them between 75,712 and 141,377 characters (m010: 154,207) |
| `get_module_log` for m011                        | 1,503,451  | m001: 865,832                                                                |
| The authoring context's `datasets`, as JSON      | 10,716,315 | 10,715,445 are the HMIS import's `periodIndicatorStats`                      |

For scale: on sierraleone, nigeria and ghana, the smallest request logged in `ai_usage_logs` since 2026-11-13 is about 73,000 input tokens, which is the system prompt and the tools array with a short message.

HMIS indicators per instance (`indicators` rows), over the 39 instances on the server, seven of them testing instances: 31 hold at most 89. The others: zambia 123, tchad 126, ethiopia 171, nigeria 201, mauritanie 242, burkinafaso 284, uganda 672, sierraleone 1,641. HFA indicators, where a production or demo instance has any: tajikistan 224, demo 240, mali 421, nigeria 475, somalia 475, madagascar 476, guinee 497, sierraleone 499.

### Values the copilot cannot look up

- [SYSTEM_13_ai_assistant.md:242](SYSTEM_13_ai_assistant.md#L242), the open item marked HIGH. The metrics listing names each metric's dimensions ([format_metrics_list_for_ai.ts:94](lib/ai_tools/format_metrics_list_for_ai.ts#L94)) and writes values for the HFA and ICEH dimensions only.
- Value info holds every dimension's full value list (SYSTEM_09 "Disaggregation options"). The copilot's code reads it only to reject a value after the copilot has sent it ([content_validators.ts:172](lib/ai_tools/content_validators.ts#L172)).
- `get_metric_data` writes a grouped dimension's ids in its CSV, and lists them with labels and facts only up to 20 ([format_metric_data_for_ai.ts:396](lib/ai_tools/format_metric_data_for_ai.ts#L396)). Learning a dimension's values this way costs a data read of one row per value at least. `hfa_service_category` cannot be grouped ([format_metrics_list_for_ai.ts:201](lib/ai_tools/format_metrics_list_for_ai.ts#L201)).
- The package block lists every HMIS indicator of the package. That list is not a metric's value list: it is the whole dictionary, and the scope does not filter it ([authoring_context.ts:43](server/run_query/authoring_context.ts#L43)). Under a scope limited to 30 indicators it still lists 1,591, and it does not say which indicators a given metric holds. Value info is per metric and is read under the scope.
- Over 500 values, a filter value that matches nothing gets the counts and no values ([format_value_list_for_ai.ts:31](lib/ai_tools/format_value_list_for_ai.ts#L31)).

### Lists written whole

1. **The package block.** Every HMIS indicator on a line of its own ([build_system_prompt.ts:291](lib/ai_tools/build_system_prompt.ts#L291)), every ICEH indicator (301), and each of a scope's limits in full (358). The chat attaches the block to a message whenever its text is new to the conversation ([turn_logic.ts:120](panther/_110_ai_types/turn_logic.ts#L120)), so the whole list is sent on the first message in a package view and again for every other package or scope the user moves to.
2. **The overview.** `get_overview` writes the same sections ([mcp_tools.ts:100](server/mcp/mcp_tools.ts#L100)).
3. **The metrics listing.** The HFA taxonomy with every indicator ([format_metrics_list_for_ai.ts:254](lib/ai_tools/format_metrics_list_for_ai.ts#L254)) and each variant group's member ids (241). The ICEH indicator list and the stratifier table are written again under every ICEH metric (120), and the ICEH indicator list is in the package block too.
4. **The Dimension Summary.** For an indicator-format metric with more than 20 values of a dimension, every id is written again, grouped by format ([format_metric_data_for_ai.ts:435](lib/ai_tools/format_metric_data_for_ai.ts#L435)). On sierraleone every indicator's format is `number`, so the 79,871 characters say one thing.
5. **Errors.** The validator's `Valid:` list ([content_validators.ts:192](lib/ai_tools/content_validators.ts#L192)) and the replicant check's `Valid values:` lists ([assert_replicant_valid.ts:50](client/src/generate_visualization/assert_replicant_valid.ts#L50)) write every value up to `AI_VALUE_LIST_MAX`, 500 ([format_value_list_for_ai.ts:5](lib/ai_tools/format_value_list_for_ai.ts#L5)).
6. **A figure's read-back.** `Available replicant values:` writes up to 500 values ([format_figure_config_for_ai.ts:75](client/src/components/products/copilot/_shared/format_figure_config_for_ai.ts#L75)), and `get_slides` writes one read-back per figure ([simplify_slide_for_ai.ts:75](client/src/components/products/copilot/slide_ai/simplify_slide_for_ai.ts#L75)).
7. **Explore's state line**, which rides every message: every value the user chose for a laid-out category ([build_system_prompt.ts:349](client/src/components/instance/copilot/build_system_prompt.ts#L349)).

### Reads with no bound

- **Metric rows.** The only ceiling on a `get_metric_data` read is the figure renderer's `MAX_ITEMS`, 20,000 rows ([consts.ts:1](server/server_only_funcs_presentation_objects/consts.ts#L1)). `get_slides` writes the same read for every figure of a slide ([simplify_slide_for_ai.ts:87](client/src/components/products/copilot/slide_ai/simplify_slide_for_ai.ts#L87)).
- **Module scripts and logs.** `get_module_r_script` and `get_module_log` return the file ([modules.ts:52](client/src/components/instance/copilot/tools/modules.ts#L52), 67). m012's script holds the indicator dictionary three times, twice in comments.
- **Record lists.** `get_hfa_indicators` writes one line per indicator ([format_hfa_indicators_for_ai.ts:279](lib/ai_tools/format_hfa_indicators_for_ai.ts#L279)): 499 on sierraleone. `get_hfa_variables` writes one line per survey variable (555): 139 on sierraleone, 172 on guinee, 249 on somalia. `list_products` writes one line per product ([format_products_list_for_ai.ts:51](lib/ai_tools/format_products_list_for_ai.ts#L51)): 769 on nigeria, 444 on ethiopia, 436 on ghana, 273 on sierraleone.

### The package's dataset entries

Capture writes the HMIS import version whole into the manifest's `datasets[].info` ([hmis.ts:197](server/runs/capture_inputs/hmis.ts#L197)). The version holds the staging result ([dataset_hmis.ts:9](lib/types/dataset_hmis.ts#L9)), whose `periodIndicatorStats` has one entry per period and indicator pair: 131,306 on sierraleone.

- **In the manifest.** The staging result is 10,715,445 characters of sierraleone's `manifest.json`, a file of 29,500,503 bytes that the read path parses and caches ([manifest_cache.ts:16](server/runs/manifest_cache.ts#L16)). Nothing reads the staging result from a manifest. The manifest's `datasets` have three readers: `getRunDatasetsFromManifest` ([run_read.ts:420](server/run_query/run_read.ts#L420)), the summary transform, for each entry's type ([runs_summary.ts:57](server/db/migrations/data_transforms/runs_summary.ts#L57)), and manifest block 9. The import ledger keeps the staging result under the version id ([_main_database.sql:605](server/db/instance/_main_database.sql#L605)).
- **In the authoring context.** `getRunDatasetsFromManifest` copies each entry's `info`, so the authoring context carries the staging result to the client on every read. Its only reader is the package block, which writes each dataset's type and the HMIS version id ([build_system_prompt.ts:277](lib/ai_tools/build_system_prompt.ts#L277), from [build_system_prompt.ts:78](client/src/components/instance/copilot/build_system_prompt.ts#L78) and [context_cache.ts:303](server/mcp/context_cache.ts#L303)).

### The catalog the manifest stores

- The manifest's `indicators[]` holds one catalog per module ([run_manifest.ts:204](lib/types/run_manifest.ts#L204)), built module by module ([indicator_catalog.ts:244](server/runs/indicator_catalog.ts#L244)). The derivation reads nothing of a module but which family's mirrors it uses: the HFA branch, the ICEH branch, or the HMIS dictionary ([indicator_catalog.ts:301](server/runs/indicator_catalog.ts#L301)). Every HMIS module of a package therefore gets the same catalog.
- On sierraleone the manifest holds six identical copies of 513,869 characters, one for each of m001, m002, m005, m006, m011 and m012.
- The read path keeps up to 20 parsed manifests ([manifest_cache.ts:11](server/runs/manifest_cache.ts#L11)). Parsed, sierraleone's manifest holds 18.9 MB of heap today, 5.4 MB without the staging result, and 1.7 MB with one HMIS catalog. No response carries the copies: the only reader of `indicators[]` is `getIndicatorMetadataFromRun` ([run_read.ts:545](server/run_query/run_read.ts#L545)).
- A module's family is declared in its definition, and the derivation's branches agree with it for each of the eight modules in `wb-fastr-modules`: m010 is `hfa` by script type, m009 is `iceh` by data source, and the other six are `hmis`.

### The catalog in a read and in a stored figure

- `getPresentationObjectItemsFromRun` attaches the module's whole catalog, in its display fields, to every `ok` items holder ([run_read.ts:1026](server/run_query/run_read.ts#L1026)), and the Explore grid read passes it on ([run_data_reads.ts:276](server/run_query/run_data_reads.ts#L276)). A figure bundle is assembled with it ([resolve_figure_from_metric.ts:157](client/src/generate_visualization/resolve_figure_from_metric.ts#L157)) and stored with it ([_figure_bundle.ts:131](lib/types/_figure_bundle.ts#L131)).
- On sierraleone, m012's catalog in its display fields is 307,663 characters of JSON, carried by every read of an m012 metric. One stored slide there is 744,989 characters and holds the whole dictionary.
- A figure looks an entry up by a row's cell, by a filter value of its config or by its selected replicant value: for labels ([build_figure_inputs.ts:119](client/src/generate_visualization/build_figure_inputs.ts#L119)), for the catalog's order (122) and for the facts of the indicators on display ([resolve_effective_indicator_facts.ts:129](lib/resolve_effective_indicator_facts.ts#L129), 300). The comment at 125 gives the reason the bundle holds the whole catalog: an indicator pinned by a filter has no column in the rows.
- A run is immutable, so the run-keyed Valkey entries of an existing package change only with `PO_CACHE_VERSION` ([visualizations.ts:114](server/routes/caches/visualizations.ts#L114)).

### Direction

`indicators.direction` is `NOT NULL DEFAULT 'higher-is-better'` ([_main_database.sql:499](server/db/instance/_main_database.sql#L499)), and every indicator the DHIS2 forms create is written with that value ([indicators.ts:796](server/db/instance/indicators.ts#L796), 830). On sierraleone 1,625 of the 1,641 indicators are `higher-is-better`, and 1,375 of those have a label that names a death, a stillbirth or mortality. A stored `higher-is-better` cannot be told from one nobody chose. The package block writes it as the indicator's direction, and the base instructions tell the model that the declared direction "overrides any guess from the name" ([build_system_prompt.ts:528](lib/ai_tools/build_system_prompt.ts#L528)).

Outside a conditional-formatting rule, which carries its own `direction` key written from the column ([indicators.ts:99](server/db/instance/indicators.ts#L99)), the indicator's direction is read in three places: the text the copilot reads ([format_metric_data_for_ai.ts:491](lib/ai_tools/format_metric_data_for_ai.ts#L491)), the indicator editor and the dictionary download.

## §2 The model

- **One rule.** A list or a read whose size follows the instance's data is bounded wherever the copilot is given it without asking, and is complete only where the copilot asks for it, in bounded pages.
- **The lookup.** `get_dimension_values` writes the values of a metric's dimensions from value info: every dimension with its count and, up to the inline cap, its values; or one named dimension in value pages, searched. A value of an indicator dimension is written with its indicator facts. Both surfaces expose it.
- **Pushed lists.** Each is written whole up to the inline cap. Over it, the text states the count and names the lookup. The package block, the overview, the metrics listing, the scope lines, the validator's and the replicant check's errors, and Explore's state line all follow this. A figure's read-back states the selected replicant value and the count of values, never the list.
- **Metric data.** A read writes at most the row ceiling. Over it, the read writes its header and its dimension counts and no rows. The Dimension Summary writes no id twice: an indicator-format read states its format once when its rows share one, and in a `format` column when they do not.
- **Module scripts and logs.** A read writes one text window: the start of a script, the end of a log, the lines from a given line, or the lines that match a search.
- **Record lists.** `get_hfa_indicators`, `get_hfa_variables` and `list_products` write one record page and say how to read the next.
- **The authoring context** carries, for each dataset of the package, its type and, for HMIS, its version id.
- **The manifest** keeps, of an HMIS import version, its id and its row counts, and stores one indicator catalog per family its modules have.
- **The catalog.** An items read carries the catalog entries the read names: those whose id is a cell of a returned row or a value of one of the read's filters. A stored figure holds the entries its rows, its filters and its selected replicant value name.
- **Direction.** An HMIS indicator declares `higher-is-better`, `lower-is-better` or nothing. An indicator with a conditional-formatting rule declares one. Nothing writes a direction nobody chose, and text for the copilot states a direction only where one is declared.

## §3 Rulings

1. A list or a read whose size follows the instance's data is bounded wherever the copilot is given it without asking, and is complete only where the copilot asks for it. (Tim, 2026-11-18.)
2. **The lookup.** `get_dimension_values({ metricId, disOpt?, search?, offset? })` is a shared tool in `lib/ai_tools/tools_metrics.ts`, so the SPA and `/mcp` both expose it. It is a read, admitted in the package views, with no requirement. It reads value info through `env.getResultsValueInfo`, which the validators already read and the SPA already caches: no new route, and `AIToolEnv` is unchanged. Without `disOpt` it writes every dimension of the metric: the dimension's count and, when it holds at most the inline cap, its values. With `disOpt` it writes that dimension in value pages of 500, and `offset` is the number of values to skip. A value of an indicator dimension is written on a line of its own with its indicator facts, joined by id; any other value is written `id (label)`, or `id` alone when the label is empty or equals the id. (Tim, 2026-11-18.) An HFA indicator's facts include its variant group, so a search on the by-variant metric lists one group's members, and the metrics listing names that search for a member list over the inline cap. (Tim, 2026-11-18, on step 2's review.)
3. **Search and refusals.** `search` is a list of terms, at least one. A value matches when its line as written, facts included, holds every search token of one term (`foldString`, `searchTokens` and `matchesSearch` from panther, the matcher every searchable list in the app uses). Search is applied before paging, and the result states how many values the dimension holds and how many match. Without `disOpt`, the search runs in every dimension, and each dimension states its match count and writes its matches up to the inline cap. The lookup refuses with an `AIToolFailure`: a metric the package does not hold; a `disOpt` the metric does not have, naming the ones it has; `offset` without `disOpt`; an `offset` at or past the number of values to write. A dimension whose status is `no_values_available` or `error` is written as that. _(proposed)_
4. **The inline cap is 100.** The gap in the instances' HMIS indicator counts lies between 89 and 123, so 31 instances keep their indicator list in the package block and eight read theirs through the lookup. Every instance's HFA indicator list (224 to 499) is over the cap. (Tim, 2026-11-18.)
5. **The pushed lists.** Each is written whole at or under the inline cap. Over it, the text states the count, the entries that match what the copilot sent when it sent something (at most the inline cap), and names the lookup, with the metric and the dimension where the text has them. (Tim, 2026-11-18, for a to d. Item e, the member lists and the single home of the ICEH list are _(proposed)_.)
   - a. The package block and the overview: the HMIS indicator list, the ICEH indicator list, and each list of a scope's limits.
   - b. The metrics listing: the HFA indicator list, and each variant group's member list. Each category and sub-category line states how many indicators it holds, so the listing shows the taxonomy's shape when the indicators are not written. The ICEH indicator list leaves the listing: its one pushed home is the package block, as the HMIS list's is. The ICEH stratifier table is written once, not under each ICEH metric.
   - c. The validator's `Valid:` list and the replicant check's `Valid values:` lists. What the copilot sent is the invalid filter values, or the selected replicant value.
   - d. A figure's read-back writes the selected replicant value and the count of values. It never writes the list: `get_slides` writes one read-back per figure. It names no tool, since every figure write's result prints the same read-back and a write's result names no read tool; the descriptions of the reads that print it name the lookup. (Tim, 2026-11-18, on step 3's review.)
   - e. Explore's state line writes a laid-out category's chosen values up to the inline cap, and over it how many of the dimension's values are chosen.
6. **The Dimension Summary.** It keeps listing a dimension's values with labels and facts up to 20. It no longer writes ids grouped by format. An indicator-format read states its format in the header when every row shares one, and in a `format` column, after the dimension columns and before the value columns, when the rows hold more than one. The per-value notes no longer state the format: the header or the column is its one home. (Tim, 2026-11-18, for dropping the grouping in favour of one line or a column. The rest is _(proposed)_.)
7. **Constants.** `AI_INLINE_LIST_MAX` (100) and `AI_VALUE_PAGE_MAX` (500) live with the paging helper in `lib/ai_tools/read_bounds.ts`. `AI_VALUE_LIST_MAX` is deleted when its last reader, `formatValueListForAI`, takes the inline cap. One paging helper serves the lookup and the three record lists: it takes the entries, the offset and the page size, and returns the page and the sentence that says which entries are written, how many there are, and the offset of the next page. _(proposed)_
8. **The lookup and a figure's filters.** The lookup writes a metric's values under the scope and under no filter. The replicant check reads the values under the figure's own filters and period, so a value the lookup lists can still be refused for a figure; the refusal then lists the values near the one sent. The read-back's count is the replicant read's. _(proposed)_
9. **The row ceiling is 1,000**, applied by `formatItemsAsMarkdown`, so `get_metric_data`, a slide figure's data in `get_slides` and a new report figure's excerpt all take it. A read over the ceiling writes its header, the total row count, the Dimension Summary (which gives each dimension's count) and one line saying the read holds more rows than a read writes and how to narrow it. It writes no CSV and no partial rows: a comparison over some of the rows is a wrong claim about all of them. The items read, its route and its cache entries are unchanged, so the copilot's read of a figure's data stays the entry the figure itself reads. (Tim, 2026-11-18, that the rows are bounded in this plan. The number and the design are _(proposed)_.)
10. **Text windows.** `get_module_r_script` and `get_module_log` take `fromLine` and `search` beside `id`. With neither, a script is written from its first line and a log to its last, as many whole lines as the window holds. With `fromLine`, the lines from that line on. With `search` (terms as in ruling 3, matched per line), the matching lines, each with its line number, from `fromLine` when given. Every result opens with the file's line and character counts and the range of lines written, so the next window is `fromLine` set to the line after the last one written. A line over 2,000 characters is cut there, with its full length stated. One pure function in lib writes both tools' windows. (Tim, 2026-11-18, that both reads are bounded in this plan. The design and the numbers are _(proposed)_.)
11. **Record pages.** `get_hfa_indicators`, `get_hfa_variables` and `list_products` write a record page of 100 and take `offset`. `get_hfa_indicators` writes the taxonomy on the first page only. `list_products` also takes `search`, a text matched as the HFA tools' `search` is, over a product's label, type, folder path, package label and scope label. `list_products` was not among the reads Tim was shown: nigeria holds 769 products. (Tim, 2026-11-18, for the two HFA lists. `list_products`, the page size and the first-page rule are _(proposed)_.)
12. **Datasets.** `RunAuthoringContext.datasets` and `PackageGrounding.datasets` hold `{ datasetType: "hmis"; versionId: number } | { datasetType: "hfa" } | { datasetType: "iceh" }`. The client cache `run_authoring_context_v4` becomes `_v5`. The authoring context has no Valkey entry and no stored copy, so there is no other layer. The `RunDataset*Info` types stay: they type what capture writes into the manifest. (Tim, 2026-11-18, for the narrowing. The shape and the cache name are _(proposed)_.)
13. **Direction.** (Tim, 2026-11-18: the column is nullable with no default, in a new migration, and an undeclared direction is written nowhere. The items below are _(proposed)_.)
    - a. The migration sets `direction` to NULL on every row that is `higher-is-better` and has no conditional-formatting rule and no target. A `lower-is-better` row was chosen, and a row with a rule or a target was curated, so both keep their direction. The migration moves no `updated_at`, as migration 088 did not: this is not an edit to any indicator, and the stamps computed from `updated_at` are what a package records of the dictionary it was generated from.
    - b. A new constraint, `indicators_rule_direction_check`: `thresholds IS NULL OR direction IS NOT NULL`. A rule's bands have a good side, so an indicator with a rule declares its direction. The save route refuses a rule on an undeclared indicator with a message that names the Direction control.
    - c. The indicator editor's Direction control has three options: not set, higher is better, lower is better. A new indicator starts at not set. The DHIS2 select form and the DHIS2 id repair create undeclared indicators.
    - d. The dictionary download writes an empty cell, as its column comment already says. The catalog row and the `indicators.json` mirror row carry `direction: null`, as they carry `target: null`, and the mirror's row schema accepts it. A package generated after the migration states no direction for an undeclared indicator.
    - e. No transform rewrites an existing package. A package states the direction its dictionary held when it was generated, and an input block renames or recomputes and never drops a stored fact (PROTOCOL_APP_MIGRATIONS "Run Input Transforms"). For a package generated before the migration the copilot keeps reading the stored direction.
    - f. The three persistence layers: the `indicators` rows (the migration), the client cache `instance_indicators_v7` (becomes `_v8`, since the migration moves no stamp), and Valkey, which holds no copy of the dictionary. Step 11 moves neither `PO_CACHE_VERSION` nor `RUN_MANIFEST_SCHEMA_VERSION`: it changes no stored manifest, mirror or figure bundle, and `direction` is already optional in all three.
14. The bounds of steps 1 to 6 are applied where text is written for the copilot: in a lib formatter or a tool handler. No route, server read or cache changes its payload for one, because the same reads serve the app's own screens. _(proposed)_
15. [PROTOCOL_APP_AI_TOOLS.md](PROTOCOL_APP_AI_TOOLS.md) gains a section "Bounded reads" that states ruling 1 as the recipe for a new tool, with the constants and what each bounds. Step 1 writes it and each later step adds what it lands. _(proposed)_
16. **The staging result.** Capture stops writing it, and a manifest block deletes it from stored manifests, as block 9 deleted the keys nothing read. `RUN_MANIFEST_SCHEMA_VERSION` and `PO_CACHE_VERSION` each take their next value, as the block checklist requires. (Tim, 2026-11-18.) The manifest's HMIS entry keeps the version's `id`, `nRowsTotalImported`, `nRowsInserted` and `nRowsUpdated`. The other layers: no figure bundle holds a dataset entry, `runs.summary` reads each entry's type alone and is not touched, and the import ledger keeps the staging result under the id the manifest records. _(proposed)_
17. **The catalog a read carries.** An items read returns the catalog entries whose id appears in a returned row or in one of the read's filters, and the grid read carries the same. A data-transform block trims every stored figure with the same function. `PO_CACHE_VERSION` takes its next value, and `./validate_queries` is a gate. (Tim, 2026-11-18. The items below are _(proposed)_.)
    - a. An entry is kept when its id equals, as text, any cell of a row or any filter value. The test is wide on purpose: a cell that equals an id by coincidence keeps an entry nothing looks up, which costs one entry and breaks nothing. Kept entries stay in the catalog's order.
    - b. One pure function in lib computes it. The read gives it the returned rows and the fetch config's filters, which hold the replicant pin. The transform gives it a bundle's items, its config's filter values and its selected replicant value.
    - c. The whole catalog stays on the server, where the catalog-expression evaluation reads it.
    - d. The parse-only skip gate cannot see a bundle that holds more than it names, so each of the three sweeps (`slide_config`, `reports`, `visualizations`) also runs the transform for a row holding a bundle the function would shorten. A sweep bumps `last_updated` on a row it rewrites, as it does today, so a stored CRDT state is re-seeded from the trimmed content (SYSTEM_16, the staleness rule).
    - e. The client caches `run_po_items_v3` and `run_grid_items_v3` keep their names: an entry that holds the whole catalog is a correct superset.
    - f. Value info is unchanged. Its `indicatorFormats` and `indicatorRules` hold one entry per catalog indicator that declares a format or a rule, and its value lists already hold every indicator of the metric.
18. **One catalog per family.** The manifest's `indicators[]` holds one entry per family the package's modules have, `{ family, indicators }`, in place of one per module. `getIndicatorMetadataFromRun` finds a module's catalog by the module's family. `RUN_MANIFEST_SCHEMA_VERSION` and `PO_CACHE_VERSION` each take their next value. (Tim, 2026-11-18. The items below are _(proposed)_.)
    - a. `buildRunIndicatorCatalog` takes the families and derives one catalog for each, branching on the family. The branches on a module's script type and data sources are deleted.
    - b. Finalize passes its modules' declared families. Manifest block 1, which recomputes the catalog on every forced pass and runs before block 11 stamps a legacy blob's `family`, passes each module's declared family or, for a blob written before the declaration, the family the frozen legacy map gives its id. A module id the map does not hold throws there, as it does in block 11.
    - c. Block 1's recompute writes the new shape, so the new manifest block only stamps the version, as blocks 7, 8, 10 and 12 do.
    - d. No figure bundle and no client payload holds the manifest's catalog structure, so the `PO_CACHE_VERSION` bump is the checklist's and nothing else moves.

## §4 Steps

### Step 1: the lookup

**Surface.**

- `lib/types/ai_input.ts`
- `lib/ai_tools/read_bounds.ts` (new)
- `lib/ai_tools/format_dimension_values_for_ai.ts` (new)
- `lib/ai_tools/format_value_list_for_ai.ts`
- `lib/ai_tools/format_metric_data_for_ai.ts`
- `lib/ai_tools/build_system_prompt.ts`
- `lib/ai_tools/tools_metrics.ts`
- `lib/ai_tools/copilot_catalogue.ts`
- `lib/ai_tools/mod.ts`
- `client/src/components/instance/copilot_tools.ts`
- `client/src/components/products/copilot/ai_tools/tools/slides.tsx`
- `server/mcp/context_cache.ts`
- `server/mcp/mcp_tools.ts`
- `server/mcp/mcp_endpoint.ts`
- `server/tests/dimension_values_for_ai_test.ts` (new)
- `server/tests/copilot_catalogue_test.ts`
- `SYSTEM_08_results_packages.md`
- `SYSTEM_13_ai_assistant.md`
- `PROTOCOL_APP_AI_TOOLS.md`
- `USER_GUIDE_MCP.md`

**Deliverable.**

- `read_bounds.ts` holds `AI_INLINE_LIST_MAX`, `AI_VALUE_PAGE_MAX` and the paging helper of ruling 7, exported through `lib/ai_tools/mod.ts`.
- `AiDimensionValuesQuerySchema` in `ai_input.ts`: `disOpt` is `configDStrict`'s own `disOpt`, `search` an array of strings with `.min(1)`, `offset` a non-negative integer.
- A pure formatter in `format_dimension_values_for_ai.ts` writes the lookup's text from the metric, its value info, the query and the package's indicator facts, as rulings 2 and 3. It opens with the metric's id and label and its period coverage line, worded as `get_metric_data` words it.
- One function writes an HMIS indicator's line (`id: label [facts] = formula`) for both the package block and the lookup.
- `getSharedToolsForMetrics` takes the package's `hmisIndicators` and returns three tools. The SPA passes the authoring context's list, `/mcp` the one its package context already builds, and both template sets an empty one.
- `get_dimension_values` is in `COPILOT_TOOL_VIEWS` (the package views) and `COPILOT_TOOL_REQUIREMENTS` (`none`), and in the catalogue test's `package_reads` group.
- The texts that say where a filter value comes from name the lookup: `AiMetricQuerySchema`'s `filters`, `AiFigureFromMetricSchema`'s `selectedReplicant` and `filters`, and `get_metric_data`'s description, which no longer offers itself for checking the values available to a filter.
- `/mcp`: the overview's lines, the no-pin message and the endpoint's instructions name three package tools. The overview tells the model to take filter values from the lookup.
- The test file pins: every dimension written with its count; a dimension at the inline cap written whole and one over it written as its count; a named dimension of exactly `AI_VALUE_PAGE_MAX` values written in one page; a longer one written as its first page with the next offset, and its second page from that offset; a search that narrows before paging, with both counts; a search with no match; a search without `disOpt` stating each dimension's match count; matching that ignores case and accents and reads the facts; an HMIS, an HFA and an ICEH indicator each written with its facts; a value with no facts written `id (label)`; each refusal of ruling 3; a `no_values_available` and an `error` dimension.
- Docs. SYSTEM_13: principle 2 counts three shared metric tools and six `/mcp` tools, and its sentence that a separate indicator-dictionary tool was considered and dropped is replaced by what the lookup is; "Tool input schemas" names the new schema; the Open item marked HIGH on undiscoverable values is deleted; the manifest lists the new test. PROTOCOL_APP_AI_TOOLS.md gains "Bounded reads" with ruling 1, the two constants and the lookup. USER_GUIDE_MCP.md counts six tools and lists the lookup with the metric tools.

**Not in this step.** Any pushed list: the package block, the listing and the errors still write what they write today (steps 2 and 3). `AI_VALUE_LIST_MAX` stays until step 3.

**Gates.** `deno task test:files server/tests/dimension_values_for_ai_test.ts server/tests/copilot_catalogue_test.ts`.

**Ends with.** One commit.

### Step 2: the grounding's lists

**Surface.**

- `lib/ai_tools/build_system_prompt.ts`
- `lib/ai_tools/format_dimension_values_for_ai.ts`
- `lib/ai_tools/format_metrics_list_for_ai.ts`
- `lib/ai_tools/read_bounds.ts`
- `lib/ai_tools/tools_metrics.ts`
- `lib/types/hfa_types.ts`
- `client/src/components/instance/copilot/build_system_prompt.ts`
- `client/src/components/instance/copilot/ai_debug_panel.tsx`
- `server/tests/copilot_prompt_test.ts`
- `server/tests/dimension_values_for_ai_test.ts`
- `server/tests/format_metrics_list_for_ai_test.ts` (new)
- `SYSTEM_11_viz_authoring.md`
- `SYSTEM_13_ai_assistant.md`
- `PROTOCOL_APP_AI_TOOLS.md`
- `USER_GUIDE_MCP.md`

**Deliverable.**

- The package block and the overview write the HMIS and the ICEH indicator lists as ruling 5a: whole at or under the inline cap, and over it one line with the count that names the lookup, the dimension to pass and the facts it writes.
- Each list of a scope's limits is written as ruling 5a. Over the cap the line states the count and says the lookup lists what a metric holds under the scope.
- The metrics listing as ruling 5b. The HFA block keeps its column guide, its categories and sub-categories (each with its indicator count), its service categories, its variant groups and items, and its time points. Its indicator list and each variant group's member list follow the inline cap. No ICEH indicator is written in the listing, and the ICEH stratifier table is written once, in a section of its own before the modules, when the package has an ICEH metric.
- `formatMetricsListForAI` no longer takes the ICEH indicators: `getSharedToolsForMetrics` and the debug panel no longer pass them to it. The parameter stays on `getSharedToolsForMetrics`, which the lookup reads.
- The base instructions' "Use the declared direction first" paragraph says where an indicator's direction, thresholds and target are written: the package block's list when the package's indicators fit there, `get_metric_data`'s Dimension Summary, and the lookup.
- Explore's state line as ruling 5e.
- `copilot_prompt_test.ts` pins: a package of `AI_INLINE_LIST_MAX` HMIS indicators lists every one; a package of one more writes the count, names `get_dimension_values` and writes no indicator line; the same pair for ICEH; a scope limit over the cap; the paragraph of the base instructions.
- The new test file pins: an HFA taxonomy at the cap lists its indicators; one over it writes the count, names the lookup and writes no indicator line; each category line carries its count; a variant group's members over the cap are a count; the stratifier table appears once with two ICEH metrics; no ICEH indicator id appears in the listing.
- Docs. SYSTEM_13: principle 2's account of what `buildPackageGroundingSections` lists and of the metrics listing; "What a message carries" and "System prompt, documents, prompt library" where they describe the package block's indicator lists and the scope lines; the manifest lists the new test. PROTOCOL_APP_AI_TOOLS.md "Bounded reads" states the pushed-list rule. USER_GUIDE_MCP.md says what the overview carries for a package over the cap.

**Not in this step.** The errors, the read-back and the Dimension Summary (step 3). The package block's "Loaded datasets" lines (step 7). What an undeclared direction reads as (step 11).

**Gates.** `deno task test:files server/tests/copilot_prompt_test.ts server/tests/format_metrics_list_for_ai_test.ts server/tests/dimension_values_for_ai_test.ts`.

**Ends with.** One commit.

### Step 3: the lists in tool results

**Surface.**

- `lib/ai_tools/format_value_list_for_ai.ts`
- `lib/ai_tools/read_bounds.ts`
- `lib/ai_tools/content_validators.ts`
- `lib/ai_tools/format_metric_data_for_ai.ts`
- `client/src/generate_visualization/assert_replicant_valid.ts`
- `client/src/components/products/copilot/_shared/format_figure_config_for_ai.ts`
- `client/src/components/products/copilot/ai_tools/tools/figure_editor.ts`
- `client/src/components/products/copilot/ai_tools/tools/get_slides.ts`
- `client/src/components/products/copilot/ai_tools/tools/report_editor.ts`
- `server/tests/format_value_list_for_ai_test.ts`
- `server/tests/format_metric_data_for_ai_test.ts`
- `SYSTEM_09_viz_query_cache.md`
- `SYSTEM_13_ai_assistant.md`
- `PROTOCOL_APP_AI_TOOLS.md`
- `TESTING_SCRIPT_FOR_AI_COPILOT.md`

**Deliverable.**

- `formatValueListForAI` writes a list whole at or under the inline cap, and over it the count and the matches, at most the inline cap. `AI_VALUE_LIST_MAX` is deleted.
- One function writes the sentence that names the lookup for a metric and a dimension. The validator's error and both of the replicant check's errors end with it when their list is over the cap.
- A figure's read-back as ruling 5d: `Selected replicant:` with the value's id and label, and one line with the count of values. The `Available replicant values:` line is gone. A replicant read that is not `ok` is still written as its status.
- The Dimension Summary as ruling 6. `groupIdsByFormat` is deleted. The header's format line says the one format, or that the `format` column gives each row's, with the notes on percent fractions and scaled rates where a row can be either.
- `format_value_list_for_ai_test.ts` pins the inline cap in place of 500: a list of exactly the cap whole, a longer one as its matches with both counts, no match, nothing to match, more matches than the cap, case and accents, and a value whose label equals its id.
- `format_metric_data_for_ai_test.ts` pins: an indicator-format read whose rows share a format states it once and has no `format` column; one whose rows hold two formats has the column, between the dimension and the value columns; a dimension of more than 20 values writes its count and no id outside the CSV.
- Docs. SYSTEM_13 "Tool input schemas", the Layer-2 paragraph: the bound, the pointer and the read-back. SYSTEM_13 principle 2: the Dimension Summary and the `format` column. SYSTEM_09 "Disaggregation options": the sentence that every list the copilot reads is bounded names the inline cap and the lookup. PROTOCOL_APP_AI_TOOLS.md "Bounded reads": an error lists near matches and names the lookup.

**Not in this step.** The row ceiling (step 4). The Dimension Summary's bound of 20 values with labels and facts, which stays.

**Gates.** `deno task test:files server/tests/format_value_list_for_ai_test.ts server/tests/format_metric_data_for_ai_test.ts`.

**Ends with.** One commit.

### Step 4: the row ceiling

**Surface.**

- `lib/ai_tools/read_bounds.ts`
- `lib/ai_tools/format_metric_data_for_ai.ts`
- `lib/ai_tools/tools_metrics.ts`
- `server/tests/format_metric_data_for_ai_test.ts`
- `SYSTEM_13_ai_assistant.md`
- `PROTOCOL_APP_AI_TOOLS.md`

**Deliverable.**

- `AI_DATA_ROWS_MAX` in `read_bounds.ts`.
- `formatItemsAsMarkdown` as ruling 9. The line a read over the ceiling ends with states the row count and the ceiling and tells the model to add a filter, narrow the period or remove a disaggregation, and that the lookup lists a dimension's values to filter by.
- `get_metric_data`'s description states the ceiling and what a read over it returns.
- The test file pins: a read of exactly the ceiling writes every row; a read of one more writes the header, the total, each dimension's count and the line, and no CSV section.
- Docs. SYSTEM_13 principle 2, where it describes `get_metric_data`'s CSV. PROTOCOL_APP_AI_TOOLS.md "Bounded reads": a data read is refused whole over its ceiling, never cut.

**Not in this step.** The server's `too_many_items` status and `MAX_ITEMS`. The report tools' `FIGURE_DATA_MAX_CHARS` cut on a new figure's excerpt.

**Gates.** `deno task test:files server/tests/format_metric_data_for_ai_test.ts`.

**Ends with.** One commit.

### Step 5: script and log windows

**Surface.**

- `lib/ai_tools/read_bounds.ts`
- `lib/ai_tools/format_text_window_for_ai.ts` (new)
- `lib/ai_tools/mod.ts`
- `client/src/components/instance/copilot/tools/modules.ts`
- `server/tests/text_window_for_ai_test.ts` (new)
- `SYSTEM_13_ai_assistant.md`
- `PROTOCOL_APP_AI_TOOLS.md`

**Deliverable.**

- `AI_TEXT_WINDOW_MAX_CHARS` and `AI_TEXT_LINE_MAX_CHARS` in `read_bounds.ts`.
- A pure function in `format_text_window_for_ai.ts` writes a text window as ruling 10, given the text, whether the default window is the start or the end, and the optional `fromLine` and `search`.
- `get_module_r_script` and `get_module_log` take `fromLine` (an integer of at least 1) and `search` (an array of strings, `.min(1)`), and return the window. Their descriptions say what a call with neither returns and how to read on. A `fromLine` past the last line refuses with the line count.
- The test file pins: a text within the window is written whole with its counts; a longer text is written from the start, and from the end, as whole lines within the window, with the range; `fromLine` continues from a window's last line with no line lost or repeated; a line over the line bound is cut with its length stated; a search writes matching lines with their numbers and both counts; a search with no match; a search with more matches than the window holds; `fromLine` past the end.
- Docs. SYSTEM_13 "Tools, view gating, and approval", where it names the module internals; the manifest lists the new test. PROTOCOL_APP_AI_TOOLS.md "Bounded reads": a file read is a window.

**Not in this step.** `get_module_settings`. The routes `getRunModuleScript` and `getRunModuleLogs` and the package page's viewers, which read the whole file.

**Gates.** `deno task test:files server/tests/text_window_for_ai_test.ts`.

**Ends with.** One commit.

### Step 6: record pages

**Surface.**

- `lib/ai_tools/read_bounds.ts`
- `lib/ai_tools/format_hfa_indicators_for_ai.ts`
- `lib/ai_tools/format_products_list_for_ai.ts`
- `client/src/components/data/hfa/indicators/ai/tools.ts`
- `client/src/components/products/copilot/ai_tools/tools/products.ts`
- `server/tests/format_hfa_indicators_for_ai_test.ts`
- `server/tests/format_products_list_for_ai_test.ts`
- `SYSTEM_13_ai_assistant.md`
- `PROTOCOL_APP_AI_TOOLS.md`
- `TESTING_SCRIPT_FOR_AI_COPILOT.md`

**Deliverable.**

- `AI_RECORD_PAGE_MAX` in `read_bounds.ts`.
- `get_hfa_indicators` and `get_hfa_variables` take `offset`. Each writes one record page of the records its filters leave, through the paging helper, and its count line states how many records match, how many exist, which are written and the offset of the next page. `get_hfa_indicators` writes the taxonomy when `offset` is absent or 0.
- `list_products` takes `search` and `offset`, as ruling 11. Its description no longer says it lists every product.
- An `offset` at or past the number of records refuses with that number, in all three.
- The HFA test file pins: a listing of exactly a page; a longer one with the next offset; the second page without the taxonomy; the same for variables. The products test file pins: a page, the next offset, a search over label, folder path and package label, and a search with no match.
- Docs. SYSTEM_13 "The HFA tools" and the `list_products` paragraph of "Tools, view gating, and approval". PROTOCOL_APP_AI_TOOLS.md "Bounded reads": a record list pages. TESTING_SCRIPT_FOR_AI_COPILOT.md: the HFA checks whose ground truth quotes the count line.

**Not in this step.** `get_hfa_indicator_details` and `get_hfa_variable_details`, which take at most 20 ids. `get_deck`, `get_image_assets` and `get_reference_docs` (§5).

**Gates.** `deno task test:files server/tests/format_hfa_indicators_for_ai_test.ts server/tests/format_products_list_for_ai_test.ts`.

**Ends with.** One commit.

### Step 7: dataset summaries

**Surface.**

- `lib/types/run_datasets.ts`
- `lib/types/run_authoring_context.ts`
- `lib/ai_tools/build_system_prompt.ts`
- `server/run_query/run_read.ts`
- `client/src/state/instance/t2_run_authoring_context.ts`
- `server/tests/copilot_prompt_test.ts`
- `SYSTEM_06_ingestion.md`
- `SYSTEM_08_results_packages.md`

**Deliverable.**

- `RunDataset` is the union of ruling 12. `getRunDatasetsFromManifest` returns it, reading the HMIS version id from the manifest's `info.version.id`.
- The package block's "Loaded datasets" lines read the summary and write what they write today.
- The client cache name is `run_authoring_context_v5`.
- Leftovers deleted: `dateExported`, and the `RunDataset` union's `info` members. The `RunDataset*Info` types stay, with the header comment of `run_datasets.ts` saying what each type is for.
- `copilot_prompt_test.ts`'s dataset fixture is a summary, and the test of the block's dataset lines passes unchanged in what it asserts.
- Docs. SYSTEM_06, the sentence that names `RunDataset` as the stamps the manifest records and `getRunDatasetsFromManifest` as their reader. SYSTEM_08, where it lists what the authoring context carries.

**Not in this step.** The manifest's own copy of the staging result (step 8).

**Gates.** `deno task test:files server/tests/copilot_prompt_test.ts`.

**Ends with.** One commit.

### Step 8: the staging result leaves the manifest

**Surface.**

- `lib/types/run_datasets.ts`
- `lib/types/run_manifest.ts`
- `server/runs/capture_inputs/hmis.ts`
- `server/runs/manifest_transform.ts`
- `server/routes/caches/visualizations.ts`
- `server/tests/run_manifest_transform_test.ts`
- `SYSTEM_03_realtime_cache.md`
- `SYSTEM_06_ingestion.md`
- `SYSTEM_08_results_packages.md`

**Deliverable.**

- `RunDatasetHmisInfo.version` is the four fields of ruling 16, and capture writes those four.
- Manifest block 14 deletes `info.version.stagingResult` from every HMIS entry of `datasets[]` and stamps version 16. It touches no other key of `info`. The file header's block list names it, and names block 13, which the list omits today.
- `RUN_MANIFEST_SCHEMA_VERSION` is 16, with its history line. `PO_CACHE_VERSION` takes its next value, with its history line.
- The test file pins: a version 15 manifest whose HMIS entry holds a staging result loses it and keeps the version's id, its row counts and every other key of `info`; a manifest with no HMIS entry is stamped and otherwise unchanged; a second pass changes nothing.
- Docs. SYSTEM_08's `manifestSchemaVersion` paragraph states version 16 and what an HMIS entry holds. SYSTEM_03 states the current `PO_CACHE_VERSION`. SYSTEM_06, where it says what capture records of the dataset version.

**Not in this step.** The other stamps of `info` (`totalRows`, `structureLastUpdated`, the indicator stamps, the HFA and ICEH hashes). `runs.summary`. The import ledger.

**Gates.** `deno task test:files server/tests/run_manifest_transform_test.ts`.

**Ends with.** One commit.

### Step 9: one catalog per family in the manifest

**Surface.**

- `lib/types/run_manifest.ts`
- `server/runs/indicator_catalog.ts`
- `server/runs/build_run_package.ts`
- `server/runs/manifest_transform.ts`
- `server/run_query/run_read.ts`
- `server/routes/caches/visualizations.ts`
- `server/tests/run_manifest_transform_test.ts`
- `SYSTEM_03_realtime_cache.md`
- `SYSTEM_08_results_packages.md`
- `SYSTEM_09_viz_query_cache.md`
- `PROTOCOL_APP_MIGRATIONS.md`

**Deliverable.**

- The manifest schema's `indicators` is an array of `{ family, indicators }`, and its type and schema are named for a family's catalog, not a module's.
- `buildRunIndicatorCatalog` as ruling 18a, called by finalize and by manifest block 1 as ruling 18b. The transform has one function that gives a module's family, from its blob or from the frozen legacy map, and block 1 and block 11 both call it.
- `getIndicatorMetadataFromRun` returns the catalog of the module's family, and an empty list for a module the manifest does not hold.
- Manifest block 15 stamps version 17 and does nothing else. The file header's block list names it.
- `RUN_MANIFEST_SCHEMA_VERSION` is 17, with its history line. `PO_CACHE_VERSION` takes its next value, with its history line.
- Leftovers deleted: `getDatasetTypes` and `isHfaScriptGeneration` in `indicator_catalog.ts`, when nothing else calls them.
- The test file pins: a version 16 manifest with three HMIS modules and one HFA module comes out with two entries, each catalog equal to what its modules held; a blob with no `family` takes its family from the frozen map in block 1; a module id outside the map throws; `getIndicatorMetadataFromRun` returns the same catalog for two HMIS modules and an empty list for an unknown module; a second pass changes nothing.
- Docs. SYSTEM_08: the format's account of `indicators[]` and the `manifestSchemaVersion` paragraph. SYSTEM_09 "Disaggregation options": the indicator metadata paragraph, which calls the catalog per-module. SYSTEM_03: the current `PO_CACHE_VERSION`. PROTOCOL_APP_MIGRATIONS.md "Run Manifest Transforms": the sentence that gives `buildRunIndicatorCatalog`'s branch on `scriptGenerationType` as its example of app code in a recompute.

**Not in this step.** `hmisIndicators`, the manifest's other list of the dictionary. What a read carries of the catalog (step 10).

**Gates.** `deno task test:files server/tests/run_manifest_transform_test.ts`.

**Ends with.** One commit.

### Step 10: a read carries the catalog entries it names

**Surface.**

- `lib/indicator_metadata_for_read.ts` (new)
- `lib/mod.ts`
- `lib/resolve_effective_indicator_facts.ts`
- `lib/types/instance.ts`
- `server/server_only_funcs_presentation_objects/presentation_object_items_core.ts`
- `server/run_query/run_read.ts`
- `server/routes/caches/visualizations.ts`
- `server/db/migrations/data_transforms/_figure_block.ts`
- `server/db/migrations/data_transforms/slide_config.ts`
- `server/db/migrations/data_transforms/reports.ts`
- `server/db/migrations/data_transforms/visualizations.ts`
- `server/tests/indicator_metadata_for_read_test.ts` (new)
- `SYSTEM_03_realtime_cache.md`
- `SYSTEM_09_viz_query_cache.md`
- `SYSTEM_10_figure_render_export.md`
- `PROTOCOL_APP_MIGRATIONS.md`

**Deliverable.**

- The pure function of ruling 17a and 17b in `lib/indicator_metadata_for_read.ts`, exported through `lib/mod.ts`.
- An `ok` items holder carries the function's result over its returned rows and its fetch config's filters. The grid read carries the same, since it reads through the items read. The catalog-expression evaluation still reads the whole catalog.
- A block in `transformFigureBlock` sets a bundle's `indicatorMetadata` to the function's result over the bundle's items, its config's filter values and its selected replicant value. One predicate says whether a bundle holds an entry the function would drop, and the three sweeps run the transform for a row where it holds, beside their two string gates. A row the block has trimmed is skipped on the next boot.
- `PO_CACHE_VERSION` takes its next value, with its history line: `po_items` and `grid_items` entries hold whole catalogs.
- The comment on `resolveEffectiveIndicatorFactsFromItems` and the comment on the items holder's `indicatorMetadata` say what the field holds.
- The test file pins: an entry named by a row's cell is kept; one named only by a filter value is kept; one named only by the selected replicant value is kept by the transform; an entry nothing names is dropped; the kept entries are in the catalog's order; a numeric cell that equals an id as text keeps the entry; the predicate holds for a bundle with an unnamed entry and not for a trimmed one; the block leaves a trimmed bundle byte-identical.
- Docs. SYSTEM_09: the indicator metadata paragraph of "Disaggregation options", the status envelope's line in "SQL assembly", and "FigureBundle: the capture side". SYSTEM_10 "The bundle shape": what `indicatorMetadata` holds. SYSTEM_03: the current `PO_CACHE_VERSION`. PROTOCOL_APP_MIGRATIONS.md "Skip-Gate Gotcha": the predicate, as the third forced gate of the figure sweeps. The manifest of SYSTEM_09 lists the new lib file and the new test.

**Not in this step.** Value info's `indicatorFormats` and `indicatorRules` (ruling 17f). The client cache names (ruling 17e).

**Gates.** `./validate_queries`; `deno task test:files server/tests/indicator_metadata_for_read_test.ts`.

**Ends with.** One commit.

### Step 11: an indicator may declare no direction

**Surface.**

- `server/db/migrations/instance/231_indicator_direction_undeclared.sql` (new; the next free number if 231 is taken)
- `server/db/instance/_main_database.sql`
- `server/db/instance/indicators.ts`
- `server/routes/instance/indicators.ts`
- `server/dhis2_id_fix/execute.ts`
- `server/runs/indicator_catalog.ts`
- `lib/api-routes/instance/indicators.ts`
- `lib/types/indicators.ts`
- `lib/hmis_indicator_catalog.ts`
- `lib/ai_tools/build_system_prompt.ts`
- `client/src/components/data/hmis/indicators/edit_indicator_form.tsx`
- `client/src/components/data/hmis/indicators/manager.tsx`
- `client/src/state/instance/t2_indicators.ts`
- `server/tests/indicator_schema_test.ts`
- `server/tests/indicator_naming_test.ts`
- `server/tests/copilot_prompt_test.ts`
- `server/tests/format_metric_data_for_ai_test.ts`
- `SYSTEM_05_facilities_indicators.md`
- `SYSTEM_13_ai_assistant.md`

**Deliverable.**

- The migration: `direction` loses its default and its `NOT NULL`; the update of ruling 13a; the constraint of ruling 13b, added behind a `pg_constraint` check. `_main_database.sql` declares the column and the constraint as the migration leaves them. The migration's header says what an undeclared direction is and why the update keeps the rows it keeps.
- `HmisIndicator.direction`, the catalog row's and the API schema's are `ThresholdDirection | null`. The mirror's row schema accepts `null`, and `buildRunHmisIndicators` and the module catalog write no `direction` key for it.
- `thresholdsToDb` takes a direction only with a rule. The save route refuses a rule on an undeclared indicator as ruling 13b.
- `applyIndicatorNaming` and the DHIS2 id repair create undeclared indicators.
- The editor's Direction control as ruling 13c, translated (en, fr, pt), with its caption saying what not set means. Saving a rule with the direction not set is stopped in the form with the same message the route gives.
- The dictionary download writes an empty cell for an undeclared indicator.
- The client cache name is `instance_indicators_v8`.
- The base instructions: the paragraph on a declared direction says an HMIS indicator may declare none, and the paragraph on inferring a direction names an undeclared HMIS indicator beside the HFA and ICEH indicators and the module metrics.
- Tests. `indicator_schema_test.ts`: a NULL direction is accepted; a rule on an undeclared row is refused by `indicators_rule_direction_check`; the vocabulary check still holds. `indicator_naming_test.ts`: an indicator the naming step creates is undeclared. `copilot_prompt_test.ts`: the HMIS line of an undeclared indicator states no direction, and the two paragraphs of the base instructions. `format_metric_data_for_ai_test.ts`: the Dimension Summary states no direction for an undeclared indicator.
- Docs. SYSTEM_05 "The four indicator dictionaries": the three values, the constraint, what the forms create, the download and the cache name. SYSTEM_13 "System prompt, documents, prompt library": what the base instructions say about direction.

**Not in this step.** Existing packages (ruling 13e). A conditional-formatting rule's own `direction` key and every reader of it. `target` and `expected_low_counts`.

**Gates.** `./validate_migrations`; `./validate_fresh_boot`; `deno task test:files server/tests/indicator_schema_test.ts server/tests/indicator_naming_test.ts server/tests/copilot_prompt_test.ts server/tests/format_metric_data_for_ai_test.ts`; at the close, `deno task test`.

**Ends with.** One commit, then the close commit that deletes this file.

## §5 Out of scope

- **Existing packages' directions** (ruling 13e).
- **The other stamps of a dataset entry.** `totalRows`, `structureLastUpdated`, the two indicator stamps and the HFA and ICEH hashes stay in the manifest as capture writes them.
- **Value info's per-indicator records** (ruling 17f).
- **`hmisIndicators`**, the manifest's second list of the HMIS dictionary: the interpretation facts and the formula, 279,790 characters on sierraleone.
- **A filter on the lookup**: the values of one dimension under a filter on another. `get_metric_data` answers that with a grouped read.
- **The Dimension Summary's bound of 20** values with labels and facts.
- **`get_deck`'s outline** and **`get_image_assets`**: on nigeria, ethiopia, ghana and sierraleone the longest deck holds 156 slides and no instance has more than 13 image assets. **`get_reference_docs`**, whose length follows no instance's data.
- **The size of the tools array and the system prompt**, about 73,000 input tokens before any message (§1).
- **How the copilot states a figure**: PLAN_03_COPILOT_FIGURES.md.
- **The report tools' `FIGURE_DATA_MAX_CHARS`** cut and `get_metric_data`'s missing roll-up row (SYSTEM_13 Open items).

## §6 Log

- Steps 2 and 3: the floor's `./run` was replaced by booting `main.ts` alone with `PORT=8099` against the running containers, because Tim's own `./run` holds port 8000 and `./run` replaces the `pg` and `valkey-local` containers under it.
- Step 3: the header's format line is one function for every read, so a `percent` metric's read states how its values are written, as an indicator read whose rows share `percent` does.
