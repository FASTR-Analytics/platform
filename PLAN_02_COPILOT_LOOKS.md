# PLAN: The copilot's look tools

Status: IN PROGRESS. Step 1 synced the one-turn panther; step 2 built the encoder; step 3 added the report figure look. PLAN_02_COPILOT_SURFACE_GAPS.md, now closed and deleted, gave the copilot one look tool, `get_slide_images`, built before panther held an image for one turn and with its image size and encoding inside the slide's own render file. This plan makes the looks one set: three tools, each the image twin of a text read, sharing one encoder, each drawing what the user sees through the code that draws it for the user, with a test that fails when a look and its twin stop reading the same thing.

**Next step: Do 4.**

Branch: `main`. Repos: this one, and `timroberton-panther` as the source of step 1's sync. Read first: [CLAUDE.md](CLAUDE.md), [SYSTEMS.md](SYSTEMS.md), [SYSTEM_13_ai_assistant.md](SYSTEM_13_ai_assistant.md) "Tools, view gating, and approval" and Open items "Surface gaps", [PROTOCOL_APP_AI_TOOLS.md](PROTOCOL_APP_AI_TOOLS.md) "The round budget", [SYSTEM_10_figure_render_export.md](SYSTEM_10_figure_render_export.md) on figure export, [SYSTEM_12_documents_sharing.md](SYSTEM_12_documents_sharing.md) on the report's figure embeds, and the vendored [PROTOCOL_UI_AI_CHAT.md](panther/protocols/PROTOCOL_UI_AI_CHAT.md) rule 17. Start when: `test ! -e PLAN_02_COPILOT_SURFACE_GAPS.md && test ! -e /Users/timroberton/projects/panther/timroberton-panther/PLAN_23_AI_IMAGES_ONE_TURN.md && echo ok` prints `ok`, and this tree is clean.

## §0 How to work this plan

The instruction is "Do the next step of PLAN_02_COPILOT_LOOKS.md." Branch, floor, conditional gates, reading order and the review cadence are [PROTOCOL_APP_PLANS.md](PROTOCOL_APP_PLANS.md) and [panther/protocols/PROTOCOL_ALL_PLANS.md](panther/protocols/PROTOCOL_ALL_PLANS.md). The log is §6. The last step is 4; its close commit deletes this file. Nothing in this plan ships (ruling 10).

Vocabulary:

- **look**: a read tool whose result is images for the model.
- **twin**: the text read a look pairs with. A look takes its twin's ids, is admitted in its twin's views, has its twin's requirement and refuses what its twin refuses.
- **the encoder**: the one module that turns a drawn canvas into the image a look returns.
- **held for one turn**: panther's contract after its one-turn change. An image a tool returns rides the requests of the turn that took it, and at the turn's end becomes a line of text.

Rules peculiar to this plan:

- Every line number here was read on 2026-11-13 at `43552cb44`. Where the code has moved, the code wins.
- Tool descriptions, result text and the brief are text for the model: English, never `t3`.
- No gate asks a model anything.
- A look never builds its own picture. It calls the function that builds the picture for the user and hands the canvas to the encoder.

## §1 The problem

- **One look exists of three.** `get_slide_images` is built ([get_slide_images.ts](client/src/components/products/copilot/ai_tools/tools/get_slide_images.ts)). A report's figure and the figure open in the figure editor cannot be looked at, and SYSTEM_13's Open items say so ([SYSTEM_13_ai_assistant.md:236](SYSTEM_13_ai_assistant.md#L236)).
- **The image's size and encoding belong to the slide.** `IMAGE_WIDTH_PX`, `JPEG_QUALITY`, the white ground and the `toDataURL` call sit in [render_slide_image.ts:14-15](client/src/components/products/copilot/slide_ai/render_slide_image.ts#L14-L15) and [:31-44](client/src/components/products/copilot/slide_ai/render_slide_image.ts#L31-L44). A second look would restate them.
- **The wording is for a contract that has gone.** The tool's description ([get_slide_images.ts:15](client/src/components/products/copilot/ai_tools/tools/get_slide_images.ts#L15)), the brief ([build_system_prompt.ts:600](lib/ai_tools/build_system_prompt.ts#L600)), its pin in `server/tests/copilot_prompt_test.ts` and SYSTEM_13 all say an image stays in the conversation and is sent again with every later request. Panther now holds an image for one turn and caps a turn at 20 (`IMAGE_LIMITS.MAX_PER_TURN`), and this app has not synced it.
- **Nothing pins that a look shows what its twin reads and what the user sees.** Today it holds by reading the code: `get_slides` and `get_slide_images` both read through `readSlideTarget` and `getDeckConfig()`, and the canvas, the rail, the PDF export and the look all build the page through `convertSlideToPageInputs`. No test fails if one of them stops.
- **A figure's picture for the user is not its stored bundle alone.** A report figure is drawn with the report's chart palette and the ink of the ground it sits on ([report_figure_embed.tsx:67](client/src/components/products/_shared/report_figure_embed.tsx#L67), `applyInkTheme` below it). The figure editor's preview is drawn from a memo inside the editor ([figure_editor.tsx:1011](client/src/components/_shared/figure_editor/figure_editor.tsx#L1011)) that the view's context does not expose: the context gives the draft config alone ([ai_views.ts:261-269](client/src/components/instance/copilot/ai_views.ts#L261-L269)). A look that rebuilt either from the bundle or the config would show the model a picture the user is not looking at.

## §2 The model

**Three looks, each a twin.**

| Look                       | Twin                | Views                        | Input                    | Draws                                            |
| -------------------------- | ------------------- | ---------------------------- | ------------------------ | ------------------------------------------------ |
| `get_slide_images`         | `get_slides`        | the deck view                | `{ slideIds }`, 1 to 10  | each slide's page, as the canvas and the PDF do  |
| `get_report_figure_images` | `get_report_figure` | the report view              | `{ figureIds }`, 1 to 10 | each figure as the report shows it               |
| `get_figure_editor_image`  | `get_figure_editor` | the four figure editor views | `{}`                     | the figure as the editor's preview shows it, now |

**One name rule.** A look is its twin's name with `_images` for a twin that takes ids and `_image` for a twin that takes none.

**One result shape.** An `AIToolOutput`: one line of text naming what each image is, in the order asked, with each image's pixel size, then the images.

**One encoder.** `copilot/_shared/tool_image.ts` holds the width, the format, the quality, the ground and the height bound. A look gives it a function that draws at a given width and gets back an `AIToolImage`.

**One source per pair.** A look and its twin read their subject through the same function, and a look draws through the function the user's screen draws through. A test reads the sources and fails when either stops being true.

**Held for one turn.** A look's description, the briefs and SYSTEM_13 say an image is seen for the rest of the turn and not after, that looking again is one call and shows the subject as it is then, and that a turn takes at most 20 images.

## §3 Rulings

1. **A look is the twin of a text read**: same ids, same views, same requirement, same refusals, a tool of its own. A switch on the text read would put two contracts under one name with a limit its schema cannot state. Ruled by Tim, 2026-11-13.
2. **The model looks at the picture itself**, never at a second model's report of it. Ruled by Tim, 2026-11-13.
3. **An image is held for one turn**, as panther builds it. Ruled by Tim, 2026-11-13.
4. **A look takes at most 10 subjects a call**, one constant in the encoder's module, read by both array looks. Panther's 20 a turn bounds the rest. _(proposed)_
5. **An image is a JPEG 1024 px wide at quality 0.85.** Measured 2026-11-13 on Sonnet 5 and Haiku 5.5: 30 of 30 cells read from a 16-column table with 9 px text, the same as PNG and as 1568 px, at under half the tokens of 1568 px. _(proposed)_
6. **A figure is drawn at its ideal height, to a bound.** `getFigureAsCanvas` gives a figure its ideal height at the width asked ([figure_to_image.ts:22](panther/_301_util_funcs/figure_to_image.ts#L22)). An image taller than 2048 px is drawn again at the width that brings its height to 2048, and the result's line gives the size, so the model knows a long table was shrunk. _(proposed)_
7. **The ground is the one the user sees.** A JPEG has no transparency. A slide's page paints its own ground. A figure is drawn over white in the editor and over its report ground in a report. _(proposed)_
8. **A look draws through the user's own builder, exposed on the view's context.** The report view's context gives the figure inputs the report draws a figure with (palette and ink applied). The figure editor's context gives the preview's own inputs, with their loading and error states, and a look refuses with that state's text while the preview is not showing a figure. Neither look re-queries. _(proposed)_
9. **A report page is not looked at.** A report is DOM, and its only picture is the headless-Chrome print in `report-forge/server/`, which is Nick's repo. It stays in SYSTEM_13's Open items. _(proposed)_
10. **Nothing ships in this plan.** The app's next release carries it.
11. **This plan runs before PLAN_03_COPILOT_FIGURES.md's code steps** and depends on none of that plan's rulings: a look reads a figure as it is, however the copilot came to state it. Its new tools live in files of their own so the two plans' Surfaces meet only where a tool is registered. _(proposed)_

## §4 Steps

### Step 1: sync the one-turn panther, and say so

Starts when `./sync --check wb-fastr`, run in the panther repo, reports nothing that would refuse the sync.

**Surface.** `panther/**` as the sync writes it, `client/src/components/products/copilot/ai_tools/tools/get_slide_images.ts`, `lib/ai_tools/build_system_prompt.ts`, `server/tests/copilot_prompt_test.ts`, `SYSTEM_13_ai_assistant.md`, `TESTING_SCRIPT_FOR_AI_COPILOT.md`, this file.

**Deliverable.**

- The sync is the commit panther's `./sync wb-fastr` makes, and nothing else is in it. If the floor then fails for a reason that is not this plan's, the agent reports the gate's output and stops.
- `get_slide_images`'s description and the deck brief state the one-turn contract of §2 in place of "stays in the conversation and is sent again with every later request", and no longer say never to look at every slide of a deck: they say a turn takes at most 20 images. `server/tests/copilot_prompt_test.ts` pins the new sentences and asserts the old ones are gone.
- SYSTEM_13 states what an image costs as built: held for one turn, what the release costs (the thinking after the first image of the turn), the cap, and that a refused request fails its turn alone. Its "The panther engine" section names the image limits as synced.
- TESTING_SCRIPT_FOR_AI_COPILOT.md F20 adds: after a look, the next user message's request carries the released image's text in the image's place.

**Not in this step.** The per-call limit, the encoder, any new tool.

**Gates.** The floor. `deno task test:files server/tests/copilot_prompt_test.ts`.

**Ends with.** Two commits: the sync; the wording.

### Step 2: the encoder, the slide look on it, and the pair test

**Surface.** In `client/src/components/products/copilot/`: `_shared/tool_image.ts` (new), `_shared/mod.ts`, `slide_ai/render_slide_image.ts`, `slide_ai/mod.ts`, `ai_tools/tools/get_slide_images.ts`. `server/tests/copilot_look_sources_test.ts` (new), `SYSTEM_13_ai_assistant.md`, `TESTING_SCRIPT_FOR_AI_COPILOT.md`.

**Deliverable.**

- `tool_image.ts` exports the per-call limit (ruling 4) and one function that takes a draw-at-width function and a ground and returns an `AIToolImage` with its pixel size, applying rulings 5, 6 and 7. It is the only file under `copilot/` that names a pixel width, a JPEG quality or `toDataURL`.
- `renderSlideImage` builds the page through `buildSlidePage` and draws it through the encoder. It holds no size, format or ground of its own.
- `get_slide_images` takes one to ten slide ids from the shared limit, and its result line gives each image's size.
- `server/tests/copilot_look_sources_test.ts` reads source text and fails unless: `get_slides.ts` and `get_slide_images.ts` both read a slide through `readSlideTarget`, both check ids through `assertSlidesInDeck` and both take the deck config from `getDeckConfig`; `render_slide_image.ts` builds its page through `buildSlidePage`; `buildSlidePage` calls `convertSlideToPageInputs`; and the editor canvas ([slide_editor.tsx:527](client/src/components/products/slide_deck/slide_editor/slide_editor.tsx#L527)) calls `convertSlideToPageInputs`. The test is shown to fail with each of those broken before the commit.
- SYSTEM_13 describes the encoder, the limit and the test where it describes the tool. The testing script's five-slide refusal becomes an eleven-slide one.

**Not in this step.** Routing the draft preview's page through `buildSlidePage`. Any figure look.

**Gates.** The floor. `deno task test:files server/tests/copilot_look_sources_test.ts`.

**Ends with.** One commit.

### Step 3: `get_report_figure_images`

**Surface.** `lib/ai_tools/copilot_catalogue.ts`, `lib/ai_tools/build_system_prompt.ts`, `client/src/components/instance/copilot/ai_views.ts`, `client/src/components/products/report/report.tsx`, `client/src/components/products/_shared/report_figure_embed.tsx`, `client/src/generate_report/report_figure_raster.ts`, in `client/src/components/products/copilot/ai_tools/tools/`: `get_report_figure_images.ts` (new), `report_editor.ts` (the registration and an export of `liveFigureOrRefuse` alone), `mod.ts`. `server/tests/copilot_catalogue_test.ts`, `server/tests/copilot_prompt_test.ts`, `server/tests/copilot_look_sources_test.ts`, `SYSTEM_12_documents_sharing.md`, `SYSTEM_13_ai_assistant.md`, `TESTING_SCRIPT_FOR_AI_COPILOT.md`.

**Deliverable.**

- One function builds the figure inputs a report draws a figure with: `buildFigureInputs` with the report's chart palette, then the ink of the figure's ground. The embed ([report_figure_embed.tsx:67](client/src/components/products/_shared/report_figure_embed.tsx#L67)) and the report view's context both call it, and the context exposes it by figure id with the ground's colour (ruling 8).
- `get_report_figure_images` takes `figureIds`, one to ten, finds each through `liveFigureOrRefuse` as `get_report_figure` does ([report_editor.ts:95](client/src/components/products/copilot/ai_tools/tools/report_editor.ts#L95)), refuses a figure with no resolved data in its twin's words, and a figure the report cannot draw with the reason the embed shows. It draws each through `getFigureAsCanvas` and the encoder.
- The catalogue and its test hold it: a read, requirement `none`, the report view.
- The report brief says when to look: after inserting or changing a figure whose legibility the config cannot tell, and `server/tests/copilot_prompt_test.ts` pins it.
- `copilot_look_sources_test.ts` gains the pair: both tools find a figure through `liveFigureOrRefuse`, and the embed and the context share the one builder.
- SYSTEM_13 describes the tool and counts the report tools as they are. Its Open item keeps the report page and the report image verb and loses the report figure. SYSTEM_12 says the copilot looks at a figure through the embed's builder.

**Not in this step.** A report page. A report's image embeds. Any change to how a figure is read or written as text.

**Gates.** The floor. `deno task test:files server/tests/copilot_catalogue_test.ts server/tests/copilot_prompt_test.ts server/tests/copilot_look_sources_test.ts`.

**Ends with.** Two commits, each green: the shared builder on the context; the tool.

### Step 4: `get_figure_editor_image`

**Surface.** `lib/ai_tools/copilot_catalogue.ts`, `lib/ai_tools/build_system_prompt.ts`, `client/src/components/instance/copilot/ai_views.ts`, `client/src/components/_shared/figure_editor/figure_editor.tsx`, in `client/src/components/products/copilot/ai_tools/tools/`: `get_figure_editor_image.ts` (new), `figure_editor.ts` (the registration alone), `mod.ts`. `server/tests/copilot_catalogue_test.ts`, `server/tests/copilot_prompt_test.ts`, `server/tests/copilot_look_sources_test.ts`, `SYSTEM_11_viz_authoring.md`, `SYSTEM_13_ai_assistant.md`, `TESTING_SCRIPT_FOR_AI_COPILOT.md`, this file.

**Deliverable.**

- The preview's figure inputs ([figure_editor.tsx:1011](client/src/components/_shared/figure_editor/figure_editor.tsx#L1011)) are one memo the preview's `FigureHolder` and the view's context both read: `FigureEditorContext` gains a getter for it, state included (ruling 8).
- `get_figure_editor_image` takes `{}`, checks the editor that set the view is still the current one as `update_figure_editor` does, refuses with the preview's own text while it is loading or shows an error, and draws the inputs through `getFigureAsCanvas` and the encoder.
- The catalogue and its test hold it: a read, requirement `none`, the four figure editor views.
- The figure editor brief says when to look: after a change to the chart type, the display slots or the disaggregations, and `server/tests/copilot_prompt_test.ts` pins it.
- `copilot_look_sources_test.ts` gains the pair: the tool reads the context's getter, and the editor's preview and the getter are the one memo.
- SYSTEM_13 describes the tool, states the name rule and the twin rule once for all three, and its Open item loses the figure in its editor. SYSTEM_11 says the editor exposes its preview to the copilot.
- The close runs `deno task test` and deletes this file.

**Not in this step.** A look at a package figure outside its viewer. A transcript card that shows the image to the user.

**Gates.** The floor. `deno task test:files server/tests/copilot_catalogue_test.ts server/tests/copilot_prompt_test.ts server/tests/copilot_look_sources_test.ts`. At the close, `deno task test`.

**Ends with.** Two commits, each green: the getter; the tool. Then the close.

## §5 Out of scope

- **A report page as an image** (ruling 9), and a report's image embeds.
- **App screens.** They are DOM, with no route to an image.
- **How the copilot creates, edits and reads a figure as text**: PLAN_03_COPILOT_FIGURES.md.
- **Showing a look's image in the chat transcript.** Panther draws no tool image there.
- **Images a user sends.**
- **Whether a model looks too often or too rarely under the one-turn contract.** Tim's use of the app shows it, and a change to the briefs follows from that, not from this plan.

## §6 Log

- Step 1: the sync commits carry the step's subject, their own `panther sync` line moved to the body, because the review greps the step's commits by subject. Step 1 is three syncs, not one: a second panther commit (6afd69d4, a comment) landed before the review, and the review's fix made `IMAGE_LIMITS` package-public in panther (13e17ccb) so the brief, the tool's description and the test read the cap of 20 instead of restating it.
- Step 3: the shared builder's commit also edits the two `mod.ts` entries its exports pass through, `instance/copilot/mod.ts` (`ReportFigureDraw`) and `products/_shared/mod.ts` (`buildReportFigureInputs`, `FigureGround`), which the step's Surface did not list.
