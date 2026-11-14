# PLAN: Copilot fixes from the Sierra Leone test run

The 2026-11-13 run of [TESTING_SCRIPT_FOR_AI_COPILOT.md](TESTING_SCRIPT_FOR_AI_COPILOT.md) on Sierra Leone found copilot defects in what tools return, what views tell the model, and which changes the model hears as the user's. It also found test-script expectations that the code has correctly moved past. This plan fixes both.

**Next step: Do 2.**

Branch: `main`. Repos: this one. Read first: [CLAUDE.md](CLAUDE.md), [SYSTEMS.md](SYSTEMS.md), [SYSTEM_13_ai_assistant.md](SYSTEM_13_ai_assistant.md). Start when: any time. The `code_execution` loading label is panther's PLAN_23_CODE_EXECUTION_LABEL.md, independent of this plan.

## §0 How to work this plan

The instruction is "Do the next step of PLAN_05_COPILOT_TEST_FIXES.md." Branch, floor, tests, conditional gates, reading order and the review cadence are [PROTOCOL_APP_PLANS.md](PROTOCOL_APP_PLANS.md) and [panther/protocols/PROTOCOL_ALL_PLANS.md](panther/protocols/PROTOCOL_ALL_PLANS.md). The log is §6. The last step is 6.

Vocabulary:

- **Long format**: a CSV with one row per value, every dimension a named column, the value last, as `formatLongCSV` in [format_metric_data_for_ai.ts](lib/ai_tools/format_metric_data_for_ai.ts) writes it.
- **The keep sentence**: the sentence that tells the model how the user keeps or discards a figure-editor draft.
- **An echo**: a digest line under "User actions since last message" caused by a write the copilot made.

## §1 The problem

1. **Wide CSV.** `pivotAndFormatAsCSV` ([format_metric_data_for_ai.ts:598](lib/ai_tools/format_metric_data_for_ai.ts#L598)) pivots `indicator_common_id` into columns, or the time dimension when there is no indicator dimension. `pivotToWide` (`:655`) writes `""` for each missing cell. On Sierra Leone, 56 indicators gave 57 columns. The model misread 4 of 12 values in one row by counting commas, and corrected them only when challenged. `pivotToWide` also writes row dimension labels unquoted, so a label containing a comma shifts every later column. The long path, `formatLongCSV` (`:739`), sends every column, dimensions included, through `formatIndicatorValueForCsv` (`:584`), which `parseFloat`s and `toFixed`s: once time dimensions reach it, `period_id` 202301 prints as `202301.000` (`2023010000.00` under `rate_per_10k`), and a label starting with a digit prints as that number. Its quoting never doubles an inner `"`.
2. **Module counts.** [format_modules_list_for_ai.ts:15-18](client/src/components/instance/copilot/tools/format_modules_list_for_ai.ts#L15-L18) counts every metric. `get_available_metrics` lists only `status === "ready"` ([format_metrics_list_for_ai.ts:43](lib/ai_tools/format_metrics_list_for_ai.ts#L43)). The run saw m011 6 vs 5, m005 6 vs 4, m006 5 vs 3.
3. **Data page state.** `data_page` ([ai_views.ts:683](client/src/components/instance/copilot/ai_views.ts#L683)) has no context and no state. The digest merges every move between two messages into one line, so the switchboard's readiness never reaches the model on a data page, although the switchboard stays mounted under it ([data.tsx](client/src/components/data/data.tsx)).
4. **Package module by id.** The package state line prints `open module: ${openModuleId}` ([build_system_prompt.ts:427](client/src/components/instance/copilot/build_system_prompt.ts#L427)). The model could not name the module the user sees.
5. **Apply/Cancel wording.** `update_figure_editor`'s description ([figure_editor.ts:80](client/src/components/products/copilot/ai_tools/tools/figure_editor.ts#L80)) and result (`:200`) always say "the user keeps it with Apply or discards it with Cancel". The slide and report figure instructions in `build_system_prompt.ts` do the same. Under live co-editing the editor has only a back chevron, which commits. A view-only editor (the package viewer, or a saved visualization the user cannot edit) has only a back chevron and keeps nothing ([figure_editor.tsx:929-965](client/src/components/_shared/figure_editor/figure_editor.tsx#L929-L965)). The buttons depend on view-only and live, not on the host: a saved visualization is live only in its "live" mode, and offline it shows Apply and Cancel and saves over REST ([visualization.tsx:255](client/src/components/products/visualization/visualization.tsx#L255), `:379-410`, `:583-586`). The visualization instruction ([build_system_prompt.ts:206](client/src/components/instance/copilot/build_system_prompt.ts#L206)) says "There is no Apply" in every state.
6. **Settings wording.** `getDeckSettingsInstructions` ([build_system_prompt.ts:107](client/src/components/instance/copilot/build_system_prompt.ts#L107)) says "close Settings with its back button". The screen has only Save and Cancel ([settings.tsx](client/src/components/products/slide_deck/settings.tsx)).
7. **Echoes.**
   - Opening a slide whose `crdt_state` is out of date makes the room re-seed. The next checkpoint ([collab.ts:370-387](server/routes/instance/collab.ts#L370-L387)) always bumps `last_updated`, touches the product and sends slide and product change notices, even when the config is unchanged. That arrives long after `markAIEdit`'s 30 s window, so the model reads "Edited slide X" for slides it created a turn earlier.
   - `update_figure_editor` under live co-editing streams into the host document and never calls `markAIEdit`, so the host's checkpoint arrives as "Report ... changed".
8. **`replace_figure` title.** `AiFigureFromMetricSchema.chartTitle` is required ([ai_input.ts:124](lib/types/ai_input.ts#L124)), so `replace_figure` cannot keep the replaced figure's title. The run's copilot overwrote it and had to restore it.
9. **Figure results hide what the figure shows.**
   - `formatFigureConfigForAI` prints the range shown only inside the non-custom `periodFilter` branch ([format_figure_config_for_ai.ts:133-137](client/src/components/products/copilot/_shared/format_figure_config_for_ai.ts#L133-L137)). The model titled a chart "2015–2026" when its data start in 2019. `get_figure_editor` and `update_figure_editor` pass no range at all ([figure_editor.ts:65-70](client/src/components/products/copilot/ai_tools/tools/figure_editor.ts#L65-L70), `:190-195`), although `update_figure_editor` holds `newBundle.dateRange`.
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

- `get_metric_data` and every path through `formatItemsAsMarkdown` write long format, with dimension cells as written and only value cells formatted.
- Every count the copilot gives of a module's metrics counts ready metrics.
- A data page's view state is the switchboard's readiness line.
- The package state names the open module by label and id.
- The keep sentence comes from one helper, keyed by whether the editor is view-only and whether live co-editing is on. The tool result and the view instructions, the saved visualization's included, all call it, and the tool description does not carry it.
- The deck Settings instructions name Save and Cancel.
- A slide checkpoint whose config equals the stored config writes only the CRDT state: no stamp, no touch and no notice. The deck restore reports the newest stamp it wrote. A live `update_figure_editor` write marks its host keys as AI edits.
- `replace_figure` keeps the replaced figure's chart title unless the call gives one.
- Every figure write result says what the figure shows: the date range whenever it is known, the figure editor's included, and for accepted report inserts and replacements the `describeNewFigureData` block.
- The test script expects what the code does in each case of §1.11.

## §3 Rulings

1. `get_metric_data` always writes long format. `pivotAndFormatAsCSV` and `pivotToWide` are deleted. `formatLongCSV` writes dimension cells as they are through one `csvCell` helper, which quotes a cell containing `,`, `"` or a newline and doubles each inner `"`. The non-numeric branch of `formatIndicatorValueForCsv` uses the same helper. Only value cells go through `formatValueWithN`. _(proposed)_
2. `get_available_modules` counts only ready metrics. _(proposed)_
3. `data_page` takes the switchboard's `getSections` as its context, and its state is `formatDataState(context.getSections())`, the switchboard's own formatter. _(proposed)_
4. The package context passes the open module's summary, and the state line prints `labelWithId(label, id)`. `openModuleId` becomes `openModule(): InstalledModuleSummary | undefined`, which the context's `getOpenModule` and `FamilyTabs` (`selectedModuleId={openModule()?.id}`) both read. _(proposed)_
5. The keep sentence is `figureEditorKeepLine({ viewOnly, live })`, with these cases, in this order:
   - view-only: closing keeps nothing;
   - live: already in the document, the back arrow closes, there is no Cancel, and the user can undo;
   - otherwise: Apply or Cancel.

   The host supplies only the noun. `FigureEditorContext` gains `isViewOnly: () => boolean` and `isLive: () => boolean`. _(proposed)_
6. The Settings instruction reads "tell the user to leave Settings with Save (keeps the settings changes) or Cancel (discards them) to return to the deck". _(proposed)_
7. `saveSlideCheckpoint` reads the stored config in its transaction and compares it, as canonical JSON, with the slide it is given.
   - When they are equal, it writes `crdt_state` with `crdt_state_last_updated` set to `crdtTrusted ? <existing last_updated> : null`. It leaves `last_updated` and the product stamp alone, and returns `{ lastUpdated: <existing last_updated>, contentChanged: false }`.
   - `collab.ts` sends its notices only when `contentChanged` is true.
   - The deck restore keeps the newest stamp it sees, starting from the structure write's: `if (x.lastUpdated > lastUpdated) lastUpdated = x.lastUpdated`. An unchanged surviving slide then cannot make it broadcast an old stamp.
   - `applyToLiveRoom`'s caller gets the row's `last_updated` after the save, unchanged when the doc already matched.

   _(proposed)_
8. After `applyDraftConfig`, a live `update_figure_editor` calls `markAIEdit` for `slide:<slideId>` and `product:<deckId>` (slide figure), or `product:<reportId>` (report figure). _(proposed)_
9. `replace_figure` takes `chartTitle` as optional and defaults it to the replaced block's `bundle.config.t.caption`. When the replaced block has no bundle and the call gives no `chartTitle`, it fails with an `AIToolFailure` asking for one. Its description says the chart title and the embed caption are each kept unless given. _(proposed)_
10. `formatFigureConfigForAI` prints `Data shown: <min> to <max>` whenever the shown range is known, outside the `periodFilter` branch, and drops the nested "Data currently shown" line. For a non-custom filter it appends "(frozen at the figure's last refresh; re-anchors on the next edit)". The ready case of `FigureEditorPreview` gains `dateRange: PeriodBounds | undefined`. `get_figure_editor` passes it when the preview is ready, and `update_figure_editor` passes `newBundle.dateRange`. `insert_figure` and `replace_figure` call `describeNewFigureData` for the new figure inside `commit()`, after `markAIEdit`, and append it to their accepted result. _(proposed)_
11. Report page counts (G2) are out of scope: see §5.

## §4 Steps

### Step 1: Metric data in long format, module counts

- **Surface:**
  - [format_metric_data_for_ai.ts](lib/ai_tools/format_metric_data_for_ai.ts)
  - [format_modules_list_for_ai.ts](client/src/components/instance/copilot/tools/format_modules_list_for_ai.ts)
  - new `server/tests/format_metric_data_for_ai_test.ts`
  - [SYSTEM_13_ai_assistant.md](SYSTEM_13_ai_assistant.md)
  - [utils.ts](lib/utils.ts), [population.ts](server/routes/instance/population.ts), [prepare_inputs.ts](server/worker_routines/generate_run/prepare_inputs.ts) (added by Tim at step 1's review: one exported `csvCell`)
- **Deliverable:**
  - Rulings 1 and 2.
  - The comments that describe pivoting are rewritten, and so is the `formatValueWithN` comment on unquoted joins.
  - The test proves these things on a two-indicator, three-period input with one missing value:
    - every row names its indicator and period;
    - no empty value cell is written;
    - `period_id` 202301 and `year` 2023 are written as they are;
    - a dimension label containing a comma is quoted, and one containing `"` is escaped.
  - SYSTEM_13 describes the long shape, and its manifest lists the new test.
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
  - `setFigureEditorView` sets `isViewOnly` from `p.viewOnly` and `isLive` from `isCollabLive`.
  - The `editing_visualization` instruction (`build_system_prompt.ts:206`) calls the helper, and SYSTEM_13's "edits stream and save with no Apply" is rewritten to match.
  - The `slide_list.tsx:586` toast uses `plural` in en, fr and pt.
- **Not in this step:** the `markAIEdit` call (step 4).
- **Gates:** none beyond the floor.
- **Ends with:** one commit.

### Step 4: The copilot's own writes are not reported as the user's

- **Surface:**
  - [slides.ts](server/db/products/slides.ts) (`saveSlideCheckpoint`)
  - [collab.ts](server/routes/instance/collab.ts)
  - [doc_rooms.ts](server/collab/doc_rooms.ts)
  - [slide_decks.ts](server/routes/products/slide_decks.ts)
  - [figure_editor.ts](client/src/components/products/copilot/ai_tools/tools/figure_editor.ts)
  - new `server/tests/slide_checkpoint_unchanged_test.ts`
  - [SYSTEM_03_realtime_cache.md](SYSTEM_03_realtime_cache.md)
  - [SYSTEM_13_ai_assistant.md](SYSTEM_13_ai_assistant.md)
  - [SYSTEM_16_collaboration.md](SYSTEM_16_collaboration.md)
- **Deliverable:**
  - Rulings 7 and 8.
  - The test proves:
    - a second save of the same slide leaves `last_updated` and the product stamp unchanged and returns `contentChanged: false`, while `crdt_state` is current, so the next open does not re-seed;
    - an untrusted unchanged save leaves `crdt_state_last_updated` null;
    - a slide config seeded through the slide adapter, materialized and parsed as `collab.ts`'s save does, saves with `contentChanged: false`;
    - a deck restore whose surviving slide is unchanged broadcasts a stamp no older than the structure write's.
  - The `saveSlideCheckpoint` comment states the unchanged-config path. The `applyToLiveRoom` comment says the caller gets the row's `last_updated` after the save, unchanged when the doc already matched.
  - SYSTEM_16 states the unchanged-checkpoint path (no stamp, no product touch, no notices) and the restore's newest-stamp rule, and its manifest lists the new test. SYSTEM_03's "notify on every checkpoint" is rewritten to match.
- **Not in this step:** the REST slide writes that leave `crdt_state` stale.
- **Gates:** `deno task test:files server/tests/slide_checkpoint_unchanged_test.ts`.
- **Ends with:** one commit.

### Step 5: Figure write results

- **Surface:**
  - [format_figure_config_for_ai.ts](client/src/components/products/copilot/_shared/format_figure_config_for_ai.ts)
  - [report_editor.ts](client/src/components/products/copilot/ai_tools/tools/report_editor.ts)
  - [figure_editor.ts](client/src/components/products/copilot/ai_tools/tools/figure_editor.ts)
  - [figure_editor.tsx](client/src/components/_shared/figure_editor/figure_editor.tsx)
  - [ai_views.ts](client/src/components/instance/copilot/ai_views.ts)
  - [SYSTEM_13_ai_assistant.md](SYSTEM_13_ai_assistant.md)
- **Deliverable:**
  - Rulings 9 and 10.
  - The preview memo in `figure_editor.tsx` sets the ready preview's `dateRange` from the `bundle.dateRange` it builds.
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
  - The script steps that steps 1 to 5 change are updated to match:
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

- **Report page counts (G2).** `get_report_pages` runs Paged.js without the editor's page breaks ([report_page_map.ts:123-137](client/src/components/products/copilot/ai_tools/tools/report_page_map.ts#L123-L137)), so it can count differently from the preview. The fix needs a `layout` dependency on `ReportPaginatorDeps` in report-forge, which is Nick's repo. The app side follows his sync.
- The `code_execution` loading label: panther's PLAN_23_CODE_EXECUTION_LABEL.md.
- The cache shape of the tail message, the image release, and the 100-request debug log: correct as built.
- Model behaviour with no code cause: malformed `ask_user_questions` input, the "sandbox tools" claim, and parallel calls when asked for sequential ones.

## §6 Log

- Step 1: `csvCell` lives in `lib/utils.ts`, not in the formatter, because the population template route and the run's input preparation held identical copies; Tim widened step 1's Surface for it. SYSTEM_00's `lib/utils.ts` sentence, already short of the file's exports, now lists them with `csvCell`.
