# PLAN: Copilot tool limit

Status: steps 1 to 5 are DONE. Step 6, the last, can start: the sync that brought panther's figure renames to this app (the panther repo's `TERMINOLOGY.md` step 3) brought the cap with it.

A copilot turn stopped with "Stopped: too many tool calls in one turn" once the model had asked for tools in more than 24 replies, and a deck was where users reached it. This plan made a deck's reads and writes take few rounds (one read for any number of slides, write results that state what the write left, a brief that stops ordering read-backs and says calls can share a reply), and raised panther's cap to 100 with a per-consumer override. The app's own half is built and in use. The cap of 100 is in this app's copy of panther; SYSTEM_13 still states 24.

**Next step: Do 6.**

Branch: `main`. Repo: this one. Read first: [CLAUDE.md](CLAUDE.md), [SYSTEMS.md](SYSTEMS.md), [SYSTEM_13_ai_assistant.md](SYSTEM_13_ai_assistant.md) "The panther engine". Start when: this tree is clean. Step 6 also needs `rg -q maxTurnContinuations panther/_305_ai/_core/types.ts` to exit 0 in this repo.

## Where the plan stands

### Done

Each step was built, reviewed by an independent agent, fixed and re-reviewed. The commits of a step have the subject `PLAN_COPILOT_TOOL_LIMIT step N`.

- **Step 1, `get_slides` (this repo).** `get_slides({ slideIds })` replaces `get_slide`: any number of slides in one call, in the order asked, each with its id. An id outside the deck refuses the whole call. Commits `14cf22939`, `32a6d4771`, close `afc697a4b`.
- **Step 2, a write's result states what the write left (this repo).** The four slide writes return the blocks by id and type, the layout, the page fit and the config of each figure the write built or changed. `get_slides` gives each content slide `overflow`. `update_report_figure` and `update_figure_editor` return the config that resulted. The four structure writes no longer name `get_deck`. PROTOCOL_APP_AI_TOOLS.md states the contract as "The round budget". Commits `7e7b22b96`, `bc80c54e3`, `05c797549`, `a7005e66c`, close `978a1d063`.
- **Step 3, the brief (this repo).** The deck brief asks for one read per slide per turn and takes a write's result as the slide's state. The chat's core principles put calls that do not depend on each other in one reply. Both live in `lib/ai_tools/build_system_prompt.ts`, pinned by `server/tests/copilot_prompt_test.ts`. Commits `3298b1870`, `32c8f83ec`, close `72f2a8c7a`.
- **Step 4, the cap is 100 with an override (panther repo).** Panther's default cap is 100 and `AIChatConfig.maxTurnContinuations` overrides it: a positive integer, and construction and `validateAIChatConfig` throw on anything else. Both `turn_limit` notices end "Send a new message to carry on.". Panther commits `37d58ea4`, `4577a951`; close in this repo `e5bd4782c`.
- **Step 5, the review fixes and defects (this repo).** `extract_blocks_from_layout.ts` is `simplify_slide_for_ai.ts`; `buildSlidePage` builds the page for `measureSlideOverflow` and `convertAiInputToSlide`; the three text fixes (`get_deck`, `LayoutCellSchema`, the report brief), pinned by `server/tests/copilot_prompt_test.ts`; a figure edit on the open slide is set into the draft by path and so saved; the testing script holds no tool count. Commits `3e5ab4f31`, `5968cc04e`, `e16655786`, `515064a14`.

What steps 1 to 3 built is described in the standing docs: SYSTEM_13 "Tools, view gating, and approval", "The slide_ai conversion layer" and "System prompt, documents, prompt library", and PROTOCOL_APP_AI_TOOLS.md "The round budget". What step 4 built is described in the panther repo's `DOC_AI_CHAT.md` "Turn model" and `protocols/PROTOCOL_UI_AI_CHAT.md` "Surface setup".

### Remaining

- **Step 6 (§4):** SYSTEM_13's "The panther engine" states the cap this app's copy of panther holds, and the close commit deletes this file.

## §0 How to work this plan

The instruction is "Do the next step of PLAN_COPILOT_TOOL_LIMIT.md." Branch, floor, conditional gates, reading order and the review cadence are [PROTOCOL_APP_PLANS.md](PROTOCOL_APP_PLANS.md) and [panther/protocols/PROTOCOL_ALL_PLANS.md](panther/protocols/PROTOCOL_ALL_PLANS.md). The log is §6. The last step is 6; its close commit deletes this file. Nothing in this plan ships (ruling 15).

Vocabulary:

- **turn**: everything from one user message to the reply that calls no tool.
- **round**: one model reply that calls tools, with the results sent back. A reply may hold several calls, and they are one round. Panther's word is continuation.
- **the cap**: the number of rounds a turn may run, panther's `MAX_TURN_CONTINUATIONS`.

## §1 The problem

- **SYSTEM_13 "The panther engine" states the cap as 24.** This app's copy of panther caps a turn at 100 (`MAX_TURN_CONTINUATIONS` in `panther/_305_ai/_core/validate_config.ts`), overridable by `AIChatConfig.maxTurnContinuations`.

## §2 The model

**The cap is 100 and a consumer can override it.** Panther's default cap is 100 and `AIChatConfig.maxTurnContinuations` overrides it. The notice at the cap says a new message carries on. The app takes the default.

## §3 Rulings

Rulings 1 to 11 are built (steps 1 to 3), 12 and 13 in step 4, 16 to 23 in step 5, and the standing docs describe them. Rulings 14 and 15 rest on step 6.

12. **Panther: the cap's default is 100, and `AIChatConfig.maxTurnContinuations` overrides it.** Optional, a positive integer, one counter for tool rounds and `pause_turn` resumes. Ruled, and built in step 4.
13. **Panther: the cap's notice says what the user can do.** The details of `turn_limit`, in both its forms, end by saying that a new message carries on. No button and no engine text to the model: the answered calls already tell the model why they did not run. Built in step 4.
14. **The app passes no cap.** It takes panther's default, as it takes panther's model defaults.
15. **Nothing ships in this plan.** The app's next release carries it.
16. **`extract_blocks_from_layout.ts` becomes `simplify_slide_for_ai.ts`.** It no longer holds the function it is named for.
17. **One function builds the page for both measurements.** `measureSlideOverflow` and `convertAiInputToSlide` share it (load the deck's fonts, `convertSlideToPageInputs(slide, undefined, deckConfig)`, throw on failure, return the `PageInputs`), so the `Page:` line of a write and `get_slides`' `overflow` cannot disagree.
18. **`get_deck`'s description loses "ALWAYS call this tool first when starting a conversation or before making any changes…".** The brief holds "Call get_deck FIRST".
19. **`LayoutCellSchema`'s block id description names both sources:** "Existing block ID (from get_slides or from the result of the write that made the block) to keep unchanged".
20. **The report's starting brief no longer names the turn cap.** "24, " goes from the parenthesis; the number is panther's.
21. **A figure edit on the open slide is saved.** `writeSlideTarget`'s open branch, after the reconcile, sets by path the bundle of each figure block the tool built, so the collab push sees a fresh object and not the one it last synced.
22. **The testing script holds no tool count.** Both hard-coded counts (44 and 45) go; H8 already checks the tools array is unchanged between requests.
23. **The two stray `deno run … main.ts` processes (58701, 91817) are killed.** Not part of the code; done in step 5's work.

## §4 Steps

### Step 5: the review fixes and defects (this repo)

**Surface.** `client/src/components/products/copilot/slide_ai/` (`extract_blocks_from_layout.ts` renamed, `mod.ts`, `measure_slide_overflow.ts`, `convert_ai_input_to_slide.ts`), `client/src/components/products/copilot/ai_tools/tools/` (`slides.tsx`, `slide_target.ts`), `lib/types/ai_input.ts`, `lib/ai_tools/build_system_prompt.ts`, `server/tests/copilot_prompt_test.ts`, `TESTING_SCRIPT_FOR_AI_COPILOT.md`, `SYSTEM_13_ai_assistant.md`, this file.

**Deliverable.** Rulings 16 to 22 in the code and docs. SYSTEM_13's Open items lose the eight entries these rulings resolve, and the slide_ai paragraph names the renamed file. A test pins what a test can: the brief no longer holds "24, ".

**Not in this step.** The sync and the cap prose (step 6).

**Gates.** `deno task test:files server/tests/copilot_prompt_test.ts server/tests/slide_layout_structure_test.ts`. `git grep -n extract_blocks_from_layout -- . ':!panther' ':!CHANGELOG_AUTO.txt' ':!PLAN_*.md'` prints nothing. The defect of ruling 21 is shown fixed by running `update_figure` on the open slide in the dev app and reading the stored slide.

**Ends with.** Several commits, each green: the rename and the shared page builder; the three text fixes; the figure-edit defect; the testing script and the docs.

### Step 6: the app's docs state the cap (this repo)

Starts when `rg -q maxTurnContinuations panther/_305_ai/_core/types.ts` exits 0 in this repo, which means a sync of panther made after 2026-11-12 has landed here and its floor was green.

**Surface.** `SYSTEM_13_ai_assistant.md`, this file.

**Deliverable.**

- SYSTEM_13's "The panther engine" states the cap (panther's default of 100, which the app takes, and the `maxTurnContinuations` option it does not set) and what its notice tells the user.
- The close commit deletes this file.

**Not in this step.** The sync: it is `TERMINOLOGY.md` step 3's, in the panther repo. A cap of the app's own. A renderer of its own for the notice: panther's card shows it.

**Gates.** `rg -q maxTurnContinuations panther/_305_ai/_core/types.ts` and `rg -q "MAX_TURN_CONTINUATIONS = 100" panther/_305_ai/_core/validate_config.ts`. At the close, `deno task test`.

**Ends with.** One commit (the SYSTEM_13 prose), then the close.

## §5 Out of scope

- **What the copilot cannot reach in a deck.** Figure style (`config.s`: conditional formatting, value order), the chart type of a figure on a slide, image blocks, slide-level style and deck settings (logos, footer, split), and a rendered image of a slide for the model to look at. SYSTEM_13's Open items hold the first four under "Surface gaps". They are one plan of their own.
- **Product features that are not the copilot's.** A gauge or donut figure type, significance testing in the HFA module, and diagram blocks.
- **`get_metric_data` for several metrics in one call.** The chat's "one reply" principle covers it with several calls in one reply.
- **A cap on what one `get_slides` call returns**, and trimming a figure's data in the read.
- **Panther: a stop for a turn whose rounds keep failing, a Continue button, and an engine line asking the model to wrap up.**

## §6 Log

- Step 2 edited `client/src/components/products/copilot/slide_ai/get_deck_summary.ts`, outside the step's Surface: its import of `extractBlocksFromLayout` follows the function to `layout_structure.ts`, because the move leaves nothing at the old path to import.
- Step 3's brief excepts a copy made by `duplicate_slides` from "never read a slide to learn its block IDs", because that tool's result gives only the new slide ids. The review of step 3 asked for it.
- Step 5 was written as a sync made by this plan (`./sync wb-fastr`, then the SYSTEM_13 prose). The sync cannot land before this app follows panther's figure renames, so on Tim's word the sync is the one `TERMINOLOGY.md` step 3 makes, and that step is now step 6, which keeps the prose and the close. A new step 5 holds the review fixes and defects of rulings 16 to 22, decided by Tim on 2026-11-13.
