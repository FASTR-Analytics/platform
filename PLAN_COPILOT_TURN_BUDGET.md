# PLAN: Copilot turn budget

A copilot turn stops with "Stopped: too many tool calls in one turn" once the model has asked for tools in more than 24 replies, and a deck is where users reach it: one call reads one slide, a write's result leaves out what the model needs for its next call, so it reads the slide back, and the brief orders that read. This plan makes a deck's reads and writes take few rounds (one read for any number of slides, write results that state what the write left, a brief that stops ordering read-backs and says calls can share a reply), then raises panther's cap to 100 with a per-consumer override and gives the engine a separate stop for a turn whose calls keep failing.

**Next step: Do 1.**

Branch: `main` in both repos. Repos: this one (steps 1, 2, 3 and 5) and `timroberton-panther` (step 4). Read first: [CLAUDE.md](CLAUDE.md), [SYSTEMS.md](SYSTEMS.md), [SYSTEM_13_ai_assistant.md](SYSTEM_13_ai_assistant.md) "Tools, view gating, and approval", "The slide_ai conversion layer", "System prompt, documents, prompt library" and "The panther engine", [PROTOCOL_APP_AI_TOOLS.md](PROTOCOL_APP_AI_TOOLS.md), and for step 4 the panther repo's `CLAUDE.md` and `DOC_AI_CHAT.md` "Turn model" and "Verification". Start when: this tree is clean.

## §0 How to work this plan

The instruction is "Do the next step of PLAN_COPILOT_TURN_BUDGET.md." Branch, floor, conditional gates, reading order and the review cadence are [PROTOCOL_APP_PLANS.md](PROTOCOL_APP_PLANS.md) and [panther/protocols/PROTOCOL_ALL_PLANS.md](panther/protocols/PROTOCOL_ALL_PLANS.md). The log is §6. The last step is 5; its close commit deletes this file. Nothing in this plan ships (ruling 16).

Step 4 is worked in `/Users/timroberton/projects/panther/timroberton-panther` on its branch `main`, under that repo's `CLAUDE.md`. Its floor is the six commands of that file's "Commands". Its tree is shared with other panther plans: the agent confirms it is clean before it starts and stages only its own files.

Vocabulary, used throughout:

- **turn**: everything from one user message to the reply that calls no tool.
- **round**: one model reply that calls tools, with the results sent back. A reply may hold several calls, and they are one round. Panther's word is continuation.
- **the cap**: the number of rounds a turn may run, panther's `MAX_TURN_CONTINUATIONS`.
- **read-back**: a read whose only purpose is to learn what the model's own write just did.
- **write result**: the text a write tool returns to the model.
- **page fit**: whether a content slide's layout fits its page, the flag the deck canvas badges.
- **failed round**: a round in which every tool result is an error.
- **the brief**: the deck view's instructions, `getEditingSlideDeckInstructions`.

Rules peculiar to this plan:

- Tool descriptions, write results and the brief are text for the model: English, never `t3`.
- No gate asks a model anything. Every gate is a typecheck, a lint or a test that pins text or pure logic. What a model does with the new text is seen in use.
- Every line number here was read from the code on 2026-11-12; where the code has moved, the code wins.

## §1 The problem

- **The cap counts replies, and it is one number for every turn.** `MAX_TURN_CONTINUATIONS = 24` ([\_create_ai_chat.ts:93](panther/_305_ai/_components/_create_ai_chat.ts#L93)) is a module constant, and `classifyTurnContinuation` ends the turn when a reply at that depth asks for tools ([turn_logic.ts:491-502](panther/_110_ai_types/turn_logic.ts#L491-L502)). The calls of one reply run in order inside one round ([\_create_ai_chat.ts:1548](panther/_305_ai/_components/_create_ai_chat.ts#L1548)), so the cap counts rounds, never calls.
- **A deck needs more rounds than the cap as the tools stand.** A deck in production use (sierraleone, "Round 1 report", read 2026-11-12) has 47 slides and 30 figures. Reading it is 47 rounds, because `get_slide` takes one id ([get_slide.ts:18-22](client/src/components/products/copilot/ai_tools/tools/get_slide.ts#L18-L22)). Building it is at least 47, one `create_slide` per reply.
- **Write results leave out what the next call needs, so the model reads the slide back.**
  - `create_slide` returns the slide id and title ([slides.tsx:174-180](client/src/components/products/copilot/ai_tools/tools/slides.tsx#L174-L180)). The block ids were minted before the write ([convert_ai_input_to_slide.ts:84-89](client/src/components/products/copilot/slide_ai/convert_ai_input_to_slide.ts#L84-L89)) and are not in it, nor is the layout the optimizer chose.
  - `replace_slide` mints every block id again through the same conversion, so every id the model held is dead, and returns none ([slides.tsx:228-234](client/src/components/products/copilot/ai_tools/tools/slides.tsx#L228-L234)).
  - `update_slide` with `layoutChange` mints ids for its new blocks ([update_slide.ts:249-252](client/src/components/products/copilot/ai_tools/tools/update_slide.ts#L249-L252)) and names only the blocks it removed ([update_slide.ts:117-124](client/src/components/products/copilot/ai_tools/tools/update_slide.ts#L117-L124)).
  - `update_figure` reports `<field>: applied` or `no change` per field ([describe_figure_config_patch_effect.ts:76-78](client/src/generate_visualization/describe_figure_config_patch_effect.ts#L76-L78), [update_figure.ts:223-226](client/src/components/products/copilot/ai_tools/tools/update_figure.ts#L223-L226)) and never the config that resulted. `update_report_figure` ([report_editor.ts:665](client/src/components/products/copilot/ai_tools/tools/report_editor.ts#L665)) and `update_figure_editor` ([figure_editor.ts:193](client/src/components/products/copilot/ai_tools/tools/figure_editor.ts#L193)) return the same report.
  - A figure built from a preset has a config the model never saw (the preset's disaggregations, display slots, replicant and its values), so its first `update_figure` needs a read first.
  - So creating a content slide and then changing its figure is four rounds: `create_slide`, `get_slide` for the block id and config, `update_figure`, `get_slide` to confirm.
- **Page fit is reported by two writes and no read.** `create_slide` and `replace_slide` append the overflow sentence ([slides.tsx:50-66](client/src/components/products/copilot/ai_tools/tools/slides.tsx#L50-L66)), which sends the model to `update_figure`. `update_figure` and `update_slide` say nothing about the page, and `SimplifiedSlide` has no field for it ([extract_blocks_from_layout.ts:42-57](client/src/components/products/copilot/slide_ai/extract_blocks_from_layout.ts#L42-L57)), so the model cannot learn whether its fix worked, or which slides of an existing deck overflow.
- **The brief orders the read and is silent on sharing a reply.** "Call get_slide before changing any slide" ([build_system_prompt.ts:302](client/src/components/instance/copilot/build_system_prompt.ts#L302)), "Always call this before changing a slide" ([get_slide.ts:17](client/src/components/products/copilot/ai_tools/tools/get_slide.ts#L17)) and "Call get_slide first" in `update_slide`'s description. The chat's own core principles hold one entry, "Ask when uncertain" ([build_system_prompt.ts:55-57](client/src/components/instance/copilot/build_system_prompt.ts#L55-L57)): nothing tells the model that calls which do not depend on each other can share a reply.
- **Nothing pins the brief.** It lives in a client file that imports `~/` modules, which a Deno test cannot load, while the report's brief lives in `lib/ai_tools/build_system_prompt.ts` and `server/tests/copilot_prompt_test.ts` pins it.
- **The cap cannot tell a long turn from a stuck one.** A 47-slide build and a model retrying a refused call get the same 24. SYSTEM_13 records the second: a draft refused for its pages was retried until the rounds ran out, and the remedy was a rule in that one tool (`DRAFT_PAGE_REFUSALS`).
- **At the cap the user is told nothing they can act on.** The reply's calls are answered as cancelled ([\_create_ai_chat.ts:1500-1525](panther/_305_ai/_components/_create_ai_chat.ts#L1500-L1525)) and the notice is one muted line with its details behind a chevron ([system_notice.tsx](panther/_305_ai/_components/_renderers/system_notice.tsx)). Neither says that a new message carries on.

## §2 The model

**One read, any number of slides.** `get_slides({ slideIds })` returns the slides in the order asked, each as `get_slide` printed one, with its id and, on a content slide, its page fit. Reading a whole deck is one round.

**A write's result states what the write left.** Whatever a write decided that the model did not send comes back in its result, so no read-back is needed:

```text
Created slide x7m: "Vaccine availability".
Blocks: a1b (text), c3d (figure)
Layout: Row 1: a1b (span=5) | c3d (span=7)
Page: the layout fits the page.
Figure c3d:
<the figure's config, as get_slides prints it>
```

Every write to a content slide (`create_slide`, `replace_slide`, `update_slide`, `update_figure`) ends that way: the blocks by id and type, the layout, the page fit, and the config of each figure the write built or changed. The three figure patch tools (`update_figure`, `update_report_figure`, `update_figure_editor`) return their per-field report and then the config that resulted. No write result tells the model to call a read.

**The brief asks for one read per slide per turn.** Before its first change to a slide after a user message the model reads it. From then until the user's next message, the result of its own write is the slide's state. The chat's core principles say that calls which do not depend on each other go in one reply.

**The contract is stated once.** PROTOCOL_APP_AI_TOOLS.md gains "The round budget": a read that can be asked for many takes an array, a write result states what the write left, and no result invites a read-back. SYSTEM_13 points at it.

**The cap is 100, a consumer can override it, and a stuck turn stops by itself.** Panther's default cap is 100 and `AIChatConfig.maxTurnContinuations` overrides it. Separately, a turn whose last six rounds all failed ends with its own notice. Both notices say a new message carries on. The app takes the default.

With the app half done: reading the 47-slide deck is one round, and creating a content slide then changing its figure is two.

## §3 Rulings

1. **`get_slides` replaces `get_slide`.** One tool, one input, `slideIds`, matching `delete_slides`, `duplicate_slides` and `move_slides`. No single-id form is kept beside it: a second way to ask is a second thing to describe. A stored conversation needs nothing: a renamed tool is a rename and nothing else (SYSTEM_13 principle 2). _(proposed)_
2. **`slideIds` is an inclusion list.** `.min(1)`. An id that is not in the deck refuses the whole call before anything is read, naming the ids. An id given twice is read once. No cap on the count: the model asks for what the request needs, and the same slides read one at a time carry the same text. _(proposed)_
3. **Every slide is read through `readSlideTarget`, all at once.** The open slide from its draft, any other as stored, one request per stored slide, run concurrently. The routing rule stays in one place and the read is what a write would see. _(proposed)_
4. **No batch create tool.** Several slides in one round come from several `create_slide` calls in one reply (ruling 10): each call has its own result, so one slide's refused figure costs that slide alone, and nothing is rolled back. _(proposed)_
5. **A write to a content slide returns the blocks, the layout, the page fit and the built figures' configs**, in that order, after the sentence saying what was done, composed by one function for the four slide writes so they cannot drift. Block text is never echoed: the model sent it. A figure's data is never echoed: the model read it with `get_metric_data` before building, as the brief requires. Cover and section results stay as they are. _(proposed)_
6. **The three figure patch tools return the config that resulted**, through `formatFigureConfigForAI`, the formatter `get_slide`, `get_report_figure` and `get_figure_editor` already print a figure with, after the per-field report. _(proposed)_
7. **Page fit is stated by every write to a content slide and by every read of one.** A fit is said as plainly as an overflow, so a model that just applied a fix is not left to read silence. `create_slide` and `replace_slide` keep the optimizer's flag, which is scored in the box the renderer gives the layout ([optimize_page_layout.ts:32-34](panther/_121_page/optimize_page_layout.ts#L32-L34)). The other writes and the read measure the page as the canvas does, `PageRenderer.measure` over `convertSlideToPageInputs`, before anything is written. _(proposed)_
8. **The four structure writes stop inviting `get_deck`.** `create_slide`, `duplicate_slides`, `move_slides` and `delete_slides` end at what they did. _(proposed)_
9. **One read per slide per turn.** The brief says: read a slide with `get_slides` before the first change to it after a user message, every slide needed in one call; until the user's next message the result of your own write to it is its state; never read a slide to confirm a write or to learn its block ids. The read at the start of each turn is kept because the echo marks drop a collaborator's edit to a slide made within 30 s of the AI's own write to it (SYSTEM_13 "Interactions and echo suppression"). The tool descriptions say what each tool does and leave the rule to the brief. _(proposed)_
10. **Calls that do not depend on each other go in one reply.** A chat-only core principle beside "Ask when uncertain": such calls share a reply, they run in order, each returns its own result, and a call that needs another's result (a new slide's id, a block id) waits for it. It stays out of the shared base, since `/mcp`'s clients run their own loop. _(proposed)_
11. **The brief and the chat's core principles live in `lib/ai_tools/build_system_prompt.ts`**, beside the report's brief, so `server/tests/copilot_prompt_test.ts` pins them. _(proposed)_
12. **Panther: the cap's default is 100, and `AIChatConfig.maxTurnContinuations` overrides it.** Optional, a positive integer, one counter for tool rounds and `pause_turn` resumes as today. Ruled.
13. **Panther: six failed rounds in a row end the turn.** The streak resets on any result that is not an error. The turn ends as the cap ends it, every pending call answered, with notice type `turn_stalled`. The number is the engine's, a constant, twice what the app's one tool-level rule allows (three refusals). With the cap at 100, it is what bounds the one runaway on record. _(proposed)_
14. **Panther: both notices say what the user can do.** The details of `turn_limit` and `turn_stalled` end by saying that a new message carries on. No button and no engine text to the model: the answered calls already tell the model why they did not run. _(proposed)_
15. **The app passes no cap.** It takes panther's default, as it takes panther's model defaults. _(proposed)_
16. **Nothing ships in this plan.** The app's next release carries it.

## §4 Steps

### Step 1: `get_slides` (this repo)

**Surface.** `client/src/components/products/copilot/ai_tools/tools/get_slide.ts` (renamed `get_slides.ts`), `tools/mod.ts`, `tools/slides.tsx`, `tools/update_slide.ts`, `tools/update_figure.ts`, `tools/slide_target.ts`, `client/src/components/products/copilot/slide_ai/get_slide_with_updated_blocks.ts`, `client/src/components/instance/copilot/interactions.ts`, `client/src/components/instance/copilot/build_system_prompt.ts`, `lib/ai_tools/copilot_catalogue.ts`, `lib/types/ai_input.ts`, `server/tests/copilot_catalogue_test.ts`, `SYSTEM_13_ai_assistant.md`, `SYSTEM_12_documents_sharing.md`, `TESTING_SCRIPT_FOR_AI_COPILOT.md`.

**Deliverable.**

- The deck's read tool is `get_slides`, input `{ slideIds: z.array(z.string()).min(1) }`, as rulings 1 to 3 state. Its result is an array in the order asked, each entry the slide's id beside what `simplifySlideForAI` returns for it.
- An id outside `view.context.getSlideIds()` throws `AIToolFailure` naming every such id before any read, in the words `delete_slides` uses.
- Its description says to ask for every slide needed in one call.
- The catalogue (`COPILOT_TOOL_VIEWS`, `COPILOT_TOOL_REQUIREMENTS`) and its test name `get_slides`. No tool is named `get_slide`.
- Every string the model reads names `get_slides`: the descriptions and failure messages of the slide tools, the `LayoutCellSchema` description, the `edited_slide_locally` line and the brief.
- SYSTEM_13's prose and TESTING_SCRIPT_FOR_AI_COPILOT.md name the tool as it is and say that it takes several ids.

**Not in this step.** What a write returns. The brief's rule about when to read (only the tool's name changes here). Page fit in the read.

**Gates.** `deno task test:files server/tests/copilot_catalogue_test.ts`. `git grep -nw get_slide -- . ':!panther' ':!CHANGELOG_AUTO.txt' ':!PLAN_*.md'` prints nothing.

**Ends with.** One commit.

### Step 2: a write's result states what the write left (this repo)

**Surface.** In `client/src/components/products/copilot/slide_ai/`: `layout_structure.ts` (new), `measure_slide_overflow.ts` (new), `layout_spec_helpers.ts`, `extract_blocks_from_layout.ts`, `mod.ts`. In `client/src/components/products/copilot/ai_tools/tools/`: `slide_write_result.ts` (new), `slides.tsx`, `update_slide.ts`, `update_figure.ts`, `get_slides.ts`, `figure_editor.ts`, `report_editor.ts`. `server/tests/slide_layout_structure_test.ts` (new). `PROTOCOL_APP_AI_TOOLS.md`, `SYSTEM_13_ai_assistant.md`, `TESTING_SCRIPT_FOR_AI_COPILOT.md`.

**Deliverable.**

- `layout_structure.ts` holds the read-only half of the layout helpers: `extractBlocksFromLayout`, `layoutNodeToStructure` with its types and private helpers, moved from where they are, and a new pure `describeSlideBlocks(layout)` returning the `Blocks:` and `Layout:` lines of §2. It imports nothing but `lib`, typing a layout as `ContentSlide["layout"]`, because a Deno test cannot resolve the client's `panther` specifier. `server/tests/slide_layout_structure_test.ts` pins the two lines for a two-row layout and for a layout `layoutNodeToStructure` cannot express as rows, and SYSTEM_13's manifest claims the test.
- `measureSlideOverflow(slide, deckConfig)` returns the measured page's `overflow` for a content slide: fonts loaded and the page built as `convertAiInputToSlide` builds its provisional page, then `PageRenderer.measure` at the canonical frame.
- `slide_write_result.ts` composes the result of a write to a content slide as ruling 5 orders it. The overflow sentence and its figure-block advice move here from `slides.tsx`, and a fit is stated too. Each built or changed figure follows under its block id, formatted by `formatFigureConfigForAI` on the metric and config `readFigureMetricForAI` gives its bundle.
- `create_slide` and `replace_slide` (content) return it with every figure block as built and the optimizer's flag. `update_slide` on a content slide returns it with the figures its `blockUpdates` or `layoutChange` built, keeps its removed-blocks sentence, and takes the env it now needs. `update_figure` returns its per-field report, then it with the figure it changed. Both measure page fit on the slide they are about to write, before `writeSlideTarget`.
- `get_slides` gives each content slide `overflow`, measured the same way, and its description says so.
- `update_report_figure` and `update_figure_editor` return their per-field report and then the config that resulted, formatted as `get_report_figure` and `get_figure_editor` format it.
- The results of `create_slide`, `duplicate_slides`, `move_slides` and `delete_slides` no longer end by naming `get_deck`.
- The descriptions of `update_slide` and `update_figure` say a block id comes from `get_slides` or from the result of the write that made the block.
- PROTOCOL_APP_AI_TOOLS.md has the section "The round budget", the one statement of the contract in §2, naming `get_slides` and the slide writes as the reference implementations. SYSTEM_13's slide-tools paragraph describes the results as built and points at it. Its sentence calling the overflow flag "sound and incomplete" goes: the optimizer scores in the renderer's box, and no Open item holds what the sentence cites.
- SYSTEM_13's Open items gain one line: `duplicate_slides` returns the new ids without saying which slide each copies, and the copies keep their originals' block ids, which the result does not say. The pairing is the server's to return (`duplicateSlides` orders by `sort_order`, not by the ids as given).
- TESTING_SCRIPT_FOR_AI_COPILOT.md's ground truths describe the results as built.

**Not in this step.** The brief. A figure's data in a write result. Page fit for cover and section slides. Any change to what `get_report_figure`, `get_figure_editor` or `get_deck` return.

**Gates.** `deno task test:files server/tests/slide_layout_structure_test.ts`.

**Ends with.** Several commits, each green: the layout file and its test; page fit in the read and the writes; the write results and the protocol section.

### Step 3: the brief (this repo)

**Surface.** `lib/ai_tools/build_system_prompt.ts`, `client/src/components/instance/copilot/build_system_prompt.ts`, `client/src/components/instance/copilot/ai_views.ts`, `client/src/components/products/copilot/ai_tools/tools/get_slides.ts`, `tools/update_slide.ts`, `server/tests/copilot_prompt_test.ts`, `SYSTEM_13_ai_assistant.md`, `TESTING_SCRIPT_FOR_AI_COPILOT.md`.

**Deliverable.**

- `getEditingSlideDeckInstructions` is defined in `lib/ai_tools/build_system_prompt.ts` beside `getEditingReportInstructions`, and the client file no longer defines it.
- Its workflow states ruling 9 in place of "Call get_slide before changing any slide", and says what a write result carries (the block ids, the layout, the page fit, the built figures' configs).
- `get_slides`' description no longer says "Always call this before changing a slide", and `update_slide`'s no longer says "Call get_slide first": the brief holds the rule.
- The chat's core principles are one exported list in `lib/ai_tools/build_system_prompt.ts`, holding "Ask when uncertain" and the principle of ruling 10, which `buildSystemPromptForContext` passes as `extraCorePrinciples`. `/mcp` still passes none.
- `server/tests/copilot_prompt_test.ts` pins: the brief names `get_slides` and its three clauses of ruling 9; the chat's principles carry ruling 10's; a prompt built with no extra principles does not.
- SYSTEM_13 says where the brief lives and what it rules, and its echo-suppression sentence reads that the model reads a slide before its first change to it in a turn.
- TESTING_SCRIPT_FOR_AI_COPILOT.md's deck cases expect no read-back after a write.

**Not in this step.** Any other view's instructions. The shared base instructions.

**Gates.** `deno task test:files server/tests/copilot_prompt_test.ts`.

**Ends with.** One commit.

### Step 4: the cap is 100 with an override, and a stuck turn stops (repo: timroberton-panther)

**Surface.** `modules/_305_ai/_core/types.ts`, `modules/_305_ai/_core/validate_config.ts`, `modules/_305_ai/_components/_create_ai_chat.ts`, `modules/_110_ai_types/turn_logic.ts`, `tests/ai_turn_logic_test.ts`, `tests_ai/caps_test.ts`, `tests_ai/config_test.ts`, `DOC_AI_CHAT.md`, `protocols/PROTOCOL_UI_AI_CHAT.md`, and a `deps.ts` or `mod.ts` only where `clean.ts` rewrites one.

**Deliverable.**

- `MAX_TURN_CONTINUATIONS` is 100 and is the default of `AIChatConfig.maxTurnContinuations`, as ruling 12 states. A value that is not a positive integer throws at construction and in `validateAIChatConfig`.
- The turn loop keeps the count of consecutive failed rounds and hands it to `classifyTurnContinuation`, which stays pure. A reply that asks for tools when the count has reached six ends the turn as `cap-tools` does: every pending call answered with a stopped result that names the reason, and a `turn_stalled` notice. `SystemNoticeType` gains `turn_stalled`.
- The details of `turn_limit` (both its forms) and of `turn_stalled` end by saying that a new message carries on.
- `tests/ai_turn_logic_test.ts` pins the classifier: the cap at a configured depth, the stall at six, no stall at five, and the cap winning when both hold.
- `tests_ai/caps_test.ts` adds scenarios: a configured cap ends the tool loop at that count; six failed rounds end the turn with every call answered and the next send accepted; a success in the middle resets the streak. Its existing cap scenarios run on the default of 100. `tests_ai/config_test.ts` pins the throw.
- DOC_AI_CHAT.md's "Turn model" states the default of 100, the option, the stall and both notices, and PROTOCOL_UI_AI_CHAT.md names the option where it lists what a consumer configures.

**Not in this step.** `callAI`'s own request cap (`MAX_TOOL_RUNNER_REQUESTS`). A Continue button. Any text from the engine to the model.

**Gates.** The six commands of panther's CLAUDE.md "Commands".

**Ends with.** One commit in panther. The **Next step** line moves in a commit in this repo.

### Step 5: sync (this repo)

Starts when `./sync --check wb-fastr`, run in the panther repo, reports nothing that would refuse the sync.

**Surface.** `panther/**` as the sync writes it, `SYSTEM_13_ai_assistant.md`, this file.

**Deliverable.**

- One commit holding the sync and nothing else, made after `./sync wb-fastr` and a green floor. The sync copies panther's whole working tree. If the floor fails for a reason that is not this plan's, the agent restores `panther/` to `HEAD`, commits nothing and reports the gate's output.
- SYSTEM_13's "The panther engine" states the cap (panther's default of 100, which the app takes), the stall stop and what the two notices tell the user.
- The close commit deletes this file.

**Not in this step.** A cap of the app's own. A renderer of its own for either notice: panther's card shows both.

**Gates.** After the sync, `rg -q maxTurnContinuations panther/_305_ai/_core/types.ts`. At the close, `deno task test`.

**Ends with.** Two commits (the sync; the SYSTEM_13 prose), then the close.

## §5 Out of scope

- **What the copilot cannot reach in a deck.** Figure style (`config.s`: conditional formatting, value order), the chart type of a figure on a slide, image blocks, slide-level style and deck settings (logos, footer, split), and a rendered image of a slide for the model to look at. SYSTEM_13's Open items hold the first four under "Surface gaps". They are one plan of their own.
- **Product features that are not the copilot's.** A gauge or donut figure type, significance testing in the HFA module, and diagram blocks.
- **`get_metric_data` for several metrics in one call.** Ruling 10 covers it with several calls in one reply.
- **A cap on what one `get_slides` call returns**, and trimming a figure's data in the read.
- **Panther: a Continue button, and an engine line asking the model to wrap up.**

## §6 Log
