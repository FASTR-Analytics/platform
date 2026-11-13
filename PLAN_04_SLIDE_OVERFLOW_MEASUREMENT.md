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

`convertAiInputToSlide` returns the optimizer's flag as the slide's overflow ([convert_ai_input_to_slide.ts:121](client/src/components/products/copilot/slide_ai/convert_ai_input_to_slide.ts#L121)). `create_slide`, `replace_slide` and `show_draft_slide_to_user` pass it to `describeSlideOverflow`. Every other tool that reports overflow uses the measurement: `update_slide`, `update_figure`, `get_deck` and `get_slides` call `measureSlideOverflow`, and `get_slide_images` takes `overflow` from the `PageRenderer.measure` call it draws from (`renderSlideImage`).

The optimizer's flag is a score computed on the provisional page's items, not a measurement of the slide that is stored. The stored slide is rebuilt by `restoreBlocks` and passed through `slideConfigSchema.parse`, which applies defaults, and the canvas measures the page built from that slide. That the two agree is asserted only by comments: panther's `optimize_page_layout.ts` ("so score.overflow agrees with the measured page") and [convert_ai_input_to_slide.ts:31-35](client/src/components/products/copilot/slide_ai/convert_ai_input_to_slide.ts#L31-L35). No test checks it.

## §2 The model

Every overflow flag the model sees comes from `PageRenderer.measure` on a page built by `buildSlidePage`, and every sentence comes from `describeSlideOverflow`. The optimizer still chooses the layout; it no longer reports overflow. `convertAiInputToSlide` measures the slide it returns with `measureSlideOverflow` and returns that as `overflow`.

## §3 Rulings

1. `convertAiInputToSlide` returns `overflow` from `measureSlideOverflow` on the final parsed content slide. The optimizer's score is used only to pick the layout. _(proposed)_
2. The extra page build and measurement per `create_slide`, `replace_slide` and draft is accepted. _(proposed)_
3. Panther's `optimize_page_layout.ts` comment is not changed by this plan: it describes the optimizer's own scoring, which stays true. _(proposed)_

## §4 Steps

### Step 1: measure the converted slide

**Surface:**

- `client/src/components/products/copilot/slide_ai/convert_ai_input_to_slide.ts`
- `client/src/components/products/copilot/slide_ai/measure_slide_overflow.ts` (its comments only)
- `server/tests/copilot_look_sources_test.ts`
- `SYSTEM_13_ai_assistant.md`

**Deliverable:**

- `convertAiInputToSlide`, for a content slide, parses the final slide once, then returns `{ slide, overflow: await measureSlideOverflow(slide, deckConfig) }`. `result.best.score.overflow` is no longer read. Cover and section slides still return `overflow: false`.
- The doc comment on `convertAiInputToSlide` says `overflow` is the measurement of the returned slide, the one the deck's canvas badges, which every caller reports to the model. It no longer says the optimizer's flag is that value.
- `copilot_look_sources_test.ts` has a case asserting that `convert_ai_input_to_slide.ts` calls `measureSlideOverflow`, so the overflow the three tools report cannot drift back to the optimizer's score unnoticed.
- SYSTEM_13:
  - The paragraph on page overflow says `create_slide`, `replace_slide` and `show_draft_slide_to_user` report the measurement of the slide `convertAiInputToSlide` returns, not the optimizer's flag.
  - The `convert_ai_input_to_slide.ts` entry of the file map says `overflow` is that measurement.
  - The `measure_slide_overflow.ts` entry no longer says the measurement is "for a slide the optimizer did not just lay out".
- The comment on `measureSlideOverflow` ([measure_slide_overflow.ts:30-32](client/src/components/products/copilot/slide_ai/measure_slide_overflow.ts#L30-L32)) no longer says "A tool that did not just run the page optimizer over the slide measures it here": every tool measures there.

**Not in this step:** any change to how the optimizer picks a layout; any change to panther.

**Gates:** `deno task test:files server/tests/copilot_look_sources_test.ts server/tests/copilot_prompt_test.ts`.

**Ends with:** one commit, then the review cadence, then the close commit that deletes this file.

## §5 Out of scope

- The UI and the copilot running the measurement separately. Both call the same function on the same page and frame, and the copilot measures slides that are not on screen, so one shared run is not possible.

## §6 Log
