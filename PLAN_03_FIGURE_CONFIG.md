# PLAN: The figure config

Status: NEEDS DESIGNING. Step 1 designs the config. No code step exists until Tim has ruled on that design.

**The objective.** [TIM, 2026-11-19] "we essentially optimise PresentationObjectConfig as the best possible stored JSON-only config object, that gives us the best possible shape for creating the figures we want in wb-fastr in a way that works for AI too". [TIM] "then the only other schema is panther's on figure schema, and we have a conversion func as part of this lib". So `PresentationObjectConfig` is redesigned as the one description of a figure in this app: what is stored, what the editor and the presets write, and what the copilot states and reads. Statements in this file are marked by kind (§0). Nothing here is a design decision except this objective and the rulings of §3.

**Next step: Do 1.**

Branch: `main`. Repos: this one, and `wb-fastr-modules`, whose presets hold the config (§1.3). Step 1 writes each repo's steps. Read first: [CLAUDE.md](CLAUDE.md), [SYSTEMS.md](SYSTEMS.md), [SYSTEM_02_persistence.md](SYSTEM_02_persistence.md) on data transforms, [SYSTEM_09_viz_query_cache.md](SYSTEM_09_viz_query_cache.md), [SYSTEM_10_figure_render_export.md](SYSTEM_10_figure_render_export.md) "FigureBundle architecture" and "Special chart modes", [SYSTEM_11_viz_authoring.md](SYSTEM_11_viz_authoring.md) "The embedded figure editor", "The insert-figure wizard", "lib config semantics" and "Explore query model", [SYSTEM_13_ai_assistant.md](SYSTEM_13_ai_assistant.md) "Tool input schemas", "The slide_ai conversion layer" and Open items "Surface gaps", [SYSTEM_16_collaboration.md](SYSTEM_16_collaboration.md), [PROTOCOL_APP_AI_TOOLS.md](PROTOCOL_APP_AI_TOOLS.md), [PROTOCOL_APP_MIGRATIONS.md](PROTOCOL_APP_MIGRATIONS.md), and in the modules repo `DOC_VIZPRESET_STANDARDS.md`. Start when: step 1 at any time, since it writes no file but this one _(proposed)_. Every code step (ruling 2): `test ! -e /Users/timroberton/projects/panther/timroberton-panther/PLAN_01_CLOSED_TOOL_INPUTS.md && echo ok` prints `ok`.

## §0 How to work this plan

The instruction is "Do the next step of PLAN_03_FIGURE_CONFIG.md." Branch, floor, conditional gates, reading order and the review cadence are [PROTOCOL_APP_PLANS.md](PROTOCOL_APP_PLANS.md) and [panther/protocols/PROTOCOL_ALL_PLANS.md](panther/protocols/PROTOCOL_ALL_PLANS.md). The log is §6. Step 1 sets the last step when it writes the steps after it.

### The kinds of statement in this file

- **[CHECKED]**: read in the code, or run, by the agent that wrote this file ("the writing agent") on 2026-11-19. Where the code has moved, the code wins.
- **[TIM]**: Tim's words, quoted as typed.
- **[ACCOUNT]**: what a quote of Tim's replied to, as an earlier version of this plan recorded it (`git show 46469d6f8:PLAN_03_COPILOT_FIGURES.md`, §2.1). Written by an agent that was in that conversation, and not a quote.
- **_(proposed)_**: written by the writing agent and not heard from Tim. It stands unless Tim overrules it before the step that depends on it.

A heading's mark covers everything under it. A line's own mark overrides its heading's. Unmarked text is procedure, vocabulary, or a ruling of §3.

### Vocabulary

- **figure**: a metric and its config.
- **the config**: `PresentationObjectConfig`, today `{ d, s, t }`: the data settings, the style and the text.
- **preset**: a config a module author wrote for a metric (`vizPresets`, in the modules repo).
- **the editor**: the figure editor a person uses (`client/src/components/_shared/figure_editor/`).
- **slot**: where a dimension is laid out in a figure (`disDisplayOpt`: row, col, series, replicant and so on).
- **whole-figure check**: a check over a figure's config and its metric together, run on the whole figure and never only on what a call changed.
- **misleading figure**: one that draws without error and shows numbers other than what its text says.

### Rules peculiar to this plan

[TIM] On how this work is done:

- "This discussion affects possibly the most high-stakes part of the app. Figures in presentations for policy makers."
- "did you stress test your idea in any way? did you give it to independent agents?"
- "please be clearer. tell me what exists now, what the plan currently suggests, and what you propose"
- "i want a fresh agent to have all needed context but IMPORTANTLY... NO OPINIONS STATED AS FACTS"

The rules the writing agent draws from them _(proposed)_:

- No design is put to Tim before it has been tested against the code and attacked by an independent agent that was not given the conclusion. A proposal states three things: what exists now, what this plan says, what is proposed.
- An opinion is marked as one, with whose it is, and is never restated as a fact.
- Step 1 writes no file in any repo but this plan. Anything it builds to test the design lives outside the repos. Production data it reads is read-only under PROTOCOL_ACCESS_DBS.md and is deleted when the step ends.

[TIM] On plan file names: "Dont use the word WAIT in plans. That is my designation to give" and "number these plans PLAN_01_ PLAN_02_ PLAN_03_ which is much more helpful".

### Facts for running measurements [CHECKED]

- A module's built definition is `<modules repo>/mNNN/definition.json`. Its metrics are under `.metrics[]` and each metric's presets under `.vizPresets[]`, each with `config { d, s, t }`. The eight modules hold 37 metrics and 50 presets.
- `definition.json` holds no `disaggregationOptions`. The app's test helper `metricsWithStatusOf(defs, EVERY_FACILITY_COLUMN)` builds each metric as the widest package carries it ([\_module_definitions.ts:53](server/tests/_module_definitions.ts#L53), [:67](server/tests/_module_definitions.ts#L67)).
- A script outside the repo runs `lib`, panther and the client's pure figure modules (`client/src/generate_visualization/`) under Deno with a config file of its own: the root `deno.json` import map with absolute paths, plus `panther` mapped to `panther/mod.deno.ts` and `~/` to `client/src/`, with `"unstable": ["sloppy-imports"]`, run with `--allow-read --allow-env --allow-ffi --allow-sys --no-check`.
- Stored figures are in `slides.config` (a content slide's `layout` is a tree whose `type: "item"` nodes carry `data`; a figure block is `data.type == "figure"` with `data.bundle`) and in `reports.figures` (a registry of figure blocks by id), in each instance's `main` database, read as PROTOCOL_ACCESS_DBS.md describes.

## §1 The problem

### 1.1 Today's stored config [CHECKED]

- The config is `{ d, s, t }` ([\_presentation_object_config.ts:144](lib/types/_presentation_object_config.ts#L144)). Each part is a `z.object`, which strips a key it does not know.
- `d` is `configDStrict` ([\_metric_installed.ts:161](lib/types/_metric_installed.ts#L161)): the type, the time grouping, the slot of the values, the values filter, `disaggregateBy` (each entry a dimension, its slot and an optional roll-up flag and position), `filterBy`, the period filter and the selected replicant value.
- The five figure types are timeseries, table, chart, map and pie ([\_metric_installed.ts:39](lib/types/_metric_installed.ts#L39)). One enum of nine slots serves all five ([:46](lib/types/_metric_installed.ts#L46)). Which slots a type takes is in `VIZ_TYPE_CONFIG` ([presentation_objects.ts:120](lib/types/presentation_objects.ts#L120)), not in the schema, so the schema accepts a slot the figure's type does not have.
- `s` is one flat object that holds every figure type's style at once ([\_presentation_object_config.ts:33](lib/types/_presentation_object_config.ts#L33)): a table carries `mapProjection` and a map carries `barsStacked`.
- The four special chart styles of a timeseries are four booleans ([\_presentation_object_config.ts:63-70](lib/types/_presentation_object_config.ts#L63-L70)). More than one can be true. The renderer tests them in a fixed order and draws the first ([get_style_from_po.ts:37-76](client/src/generate_visualization/get_style_from_po.ts#L37-L76)).
- Shading is 16 flat `cf*` fields merged into `s` ([conditional_formatting_standalone.ts:46](lib/types/conditional_formatting_standalone.ts#L46)). The editor and the renderer read them through a union, `ConditionalFormatting`, with `selectCf` and `flattenCf` between the two ([conditional_formatting.ts:72](lib/types/conditional_formatting.ts#L72), [:82](lib/types/conditional_formatting.ts#L82), [:143](lib/types/conditional_formatting.ts#L143)).
- `t` is the caption, the sub-caption, the footnote and a relative font size for each ([\_presentation_object_config.ts:133](lib/types/_presentation_object_config.ts#L133)).
- Four stored fields have no reader. The three font sizes are read only in commented-out lines ([\_0_common.ts:127-129](client/src/generate_visualization/get_style_from_po/_0_common.ts#L127-L129)). `formatAdminArea3Labels` appears in the three schemas of §1.3 and nowhere else in `lib`, `server` or `client/src`.
- Making `configDStrict` a union by figure type was evaluated and declined on 2026-08-06. PROTOCOL_APP_AI_TOOLS.md records it under "Accepted-but-inert patches", with the reasons: about 60 parse sites, the AI schemas derived from `.shape`, and a storage migration.

### 1.2 Where a config is stored, and what writes it [CHECKED]

- A stored figure is a `FigureBundle`: the config with its queried rows, its metric id and its localization ([\_figure_bundle.ts:127](lib/types/_figure_bundle.ts#L127)). Bundles are in slide figure blocks, in a report's figure registry and in saved visualizations.
- A change to the config's stored shape goes through the transform blocks of [po_config.ts](server/db/migrations/data_transforms/po_config.ts), which the sweeps of slides, reports and visualizations run ([\_figure_block.ts](server/db/migrations/data_transforms/_figure_block.ts), [slide_config.ts](server/db/migrations/data_transforms/slide_config.ts), [reports.ts](server/db/migrations/data_transforms/reports.ts), [visualizations.ts](server/db/migrations/data_transforms/visualizations.ts)). CLAUDE.md "Lockstep rules" and PROTOCOL_APP_MIGRATIONS.md bind it.
- While a figure is edited by several people, its config is a Yjs map, field by field ([figure_config_crdt.ts](lib/collab/figure_config_crdt.ts)).
- A stored figure may be on a metric of a retired module. `resolveFigureMetric` gives it the successor metric and carries its config across ([retired_metrics.ts:581](lib/retired_metrics.ts#L581)).
- What writes a config:
  - the editor, whose panels write one field at a time, with one style control file per figure type (`editor_panel_style/`);
  - the insert wizard's Custom path, `getStartingConfigForPresentationObject` ([presentation_objects.ts:510](lib/types/presentation_objects.ts#L510));
  - a change of type, `convertVisualizationType` ([convert_visualization_type.ts:8](lib/convert_visualization_type.ts#L8));
  - a preset, through `deriveConfigFromVizPreset` ([derive_presets.ts:16](lib/derive_presets.ts#L16));
  - the Explore page, through `deriveViewConfig` ([explore_query.ts:696](lib/explore_query.ts#L696)), whose figures are shown and not stored;
  - the copilot (§1.4).

### 1.3 The config is written as a schema three times [CHECKED]

- The stored config: [\_presentation_object_config.ts](lib/types/_presentation_object_config.ts).
- A preset as a package carries it: `vizPresetInstalledStrict` ([\_metric_installed.ts:305](lib/types/_metric_installed.ts#L305)), with `d` as stored, `s` as `configSStrict`, a second copy of the style with every field optional ([:199](lib/types/_metric_installed.ts#L199)), and each text a translated string or null ([:277](lib/types/_metric_installed.ts#L277)).
- A preset as a module author writes it: `configDGithubStrict`, `configSGithubStrict` and `vizPresetGithub` ([\_module_definition_github.ts:184](lib/types/_module_definition_github.ts#L184), [:214](lib/types/_module_definition_github.ts#L214), [:299](lib/types/_module_definition_github.ts#L299)), a third copy.
- The modules repo validates its presets against the third. Its `./vendor_schema` copies `_module_definition_github.ts`, `conditional_formatting_standalone.ts` and `disaggregation_options.ts` from this repo into its `.validation/`.

### 1.4 The copilot's four shapes [CHECKED]

All are in [ai_input.ts](lib/types/ai_input.ts), and each is an open `z.object`.

| Shape        | Schema                             | Tools                                                                                                                                                                              |
| ------------ | ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Create       | `AiFigureFromMetricSchema` (:140)  | `create_slide`, `replace_slide`, `update_slide`, `show_draft_slide_to_user`, `insert_figure`, `replace_figure`, `rewrite_report`, `get_report_pages`                               |
| Edit         | `AiFigureConfigPatchSchema` (:195) | `update_figure`, `update_report_figure`                                                                                                                                            |
| Edit, editor | `AiVizConfigUpdateSchema` (:263)   | `update_figure_editor`                                                                                                                                                             |
| Read         | text, not a schema                 | every read of a figure, through `formatFigureConfigForAI` ([format_figure_config_for_ai.ts:25](client/src/components/products/copilot/_shared/format_figure_config_for_ai.ts#L25)) |

- Create names a preset, which is required, and can state the caption, the replicant value, filters on the dimensions the preset allows, the values shown and a start and end date. Everything else comes from the preset ([build_config_from_preset.ts:22](client/src/components/products/copilot/slide_ai/build_config_from_preset.ts#L22)). 11 of the 37 metrics have no preset.
- Create and edit use two sets of names for the same stored fields:

  | Stored field             | Create                    | Edit                        |
  | ------------------------ | ------------------------- | --------------------------- |
  | `caption`                | `chartTitle`              | `caption`                   |
  | `filterBy`               | `filters`                 | `filterBy`                  |
  | `selectedReplicantValue` | `selectedReplicant`       | `selectedReplicantValue`    |
  | `periodFilter`           | `startDate` and `endDate` | `periodFilter { min, max }` |

- The type and the time grouping can be stated only through `update_figure_editor`. No shape states any style: the edit schema's own comment says style is excluded by design ([ai_input.ts:186-193](lib/types/ai_input.ts#L186-L193)).
- The read prints the metric, the type, the dimensions and their slots, the filters, the replicant, the values, the period filter and the three texts. It prints no style, no time grouping and no roll-up.
- An edit is checked only on what its patch touches, by contract ([validate_figure_config_edit.ts:54](client/src/generate_visualization/validate_figure_config_edit.ts#L54)).
- The three edit tools each hold their own copy of one sequence of calls: apply the patch, check the edit, check the data, describe the change, resolve the bundle, check the slots ([update_figure.ts:163-213](client/src/components/products/copilot/ai_tools/tools/update_figure.ts#L163-L213), [figure_editor.ts:178-211](client/src/components/products/copilot/ai_tools/tools/figure_editor.ts#L178-L211), [report_editor.ts:640-684](client/src/components/products/copilot/ai_tools/tools/report_editor.ts#L640-L684)).
- `get_metric_data` takes `AiMetricQuerySchema` ([ai_input.ts:39](lib/types/ai_input.ts#L39)): the create names `filters`, `startDate`, `endDate` and `valuesFilter`, and one name of its own, `disaggregations`, a list of dimensions with no slots. One builder makes the tool for the app's copilot and for `/mcp` ([tools_metrics.ts:94](lib/ai_tools/tools_metrics.ts#L94), [copilot_tools.ts:47](client/src/components/instance/copilot_tools.ts#L47), [mcp_tools.ts:59](server/mcp/mcp_tools.ts#L59)).
- A preset's `allowedFilters` is read in two places. The create path refuses a filter on a dimension it does not list ([build_config_from_preset.ts:71-84](client/src/components/products/copilot/slide_ai/build_config_from_preset.ts#L71-L84)), and the metrics listing prints it ([format_metrics_list_for_ai.ts:126](lib/ai_tools/format_metrics_list_for_ai.ts#L126)). No edit tool reads it.

### 1.5 What Tim has said about the copilot's tools [TIM]

Each quote is Tim's, from 2026-11-13. The words before a quote say what it replied to and are [ACCOUNT].

1. After being told that `update_figure` cannot change a chart type and that creation would gain a field for the type: "do we really need update_figure for slides, when we can just replace? Or is the issue that we can't see the original in full?"
2. Of a proposal for one set of names in which a create still names a preset and adds a patch to it: "i agree with one-vocabulary, but i am unclear why it needs to be from a preset... aren't we at the point now where we can just create things from metrics?", then "and if it's from metric, why is it a patch? what is there to patch?" and "you should be just choosing the correct things to begin with - no need to "patch""
3. After a stress test of creating a figure from a metric's defaults: "i am beginning to think that the presets system is potentially a footgun. it would be better for the AI to have to specify everything that the user's UI figure editor has, and thus have visibility into everything, and also thus have the same tool signature for editing figures in the UI editor (perhaps). And presents are essentially a cookbook that AI can see and recreate." ([ACCOUNT] "presents" was read as presets.)

### 1.6 Panther's figure schema [CHECKED]

- Panther draws a `FigureInputs`: the rows, which column sits on which axis, the style, the three texts and the legend. Its zod schema is `zFigureInputs` ([figure_inputs.ts:268](panther/_150_figure_schema/figure_inputs.ts#L268)).
- `buildFigureInputs` makes one from a stored bundle each time a figure is drawn ([build_figure_inputs.ts:71](client/src/generate_visualization/build_figure_inputs.ts#L71)). It is not stored.

## §2 The model

Written by step 1.

## §3 Rulings

1. **Whole-figure checks.** Ruled in Tim's words (2026-11-13): "Please - extremely solid whole-figure checks, which if I understand would just be the zod schema (and don't we already have this?)". What the checks are is step 1's to design.
2. **Every tool input is closed.** Ruled (Tim, 2026-11-19). Every object in a tool input is `z.strictObject` at every level, panther's `createAITool` refuses an open one, and the API's `strict: true` is still never sent. The work is panther's `PLAN_01_CLOSED_TOOL_INPUTS.md` (`/Users/timroberton/projects/panther/timroberton-panther/`), which holds the evidence and closes every tool schema in this app. It runs before this plan's code steps. "Never `z.strictObject()`" in PROTOCOL_APP_AI_TOOLS.md is withdrawn, and that plan rewrites it. So the config, as the copilot's input, is closed at every level.
3. **One set of names for creating and editing a figure.** Ruled. Tim, 2026-11-13: "i agree with one-vocabulary" (§1.5, 2).
4. **One input.** Ruled (Tim, 2026-11-19). The copilot states a config. Changing a figure means stating it again, through one input shared by creating, replacing and the editor's tool. It rests on §1.5: "can just replace", "no need to "patch"" and "the same tool signature".
5. **No preset id in an input.** Ruled (Tim, 2026-11-19). A preset is a config the copilot reads as a recipe and states itself. An id would bring settings from somewhere the input does not show.
6. **`get_metric_data` takes the same names for the same things.** Ruled (Tim, 2026-11-19), under ruling 3.
7. **The app stops reading `allowedFilters`.** Ruled (Tim, 2026-11-19). The create path from a preset is all that enforces it (§1.4), and with no preset in the input nothing does. Whether the field leaves the module definitions is step 1's to put to Tim _(proposed)_.

Step 1 tests rulings 4 to 7. It does not reopen them.

## §4 Steps

Tim ruled that step 1 designs the config and writes the steps after it. What step 1 contains is the writing agent's _(proposed)_.

### Step 1: design the config (not code)

**Surface.** This file.

**Deliverable.**

- The config's schema in full: closed at every level, JSON-only, every field with the reason it is there.
- The shape designed with the last step's move in view, so that a yes there does not migrate every stored figure a second time. Step 1 reads panther's `PLAN_20_LONG_TABLE_FIGURE.md` and `TERMINOLOGY.md` (`/Users/timroberton/projects/panther/timroberton-panther/`) and says, for each part of the config, whether it could live in panther as designed or needs this app's metrics.
- For each thing that writes or reads a config (§1.2, §1.4, §1.6), what it does under the new shape: the editor, the wizard, a change of type, the presets and the modules repo's schema, the Explore page, the collab map, `buildFigureInputs`, the copilot's one input (ruling 4), what the copilot reads back, and `get_metric_data` (ruling 6).
- Rulings 4 to 7 tested. For ruling 4: whether a model restates a whole config without changing a setting it did not mean to.
- What becomes of every stored config: the bundles in slides, reports and saved visualizations, figures on retired metrics included, and the 50 presets.
- The whole-figure checks (ruling 1): each check, whether it needs the config alone, the metric or the data, and where it runs.
- The design tested before it is put to Tim (§0): against every preset of every module, every figure `deriveViewConfig` gives, and the stored figures of at least one production instance, and attacked by an independent agent that was not given the conclusion.
- The findings go to Tim in the chat, as what exists, what this plan says and what is proposed, with every opinion marked as one. On his rulings, §2, §3 and §4 of this file are rewritten: the rulings as heard, and every code step with its repo, Surface, Deliverable, Gates and end.

**Not in this step.** Any change to this repo's code, to the modules repo or to panther.

**Gates.** `git status --short` shows this file and nothing else.

**Ends with.** One commit rewriting this plan, after Tim's rulings.

### Steps 2 onward

Written by step 1.

### The last step: does the config move into panther? (a question, not code)

[TIM, 2026-11-19] "if this new optimised stored figure config essentially becomes a reduced JSON-only version of figure inputs that is AI-friendly, could it be moved into panther itself. That way we can maintain the light-storage version of the figure inputs in the same place as the inputs themselves."

Step 1 writes this as the plan's last step. It answers whether the config, or which part of it, moves into panther. What it starts from [CHECKED]:

- Panther's `PLAN_20_LONG_TABLE_FIGURE.md` already plans to take "the generic "figure over a long table" model" out of this app. It names a `d` config (the figure type, each dimension on a slot, filters, the period filter, the values filter, the replicant, the roll-up and the timeseries grain), kept apart from any style type. It runs after this plan closes, and says this plan's "whole-figure rules and per-type shape are part of the model this plan extracts". Its open question is whether `VIZ_TYPE_CONFIG` is universal or this app's taste.
- Panther's `PLAN_21_FIGURE_JSON_INPUT.md` plans a JSON form of panther's own style.
- The config holds no rows. It says what to read of a metric and how to lay it out and draw it, where a `FigureInputs` holds the rows themselves (§1.6).
- Some of what the config means comes from this app's metrics: which dimensions a metric requires, how its values combine, and which special chart styles it may use ([special_chart_checks.ts](client/src/generate_visualization/special_chart_checks.ts)).

## §5 Out of scope

- **Panther's figure schema.** The objective names it as the one other schema. Its own JSON form is panther's `PLAN_21_FIGURE_JSON_INPUT.md`. _(proposed)_
- **New figure types and significance testing.** _(proposed)_

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
