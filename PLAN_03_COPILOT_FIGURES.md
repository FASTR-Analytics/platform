# PLAN: How the copilot states a figure

Status: NEEDS DESIGNING. Step 1 is the test of the design. No code step exists until that test has run and Tim has ruled on its findings.

This plan covers how the copilot creates, edits and reads a figure, and what checks a figure before it is stored. It was split out of a wider plan on 2026-11-13, after a conversation between Tim and the agent that wrote this file ("the writing agent"), during which three review agents ran a stress test. This file carries that conversation to an agent that was not in it: what was checked, what was only reported, what Tim said, what was considered, and where a direction was reached. Statements are marked by kind (§0). Nothing here is a design decision except the rulings of §3 marked Ruled.

**Next step: Do 1.**

Branch: `main`. Repos: this one. Step 1 decides whether `wb-fastr-modules` and `timroberton-panther` gain steps. Read first: [CLAUDE.md](CLAUDE.md), [SYSTEMS.md](SYSTEMS.md), [SYSTEM_13_ai_assistant.md](SYSTEM_13_ai_assistant.md) "Validate-before-commit", "Tool input schemas", "The slide_ai conversion layer" and Open items "Surface gaps", [SYSTEM_11_viz_authoring.md](SYSTEM_11_viz_authoring.md) "The insert-figure wizard", "lib config semantics" and "Explore query model", [SYSTEM_10_figure_render_export.md](SYSTEM_10_figure_render_export.md) on special modes, [PROTOCOL_APP_AI_TOOLS.md](PROTOCOL_APP_AI_TOOLS.md), and in the modules repo `DOC_VIZPRESET_STANDARDS.md`. Start when (proposed, ruling 5; Tim has not ruled): step 1 at any time, since it writes no file in this repo but this one. Every later step: `test ! -e PLAN_COPILOT_TOOL_LIMIT.md && test ! -e PLAN_02_COPILOT_SURFACE_GAPS.md && echo ok` prints `ok` on `main`.

## §0 How to work this plan

The instruction is "Do the next step of PLAN_03_COPILOT_FIGURES.md." Branch, floor, conditional gates, reading order and the review cadence are [PROTOCOL_APP_PLANS.md](PROTOCOL_APP_PLANS.md) and [panther/protocols/PROTOCOL_ALL_PLANS.md](panther/protocols/PROTOCOL_ALL_PLANS.md). The log is §6. Step 1 sets the last step when it writes the steps after it.

### The kinds of statement in this file

- **[CHECKED]**: read in the code, or run, by the writing agent on 2026-11-12 or 2026-11-13. Where a line says "read, not run", what happens when the code runs is an inference.
- **[MEASURED]**: counted by a review agent's script over the module definitions or a production deck. Not re-run by the writing agent unless the line says so. The scripts were in a session scratch directory and are gone.
- **[REPORTED]**: stated by a review agent from its own reading or a probe. Not reproduced.
- **[TIM]**: Tim's words in that conversation, quoted as typed. A ruling only where §3 marks it Ruled.
- **[TIM pasted]**: text Tim pasted from elsewhere.
- **[ACCOUNT]**: the writing agent's account of the conversation or of its own actions: who raised what, what a quote was replying to, what was withdrawn. Not a quote, and written by a party to it.
- **[VIEW]**: an opinion or an inference, with whose it is. Not tested unless the line says so.

A heading's mark covers everything under it. A line's own mark overrides its heading's. Unmarked text is procedure (what a step does), vocabulary, or a ruling of §3, each of which states its own standing.

[ACCOUNT] An independent agent audited an earlier version of this file on 2026-11-13 for opinions that read as facts, and opened 64 cited locations. 41 held as worded. Its corrections are applied here, each after the writing agent opened the code it cited.

### What Tim said about how the work was being done [TIM]

- "This discussion affects possibly the most high-stakes part of the app. Figures in presentations for policy makers."
- "It alarms me that you flip-flop so quickly and immediately answer my question. WHy can't you think and give this due delibration? I am not saying you are wrong. I'm saying you don't seem to be thinking hard enough."
- "did you stress test your idea in any way? did you give it to independent agents?"
- "please be clearer. tell me what exists now, what the plan currently suggests, and what you propose"
- "what you have just said to me, unless i misunderstand, sounds much like a hack to solve a specific problem. i always want the best possible app."
- "i want a fresh agent to have all needed context but IMPORTANTLY... NO OPINIONS STATED AS FACTS"

[ACCOUNT] What these were replies to: the writing agent proposed five designs in a row for creating a figure (§2.2, A to E), each within one reply and none tested. The fourth and fifth quotes answered the third design. The first three answered the fifth.

### Vocabulary

- **figure**: a metric and its settings `{ d, s, t }`: the data settings, the style and the text (`PresentationObjectConfig`).
- **preset**: a figure a module author wrote for a metric (`vizPresets`, in the modules repo).
- **the editor**: the figure editor a person uses (`client/src/components/_shared/figure_editor/`).
- **statement**: what the copilot sends to create a figure or to change one.
- **slot**: where a dimension is laid out in a figure (`disDisplayOpt`: row, col, series, replicant and so on).
- **whole-figure rule**: a check over a figure's settings and its metric together, run on the whole figure and never only on what a call changed. (The writing agent's term and meaning. Tim's words are in §2.1, 6.)
- **misleading figure**: one that draws without error and shows numbers other than what its text says.
- **must-pass set**: figures taken as right, which every rule must accept.
- **must-refuse set**: figures taken as misleading, each of which some rule must refuse.

### Rules peculiar to this plan

- No design is put to Tim before it has been tested against the code and against both sets, and attacked by an independent agent that was not given the conclusion. A proposal states three things: what exists now, what this plan says, what is proposed. (The writing agent's rule, drawn from Tim's quotes above. The two sets are proposed, ruling 3.)
- A [REPORTED] or [MEASURED] line is not relied on until the working agent has reproduced it. A [VIEW] is never restated as a fact.
- Step 1 writes no file in this repo but this plan. Its prototype and its outputs live outside the repo. Production data it reads is read-only under PROTOCOL_ACCESS_DBS.md and is deleted when the step ends.
- Plan file names. [TIM] "Dont use the word WAIT in plans. That is my designation to give" and "number these plans PLAN_01_ PLAN_02_ PLAN_03_ which is much more helpful".
- Every line number under a [CHECKED] mark was read on 2026-11-13. Those in §1.8 are the review agents' and were not opened unless the line says so. Where the code has moved, the code wins.

### Facts for running the measurements

- [MEASURED] A script that imports `lib` runs with `deno run --cached-only --allow-read --allow-ffi --allow-env -c deno.json <script>`, with absolute import paths. With `--allow-read` alone it fails, because `lib` loads panther's Deno entry, which loads the DuckDB binding and reads the environment. [CHECKED] The writing agent ran its own script with these flags.
- [CHECKED] A module's built definition is `<modules repo>/mNNN/definition.json`. Its metrics are under `.metrics[]` and each metric's presets under `.vizPresets[]`, each with `config { d, s, t }`.
- [MEASURED] `definition.json` holds no `disaggregationOptions`. Review agent 2 built them with the app's test helper `metricsWithStatusOf(defs, EVERY_FACILITY_COLUMN)` ([\_module_definitions.ts:53](server/tests/_module_definitions.ts#L53), [:67](server/tests/_module_definitions.ts#L67)).
- [CHECKED] The deck used as evidence is the product `56r` ("Round 1 report") on the `sierraleone` instance: `SELECT id, sort_order, config FROM slides WHERE slide_deck_id = '56r' ORDER BY sort_order` in its `main` database. A content slide's `config.layout` is a tree whose `type: "item"` nodes carry `data`. A figure block is `data.type == "figure"` with `data.bundle` holding `metricId`, `config`, `items`, `resultsValue` and `dateRange`.
- [CHECKED] Whether two dimensions collide in a slot is decided by `getEffectivePOConfig` and `getSingleValueDimsFromItems` ([normalize_po_config.ts:169](lib/normalize_po_config.ts#L169), [:264](lib/normalize_po_config.ts#L264)) and `hasDuplicateDisaggregatorDisplayOptions` ([get_disaggregator_display_prop.ts:75](lib/get_disaggregator_display_prop.ts#L75)). All three are in `lib` and ran under Deno.
- [CHECKED] `applyFigureConfigPatch` and `validateFigureConfigEdit` are in `client/src/generate_visualization/` and import `AIToolFailure` from the client's `panther` specifier, which the root `deno.json` import map does not hold. No file in `server/tests` names either function.

### The neighbouring plans on 2026-11-13 [CHECKED]

- [PLAN_COPILOT_TOOL_LIMIT.md](PLAN_COPILOT_TOOL_LIMIT.md): another agent is working it. Its status line reads "steps 1 to 5 are DONE. Step 6, the last, cannot start until a sync of panther has landed in this app". [TIM] "leave PLAN_COPILOT_TOOL_LIMIT.md as another agent is working on it."
- [PLAN_02_COPILOT_SURFACE_GAPS.md](PLAN_02_COPILOT_SURFACE_GAPS.md): queued behind it. Image blocks, a slide's own settings, the deck's settings, and a rendered image of a slide. Its ruling 1 says it leaves figures as it finds them.

## §1 The problem

### 1.1 Where the question came from

- [TIM pasted] What the copilot had told a user who was rebuilding a report as the deck "Round 1 report". Two of its answers are about figures. The copilot's words, its dashes replaced by full stops and commas, one passage cut at "[...]":
  - "Chart type is fixed by the metric's available preset. For this HFA metric, only a "table" preset exists, there's no distinct bar-chart preset to create from scratch. So several slides that were bar/donut charts in the original [...] are now tables instead of bar charts."
  - "Color-threshold shading isn't something I configure. The green/yellow/red cell shading is a built-in rendering behavior for percent-type values, not a setting under direct control."
- [CHECKED] On the first: the metric `m10-01-01` has one preset, a table ([m10-01-01.ts](../wb-fastr-modules/m010/_metrics/m10-01-01.ts)). The copilot's deck and report tools cannot state a type (§1.3). `update_figure_editor` can, while a person has that figure's editor open. The deck holds two charts on that metric. Who made them is not recorded.
- [CHECKED] On the second: shading is stored per figure as the `cf*` fields ([conditional_formatting_standalone.ts:46-64](lib/types/conditional_formatting_standalone.ts#L46-L64)). The edit patch leaves out `config.s` ([ai_input.ts:136](lib/types/ai_input.ts#L136)), the create input has no style field ([ai_input.ts:84-131](lib/types/ai_input.ts#L84-L131)), and the formatter that prints a figure for the copilot prints no style ([format_figure_config_for_ai.ts:22-165](client/src/components/products/copilot/_shared/format_figure_config_for_ai.ts#L22-L165)).
- [VIEW: writing agent] The copilot's second answer was wrong about the app because the copilot is shown no style.
- [CHECKED] The figure types the app has are timeseries, table, chart, map and pie ([\_metric_installed.ts:39](lib/types/_metric_installed.ts#L39)).

### 1.2 The ways a figure's settings are made today [CHECKED]

1. **From a preset.** `deriveConfigFromVizPreset` ([derive_presets.ts](lib/derive_presets.ts)). The insert wizard's preset cards, and every figure the copilot creates.
2. **From a metric, by a person.** The insert wizard's Custom path asks for a type and the disaggregations and calls `getStartingConfigForPresentationObject(metric, type, disaggregations)` ([presentation_objects.ts:515](lib/types/presentation_objects.ts#L515), called at [insert_figure.tsx:208](client/src/components/products/_shared/insert_figure/insert_figure.tsx#L208)). It adds the metric's required dimensions where the type allows them and gives each dimension the next free slot.
3. **From an Explore view.** `resolveView` and `deriveViewConfig` ([explore_query.ts](lib/explore_query.ts)) over the bindings of [explore_views.ts](lib/explore_views.ts). The data settings come from the view. The style comes from the metric's first preset of the same type, else the defaults ([explore_query.ts:689](lib/explore_query.ts#L689)); for a timeseries the caller then sets `content: "lines"` and `hideLegend` ([explore_query.ts:786-794](lib/explore_query.ts#L786-L794)). The text is empty.
4. **By copying a saved visualization.** "Insert > Existing visualization" hands back the saved config ([insert_existing_figure.tsx:25-30](client/src/components/products/_shared/insert_figure/insert_existing_figure.tsx#L25-L30)). SYSTEM_11 says no copilot tool reads saved visualizations.
5. **By editing.** A person in the editor. The copilot through a patch: `AiFigureConfigPatchSchema`, `applyFigureConfigPatch`, `validateFigureConfigEdit`, `resolveBundleFromMetricAndConfig`.

### 1.3 Creating and editing use two sets of names [CHECKED]

| Stored field                                                    | Creating (`from_metric`)                     | Editing (the figure patch)              |
| --------------------------------------------------------------- | -------------------------------------------- | --------------------------------------- |
| `caption`                                                       | `chartTitle`                                 | `caption`                               |
| `filterBy`                                                      | `filters`, only dimensions the preset allows | `filterBy`, any dimension of the metric |
| `selectedReplicantValue`                                        | `selectedReplicant`                          | `selectedReplicantValue`                |
| `periodFilter`                                                  | `startDate` and `endDate`                    | `periodFilter { min, max }`             |
| disaggregations and their slots, roll-up, sub-caption, footnote | cannot be stated                             | can be stated                           |
| chart type and time grouping                                    | cannot be stated                             | `update_figure_editor` only             |
| style (`config.s`)                                              | cannot be stated                             | cannot be stated                        |

- Creating: `AiFigureFromMetricSchema` ([ai_input.ts:84](lib/types/ai_input.ts#L84)), applied by hand-written code in [build_config_from_preset.ts:64-108](client/src/components/products/copilot/slide_ai/build_config_from_preset.ts#L64-L108). The preset id is required.
- Editing: `AiFigureConfigPatchSchema` for `update_figure` and `update_report_figure`, and `AiVizConfigUpdateSchema` ([ai_input.ts:207](lib/types/ai_input.ts#L207)) for `update_figure_editor`, which adds the type and the time grouping. A filter on a dimension the metric's results lack is refused ([content_validators.ts:171-181](lib/ai_tools/content_validators.ts#L171-L181)). The three tools each hold their own copy of the same sequence of calls (`update_figure.ts`, `figure_editor.ts`, `report_editor.ts`).
- The create schema is a `z.object`, which strips a key it does not know, and PROTOCOL_APP_AI_TOOLS.md bans `z.strictObject`. So a create call that uses the edit name `selectedReplicantValue` loses that key (read, not run). [VIEW: writing agent, not run] What follows depends on the preset: 17 presets carry a replicant value of their own, which would then be used; 12 store an empty one, and the strict check would then throw ([assert_replicant_valid.ts:56-60](client/src/generate_visualization/assert_replicant_valid.ts#L56-L60)).
- `client/public/info/iceh.md:138` teaches the model `selectedReplicant`. `client/public/info/iceh-equity-profile.md` teaches `selectedReplicant`, `chartTitle` and `filters` (lines 53 to 104).
- The create schema is used by three slide tools, the draft slide tool and four report tools (`rewrite_report`, `get_report_pages`, `insert_figure`, `replace_figure`; the first two through `resolveNewFigures`, [report_editor.ts:741](client/src/components/products/copilot/ai_tools/tools/report_editor.ts#L741), [:849](client/src/components/products/copilot/ai_tools/tools/report_editor.ts#L849)).
- `get_metric_data`'s query (`AiMetricQuerySchema`, [ai_input.ts:24-60](lib/types/ai_input.ts#L24-L60)) uses the create names `filters`, `startDate`, `endDate` and `valuesFilter`, and one name of its own, `disaggregations` (dimension names with no slots). It is shared with the `/mcp` surface.

### 1.4 What the copilot can and cannot build

- [CHECKED] 37 metrics and 50 presets across 8 modules. 11 metrics have no preset: `m1-01-00`, `m1-05-01`, `m4a-01-02`, `m4a-01-03`, `m4a-02-02`, `m4a-02-03`, `m6-02-02`, `m6-03-02`, `m10-02-01`, `m10-02-02`, `m11-02-02`. (An auditing agent re-ran these counts and they held.)
- [MEASURED] The first two are hidden. That leaves 9 visible metrics with no preset, and the create input requires one (§1.3).
- [MEASURED] Presets by type: timeseries 20, table 19, map 7, chart 4, pie 0. 15 metrics offer one type only: 8 a table, 7 a timeseries.
- [MEASURED] The wizard's Custom path offers 163 metric and type pairs on visible metrics. Presets cover 40.
- [CHECKED] The deck has 47 slides and 30 figures: 29 on `m10-01-01`, 1 on `m10-03-01`, 28 tables and 2 charts.
- [MEASURED] The create input alone could state 1 of the deck's 30 figures. For 27, the rest of their data settings can be stated through `update_figure`. The 2 charts need a type, which only the editor's tool or a person can set. What the create input could not state, by figures affected: the preset's replicant dropped (28), a dimension added (26), a roll-up (10), a filter outside the preset's allowed list (8), a slot change (7), the type (2).
- [MEASURED] 12 of the 30 figures carry style that differs from the preset's: thresholds (11), decimal places (11), orientation and sort (2). Who set it is not recorded (§1.8).
- [CHECKED] The listing the copilot reads prints, per preset, its id, label, date format, allowed filters and whether it needs a replicant, and a note from `importantNotes` when one is set ([format_metrics_list_for_ai.ts:150-170](lib/ai_tools/format_metrics_list_for_ai.ts#L150-L170)). It does not print the preset's settings.
- [CHECKED] `formatFigureConfigForAI`, which every read of a figure by the copilot goes through, prints the metric, type, disaggregations and slots, filters, replicant, values, period filter and captions. It prints no style, no time grouping and no roll-up ([format_figure_config_for_ai.ts:22-165](client/src/components/products/copilot/_shared/format_figure_config_for_ai.ts#L22-L165)).

### 1.5 What a preset holds that the metric's defaults lack

- [CHECKED] The defaults of `getStartingConfigForPresentationObject` have no period filter ([presentation_objects.ts:530](lib/types/presentation_objects.ts#L530)) and the default text ([:544](lib/types/presentation_objects.ts#L544)).
- [MEASURED] Compared field by field with the defaults for the same type and dimensions, all 50 presets differ on at least one field that review agent 2 classified as read by the renderer. It classified by reading the render code. Nothing was rendered.

[MEASURED] The fields that differ:

| What differs                                                  | Presets (of 50)                                  |
| ------------------------------------------------------------- | ------------------------------------------------ |
| Slot layout                                                   | 37 (15 still differ once the replicant is named) |
| A replicant, with a starting value in 17                      | 29                                               |
| Shading mode                                                  | 26, of which 22 carry a threshold rule           |
| A period window (last 12 months, last quarter, last year)     | 24                                               |
| Decimal places (1 against 0)                                  | 23                                               |
| A special chart style (coverage, disruptions, change bars)    | 14                                               |
| Sub-caption (all with the date range) and footnote            | 46 and 24                                        |
| Marks, labels, colour scale, sort, orientation, values filter | 7 or fewer each                                  |

- [MEASURED] Of the 30 presets that are not timeseries, 7 put time on an axis and 23 carry a period window. [REPORTED] Review agent 1 called this a guarantee about time that lives only in presets.
- [MEASURED] For 20 of the 31 metrics the wizard offers a map for, the default map puts no admin level on the map's area. Over 1,271 metric, type and dimension combinations, the defaults gave no illegal slot, no shared slot and no timeseries without a grouping. Both were measured with every facility column on; a package with fewer columns changes the order of options and so the default slots (§1.8).
- [MEASURED] In the deck, the default slots for a figure's stored dimensions equal its stored slots in 0 of 30 figures.
- [CHECKED] Three m006 presets (`coverage-timeseries` on `m6-01-01`, `m6-02-01` and `m6-03-01`) carry in their sub-caption: "DISCLAIMER: These results use routine data to provide rigorous, but not official estimates." The two m006 `coverage-bar` presets do not carry it. All five carry a method note as their footnote. Neither text is on the metric.
- [MEASURED] `importantNotes` is null on every preset and every metric. `allowedFilters` is empty on 8 presets.
- [REPORTED] `DOC_VIZPRESET_STANDARDS.md` describes presets as cards for people and never mentions the copilot.
- [CHECKED] A comment in [explore_views.ts:10-13](lib/explore_views.ts#L10-L13) reads: "Presentation is deployable and a manifest is frozen, so the bindings live here and not in the module definitions." [REPORTED] Review agent 3 concluded that a preset added later does not reach a package made earlier.

### 1.6 What checks a figure today [CHECKED]

- **Shape.** Zod (`configDStrict`, `presentationObjectConfigSStrict`): types and allowed values. It is given neither the metric nor the data. PROTOCOL_APP_AI_TOOLS.md says of its runtime checks: "These runtime checks are permanent, not a stopgap awaiting a stricter schema", and gives as the reason that whether a field is live often depends on the metric. It also records that turning `configDStrict` into a union by type was evaluated and declined on 2026-08-06.
- **On an edit.** `validateFigureConfigEdit` checks only what the patch touches, by contract ([validate_figure_config_edit.ts:54](client/src/generate_visualization/validate_figure_config_edit.ts#L54)). Then the data check `validateMetricInputs`, the resolve (replicant, map boundaries, a render check through `buildFigureInputs`), and the slot check after the fetch, `assertNoSlotCollision`.
- **On a create.** Its own override checks, the data check and the resolve. No file of the create path names `validateFigureConfigEdit` or `assertNoSlotCollision`.
- **In the editor.** It hides the figure when two dimensions share a slot ([figure_editor.tsx:941](client/src/components/_shared/figure_editor/figure_editor.tsx#L941)).
- **Where a union by type exists today.** `update_slide`'s input is a union by slide type, with the comment "so a field aimed at the wrong slide type is unrepresentable in the tool call" ([update_slide.ts:40](client/src/components/products/copilot/ai_tools/tools/update_slide.ts#L40)).

### 1.7 Code paths read that would give a misleading figure or a failure [CHECKED: code read; what appears on screen is predicted, not seen]

- **A special chart style is active on its flag and the type alone** ([special_chart_checks.ts:94-119](client/src/generate_visualization/special_chart_checks.ts#L94-L119)). The render path checks the value props of two of the four styles: the disruptions style throws with fewer than two, and the newer disruptions style throws unless they are exactly `observed`, `expected`, `ppi_lwr`, `ppi_upr` ([build_figure_inputs.ts:153-174](client/src/generate_visualization/build_figure_inputs.ts#L153-L174)). No check of which dimension is on which slot was found there. Which metrics may use a style is listed in `special_chart_checks.ts` (`canUseSpecialCoverageChart` and its siblings). The newer disruptions flag is in no type's style resets ([presentation_objects.ts:168-259](lib/types/presentation_objects.ts#L168-L259)).
- **How values aggregate.** The query groups by the config's `disaggregateBy`, plus the time grouping for a timeseries ([get_fetch_config_from_po.ts:41-52](lib/get_fetch_config_from_po.ts#L41-L52)). The values come by one of three paths: a sum of ingredient columns, the metric's ingredient values with an expression, or each value with the metric's value function ([:68-103](lib/get_fetch_config_from_po.ts#L68-L103)). [VIEW: writing agent, not run] So a figure with no period filter and no time on an axis would show all periods pooled, and nothing on the figure would say so unless its text does.
- **The copilot's read-back of a figure's data adds every required dimension back** ([format_metric_data_for_ai.ts:89-99](lib/ai_tools/format_metric_data_for_ai.ts#L89-L99)). [VIEW: writing agent, not run] Where a figure pools a required dimension, the model would read rows the figure does not draw.
- **A map assigns each row's value to its area in a loop** ([get_map_data.ts:72](panther/_010_maps/get_map_data.ts#L72)), so of two rows for one area the later one stays. A table throws on a duplicate ([get_table_data.ts:394](panther/_010_table/get_table_data.ts#L394)), and so does the chart transform ([common_data_transform.ts:573](panther/_007_figure_core/common_data_transform.ts#L573)).
- **A map with no dimension on its area falls back to admin area 2** ([get_data_config_for_map.ts:32](client/src/generate_visualization/get_data_config_for_map.ts#L32)).
- **A pie is given a fixed total only in its completion mode** ([get_data_config_from_po.ts:612](client/src/generate_visualization/get_data_config_from_po.ts#L612)). What its slices show otherwise was not read in panther's pie code (§1.8 holds a report on it).
- **A timeseries with no grouping throws a plain `Error`**, not an `AIToolFailure` ([get_fetch_config_from_po.ts:47-50](lib/get_fetch_config_from_po.ts#L47-L50)).
- **The listing tells the model "Required disaggregations are auto-included."** ([format_metrics_list_for_ai.ts:32](lib/ai_tools/format_metrics_list_for_ai.ts#L32)). `get_metric_data` adds them. A figure's `disaggregateBy` is used as stated.
- **A caption holding the word REPLICANT keeps it when the figure has no active replicant** ([utils.ts:12-15](lib/utils.ts#L12-L15)).
- **The slot check depends on the data of the day.** 17 of the deck's 30 figures put `time_point` and another dimension on `col`. Run over the stored configs with the three `lib` functions of §0: with the stored items (one survey round) the check passes for all 30; with `time_point` no longer treated as single-valued it fails for those 17. [VIEW: writing agent, not run] Once such a figure is resolved again on data with a second round, a table would throw on the duplicate.

### 1.8 Reported by the review agents and not reproduced [REPORTED]

From review agent 1, told to break "create from a metric, defaults for what is not stated, preset optional" (§2.2 E). File references are as it gave them.

- With no preset: `m11-02-01` as a table shows the percentage difference over the package's whole history, where every preset of that metric shows the last quarter. `m6-02-01` as a map averages coverage over every year, because `year` is required and skipped on a map and a pie (`validate_figure_config_edit.ts:128-136`; `run_read.ts:627-647` exempts time dimensions).
- With a preset and a type change: `m1-02-02/completeness-timeseries` as a chart shows all-months completeness. `m12-01-01/values-monthly` as a table sums counts over the whole history.
- `m11-01-02/observed-expected-ci` with `admin_area_2` on the series and the values on rows passes every check. The first two regions draw as "Observed" and "Expected", and the band between two regions is labelled "95% credible interval" (a probe ran the transform and the slot check). `m6-02-01/coverage-timeseries` filtered to one value with regions as series draws every region grey under the coverage legend.
- A pie of `m1-02-02` with regions as slices shows each region's completeness over the sum of all regions' completeness.
- A map of a metric with more than one value throws `Cannot read properties of undefined (reading '0')` (a probe). Named metrics: m6-0x-01, m11-01-0x, m11-02-02, m2-02-01, m9-02-01.
- The validator never refuses a stated time dimension on a timeseries or a map (`validate_figure_config_edit.ts:94-117`).
- The validator's rule for a required time dimension disagrees with the modules build, which accepts "grouped or period-filtered" (`build_definitions.ts:296-301`): restating the `disaggregateBy` of `m6-02-01/coverage-bar` would be refused.
- The five m006 captions hold the word REPLICANT, and print it once an override leaves the figure with no active replicant. (The mechanism is [CHECKED], §1.7. The five captions were not opened.)
- A `filterBy` at creation replaces the preset's own filter: `m9-01-01/iceh-coverage-trend` carries `strat = wealth_quintiles`, and a year filter drops it while the sub-caption still says wealth quintile.
- A type change keeps the preset's period window: `m11-02-01/disruption-table-admin-area-2` as a timeseries is a three-point trend.
- `decimalPlaces` 0 where presets set 1: `m9-02-01`'s ratio of 1.4 prints "1".
- A filter on a time dimension beside a period filter shows their intersection while the date range text prints the period filter's bounds (`presentation_object_items_core.ts:88-94`).
- `getStartingConfigForPresentationObject` returns `t: DEFAULT_T_CONFIG` by reference.
- The slide wrappers rethrow a plain `Error` and would print `with preset "undefined"` (`convert_ai_input_to_slide.ts:79`, `get_slide_with_updated_blocks.ts:76`).
- Sound, in its view: pooling over a required dimension that is not time is refused on the client and the server (`run_read.ts:627-647`, `run_data_reads.ts:89-135`); replicant strictness, map boundaries and the render check carry over through the shared resolver; shading made inert by a type change leaves no stray legend.
- `allowedFilters`: it never lists a time dimension (but m009 `year` and m010 `time_point`), a facility column or another admin level; `update_figure` already bypasses it; its only other reader is the listing line, served to the SPA and `/mcp`.

From review agent 2, on the limits of its own measurements:

- Metric options were built for the widest possible package (every facility column). A real package with fewer columns changes the order of options and so the default slots.
- Nothing was rendered or queried. Which style differences the renderer reads was classified by reading the render code.
- Which deck figures the copilot made and which a person made is not recorded. It inferred it from whether a figure's style equals the preset's.
- The four timeseries presets that draw bars do not state `content`. They get bars from a fallback in `deriveConfigFromVizPreset`, while the from-metric default for a timeseries is lines.
- The comment in `update_figure.ts` about nine authored presets with no time grouping no longer matches the definitions: all 20 timeseries presets have one.

### 1.9 The editor [CHECKED]

- Its style controls are in `editor_panel_style/`: one hand-written component per figure type (`table_style_controls.tsx` and its four siblings, 1,433 lines together) and the controls they share (the folder is 2,307 lines). Which controls each type shows is decided there.
- Two counts by grep of the distinct style fields each per-type file touches: the writing agent's gave 5 for a table, 7 for a chart, 7 for a map, 10 for a pie and 18 for a timeseries, with 11 shared; an auditing agent's gave 4, 6, 6, 9 and 17, with 12 shared.
- Whether a figure paints shading at all is one function, `figurePaintsCf`: a table and a map always, a chart and a timeseries only with bars, a pie never ([conditional_formatting.ts:90](client/src/generate_visualization/conditional_formatting.ts#L90)). Shading is stored flat and read through a union, `selectCf` ([conditional_formatting.ts](lib/types/conditional_formatting.ts)).
- The editor's threshold control offers a dropdown of named threshold presets built from `LEGACY_CF_PRESETS` in `lib/legacy_cf_presets.ts` ([conditional_formatting_editor.tsx:352-381](client/src/components/_shared/figure_editor/_shared/conditional_formatting_editor.tsx#L352-L381)).

## §2 The design

### 2.1 What Tim said about the design, in order [TIM]

Each quote is Tim's. The words before a quote say what it replied to and are [ACCOUNT].

1. After being told that `update_figure` cannot change a chart type and that creation would gain a `figureType` field: "do we really need update_figure for slides, when we can just replace? Or is the issue that we can't see the original in full?"
2. After idea C: "please be clearer. tell me what exists now, what the plan currently suggests, and what you propose" and "what you have just said to me, unless i misunderstand, sounds much like a hack to solve a specific problem. i always want the best possible app. re-read CLAUDE.md Is your proposal really the best we can do?"
3. After idea D: "i agree with one-vocabulary, but i am unclear why it needs to be from a preset... aren't we at the point now where we can just create things from metrics?"
4. "and if it's from metric, why is it a patch? what is there to patch?" and "you should be just choosing the correct things to begin with - no need to "patch""
5. After the stress test's findings: "i am beginning to think that the presets system is potentially a footgun. it would be better for the AI to have to specify everything that the user's UI figure editor has, and thus have visibility into everything, and also thus have the same tool signature for editing figures in the UI editor (perhaps). And presents are essentially a cookbook that AI can see and recreate." ([ACCOUNT] The writing agent read "presents" as presets.)
6. In the same message: "Please - extremely solid whole-figure checks, which if I understand would just be the zod schema (and don't we already have this?)"
7. To the reply to 5 and 6, which ended by asking whether to test idea I the same way before any plan changes: "ok good. i want to ringfence this question as its own plan with its own scope. is this the entirety of the second plan we have been discussing? or are there other issues in the plan."
8. Asked "Do you want me to make that split now: cut the second plan down, and start the figure plan as a file whose first step is the test of the design?": "yes, make the split. is there a way to do it such that the figure plan comes last? or needs to be second?"

### 2.2 The ideas considered

Each entry: who raised it and where it stands ([ACCOUNT]), and what was said for and against it. A "for" or "against" line is a [VIEW] of the writing agent unless it carries another mark.

**A. Add `type` and `timeseriesGrouping` to `from_metric`.** Raised by the writing agent, in the first draft of the surface-gaps plan.

- For: it covers the case the user met (a chart from a table preset).
- Against: it adds two fields to the set of names that can state fewer fields (§1.3), and keeps both sets. [REPORTED] Review agent 1 said it shares three of the problems it found in E: pooled time, a special style outliving its layout, and overriding a preset the model cannot see.
- Stands: withdrawn by the writing agent.

**B. A field named `figureType` on `from_metric`.** Raised by the writing agent, to avoid a clash with the block's own `type`.

- Against: the same as A.
- Stands: withdrawn by the writing agent.

**C. An optional `patch` on `from_metric`, beside its existing fields.** Raised by the writing agent, in place of B.

- For: creation could state anything an edit can, in one call.
- Against: two ways to state a filter in one call (`filters` and `patch.filterBy`). [TIM] §2.1, 2 was the reply to this idea.
- Stands: withdrawn by the writing agent.

**D. One set of names: a preset, plus a `patch` in the stored names.** Raised by the writing agent. The old create fields would be removed.

- For: create and edit would share one schema, one piece of code and one set of checks.
- Against: [TIM] "i am unclear why it needs to be from a preset". [CHECKED] The listing does not show the model a preset's settings (§1.4), and 11 metrics have no preset.
- Stands: Tim said "i agree with one-vocabulary" of this idea (ruling 6). The required preset was not agreed.

**E. Create from the metric: state the type, the dimensions and the caption, take the metric's defaults for the rest, with a preset optional.** Raised by the writing agent after §2.1, 3 and 4.

- For: [CHECKED] the wizard's Custom path does this for people. It would reach the metrics with no preset and every type.
- Against: [ACCOUNT] Tim asked whether it had been stress tested. It had not. [MEASURED, not re-run] The defaults have no period window, the default style, the default text, and no admin level on the map's area for 20 of 31 metrics (§1.5). [REPORTED] Review agent 1's verdict: "Not safe as stated."
- Stands: the part "anything not stated takes the metric's defaults" is withdrawn by the writing agent. Creating from a metric was raised by Tim as a question and followed by "you should be just choosing the correct things to begin with" (§2.1, 3 and 4). Not ruled.

**F. Replace a figure and drop `update_figure`.** Raised by Tim as a question (§2.1, 1).

- [CHECKED] A replace goes through `from_metric`, which cannot state the fields listed in §1.3. The data settings the create input cannot state, and all style, come from the preset again. A figure with a dimension its preset lacks, such as the deck's tables by `admin_area_3`, is not statable through `from_metric`.
- [CHECKED] On "can't see the original in full": the copilot is shown a figure's data settings but the time grouping and the roll-up, and none of its style (§1.4).
- [VIEW: writing agent, said at the time] Keep `update_figure`, because a change in place is the only write that keeps what the copilot cannot see.
- [VIEW: writing agent] Under idea I the copilot would see and state the whole figure, which would remove that reason.
- Stands: not ruled. An open question (§2.7).

**G. Explore's view model as the way to create.** [REPORTED] Raised by review agent 3 as its second choice: the model names a view, a type, a level and pins, and `deriveViewConfig` builds the figure.

- For, in its view: the only way with curated meaning; it ships with the app; it covers nearly every metric.
- Against, in its view: it is a closed set (m010 offers tables and one map, so it would not have produced the HFA bar charts); create would use role names while edit must use stored names; a bad choice resolves silently to the first option.
- Stands: not adopted. Not discussed with Tim.

**H. Create from a metric, with the style and footnote taken from the metric's preset of the same type.** Raised by the writing agent after the test. Explore does this for style (§1.2, 3).

- For: a figure with no preset named would still carry the style of the metric's preset.
- Against: the style would again come from somewhere the model is not shown. A metric with no preset of that type has nothing to borrow.
- Stands: set aside by the writing agent when Tim raised idea I. Not tested.

**I. The copilot states everything the editor offers for a figure; presets are a cookbook it reads and restates; one signature for creating and for every edit, the editor's tool included.** Raised by Tim (§2.1, 5), in tentative words: "i am beginning to think", "(perhaps)".

- For: no preset the model is not shown; the style would be visible and settable; a rebuilt figure could not lose its preset; one set of names; the metrics with no preset could be drawn. [VIEW: writing agent] The per-type counts of §1.9 suggest a statement of workable size. Its size was not measured.
- Against, or not addressed by it:
  - [VIEW: writing agent] Whole-figure rules would still be needed, and would matter more, because no figure would be pre-authored.
  - [VIEW: writing agent, not run] A value miscopied from a recipe, such as a wrong threshold, would pass every check.
  - [VIEW: writing agent] Something would have to keep the statement's shape equal to the editor's panels (§1.9), which are hand-written.
  - [CHECKED] The coverage disclaimer and the method notes are in presets and not on the metric (§1.5).
  - The size of a statement in tokens, and how reliably a model writes one, were not measured.
- Stands: the direction under test (§2.4). Not ruled. [ACCOUNT] The writing agent told Tim: "I think this is the right direction. I have not tested it, so it is a view, not a conclusion."

**J. Are the whole-figure checks just the zod schema?** Raised by Tim as a question (§2.1, 6).

- [ACCOUNT] The writing agent answered no.
- [VIEW: writing agent, inferred from §1.6 and §1.7, not run] Each case of §1.7 would have a valid shape, and a rule that refuses it would need the metric, and for some the data.
- [VIEW: writing agent] Three layers: zod made stricter for the copilot's input, as one shape per figure type; rules over settings and metric together, on every create and edit; the data and render checks that exist.
- Stands: Tim's reply to that answer began "ok good" (§2.1, 7).

**K. `get_metric_data` takes the same names as a figure for the same things.** Raised by the writing agent. [REPORTED] Review agent 3 recommended the same.

- For: the model could copy its query into a figure.
- Against: [VIEW: writing agent, not run] an MCP client with a cached tool list would send the old names, the schema would strip them, and the query would run unfiltered with no error unless the old names were refused explicitly.
- Stands: [ACCOUNT] Tim was asked twice and has not answered.

**L. Remove the preset's `allowedFilters` gate at creation.** Part of D and E.

- For: [CHECKED] the create path alone enforces it ([build_config_from_preset.ts:70-84](client/src/components/products/copilot/slide_ai/build_config_from_preset.ts#L70-L84)), the listing prints it, and `update_figure` can set a filter on any dimension of the metric.
- Stands: not ruled.

### 2.3 Where a direction was reached [ACCOUNT]

| Direction                                                                                                     | Who said what                                                                                                                                                                           | Standing                                                                 |
| ------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| One set of names for creating and editing a figure                                                            | Tim: "i agree with one-vocabulary", said of idea D before the stress test. [REPORTED] Review agents 1 and 3 supported it (§2.6); agent 2 made no recommendation.                        | Treated here as a ruling (ruling 6). Tim to confirm. Shape not designed. |
| The copilot states a figure's settings itself and does not patch a preset                                     | Tim, as a question and then "you should be just choosing the correct things to begin with - no need to "patch"" (§2.1, 3 and 4)                                                         | Not ruled. Not tested.                                                   |
| The copilot states everything the editor offers; presets are a cookbook; one signature with the editor's tool | Tim, in tentative words (§2.1, 5). The writing agent agreed as a view.                                                                                                                  | Under test in step 1. Not ruled.                                         |
| "extremely solid whole-figure checks"                                                                         | Tim (§2.1, 6)                                                                                                                                                                           | Ruled in those words (ruling 2).                                         |
| What those checks contain beyond the zod schema                                                               | The writing agent's view (§2.2 J). Tim's reply to it began "ok good".                                                                                                                   | A view. Not ruled.                                                       |
| The design is tested before code is planned                                                                   | Tim: "yes, make the split", to a question that described the figure plan as "a file whose first step is the test of the design" (§2.1, 8). What step 1 contains is the writing agent's. | Step 1 is that test.                                                     |
| The figure question is its own plan with its own scope                                                        | Tim (§2.1, 7)                                                                                                                                                                           | Ruled (ruling 1). The scope as listed there is proposed.                 |
| This plan's code can run last, and step 1 at any time                                                         | The writing agent's answer to Tim's question (§2.1, 8)                                                                                                                                  | Proposed (ruling 5). Tim has not ruled.                                  |
| "Anything not stated takes the metric's defaults"                                                             | The writing agent proposed it and withdrew it after the test                                                                                                                            | Withdrawn.                                                               |

### 2.4 The design under test

Nothing here is ruled. Step 1 tests it. Each line says whose it is.

- [TIM, tentative: §2.1, 5] The copilot would state a figure in full, in the settings the editor offers. Nothing would come from a preset it is not shown.
- [TIM, tentative: §2.1, 5] One signature would serve creating a figure and the tools that change one, the editor's tool included.
- [TIM, tentative: §2.1, 5] Presets would be a cookbook the copilot reads and restates.
- [VIEW: writing agent] The statement would be one shape per figure type, so that a setting which does not apply to a type could not be written.
- [VIEW: writing agent] Three layers would check a figure: the shape, in zod; the whole-figure rules, over settings and metric, on every create and every edit; the data and render checks the pipeline already runs.
- [VIEW: writing agent] The checks would be proven on two sets: every figure of the must-pass set accepted, every figure of the must-refuse set refused.

### 2.5 Candidate whole-figure rules [VIEW: writing agent, collecting its own and the review agents' suggestions]

None is designed, and none has been run against either set.

- Time is on an axis, or the figure states a period window, or it states that it covers all periods.
- A map has one value and an admin level on its area.
- A pie is never of percentages or averages, unless it is in its completion mode.
- A special chart style is on only for a metric that may use it and a figure with the data shape it assumes.
- No two dimensions share a slot unless one is filtered to a single value, whatever the data of the day holds.
- Every required dimension is placed, and a type is offered only where the metric allows it (a timeseries needs a period column).
- A key the schema does not know is refused, not dropped.
- The data the model reads back for a figure is queried as the figure queries it.
- A figure's result states the period shown and the dimensions pooled.

### 2.6 What the three reviews concluded [REPORTED]

- **Review agent 1 (adversarial, on idea E).** In its words the design was "Not safe as stated." It called one set of names and a change in place sound. It called creating from a metric safe only with additions, in its order: whole-figure invariants at creation and after every edit, tested against every preset and every Explore figure, with the read-back querying what the figure queries; unknown keys refused, and the info docs, brief and listing rewritten in the same commit; no-preset defaults that borrow style and footnote from the same-type preset, with the date range as sub-caption and relative period windows statable.
- **Review agent 2 (measurements).** No recommendation. Its numbers are in §1.4 and §1.5.
- **Review agent 3 (its own design, shown no other).** One statement for both verbs: a metric, an optional preset as starting point, and a patch in stored names. With no preset, the type and a full `disaggregateBy` are required and nothing is slotted silently. The model never states style. One function runs the whole sequence for all tools, and its pure half moves to `lib/ai_tools/` so tests can reach it. Before committing, it wanted: a test that every preset and every Explore figure passes the whole-figure checks; an audit by the module owner of which dimensions may be pooled per metric; a scripted trial on real cases with a person judging each drawing; the token size of the tools array, since eight tools embed the create schema.
- [ACCOUNT] Review agent 3's design and idea I differ in two places: its design keeps style away from the model, and keeps the preset as a named starting point. Tim raised idea I after its report, and it was not asked about it.

### 2.7 Open questions [ACCOUNT: raised in the conversation or while writing this file; none answered]

- Is every setting stated at creation, or only the ones that change what the numbers mean?
- Does a preset's id appear in a statement at all?
- With idea I, is a tool that changes a figure in place still wanted, or does restating the figure do?
- Where does the list of settings per type live, so that the editor and the copilot cannot drift?
- Does `get_metric_data` take the same names for the same things (idea K)?
- Does `allowedFilters` stay as anything (idea L)?
- Where does text such as the coverage disclaimer live, so that it does not depend on a preset?
- Should panther's map refuse two rows for one area, as its table does?
- What does an edit do to a stored figure that fails a rule, such as the 17 of §1.7?
- What does a figure's result tell the model?
- Can a model write a full statement correctly at the first attempt? [VIEW: writing agent] Reading code cannot settle it.

## §3 Rulings

1. **The figure question is its own plan with its own scope.** Ruled (§2.1, 7). The scope as the writing agent lists it is proposed: how the copilot creates, edits and reads a figure, in a deck, a draft slide, a report and the figure editor, and what checks a figure before it is stored. _(proposed)_
2. **"extremely solid whole-figure checks".** Ruled in Tim's words (§2.1, 6). What they contain beyond the zod schema is the writing agent's view (§2.2 J), to which Tim's reply began "ok good".
3. **The checks are proven on a must-pass set and a must-refuse set**, both kept as tests. _(proposed)_
4. **The design of §2.4 is the one step 1 tests.** It is not a ruling of how the copilot will state a figure. _(proposed)_
5. **This plan's code runs last**, after PLAN_COPILOT_TOOL_LIMIT.md and PLAN_02_COPILOT_SURFACE_GAPS.md are gone, and step 1 runs at any time. The writing agent's reasons: the Surfaces of the three plans name the same tool files, and PLAN_02's ruling 1 says it changes no figure. _(proposed)_
6. **One set of names for creating and editing a figure.** Tim: "i agree with one-vocabulary", said of idea D before the stress test. Treated here as a ruling; Tim to confirm. What the names and the shape are is step 1's to test.
7. **Nothing ships in this plan.** _(proposed)_

## §4 Steps

Step 1 is as the writing agent wrote it. Tim approved a figure plan "whose first step is the test of the design" (§2.1, 8). What the step contains is proposed.

### Step 1: test the design (not code)

**Surface.** This file.

**Deliverable.**

- Every [REPORTED] line of §1.8 and every "not run" inference of §1.7 that the design or a rule depends on is reproduced, or struck with the reason.
- A prototype outside the repo: the statement schema per figure type, its conversion to and from the stored settings, and the whole-figure rules, each a pure function.
- The must-pass set run through it: every preset of every module (under `FASTR_MODULES_LOCAL_DIR`), every figure `deriveViewConfig` gives for every Explore binding, and the figures of at least one production deck. Each must be statable, must convert back to its stored settings field for field, and must pass every rule. Every failure is named as one of three: a gap in the schema, a wrong rule, or a stored figure that is itself wrong.
- The must-refuse set run through it: every case of §1.7 and §1.8 once reproduced. Each must be refused by a rule whose message names the fix.
- Editor parity: per figure type, the settings in the schema set against the settings the editor's panels set, with every difference listed.
- Size: the statement of a typical table, chart, timeseries and map, and the cookbook entry of a preset.
- Two independent reviews of the result: one told to find a misleading figure the rules accept, one designing the statement shape from the problem alone. Neither is given the conclusion.
- An answer with evidence, or a question for Tim, on each open question of §2.7.
- The findings go to Tim in the chat, as what exists, what this plan says and what is proposed, with every opinion marked as one. On his rulings, §2, §3 and §4 of this file are rewritten: the rulings as heard, and every code step with its Surface, Deliverable, Gates and end.

**Not in this step.** Any change to this repo's code, to the modules repo or to panther.

**Gates.** `git status --short` shows this file and nothing else.

**Ends with.** One commit rewriting this plan, after Tim's rulings.

### Steps 2 onward

Written by step 1.

## §5 Out of scope

- **Image blocks, a slide's own settings, the deck's settings, and a rendered image of a slide**: PLAN_02_COPILOT_SURFACE_GAPS.md. (Ruled with the split, §2.1, 8.)
- **New figure types and significance testing in the HFA module.** [TIM pasted] The copilot's answer to the user also listed "No gauge/donut arc visuals" and "No statistical-significance testing". [ACCOUNT] The writing agent told Tim these were product features outside both plans, and Tim did not reply to that point. _(proposed)_
- **The 17 figures of §1.7 in the production deck.** [VIEW: writing agent] They are a deck to change, not code. _(proposed)_

## §6 Log

### NOTES FROM EXPERIMENT WITH AI AGENT IN sierraleone PROD INSTANCE

Developer request: figure-editor tools (AI assistant) Tested in the package figure viewer, preset “HFA indicators”, metric m10-01-01, on 2026-11-13. Every item below was reproduced in this session. I re-ran the checks and looked at an image after each render-affecting change.

Changes from my earlier notes:

I dropped the “Mental health & psychosocial support” sub-category item and the pie-slice claims. I could not verify them. I downgraded the tall-image item, because the table is readable. I corrected the map item. A district-level map isn’t rejected for lacking a map dimension if an admin dimension is already disaggregated. It is rejected because no data areas match any boundaries. P1: Wrong or unverifiable output

1. Roll-up is not in the config readback.

Repro: with admin_area_2 as rowGroup, call update_figure_editor with {"rollupDimension":"admin_area_2","rollupPosition":"top"}. Then call get_figure_editor. Actual: the update result says “applied”. Neither the echo nor get_figure_editor shows any roll-up field. The render does show a “National” group at the top, and removing the roll-up removes it. Expected: a Roll-up: admin_area_2 (top) line, so an agent can verify state without an image. 2. HFA maps never render, although the package header says boundaries exist.

Context: the header says boundary files exist for HFA at admin_area_2 and admin_area_3. Repro: set type: map with admin_area_2 as mapArea, then again with admin_area_3. Actual: “none of the 5 data areas matches one of the 16 boundaries” at district level. “none of the 16 data areas matches one of the 22 boundaries” at chiefdom level. Note: the cause is unverified. It looks like a name or ID mismatch between the HFA areas and the boundary files. Related: with an admin dimension already disaggregated, type: map auto-assigns mapArea. With none, the error is A map needs one dimension displayed as "mapArea"…. Earlier, from a pie config, the same situation gave a different message: “Map figure has no admin-area map dimension”. 3. Threshold colouring ignores indicator direction and unit.

Lower-is-better indicators are coloured as if higher is better: Water outage 0.0% is red. “Vaccine stockouts frequent or constant” 2.5% is red. Electricity outage 100.0% (Southern hospitals) is green. Non-percent values are coloured by the percent thresholds: “Index: PPE 66.7”, “Index: Diagnostics 47.1” and “Index: Vaccines 93.2” are all green. Expected: respect the declared direction and unit per indicator, or disable the colour scale where it can’t apply. 4. Chart type has no series key.

Repro: convert the table to a chart. admin_area_2 becomes series, giving five bars per panel. Actual: nothing identifies which bar is which district, and the only legend is the threshold colours. For comparison: the same config as a pie does show a district legend. Also: the x-axis label under every chart panel reads “value”. 5. Pie row labels overprint the first column of pies. For example, “Water source available” and “Water outage (last 7 days)” overlap the first pie.

P2: Behaviour that surprises 6. A stale replicant value survives a change of replicant dimension, and the error text misleads.

Repro: replicating by hfa_category with medical_supplies selected, set disaggregateBy to replicate by hfa_sub_category without a value. Actual: Invalid replicant value "medical_supplies" (pass the id, not the label). The value is a valid id for the old dimension, so the hint is wrong. Also: sending selectedReplicantValue: null then fails with “needs a selected replicant value”. Expected: default to the first valid value, or say “the replicant dimension changed; pick one of…”. The valid-values list itself is helpful. 7. type: timeseries is accepted as an enum value but can never work on this metric.

Actual: the first error is “Timeseries config missing timeseriesGrouping”. Then year, period_id and quarter_id each fail with “Available: none”. Expected: reject the type up front with “metric has no time period column”, as periodFilter already does. 8. null is rejected for footnote, caption and subCaption.

Actual: each gives “expected string, received null”. "" works. Inconsistent with: selectedReplicantValue, valuesFilter, periodFilter and rollupDimension, which accept null. 9. A single-value column header is hidden. time_point has only “Round 1”. Its header disappears in both the col and colGroup slots.

1. The legend format differs by replicant. It reads “≥ 80% / 70% – 80% / < 70%” for infrastructure, and “≥ 0.8 / 0.7 – 0.8 / < 0.7” for medical_supplies, while the cells show percentages.

P3: Error messages, schema and ergonomics 11. get_metric_data misreports a wrong disaggregations shape.

Repro: pass [{"disOpt":"hfa_category"}]. Actual: the error is “Invalid option: expected one of <the whole enum>”, with no hint that plain strings are expected. Context: update_figure_editor uses objects (disOpt and disDisplayOpt) in disaggregateBy and filterBy, so the two are easy to mix up. 12. A duplicated dimension gives an internal-jargon error. Using hfa_indicator in both row and col gives colProp and rowProp are both given dimension "hfa_indicator". Pre-validate on disOpt and use slot names.

1. __BLANK leaks into user-facing values.

Ownership: facility_ownership has the single value __BLANK. All 365 facilities for ind084 fall in it, yet it is advertised as an available dimension. Sub-category: the replicant list shows__BLANK ((Blank)), with doubled parentheses. Suggestion: hide empty dimensions and tidy the label. 14. Images are one-shot with no persistent text. The image result gives only the size (for example “1024×1198 px”). Please add a short text record, such as row and column counts, legend present or not, and truncated or scaled.

1. Tall images are capped.

Repro: a 70-row table came back at 915×2046, narrower than the usual 1024. Actual: it was complete and legible, but it will degrade for longer tables. Suggestion: an option to paginate or crop. 16. There is no reset-to-preset or undo tool. After heavy testing the draft stays modified. The draft is currently a chart of medical supplies with the caption “TEST: tall table”. Closing the viewer discards it.

1. The dimension enums are global. The tool schema lists year, month and so on for every metric. Per-metric validation exists and its message is good: “Disaggregation(s) not available for metric… Available: …”. Low priority.

Confirmed working, no change needed Atomic failures: a failed update leaves the draft unchanged (“No changes were applied”), and a following read confirmed it. Type conversion remaps slots and reports them: table to chart gave rowGroup → series and colGroup → cell chart to pie gave colGroup → indicator Per-type slot validation: each type gets its own valid-slot list. Valid values on rejection: errors list valid values for filters, replicants and dimensions, and replicant validation respects filters in the same call. Updates report no-ops explicitly: an identical update returns “no change (the stored config already matched)”. Guards that reject correctly: removing a required dimension valuesDisDisplayOpt on a single-value figure (chart type) periodFilter on a non-time metric a roll-up on a dimension that isn’t disaggregated Roll-up rendering: adding and removing a roll-up renders correctly. Parallel calls: several updates in one reply run in order and return separate results.
