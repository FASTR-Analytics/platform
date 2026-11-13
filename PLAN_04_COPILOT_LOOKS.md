# PLAN: The copilot's looks

Status: QUEUED behind PLAN_02_COPILOT_SURFACE_GAPS.md, which gave the copilot `get_slide_images`. This plan makes looking one coherent set: every look is the image twin of a text read, every look draws what the user's own surface draws, and all of them share one encoding. It adds the two figure looks, and it moves the wording of all three to panther's one-turn images once panther has them.

**Next step: Do 1.**

Branch: `main`. Repos: this one, and step 4 syncs `timroberton-panther`. Read first: [CLAUDE.md](CLAUDE.md), [SYSTEMS.md](SYSTEMS.md), [SYSTEM_13_ai_assistant.md](SYSTEM_13_ai_assistant.md) "Tools, view gating, and approval" and "The panther engine", [PROTOCOL_APP_AI_TOOLS.md](PROTOCOL_APP_AI_TOOLS.md), [SYSTEM_10_figure_render_export.md](SYSTEM_10_figure_render_export.md) on how a figure bundle becomes `FigureInputs`, [SYSTEM_12_documents_sharing.md](SYSTEM_12_documents_sharing.md) "The deck editor" and on a report's figure embeds. Start when: `test ! -e PLAN_02_COPILOT_SURFACE_GAPS.md && echo ok` prints `ok` on `main`, and this tree is clean.

## §0 How to work this plan

The instruction is "Do the next step of PLAN_04_COPILOT_LOOKS.md." Branch, floor, conditional gates, reading order and the review cadence are [PROTOCOL_APP_PLANS.md](PROTOCOL_APP_PLANS.md) and [panther/protocols/PROTOCOL_ALL_PLANS.md](panther/protocols/PROTOCOL_ALL_PLANS.md). The log is §6. The last step is 4; its close commit deletes this file. Nothing in this plan ships (ruling 9).

Vocabulary:

- **look**: a read tool whose output is images for the model.
- **twin**: the text read a look stands beside. A look takes its twin's ids, is admitted in its twin's views, has its twin's requirement and refuses what its twin refuses.
- **surface**: what the user sees the thing on: the slide editor's canvas, a report's figure embed, the figure editor's preview.
- **source**: the value a surface draws from: a slide's `PageInputs`, a figure's `FigureInputs`.

Rules peculiar to this plan:

- Every line number here was read on 2026-11-13. Where the code has moved, the code wins.
- Tool descriptions, results and the brief are text for the model: English, never `t3`.
- No gate asks a model anything.

## §1 The problem

- **There is one look and no rule for the next.** `get_slide_images` ([get_slide_images.ts](client/src/components/products/copilot/ai_tools/tools/get_slide_images.ts)) is the twin of `get_slides`. `get_report_figure` ([report_editor.ts:469](client/src/components/products/copilot/ai_tools/tools/report_editor.ts#L469)) and `get_figure_editor` ([figure_editor.ts:62](client/src/components/products/copilot/ai_tools/tools/figure_editor.ts#L62)) have no twin, so the model cannot look at a figure in a report or at the figure it is editing.
- **The encoding lives in the slide's renderer.** The width, the format and the quality are constants of [render_slide_image.ts](client/src/components/products/copilot/slide_ai/render_slide_image.ts). A second look would copy them.
- **Nothing holds a look to its surface.** The slide editor's canvas builds its page by calling `convertSlideToPageInputs` itself ([slide_editor.tsx:527](client/src/components/products/slide_deck/slide_editor/slide_editor.tsx#L527)), and the look builds its page through `buildSlidePage` ([measure_slide_overflow.ts:20](client/src/components/products/copilot/slide_ai/measure_slide_overflow.ts#L20)), which calls the same function with the same arguments today. No test fails when one of them changes. A look that draws something the user does not see is worse than no look: the model reports on a picture nobody has.
- **A figure's source is built in the component that draws it.** A report's embed builds its `FigureInputs` inside the component ([report_figure_embed.tsx:67](client/src/components/products/_shared/report_figure_embed.tsx#L67): `buildFigureInputs` with the report's chart palette, then the ink theme). The figure editor builds its preview's inside a memo ([figure_editor.tsx:1011](client/src/components/_shared/figure_editor/figure_editor.tsx#L1011)), and the view context gives the copilot the draft config alone ([ai_views.ts:261](client/src/components/instance/copilot/ai_views.ts#L261)). A look that resolved the figure a second time could draw a different figure from the one on screen.
- **The wording is the engine's of today.** The tool's description, the brief and SYSTEM_13 say an image stays in the conversation. Panther's open plan holds an image for the turn that took it.

## §2 The model

**A look is a twin.** Three looks, each beside one text read:

| Look                       | Twin                | Views                        | Input                   |
| -------------------------- | ------------------- | ---------------------------- | ----------------------- |
| `get_slide_images`         | `get_slides`        | the deck view                | `{ slideIds }`, 1 to 4  |
| `get_report_figure_images` | `get_report_figure` | the report view              | `{ figureIds }`, 1 to 4 |
| `get_figure_editor_image`  | `get_figure_editor` | the four figure editor views | `{}`                    |

**A look draws its surface's source.** One function builds the source, and the surface and the look both call it. The look reads the thing where its twin reads it.

**One encoding.** One module turns a canvas into a panther `AIToolImage`. It holds the width, the format and the quality, and every look calls it.

**One result.** A look returns an `AIToolOutput`: one line of text naming what was drawn, in order, then the images in that order.

## §3 Rulings

1. **Every look is the twin of one text read**, as the vocabulary states it. A look that has no text read to stand beside is not built. _(proposed)_
2. **A look draws the source its surface draws**, through the one function that builds it. Where a surface builds its source inside a component, the step moves that into a function both call. _(proposed)_
3. **A test holds each look to its surface.** It reads the source files and fails when a surface or a look builds its source by any path but the shared function. It runs under `deno task test:files`, since the renderer needs a browser and the test must not. _(proposed)_
4. **One module encodes**: 1024 px wide, JPEG at quality 0.85. Sonnet 5 and Haiku 5.5 each read every cell of a 16-column table with 9 px text at that size, and 1568 px cost 2.2 times the tokens for the same result (measured 2026-11-13). _(proposed)_
5. **A slide is drawn at the page's proportions. A figure is drawn at the height it asks for at that width**, as its surface sizes it. _(proposed)_
6. **A look that names several things takes at most four a call.** _(proposed)_
7. **The figure editor's look draws the preview's own `FigureInputs`**, handed to the copilot through the view context. It never resolves the draft again. While the preview has no figure to show (loading, an error, no rows), the look refuses with the preview's own reason. _(proposed)_
8. **A report figure's look draws the stored bundle as the embed draws it**: the report's chart palette and the ink theme included. A figure with no resolved data refuses as `get_report_figure` does. _(proposed)_
9. **Nothing ships in this plan.** The app's next release carries it.
10. **Not built: a look at a report page.** A report page is laid out by the browser, not drawn on a canvas, so it has no source a look could share with its surface.

## §4 Steps

### Step 1: one encoding, and the slide look held to its canvas

**Surface.** `client/src/components/products/copilot/_shared/tool_image.ts` (new), `_shared/mod.ts`, `slide_ai/render_slide_image.ts`, `slide_ai/measure_slide_overflow.ts`, `slide_ai/mod.ts`, `client/src/components/products/slide_deck/slide_editor/slide_editor.tsx`, `server/tests/copilot_look_sources_test.ts` (new), `SYSTEM_13_ai_assistant.md`.

**Deliverable.**

- `tool_image.ts` exports one function that takes a canvas and returns an `AIToolImage`, and the constants of ruling 4. `renderSlideImage` draws on a canvas of that width and returns through it, and holds no width, format or quality of its own.
- One exported function builds a slide's page from the slide and the deck's settings. The slide editor's canvas, `measureSlideOverflow` and `renderSlideImage` call it, and none of them calls `convertSlideToPageInputs` itself.
- `server/tests/copilot_look_sources_test.ts` fails when any of those three files names `convertSlideToPageInputs`, and when `get_slides.ts` or `get_slide_images.ts` reads a slide by any path but `readSlideTarget`.
- SYSTEM_13 states the twin rule, the shared source and the one encoding where it describes `get_slide_images`.

**Not in this step.** A new look. The rail's card, the presenter and the exports, which draw a saved slide and take no part in a look.

**Gates.** `deno task test:files server/tests/copilot_look_sources_test.ts`.

**Ends with.** One commit, green.

### Step 2: `get_report_figure_images`

**Surface.** `client/src/components/products/_shared/report_figure_embed.tsx`, `client/src/generate_report/report_figure_raster.ts`, `client/src/components/instance/copilot/ai_views.ts`, `client/src/components/products/report/**` where the report view's context is built, `client/src/components/products/copilot/ai_tools/tools/report_editor.ts`, `lib/ai_tools/copilot_catalogue.ts`, `lib/ai_tools/build_system_prompt.ts`, `server/tests/copilot_catalogue_test.ts`, `server/tests/copilot_prompt_test.ts`, `server/tests/copilot_look_sources_test.ts`, `SYSTEM_13_ai_assistant.md`, `TESTING_SCRIPT_FOR_AI_COPILOT.md`.

**Deliverable.**

- One exported function builds a report figure's `FigureInputs` from its bundle, the report's chart palette and the ink theme. The embed calls it, and so does the look. The report view's context carries what the function needs that the copilot cannot read today.
- `get_report_figure_images` takes `figureIds`, one to four, refuses an id the report's body does not hold and a figure with no resolved data as `get_report_figure` does, draws each figure at the height it asks for at the encoding's width, and returns ruling "one result"'s output.
- The catalogue and its test hold it: a read, no requirement, the report view.
- The report brief says when to look at a figure, and `server/tests/copilot_prompt_test.ts` pins it.
- `server/tests/copilot_look_sources_test.ts` holds the embed and the look to the one function.
- SYSTEM_13 describes the tool and counts the report tools as they are. Its Open items lose the figure half of the report line.

**Not in this step.** A look at a report page (ruling 10). An image embed's picture.

**Gates.** `deno task test:files server/tests/copilot_catalogue_test.ts server/tests/copilot_prompt_test.ts server/tests/copilot_look_sources_test.ts`.

**Ends with.** One commit, green.

### Step 3: `get_figure_editor_image`

**Surface.** `client/src/components/_shared/figure_editor/figure_editor.tsx`, `client/src/components/instance/copilot/ai_views.ts`, `client/src/components/products/copilot/ai_tools/tools/figure_editor.ts`, `lib/ai_tools/copilot_catalogue.ts`, `lib/ai_tools/build_system_prompt.ts`, `server/tests/copilot_catalogue_test.ts`, `server/tests/copilot_prompt_test.ts`, `server/tests/copilot_look_sources_test.ts`, `SYSTEM_13_ai_assistant.md`, `TESTING_SCRIPT_FOR_AI_COPILOT.md`.

**Deliverable.**

- The figure editor's view context carries the preview's own `FigureInputs` state: the figure, or the reason there is none (ruling 7).
- `get_figure_editor_image` takes no input, draws that figure at the height it asks for at the encoding's width, refuses with the preview's reason when there is no figure, and returns one line naming the figure and its image. It is admitted in the four figure editor views.
- The catalogue and its test hold it: a read, no requirement, the figure editor views.
- The figure editor brief says when to look, and `server/tests/copilot_prompt_test.ts` pins it.
- `server/tests/copilot_look_sources_test.ts` fails when `figure_editor.ts` resolves a bundle to draw the look.
- SYSTEM_13 describes the tool and its Open items lose the rest of the look line.

**Not in this step.** Any change to how the copilot creates or edits a figure.

**Gates.** `deno task test:files server/tests/copilot_catalogue_test.ts server/tests/copilot_prompt_test.ts server/tests/copilot_look_sources_test.ts`.

**Ends with.** One commit, green.

### Step 4: sync panther's one-turn images, and the wording

Starts when `test ! -e PLAN_23_AI_IMAGES_ONE_TURN.md && echo ok` prints `ok` in the panther repo, its tree is clean, and `./sync --check wb-fastr`, run there, reports nothing that would refuse the sync.

**Surface.** `panther/**` as the sync writes it, the three look tools' files, `lib/ai_tools/build_system_prompt.ts`, `server/tests/copilot_prompt_test.ts`, `SYSTEM_13_ai_assistant.md`, `TESTING_SCRIPT_FOR_AI_COPILOT.md`, this file.

**Deliverable.**

- The sync, which panther's `./sync` commits by itself, and a green floor after it. If the floor fails for a reason that is not this plan's, the agent reports the gate's output and stops.
- The three tools' descriptions, the briefs and SYSTEM_13 say what the synced engine does: an image is held for the turn that took it, a later turn has the look's text and the model's own reply, and a turn takes at most the engine's cap. No sentence says an image stays in the conversation.
- Each look's text names what was drawn precisely enough to stand without its image in a later turn.
- `server/tests/copilot_prompt_test.ts` pins the new wording.
- The close commit deletes this file.

**Not in this step.** Any change to panther.

**Gates.** After the sync, the floor. `deno task test:files server/tests/copilot_prompt_test.ts`. At the close, `deno task test`.

**Ends with.** The sync's commit, one commit for the wording, then the close.

## §5 Out of scope

- **A look at a report page** (ruling 10).
- **How the copilot creates, edits and reads a figure**: PLAN_03_COPILOT_FIGURES.md.
- **Showing a look's image in the transcript.**
- **A look at a saved slide in the rail, a version's preview or a draft slide's card.**

## §6 Log
