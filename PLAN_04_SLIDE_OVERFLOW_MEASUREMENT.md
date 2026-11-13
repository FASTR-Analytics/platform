# PLAN: One measurement for slide overflow

Every overflow flag the copilot gives the model comes from the measurement the deck's canvas badges, so the model and the user cannot disagree about whether a slide overflows the page. Today three tools report the layout optimizer's score instead.

**Next step: Do 1.**

Branch: `main`. Repos: this one. Read first: [CLAUDE.md](CLAUDE.md), [SYSTEMS.md](SYSTEMS.md), [SYSTEM_13_ai_assistant.md](SYSTEM_13_ai_assistant.md) "The slide_ai conversion layer" and the paragraph on page overflow under the slide tools. Start when: any time.

## §0 How to work this plan

The instruction is "Do the next step of PLAN_04_SLIDE_OVERFLOW_MEASUREMENT.md." Branch, floor, tests, conditional gates, reading order and the review cadence are [PROTOCOL_APP_PLANS.md](PROTOCOL_APP_PLANS.md) and [panther/protocols/PROTOCOL_ALL_PLANS.md](panther/protocols/PROTOCOL_ALL_PLANS.md). The log is §6. The last step is 1.

Vocabulary:

- **The measurement**: `measureSlideOverflow(slide, deckConfig)` in [measure_slide_overflow.ts](client/src/components/products/copilot/slide_ai/measure_slide_overflow.ts): the page built by `buildSlidePage` (`convertSlideToPageInputs`, as the editor canvas and the rail cards build it), measured by `PageRenderer.measure` at `PAGE_WIDTH_DU` × `PAGE_HEIGHT_DU`. Its `overflow` is the value panther's page holder shows as the "Layout overflow" box ([page_holder.tsx:328-333](panther/_304_holders/page_holder.tsx#L328-L333)).
- **The optimizer's flag**: `result.best.score.overflow === 1` from `optimizePageLayout`, the score of the winning candidate layout.

## §1 The problem

`convertAiInputToSlide` returns the optimizer's flag as the slide's overflow ([convert_ai_input_to_slide.ts:121](client/src/components/products/copilot/slide_ai/convert_ai_input_to_slide.ts#L121)). `create_slide` and `replace_slide` pass it to `prepareSlideWriteResult` ([slides.tsx:157](client/src/components/products/copilot/ai_tools/tools/slides.tsx#L157), `:226`), and `show_draft_slide_to_user` passes it to `describeSlideOverflow` ([drafts.tsx:79](client/src/components/products/copilot/ai_tools/tools/drafts.tsx#L79)). Every other tool that reports overflow uses the measurement: `update_slide`, `update_figure`, `get_deck` and `get_slides` call `measureSlideOverflow`, and `get_slide_images` takes `overflow` from the `PageRenderer.measure` call it draws from (`renderSlideImage`).

The optimizer's flag is a score computed on the provisional page's items, not a measurement of the slide that is stored. The stored slide is rebuilt by `restoreBlocks` and passed through `slideConfigSchema.parse`, which applies defaults, and the canvas measures the page built from that slide. That the two agree is asserted only by comments: panther's `optimize_page_layout.ts` ("so score.overflow agrees with the measured page") and [convert_ai_input_to_slide.ts:31-35](client/src/components/products/copilot/slide_ai/convert_ai_input_to_slide.ts#L31-L35). No test checks it.

`update_slide` and `update_figure` each measure by hand before calling `prepareSlideWriteResult` ([update_slide.ts:87-92](client/src/components/products/copilot/ai_tools/tools/update_slide.ts#L87-L92), [update_figure.ts:227-230](client/src/components/products/copilot/ai_tools/tools/update_figure.ts#L227-L230)), the one function all four slide writes report through ([slide_write_result.ts:41-63](client/src/components/products/copilot/ai_tools/tools/slide_write_result.ts#L41-L63)). `convertAiInputToSlide` has a fourth caller, the draft preview card ([draft_slide_preview.tsx:169](client/src/components/products/copilot/ai_tools/tools/draft_slide_preview.tsx#L169)), which discards `overflow`, so measuring inside the conversion would make every draft card build and measure a page for nothing.

## §2 The model

Every overflow flag the model sees comes from `PageRenderer.measure` on a page built by `buildSlidePage`, and every sentence comes from `describeSlideOverflow`. The optimizer still chooses the layout; it no longer reports overflow. `convertAiInputToSlide` returns the slide alone. `prepareSlideWriteResult` measures every content slide a write is about to store, and `show_draft_slide_to_user` measures its draft.

## §3 Rulings

1. `convertAiInputToSlide` returns `Promise<Slide>`. It no longer reads `result.best.score.overflow`; the optimizer's score is used only to pick the layout. `prepareSlideWriteResult` takes `deckConfig` in place of `overflow` and measures the content slide itself. _(proposed)_
2. The extra page build and measurement per `create_slide`, `replace_slide` and `show_draft_slide_to_user` call is accepted. The draft preview card measures nothing. _(proposed)_
3. Panther's `optimize_page_layout.ts` comment is not changed by this plan: it describes the optimizer's own scoring, which stays true. _(proposed)_

## §4 Steps

### Step 1: measure where the overflow is reported

**Surface:**

- `client/src/components/products/copilot/slide_ai/convert_ai_input_to_slide.ts`
- `client/src/components/products/copilot/slide_ai/measure_slide_overflow.ts` (its comments only)
- `client/src/components/products/copilot/ai_tools/tools/slide_write_result.ts`
- `client/src/components/products/copilot/ai_tools/tools/slides.tsx`
- `client/src/components/products/copilot/ai_tools/tools/update_slide.ts`
- `client/src/components/products/copilot/ai_tools/tools/update_figure.ts`
- `client/src/components/products/copilot/ai_tools/tools/drafts.tsx`
- `client/src/components/products/copilot/ai_tools/tools/draft_slide_preview.tsx`
- `server/tests/copilot_look_sources_test.ts`
- `SYSTEM_13_ai_assistant.md`

**Deliverable:**

- Ruling 1. `convertAiInputToSlide` returns the parsed slide. Its doc comment keeps the sentence on feeding the optimizer through `convertSlideToPageInputs` and drops the sentence on `overflow`.
- `prepareSlideWriteResult(env, metrics, slide, deckConfig, builtFigureIds)`, after its non-content return, runs the measurement and the figure descriptions together: `const [overflow, figures] = await Promise.all([measureSlideOverflow(slide, deckConfig), Promise.all(...)])`.
- `create_slide` and `replace_slide` (`slides.tsx`), `update_slide` and `update_figure` pass `view.context.getDeckConfig()`. `update_slide` and `update_figure` drop their own measurement.
- `show_draft_slide_to_user` (`drafts.tsx`) calls `measureSlideOverflow(convertedSlide, deckConfig)` inside its `type === "content"` branch.
- `draft_slide_preview.tsx` takes the returned slide directly.
- The comment on `measureSlideOverflow` ([measure_slide_overflow.ts:30-32](client/src/components/products/copilot/slide_ai/measure_slide_overflow.ts#L30-L32)) no longer says "A tool that did not just run the page optimizer over the slide measures it here": it is the measurement every overflow report uses, the flag the deck's canvas badges.
- `copilot_look_sources_test.ts` has a case, "every overflow the model is told comes from the page measurement", asserting that `measureSlideOverflow` is called in `functionBody(slide_write_result.ts, "prepareSlideWriteResult")`, `drafts.tsx`, `get_deck_summary.ts` and `simplify_slide_for_ai.ts`, and that `render_slide_image.ts` calls `PageRenderer.measure`.
- SYSTEM_13:
  - The paragraph on page overflow replaces its sentences on the optimizer's flag and on `update_slide` and `update_figure` measuring with: the four slide writes are measured inside `prepareSlideWriteResult` (`measureSlideOverflow`), before the write, and `show_draft_slide_to_user` measures its draft the same way.
  - The `convert_ai_input_to_slide.ts` entry of the file map says the function returns the slide, and drops "the draft preview card ignores it".
  - The `measure_slide_overflow.ts` entry no longer says the measurement is "for a slide the optimizer did not just lay out".

**Not in this step:** any change to how the optimizer picks a layout; any change to panther.

**Gates:** `deno task test:files server/tests/copilot_look_sources_test.ts`.

**Ends with:** one commit, then the review cadence, then the close commit that deletes this file.

## §5 Out of scope

- The UI and the copilot running the measurement separately. Both call the same function on the same page and frame, and the copilot measures slides that are not on screen, so one shared run is not possible.

## §6 Log
