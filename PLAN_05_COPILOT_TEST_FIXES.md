# PLAN: Copilot fixes from the Sierra Leone test run

The 2026-11-13 run of [TESTING_SCRIPT_FOR_AI_COPILOT.md](TESTING_SCRIPT_FOR_AI_COPILOT.md) on Sierra Leone found copilot defects in what tools return, what views tell the model, and which changes the model hears as the user's. It also found test-script expectations that the code has correctly moved past. This plan fixes both.

**Next step: Do 1.**

Branch: `main`. Repos: this one. Read first: [CLAUDE.md](CLAUDE.md), [SYSTEMS.md](SYSTEMS.md), [SYSTEM_13_ai_assistant.md](SYSTEM_13_ai_assistant.md). Start when: any time. The `code_execution` loading label is panther's PLAN_23_CODE_EXECUTION_LABEL.md, independent of this plan.

## §0 How to work this plan

The instruction is "Do the next step of PLAN_05_COPILOT_TEST_FIXES.md." Branch, floor, tests, conditional gates, reading order and the review cadence are [PROTOCOL_APP_PLANS.md](PROTOCOL_APP_PLANS.md) and [panther/protocols/PROTOCOL_ALL_PLANS.md](panther/protocols/PROTOCOL_ALL_PLANS.md). The log is §6. The last step is 6.

Vocabulary:

- **Long format**: a CSV with one row per value, every dimension a named column, the value last, as `formatLongCSV` in [format_metric_data_for_ai.ts](lib/ai_tools/format_metric_data_for_ai.ts) writes it.
- **The keep sentence**: the sentence that tells the model how the user keeps or discards a figure-editor draft.
- **An echo**: a digest line under "User actions since last message" caused by a write the copilot made.

## §1 The problem

1. **Wide CSV.** `pivotAndFormatAsCSV` ([format_metric_data_for_ai.ts:598](lib/ai_tools/format_metric_data_for_ai.ts#L598)) pivots `indicator_common_id` into columns, or the time dimension when there is no indicator dimension. `pivotToWide` (`:655`) writes `""` for each missing cell. On Sierra Leone, 56 indicators gave 57 columns. The model misread 4 of 12 values in one row by counting commas, and corrected them only when challenged. `pivotToWide` also writes row dimension labels unquoted, so a label containing a comma shifts every later column.
2. **Module counts.** [format_modules_list_for_ai.ts:15-18](client/src/components/instance/copilot/tools/format_modules_list_for_ai.ts#L15-L18) counts every metric. `get_available_metrics` lists only `status === "ready"` ([format_metrics_list_for_ai.ts:43](lib/ai_tools/format_metrics_list_for_ai.ts#L43)). The run saw m011 6 vs 5, m005 6 vs 4, m006 5 vs 3.
3. **Data page state.** `data_page` ([ai_views.ts:683](client/src/components/instance/copilot/ai_views.ts#L683)) has no context and no state. The digest merges every move between two messages into one line, so the switchboard's readiness never reaches the model on a data page, although the switchboard stays mounted under it ([data.tsx](client/src/components/data/data.tsx)).
4. **Package module by id.** The package state line prints `open module: ${openModuleId}` ([build_system_prompt.ts:427](client/src/components/instance/copilot/build_system_prompt.ts#L427)). The model could not name the module the user sees.
5. **Apply/Cancel wording.** `update_figure_editor`'s description ([figure_editor.ts:80](client/src/components/products/copilot/ai_tools/tools/figure_editor.ts#L80)) and result (`:200`) always say "the user keeps it with Apply or discards it with Cancel". The slide and report figure instructions in `build_system_prompt.ts` do the same. Under live co-editing the editor has only a back chevron, which commits. The package viewer (`viewOnly`) has only a back chevron and keeps nothing. A saved visualization saves as it goes ([figure_editor.tsx](client/src/components/_shared/figure_editor/figure_editor.tsx)).
6. **Settings wording.** `getDeckSettingsInstructions` ([build_system_prompt.ts:107](client/src/components/instance/copilot/build_system_prompt.ts#L107)) says "close Settings with its back button". The screen has only Save and Cancel ([settings.tsx](client/src/components/products/slide_deck/settings.tsx)).
7. **Echoes.**
   - Opening a slide whose `crdt_state` is out of date makes the room re-seed. The next checkpoint ([collab.ts:370-387](server/routes/instance/collab.ts#L370-L387)) always bumps `last_updated`, touches the product and sends slide and product change notices, even when the config is unchanged. That arrives long after `markAIEdit`'s 30 s window, so the model reads "Edited slide X" for slides it created a turn earlier.
   - `update_figure_editor` under live co-editing streams into the host document and never calls `markAIEdit`, so the host's checkpoint arrives as "Report ... changed".
8. **`replace_figure` title.** `AiFigureFromMetricSchema.chartTitle` is required ([ai_input.ts:124](lib/types/ai_input.ts#L124)), so `replace_figure` cannot keep the replaced figure's title. The run's copilot overwrote it and had to restore it.
9. **Figure results hide what the figure shows.**
   - `formatFigureConfigForAI` prints the range shown only inside the non-custom `periodFilter` branch ([format_figure_config_for_ai.ts:133-137](client/src/components/products/copilot/_shared/format_figure_config_for_ai.ts#L133-L137)). The model titled a chart "2015–2026" when its data start in 2019.
   - `insert_figure` and `replace_figure` results say only "ACCEPTED ... id" ([report_editor.ts:1067](client/src/components/products/copilot/ai_tools/tools/report_editor.ts#L1067), `:1179`). The model titled a chart of absolute totals "percent change".
10. **A leftover "(s)".** [slide_list.tsx:586](client/src/components/products/slide_deck/slide_list.tsx#L586) still says `Copied ${n} slide(s).`.
11. **Test script.** These expectations disagree with code that is correct:
    - E1: the tools array changes on a Haiku 4.5 switch (`web_search_20260209` becomes `_20250305`) and the change strips thinking blocks.
    - H8: a string and a single text block are counted as a history change. The image release after a turn that carried images is too.
    - F11: `update_figure` reports only the fields supplied.
    - F20: `get_slide_images` ends with one fit line per content slide.
    - G1: the instructions ask up to four questions, one card each.
    - B2: the refusal says "view" or "views", not "view(s)".
    - F13: the modal title is "Delete 1 slide", not "Delete 1 slide(s)".
    - Product creation opens a theme picker that adds a cover slide, which the script does not mention.
    - R4 confirms Sonnet 5 instead of restoring the starting model.
    - R1 leaves the "Copilot tests" folder.

## §2 The model

- `get_metric_data` and every path through `formatItemsAsMarkdown` write long format.
- Every count the copilot gives of a module's metrics counts ready metrics.
- A data page's view state is the switchboard's readiness line.
- The package state names the open module by label and id.
- The keep sentence comes from one helper, keyed by the editor's host and whether live co-editing is on. The tool result and the view instructions both call it, and the tool description does not carry it.
- The deck Settings instructions name Save and Cancel.
- A slide checkpoint whose config equals the stored config writes only the CRDT state: no stamp, no touch and no notice. A live `update_figure_editor` write marks its host keys as AI edits.
- `replace_figure` keeps the replaced figure's chart title unless the call gives one.
- Every figure write result says what the figure shows: the date range whenever it is known, and for report inserts and replacements the `describeNewFigureData` block.
- The test script expects what the code does in each case of §1.11.

## §3 Rulings

1. `get_metric_data` always writes long format. `pivotAndFormatAsCSV` and `pivotToWide` are deleted. _(proposed)_
2. `get_available_modules` counts only ready metrics. _(proposed)_
3. `data_page` takes the switchboard's `getSections` as its context, and its state is `formatDataState(context.getSections())`, the switchboard's own formatter. _(proposed)_
4. The package context passes the open module's summary, and the state line prints `labelWithId(label, id)`. _(proposed)_
5. The keep sentence is `figureEditorKeepLine(host, live)`, with these four cases:
   - package viewer: closing keeps nothing;
   - saved visualization: every change is saved as made, with no Apply;
   - live: already in the document, the back arrow closes, there is no Cancel, and the user can undo;
   - otherwise: Apply or Cancel.

   `FigureEditorContext` gains `isLive: () => boolean`. _(proposed)_
6. The Settings instruction reads "tell the user to leave Settings with Save (keeps the settings changes) or Cancel (discards them) to return to the deck". _(proposed)_
7. `saveSlideCheckpoint` reads the stored config in its transaction and compares it, as canonical JSON, with the slide it is given.
   - When they are equal, it writes `crdt_state` with `crdt_state_last_updated` set to the row's existing `last_updated`. It leaves `last_updated` and the product stamp alone, and returns `contentChanged: false`.
   - `collab.ts` sends its notices only when `contentChanged` is true.

   _(proposed)_
8. After `applyDraftConfig`, a live `update_figure_editor` calls `markAIEdit` for `slide:<slideId>` and `product:<deckId>` (slide figure), or `product:<reportId>` (report figure). _(proposed)_
9. `replace_figure` takes `chartTitle` as optional and defaults it to the replaced figure's `config.t.caption`. Its description says the chart title and the embed caption are each kept unless given. _(proposed)_
10. `formatFigureConfigForAI` prints `Data shown: <min> to <max>` whenever the shown range is known, outside the `periodFilter` branch, and drops the nested "Data currently shown" line. `insert_figure` and `replace_figure` append `describeNewFigureData` for the new figure to their accepted result. _(proposed)_
11. Report page counts (G5) are out of scope: see §5.

## §4 Steps

### Step 1: Metric data in long format, module counts

- **Surface:**
  - [format_metric_data_for_ai.ts](lib/ai_tools/format_metric_data_for_ai.ts)
  - [format_modules_list_for_ai.ts](client/src/components/instance/copilot/tools/format_modules_list_for_ai.ts)
  - new `server/tests/format_metric_data_for_ai_test.ts`
  - the SYSTEM file whose manifest claims `server/tests/`
  - [SYSTEM_13_ai_assistant.md](SYSTEM_13_ai_assistant.md)
- **Deliverable:**
  - Rulings 1 and 2.
  - The comments that describe pivoting are rewritten.
  - The test proves three things on a two-indicator, three-period input with one missing value:
    - every row names its indicator and period;
    - no empty value cell is written;
    - a dimension label containing a comma is quoted.
  - SYSTEM_13 describes the long shape.
- **Not in this step:** what the result's Source or Period coverage lines say.
- **Gates:** `deno task test:files server/tests/format_metric_data_for_ai_test.ts`.
- **Ends with:** one commit.

### Step 2: Data page and package view state

- **Surface:**
  - [ai_views.ts](client/src/components/instance/copilot/ai_views.ts)
  - [data.tsx](client/src/components/data/data.tsx)
  - [package_page.tsx](client/src/components/results_packages/package_page.tsx)
  - [build_system_prompt.ts](client/src/components/instance/copilot/build_system_prompt.ts)
  - [SYSTEM_13_ai_assistant.md](SYSTEM_13_ai_assistant.md)
- **Deliverable:**
  - Rulings 3 and 4.
  - The restore path for `data_page` (`ai_views.ts:866-867`) passes the context.
  - `FamilyTabs` reads the selected id from the same open-module accessor.
- **Not in this step:** the digest's merging of moves.
- **Gates:** none beyond the floor.
- **Ends with:** one commit.

### Step 3: What the copilot tells the user to click

- **Surface:**
  - [figure_editor.ts](client/src/components/products/copilot/ai_tools/tools/figure_editor.ts)
  - [figure_editor.tsx](client/src/components/_shared/figure_editor/figure_editor.tsx)
  - [ai_views.ts](client/src/components/instance/copilot/ai_views.ts)
  - [build_system_prompt.ts](client/src/components/instance/copilot/build_system_prompt.ts)
  - [slide_list.tsx](client/src/components/products/slide_deck/slide_list.tsx)
  - [SYSTEM_13_ai_assistant.md](SYSTEM_13_ai_assistant.md)
- **Deliverable:**
  - Rulings 5 and 6.
  - `setFigureEditorView` sets `isLive` from the editor's live state.
  - The `slide_list.tsx:586` toast uses `plural` in en, fr and pt.
- **Not in this step:** the `markAIEdit` call (step 4).
- **Gates:** none beyond the floor.
- **Ends with:** one commit.

### Step 4: The copilot's own writes are not reported as the user's

- **Surface:**
  - [slides.ts](server/db/products/slides.ts) (`saveSlideCheckpoint`)
  - [collab.ts](server/routes/instance/collab.ts)
  - [figure_editor.ts](client/src/components/products/copilot/ai_tools/tools/figure_editor.ts)
  - new `server/tests/slide_checkpoint_unchanged_test.ts`
  - the SYSTEM file whose manifest claims `server/tests/`
  - [SYSTEM_03_realtime_cache.md](SYSTEM_03_realtime_cache.md)
  - [SYSTEM_13_ai_assistant.md](SYSTEM_13_ai_assistant.md)
- **Deliverable:**
  - Rulings 7 and 8.
  - The test saves a checkpoint twice with the same slide. It proves the second save leaves `last_updated` and the product stamp unchanged and returns `contentChanged: false`, while `crdt_state` is current, so the next open does not re-seed.
  - The `saveSlideCheckpoint` comment states the unchanged-config path.
- **Not in this step:** the REST slide writes that leave `crdt_state` stale.
- **Gates:** `deno task test:files server/tests/slide_checkpoint_unchanged_test.ts`.
- **Ends with:** one commit.

### Step 5: Figure write results

- **Surface:**
  - [format_figure_config_for_ai.ts](client/src/components/products/copilot/_shared/format_figure_config_for_ai.ts)
  - [report_editor.ts](client/src/components/products/copilot/ai_tools/tools/report_editor.ts)
  - [SYSTEM_13_ai_assistant.md](SYSTEM_13_ai_assistant.md)
- **Deliverable:**
  - Rulings 9 and 10.
  - `describeNewFigureData` runs after `resolveFigureFromMetric` and before the `ctx.getBody()` read, so the proposal's base stays fresh.
- **Not in this step:** `lib/types/ai_input.ts`. The optional title is an `.extend` in `replace_figure`'s own schema.
- **Gates:** none beyond the floor.
- **Ends with:** one commit.

### Step 6: Test script expectations

- **Surface:** [TESTING_SCRIPT_FOR_AI_COPILOT.md](TESTING_SCRIPT_FOR_AI_COPILOT.md).
- **Deliverable:**
  - Every case in §1.11 is rewritten to what the code does:
    - **E1:** `toolsSame: false` on the Haiku switch. The only difference is the `web_search` entry's `type`, and the earlier thinking blocks are stripped.
    - **H8:** messages are compared after a plain string and a single text block are treated as equal. `messagesAppendOnly: false` is expected on the first request after a turn that carried images.
    - **F11:** the change report lists the fields supplied, each `applied` or `no change`.
    - **F20:** the result ends with the image list, then one fit line per content slide.
    - **G1:** up to four questions, one card each.
    - **B2 and F13:** the plural wording.
    - **F1 and the G setup:** a step for the theme picker that applies the Default theme. In F1, delete the placeholder cover slide.
    - **2.6** records the starting model and effort, and **R4** restores them.
    - **R1** deletes the "Copilot tests" folder.
  - The steps steps 1 to 5 change are updated to match:
    - D1: counts agree.
    - D2: long CSV.
    - C5: label and id.
    - C7: data page state.
    - F15, G9, H1: the keep sentence by mode.
    - F16: Save or Cancel.
    - F6, F8, G9: no echoes.
    - G6: title kept.
    - F3, G2: the shown range and the figure description.
- **Not in this step:** sections the run did not reach or did not fault.
- **Gates:** `deno fmt --check TESTING_SCRIPT_FOR_AI_COPILOT.md`.
- **Ends with:** one commit. The close of this step runs `deno task test` and deletes this file.

## §5 Out of scope

- **Report page counts (G5).** `get_report_pages` runs Paged.js without the editor's page breaks ([report_page_map.ts:123-137](client/src/components/products/copilot/ai_tools/tools/report_page_map.ts#L123-L137)), so it can count differently from the preview. The fix needs a `layout` dependency on `ReportPaginatorDeps` in report-forge, which is Nick's repo. The app side follows his sync.
- The `code_execution` loading label: panther's PLAN_23_CODE_EXECUTION_LABEL.md.
- The cache shape of the tail message, the image release, and the 100-request debug log: correct as built.
- Model behaviour with no code cause: malformed `ask_user_questions` input, the "sandbox tools" claim, and parallel calls when asked for sequential ones.

## §6 Log
