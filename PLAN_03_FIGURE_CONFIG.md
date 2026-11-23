# PLAN: The figure config

Status: THE CONFIG IS DESIGNED AND RULED (2026-11-20). THE VALIDATOR, THE EDITOR'S GATE AND THE STALE CHECK ARE RULED (2026-11-22). Step 1 designed the config (§2), tested it (§1.7) and took Tim's rulings (§3). Step 2 settled where the validator and the renderer disagree, ran the editor's rule and saw it replaced by one gate at the editor's write, and settled the stale check (rulings 12, 17 and 18, §1.10). How two people's edits combine is not designed (ruling 16). Step 3 wrote the Surfaces of the code steps (2026-11-22), which start with step 4. Step 4 gave panther the leaf schemas the config imports (2026-11-22, §2.5). Step 5 built the schema, the validator, the conversion and what §2 derives from a config in `lib/figure_config/`, which nothing the app runs reads yet (2026-11-22). The tests run before the cutover (§1.11) added step 6, on Tim's word, and the steps after it moved up by one (2026-11-23). Step 6 built and tested the functions the cutover builds on, which nothing the app runs reads yet (2026-11-23). Step 7 was then checked against PROTOCOL_APP_MIGRATIONS.md and amended on Tim's word (ruling 19, 2026-11-23), and reviewed against the code by five independent agents, whose findings and rulings 20 to 22 rewrote it (2026-11-23).

**The objective.** [TIM, 2026-11-19] "we essentially optimise PresentationObjectConfig as the best possible stored JSON-only config object, that gives us the best possible shape for creating the figures we want in wb-fastr in a way that works for AI too". [TIM] "then the only other schema is panther's on figure schema, and we have a conversion func as part of this lib". So `PresentationObjectConfig` is redesigned as the one description of a figure in this app: what is stored, what the editor and the presets write, and what the copilot states and reads. [TIM, 2026-11-22] "this plan is about reshaping the stored poConfig type so that it the shape/type is clearer, easier to understand, and less prone to errors." Statements in this file are marked by kind (§0). Nothing here is a design decision except this objective and the rulings of §3.

**Next step: Do 7.**

Branch: `main`. Repos: this one; `wb-fastr-modules` (`/Users/timroberton/projects/apps/wb-fastr-modules`), whose presets hold the config (§1.3); and panther (`/Users/timroberton/projects/panther/timroberton-panther`), which gains the low-level schemas the config imports (ruling 14). §0 names each step's repo. Read first: [CLAUDE.md](CLAUDE.md), [SYSTEMS.md](SYSTEMS.md), [SYSTEM_02_persistence.md](SYSTEM_02_persistence.md) on data transforms, [SYSTEM_09_viz_query_cache.md](SYSTEM_09_viz_query_cache.md), [SYSTEM_10_figure_render_export.md](SYSTEM_10_figure_render_export.md) "FigureBundle architecture" and "Special chart modes", [SYSTEM_11_viz_authoring.md](SYSTEM_11_viz_authoring.md) "The embedded figure editor", "The insert-figure wizard", "lib config semantics" and "Explore query model", [SYSTEM_13_ai_assistant.md](SYSTEM_13_ai_assistant.md) "Tool input schemas", "The slide_ai conversion layer" and Open items "Surface gaps", [SYSTEM_16_collaboration.md](SYSTEM_16_collaboration.md), [PROTOCOL_APP_AI_TOOLS.md](PROTOCOL_APP_AI_TOOLS.md), [PROTOCOL_APP_MIGRATIONS.md](PROTOCOL_APP_MIGRATIONS.md), in the modules repo `DOC_VIZPRESET_STANDARDS.md`, and in panther `CLAUDE.md`, `TERMINOLOGY.md` and `DOC_LONG_TABLE_QUERY.md` on period filters. Start when: step 1 at any time, since it writes no file but this one _(proposed)_. Step 2 and every step after it (ruling 2): `test ! -e /Users/timroberton/projects/panther/timroberton-panther/PLAN_01_CLOSED_TOOL_INPUTS.md && echo ok` prints `ok`.

## §0 How to work this plan

The instruction is "Do the next step of PLAN_03_FIGURE_CONFIG.md." Branch, floor, conditional gates, reading order and the review cadence are [PROTOCOL_APP_PLANS.md](PROTOCOL_APP_PLANS.md) and [panther/protocols/PROTOCOL_ALL_PLANS.md](panther/protocols/PROTOCOL_ALL_PLANS.md). The log is §6. The last step is 9. Steps 2 and 3 write in this file. Step 4 is worked in panther and ends with a sync commit here. Steps 5 and 6 are this repo. Step 7 is this repo and `wb-fastr-modules`. Steps 8 and 9 are this repo. `wb-fastr-modules` has no CLAUDE.md. Its floor is `deno task typecheck`, `deno task build` and `deno run --allow-read --allow-net .validation/validate_definitions.ts`, the command its CI runs.

### The kinds of statement in this file

- **[CHECKED]**: read in the code, or run, by the agent that wrote this file ("the writing agent") on 2026-11-19. Where the code has moved, the code wins.
- **[RUN]**: measured on 2026-11-20 by the agent that did step 1 ("the step-1 agent"), with a prototype of §2's schema kept outside the repos, or read in the code by that agent on that day. A count is of that day.
- **[REVIEW]**: reported on 2026-11-20 by an independent agent that was given the prototype and not the step-1 agent's view of it, from scripts it ran against the prototype's first draft. Not rerun by the step-1 agent unless the line says so.
- **[READ]**: read in the code on 2026-11-20, after step 1, by the agent that reviewed this plan ("the reviewing agent"). Where the code has moved, the code wins.
- **[ATTACK]**: reported on 2026-11-20 by an independent agent that was given the reviewing agent's first change to §1.8, §2.2, §2.3 and ruling 12 (`git show 8630af2ba -- PLAN_03_FIGURE_CONFIG.md`) and told to refute it. Not read again by the reviewing agent unless the line says [READ]. A proposal in such a line is that agent's opinion.
- **[RUN2]**: measured on 2026-11-21 by the agent that first worked step 2 ("the step-2 agent"), with step 1's prototype and scripts of its own kept outside the repos, or read in the code by that agent on that day or the next. A count is of that day.
- **[ATTACK2]**: reported on 2026-11-21 by one of two independent agents that were given the step-2 agent's design and told to refute it. Not rerun by the step-2 agent unless the line says [RUN2]. A proposal in such a line is that agent's opinion.
- **[RUN3]**: measured on 2026-11-22 by the agent that worked step 2 as §4 words it ("the second step-2 agent"), with step 1's prototype and scripts of its own kept outside the repos, or read in the code by that agent on that day. A count is of that day.
- **[LISTED]**: reported on 2026-11-22 by an agent that was given no design and asked to list every place that draws a stored figure, marks one stale or writes its rows. Not read again by the second step-2 agent unless the line says [RUN3].
- **[ATTACK3]**: reported on 2026-11-22 by an independent agent that was given the second step-2 agent's proposal and told to refute it. Not rerun by the second step-2 agent unless the line says [RUN3]. A proposal in such a line is that agent's opinion.
- **[RUN4]**: measured on 2026-11-23, after step 5 and before step 6, by the agent that tested the cutover on Tim's word ("the pre-cutover agent"), with scripts kept outside the repos, or read in the code by that agent on that day. A count is of that day. Production was read with SELECT, `ls`, `cat` and `jq` only, and nothing read from it was kept but counts and record ids.
- **[TIM]**: Tim's words, quoted as typed.
- **[ACCOUNT]**: what a quote of Tim's replied to. Written by an agent that was in that conversation, and not a quote. For §1.5 it is as an earlier version of this plan recorded it (`git show 46469d6f8:PLAN_03_COPILOT_FIGURES.md`, §2.1).
- **_(proposed)_**: written by the agent the text names, or by the writing agent where it names none, and not heard from Tim. It stands unless Tim overrules it before the step that depends on it.

A heading's mark covers everything under it. A line's own mark overrides its heading's. Unmarked text is procedure, vocabulary, or a ruling of §3.

### Vocabulary

- **figure**: a metric and its config.
- **the config**: `PresentationObjectConfig`, today `{ d, s, t }`: the data settings, the style and the text.
- **preset**: a config a module author wrote for a metric (`vizPresets`, in the modules repo).
- **the editor**: the figure editor a person uses (`client/src/components/_shared/figure_editor/`).
- **slot**: where a dimension is laid out in a figure (today `disDisplayOpt`: row, col, series, replicant and so on; in §2 a key of `layout`).
- **value props**: the columns of a metric that hold its numbers (`valueProps`). A figure that shows two or more lays them out on a slot, as if they were a dimension.
- **effective**: said of a dimension on a slot that today's renderer lays out. `getEffectivePOConfig` ([normalize_po_config.ts:169](lib/normalize_po_config.ts#L169)) leaves out a dimension filtered to one value, and one that holds one value or one period in the figure's rows.
- **the conversion**: the function that turns a stored `{ d, s, t }` into §2's config (§2.4).
- **whole-figure check**: a check over a figure's config and its metric together, run on the whole figure and never only on what a call changed. §2.2 names three kinds by what each needs: the config alone, the metric, the data.
- **the validator**: the checks that need the config alone and the metric, as one function of a config and its metric that returns its problems. [TIM] "For AI, isn't it as simple as a validator?"
- **problem**: one thing the validator finds wrong: its kind and what it names (a dimension, a slot, a mode). Two configs' problems can be compared.
- **the gate**: the one check at the editor's write. A draft is written only while it has no problem that the config the document holds lacks (ruling 12).
- **settings and rows**: a stored figure's config, and the rows that were fetched for a config.
- **settings key**: a canonical string of what a figure's query reads, from its metric id and its config (§2.3, ruling 17).
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
- Steps 1 and 2 write no file in any repo but this plan. Anything either builds to test the design lives outside the repos. Production data either reads is read-only under PROTOCOL_ACCESS_DBS.md and is deleted when the step ends.

The rules the step-1 agent adds for the code steps _(proposed)_:

- Production is read-only for every step, under PROTOCOL_ACCESS_DBS.md. A read of every instance uses one SSH session for all of them: on 2026-11-20 a script that opened 87 connections in a row had the host refuse SSH for about five minutes [RUN]. No row and no config read from production is committed, and what a step reads is deleted when the step ends.
- `wb-fastr-modules` is committed by this plan and never pushed (ruling 15).
- §2 is the design. Where a step finds that the code does not admit it, the step stops with the question for Tim and designs nothing.

[TIM] On what this plan is and is not, 2026-11-21 and 2026-11-22:

- "i hope that we're not designing for Yjs. It really is a low-priority aspect of the app, and not something we want to design for"
- "Why are we even talking about Yjs!!!! THIS SHOULD HAVE NOTHING TO DO WITH IT!"
- "This plan is to work out the best figure config shape. Why the hell are you designing a complex editing system that will just make things worse."
- "For AI, isn't it as simple as a validator? For UI, we should jsut be able to use conditionals to only allow correct changes?"
- "right now we already have the potential for the UI to put the figure in an error state, and we simply show the error message in the UI so that users can change the fields to correct the issue."

The rules the step-2 agent draws from them _(proposed)_:

- No step designs how two people's edits to one figure combine, how undo behaves, or how the shared document is laid out, beyond what rulings 16, 17 and 21 say.
- No step builds a function that repairs a config on a person's behalf. The editor takes every press and writes a draft only while it has no new problem (ruling 12). The only presses that change more than their own field are the ones §2.3 lists.
- A step that finds its work outside what these quotes describe stops and says so to Tim.

[TIM] On how much this plan may weigh, 2026-11-22, while an independent agent's review of step 2 ran long:

- "isn't a validator something that is either right or wrong?"
- "but isn't the editor just a product of the type itself?"
- "if this requires 40+ to verify, then we have built something too complex."

[TIM] On plan file names: "Dont use the word WAIT in plans. That is my designation to give" and "number these plans PLAN_01_ PLAN_02_ PLAN_03_ which is much more helpful".

### Facts for running measurements [CHECKED]

- A module's built definition is `<modules repo>/mNNN/definition.json`. Its metrics are under `.metrics[]` and each metric's presets under `.vizPresets[]`, each with `config { d, s, t }`. The eight modules hold 37 metrics and 50 presets.
- `definition.json` holds no `disaggregationOptions`. The app's test helper `metricsWithStatusOf(defs, EVERY_FACILITY_COLUMN)` builds each metric as the widest package carries it ([\_module_definitions.ts:53](server/tests/_module_definitions.ts#L53), [:67](server/tests/_module_definitions.ts#L67)).
- A script outside the repo runs `lib`, panther and the client's pure figure modules (`client/src/generate_visualization/`) under Deno with a config file of its own: the root `deno.json` import map with absolute paths, plus `panther` mapped to `panther/mod.deno.ts` and `~/` to `client/src/`, with `"unstable": ["sloppy-imports"]`, run with `--allow-read --allow-env --allow-ffi --allow-sys --no-check`.
- Stored figures are in `slides.config` (a content slide's `layout` is a tree whose `type: "item"` nodes carry `data`; a figure block is `data.type == "figure"` with `data.bundle`) and in `reports.figures` (a registry of figure blocks by id), in each instance's `main` database, read as PROTOCOL_ACCESS_DBS.md describes.
- [RUN2] Step 1's prototype of §2's schema, checks and conversion, and the step-2 agent's scripts over it, were on 2026-11-22 under `/private/tmp/claude-501/-Users-timroberton-projects-apps-wb-fastr/`, in `a816e9d1-ac82-43cd-9e1b-8933006d5ed1/scratchpad/proto` and `a908bc18-2498-44dd-9d46-20e9a815b87d/scratchpad/proto`. The scripts run every preset, every Explore config and the stored figures, those on a retired metric carried to their successor. The folders hold no production data. A step that finds them gone rebuilds what it needs.
- [RUN3] The second step-2 agent's scripts were on 2026-11-22 under the same folder, in `59648c90-a319-4d95-8146-727ccb4783ae/scratchpad/proto`, and the independent agent's in `59648c90-a319-4d95-8146-727ccb4783ae/scratchpad/attack`. `proto/v2.ts` holds the metric checks of ruling 18 and the settings key, `proto/editor.ts` a model of the editor's controls, and `proto/extract.ts` the read of production that runs today's `buildFigureInputs` on each stored bundle. The folders hold no production data.

## §1 The problem

### 1.1 Today's stored config [CHECKED]

- The config is `{ d, s, t }` ([\_presentation_object_config.ts:144](lib/types/_presentation_object_config.ts#L144)). Each part is a `z.object`, which strips a key it does not know.
- `d` is `configDStrict` ([\_metric_installed.ts:161](lib/types/_metric_installed.ts#L161)): the type, the time grouping, the slot of the values, the values filter, `disaggregateBy` (each entry a dimension, its slot and an optional roll-up flag and position), `filterBy`, the period filter and the selected replicant value.
- The five figure types are timeseries, table, chart, map and pie ([\_metric_installed.ts:39](lib/types/_metric_installed.ts#L39)). One enum of nine slots serves all five ([:46](lib/types/_metric_installed.ts#L46)). Which slots a type takes is in `VIZ_TYPE_CONFIG` ([presentation_objects.ts:120](lib/types/presentation_objects.ts#L120)), not in the schema, so the schema accepts a slot the figure's type does not have.
- `s` is one flat object that holds every figure type's style at once ([\_presentation_object_config.ts:33](lib/types/_presentation_object_config.ts#L33)): a table carries `mapProjection` and a map carries `barsStacked`.
- The four special chart styles of a timeseries are four booleans ([\_presentation_object_config.ts:63-70](lib/types/_presentation_object_config.ts#L63-L70)). More than one can be true. The renderer tests them in a fixed order and draws the first ([get_style_from_po.ts:37-76](client/src/generate_visualization/get_style_from_po.ts#L37-L76)).
- Shading is 16 flat `cf*` fields merged into `s` ([conditional_formatting_standalone.ts:46](lib/types/conditional_formatting_standalone.ts#L46)). The editor and the renderer read them through a union, `ConditionalFormatting`, with `selectCf` and `flattenCf` between the two ([conditional_formatting.ts:72](lib/types/conditional_formatting.ts#L72), [:82](lib/types/conditional_formatting.ts#L82), [:143](lib/types/conditional_formatting.ts#L143)).
- `t` is the caption, the sub-caption, the footnote and a relative font size for each ([\_presentation_object_config.ts:133](lib/types/_presentation_object_config.ts#L133)).
- Four stored fields change nothing a figure shows. The renderer reads the three font sizes only in commented-out lines ([\_0_common.ts:127-129](client/src/generate_visualization/get_style_from_po/_0_common.ts#L127-L129)). Their one live reader is the visualization version history, which lists a change to one ([visualization_settings_diff.ts:329-369](client/src/components/products/_shared/version_history/visualization_settings_diff.ts#L329-L369)). `formatAdminArea3Labels` appears in the three schemas of §1.3 and nowhere else in `lib`, `server` or `client/src`.
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

The three schemas are in [ai_input.ts](lib/types/ai_input.ts), and each is a `z.strictObject`, which refuses a key it does not know.

| Shape        | Schema                             | Tools                                                                                                                                                                              |
| ------------ | ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Create       | `AiFigureFromMetricSchema` (:151)  | `create_slide`, `replace_slide`, `update_slide`, `show_draft_slide_to_user`, `insert_figure`, `replace_figure`, `rewrite_report`, `get_report_pages`                               |
| Edit         | `AiFigureConfigPatchSchema` (:206) | `update_figure`, `update_report_figure`                                                                                                                                            |
| Edit, editor | `AiVizConfigUpdateSchema` (:274)   | `update_figure_editor`                                                                                                                                                             |
| Read         | text, not a schema                 | every read of a figure, through `formatFigureConfigForAI` ([format_figure_config_for_ai.ts:25](client/src/components/products/copilot/_shared/format_figure_config_for_ai.ts#L25)) |

- Create names a preset, which is required, and can state the caption, the replicant value, filters on the dimensions the preset allows, the values shown and a start and end date. Everything else comes from the preset ([build_config_from_preset.ts:22](client/src/components/products/copilot/slide_ai/build_config_from_preset.ts#L22)). 11 of the 37 metrics have no preset.
- Create and edit use two sets of names for the same stored fields:

  | Stored field             | Create                    | Edit                        |
  | ------------------------ | ------------------------- | --------------------------- |
  | `caption`                | `chartTitle`              | `caption`                   |
  | `filterBy`               | `filters`                 | `filterBy`                  |
  | `selectedReplicantValue` | `selectedReplicant`       | `selectedReplicantValue`    |
  | `periodFilter`           | `startDate` and `endDate` | `periodFilter { min, max }` |

- The type and the time grouping can be stated only through `update_figure_editor`. No shape states any style: the edit schema's own comment says style is excluded by design ([ai_input.ts:197-204](lib/types/ai_input.ts#L197-L204)).
- The read prints the metric, the type, the dimensions and their slots, the filters, the replicant, the values, the period filter and the three texts. It prints no style, no time grouping and no roll-up.
- An edit is checked only on what its patch touches, by contract ([validate_figure_config_edit.ts:54](client/src/generate_visualization/validate_figure_config_edit.ts#L54)).
- The three edit tools each hold their own copy of one sequence of calls: apply the patch, check the edit, check the data, describe the change, resolve the bundle, check the slots ([update_figure.ts:162-212](client/src/components/products/copilot/ai_tools/tools/update_figure.ts#L162-L212), [figure_editor.ts:178-211](client/src/components/products/copilot/ai_tools/tools/figure_editor.ts#L178-L211), [report_editor.ts:639-683](client/src/components/products/copilot/ai_tools/tools/report_editor.ts#L639-L683)).
- `get_metric_data` takes `AiMetricQuerySchema` ([ai_input.ts:50](lib/types/ai_input.ts#L50)): the create names `filters`, `startDate`, `endDate` and `valuesFilter`, and one name of its own, `disaggregations`, a list of dimensions with no slots. One builder makes the tool for the app's copilot and for `/mcp` ([tools_metrics.ts:94](lib/ai_tools/tools_metrics.ts#L94), [copilot_tools.ts:47](client/src/components/instance/copilot_tools.ts#L47), [mcp_tools.ts:59](server/mcp/mcp_tools.ts#L59)).
- A preset's `allowedFilters` is read in two places. The create path refuses a filter on a dimension it does not list ([build_config_from_preset.ts:71-84](client/src/components/products/copilot/slide_ai/build_config_from_preset.ts#L71-L84)), and the metrics listing prints it ([format_metrics_list_for_ai.ts:126](lib/ai_tools/format_metrics_list_for_ai.ts#L126)). No edit tool reads it.

### 1.5 What Tim has said about the copilot's tools [TIM]

Each quote is Tim's, from 2026-11-13. The words before a quote say what it replied to and are [ACCOUNT].

1. After being told that `update_figure` cannot change a chart type and that creation would gain a field for the type: "do we really need update_figure for slides, when we can just replace? Or is the issue that we can't see the original in full?"
2. Of a proposal for one set of names in which a create still names a preset and adds a patch to it: "i agree with one-vocabulary, but i am unclear why it needs to be from a preset... aren't we at the point now where we can just create things from metrics?", then "and if it's from metric, why is it a patch? what is there to patch?" and "you should be just choosing the correct things to begin with - no need to "patch""
3. After a stress test of creating a figure from a metric's defaults: "i am beginning to think that the presets system is potentially a footgun. it would be better for the AI to have to specify everything that the user's UI figure editor has, and thus have visibility into everything, and also thus have the same tool signature for editing figures in the UI editor (perhaps). And presents are essentially a cookbook that AI can see and recreate." ([ACCOUNT] "presents" was read as presets.)

### 1.6 Panther's figure schema [CHECKED]

- Panther draws a `FigureInputs`: the rows, which column sits on which axis, the style, the three texts and the legend. Its zod schema is `zFigureInputs` ([figure_inputs.ts:268](panther/_150_figure_schema/figure_inputs.ts#L268)).
- `buildFigureInputs` makes one from a stored bundle each time a figure is drawn ([build_figure_inputs.ts:71](client/src/generate_visualization/build_figure_inputs.ts#L71)). It is not stored.

### 1.7 What step 1 measured [RUN]

A prototype of §2's schema, and of the conversion, was run over three sets of today's configs.

| Set                                           | Configs | Fit §2's schema | Pass the metric checks                       |
| --------------------------------------------- | ------- | --------------- | -------------------------------------------- |
| Every preset of every module                  | 50      | 50              | 50                                           |
| Every distinct config `deriveViewConfig` gave | 281     | 281             | 281                                          |
| Stored figures of 29 production instances     | 24,052  | 24,050          | 6,701 of the 6,814 on a metric defined today |

- The stored figures are 23,234 in slides, 708 in reports and 110 saved visualizations: 17,269 timeseries (6,544 disruptions, 6,338 standard, 3,153 percent change, 1,085 coverage, 149 band), 5,160 tables, 985 charts, 637 maps and 1 pie. 16,676 are on retired metrics [REVIEW].
- 7,246 stored figures hold a dimension on a slot that is not effective. 268 hold two things on one slot and draw, because one is not effective. 2 hold two effective dimensions on one slot and do not draw.
- 5,424 stored figures have no value prop to draw. Their bundle's `resultsValue.valueProps` are labels the backfill wrote ([\_figure_block.ts:527](server/db/migrations/data_transforms/_figure_block.ts#L527), [:684-690](server/db/migrations/data_transforms/_figure_block.ts#L684-L690)) while `d.valuesFilter` holds ids. `buildFigureInputs`, run on one (afghanistan slide `2r3`), throws "Need at least one valueProp". 12,009 bundles hold value props that differ from their metric's [REVIEW].
- On yearly data the engine reads every period filter but `custom` as the latest year ([get_fetch_config_from_po.ts:182-185](lib/get_fetch_config_from_po.ts#L182-L185)). 221 stored figures and 2 presets (`m6-02-01/coverage-bar`, `m6-03-01/coverage-bar`) hold another relative filter on yearly data. Both presets leave out `year`, which their metric requires, and so fail today's edit check ([validate_figure_config_edit.ts:128-141](client/src/generate_visualization/validate_figure_config_edit.ts#L128-L141)).
- 68 stored `m6-02-01` charts pool `year`, which the metric requires: 59 under a range of several years, 9 with no period filter.
- The server refuses a query that does not group by a dimension every metric of the results object requires ([run_read.ts:638](server/run_query/run_read.ts#L638)).
- Two more stored fields have no reader: `customSeriesStyles[].strokeWidth` and `.lineStyle`. A `from_month` filter's stored `max` is not read by the engine and is in the cache hash.
- Other stored states: `timeseriesGrouping` on a figure that is not a timeseries, 6,020; a replicant value with no replicant, 1,619; a replicant with no value, 19 stored and 12 presets; a replicant dimension also filtered to one value, 41; a roll-up, 914; a timeseries whose time-axis dimension is also on a slot, 7, on which panther throws [REVIEW]; a map showing several value props, 4; a custom colour scale with no colours, 5; thresholds with two equal cutoffs, 1; a percent-change threshold of 10, 9. The longest filter list holds 390 values and the longest custom order 392 ids. Every stored colour is a hex string or `{ key }`.
- The median config is 1,705 characters today and 746 in §2's shape. The schema as JSON Schema is 15,878 characters and 40 objects, none open.
- A model restating a whole config, tried on the prototype's first draft. 14 stored configs with one change each, haiku and sonnet: all 28 answers exact. 12 structural requests, haiku, sonnet and opus [REVIEW]: all 36 valid; 8 changed a text unasked, one of them replacing `DATE_RANGE` with literal dates; on both requests that added a series all three changed the series colours; one cut four custom colours to one.
- Co-editing [REVIEW]: with one Y.Map key per slot, two people moving dimensions at once lose one and the result parses. A checkpoint the strict parse rejects saves nothing of the slide, report or visualization, and no timer retries it (§1.8). The bridge derives its required keys from `.shape` and relies on unknown keys being stripped ([figure_config_crdt.ts:56-69](lib/collab/figure_config_crdt.ts#L56-L69), [:113-118](lib/collab/figure_config_crdt.ts#L113-L118)).
- Migration [REVIEW]: `transformPOConfigData` run on a converted row adds `d`, `s` and `t` back, and it runs again on every boot for rows holding any of 8 metric ids and on every read of a version snapshot ([versions.ts:65-108](server/db/products/versions.ts#L65-L108)). Each sweep commits its own transaction and a failure exits the server. A package's manifest holds each metric's presets as a JSON string, which no transform reads today.
- `wb-fastr-modules` has no panther copy and no CLAUDE.md, and pins zod `^3.22.4`. Panther exports `zPeriodFilter` and `zLongTableFilter` through both entry files. Its `zColorKeyOrString` is private and a `z.custom`.

### 1.8 What today's editor lets one person write, and how a draft is saved [READ]

- While its host's session is live the editor shows no Apply, and each change to the draft is written to the host's shared document as it is made ([figure_editor.tsx:943-987](client/src/components/_shared/figure_editor/figure_editor.tsx#L943-L987), [:701-715](client/src/components/_shared/figure_editor/figure_editor.tsx#L701-L715)). So a draft is saved, or fails to save, at every press.
- The room saves the document after each change. The save parses the slide, the report's figures or the visualization's bundle with the stored schema. A rejection saves nothing of that document and no timer retries it: the save is tried again when the document next changes, when the last person leaves, and when the room is flushed ([collab.ts:160-182](server/routes/instance/collab.ts#L160-L182), [:434-453](server/routes/instance/collab.ts#L434-L453), [visualization_rooms.ts:69-91](server/collab/visualization_rooms.ts#L69-L91), [doc_rooms.ts:257-285](server/collab/doc_rooms.ts#L257-L285), [:626-630](server/collab/doc_rooms.ts#L626-L630), [:717-732](server/collab/doc_rooms.ts#L717-L732)).
- Before that parse, `dropStorageInvalidTransients` removes three states the schema refuses: a filter with no value, an empty `valuesFilter`, and a period filter the schema rejects ([normalize_po_config.ts:22-57](lib/normalize_po_config.ts#L22-L57)). The editor writes the first two itself: ticking a filter writes it with no value ([filters.tsx:509-512](client/src/components/_shared/figure_editor/editor_panel_data/filters.tsx#L509-L512)), and ticking the value filter writes an empty list ([:145](client/src/components/_shared/figure_editor/editor_panel_data/filters.tsx#L145)).
- The bridge that carries the config through the shared document is written for `{ d, s, t }`: one key per field of `d` and of `s`, and the three texts as Y.Texts. It reads every key the map holds and relies on the open schema to strip one it does not know ([figure_config_crdt.ts:35-36](lib/collab/figure_config_crdt.ts#L35-L36), [:115-143](lib/collab/figure_config_crdt.ts#L115-L143)).
- What today's controls keep one person from writing:
  - a required dimension unticked ([disaggregation_section.tsx:261-288](client/src/components/_shared/figure_editor/editor_panel_data/disaggregation_section.tsx#L261-L288)). A change of type to one not yet seen in the session adds a missing one ([convert_visualization_type.ts:63-76](lib/convert_visualization_type.ts#L63-L76), [summary.tsx:131-158](client/src/components/_shared/figure_editor/editor_panel_data/summary.tsx#L131-L158)), and a change back restores the list that type held ([summary.tsx:115-130](client/src/components/_shared/figure_editor/editor_panel_data/summary.tsx#L115-L130));
  - two filters on one dimension ([filters.tsx:509-512](client/src/components/_shared/figure_editor/editor_panel_data/filters.tsx#L509-L512));
  - a period range out of order, which a two-ended slider sets ([filters.tsx:639-653](client/src/components/_shared/figure_editor/editor_panel_data/filters.tsx#L639-L653));
  - a period filter yearly data does not take, on a figure that holds none: it is offered "Last year" and "Custom" ([filters.tsx:223-241](client/src/components/_shared/figure_editor/editor_panel_data/filters.tsx#L223-L241));
  - thresholds whose buckets and cutoffs are out of step, or whose cutoffs descend: a cutoff and its bucket are added and removed together, and a cutoff is held between its neighbours, which it may equal ([conditional_formatting_editor.tsx:387-432](client/src/components/_shared/figure_editor/_shared/conditional_formatting_editor.tsx#L387-L432));
  - a roll-up on a metric that cannot be rolled up ([disaggregation_section.tsx:355-386](client/src/components/_shared/figure_editor/editor_panel_data/disaggregation_section.tsx#L355-L386));
  - `indicator` colouring on another metric, a filter-only dimension on a slot, and a type the metric cannot draw ([conditional_formatting_editor.tsx:75](client/src/components/_shared/figure_editor/_shared/conditional_formatting_editor.tsx#L75), [editor_panel_data.tsx:91-93](client/src/components/_shared/figure_editor/editor_panel_data.tsx#L91-L93), [presentation_objects.ts:474-482](lib/types/presentation_objects.ts#L474-L482)).
- What today's controls let one person write:
  - a map with no admin-level area: a change of type from a table leaves none ([validate_figure_config_edit.ts:143-145](client/src/generate_visualization/validate_figure_config_edit.ts#L143-L145)), and the area's dimension can be unticked or given another slot;
  - several value props on a map, whose slot the editor offers ([disaggregation_section.tsx:129-132](client/src/components/_shared/figure_editor/editor_panel_data/disaggregation_section.tsx#L129-L132));
  - a special mode with a dimension on `series` or without the mode's value props: choosing a mode checks neither, and nothing locks them after ([timeseries_style_controls.tsx:66-90](client/src/components/_shared/figure_editor/editor_panel_style/timeseries_style_controls.tsx#L66-L90)). Drawing refuses the disruptions modes without their value props ([build_figure_inputs.ts:150-175](client/src/generate_visualization/build_figure_inputs.ts#L150-L175));
  - a roll-up whose dimension has become the replicant, or whose figure has become a map or a pie: the flag stays in the draft and the live document, and is stripped from the config the editor returns on Apply and on Back ([convert_visualization_type.ts:51-53](lib/convert_visualization_type.ts#L51-L53), [normalize_po_config.ts:127-147](lib/normalize_po_config.ts#L127-L147));
  - a timeseries with no time grouping: a change of type leaves `timeseriesGrouping` as it was ([summary.tsx:138-158](client/src/components/_shared/figure_editor/editor_panel_data/summary.tsx#L138-L158)), and the fetch throws without one ([get_fetch_config_from_po.ts:47-50](lib/get_fetch_config_from_po.ts#L47-L50));
  - a required `year` pooled, three ways. Unticking the period filter, or choosing "Custom", which writes the data's whole range, on a figure whose `year` is held only by its one-year period ([filters.tsx:181-200](client/src/components/_shared/figure_editor/editor_panel_data/filters.tsx#L181-L200), [:315-320](client/src/components/_shared/figure_editor/editor_panel_data/filters.tsx#L315-L320)). The slider of 1 to 10 years, which a figure holding a calendar-years filter is shown whatever its data's grain ([filters.tsx:358-373](client/src/components/_shared/figure_editor/editor_panel_data/filters.tsx#L358-L373)). A change of type to a map or a pie, which removes the period dimensions, since today's maps and pies pool the period on purpose ([convert_visualization_type.ts:19-30](lib/convert_visualization_type.ts#L19-L30), [disaggregation_labels.ts:144-156](lib/disaggregation_labels.ts#L144-L156));
  - two or more value props with no slot of their own: unticking the value filter where a dimension holds the values' slot ([filters.tsx:143-149](client/src/components/_shared/figure_editor/editor_panel_data/filters.tsx#L143-L149));
  - two things on one slot, and a dimension that is not an admin level on `mapArea`: a slot list offers every slot of the type to every dimension ([disaggregation_section.tsx:333-345](client/src/components/_shared/figure_editor/editor_panel_data/disaggregation_section.tsx#L333-L345));
  - a cutoff or a scale bound that is not finite, which zod refuses: a number input takes "1e999" and holds it only to a bound it is given ([numbers.tsx:43-57](panther/_303_components/form_inputs/numbers.tsx#L43-L57), [conditional_formatting_editor.tsx:496-508](client/src/components/_shared/figure_editor/_shared/conditional_formatting_editor.tsx#L496-L508));
  - a filter with no value and an empty value filter, above.
- A stored figure that lacks a dimension its metric requires shows "Error with required disaggregator" and a locked checkbox, and no control adds the dimension but a change of type ([disaggregation_section.tsx:261-301](client/src/components/_shared/figure_editor/editor_panel_data/disaggregation_section.tsx#L261-L301)).
- The preview shows a notice in place of the figure when two dimensions hold one slot ([figure_editor.tsx:217-233](client/src/components/_shared/figure_editor/figure_editor.tsx#L217-L233)).

### 1.9 What the first working of step 2 found

Step 2 was first worked on 2026-11-21 as "design live editing" and abandoned on Tim's word (§0, §6). This is what it measured that the steps below need. Each line carries its own mark.

**The stored figures, read again on 2026-11-21** [RUN2]

- 24,050 stored figures in 29 instances. 6,812 are on a metric the modules define today. 16,676 are on a retired metric, and `retiredMetric` and `succeedRetiredFigure` carry each to a successor, as the editor opens it. 562 are on a metric that is neither. 23,486 convert and parse under §2.1.
- 182 of the 23,486 fail step 1's metric checks. By problem: a required dimension pooled, 81 charts; a mode the metric's list lacks, 81 timeseries; a map showing several value props, 5; a special mode with a dimension on `series`, 5; a period dimension on a slot of a timeseries, 7; the value props on a slot other than the type's own while that one is empty, 4. One figure has two.
- 103 hold a required dimension that is not a period dimension on no slot and not as the replicant, each by a filter of one value. Each has a free slot that can hold it.
- 347 tables and charts hold a required period dimension by a one-year period alone. 81 hold it by nothing: the 81 charts above.
- 13 metrics require `year`, and all 13 are yearly. No stored map or pie is on one of them.

**Where the validator and the renderer disagree**

- A config that passes and fails to draw [RUN2]. The renderer draws the value props on `series` of a timeseries, `indicator` of a chart and `col` of a table whenever that slot holds no effective dimension, even where they hold another slot ([get_data_config_from_po.ts:350](client/src/generate_visualization/get_data_config_from_po.ts#L350), [:389-395](client/src/generate_visualization/get_data_config_from_po.ts#L389-L395), [:471](client/src/generate_visualization/get_data_config_from_po.ts#L471)). The value props are then on two axes and panther throws. Step 1's check reads the slot the config holds, and the renderer the effective one. Two presses from preset `m2-02-01/adjustment-comparison` reach it: put `indicator_common_id` on `series`, which moves the value props to `lane`, then filter it to one value. A dimension with one member in the rows does the same, which no check of a config and its metric can see. Step 1's rule for the type's own slot names a timeseries and a chart, and not a table's `col`.
  - [ATTACK2] 7 stored figures are in this state today. Panther's transforms take a timeseries with no series and a table with no column when the value props are on another slot, and take all three types when the dimension that is not effective is kept on its slot. Only a chart needs `indicator`.
- Figures that draw today and fail.
  - [RUN2] 80 of the 81 timeseries above are percent-change charts whose metric is `m2-02-01`. `SPECIAL_PERCENT_CHANGE_CHART_METRICS` names `m12-01-01` and the retired `m3-01-01`, and not `m2-02-01`, the successor of a `m3-01-01` figure that compares adjustment bases or uses a facility column (the other successor, `m12-01-01`, is on the list) ([special_chart_checks.ts:11](client/src/generate_visualization/special_chart_checks.ts#L11)). The editor keeps a mode offered while it is the figure's own ([timeseries_style_controls.tsx:109-118](client/src/components/_shared/figure_editor/editor_panel_style/timeseries_style_controls.tsx#L109-L118)).
  - [ATTACK2] 45 of the 80 were carried from `m3-01-01`, and 35 are on `m2-02-01` itself. The 7 timeseries with a period dimension on `tier` or `lane` draw today. One stored map (cameroun, a slide, `m1-04-02`) holds `year` on `lane` and draws one map a year. Step 1's check has no rule against it [RUN2].
- A config that passes and pools a dimension its metric requires [RUN2]. A period dimension is allowed on a table and a chart only ([disaggregation_labels.ts:144-156](lib/disaggregation_labels.ts#L144-L156)). Step 1's prototype exempts a required dimension from a type its allowed types leave out, so a map or a pie that pools a required `year` passes. §2.2's text exempts no type. The Explore page's own maps of such a metric hold `year` by a filter of one value.
  - [ATTACK2] 26 changes of type from a preset or an Explore config to a map or a pie pool a required `year` and pass.
  - [ATTACK2] On yearly data the engine reads the last full year as the latest year in the rows, whatever its values ([get_fetch_config_from_po.ts:182-185](lib/get_fetch_config_from_po.ts#L182-L185)). In a local package the latest year of `m6-02-01` held no survey value, so a map held to that year by a rule drew blank.
  - [ATTACK2] A rule that every required dimension holds a slot or the replicant refuses figures that draw today: an `m10-03-01` map with its three required dimensions each filtered to one value and two more dimensions laid out.
  - [ATTACK2] The wizard's starting config for a map of `m6-02-01` and of `m6-03-01` shows several value props, which step 1's check refuses.

**What was built and is not in this plan** [RUN2]

- A function that repaired a config after each press, with rules for what the editor remembers, was run over every preset, every Explore config and every stored figure with no failing result. The second independent agent found presses on which it changed what the person had not pressed. Ruling 12 replaces it. The rule of ruling 12 has not been run.

**The shared document and slide undo** [RUN2]

- The editor's undo manager is built with Yjs's own settings ([figure_editor.tsx:683-686](client/src/components/_shared/figure_editor/figure_editor.tsx#L683-L686)). On today's bridge: two documents each write `s.decimalPlaces` before either hears the other, the one whose value stands undoes, and the key is gone from the map and the stored schema refuses the config. With the config as one value and those settings, a run of 12,752 pairs of writes with undo and redo left the map with no config in 6,392 of 102,016 states. With `ignoreRemoteMapChanges` it left none, and after every pair the map held one of the two configs whole.
- A stored figure's settings and its rows are two keys of the shared document. The editor writes the settings under an origin of its own. The host writes the rows under the slide session's origin, which the slide's undo manager tracks over the whole slide ([collab.ts:552-555](client/src/state/instance/collab.ts#L552-L555), [:582-587](client/src/state/instance/collab.ts#L582-L587)). On a model of those origins, with today's keys: change a figure's data settings twice in the editor, press Back, press Ctrl+Z twice on the slide, and the settings are the second change's beside the first change's rows. With the config as one value there is one more way: the slide writes a figure, the editor changes its style alone, Back, Ctrl+Z, and the new figure's settings stand beside the earlier figure's rows, where today's keys give the earlier figure whole. Neither was run in the app.
- A bundle records the package its rows came from and its scope's hash ([\_figure_bundle.ts:145-152](lib/types/_figure_bundle.ts#L145-L152)), and `isFigureBundleStale` compares those two ([figure_staleness.ts:20-26](client/src/generate_visualization/figure_staleness.ts#L20-L26)). Nothing in it records the settings its rows answer. Where the columns still fit, such a figure draws with no message.

### 1.10 What the second working of step 2 measured

Step 2 was worked again on 2026-11-22 as §4 words it. Each line is [RUN3] unless it carries another mark.

**The stored figures, read again on 2026-11-22**

- 24,050 stored figures in the same 29 instances: 6,812 on a metric the modules define today, 16,676 on a retired metric, 562 on neither. 23,486 convert and parse under §2.1.
- Today's `buildFigureInputs`, run on each stored bundle with its own rows: 18,071 draw. 637 are maps and were not run, since a map needs its boundaries. 5,273 timeseries throw "Need at least one valueProp" (§1.7). 32 timeseries throw for a disruptions chart with one value prop. 37 throw otherwise:
  - 7 with the value props on two axes (4 charts, 3 timeseries);
  - 7 timeseries whose time-axis dimension is also on a slot;
  - 9 (7 tables, 2 charts) under the one-period rule below;
  - 14 (11 timeseries, 3 tables) whose rows do not hold the columns their config groups by.
- 7,494 stored bundles hold rows that lack a column their config groups by, and 4,371 of them draw. So a stored bundle's rows cannot be tested against its config after the fact.
- The modules' 37 metrics: 18 monthly, 13 yearly, 6 with no time column, none quarterly. The 13 yearly metrics all require `year`. The 6 with no time column require `time_point`.

**Where the validator and the renderer disagree**

- The one-period rule. `getEffectivePOConfig` leaves out every period dimension when the bundle's date range has equal ends ([normalize_po_config.ts:181](lib/normalize_po_config.ts#L181), [:221-227](lib/normalize_po_config.ts#L221-L227)). A table or chart that lays out `year` beside `month` or `quarter_id` holds its date range in years, so with one year of rows the rule leaves out `month` while the rows hold several, and panther throws "Duplicate value". 9 stored figures are in that state, and each draws when the date range is kept from the rule. Of the 1,860 stored tables, charts and pies that lay out a period dimension, no other has one left out while its column holds several members.
- The same function leaves out a map's `mapArea` dimension when a filter holds it to one value ([normalize_po_config.ts:195-201](lib/normalize_po_config.ts#L195-L201)), and the renderer then reads `admin_area_2` ([get_data_config_for_map.ts:27-32](client/src/generate_visualization/get_data_config_for_map.ts#L27-L32)). [ATTACK3] A map of `admin_area_3` so filtered throws. No stored map is in that state.
- Panther's transforms, on made rows: a timeseries, a table and a pie take two or more value props on any one slot with their own slot empty. A chart's `indicatorProp` is required ([types.ts:43](panther/_010_chartov/types.ts#L43)): a chart takes them on another slot while `indicator` holds a dimension, one of a single member included, and throws with nothing there. Every type throws with two or more value props on no axis or on two.
- [ATTACK3] The band, disruptions and coverage styles read their series by position or by label. A band chart with its value props on `tier` and nothing on `series` draws one line a tier and no band, under the band's legend. One stored figure is so laid out, and throws today. The 5 stored coverage charts with a dimension on `series` draw every series in one grey.
- A query that groups by a filter-only dimension is refused ([validate_fetch_config.ts:241](lib/validate_fetch_config.ts#L241)).
- The checks as ruling 18 holds them, on the 23,486: 96 figures have a problem, where step 1's prototype found 182. They are 81 charts that pool a required `year`, all of which draw; 8 with a period dimension on a slot of a timeseries (7) or of a map (1); 5 coverage charts with a dimension on `series`; 1 coverage chart on a metric outside the list; and 2 that throw today, a chart with its value props on `series` and nothing on `indicator`, and the band chart above. One figure has two. The 80 percent-change charts on `m2-02-01` pass with that metric on the list, and the 5 maps that show several value props pass with the first named. Every preset and every Explore config passes.
- [ATTACK3] 54,126 distinct configs that pass and are not maps (every passing preset, Explore config and distinct stored figure, and every config one press from one), drawn 167,863 times through panther's transforms over made rows as §2.1 words the renderer, each also with one laid-out dimension held to one member: none throws. The 2,774 distinct maps that pass were not drawn.
- The wizard's starting config ([insert_figure.tsx:188-212](client/src/components/products/_shared/insert_figure/insert_figure.tsx#L188-L212)) for every metric, every type it can draw, with no optional dimension and with each one: 1,507 configs, of which 278 have a problem. They are a map with no area dimension, a map that shows several value props, and a map or a pie that pools a required `year`. Laid out by the prototype's change of type with a map area, the first value prop and the last full year, all 1,507 pass, 22 of them without the dimension chosen, which found no free slot. With each dimension on the first free slot, else the replicant, all 1,507 pass with it laid out.

**The editor's rule as ruling 12 first held it**

- The rule was that an option is offered unless the config it would produce has a problem the draft lacks. It was run, on a model of today's controls, over every preset, every Explore config and the 1,470 distinct stored figures: 101,072 options, of which 93,255 were offered, 7,176 withheld and 641 past what §2.1's shape can say. 1,087 of the withheld are options today's editor lets a person press: 563 choices of the value props shown, 202 moves of the value props to another slot, 135 moves of a dimension to another slot, 146 filter presses, 34 period-filter presses, 6 changes of mode and 1 untick. No offered option left a passing draft with a problem, and each of the 15 distinct stored drafts with a problem reached none in three presses or fewer. The run was before ruling 18's rule that coverage, disruptions and the band hold their value props on `series`.
- [ATTACK3] The model pressed a control's end state, and today's controls pass through others. "Custom" writes the data's whole range ([filters.tsx:315-320](client/src/components/_shared/figure_editor/editor_panel_data/filters.tsx#L315-L320)), so under the rule a figure that holds a required `year` by its period alone cannot be moved to another year without four presses: 170 stored figures. The value-prop control is a multi-select ([filters.tsx:153-161](client/src/components/_shared/figure_editor/editor_panel_data/filters.tsx#L153-L161)), so a map's one value prop cannot be changed. A required dimension held by a filter of one value alone cannot be given another value without four presses: 64 distinct drafts, 2 of which have no way.
- [ATTACK3] A swap between a slot and the replicant lays the old replicant's dimension out with all its members: 354 offered presses, 320 of which drop its chosen value.
- [ATTACK3] A change of type that also holds the period and names a map's value prop does not come back: of 5,708 changes of type and back over the stored drafts, 821 return the config. Today's editor returns it in every one of 1,271 preset and Explore pairs, by the layout its cache keeps for each type ([summary.tsx:85](client/src/components/_shared/figure_editor/editor_panel_data/summary.tsx#L85), [:104-158](client/src/components/_shared/figure_editor/editor_panel_data/summary.tsx#L104-L158)).
- The editor writes the replicant's value after a fetch, with no press ([figure_editor.tsx:389-405](client/src/components/_shared/figure_editor/figure_editor.tsx#L389-L405)). Today's Filters list leaves out every period dimension while the metric has period bounds ([filters.tsx:61-67](client/src/components/_shared/figure_editor/editor_panel_data/filters.tsx#L61-L67)), and both lists leave out a dimension the type does not allow ([editor_panel_data.tsx:33-38](client/src/components/_shared/figure_editor/editor_panel_data.tsx#L33-L38)). So a map that holds `year` by a filter, as the Explore page's do, shows no control for that filter.
- [ATTACK3] Three states today's style controls write that §2.1's schema refuses: custom series colours with none chosen yet, a fixed colour-scale minimum at or above its maximum, and a cutoff that is not finite.

**The stale check**

- [LISTED] Every place that draws or exports a stored figure reaches `buildFigureInputs`: a slide's canvas, card, presenter, exports and version preview through `convertSlideToPageInputs` ([convert_slide_to_page_inputs.ts:583-591](client/src/generate_slide_deck/convert_slide_to_page_inputs.ts#L583-L591), read by [RUN3]), and a report's page, rasters, exports and version preview through `buildReportFigureInputs` ([report_figure_embed.tsx:77](client/src/components/products/_shared/report_figure_embed.tsx#L77), read by [RUN3]) or the report rasters. None is on the server. Most have no metric in scope, and a bundle holds too little of its metric to build a fetch config. A result that is not ok shows on a slide as "This item could not be displayed." and on a report's page as its reason. A report's rasters and exports print "Missing visualization" ([report_figure_raster.ts:158](client/src/generate_report/report_figure_raster.ts#L158), [export_report_as_html.ts:55](client/src/exports/export_report_as_html.ts#L55)).
- The key as §2.3 words it, without the metric id, against a model of the fetch config, over 100,431 pairs of a draft and one option's config: no pair holds one key and two fetch configs, and 20 hold two keys and one fetch config, where one config names every value prop and the other none. [ATTACK3] Against today's own builder of the fetch config, within one metric, no two configs hold one key and two fetch configs. Where the package cannot total a roll-up, 995 pairs hold two keys and one fetch config.
- [ATTACK3] Two metrics can hold one such key: 908 of the 9,763 distinct keys of the stored figures are held by figures of two or more metrics. In the shared document the metric id is on the rows' side ([figure_entry_crdt.ts:27-31](lib/collab/figure_entry_crdt.ts#L27-L31), read by [RUN3]).
- [ATTACK3] The editor writes the config at the press and the rows when the fetch ends ready ([figure_editor.tsx:389-429](client/src/components/_shared/figure_editor/figure_editor.tsx#L389-L429)). At Back after a failed fetch the host alerts and writes nothing ([slide_editor.tsx:1100-1103](client/src/components/products/slide_deck/slide_editor/slide_editor.tsx#L1100-L1103), read by [RUN3]).
- [ATTACK3] The retired-metric carry changes the key of 7,571 of the 16,674 carried figures. It runs only where a whole bundle is then written.

### 1.11 What the tests before step 6 measured

Run on 2026-11-23, after step 5, on Tim's word. Each line is [RUN4].

**What the modules repo can copy**

- For typechecking, `lib/figure_config/schema.ts` and `validate.ts` reach 87 files of `lib` and the whole panther barrel: 697 files. `lib/rollup.ts` alone reaches 81, through its type import from `_metric_installed.ts`. Their direct imports: `schema.ts` imports `@timroberton/panther`, `rollup.ts`, `disaggregation_options.ts` and `_metric_installed.ts` (`inferPeriodFormatFromValue`); `validate.ts` imports `special_chart_metrics.ts`, `types/modules.ts`, `validate_fetch_config.ts` (`FILTER_ONLY_DISAGGREGATION_OPTIONS`), `rollup.ts` and `derive.ts` (`shownValueProps`). Panther's `_150_figure_schema/leaves.ts` and `_151_long_table_schema/filters.ts` import only zod. Its `_000_utils/periods.ts` imports only `assert.ts` and `translate.ts`, which import nothing.
- The modules repo's CI (`.github/workflows/validate.yml`) runs `.validation/validate_definitions.ts` on a checkout of that repo alone.
- In a copy of the modules repo with zod raised from `^3.22.4` to `^4.6.0`, `deno task typecheck` passes, `deno task build` writes the 8 `definition.json` files byte for byte as before, and the validation passes. `review_ai_text/render_ai_view.ts` fails its typecheck (TS2367) under both versions.
- `lint:structure` fails on a client file that `app.tsx` and `routes/` do not reach ([lint_structure.ts:516](lint_structure.ts#L516)). So no client file can be added before something imports it.

**The copilot**

- `createAITool` accepts `{ metricId, config }` with `figureConfigSchema` as the config, closed at every level. Its input schema is 16,270 characters. The API's token count accepts the tool: one such tool adds 8,922 input tokens on `claude-sonnet-5-5`, and five add 43,476.
- `claude-sonnet-5-5` at effort high, given a preset's config in §2's shape and one request, and told to restate the whole config through that tool: 50 presets, 168 requests (a new title, a period, data labels or decimal places, and for every second preset a change to a table or a chart). 167 answers used the tool. Every one parsed and added no validator problem, and none changed a text, a colour or a style field it was not asked to. Of the 13 requests "Show only the year 2021." on yearly data, 9 answers replaced the period filter with a filter of `year` to 2021, and 1 wrote a monthly range, which the validator refuses.

**What today's drawing reads that the conversion drops**

- Each stored style field changed alone, on 250 configs (every preset, and each preset changed by today's `convertVisualizationType` to every other type), drawn by today's `buildFigureInputs` to a PNG over made rows. The fields whose change alters the PNG and leaves the converted config the same are `barsStacked` on a table, a map or a pie, and `seriesColorFuncPropToUse` on a pie. Today a figure of any type whose `content` is `bars` and whose `barsStacked` is true draws its legend reversed ([\_1_standard.ts:87](client/src/generate_visualization/get_style_from_po/_1_standard.ts#L87)), and a timeseries in a special mode so set stacks its rows ([build_figure_inputs.ts:187-190](client/src/generate_visualization/build_figure_inputs.ts#L187-L190)). No stored figure draws differently for either (below).

**Production, 41 instances**

- Live figures: 24,947. 24,945 convert and fit, and their settings key builds. The other 2 are the ghana maps of §2.4. A figure's own package (`provenance.runId`) holds its metric with data for 24,078. For 864 the package does not hold the metric, for 3 (rca) the package is gone, and for 2 (mauritanie) the metric's results object has no data.
- The 24,078 convert to the same configs with their package's metric as with the local module definitions (step 5's source), wherever the metric is defined today. Converted from the bundle alone, 270 of them convert otherwise: 120 in `data`, 146 in `layout` and 4 in both. An afghanistan `m6-03-01` chart (slide `4gb/75d`) on yearly data has no date range in its bundle, so from the bundle alone it keeps `last 12 months`, where its metric gives `lastFull 1 year`. A burkinafaso `m6-02-01` timeseries (slide `q6q/8fy`) names its value props in its bundle by their French labels, and from the bundle alone it keeps a roll-up its metric cannot total.
- Of the 869 whose own package lacks their metric, another package of the same instance holds it for 858, and with that package's metric 8 of them (haiti, slide deck `escb`) convert otherwise than from the bundle alone. No package of the instance holds it for 11 (demo, slide deck `4ys`). From the bundle alone, the conversion of 79 of the 869 depends on whether the data is yearly, and of 165 on whether the metric can be rolled up.
- Version snapshots: 38,465 figures. 38,464 convert and fit after today's `transformFigureBlock`. The other is one of the ghana maps. 104 figure blocks have no bundle. For 1,419 the own package lacks the metric, and for 3 the package is gone.
- The presets in the packages' manifests: 336 distinct. All parse with today's schema, convert and fit. 23 are on a results object with no data in their package and were not validated. 3 have a validator problem on their package's metric: liberia's `m6-02-01/coverage-bar` and `m6-03-01/coverage-bar` pool a required `year`, and sierraleone's `m11-02-01/disruption-table-admin-area-4` names `admin_area_4`, which its package does not hold. 24 manifests on disk are at schema version 11, 5 at 15 and 427 at 18.
- Style on the stored figures' own rows: no live table or pie, no timeseries in a special mode, and no map that shows its legend holds `bars` with `barsStacked`. All 5,640 live tables hold `barsStacked: false`. The one stored pie holds the doughnut ratio the editor writes, 0.55, and draws the same coloured by series. Each style field changed alone on 30 distinct drawn figures of each type and mode (1 pie) found no other field that alters the PNG and leaves the converted config the same.

## §2 The model

Designed by step 1, settled by step 2 and ruled (§3). The schema below is the design. A name in it is the name to use.

### 2.1 The config

```ts
// Dim: the app's dimension enum. Text: a string in a stored config, a
// translated string in a preset. Every object is closed (z.strictObject).
type FigureConfig =
  | {
    type: "table";
    data: Data;
    layout: TableLayout;
    style: TableStyle;
    text: FigureText;
  }
  | {
    type: "timeseries";
    data: Data;
    layout: TimeseriesLayout;
    style: TimeseriesStyle;
    text: FigureText;
  }
  | {
    type: "chart";
    data: Data;
    layout: ChartLayout;
    style: ChartStyle;
    text: FigureText;
  }
  | {
    type: "map";
    data: Data;
    layout: MapLayout;
    style: MapStyle;
    text: FigureText;
  }
  | {
    type: "pie";
    data: Data;
    layout: PieLayout;
    style: PieStyle;
    text: FigureText;
  };

// Which rows are read.
type Data = {
  valueProps?: string[]; // which of the metric's value props; absent: all
  filters: { dim: Dim; values: (string | number)[] }[];
  periodFilter?: PeriodFilter;
};
type PeriodFilter =
  | { type: "range"; min: number; max: number }
  | { type: "from"; min: number } // to the latest period in the data
  | { type: "last"; n: number; unit: "month" } // n is 1 to 24
  | { type: "lastFull"; n: number; unit: "quarter" | "year" }; // 1 to 20, 1 to 10

// Where each dimension goes. A slot holds one dimension, or "valueProps".
type Slot = Dim | "valueProps";
type Replicant = { dim: Dim; value?: string }; // one value shown at a time
type Rollup = { dim: RollupDim; position: "top" | "bottom" }; // a total row
type TableLayout = {
  row?: Slot;
  col?: Slot;
  rowGroup?: Slot;
  colGroup?: Slot;
  replicant?: Replicant;
  rollup?: Rollup;
};
type TimeseriesLayout = {
  period: PeriodDim;
  series?: Slot;
  pane?: Slot;
  tier?: Slot;
  lane?: Slot;
  replicant?: Replicant;
  rollup?: Rollup;
};
type ChartLayout = {
  indicator?: Slot;
  series?: Slot;
  pane?: Slot;
  tier?: Slot;
  lane?: Slot;
  replicant?: Replicant;
  rollup?: Rollup;
};
type MapLayout = {
  mapArea: AdminDim;
  pane?: Dim;
  tier?: Dim;
  lane?: Dim;
  replicant?: Replicant;
};
type PieLayout = {
  series?: Slot;
  indicator?: Slot;
  pane?: Slot;
  tier?: Slot;
  lane?: Slot;
  replicant?: Replicant;
};

// How it is drawn. Each type holds the fields its drawing reads, and no others.
type Common = {
  decimalPlaces: 0 | 1 | 2 | 3;
  paneColumns: "auto" | number;
  memberOrder: { dim: Dim; memberIds: string[] }[];
};
type ValueAxis = {
  valueAxisMaxAt100Percent: boolean;
  valueAxisMinAuto: boolean;
  valueAxisLimitsPerTierOrLane: boolean;
};
type SeriesColors =
  | "pastel-discrete"
  | "alt-discrete"
  | "red-green"
  | "blue-green"
  | "single-grey"
  | { custom: string[] };
type ColorBy = "series" | "pane" | "tier" | "lane";
type TableStyle = {
  allowVerticalColHeaders: boolean;
  showSampleSizes: boolean;
  hideLegend: boolean;
  conditionalFormatting: ConditionalFormatting;
  decimalPlaces: 0 | 1 | 2 | 3;
  memberOrder: Common["memberOrder"];
};
type TimeseriesStyle =
  | (
    & {
      mode: "standard";
      marks: "bars" | "lines" | "lines-points" | "lines-area";
      stacked: boolean;
      seriesColors: SeriesColors;
      colorBy: ColorBy;
      conditionalFormatting: ConditionalFormatting;
      showDataLabels: boolean;
      hideLegend: boolean;
    }
    & Common
    & ValueAxis
  )
  | {
    mode: "coverage";
    valueAxisMaxAt100Percent: boolean;
    valueAxisMinAuto: boolean;
    paneColumns: "auto" | number;
    memberOrder: Common["memberOrder"];
  }
  | (
    & {
      mode: "percentChange";
      threshold: number;
      invertColors: boolean;
      showDataLabels: boolean;
      labelOnlyBeyondThreshold: boolean;
      seriesColors: SeriesColors;
      colorBy: ColorBy;
    }
    & Common
    & ValueAxis
  )
  | (
    & { mode: "disruptions"; invertColors: boolean; showDataLabels: boolean }
    & Common
    & ValueAxis
  )
  | (
    & {
      mode: "disruptionsBand";
      invertColors: boolean;
      showDataLabels: boolean;
    }
    & Common
    & ValueAxis
  );
type ChartStyle =
  & {
    marks:
      | "bars"
      | "lines"
      | "lines-points"
      | "lines-area"
      | "points"
      | "points-connectors";
    stacked: boolean;
    orientation: "vertical" | "horizontal";
    verticalTickLabels: boolean;
    sortByValue: "none" | "ascending" | "descending";
    seriesColors: SeriesColors;
    colorBy: ColorBy;
    conditionalFormatting: ConditionalFormatting;
    showDataLabels: boolean;
    hideLegend: boolean;
  }
  & Common
  & ValueAxis;
type MapStyle = {
  projection: "equirectangular" | "mercator" | "naturalEarth1";
  conditionalFormatting: ConditionalFormatting;
  showMapAreaLabels: boolean;
  showDataLabels: boolean;
  labelPlacement: "centroid" | "callout" | "auto";
  hideLegend: boolean;
} & Common;
type PieStyle = {
  shape: "pie" | "doughnut";
  showCenterValue: boolean;
  valueAgainst100Percent: boolean;
  sortByValue: "none" | "ascending" | "descending";
  groupSlicesBelow: number; // a share of the whole, 0 to 0.2; 0: none
  seriesColors: SeriesColors;
  showDataLabels: boolean;
  hideLegend: boolean;
} & Common;
type ConditionalFormatting =
  | { type: "none" }
  | { type: "indicator" } // each indicator's own rule, from the catalog
  | {
    type: "thresholds";
    cutoffs: number[];
    buckets: { color: Color; label?: string }[];
    direction: "higher-is-better" | "lower-is-better";
    noDataColor?: string;
  }
  | {
    type: "scale";
    palette: { preset: PaletteName } | {
      from: string;
      mid?: string;
      to: string;
    };
    reverse: boolean;
    steps?: number;
    domain: "auto" | { min: number; max: number };
    noDataColor?: string;
  };

// DATE_RANGE in a text is replaced by the period shown, REPLICANT by the
// replicant's value.
type FigureText = { title: Text; subtitle: Text; footnote: Text };
```

What the words mean:

- Two or more value props shown are drawn on the slot that holds `"valueProps"`, and nowhere else. With one shown they take no slot: a slot that names them is kept for when a second is shown, counts as free, and gives way to a dimension put there. A timeseries with nothing effective on `series`, and a chart with nothing effective on `indicator`, draw the one there, as today.
- The query groups by every dimension on a slot, the replicant, and every dimension filtered to exactly one value. A filter-only dimension is never grouped by.
- A dimension on a slot is effective, and is laid out, unless a filter holds it to one value or the figure's rows hold one of its members. The date range plays no part. The replicant is not judged by its members, as today. A map's `mapArea` is always laid out. A chart's `indicator` keeps its dimension laid out while two or more value props are on another slot.
- A replicant whose dimension is also filtered to one value is a filter, as today.
- A roll-up is closed while its dimension is filtered to one value, as today.
- A color is a hex string or `{ key }`. A custom series colour and a scale colour are hex strings.

### 2.2 The whole-figure checks

| Needs              | Checks                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | Runs                                                                                                                                                                                                                                                                            |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The config alone   | By the shape: a slot or a style field of another type or mode, two things on one slot, a timeseries with no `period`, a map with no admin-level `mapArea`, a roll-up on a map or a pie, a filter with no value, a `valueProps` list with none, an unknown key. By refinement: a dimension on two slots, or on a slot and the replicant; a roll-up whose dimension is on no slot; two filters on one dimension; a range that is not two ordered periods of one grain; thresholds with other than one more bucket than cutoffs, or cutoffs that descend; a fixed scale domain whose minimum is above its maximum.                                                                                                                                                                                                                                                                                                                                                                                                                                                              | In the schema, so wherever a config is parsed.                                                                                                                                                                                                                                  |
| The metric         | Every dimension and value prop named is the metric's. A filter-only dimension is only filtered. A dimension is on a slot or is the replicant only on a type its metric allows it on, and a timeseries lays time out on `period` only. Two or more value props shown are on a slot that names them; a chart whose value props are on another slot holds a dimension on `indicator`; a map shows exactly one. A required dimension is on a slot, the replicant, or filtered to one value, on every type; a required period dimension also where the period filter selects exactly one period of the metric's grain. Yearly data takes a range of years or `lastFull` 1 year, and a metric with no time column takes no period filter. A roll-up needs a metric that can be rolled up. A special mode needs a metric on its list; coverage, disruptions and the band hold the value props on `series` while two or more are shown, and never a dimension; disruptions shows two or more, and the band exactly its four. `indicator` colouring needs an indicator-format metric. | Every write of a whole figure: the copilot's input, a preset at module build, the wizard's starting config. In the editor, on the draft at every change: its problems show, and a draft with a problem the document's config lacks is not written (ruling 12). Never at render. |
| The package's data | Filter values exist. The replicant has a value among its dimension's values under the figure's filters and period. The period is in the data. A map's boundaries exist and meet its areas. The rows are some and under the cap.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | When a figure is resolved, before anything is committed, as today.                                                                                                                                                                                                              |

### 2.3 What writes and reads a config

| Thing                | Under §2                                                                                                                                                                                                                                                                                                                                                                                                          |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The three schemas    | One factory, with a stored instance and a preset instance. `configSStrict`, the github copies and `cfStorageSchema` go.                                                                                                                                                                                                                                                                                           |
| The editor           | Panels write the type's own style. Every press is taken into the draft. The draft's problems show in place of the preview, and the editor writes the draft to its host, and fetches rows for it, only while it has no problem the document's config lacks (ruling 12, and the paragraphs below this table). A change of type or mode discards the old style, and the editor keeps it for the session (ruling 11). |
| The wizard, a preset | A preset is a complete config. `deriveConfigFromVizPreset` picks the language of its three texts. The wizard's starting config is a whole figure and passes the validator (below this table).                                                                                                                                                                                                                     |
| Explore              | `deriveViewConfig` builds §2's shape and adds a roll-up only for a metric that can be rolled up.                                                                                                                                                                                                                                                                                                                  |
| The collab map       | The config travels as one value with its metric id beside it, and the three texts as Y.Texts, as today (rulings 16 and 17). `dropStorageInvalidTransients` goes: the editor writes no config the schema refuses. A shape change clears stored `crdt_state`.                                                                                                                                                       |
| `buildFigureInputs`  | Switches on `type` and `mode`. Returns a bundle whose settings key is not its rows' as unavailable (ruling 17).                                                                                                                                                                                                                                                                                                   |
| The query            | The fetch config is built from `data` and `layout`, and carries §2's period filter.                                                                                                                                                                                                                                                                                                                               |
| A retired metric     | `resolveFigureMetric` carries §2's config to the successor.                                                                                                                                                                                                                                                                                                                                                       |
| The copilot          | One input, `{ metricId, config }`, for every tool that writes a figure. A read returns the same JSON. A write's result lists every field that differs from the stored config. A read returns a metric's presets as configs.                                                                                                                                                                                       |
| A figure's rows      | The bundle records the settings key its rows were fetched for, written with the rows wherever rows are written. A bundle whose own key is another is stale: no place draws it, and the badge and Update refetch it (ruling 17).                                                                                                                                                                                   |
| `get_metric_data`    | `{ metricId, groupBy, valueProps, filters, periodFilter }`.                                                                                                                                                                                                                                                                                                                                                       |

**The editor's gate (ruling 12).** The draft is the editor's own. Every press is taken into it. The validator runs on the draft at every change, and its problems show in place of the preview, as the editor's errors show today. The editor writes the draft to its host, and fetches rows for it, only while the draft has no problem that the config the document holds lacks. So a draft with a new problem is not written, the document keeps the last config written, and a stored figure that already has a problem can still be edited. A filter ticked with no value chosen, custom colours with none chosen yet and a number that is not yet valid are such drafts, and the editor words each as the action that completes it. Nothing is dropped from a config at a save. The gate holds every way the editor reaches its host: the live write, Apply, Back and the fetch of rows; Back with an unwritten draft returns the config the document holds. A change to the shared document that the editor did not write enters the draft by what it changed: a text's change sets that text in the draft, and a change of the config value, a peer's write or an undo, replaces the draft. A download reads the config whose rows the preview holds.

**What the shape asks of today's controls.** A slot holds one thing, so:

- a slot list offers a taken slot, and picking it swaps the two things;
- the replicant is offered while it is free;
- a slot that names the value props while one is shown counts as free;
- a roll-up leaves with its dimension, when the dimension is unticked or becomes the replicant;
- a map's area dimension changes slot only by a swap with another admin level, and only an admin level is offered `mapArea`;
- a dimension is ticked onto the first free slot of the type, else the replicant, and is not offered a tick while no place is free;
- the editor shows a row for every dimension the draft lays out or filters, one its type does not allow included, so that every problem can be removed.

Nothing else is withheld by what the validator would say of a press. The controls offer what today's offer by the metric and the type: the types and modes the metric has, the dimensions the type allows, a roll-up on a metric that can be rolled up, and the period filters the metric's grain takes.

**A change of type** is today's `convertVisualizationType` in §2's names. Each dimension goes to the slot today's mapping gives, a dimension the type does not allow is dropped, a required dimension the type allows is added, and the value props take the type's own slot (`series` of a timeseries, `col` of a table, `indicator` of a chart, `pane` of a pie; a map has none). The shape asks three things more: a timeseries takes as `period` a period dimension the figure laid out, else the metric's finest, and a map takes as `mapArea` the finest admin level the figure lays out, else the replicant's when that is an admin level, else the metric's coarsest; and a dimension for which no slot and no replicant is free is left out, where today's function leaves two on one slot ([convert_visualization_type.ts:43-48](lib/convert_visualization_type.ts#L43-L48), [:71-72](lib/convert_visualization_type.ts#L71-L72)). It changes no filter, no period filter and no value prop, and a problem it leaves shows. The editor keeps, for its session, the layout and the style each type held, and a change back restores them. Today's editor keeps them only until the person opens another tab ([editor_panel.tsx:141-158](client/src/components/_shared/figure_editor/editor_panel.tsx#L141-L158)).

**The one write with no press** is the replicant's value, which the editor writes after a fetch when none is set or the one set is not among its dimension's values, as today.

**The wizard's starting config** passes the validator. A map names its area dimension (the finest admin level among the dimensions chosen, else the metric's coarsest) and the first value prop. A map or a pie of a metric that requires a period dimension takes the last full year as its period filter. Two or more value props take the type's own slot. Each dimension chosen takes the first free slot of the type, else the replicant, and none is offered while no place is free, as the editor's tick.

**The settings key (ruling 17)** is a canonical string of what the query reads: the metric id; the value props named, as a set; each filter's dimension and values, as a set; the period filter; the set of dimensions the query groups by; the replicant's value, as a filter of one value on its dimension, where no filter already holds that dimension to one value; and the roll-up's dimension while the roll-up is open. Which slot holds what, the roll-up's position, the style and the text are no part of it. It is built from the metric id and the config and from nothing else of the metric, so a place with only a bundle can build it. Two configs of one metric that give two fetch configs hold two keys (§1.10). Two that give one fetch config can hold two keys, where one names every value prop and the other none, where they name different value props of a metric whose query reads all of them (one with a post-aggregation expression or catalog evaluation), or where the package cannot total a roll-up: such a figure shows as stale, and Update clears it.

### 2.4 What becomes of every stored config

- 24,050 of the 24,052 stored figures convert [RUN]. For every stored figure, the fetch config, the axes, the roll-up, the filters, the period bounds and the conditional formatting before and after the prototype's first draft were equal but for the cases below [REVIEW].
- Two things on one slot, one of them not effective (268): a dimension filtered to one value leaves the slot and stays grouped. One that holds one value in the figure's rows moves to the first free slot (104).
- A relative period filter on yearly data (221, and 2 presets) becomes `lastFull` 1 year: the same rows.
- Line-and-point marks (26): two label flags become one, on if either was.
- A roll-up closed today whose dimension left its slot (9) is dropped.
- A timeseries whose time-axis dimension is also on a slot (7) loses the slot entry and would draw.
- Two effective dimensions on one slot (2): the second moves to the first free slot and would draw.
- A map with no admin-level `mapArea` (ghana slides `zm2`, `saf`) takes as `mapArea` the finest admin level it lays out, else its replicant's when that is an admin level, else `admin_area_2`, the coarsest admin level; the dimension leaves the slot or the replicant it held (ruling 20).
- A timeseries with no time grouping takes as `period` the finest period dimension it lays out, which leaves its slot, else `year` on yearly data and `period_id` otherwise (ruling 20).
- A timeseries whose marks are `points` or `points-connectors`, which a change of type from a chart leaves, takes `lines-points` (ruling 20).
- A colour that is neither a hex string nor a key is written as the hex string panther's `Color` reads from it, its transparency dropped. A colour `Color` cannot read, and an unknown palette name, stop boot (ruling 20).
- A fixed colour-scale domain whose minimum equals its maximum, which today's editor writes, is kept as it is (§2.2).
- A stored map that shows several value props (5) names the first, which is the one today's renderer draws (ruling 18).
- A dimension filtered to one value and on no slot joins what the query groups by, where today's fetch config leaves it out ([get_fetch_config_from_po.ts:43-52](lib/get_fetch_config_from_po.ts#L43-L52)): the same numbers under one more column. Preset `m9-01-01/iceh-coverage-trend` holds `strat` so, and [ATTACK3] 974 stored bundles lack such a column.
- Dropped, with no reader for the type that holds them: the fields of §1.1 and §1.7 with no reader; a style field of another type or mode; `timeseriesGrouping` off a timeseries; a replicant value with no replicant; a `from_month` filter's `max`.
- The conversion reads a bundle's value props only where no package of the instance holds the metric (step 6's metric data), since a backfilled bundle's may be labels (§1.7). It keeps `"valueProps"` on its stored slot wherever that slot is of the type and free.
- The conversion runs only on a row that holds `d`, after every other transform block but one, and every block before it passes a converted row through. The one after it keeps only the indicator catalog entries a bundle names, as today's last block does, and reads them from §2's config, so it runs on every converted bundle. The conversion and the blocks before it read a stored `{ d, s, t }` through a frozen copy of today's stored schema kept beside the transforms (ruling 19). The figure sweeps share one transaction, bring each package's manifest forward in memory and write no package file; the manifest sweep, which writes them, runs after the figure sweeps commit. A read of a version snapshot converts. A manifest transform fills a stored preset's defaults and converts it with its own manifest's metric.
- 96 of the converted figures have a validator problem (§1.10). They are stored and drawn as they are, and step 5's sweep lists them (ruling 18).

### 2.5 Panther

The union, the layouts, the styles and the checks are this app's. The low-level elements are imported from panther wherever it has or can hold them (ruling 14): the colour, the hex colour, the continuous palette name, the map projection, the map data label mode, the value sort, the column count, the period filter and the filter (`zColorKeyOrHex`, `zHexColor`, `zContinuousPaletteName`, `zMapProjection`, `zMapDataLabelMode`, `zValueSort`, `zNColsOrAuto`, `zPeriodFilter`, `zLongTableFilter`, with `zPeriodUnit` and `zFullPeriodUnit`).

## §3 Rulings

1. **Whole-figure checks.** Ruled in Tim's words (2026-11-13): "Please - extremely solid whole-figure checks, which if I understand would just be the zod schema (and don't we already have this?)". What the checks are is step 1's to design.
2. **Every tool input is closed.** Ruled (Tim, 2026-11-19). Every object in a tool input is `z.strictObject` at every level, panther's `createAITool` refuses an open one, and the API's `strict: true` is still never sent. The work is panther's `PLAN_01_CLOSED_TOOL_INPUTS.md` (`/Users/timroberton/projects/panther/timroberton-panther/`), which holds the evidence and closes every tool schema in this app. It runs before this plan's code steps. "Never `z.strictObject()`" in PROTOCOL_APP_AI_TOOLS.md is withdrawn, and that plan rewrites it. So the config, as the copilot's input, is closed at every level.
3. **One set of names for creating and editing a figure.** Ruled. Tim, 2026-11-13: "i agree with one-vocabulary" (§1.5, 2).
4. **One input.** Ruled (Tim, 2026-11-19). The copilot states a config. Changing a figure means stating it again, through one input shared by creating, replacing and the editor's tool. It rests on §1.5: "can just replace", "no need to "patch"" and "the same tool signature".
5. **No preset id in an input.** Ruled (Tim, 2026-11-19). A preset is a config the copilot reads as a recipe and states itself. An id would bring settings from somewhere the input does not show.
6. **`get_metric_data` takes the same names for the same things.** Ruled (Tim, 2026-11-19), under ruling 3.
7. **The app stops reading `allowedFilters`, and the field leaves the module definitions.** The first ruled (Tim, 2026-11-19): the create path from a preset is all that enforces it (§1.4), and with no preset in the input nothing does. The second ruled (Tim, 2026-11-20): it leaves both preset schemas and the 50 presets.

Rulings 8 to 13 were put to Tim on 2026-11-20 as questions, each with the step-1 agent's opinion. His reply to all of them: "agree with all your rulings". Each but ruling 12 is written here as that opinion.

8. **The shape.** The config is a union by figure type, with a slot-keyed layout and a style of each type's own (§2.1). This is the union declined on 2026-08-06 (§1.1).
9. **The names are panther's.** `pane`, `tier`, `lane` for a chart's `cell`, `row`, `col`; `title`, `subtitle`, `footnote`; `dim`. A later move into panther then needs no second migration.
10. **The period filter takes panther's four shapes**, in the stored config and in the fetch config, and yearly data takes only a range or the last full year. It changes the query engine's input type and every figure cache key.
11. **A change of type or chart mode discards the old one's style.** The editor keeps it for the session.
12. **The validator binds a person at the editor's one write.** Tim, 2026-11-22, of today's editor: "we simply show the error message in the UI so that users can change the fields to correct the issue". Every press is taken into the draft. A draft's problems show in place of its preview. The editor writes the draft to its host, and fetches rows for it, only while the draft has no problem that the config the document holds lacks, so the document keeps the last config written and a stored figure with an old problem can still be edited (§2.3). Nothing repairs a config on a person's behalf. The copilot's writes, a preset's build and the wizard's starting config are refused on any validator problem. Rendering does not run the metric checks, so a stored figure draws as it does today. Ruled (Tim, 2026-11-22: "good. ruled"). [ACCOUNT] He ruled on the second step-2 agent's account of it in the chat as "one gate", after its account in plain words: a person can press anything, a problem shows in place of the figure, and while a problem stands the change is not saved. Until then this ruling held the step-2 agent's rule, that an option is offered unless the config it would produce has a problem the draft lacks. Step 2 ran that rule, and an independent agent found that today's controls cannot reach some figures under it (§1.10). The first working of step 2, as "design live editing", was abandoned on Tim's word (§1.9, §6).
13. **A stored map with no admin area becomes an empty figure block**, listed in the migration log. Replaced by ruling 20.
14. **The high-level shapes stay in wb-fastr and the low-level elements come from panther.** Tim, 2026-11-20: "let's keep the high-level shapes in wb-fastr, but wherever possible, let's have low-level elements import from panther. to this end, move or create any needed schemas into panther (to import from), wherever it makes sense to do so." And of the design as a whole: "i think it's ok to design for wb-fastr primarily at this stage". Which elements those are is step 4's to settle with the code in front of it. This answers the question the plan kept for its last step, whether the config moves into panther: the config stays here.
15. **Nothing ships, and `wb-fastr-modules` is not pushed.** _(proposed)_ Production fetches module definitions from GitHub, and an app without §2's schema cannot parse a preset written in it. The push goes with the release, which is Tim's.
16. **How two people's edits to one figure combine is not designed.** Tim, 2026-11-21: "i hope that we're not designing for Yjs. It really is a low-priority aspect of the app, and not something we want to design for", and on 2026-11-22: "THIS SHOULD HAVE NOTHING TO DO WITH IT!". The shared document carries the config as one value: the bridge is written for `{ d, s, t }` and has to carry the new shape, and one value needs no design and always holds one person's whole config. Two people who change one figure in the same instant lose one of the two changes, where today both stand when they touch different fields. That is how the app then works. Ruled (Tim, 2026-11-22: "ok, can you update the plan?"). [ACCOUNT] His reply was to the step-2 agent's recommendation of the one value, with this cost stated as one the app keeps for good, and of ruling 17.
17. **A stored figure knows the settings its rows answer.** A bundle whose config holds other settings than its rows were fetched for is stale: it is not drawn as its own, and it shows today's stale badge and Update. This closes the mismatch that slide undo can leave today, and the one more way that the one value of ruling 16 adds (§1.9). Slide undo itself is not changed. Ruled with ruling 16, by the same reply. Tim's question before it, of today's error states: "how is that different to the issue you are discussing?" [ACCOUNT] The answer he was given: the app detects today's error states and shows a message, and nothing detects this one, so a figure can draw another config's numbers with no message. What it left to step 2 is ruled (Tim, 2026-11-22: "good. ruled"). The settings are what the query reads, and their key is built from the metric id and the config (§2.3). The key is recorded with the rows wherever rows are written. `buildFigureInputs` returns a bundle whose own key is another as unavailable, so every place that draws a stored figure shows it as it shows any figure it cannot draw, and `isFigureBundleStale` is true for it, so the badge and Update refetch it. In the shared document the metric id travels with the config, so that two metrics' figures cannot be taken for one. Stated to Tim and accepted with the ruling: while a person changes a figure's data settings the document holds the new config before its rows, and other people see the figure as unavailable until the rows arrive.
18. **The validator's rules are §2.2's, and the renderer's words are §2.1's, as step 2 settled them.** Ruled (Tim, 2026-11-22: "good. ruled"). [ACCOUNT] He ruled on a table the second step-2 agent set out in the chat, each row as what happens today and what was proposed, and on its account of the rows in plain words. What changed from step 1's design: two or more value props are on one named slot and are drawn only there, and a chart keeps a dimension on `indicator`; a dimension is effective by its members in the rows, and the date range plays no part; a required dimension is held on every type; a dimension is laid out only on a type its metric allows; coverage, disruptions and the band hold their value props on `series`; a map names one value prop, and the conversion writes the first for a stored map that shows several; a filter-only dimension is never grouped by; the wizard's starting config passes the validator. The 96 stored figures with a problem (§1.10) are stored and drawn as they are, and step 5's sweep lists them.

19. **The cutover's migration keeps PROTOCOL_APP_MIGRATIONS.md, and says in it where it departs.** Ruled (Tim, 2026-11-23: "yes", "make the proposed changes"). [ACCOUNT] His reply was to a check of step 7 against the protocol, which found four departures and asked one question:
    - The protocol keeps old transform blocks for good, and a version snapshot runs them on every read. Step 7 deleted the stored `{ d, s, t }` schema and pointed `figureBundleSchema` at §2's config, while today's figure-block transforms parse with both and step 6's block conversion parses the raw bundle with `figureBundleSchema`, so every unconverted block would come back unreadable. So today's stored config, its installed preset and what today's transform blocks import that the cutover removes from `lib` stay, frozen, beside the transforms, and the conversion moves there with them, since only the transforms, the sweep and tests convert a stored `{ d, s, t }`.
    - The protocol's dry run executes the function the migration executes. `sweep_figure_config.ts` takes each metric from the local module definitions, where boot takes it from each instance's packages. So the sweep runs step 6's block conversion with step 6's metric data.
    - The protocol says a migration needs nothing outside the database. The conversion reads the instance's package manifests, and a database restored before its package folders arrive converts from the bundles, for good: 270 of 24,078 live figures convert otherwise that way (§1.11). So the protocol names the exception, and the boot log counts conversions by where their metric data came from.
    - The protocol runs each data transform in its own transaction. The figure sweeps share one, so that a failed boot converts no figure and the previous image still boots. So the protocol says so, and its answer that code can be rolled back safely says it does not hold for a change the previous image cannot read.
    - The protocol names a stored schema's file with a leading underscore, so `lib/figure_config/schema.ts` becomes `_schema.ts`.

Rulings 20 to 22 were put to Tim on 2026-11-23 as questions, each with a recommendation, after five independent agents reviewed step 7 against the code. His reply to all of them: "ok can you update the plan with your recommendations?". Each is written here as that recommendation.

20. **A stored figure whose conversion fails is converted by a rule, and no figure block is emptied.** [ACCOUNT] The review found that step 6's conversion empties a block on five kinds of failure where ruling 13 named one, and that a saved visualization cannot be emptied, since its bundle is required, so its sweep stops boot. The rules are §2.4's. Two kinds no control or preset writes and no stored figure holds have no faithful rule, a colour that panther's `Color` cannot read and an unknown palette name: each stops boot as invalid data does (PROTOCOL_APP_MIGRATIONS.md, principle 4), and the sweep finds none before a release. This replaces ruling 13.
21. **The editor's undo restores this person's last config over another writer's (`ignoreRemoteMapChanges`).** [ACCOUNT] Step 7's Deliverable set it, so that an undo never leaves the map with no config (§1.9), while §0 and §5 ruled out any design of undo beyond rulings 16 and 17. It is the one exception.
22. **`get_metric_data`'s input (ruling 6), the read of §2.3's change of type, and `dim` in place of `get_dimension_values`' `disOpt` are step 7's.** [ACCOUNT] Step 7 deletes `configDStrict`, which `get_metric_data`'s input is built from, and the editor tool's `type`, which is the copilot's only change of type, so leaving them to step 9 would have step 7 rebuild that input in today's names for step 9 to replace. `disOpt` was renamed by no step, against ruling 3. Step 9 keeps the read of the starting config and the notes.

Step 1 tested rulings 4 to 7 (§1.7). Step 2 ran the first rule of ruling 12 and settled rulings 12, 17 and 18 (§1.10). No step reopens a ruling.

## §4 Steps

Tim ruled that step 1 designs the config and writes the steps after it. What step 1 contains is the writing agent's _(proposed)_. Step 2 was added after step 1 on Tim's word, and redrawn on 2026-11-22 on his word (rulings 12, 16 and 17). The step of the stale check, now step 8, was added then (ruling 17). Step 2 was done on 2026-11-22, and the Deliverables and Gates of the code steps were rewritten on its rulings (12, 17 and 18). Step 6 was added on 2026-11-23 on Tim's word, after the tests of §1.11, so that the cutover builds on functions already tested: the cutover is now step 7, the stale check step 8 and the copilot's further reads step 9. The text of steps 1 to 5, which are done, names the later steps by their old numbers. On 2026-11-23 five independent agents reviewed step 7 against the code, and rulings 20 to 22 and their findings rewrote step 7 and moved `get_metric_data`'s input and the change-of-type read from step 9 into it.

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

### Step 2: settle the validator and the editor's rule (not code)

First worked as "design live editing" and abandoned on Tim's word (§6). The step-2 agent set these instructions out to Tim in the chat on 2026-11-22, and his reply to them and to rulings 16 and 17 was "ok, can you update the plan?".

**Surface.** This file.

**Deliverable.**

- The validator agrees with the renderer. Every case where the two disagree is listed with its count on the stored figures and put to Tim with a proposed rule: a config that passes and fails to draw, a figure that draws today and fails, and a config that passes and draws numbers other than what its text says. §1.9 holds the known cases.
- The editor's rule of ruling 12, run as a script over every preset, every config `deriveViewConfig` gives and every stored figure, those on a retired metric carried to their successor: which presses today's editor allows that the rule withholds, and whether any figure is left with no way to make a change a person would want.
- The functions for a press that must change more than one thing, each named with what it changes. Two are known (§2.3).
- What the editor holds as its own state and never writes to the config.
- For ruling 17: which parts of a config are the settings its rows answer, tested against the fetch config (two configs hold the same settings exactly when they give the same fetch config), and what each place that draws a stored figure does with a bundle whose settings are not its rows'.
- The design tested before it is put to Tim (§0): the scripts above, and one independent agent given the result and told to refute it, held to this step's scope.
- The findings go to Tim in the chat, as what exists, what this plan says and what is proposed, with every opinion marked as one. On his rulings, these are rewritten: §2.1's "What the words mean", §2.2, §2.3, rulings 12 and 17, and the Deliverables and Gates of steps 5 to 8 where they name the validator, the editor or the stale check.

**Not in this step.** How two people's edits combine, undo, and the shared document (ruling 16). A function that repairs a config. Any change to this repo's code, to the modules repo or to panther. Any change to §2.1's shape or to a ruling that Tim has not made.

**Gates.** `git status --short` shows this file and nothing else.

**Ends with.** One commit rewriting those parts of this plan, after Tim's rulings.

### Step 3: ground (not code)

Panther's `PLAN_01_CLOSED_TOOL_INPUTS.md` closed on 2026-11-20 and closed the copilot's schemas, so the code steps can start and their Surfaces are written from the code as it now is.

**Surface.** This file.

**Deliverable.** The Surface of each of steps 4 to 8, written from the step's Deliverable and the code as it then is, each new file named. Any file, line or claim of §1 and §2 found wrong is corrected in place. Where the code no longer admits a ruling or a Deliverable, the step stops with the question for Tim.

**Not in this step.** Any code. Any change to §2 or §3.

**Gates.** `git status --short` shows this file and nothing else. A reviewer who derives a step's Surface from its Deliverable and the code finds no file missing and none surplus.

**Ends with.** One commit.

### Step 4: panther's low-level schemas

Repo: panther. Its CLAUDE.md is read first.

**Surface.**

In panther (`/Users/timroberton/projects/panther/timroberton-panther`):

- `modules/_150_figure_schema/leaves.ts` (new): the colour, the hex colour, the continuous palette name, the map projection, the map label placement, the value sort and the column count, in a file that imports nothing but zod
- `modules/_150_figure_schema/figure_inputs.ts` (its private `zColorKeyOrString`, a `z.custom` that `z.toJSONSchema` cannot convert, gives way to the exported colour schema)
- `modules/_150_figure_schema/mod.ts`
- `modules/_150_figure_schema/deps.ts` (the types the new schemas are checked against with `Conforms`, `ContinuousPaletteName` among them)
- `modules/_150_figure_schema/shared.ts` (the `ConformsExactly` checks of the style leaves, which cannot sit in a file that imports nothing but zod)
- `modules/_003_figure_style/_1_default_figure_style.ts`, `_2_custom_figure_style_options.ts`, `_3_merged_style_return_types.ts` (`MapProjection` names the projection union, which `zMapProjection` is checked against, and `NColsOrAuto` the column count, which `zNColsOrAuto` is checked against)
- `modules/_010_maps/_internal/projections.ts`, `modules/_010_maps/deps.ts` (`getProjectionFn` takes `MapProjection`)
- `modules/_007_figure_core/common_data_transform.ts`, `chart_ov_or_oh_transform.ts`, `modules/_010_chartov/types.ts`, `deps.ts`, `modules/_010_chartoh/types.ts`, `deps.ts`, `modules/_010_pie/types.ts`, `deps.ts` (`ValueSort` names the value sort union, which `zValueSort` is checked against)
- `modules/_150_figure_schema/chartov.ts`, `chartoh.ts`, `pie.ts` (their inline sort enums give way to `zValueSort`)
- `DOC_MODULE_STRUCTURE.md` (the deps.ts rule and its exception for a file that imports nothing but zod)
- `modules/_151_long_table_schema/filters.ts` (new): `zPeriodFilter` and `zLongTableFilter`, with `zPeriodUnit` and `zFullPeriodUnit`, moved out of `schema.ts`, which imports `deps.ts`, into a file that imports nothing but zod
- `modules/_151_long_table_schema/schema.ts`
- `modules/_151_long_table_schema/mod.ts`
- `tests/leaf_schemas_test.ts` (new)
- `DOC_FIGURE_ARCHITECTURE.md` ("Figure Schemas (`_150_figure_schema`)")
- `DOC_LONG_TABLE_QUERY.md` (the `_151` exports and the file layout)
- `TERMINOLOGY.md`

In this repo, the sync commit:

- `panther/`: the files `./sync wb-fastr` copies

**Deliverable.**

- Panther exports, through both entry files, a closed zod schema that `z.toJSONSchema` converts for every low-level element of §2.1 that panther has a type for or can sensibly hold (ruling 14). The step settles the list. It starts from: the period filter and the filter, which panther has; a colour that is a hex string or `{ key }`; a continuous palette name; a map projection; a map label placement.
- `wb-fastr-modules` has no panther copy (§1.7). The schemas the config imports can be copied into it as files that import nothing but zod.
- Panther's own docs and TERMINOLOGY.md say what the step added.
- `./sync wb-fastr` has run.

**Not in this step.** A JSON form of panther's style (panther's `PLAN_21_FIGURE_JSON_INPUT.md`). The long-table figure model (panther's `PLAN_20_LONG_TABLE_FIGURE.md`). Any change to this app beyond the sync.

**Gates.** Panther's floor. A committed panther test pins what each new schema accepts and refuses. This app's floor after the sync.

**Ends with.** One commit in panther and one sync commit here.

### Step 5: the schema, the checks and the conversion

Repo: this one. Nothing the app runs reads the new schema until step 7.

**Surface.**

- `lib/figure_config/mod.ts` (new)
- `lib/figure_config/schema.ts` (new): the factory, its stored and preset instances, and the config-alone checks
- `lib/figure_config/validate.ts` (new): the metric checks
- `lib/figure_config/convert.ts` (new): the conversion of §2.4
- `lib/figure_config/derive.ts` (new): what the query groups by, the effective dimensions, where the value props are drawn, the roll-up, the replicant and the fetch config
- `lib/figure_config/settings_key.ts` (new)
- `lib/figure_config/gate.ts` (new)
- `lib/figure_config/starting_config.ts` (new)
- `lib/special_chart_metrics.ts` (new): the four lists of the metrics each special mode takes, moved from the client so that the validator in `lib` reads them, `m2-02-01` added
- `lib/mod.ts` (exports `special_chart_metrics.ts`, since the client imports `lib` only through the barrel)
- `client/src/generate_visualization/special_chart_checks.ts` (its four lists come from `lib`)
- `server/tests/figure_config_schema_test.ts` (new): a passing and a refused case for every config-alone check
- `server/tests/figure_config_validate_test.ts` (new): a passing and a refused case for every metric check
- `server/tests/figure_config_convert_test.ts` (new): a case for every rule of §2.4
- `server/tests/figure_config_presets_test.ts` (new): under `FASTR_MODULES_LOCAL_DIR`, the presets, the Explore configs, the comparison with today's functions, the starting configs and the settings keys
- `server/tests/figure_config_gate_test.ts` (new)
- `sweep_figure_config.ts` (new, repo root)
- `deno.json` (the typecheck task checks the new root script)
- `SYSTEM_10_figure_render_export.md` (manifest: `lib/special_chart_metrics.ts`; the special-mode prose, which names `special_chart_checks.ts` as the home of the lists; Open items: the 5,424 figures)
- `SYSTEM_11_viz_authoring.md` (manifest: `lib/figure_config/**`, the five tests and the comparison they share with the sweep; "lib config semantics")
- `lib/get_fetch_config_from_po.ts` (exports the last-full-year and last-full-quarter bounds and the re-anchoring of a bound, which the figure config's period bounds read)
- `server/tests/_figure_config_comparison.ts` (new): the comparison with today's functions, shared by the presets test and the sweep
- `server/tests/_module_definitions.ts` (each metric carries whether its rows are facilities, as a package stamps it, which roll-up eligibility reads)
- `sweep_retired_figures.ts` (exports the fleet's ssh tunnel, which the new sweep reuses)

**Deliverable.**

- §2.1's schema in `lib`, as one factory with a stored instance and a preset instance, its low-level elements imported from panther.
- The validator: §2.2's config-alone checks inside the schema, and its metric checks as one pure function in `lib` that returns problems, each a kind and what it names (ruling 18).
- `SPECIAL_PERCENT_CHANGE_CHART_METRICS` names `m2-02-01`, the successor of a `m3-01-01` figure that compares adjustment bases or uses a facility column, so the 80 stored percent-change charts on it pass (§1.9).
- The conversion of §2.4 as a pure function, with what it needs of a bundle as arguments.
- What §2 derives from a config, as pure functions in `lib`: what the query groups by, the fetch config, which dimensions are effective given the rows' members, where the value props are drawn, the roll-up, the replicant, and the settings key (§2.3).
- The editor's gate of ruling 12 as a pure function of a draft's problems and the document's config's, and the wizard's starting config of §2.3 as a pure function of a metric, a type and the dimensions chosen.
- Tests: a passing and a refused case for every check; a case for every rule of §2.4; under `FASTR_MODULES_LOCAL_DIR`, every preset and every config `deriveViewConfig` gives converts, fits and passes the metric checks; for each of those, the fetch config, the axes, the roll-up, the filters, the period bounds and the conditional formatting derived from the converted config equal those today's functions derive from the stored one, but for the two renderer rules of ruling 18 and for a dimension filtered to one value and on no slot, which §2's query groups by and today's does not; the starting config of every metric, for every type it can draw, with no optional dimension and with each one, has no problem; any two of a metric's presets and Explore configs that give two fetch configs hold two settings keys; a draft with a problem the document's config lacks is not written, and one with only that config's problems, or none, is.
- A read-only root script in the manner of `sweep_retired_figures.ts` that runs the same comparison over every stored figure of every instance, writes its counts by the cases of §2.4, and lists every stored figure that has a validator problem, by problem.
- SYSTEM_10's Open items gains the 5,424 figures of §1.7 that have no value prop to draw.

**Not in this step.** Any change to what is stored, read or drawn. The modules repo.

**Gates.** The floor. The new test files. The sweep reports that every stored figure converts and fits but a map with no admin-level `mapArea`, and that every difference is one §2.4 lists.

**Ends with.** One commit.

### Step 6: what the cutover builds on

Repo: this one. Nothing the app runs reads what this step adds until step 7. It holds what step 7 needs that can be built and tested before the swap. The renderer's style from §2's config and the editor are step 7's, because `lint:structure` refuses a client file nothing imports (§1.11). The collab bridge is step 7's, because its file is today's bridge's, `lib/collab/figure_config_crdt.ts`.

**Surface.**

- `lib/types/period_options.ts` (new): the period option, its conversions to and from panther's period type, `inferPeriodFormatFromValue` and `inferPeriodFormatFromValuesIfTheSame`, moved out of `_metric_installed.ts`
- `lib/types/value_func.ts` (new): `valueFuncStrict` and `ValueFunc`, moved out of `_metric_installed.ts`
- `lib/types/_metric_installed.ts`
- `lib/types/mod.ts`
- `lib/types/disaggregation_options.ts` (gains `FILTER_ONLY_DISAGGREGATION_OPTIONS`)
- `lib/validate_fetch_config.ts` (loses it)
- `lib/rollup.ts` (`RollupEligibilityInputs` takes `ValueFunc` from its own file and reads the two expressions by presence)
- `lib/figure_config/schema.ts` (gains `shownValueProps`)
- `lib/figure_config/validate.ts` (`FigureMetric` written out, not picked from `ResultsValue`)
- `lib/figure_config/derive.ts` (loses `shownValueProps`; checks that `ResultsValue` conforms to `FigureMetric`)
- `lib/figure_config/starting_config.ts`
- `lib/figure_config/change_type.ts` (new): §2.3's change of type
- `lib/figure_config/describe_problem.ts` (new): the words of each problem, which the editor shows and the copilot's refusal returns
- `lib/figure_config/diff.ts` (new): every field where two configs differ
- `lib/figure_config/mod.ts`
- each file that imports a name this step moves by a relative path
- `server/runs/figure_metric_data.ts` (new): the metric data the conversion needs, for every stored figure of an instance
- `server/db/migrations/data_transforms/figure_config.ts` (new): the conversion of a stored figure block
- `server/tests/figure_config_closure_test.ts` (new)
- `server/tests/figure_config_change_type_test.ts` (new)
- `server/tests/figure_config_diff_test.ts` (new)
- `server/tests/figure_config_block_test.ts` (new)
- `server/tests/figure_config_render_test.ts` (new): every preset and Explore config drawn through panther's transforms
- `server/tests/_figure_config_sets.ts` (new): the presets and Explore configs the presets, change-of-type and render tests run over
- `server/tests/figure_config_presets_test.ts` (its sets move to `_figure_config_sets.ts`)
- `SYSTEM_02_persistence.md`, `SYSTEM_08_results_packages.md`, `SYSTEM_11_viz_authoring.md` (manifests and prose for the new and moved files)
- `SYSTEM_09_viz_query_cache.md` (it names the files that hold `inferPeriodFormatFromValue` and `FILTER_ONLY_DISAGGREGATION_OPTIONS`)
- `SYSTEM_13_ai_assistant.md`, `PLAN_DEFECTS.md` (line numbers in `_metric_installed.ts` and `rollup.ts` that the moves shift)

**Deliverable.**

- The schema and the validator import only zod, `@timroberton/panther`, each other and `lib/types/disaggregation_options.ts`, `period_options.ts`, `value_func.ts`, `lib/rollup.ts` and `lib/special_chart_metrics.ts`, which import nothing else of the app's. The panther names they import are all in panther's `_150_figure_schema/leaves.ts`, `_151_long_table_schema/filters.ts` and `_000_utils/periods.ts`. So `wb-fastr-modules` can copy them, with those three panther files, `assert.ts` and `translate.ts` (§1.11).
- §2.3's change of type as a pure function of a config, a type and the metric.
- The words of each problem kind, as a pure function whose switch over the kinds is exhaustive.
- Every field where two configs differ, as a pure function.
- The metric data of a stored figure: its own package's metric, as `enrichMetricFromManifest` reads the manifest's metric row and results object; else the newest other package of the instance that holds the metric with data; else the bundle's own value props, yearly when its date range is in years, and a roll-up kept. Each run's manifest is read once per use, not once per figure. On 2026-11-23 the three cases held 24,078, 858 and 11 of the 24,947 live figures (§1.11).
- The conversion of a stored figure block, as a pure function of the block and its metric data: it converts the config as §2.4 says, passes a block already converted or with no bundle through unchanged, and makes a map with no admin-level `mapArea` an empty figure block, which it reports for the migration log.

**Not in this step.** Any change to what is stored, read or drawn. The client. The collab bridge. The modules repo.

**Gates.** The floor. The new tests: the import closure of `schema.ts` and `validate.ts` is the files above and their panther names are in the three panther files; the change of type puts each dimension where §2.3 says, and changing every preset and Explore config to every type its metric draws gives a config that fits the schema; the diff lists exactly the fields that differ; the metric data takes the own package's, else another package's, else the bundle's; the conversion of a block converts a stored one, passes a converted one and one with no bundle through unchanged, and empties a map with no area; every preset and every config `deriveViewConfig` gives, converted and laid out by `figureAxes`, drawn through panther's transforms over made rows, each also with each laid-out dimension held to one member, throws nowhere. Step 5's tests still pass.

**Ends with.** One commit.

### Step 7: the cutover

Repos: this one and `wb-fastr-modules`.

**Surface.**

In this repo, `lib`:

- `lib/figure_config/mod.ts`
- `lib/figure_config/schema.ts` (renamed `_schema.ts`, the protocol's prefix for a stored schema; it refuses a fixed scale domain only where its minimum is above its maximum), and the files that import it: `lib/figure_config/change_type.ts`, `derive.ts`, `diff.ts`, `settings_key.ts`, `validate.ts`, and `lib/special_chart_metrics.ts`
- `lib/figure_config/describe_problem.ts` (it words a shape problem at a filter's values, at custom colours and at a number as the action that completes it, and names a place by the editor's control or, for the copilot, by its config key and a dimension by its id)
- `lib/figure_config/starting_config.ts` (`defaultFigureStyle` takes a timeseries mode, with the defaults of the special modes)
- `lib/figure_config/figure_metric.ts` (new): the `FigureMetric` of a module definition's metric and its results object, with every facility column, which the modules build and `server/tests/_module_definitions.ts` both use; it imports only what `_schema.ts` and `validate.ts` may (step 6)
- `lib/figure_config/convert.ts` (moved to `server/db/migrations/data_transforms/convert_po_config.ts`, ruling 19)
- `lib/types/disaggregation_options.ts` (gains `PHYSICAL_DISAGGREGATION_COLUMNS`, the derivation of a metric's available dimensions, taking the enabled facility columns as a list, and the figure types each dimension allows, so the modules build can copy them; its filter-only comment names §2's layout and no longer `validateFigureConfigEdit`)
- `lib/disaggregation_labels.ts` (`getDisaggregationAllowedPresentationOptions` moves out)
- `lib/rollup.ts` (its comment names `effectiveRollupDim` in `lib/figure_config/derive.ts`)
- `lib/ai_tools/figure_input_for_ai.ts` (new): the copilot's figure input `{ metricId, config }` with `figureConfigShapeSchema`, the whole validator run before §2.2's data checks, one refusal that names every problem, the JSON a read returns, and a write's change report from step 6's diff; every tool that writes or reads a figure calls it
- `lib/ai_tools/read_bounds.ts` (`disOpt` becomes `dim`)
- `lib/ai_tools/copilot_catalogue.ts` (the views and the gate of the change-of-type read)
- `lib/mod.ts`
- `lib/types/mod.ts`
- `lib/types/_presentation_object_config.ts` (deleted from `lib`; frozen in `server/db/migrations/data_transforms/_po_config_schema.ts`, ruling 19)
- `lib/types/_metric_installed.ts` (`configDStrict`, `configSStrict`, today's period filter and the installed preset)
- `lib/types/_module_definition_github.ts` (the authored preset becomes the preset instance)
- `lib/types/conditional_formatting.ts` (`selectCf`, `flattenCf` and today's union)
- `lib/types/conditional_formatting_standalone.ts` (`cfStorageSchema`; the indicator's thresholds rule stays)
- `lib/types/presentation_object_defaults.ts`
- `lib/types/presentation_objects.ts` (`VIZ_TYPE_CONFIG`, `getStartingConfigForPresentationObject`, `periodFilterHasBounds` and the fetch config's period filter)
- `lib/types/_figure_bundle.ts`
- `lib/types/modules.ts`
- `lib/types/slides.ts`
- `lib/types/ai_input.ts`
- `lib/types/run_manifest.ts` (the manifest version and its history)
- `lib/convert_visualization_type.ts` (deleted)
- `lib/normalize_po_config.ts`
- `lib/get_fetch_config_from_po.ts` (`getPeriodFilterExactBounds` goes, for `periodFilterBounds` in `lib/figure_config/derive.ts`)
- `lib/validate_fetch_config.ts`
- `lib/get_disaggregator_display_prop.ts`
- `lib/derive_presets.ts`
- `lib/explore_query.ts`
- `lib/retired_metrics.ts`
- `lib/figure_package_issue.ts`
- `lib/resolve_effective_indicator_facts.ts`
- `lib/resolve_figure_calendar.ts`
- `lib/utils.ts` (`withReplicant`)
- `lib/collab/figure_config_crdt.ts` (the config as one value beside its metric id, the three texts as Y.Texts, and the function that builds the editor's undo manager: the editor's origin, `captureTimeout: 500`, `ignoreRemoteMapChanges`)
- `lib/collab/figure_entry_crdt.ts`
- `lib/collab/slide_crdt.ts`
- `lib/collab/report_crdt.ts`
- `lib/collab/visualization_crdt.ts`
- `lib/ai_tools/build_system_prompt.ts` (the deck brief's `from_metric` block, its steps for building a figure, and `disOpt`)
- `lib/ai_tools/content_validators.ts` (`validateAiMetricQuery` reads `get_metric_data`'s new names)
- `lib/ai_tools/format_metric_data_for_ai.ts` (it reads `get_metric_data`'s new input, and the period filter it builds for a read)
- `lib/ai_tools/format_metrics_list_for_ai.ts` (each preset as `deriveConfigFromVizPreset` gives it, no `allowedFilters`, `disOpt`, and its header on `get_metric_data`'s input)
- `lib/ai_tools/format_dimension_values_for_ai.ts` (`disOpt` becomes `dim`, and it tells the model that a replicant takes a value by its id)
- `lib/ai_tools/tools_metrics.ts` (`get_metric_data`'s input, `get_dimension_values`' `dim` and description, and the change-of-type read; one builder makes these tools for the app's copilot and for `/mcp`)
- `lib/legacy_cf_presets.ts` (it imports `ConditionalFormattingThresholds`, and `threeTier` and `divergingSevenBucket` carry no `direction`, which §2.1's thresholds require)
- `lib/collab/crdt_util.ts` (the `setOpaqueByValue` comment takes a figure config's `filterBy` as its case)

In this repo, `client/src`:

- `generate_visualization/apply_figure_config_patch.ts` (deleted)
- `generate_visualization/describe_figure_config_patch_effect.ts` (deleted)
- `generate_visualization/validate_figure_config_edit.ts` (deleted)
- `generate_visualization/assert_replicant_valid.ts`
- `generate_visualization/build_figure_inputs.ts`
- `generate_visualization/conditional_formatting.ts`
- `generate_visualization/conditional_formatting/compile.ts`
- `generate_visualization/get_admin_area_level_from_config.ts`
- `generate_visualization/get_data_config_for_map.ts`
- `generate_visualization/get_data_config_from_po.ts`
- `generate_visualization/get_style_from_po.ts`
- `generate_visualization/get_style_from_po/_0_common.ts`, `_1_standard.ts`, `_2_coverage.ts`, `_3_percent_change.ts`, `_4_disruptions.ts`, `_6_disruptions_v2.ts`
- `generate_visualization/mod.ts`
- `generate_visualization/resolve_bundle_from_metric_and_config.ts`
- `generate_visualization/resolve_figure_from_metric.ts`
- `generate_visualization/special_chart_checks.ts`
- `components/_shared/figure_preview.ts`
- `components/_shared/figure_editor/figure_editor.tsx` (its observer takes a change it did not write into the draft by what it changed, its undo manager comes from `lib/collab/figure_config_crdt.ts`, and its downloads read the config whose rows the preview holds)
- `components/_shared/figure_editor/write_draft.ts` (new): the editor's live write to its host, Apply, Back and its fetch of rows, each through step 5's gate, as functions the test can call
- `components/_shared/figure_editor/visualization_editor.tsx`
- `components/_shared/figure_editor/editor_panel.tsx`
- `components/_shared/figure_editor/editor_panel_data.tsx`
- `components/_shared/figure_editor/editor_panel_data/disaggregation_section.tsx`, `filters.tsx`, `summary.tsx`
- `components/_shared/figure_editor/editor_panel_style.tsx`
- `components/_shared/figure_editor/editor_panel_style/chart_like_controls.tsx`, `chart_style_controls.tsx`, `conditional_formatting_store.ts`, `custom_value_order_section.tsx`, `map_style_controls.tsx`, `pie_style_controls.tsx`, `shared_controls_top.tsx`, `table_style_controls.tsx`, `timeseries_style_controls.tsx`
- `components/_shared/figure_editor/editor_panel_text.tsx`
- `components/_shared/figure_editor/replicate_by_options.tsx`
- `components/_shared/figure_editor/custom_series_styles.tsx`
- `components/_shared/figure_editor/_shared/conditional_formatting_editor.tsx`
- `components/products/_shared/insert_figure/insert_figure.tsx`, `insert_existing_figure.tsx`, `preset_preview.tsx`
- `components/products/_shared/insert_figure/step_3_configure.tsx` (a dimension is offered a tick only while `startingFigureConfig` with it added lays it out)
- `components/explore/data_table/data_table.tsx`, `cell_function.ts`
- `components/results_packages/package_view/presets.tsx`
- `components/products/_shared/version_history/visualization_settings_diff.ts`, `deck_version_preview.tsx`, `report_version_preview.tsx`
- `components/instance/copilot/ai_views.ts`
- `components/instance/copilot/build_system_prompt.ts` (what `get_figure_editor` reads)
- `components/products/copilot/_shared/content_validators.ts`, `figure_metric_for_ai.ts`, `format_figure_config_for_ai.ts`, `mod.ts`
- `components/products/copilot/ai_tools/tools/figure_editor.ts`, `report_editor.ts`, `slide_write_result.ts`, `slides.tsx`, `update_figure.ts`, `update_slide.ts`, `drafts.tsx`, `get_slides.ts`
- `components/products/copilot/ai_tools/tools/draft_slide_preview.tsx` (a saved draft card parses its stored input with the tool's input schema, and one of the earlier shape shows a fixed message and is not converted)
- `components/instance/copilot_tools.ts` (the change-of-type read)
- `components/products/copilot/slide_ai/build_config_from_preset.ts` (deleted)
- `components/products/copilot/slide_ai/convert_ai_input_to_slide.ts`, `get_slide_with_updated_blocks.ts`, `mod.ts`, `resolve_figure_from_metric.ts`, `simplify_slide_for_ai.ts`
- `state/products/t2_figure_data.ts` (`run_po_items_v3` renamed `v4`: the payload's fetch config carries §2's period filter)
- `state/products/t2_replicant_options.ts` (`run_replicant_options_v4` renamed `v5`, the same reason), `state/products/t2_grid_items.ts` (`run_grid_items_v3` renamed `v4`, the same reason)
- `state/instance/t2_run_authoring_context.ts` (`run_authoring_context_v5` renamed `v6`: its presets are §2's configs)

In this repo, `server`, the root and the docs:

- `server/db/migrations/data_transforms/po_config.ts`, `slide_config.ts`, `reports.ts`, `visualizations.ts`, `figure_config.ts`
- `server/db/migrations/data_transforms/_figure_block.ts` (the conversion block, and the catalog block after it, whose `namedIndicatorMetadata` reads §2's config)
- `server/db/migrations/data_transforms/_po_config_schema.ts` (new): today's stored `{ d, s, t }` schema and its installed preset, frozen, with what today's transform blocks and the preset conversion import from `lib` that the cutover removes or reshapes (`configDStrict`, `cfStorageSchema`, `flattenCf`, `CF_STORAGE_DEFAULTS`, `LEGACY_CF_PRESETS`, `DEFAULT_S_CONFIG`, `DEFAULT_T_CONFIG`, `getSingleValueDimsFromItems` and the period filter among them), and the stored bundle as `figureBundleSchema` with that config
- `server/db/migrations/data_transforms/convert_po_config.ts` (new, moved from `lib/figure_config/convert.ts`; ruling 20's rules)
- `server/db/migrations/instance/<next number>_clear_crdt_state.sql` (new)
- `server/db_startup.ts` (the figure sweeps share one transaction and run before the manifest sweep, and the boot log counts conversions by `metricSource`)
- `server/runs/figure_metric_data.ts` (at boot it brings each manifest forward in memory and writes no package file, and it catches only a manifest that is absent, unreadable or from a newer server, so a code defect stops boot)
- `server/runs/disaggregation_availability.ts`, `server/runs/mod.ts`, `server/runs/build_run_package.ts` (the derivations move to `lib/types/disaggregation_options.ts`)
- `server/db/products/versions.ts`
- `server/collab/visualization_rooms.ts`
- `server/routes/instance/collab.ts`
- `server/runs/manifest_transform.ts` (a block, at a new manifest version, that converts each stored preset; and the transform in memory, exported for the figure sweeps)
- `server/run_query/package_presets.ts`, `run_read.ts`
- `server/routes/caches/visualizations.ts` (`PO_CACHE_VERSION`)
- `server/server_only_funcs_presentation_objects/period_helpers.ts`
- `server/server_only_funcs_presentation_objects/presentation_object_items_core.ts` (it resolves the period through `periodFilterBounds`)
- `server/server_only_funcs_presentation_objects/query_helpers.ts` (its comment names `effectiveRollupDim`)
- `server/run_query/run_data_reads.ts` (the replicant read resolves its period through `periodFilterBounds`, and its comment on how a `from` filter re-anchors)
- `server/server_only_funcs_presentation_objects/possible_values_core.ts` (a comment that names `filterBy`)
- `server/mcp/mcp_tools.ts`, `server/mcp/mcp_endpoint.ts` (`get_metric_data`'s input and the change-of-type read)
- `server/tests/explore_query_test.ts`, `explore_views_test.ts`, `figure_bundle_schema_test.ts`, `indicator_metadata_for_read_test.ts`, `population_coverage_issue_test.ts`, `products_routes_test.ts`, `retired_metrics_test.ts`, `visualization_crdt_test.ts`, `run_manifest_transform_test.ts`, `copilot_prompt_test.ts`, `copilot_catalogue_test.ts`, `format_metric_data_for_ai_test.ts`, `dimension_values_for_ai_test.ts`
- `server/tests/_module_definitions.ts` (it builds each metric through `lib/figure_config/figure_metric.ts`)
- `server/tests/_figure_config_sets.ts` (its sets are the §2 configs `deriveConfigFromVizPreset` and `deriveViewConfig` now give, with §2's period filter)
- `server/tests/_figure_config_comparison.ts` (deleted: after the cutover there is no `{ d, s, t }` preset or Explore config and none of today's functions to compare)
- `server/tests/figure_config_presets_test.ts` (every preset and Explore config fits the schema and passes the metric checks; its starting-config and settings-key cases stay)
- `server/tests/figure_config_change_type_test.ts`, `figure_config_render_test.ts` (they read the sets without converting them)
- `server/tests/figure_config_convert_test.ts` (it imports the moved conversion, and gains a case for each rule of ruling 20 and for a scale domain of equal ends)
- `server/tests/figure_config_block_test.ts` (its stored `{ d, s, t }` bundles are built and parsed through `_po_config_schema.ts`)
- `server/tests/figure_config_closure_test.ts` (it names `_schema.ts`, and pins the closure of `lib/types/_module_definition_github.ts` and `lib/figure_config/figure_metric.ts` too)
- `server/tests/consolidated_products_test.ts` (it upgrades each version snapshot through the conversion `versions.ts` runs on read, before it parses)
- `server/tests/figure_editor_write_test.ts` (new): the live write, Apply, Back and the fetch pass only through the gate, and `figure_editor.tsx` holds no other write to its host's config map and no other fetch of rows
- `server/tests/figure_config_crdt_test.ts` (new): two documents write at once, then undo through the undo manager `figure_config_crdt.ts` builds
- `server/tests/figure_config_sweeps_test.ts` (new): the three figure sweeps over stored rows through a fake transaction
- `server/tests/figure_input_for_ai_test.ts` (new)
- `server/tests/package_presets_test.ts` (new)
- `server/tests/figure_config_reads_for_ai_test.ts` (new): the change of type as the copilot reads it
- `query_rig/cases.ts`
- `sweep_figure_config.ts` (it runs the conversion boot runs, ruling 19, over live rows and version snapshots, and drops the comparison)
- `sweep_retired_figures.ts`
- `SYSTEMS.md` (the vocabulary names `PresentationObjectConfig` as the config's type)
- `SYSTEM_02_persistence.md`, `SYSTEM_08_results_packages.md`, `SYSTEM_09_viz_query_cache.md`, `SYSTEM_10_figure_render_export.md`, `SYSTEM_11_viz_authoring.md`, `SYSTEM_13_ai_assistant.md`, `SYSTEM_16_collaboration.md` (prose, and the manifests for the new, deleted and moved files)
- `PROTOCOL_APP_AI_TOOLS.md` (`disOpt` becomes `dim`)
- `PROTOCOL_APP_QUERY_RIG.md` (it names `getPeriodFilterExactBounds`'s `quarter_id` block)
- `PLAN_DEFECTS.md` (a line cites the value props of `getFetchConfigFromPresentationObjectConfig`, now `figureFetchConfig`'s)
- `HFA_WORK_CATALOGUE.md` (M2 and L9 name today's fields)
- `SYSTEM_12_documents_sharing.md`, `SYSTEM_14_client_shell.md` (line citations into files the step rewrites)
- `USER_GUIDE_MCP.md` (its table of the `/mcp` tools)
- `PROTOCOL_APP_MIGRATIONS.md` (ruling 19: "How It Works" and the order of `INSTANCE_DATA_TRANSFORMS`, the FAQ on rolling back, the line in "Repairs" that a migration needs nothing outside the database, "Stored Data Schemas" and its Locations table, and the examples that name `_presentation_object_config.ts`)
- `TESTING_SCRIPT_FOR_AI_COPILOT.md` (its figure steps name a preset and `update_figure`'s change report)
- `client/public/info/iceh.md`, `client/public/info/iceh-equity-profile.md` (copilot reference documents that name presets by id, `chartTitle` and `selectedReplicant`)

In `wb-fastr-modules`:

- The metric files that hold presets: `m001/_metrics/m1-01-01.ts`, `m1-02-02.ts`, `m1-03-01.ts`, `m1-04-01.ts`, `m1-04-02.ts`; `m002/_metrics/m2-01-01.ts`, `m2-01-02.ts`, `m2-01-03.ts`, `m2-02-01.ts`; `m005/_metrics/m4a-01-01.ts`, `m4a-02-01.ts`; `m006/_metrics/m6-01-01.ts`, `m6-02-01.ts`, `m6-03-01.ts`; `m009/_metrics/m9-01-01.ts`, `m9-02-01.ts`; `m010/_metrics/m10-01-01.ts`, `m10-01-02.ts`, `m10-03-01.ts`, `m10-03-02.ts`; `m011/_band_chart.ts`, `m011/_metrics/m11-02-01.ts`; `m012/_metrics/m12-01-01.ts`
- `m001/definition.json`, `m002/definition.json`, `m005/definition.json`, `m006/definition.json`, `m009/definition.json`, `m010/definition.json`, `m011/definition.json`, `m012/definition.json` (rebuilt by `deno task build`)
- `_metrics_template.ts`
- `.validation/_module_definition_github.ts`, `conditional_formatting_standalone.ts`, `cf_presets.ts` (moved to the layout below)
- `.validation/validate_definitions.ts` (it runs the schema and the metric checks on every preset)
- `.validation/lib/` (new): the copies `vendor_schema` makes, each at its path under `lib/`, of `lib/types/_module_definition_github.ts`, step 6's schema and validator, `lib/figure_config/figure_metric.ts` and the files they import
- `.validation/panther/` (new): the copies of panther's `_150_figure_schema/leaves.ts`, `_151_long_table_schema/filters.ts`, `_000_utils/periods.ts`, `assert.ts` and `translate.ts` at their paths, and a `mod.ts` that exports them, which the import map names as `@timroberton/panther`
- every file outside `.validation/` that imports `.validation/_module_definition_github.ts` (62 on 2026-11-23), for its new path
- `vendor_schema`
- `build_definitions.ts` (it runs the schema and the metric checks on every preset, with each metric's `FigureMetric` from `figure_metric.ts`)
- `deno.json`, `deno.lock` (zod `^3.22.4` lacks `z.int()`, which the copied `_schema.ts`, `leaves.ts` and `filters.ts` call)
- `fix_cf_presets.ts` (it writes imports of the vendored schema and the flat `cf*` fields the cutover replaces)
- `review_ai_text/render_ai_view.ts`
- `review_ai_text/BRIEFING.md` (it documents a preset's `allowedFilters` and the `config.t` texts as the AI sees them)
- `review_ai_text/LANES.md` (it names the preset texts `caption`, `subCaption` and `footnote`)
- `DOC_VIZPRESET_STANDARDS.md`, `DOC_MODULES.md`, `DOC_METRICS_REFERENCE.md`, `DOC_SPECIAL_METRICS_SYNC.md`

**Deliverable.**

- §2's config is the one description of a figure: what is stored, what a preset holds, what the editor, the wizard and Explore write, what the collab map carries, what the query and the renderer read, and what the copilot states and reads (§2.3). `{ d, s, t }`, its three schemas, `cfStorageSchema` and the copilot's four shapes are gone from `lib`, the client and the module definitions. The stored config's schema is `lib/figure_config/_schema.ts`.
- The editor takes every press into the draft, shows the draft's problems in place of the preview, and reaches its host (the live write, Apply and Back) and fetches rows only through `write_draft.ts`, while step 5's gate passes the draft (ruling 12); Back with an unwritten draft returns the config the document holds. A change to the shared document that the editor did not write enters the draft by what it changed (§2.3). A download reads the config whose rows the preview holds. The editor words a shape problem at a filter's values, at custom colours and at a number as the action that completes it. Its controls are today's, with what §2.3 lists that the shape asks of them, and its change of type is §2.3's. A change of mode takes the mode's default style from `defaultFigureStyle` (ruling 11).
- The wizard inserts §2.3's starting config, and offers a dimension a tick only while the starting config with it added lays it out.
- The renderer takes where each thing is drawn from `figureAxes` (`lib/figure_config/derive.ts`), so it draws the value props on their one slot and judges an effective dimension by its members in the rows (§2.1).
- The collab map carries the config as one value, with its metric id beside it, and the three texts as Y.Texts (rulings 16 and 17). The editor's undo manager is built by a function of `lib/collab/figure_config_crdt.ts`, with `ignoreRemoteMapChanges`, so that an undo never leaves the map with no config (ruling 21, §1.9). `dropStorageInvalidTransients` is gone.
- Every stored figure is converted as §2.4 says, with ruling 20's rules, by step 6's conversion of a figure block with step 6's metric data: slides, reports, saved visualizations and version snapshots on read. A snapshot's figure block with no bundle (104 on 2026-11-23, §1.11) is passed through unchanged. No figure block is emptied, and no conversion leaves a saved visualization without a bundle. A new migration clears stored `crdt_state`.
- The presets in each package's manifest are converted by a manifest transform block at a new `RUN_MANIFEST_SCHEMA_VERSION`: each preset is filled with the frozen defaults and converted by `convertFigureConfig`, with its own manifest's metric row and results object read through `enrichMetricFromManifest`, whether or not the results object has data, and no single-value dimensions. Each result is parsed with the preset schema, and a preset whose conversion fails or whose result the schema refuses stops boot (on 2026-11-23 all 336 convert and fit, §1.11).
- The transforms read a stored `{ d, s, t }`, its bundle and its installed preset through `_po_config_schema.ts`, a frozen copy of today's schemas and of what today's blocks and the preset conversion import that the cutover removes from `lib`, and the conversion is `convert_po_config.ts` beside it, so a version snapshot of any age and a restored database still convert (ruling 19).
- The block that keeps only the indicator catalog entries a bundle names runs after the conversion, on every converted bundle, and `namedIndicatorMetadata` reads the filters and the replicant from §2's config.
- The three figure sweeps run in one transaction, before the manifest sweep. They bring each package's manifest forward in memory and write no package file, and their metric data catches only a manifest that is absent, unreadable or from a newer server, so a code defect stops boot before anything commits. Their stats count the figures converted with their own package's metric, another package's and the bundle's alone, and the boot log prints the three counts.
- `sweep_figure_config.ts` runs what boot runs, over every live figure and every version snapshot's figure blocks: step 6's conversion of a figure block, through the transform chain `versions.ts` runs on read for a snapshot, with step 6's metric data from each instance's packages, each manifest brought forward in memory as boot brings it and read in the one SSH session of §0. It reports its counts by outcome, by §2.4's cases and by metric source, and lists every figure with a validator problem. It holds no comparison with today's functions.
- PROTOCOL_APP_MIGRATIONS.md says: the figure sweeps share one transaction and run before the manifest sweep, so that a failed boot converts no figure, writes no package file, and the previous image still boots and reads every package; code can be rolled back only while the previous image reads the stored shape, which it does not after this conversion, nor a package until each `manifest.v18.json` is restored over its manifest; the figure-config conversion reads the instance's package manifests, and a database restored before its package folders arrive converts from the bundles, as the boot log counts; the figure config's stored schema is `lib/figure_config/_schema.ts`, and the frozen `{ d, s, t }` the transforms read is `_po_config_schema.ts`.
- The fetch config carries §2's period filter, `getPeriodFilterExactBounds` gives way to `periodFilterBounds`, and the figure cache prefixes, `PO_CACHE_VERSION` and the client caches the Surface names, are bumped (ruling 10).
- Every copilot tool that writes or reads a figure goes through `lib/ai_tools/figure_input_for_ai.ts`: the input `{ metricId, config }` with `figureConfigShapeSchema`, so a config-alone problem reaches the handler; the whole validator before §2.2's data checks; a write with any problem refused and nothing written, in one message that names every problem by config key and dimension id; a read that returns the same JSON; and a write's report of every field that differs from the stored config (step 6's diff), so a change the model did not mean is seen (§1.7). A read returns each of a metric's presets as `deriveConfigFromVizPreset` gives it, a config the input takes unchanged (rulings 3 to 5, 12). The app reads no `allowedFilters` (ruling 7).
- `get_metric_data` takes `{ metricId, groupBy, valueProps, filters, periodFilter }` (ruling 6), `get_dimension_values` takes `dim` in place of `disOpt`, and a read returns §2.3's change of type of a config to another type, for the app's copilot and for `/mcp` (ruling 22).
- A saved copilot draft card parses its stored input with the tool's input schema, and one of the earlier shape shows a fixed message and is not converted.
- A package's presets, as the insert wizard lists them and as the copilot reads them, leave out a preset that has a validator problem on that package's metric (3 of 336 on 2026-11-23, §1.11).
- `lib/figure_config/figure_metric.ts` builds a module definition's metric's `FigureMetric`, with every facility column, from what `lib/types/disaggregation_options.ts` now holds: the physical columns, the derivation of a metric's available dimensions, and the figure types each dimension allows. The app's test metrics and the modules' build both use it, and it is inside step 6's closure.
- In `wb-fastr-modules`: every preset is a complete config of §2's shape with translated texts and no `allowedFilters`. `vendor_schema` copies `lib/types/_module_definition_github.ts`, step 6's schema and validator, `figure_metric.ts` and the files they import to `.validation/lib/` at their paths under `lib/`, and panther's five files to `.validation/panther/`, whose `mod.ts` the import map names as `@timroberton/panther`. `deno task build` and `.validation/validate_definitions.ts` run the schema and the metric checks on every preset, and fail on any problem, so CI runs them too. `DOC_VIZPRESET_STANDARDS.md` says so. Committed, not pushed (ruling 15).
- The SYSTEM files, the protocols and the docs the Surface names say what the code now does.

**Not in this step.** The stale check of ruling 17 (step 8). The read of the starting config and the notes of §6 (step 9). A repair of the stored figures of §1.7 that do not draw. Any other change to how the shared document or undo behaves (rulings 16 and 21).

**Gates.** The floor. `./validate_migrations`. `./validate_queries`. In `wb-fastr-modules`, its floor (§0). The tests the step adds or edits, and step 6's, among them:

- `figure_config_presets_test.ts`: every preset and every config `deriveViewConfig` gives fits the schema and passes the metric checks, every starting config has no problem, and any two that give two fetch configs hold two settings keys.
- `figure_config_convert_test.ts`: a case for each rule of §2.4, ruling 20's among them, and a scale domain of equal ends kept.
- `figure_config_block_test.ts`: a stored `{ d, s, t }` block, parsed through `_po_config_schema.ts`, is converted; a converted one and one with no bundle are passed through.
- `figure_config_render_test.ts`: every preset and Explore config, laid out by `figureAxes` as the renderer reads it, drawn through panther's transforms, throws nowhere.
- `figure_config_sweeps_test.ts`: the three figure sweeps over stored slides, reports and visualizations through a fake transaction convert each figure, pass a block with no bundle through, apply ruling 20's rules, count the three metric sources in their stats, write no package file, and write nothing on a second run.
- `consolidated_products_test.ts`: every version snapshot parses after the conversion `versions.ts` runs on read.
- `figure_editor_write_test.ts`: the live write, Apply, Back and the fetch pass a draft only through step 5's gate, and `figure_editor.tsx` holds no other write to its host's config map and no other fetch of rows.
- `figure_config_crdt_test.ts`: two documents write a config at once and then undo through the undo manager `figure_config_crdt.ts` builds; the config value, without its texts, is one of the two whole, and each text holds both writers' edits.
- `figure_input_for_ai_test.ts`: a config-alone problem and a metric problem are each refused, naming every problem; a read's JSON parses as the input unchanged; a write's report lists exactly the fields that differ.
- `figure_config_reads_for_ai_test.ts`: the change-of-type read gives §2.3's change of type.
- `package_presets_test.ts`: a package's presets leave out one with a validator problem on its metric.
- `figure_config_closure_test.ts`: the closure of `_schema.ts`, `validate.ts`, `figure_metric.ts` and `_module_definition_github.ts` is the files the modules repo copies.

And `deno run --allow-all --env-file sweep_figure_config.ts` reports that every live figure and every version snapshot's figure block converts and fits §2's schema, with its counts by metric source.

**Ends with.** One commit here and one in `wb-fastr-modules`.

### Step 8: a stored figure knows the settings its rows answer

Repo: this one. It follows the cutover so that it is written once, on §2's config, and it lands before anything ships (ruling 15).

**Surface.**

- `lib/types/_figure_bundle.ts` (the key, and a reason of its own in `FigureUnavailable`)
- `client/src/generate_visualization/resolve_figure_from_metric.ts` (`makeFigureBundleFromFetchedData`, which builds every bundle with rows, writes the key; the shared document's rows side is the bundle less its config, so it carries the key with no change of its own)
- `client/src/generate_visualization/build_figure_inputs.ts`
- `client/src/generate_visualization/figure_staleness.ts`
- `client/src/generate_visualization/resolve_bundle_from_metric_and_config.ts` (words each unavailable reason for the copilot)
- `client/src/components/_shared/figure_preview.ts` (`describeFigureUnavailable`, the one wording of each reason)
- `client/src/components/_shared/figure_editor/figure_editor.tsx` (the preview while the draft's key is not its rows')
- `client/src/components/products/copilot/ai_tools/tools/figure_unavailable_for_ai.ts`
- `client/src/components/explore/data_table/data_table.tsx` (builds a bundle of its own)
- `server/db/migrations/data_transforms/_figure_block.ts` (the migration that gives every stored bundle its key: a transform block, where PROTOCOL_APP_MIGRATIONS puts product JSON, run by the three figure sweeps and on a version snapshot's read; and the blocks that rewrite a stored config)
- `server/tests/figure_staleness_test.ts`
- `server/tests/figure_bundle_schema_test.ts`, `indicator_metadata_for_read_test.ts`, `products_routes_test.ts`, `visualization_crdt_test.ts` (their bundles gain the key)
- `SYSTEM_02_persistence.md` (the figure-block transform), `SYSTEM_10_figure_render_export.md` ("The captured pair and staleness"), `SYSTEM_16_collaboration.md` (the rows side of the shared document)

**Deliverable.**

- A bundle records the settings key its rows were fetched for (§2.3), written with the rows wherever rows are written, and on the rows' side of the shared document (ruling 17).
- A bundle whose own key is another is stale. `buildFigureInputs` returns it as unavailable with a reason of its own, so every place that draws a stored figure shows it as it shows any figure it cannot draw. `isFigureBundleStale` is true for it, so the badge, Update and Update all refetch it. The editor's preview shows that it is refetching while the draft's key is not its rows'.
- A new migration gives every stored bundle the key of its own config.
- A transform that rewrites a stored config gives the bundle the key of the rewritten config when the bundle held the key of the config before it.
- The SYSTEM files say what the code now does.

**Not in this step.** Any change to slide undo, to the shared document beyond the key, or to what the editor writes (ruling 16).

**Gates.** The floor. `./validate_migrations`. The tests the step adds: a bundle given another config's rows is stale, a bundle given another metric's rows under one config is stale, a bundle whose style or text alone changed is not, and a transform that rewrites a fresh bundle's config leaves it fresh.

**Ends with.** One commit.

### Step 9: the copilot's read of the starting config, and the notes

Repo: this one.

**Surface.**

- `lib/ai_tools/tools_metrics.ts` (the read of the starting config, which needs only a metric, a type and the dimensions chosen; one builder makes these tools for the app's copilot and for `/mcp`)
- `lib/ai_tools/copilot_catalogue.ts` (the views and the gate of the read)
- `lib/ai_tools/build_system_prompt.ts` (the deck brief's steps for building a figure name the read)
- `client/src/components/instance/copilot_tools.ts`
- `server/mcp/mcp_tools.ts`
- `server/mcp/mcp_endpoint.ts` (its instructions name the package tools, which the read joins)
- `server/tests/copilot_catalogue_test.ts`, `copilot_prompt_test.ts`
- `server/tests/figure_config_reads_for_ai_test.ts` (the starting config as the copilot reads it)
- This file (§6's notes)
- `SYSTEM_05_facilities_indicators.md` (note 2, the map areas that match no boundary), `SYSTEM_09_viz_query_cache.md` (note 13, `__BLANK`), `SYSTEM_10_figure_render_export.md` (notes 3, 4, 5, 9 and 10, which are how a figure draws), `SYSTEM_13_ai_assistant.md` (the copilot's reads, and notes 14 to 17): each where a note moves to Open items
- `SYSTEM_08_results_packages.md` (it counts the `/mcp` metric tools)
- `PROTOCOL_APP_AI_TOOLS.md`
- `USER_GUIDE_MCP.md` (its table of the `/mcp` tools)

**Deliverable.**

- A read returns the wizard's starting config of §2.3 for a metric, a type and the dimensions chosen, so the model takes a style from the app. The read of §2.3's change of type is step 7's (ruling 22).
- Each of the 17 notes of §6 is closed by this plan, saying how, or moved to a SYSTEM file's Open items.
- SYSTEM_13 and PROTOCOL_APP_AI_TOOLS.md say what the code now does.

**Not in this step.** Any change to the stored config.

**Gates.** The floor. The tests the step adds or edits. After the review passes, `deno task test`, once for the plan.

**Ends with.** One commit, and the close commit that deletes this file.

## §5 Out of scope

- **Panther's figure schema.** The objective names it as the one other schema. Its own JSON form is panther's `PLAN_21_FIGURE_JSON_INPUT.md`. _(proposed)_
- **New figure types and significance testing.** _(proposed)_
- **Moving the config into panther.** Ruled (ruling 14): it stays here at this stage. Panther's `PLAN_20_LONG_TABLE_FIGURE.md` runs after this plan closes and takes the generic model from it.
- **A repair of the stored figures that do not draw** (§1.7). Step 5 writes them to SYSTEM_10's Open items.
- **How two people's edits to one figure combine, how undo behaves, and how the shared document is laid out.** Ruled out (ruling 16), with its cost stated there, but for the editor's `ignoreRemoteMapChanges` (ruling 21).
- **A function that repairs a config on a person's behalf.** Ruled out (ruling 12).
- **Withholding an option of an editor control by what the validator would say of its result.** Run by step 2 and replaced by the gate (ruling 12, §1.10).
- **A repair of the stored figures that have a validator problem** (§1.10). Step 5's sweep lists them (ruling 18).
- **Slide undo rewinding a figure's rows apart from its settings** (§1.9). Ruling 17 makes the result show as stale. The undo is not changed.

## §6 Log

- Step 1 wrote no Surface for the code steps, and a ground step that writes them, instead of the Surfaces its Deliverable names, because the code steps wait on panther's `PLAN_01_CLOSED_TOOL_INPUTS.md`, which rewrites files they touch.
- Step 1 did not write the last step its section names (does the config move into panther), because ruling 14 answers it.
- Step 1's review ran on the prototype's first draft. The schema of §2.1 is the revision after it, on which the three sets of §1.7 were run again and the review was not.
- Step 2 was first worked on 2026-11-21 as "design live editing", instead of the small step it now is, because its brief asked how two people's edits combine. The step-2 agent built a layout of the shared document by field, then a function that repaired a config after each press, and had each attacked by an independent agent. Tim stopped it. Nothing of it was committed. What it found is §1.9, and rulings 12, 16 and 17 redraw the step.
- Step 2 replaced the rule of ruling 12 it was given to test, instead of confirming it, because the independent agent found that today's controls cannot reach some figures under it (§1.10). Tim ruled the gate in its place.
- Step 2's independent agent attacked the rule that was replaced, and not the gate, which was put to Tim after the attack and marked to him as not attacked. The gate's two properties, that no draft with a new problem is written and that no press is withheld, are its definition. The validator it rests on was attacked.
- Step 4 ended with a second commit here, 5c3aa4cb6, after the sync commit 21fce60f8, because `./sync` makes its commit itself and stages only `panther/`, so the Surface's additions and §2.5 could not go in it.
- Step 5's conversion drops a roll-up on a metric whose values cannot be re-totalled, a case §2.4 does not name, because today's query never reads it (`getEffectiveRollupDimension`) and it is a field with no reader. Step 2's prototype found no such problem only because its test metrics carried no facility-rows flag and it read an AVG metric without one as eligible; with the flag a package stamps, 127 stored figures hold such a roll-up, and kept they would be validator problems beyond the 96 of ruling 18. The conversion takes whether the metric can be rolled up as an argument, beside its value props.
- Step 5's conversion puts two or more value props stored on a display option the type does not read on the slot today's renderer falls back to (`series`, `indicator`, `col`), a case §2.4 does not name, so such a figure keeps the axis it draws on today. No preset, Explore config or stored figure is in that state.
- Step 5's comparison gives today's renderer no date range, because its one-period rule is one of the two renderer rules ruling 18 changes, and reads a replicant whose value is `""` today and absent in the figure config as one, because neither reads a member and the editor writes a value after its first read.
- Step 5's sweep reads slides, reports and saved visualizations and not the version tables, whose rows are older shapes that only the transform chain on read brings to today's schema.
- Step 5's comparison counts as explained a figure on which today's renderer draws the value props on two axes, which throws today, a case §2.4 does not list, because it is one of the two renderer rules ruling 18 changes.
- Step 5 keyed the four special-mode metric lists by mode in one `SPECIAL_CHART_METRICS` record instead of four constants, because the validator indexes the list by the config's mode.
- Step 6 holds the cutover's functions in `lib` and `server`, and not the renderer's style from §2's config nor the collab bridge, which Tim was told on 2026-11-23 it would hold, because `lint:structure` refuses a client file nothing imports and the bridge's file is today's bridge's.
- Step 6's floor booted the server (`main.ts`) on a throwaway Postgres and Valkey, port 8099 and empty runs and assets folders, instead of `./run`, because Tim's own `./run` was running on the dev database and `./run` replaces its containers.

### NOTES FROM EXPERIMENT WITH AI AGENT IN sierraleone PROD INSTANCE

Developer request: figure-editor tools (AI assistant) Tested in the package figure viewer, preset “HFA indicators”, metric m10-01-01, on 2026-11-13. Every item below was reproduced in this session. I re-ran the checks and looked at an image after each render-affecting change.

Changes from my earlier notes:

I dropped the “Mental health & psychosocial support” sub-category item and the pie-slice claims. I could not verify them. I downgraded the tall-image item, because the table is readable. I corrected the map item. A district-level map isn’t rejected for lacking a map dimension if an admin dimension is already disaggregated. It is rejected because no data areas match any boundaries.

P1: Wrong or unverifiable output

Note 1. Roll-up is not in the config readback.

Repro: with admin_area_2 as rowGroup, call update_figure_editor with {"rollupDimension":"admin_area_2","rollupPosition":"top"}. Then call get_figure_editor. Actual: the update result says “applied”. Neither the echo nor get_figure_editor shows any roll-up field. The render does show a “National” group at the top, and removing the roll-up removes it. Expected: a Roll-up: admin_area_2 (top) line, so an agent can verify state without an image.

Note 2. HFA maps never render, although the package header says boundaries exist.

Context: the header says boundary files exist for HFA at admin_area_2 and admin_area_3. Repro: set type: map with admin_area_2 as mapArea, then again with admin_area_3. Actual: “none of the 5 data areas matches one of the 16 boundaries” at district level. “none of the 16 data areas matches one of the 22 boundaries” at chiefdom level. Note: the cause is unverified. It looks like a name or ID mismatch between the HFA areas and the boundary files. Related: with an admin dimension already disaggregated, type: map auto-assigns mapArea. With none, the error is A map needs one dimension displayed as "mapArea"…. Earlier, from a pie config, the same situation gave a different message: “Map figure has no admin-area map dimension”.

Note 3. Threshold colouring ignores indicator direction and unit.

Lower-is-better indicators are coloured as if higher is better: Water outage 0.0% is red. “Vaccine stockouts frequent or constant” 2.5% is red. Electricity outage 100.0% (Southern hospitals) is green. Non-percent values are coloured by the percent thresholds: “Index: PPE 66.7”, “Index: Diagnostics 47.1” and “Index: Vaccines 93.2” are all green. Expected: respect the declared direction and unit per indicator, or disable the colour scale where it can’t apply.

Note 4. Chart type has no series key.

Repro: convert the table to a chart. admin_area_2 becomes series, giving five bars per panel. Actual: nothing identifies which bar is which district, and the only legend is the threshold colours. For comparison: the same config as a pie does show a district legend. Also: the x-axis label under every chart panel reads “value”.

Note 5. Pie row labels overprint the first column of pies.

For example, “Water source available” and “Water outage (last 7 days)” overlap the first pie.

P2: Behaviour that surprises

Note 6. A stale replicant value survives a change of replicant dimension, and the error text misleads.

Repro: replicating by hfa_category with medical_supplies selected, set disaggregateBy to replicate by hfa_sub_category without a value. Actual: Invalid replicant value "medical_supplies" (pass the id, not the label). The value is a valid id for the old dimension, so the hint is wrong. Also: sending selectedReplicantValue: null then fails with “needs a selected replicant value”. Expected: default to the first valid value, or say “the replicant dimension changed; pick one of…”. The valid-values list itself is helpful.

Note 7. type: timeseries is accepted as an enum value but can never work on this metric.

Actual: the first error is “Timeseries config missing timeseriesGrouping”. Then year, period_id and quarter_id each fail with “Available: none”. Expected: reject the type up front with “metric has no time period column”, as periodFilter already does.

Note 8. null is rejected for footnote, caption and subCaption.

Actual: each gives “expected string, received null”. "" works. Inconsistent with: selectedReplicantValue, valuesFilter, periodFilter and rollupDimension, which accept null.

Note 9. A single-value column header is hidden.

time_point has only “Round 1”. Its header disappears in both the col and colGroup slots.

Note 10. The legend format differs by replicant.

It reads “≥ 80% / 70% – 80% / < 70%” for infrastructure, and “≥ 0.8 / 0.7 – 0.8 / < 0.7” for medical_supplies, while the cells show percentages.

P3: Error messages, schema and ergonomics

Note 11. get_metric_data misreports a wrong disaggregations shape.

Repro: pass [{"disOpt":"hfa_category"}]. Actual: the error is “Invalid option: expected one of <the whole enum>”, with no hint that plain strings are expected. Context: update_figure_editor uses objects (disOpt and disDisplayOpt) in disaggregateBy and filterBy, so the two are easy to mix up.

Note 12. A duplicated dimension gives an internal-jargon error.

Using hfa_indicator in both row and col gives colProp and rowProp are both given dimension "hfa_indicator". Pre-validate on disOpt and use slot names.

Note 13. __BLANK leaks into user-facing values.

Ownership: facility_ownership has the single value __BLANK. All 365 facilities for ind084 fall in it, yet it is advertised as an available dimension. Sub-category: the replicant list shows__BLANK ((Blank)), with doubled parentheses. Suggestion: hide empty dimensions and tidy the label.

Note 14. Images are one-shot with no persistent text.

The image result gives only the size (for example “1024×1198 px”). Please add a short text record, such as row and column counts, legend present or not, and truncated or scaled.

Note 15. Tall images are capped.

Repro: a 70-row table came back at 915×2046, narrower than the usual 1024. Actual: it was complete and legible, but it will degrade for longer tables. Suggestion: an option to paginate or crop.

Note 16. There is no reset-to-preset or undo tool.

After heavy testing the draft stays modified. The draft is currently a chart of medical supplies with the caption “TEST: tall table”. Closing the viewer discards it.

Note 17. The dimension enums are global.

The tool schema lists year, month and so on for every metric. Per-metric validation exists and its message is good: “Disaggregation(s) not available for metric… Available: …”. Low priority.

Confirmed working, no change needed Atomic failures: a failed update leaves the draft unchanged (“No changes were applied”), and a following read confirmed it. Type conversion remaps slots and reports them: table to chart gave rowGroup → series and colGroup → cell chart to pie gave colGroup → indicator Per-type slot validation: each type gets its own valid-slot list. Valid values on rejection: errors list valid values for filters, replicants and dimensions, and replicant validation respects filters in the same call. Updates report no-ops explicitly: an identical update returns “no change (the stored config already matched)”. Guards that reject correctly: removing a required dimension valuesDisDisplayOpt on a single-value figure (chart type) periodFilter on a non-time metric a roll-up on a dimension that isn’t disaggregated Roll-up rendering: adding and removing a roll-up renders correctly. Parallel calls: several updates in one reply run in order and return separate results.
