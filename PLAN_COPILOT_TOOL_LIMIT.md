# PLAN: Copilot tool limit

Status: steps 1 to 4 are DONE. Step 5, the last, WAITS on panther: it starts once a sync of panther has landed in this app, and that sync is panther's to make ("Why step 5 waits").

A copilot turn stopped with "Stopped: too many tool calls in one turn" once the model had asked for tools in more than 24 replies, and a deck was where users reached it. This plan made a deck's reads and writes take few rounds (one read for any number of slides, write results that state what the write left, a brief that stops ordering read-backs and says calls can share a reply), and raised panther's cap to 100 with a per-consumer override. The app's own half is built and in use. The cap of 100 is built in panther and is not in this app yet: this app's copy of panther still caps a turn at 24.

**Next step: Do 5.**

Branch: `main`. Repo: this one. Read first: [CLAUDE.md](CLAUDE.md), [SYSTEMS.md](SYSTEMS.md) and [SYSTEM_13_ai_assistant.md](SYSTEM_13_ai_assistant.md) "The panther engine". Start when: `rg -q maxTurnContinuations panther/_305_ai/_core/types.ts` exits 0 in this repo, and this tree is clean.

## Where the plan stands

### Done

Each step was built, reviewed by an independent agent, fixed and re-reviewed. The commits of a step have the subject `PLAN_COPILOT_TOOL_LIMIT step N`.

- **Step 1, `get_slides` (this repo).** `get_slides({ slideIds })` replaces `get_slide`: any number of slides in one call, in the order asked, each with its id. An id outside the deck refuses the whole call. Commits `14cf22939`, `32a6d4771`, close `afc697a4b`.
- **Step 2, a write's result states what the write left (this repo).** The four slide writes return the blocks by id and type, the layout, the page fit and the config of each figure the write built or changed. `get_slides` gives each content slide `overflow`. `update_report_figure` and `update_figure_editor` return the config that resulted. The four structure writes no longer name `get_deck`. PROTOCOL_APP_AI_TOOLS.md states the contract as "The round budget". Commits `7e7b22b96`, `bc80c54e3`, `05c797549`, `a7005e66c`, close `978a1d063`.
- **Step 3, the brief (this repo).** The deck brief asks for one read per slide per turn and takes a write's result as the slide's state. The chat's core principles put calls that do not depend on each other in one reply. Both live in `lib/ai_tools/build_system_prompt.ts`, pinned by `server/tests/copilot_prompt_test.ts`. Commits `3298b1870`, `32c8f83ec`, close `72f2a8c7a`.
- **Step 4, the cap is 100 with an override (panther repo).** Panther's default cap is 100 and `AIChatConfig.maxTurnContinuations` overrides it: a positive integer, and construction and `validateAIChatConfig` throw on anything else. Both `turn_limit` notices end "Send a new message to carry on.". Panther commits `37d58ea4`, `4577a951`; close in this repo `e5bd4782c`.

What steps 1 to 3 built is described in the standing docs: SYSTEM_13 "Tools, view gating, and approval", "The slide_ai conversion layer" and "System prompt, documents, prompt library", and PROTOCOL_APP_AI_TOOLS.md "The round budget". What step 4 built is described in the panther repo's `DOC_AI_CHAT.md` "Turn model" and `protocols/PROTOCOL_UI_AI_CHAT.md` "Surface setup".

### Remaining

Step 5 (§4): once this app's copy of panther holds the cap, SYSTEM_13's "The panther engine" states it, and the close commit deletes this file. Nothing else of this plan is open.

### Why step 5 waits

- The sync copies panther's whole working tree, never one change. Panther's tree also holds its figure renames (the panther repo's `TERMINOLOGY.md`, "Reaching these names", step 1: `yScaleAxis` to `yValueAxis`, `val` to `value`, `showGrid` to `showGridLines`, `seriesHeader` and the rest), which this app's code does not follow yet.
- Tried on 2026-11-12: `./sync wb-fastr --no-commit` copied panther at `4577a951`. `deno fmt --check` and the server check passed. The client check failed with 85 errors in 18 files under `client/src/`, every one a renamed figure name, none in the AI chat. Nothing of it was committed.
- The sync that brings the renames to this app is `TERMINOLOGY.md`'s step 3 ("Migrate the stored-config keys in the consumers ... and sync, one commit per consumer"), which follows its step 2, a ruling of Tim's. That sync carries the cap with it, because panther's tree already holds it. This plan does not run a sync.

## §0 How to work this plan

The instruction is "Do the next step of PLAN_COPILOT_TOOL_LIMIT.md." Branch, floor, conditional gates, reading order and the review cadence are [PROTOCOL_APP_PLANS.md](PROTOCOL_APP_PLANS.md) and [panther/protocols/PROTOCOL_ALL_PLANS.md](panther/protocols/PROTOCOL_ALL_PLANS.md). The log is §6. The last step is 5; its close commit deletes this file. Nothing in this plan ships (ruling 15).

Vocabulary:

- **turn**: everything from one user message to the reply that calls no tool.
- **round**: one model reply that calls tools, with the results sent back. A reply may hold several calls, and they are one round. Panther's word is continuation.
- **the cap**: the number of rounds a turn may run, panther's `MAX_TURN_CONTINUATIONS`.

## §1 The problem

- **This app's copy of panther still caps a turn at 24 rounds.** `MAX_TURN_CONTINUATIONS = 24` is in `panther/_305_ai/_components/_create_ai_chat.ts`, and the notice at the cap does not say that a new message carries on. Steps 1 to 3 cut the rounds a deck needs, so a turn reaches the cap far later than it did, and the cap is still the old one.
- **SYSTEM_13 "The panther engine" states the cap as 24.** It is true of the copy today and stops being true when the sync lands.

## §2 The model

**The cap is 100 and a consumer can override it.** Panther's default cap is 100 and `AIChatConfig.maxTurnContinuations` overrides it. The notice at the cap says a new message carries on. The app takes the default.

## §3 Rulings

Rulings 1 to 11 are built (steps 1 to 3) and the standing docs describe them. The four that step 5 rests on:

12. **Panther: the cap's default is 100, and `AIChatConfig.maxTurnContinuations` overrides it.** Optional, a positive integer, one counter for tool rounds and `pause_turn` resumes. Ruled, and built in step 4.
13. **Panther: the cap's notice says what the user can do.** The details of `turn_limit`, in both its forms, end by saying that a new message carries on. No button and no engine text to the model: the answered calls already tell the model why they did not run. Built in step 4.
14. **The app passes no cap.** It takes panther's default, as it takes panther's model defaults.
15. **Nothing ships in this plan.** The app's next release carries it.

## §4 Steps

### Step 5: the app's docs state the cap (this repo)

Starts when the header's `Start when` holds: this repo's `panther/_305_ai/_core/types.ts` contains `maxTurnContinuations`, which means a sync of panther made after 2026-11-12 has landed here and its floor was green.

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
- **The findings the reviews of steps 1 to 3 could not apply**, each for a file outside its step's Surface, and the defect step 2's run found. They are in SYSTEM_13's Open items, under "Client copilot" and "Hygiene", and each waits for a ruling.

## §6 Log

- Step 2 edited `client/src/components/products/copilot/slide_ai/get_deck_summary.ts`, outside the step's Surface: its import of `extractBlocksFromLayout` follows the function to `layout_structure.ts`, because the move leaves nothing at the old path to import.
- Step 3's brief excepts a copy made by `duplicate_slides` from "never read a slide to learn its block IDs", because that tool's result gives only the new slide ids. The review of step 3 asked for it.
- Step 5 was written as a sync made by this plan (`./sync wb-fastr`, then the SYSTEM_13 prose). The sync cannot land before this app follows panther's figure renames, so on Tim's word step 5 waits for the sync panther's `TERMINOLOGY.md` step 3 makes, and keeps the prose and the close.
