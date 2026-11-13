# PLAN: Copilot surface gaps in a deck

Status: QUEUED behind PLAN_COPILOT_TOOL_LIMIT.md. On 2026-11-12 the copilot told a user rebuilding a report as a deck what it could not do. Three of its answers were about its own reach in a deck and not about figures, and the deck holds each of those things done by hand: image blocks, a slide's own settings and the deck's logos, and a person looking at the page. This plan gives the copilot the same reach: image blocks, a slide's own settings, the deck's logos and footer, and a rendered image of a slide to look at. How the copilot creates, edits and reads a figure is PLAN_03_COPILOT_FIGURES.md's, and this plan changes none of it.

**Next step: Do 1.**

Branch: `main` in both repos. Repos: this one (steps 1, 2 and 4) and `timroberton-panther` (step 3). Read first: [CLAUDE.md](CLAUDE.md), [SYSTEMS.md](SYSTEMS.md), [SYSTEM_13_ai_assistant.md](SYSTEM_13_ai_assistant.md) "Tools, view gating, and approval", "Tool input schemas", "The slide_ai conversion layer" and Open items "Surface gaps", [PROTOCOL_APP_AI_TOOLS.md](PROTOCOL_APP_AI_TOOLS.md), [SYSTEM_10_figure_render_export.md](SYSTEM_10_figure_render_export.md) Open items, [SYSTEM_12_documents_sharing.md](SYSTEM_12_documents_sharing.md) "The deck editor", and for step 3 the panther repo's `CLAUDE.md` and `DOC_AI_CHAT.md` "Tools" and "Verification". Start when: `test ! -e PLAN_COPILOT_TOOL_LIMIT.md && echo ok` prints `ok` on `main`, and this tree is clean.

## §0 How to work this plan

The instruction is "Do the next step of PLAN_02_COPILOT_SURFACE_GAPS.md." Branch, floor, conditional gates, reading order and the review cadence are [PROTOCOL_APP_PLANS.md](PROTOCOL_APP_PLANS.md) and [panther/protocols/PROTOCOL_ALL_PLANS.md](panther/protocols/PROTOCOL_ALL_PLANS.md). The log is §6. The last step is 4; its close commit deletes this file. Nothing in this plan ships (ruling 11).

Step 3 is worked in `/Users/timroberton/projects/panther/timroberton-panther` on its branch `main`, under that repo's `CLAUDE.md`. Its floor is the six commands of that file's "Commands". Its tree is shared with other panther plans: the agent confirms it is clean before it starts and stages only its own files.

Vocabulary, used throughout:

- **stored shape**: what the app stores for a slide, a block or a deck's settings (`slideConfigSchema`, `slideDeckConfigSchema`).
- **read projection**: what a read tool returns for a stored shape.
- **write schema**: the zod input of a write tool.
- **dead knob**: a stored field no renderer reads: `showPageNumbers` and `headerSize` on a deck, `textSize` on a text block (SYSTEM_10 Open items).
- **write result**, **the brief**, **page fit**: as PROTOCOL_APP_AI_TOOLS.md "The round budget" and SYSTEM_13 state them once the tool-limit work has landed.

Rules peculiar to this plan:

- It is written against the code as the tool-limit work leaves it: `get_slides`, write results that carry what a write left, the brief in `lib/ai_tools/build_system_prompt.ts`. Every line number here was read on 2026-11-12, before that work; where the code has moved, the code wins.
- Every field this plan adds keeps its stored name and is derived from the stored schema through `.shape`. No dead knob enters a read projection or a write schema.
- Tool descriptions, write results and the brief are text for the model: English, never `t3`.
- No gate asks a model anything.

## §1 The problem

The deck is "Round 1 report" on sierraleone, 47 slides, read 2026-11-12. SYSTEM_13's Open items name the class: where the stored shape is richer than the read projection and the write schema together, the copilot cannot see or set what a user can.

- **The copilot cannot place an image, or read or set a slide's own settings.** A block it writes is text or `from_metric` ([ai_input.ts:223](lib/types/ai_input.ts#L223)). An image block reads back as its file name alone ([simplify_slide_for_ai.ts:91](client/src/components/products/copilot/slide_ai/simplify_slide_for_ai.ts#L91)). A slide's sub-header, footer, logo visibility, split panel and text emphasis are in no read ([simplify_slide_for_ai.ts:63-79](client/src/components/products/copilot/slide_ai/simplify_slide_for_ai.ts#L63-L79)) and no write ([update_slide.ts:39-75](client/src/components/products/copilot/ai_tools/tools/update_slide.ts#L39-L75)), and `replace_slide` builds the slide from its input alone, so it drops them. The deck has two image blocks and a slide with an image split and its footer logos hidden.
- **The deck's logos and footer are out of reach.** They are the deck's settings ([slides.ts:89-110](lib/types/slides.ts#L89-L110)), saved through `patchDeckConfig` ([slide_deck.tsx:202](client/src/components/products/slide_deck/slide_deck.tsx#L202)). The deck view's context exposes `getDeckConfig` alone ([ai_views.ts:221](client/src/components/instance/copilot/ai_views.ts#L221)) and `get_deck` prints none of it.
- **The copilot cannot look at a slide.** A tool's result is text: panther turns whatever a handler returns into a string ([tool_helpers.ts:768-770](panther/_112_ai_tool_core/tool_helpers.ts#L768-L770), [tool_engine.ts:341](panther/_305_ai/_core/tool_engine.ts#L341)). Page fit says whether a page overflows. It does not say whether a 16-column table can be read.

## §2 The model

For a slide's blocks and settings and for the deck's settings, the read projection, the write schema and the stored shape agree.

**Slides.** A block is text, `from_metric` or an image named by its asset file. `get_image_assets` lists the files. `get_slides` returns each slide's own settings as stored, and `update_slide`, `create_slide` and `replace_slide` take them. `replace_slide` keeps the settings of a slide whose type it keeps.

**The deck.** `get_deck` prints the deck's settings and the logos that can be shown. `update_deck_settings` changes the logos, the footer text and the watermark through the deck's own save.

**Looking.** `get_slide_images` returns up to four slides as images, drawn as the PDF export draws them. A panther tool handler may return images with its text.

## §3 Rulings

1. **Figures are another plan's.** How the copilot creates, edits and reads a figure is PLAN_03_COPILOT_FIGURES.md's. This plan leaves the `from_metric` block, the figure patch tools and `formatFigureConfigForAI` as it finds them. Ruled.
2. **An image block is `{ type: "image", imgFile, style }`, derived from `imageBlockSchema`.** `imgFile` must be one of the instance's image assets, the list the slide toolbar offers ([slide_toolbar.tsx:412-413](client/src/components/products/slide_deck/slide_editor/slide_toolbar.tsx#L412-L413)). `get_image_assets` is a read of its own, admitted in the deck view: the list is needed only when an image is asked for. _(proposed)_
3. **A slide's own settings are every stored field of its type but the layout and the dead knobs.** The read returns them as stored. The write schemas derive them from the slide schemas, and a test holds the two together. A text block's `textBackground` rides its block the same way. _(proposed)_
4. **`replace_slide` keeps the settings of a slide whose type it keeps**, unless its input names the field. It rebuilds content and layout, which is what its name says. _(proposed)_
5. **`update_deck_settings` writes `logos`, `globalFooterText`, `useWatermark` and `watermarkText`.** Not the theme, which the user chooses and the deck asks about at first open. Not the dead knobs. A selected logo must be one the renderer would draw: a built-in logo or one of the deck's custom logos, and a custom logo must be an image asset. _(proposed)_
6. **`update_deck_settings` is approval-exempt and is admitted in the deck view alone.** It shows on the rail and the open slide at once and is undone from the Deck menu, as the slide writes are. The settings screen holds a form of its own, so the tool is not admitted there. _(proposed)_
7. **`get_slide_images` takes at most four slides a call**, each a JPEG 1024 px wide. An image stays in the conversation and is sent again with every later request, so the brief says when to look: after building or restructuring a slide that holds a dense table or several blocks, never every slide of a deck. _(proposed)_
8. **Panther: a tool handler may return images with its text.** The chat loop sends them as the API's content blocks, text first. The headless entry points (`run`, and with it `/mcp` and `callAI`) return the text alone. _(proposed)_
9. **Images are held in the conversation as sent**, base64 in the stored record. No Files API upload: it needs an upload route and a file lifecycle this plan has no other use for. The production proxy sets no body limit (`client_max_body_size 0`, read 2026-11-12). _(proposed)_
10. **Decks only.** A report's images and a rendered report page are not in this plan. _(proposed)_
11. **Nothing ships in this plan.** The app's next release carries it.

## §4 Steps

### Step 1: image blocks and a slide's own settings (this repo)

**Surface.** `lib/types/ai_input.ts`, `lib/ai_tools/copilot_catalogue.ts`, `lib/ai_tools/build_system_prompt.ts`, in `client/src/components/products/copilot/`: `slide_ai/simplify_slide_for_ai.ts`, `slide_ai/convert_ai_input_to_slide.ts`, `slide_ai/get_slide_with_updated_blocks.ts`, `slide_ai/layout_structure.ts`, `_shared/content_validators.ts`, `ai_tools/tools/slides.tsx`, `ai_tools/tools/update_slide.ts`, `ai_tools/tools/get_image_assets.ts` (new), `ai_tools/tools/mod.ts`, `ai_tools/tools/drafts.tsx`, `ai_tools/tools/slide_write_result.ts`. `server/tests/copilot_catalogue_test.ts`, `server/tests/copilot_prompt_test.ts`, `server/tests/ai_slide_schema_test.ts` (new), `SYSTEM_13_ai_assistant.md`, `TESTING_SCRIPT_FOR_AI_COPILOT.md`.

**Deliverable.**

- `AiContentBlockInputSchema` admits an image block as ruling 2 states, and a text block's `textBackground`. Every resolver that builds a block from AI input builds an image block, and a file that is not an image asset throws `AIToolFailure` before anything is written.
- `get_image_assets` returns the instance's image asset file names. The catalogue and its test hold it: a read, no requirement, the deck view.
- The per-type update schema of `update_slide` lives in `lib/types/ai_input.ts` beside the create schemas. Both sets hold every field of ruling 3, derived from the cover, section and content slide schemas. `server/tests/ai_slide_schema_test.ts` fails when a stored slide field is in neither the AI schemas nor the test's own list of exclusions (the layout, the dead knobs).
- A split panel's image file is checked as an image block's is.
- `simplifySlideForAI` returns a slide's own settings as stored, and an image block with its file and style. The write result names an image block by its type as it names the others.
- `replace_slide` behaves as ruling 4 states, and its description says so in place of the warning that it destroys customizations.
- The brief lists the image block beside text and `from_metric`, and says a slide's settings are in `get_slides` and set through `update_slide`. `server/tests/copilot_prompt_test.ts` pins both.
- SYSTEM_13's Open items lose the image and slide-level lines of the style cluster.

**Not in this step.** Anything about a figure block. A report's images. A layout cell's own overrides (`alignV`, `minH`, `maxH`), which stay in Open items with the complex-layout line. Uploading an asset.

**Gates.** `deno task test:files server/tests/copilot_catalogue_test.ts server/tests/copilot_prompt_test.ts server/tests/ai_slide_schema_test.ts`.

**Ends with.** Three commits, each green: image blocks; the slide's settings in the read and the writes; `replace_slide`.

### Step 2: the deck's settings (this repo)

**Surface.** `lib/types/ai_input.ts`, `lib/ai_tools/copilot_catalogue.ts`, `lib/ai_tools/format_deck_settings_for_ai.ts` (new), `lib/ai_tools/mod.ts`, `lib/ai_tools/build_system_prompt.ts`, `client/src/components/instance/copilot/ai_views.ts`, `client/src/components/products/slide_deck/slide_deck.tsx`, `client/src/components/products/copilot/slide_ai/get_deck_summary.ts`, `client/src/components/products/copilot/ai_tools/tools/deck_settings.ts` (new), `tools/mod.ts`, `tools/slides.tsx`, `client/src/generate_slide_deck/convert_slide_to_page_inputs.ts`, `server/tests/copilot_catalogue_test.ts`, `server/tests/format_deck_settings_for_ai_test.ts` (new), `SYSTEM_12_documents_sharing.md`, `SYSTEM_13_ai_assistant.md`, `TESTING_SCRIPT_FOR_AI_COPILOT.md`.

**Deliverable.**

- The deck view's context carries the deck's own `patchDeckConfig`, as it carries `deleteSlides`.
- `formatDeckSettingsForAI` is pure and in lib: the cover, header and footer logos with what is selected and whether they show by default, the logos that can be selected (the built-in ones and the deck's custom ones), the footer text and the watermark. `get_deck` prints it under the outline. `server/tests/format_deck_settings_for_ai_test.ts` pins it.
- The test for whether a logo is one the renderer draws is one exported function, read by `convertSlideToPageInputs` and by the tool.
- `update_deck_settings` takes a patch of the four fields of ruling 5, derived from `slideDeckConfigSchema`, checks it as ruling 5 states before anything changes, writes through `patchDeckConfig`, marks the product's echo key, and returns the settings as `get_deck` prints them.
- The catalogue and its test hold it: a write, `product_edit`, approval-exempt, the deck view.
- The brief says where the deck's settings are read and set. SYSTEM_12 "The deck editor" says the copilot writes through the same save, and SYSTEM_13 counts the tools as they are.

**Not in this step.** The theme. The settings screen. A report's settings.

**Gates.** `deno task test:files server/tests/copilot_catalogue_test.ts server/tests/format_deck_settings_for_ai_test.ts`.

**Ends with.** Two commits, each green: the read; the write.

### Step 3: a tool result can carry images (repo: timroberton-panther)

**Surface.** `modules/_112_ai_tool_core/tool_helpers.ts`, `modules/_305_ai/_core/tool_engine.ts`, `modules/_110_ai_types/` where a type needs it, `tests_ai/tool_loop_test.ts`, `tests_ai/persistence_test.ts`, `tests_ai/wire.ts`, `DOC_AI_CHAT.md`, `protocols/PROTOCOL_UI_AI_CHAT.md`, and a `deps.ts` or `mod.ts` only where `clean.ts` rewrites one.

**Deliverable.**

- A handler made with `createAITool` may return text with images, each a media type and base64 data, through one exported helper. Its name follows panther's conventions and DOC_AI_CHAT.md "Tools" records it.
- The chat loop answers the call with the API's content blocks: the text, then each image. `run` and `runStructured` return the text alone, so the headless and MCP surfaces are unchanged.
- A failed call, a cancelled call and an approval's result are text as today.
- `tests_ai/tool_loop_test.ts` adds a scenario: a tool returns an image, the next request carries it in the tool result, and the request after that carries it unchanged. `tests_ai/persistence_test.ts` adds one: a record holding such a result loads and sends. The wire invariants of `tests_ai/wire.ts` admit a tool result whose content is blocks.
- PROTOCOL_UI_AI_CHAT.md says when a tool returns an image and that every image is sent again with each later request.

**Not in this step.** Showing the image in the transcript. Images from an MCP tool. A Files API reference in place of the data.

**Gates.** The six commands of panther's CLAUDE.md "Commands".

**Ends with.** One commit in panther. The **Next step** line moves in a commit in this repo.

### Step 4: sync, and `get_slide_images` (this repo)

Starts when `./sync --check wb-fastr`, run in the panther repo, reports nothing that would refuse the sync.

**Surface.** `panther/**` as the sync writes it, `lib/ai_tools/copilot_catalogue.ts`, `lib/ai_tools/build_system_prompt.ts`, `client/src/components/products/copilot/slide_ai/render_slide_image.ts` (new), `slide_ai/mod.ts`, `client/src/components/products/copilot/ai_tools/tools/get_slide_images.ts` (new), `tools/mod.ts`, `tools/slides.tsx`, `server/tests/copilot_catalogue_test.ts`, `server/tests/copilot_prompt_test.ts`, `SYSTEM_13_ai_assistant.md`, `TESTING_SCRIPT_FOR_AI_COPILOT.md`, this file.

**Deliverable.**

- One commit holding the sync and nothing else, made after `./sync wb-fastr` and a green floor. If the floor fails for a reason that is not this plan's, the agent restores `panther/` to `HEAD`, commits nothing and reports the gate's output.
- `renderSlideImage(slide, deckConfig)` draws the page as the PDF export draws one (`convertSlideToPageInputs`, then `PageRenderer.measureAndRender`) on a canvas 1024 px wide at the page's proportions, and returns it as a JPEG.
- `get_slide_images` takes `slideIds`, one to four, refuses an id outside the deck as `get_slides` does, reads each slide through `readSlideTarget` so the open slide is drawn as its canvas shows it, and returns the images in the order asked with a line of text naming each.
- The catalogue and its test hold it: a read, no requirement, the deck view.
- The brief states ruling 7's rule for when to look, and `server/tests/copilot_prompt_test.ts` pins it.
- SYSTEM_13 describes the tool, what an image costs a conversation, and the tools as counted. Its Open items hold what this plan left: a report's images, a layout cell's overrides.
- The close commit deletes this file.

**Not in this step.** An image of a report page or of a figure in its editor. A transcript card for the image.

**Gates.** After the sync, the floor. `deno task test:files server/tests/copilot_catalogue_test.ts server/tests/copilot_prompt_test.ts`. At the close, `deno task test`.

**Ends with.** Two commits (the sync; the tool), then the close.

## §5 Out of scope

- **Everything about figures.** The chart type, a figure's style, how a figure is created and what checks it: PLAN_03_COPILOT_FIGURES.md.
- **Reports.** Image embeds, page settings and a rendered page for the model. `get_report_pages` already gives the model a report's pages as text.
- **The deck's theme**, and the dead knobs, which are SYSTEM_10's to wire or delete.
- **Product features the copilot's answer also listed.** A gauge or donut figure type, significance testing in the HFA module, and diagram blocks. An image block is how a diagram a person has drawn reaches a slide.
- **Panther: the image in the transcript, MCP image results, and Files API references.**

## §6 Log

- Step 1: built the image tool's registration in `client/src/components/products/copilot/mod.ts` and `client/src/components/instance/copilot_tools.ts` instead of inside the Surface alone, because `get_image_assets` reads no package, so it is an outer tool registered where `list_products` is, and no file in the Surface assembles the outer set.
- Step 1: exported `textBlockSchema`, `coverSlideSchema`, `sectionSlideSchema` and `contentSlideSchema` in `lib/types/_slide_config.ts`, outside the Surface, because ruling 3 derives the write schemas through `.shape` and `slideConfigSchema`'s members are not reachable as typed objects otherwise.
