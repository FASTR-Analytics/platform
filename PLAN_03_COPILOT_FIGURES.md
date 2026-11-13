# PLAN: How the copilot states a figure

Status: NEEDS DESIGNING. Step 1 is the test of the design. No code step exists until that test has run and Tim has ruled on its findings.

The figures in a deck or a report are what a policy maker reads. This plan owns how the copilot creates, edits and reads a figure, and what checks a figure before it is stored. A stress test on 2026-11-12 and 2026-11-13 (three independent reviews, each finding below reproduced in the code or by running it) found that the copilot cannot build most of the figures users need, that nothing checks a whole figure, and that several figures which draw without error and mislead can be reached today. §2 holds the design that came out of that test. It has not itself been tested, so step 1 tests it.

**Next step: Do 1.**

Branch: `main`. Repos: this one. Step 1 decides whether `wb-fastr-modules` and `timroberton-panther` gain steps. Read first: [CLAUDE.md](CLAUDE.md), [SYSTEMS.md](SYSTEMS.md), [SYSTEM_13_ai_assistant.md](SYSTEM_13_ai_assistant.md) "Validate-before-commit", "Tool input schemas", "The slide_ai conversion layer" and Open items "Surface gaps", [SYSTEM_11_viz_authoring.md](SYSTEM_11_viz_authoring.md) "The insert-figure wizard", "lib config semantics" and "Explore query model", [SYSTEM_10_figure_render_export.md](SYSTEM_10_figure_render_export.md) on special modes, [PROTOCOL_APP_AI_TOOLS.md](PROTOCOL_APP_AI_TOOLS.md), and in the modules repo `DOC_VIZPRESET_STANDARDS.md`. Start when: step 1 at any time, since it writes no file in this repo but this one. Every later step: `test ! -e PLAN_COPILOT_TOOL_LIMIT.md && test ! -e PLAN_02_COPILOT_SURFACE_GAPS.md && echo ok` prints `ok` on `main`.

## §0 How to work this plan

The instruction is "Do the next step of PLAN_03_COPILOT_FIGURES.md." Branch, floor, conditional gates, reading order and the review cadence are [PROTOCOL_APP_PLANS.md](PROTOCOL_APP_PLANS.md) and [panther/protocols/PROTOCOL_ALL_PLANS.md](panther/protocols/PROTOCOL_ALL_PLANS.md). The log is §6. Step 1 sets the last step when it writes the steps after it. Nothing in this plan ships (ruling 6).

Vocabulary, used throughout:

- **figure**: a metric and its settings `{ d, s, t }`: the data settings, the style and the text (`PresentationObjectConfig`).
- **preset**: a figure a module author wrote for a metric (`vizPresets`, in the modules repo).
- **the editor**: the figure editor a person uses (`client/src/components/_shared/figure_editor/`).
- **statement**: what the copilot sends to create a figure or to change one.
- **whole-figure rule**: a check over a figure's settings and its metric together, run on the whole figure and never only on what a call changed.
- **misleading figure**: one that draws without error and shows numbers other than what its text says.
- **must-pass set**: figures known to be right, which every rule must accept.
- **must-refuse set**: misleading figures, each of which some rule must refuse.

Rules peculiar to this plan:

- Step 1 writes no file in this repo but this plan. Its prototype and its outputs live outside the repo. Production data it reads is read-only under PROTOCOL_ACCESS_DBS.md and is deleted when the step ends.
- A review agent's finding enters this plan only after the working agent has reproduced it in the code or by running it.
- Every line number here was read on 2026-11-13; where the code has moved, the code wins.

## §1 The problem

**1. Creating and editing use two sets of names for the same stored fields.**

| Stored field                                                    | Creating (`from_metric`)                     | Editing (the figure patch)  |
| --------------------------------------------------------------- | -------------------------------------------- | --------------------------- |
| `caption`                                                       | `chartTitle`                                 | `caption`                   |
| `filterBy`                                                      | `filters`, only dimensions the preset allows | `filterBy`, any dimension   |
| `selectedReplicantValue`                                        | `selectedReplicant`                          | `selectedReplicantValue`    |
| `periodFilter`                                                  | `startDate` and `endDate`                    | `periodFilter { min, max }` |
| disaggregations and their slots, roll-up, sub-caption, footnote | cannot be stated                             | can be stated               |
| chart type                                                      | cannot be stated                             | the editor's tool alone     |

- Each side has its own code and its own checks: [build_config_from_preset.ts:64-104](client/src/components/products/copilot/slide_ai/build_config_from_preset.ts#L64-L104) for creating, `applyFigureConfigPatch` and the pipeline for editing.
- The schemas strip keys they do not know ([ai_input.ts:84](lib/types/ai_input.ts#L84)). A create call that uses the edit name `selectedReplicantValue` loses it, and the preset's default replicant draws under the title the model wrote.
- `client/public/info/iceh.md` and `iceh-equity-profile.md` teach the model the create names.

**2. Creating from a preset alone cannot build the figures users need.**

- 37 metrics, 50 presets. 9 visible metrics have none, so the copilot cannot draw them. Presets cover 40 of the 163 metric and type pairs the insert wizard's Custom path offers.
- In the deck "Round 1 report" (sierraleone, 30 figures, read 2026-11-13), the create input alone could state 1 of the 30. 27 needed a second call, and 2 (charts on a metric whose one preset is a table) needed a person.
- 12 of the 30 carry style a person set. The copilot can neither see nor set `config.s` ([ai_input.ts:136](lib/types/ai_input.ts#L136)), and it told the user that cell shading is not a setting.

**3. A preset is what makes a figure right today, and the metric's defaults do not.**

- All 50 presets differ from `getStartingConfigForPresentationObject` ([presentation_objects.ts:515](lib/types/presentation_objects.ts#L515)) on a field the renderer reads.
- The defaults carry no period window ([presentation_objects.ts:530](lib/types/presentation_objects.ts#L530)) and no text ([presentation_objects.ts:544](lib/types/presentation_objects.ts#L544)). Of the 30 presets that are not timeseries, 7 put time on an axis and 23 carry a window.
- The default map puts no admin level on the map's area for 20 of 31 metrics.
- 22 presets carry shading thresholds, 14 a special chart style, 23 a decimal place the default lacks.
- Text that guards meaning lives in presets alone: the m006 footnote that coverage from administrative data is not an official estimate.
- Explore already refuses bare defaults: it derives the data settings itself and takes the style from the metric's preset of the same type ([explore_query.ts:689](lib/explore_query.ts#L689)).

**4. Nothing checks a whole figure.**

- Zod checks the shape of the settings. It cannot see the metric or the data, and PROTOCOL_APP_AI_TOOLS.md records that its runtime checks are permanent for that reason.
- `validateFigureConfigEdit` checks only what a patch touches, by contract ([validate_figure_config_edit.ts:54](client/src/generate_visualization/validate_figure_config_edit.ts#L54)). The create path runs neither it nor the slot check after the fetch.

**5. Misleading figures that can be reached today.**

- A special chart style is active on its flag and the figure type alone ([special_chart_checks.ts:94-119](client/src/generate_visualization/special_chart_checks.ts#L94-L119)). After a layout change it draws two regions as "Observed" and "Expected" with a band labelled as a credible interval.
- Time can be pooled with nothing on the figure saying so: a dimension outside `disaggregateBy` is aggregated by the metric's value function ([get_fetch_config_from_po.ts:41-52](lib/get_fetch_config_from_po.ts#L41-L52)), and a required time dimension is skipped on a map and a pie.
- The model's own read-back differs from the figure: it adds every required dimension back ([format_metric_data_for_ai.ts:89](lib/ai_tools/format_metric_data_for_ai.ts#L89)), so for a map that pools years the model reads per-year rows.
- A map takes the last of two rows for one area ([get_map_data.ts:72](panther/_010_maps/get_map_data.ts#L72)), and a map with no dimension on its area falls back to admin area 2 ([get_data_config_for_map.ts:32](client/src/generate_visualization/get_data_config_for_map.ts#L32)).
- A pie's slices are shares of their own sum unless its completion mode is set ([get_data_config_from_po.ts:612](client/src/generate_visualization/get_data_config_from_po.ts#L612)), so a pie of percentages shows shares of a sum of percentages.

**6. A figure that is right today can break on new data.** 17 of the deck's 30 figures put `time_point` and another dimension on one slot. They draw because the data holds one survey round. With a second round the app's own slot check fails for all 17 (run 2026-11-13 over the stored configs), and the table refuses to draw ([get_table_data.ts:394](panther/_010_table/get_table_data.ts#L394)).

**7. The editor's settings per type are few.** Its panels set about 5 style fields for a table, 7 for a chart, 7 for a map, 10 for a pie and 18 for a timeseries, with about 11 shared, the shading and the value order.

**Reported by the adversarial review and not yet reproduced.** Step 1 reproduces each before it relies on it: a map with more than one value throws a raw error; a stated time dimension is accepted on a timeseries or a map; the required-time rule of the validator disagrees with the modules build; a caption holding the word REPLICANT prints it literally once the replicant is gone; a `filterBy` replaces a preset's own filter (the m009 stratifier); a type change keeps the preset's period window; the newer disruptions style is in no type's style resets; the metric listing says required disaggregations are added for the model.

## §2 The design under test

Nothing in this section is ruled. It is what step 1 tests.

- **The copilot states a figure in full**, in the settings the editor offers for that figure's type. Nothing is hidden from it and nothing comes from a preset it cannot see.
- **One statement shape** serves creating a figure and the three tools that change one. It is one shape per figure type, so a setting that does not apply to a type cannot be written.
- **Presets are a cookbook.** The copilot reads a preset in that same shape and restates it.
- **Three layers check a figure.** The shape, in zod. The whole-figure rules, over settings and metric, on every create and every edit. The data and render checks the pipeline already runs.
- **The checks are proven on two sets.** Every figure of the must-pass set is accepted, and every figure of the must-refuse set is refused.

## §3 Rulings

1. **Scope.** How the copilot creates, edits and reads a figure, in a deck, a draft slide, a report and the figure editor, and what checks a figure before it is stored. Ruled.
2. **Whole-figure checks are required, whatever shape a statement takes.** Ruled.
3. **They are proven on a must-pass set and a must-refuse set**, both kept as tests. _(proposed)_
4. **The design of §2 is the one step 1 tests.** It is not a ruling of how the copilot will state a figure. _(proposed)_
5. **This plan's code runs last**, after PLAN_COPILOT_TOOL_LIMIT.md and PLAN_02_COPILOT_SURFACE_GAPS.md are gone: the three share the tool files, and neither of the others changes a figure. Step 1 runs at any time. _(proposed)_
6. **Nothing ships in this plan.** The app's next release carries it.

## §4 Steps

### Step 1: test the design (not code)

**Surface.** This file.

**Deliverable.**

- A prototype outside the repo: the statement schema per figure type, its conversion to and from the stored settings, and the whole-figure rules, each a pure function.
- The must-pass set run through it: every preset of every module (under `FASTR_MODULES_LOCAL_DIR`), every figure `deriveViewConfig` gives for every Explore binding, and the figures of at least one production deck. Each must be statable, must convert back to its stored settings field for field, and must pass every rule. Every failure is named as one of three: a gap in the schema, a wrong rule, or a stored figure that is itself wrong.
- The must-refuse set run through it: every misleading figure of §1, and each reported case once reproduced. Each must be refused by a rule whose message names the fix.
- Editor parity: per figure type, the settings in the schema set against the settings the editor's panels set, with every difference listed.
- Size: the statement of a typical table, chart, timeseries and map, and the cookbook entry of a preset.
- Two independent reviews of the result: one told to find a misleading figure the rules accept, one designing the statement shape from the problem alone.
- An answer with evidence, or a question for Tim, on each of these:
  - Is every setting stated at creation, or only the ones that change what the numbers mean?
  - Does a preset's id appear in a statement at all?
  - Where does the list of settings per type live, so that the editor and the copilot cannot drift?
  - Does `get_metric_data` take the same names for the same things?
  - Does `allowedFilters` stay as anything?
  - Where does text that guards meaning live, so that it does not depend on a preset?
  - Does panther's map refuse two rows for one area, as its table does?
  - What does an edit do to a stored figure that fails a rule?
  - What does a figure's result tell the model: the period shown, the dimensions pooled?
- The findings go to Tim in the chat. On his rulings, §2, §3 and §4 of this file are rewritten: the rulings as heard, and every code step with its Surface, Deliverable, Gates and end.

**Not in this step.** Any change to this repo's code, to the modules repo or to panther.

**Gates.** `git status --short` shows this file and nothing else.

**Ends with.** One commit rewriting this plan, after Tim's rulings.

### Steps 2 onward

Written by step 1.

## §5 Out of scope

- **Image blocks, a slide's own settings, the deck's settings, and a rendered image of a slide**: PLAN_02_COPILOT_SURFACE_GAPS.md.
- **New figure types** (a gauge or donut), and significance testing in the HFA module.
- **The 17 figures of §1 point 6 in the production deck.** They are a deck to repair, not code.

## §6 Log
