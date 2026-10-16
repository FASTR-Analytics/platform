# PLAN: One copilot view for the deck editor

Status: written 2026-10-15. Nothing built.

The deck editor has been one screen since 2026-09-22 (the rail on the left, the
clicked slide open beside it), but the copilot still sees two places: a deck
view and a slide view, the latter set by the slide editor on every mount.
Because a deck with slides always has a slide open, the chat lives in the slide
view, whose identity includes the slide id. A switch of the open slide is then
"the user moved", and panther's gate refuses every view-limited call for the
rest of the reply; the slide view's instructions still describe the retired
full-page slide editor; and two tool sets edit the same slides by different
rules. This plan makes the deck editor one copilot view, with the open slide as
view state, and one set of slide tools, each addressing a slide by id and
routing to the open slide's draft or to the stored slide.

**Next step: Review 3.**

Branch: `version2`. Repos touched: this app only. Read first: §0.

## 0. How to work this plan

Cadence, session shapes, the two-things rule and the step rules are
[panther/protocols/PROTOCOL_ALL_PLANS.md](panther/protocols/PROTOCOL_ALL_PLANS.md);
the app's bindings are [PROTOCOL_APP_PLANS.md](PROTOCOL_APP_PLANS.md). This plan
binds them as follows.

- Instruction: "Do the next step of PLAN_COPILOT_ONE_DECK_VIEW.md."
- Branch: `version2`, not the `tim-branch` the app protocol names: version 2
  lives on `version2` until PLAN_PRODUCTS_RESTRUCTURE replaces `main` with it. A
  session confirms `git branch --show-current` prints `version2`.
- Floor: `deno task typecheck`, `deno task test`, `./validate_protocols`,
  `./run`. No step touches a migration, the query engine or help text, so no
  conditional gate applies.
- Build log: §8. Last step: 3.
- A step reads, in order: `CLAUDE.md`, `SYSTEMS.md`,
  [SYSTEM_13_ai_assistant.md](SYSTEM_13_ai_assistant.md),
  [SYSTEM_12_documents_sharing.md](SYSTEM_12_documents_sharing.md), for step 3
  also [SYSTEM_14_client_shell.md](SYSTEM_14_client_shell.md), then §2 and §3 of
  this plan, the step's own section in §4, and §8.
- The tree is shared with other workstreams. A session confirms `git status` is
  clean before it starts and stages only the files its step names.

## 1. The problem

**Two views for one editor.** The slide editor holds the deck's view and sets
`editing_slide` over it on every mount
([slide_editor.tsx:589-607](client/src/components/products/slide_deck/slide_editor/slide_editor.tsx#L589-L607)),
and the deck opens a slide whenever it has one
([slide_deck.tsx:435-456](client/src/components/products/slide_deck/slide_deck.tsx#L435-L456)).
So a deck with slides is always in `editing_slide`; `editing_slide_deck` is the
view of an empty deck and nothing else.

**A slide switch is a move.** The slide view's identity carries the slide id
([copilot_catalogue.ts:294](lib/ai_tools/copilot_catalogue.ts#L294)). Panther's
gate refuses every view-limited call once the live identity differs from the one
the turn's last message carried
([view_logic.ts:108-131](panther/_110_ai_types/view_logic.ts#L108-L131)), with a
message that says the user moved and tells the model to wait for the user's next
message ([view_logic.ts:141](panther/_110_ai_types/view_logic.ts#L141)). Run
against the catalogue's own identities, a switch of the open slide from `a1b` to
`b2c` refuses `create_slide` and `get_metric_data` alike. Three things switch
the open slide during a reply: the user clicks another slide in the rail; the AI
deletes the open slide, after which the deck opens its neighbour; and the first
slide of an empty deck, which takes the chat from the deck view to the slide
view. In each case the model is told it may not continue, and it tells the user
to go to a "deck overview" that does not exist.

**The slide view's instructions describe the retired editor.**
[build_system_prompt.ts:277-321](client/src/components/instance/copilot/build_system_prompt.ts#L277-L321)
is headed "Current Mode: Editing Slide", opens with "Primary Tools (for this
slide)" and leads with `get_slide_editor` and `update_slide_editor`. The deck
brief (slide types, block formats, text limits, never show the user a slide id)
is sent only in `editing_slide_deck`
([build_system_prompt.ts:236-275](client/src/components/instance/copilot/build_system_prompt.ts#L236-L275)),
so a deck with slides never gets it. The workflow both views share
([build_system_prompt.ts:226-234](client/src/components/instance/copilot/build_system_prompt.ts#L226-L234))
never names `create_slide`, `delete_slides`, `duplicate_slides` or
`move_slides`. The composer reads "Ask about this slide..."
([chat_pane.tsx:85-89](client/src/components/instance/copilot/chat_pane.tsx#L85-L89)).
This is the language of the reported chat: "single-slide editor", "full deck
view".

**Two tool sets edit the same slides.** Thirteen slide tools. The deck tools
([slides.tsx](client/src/components/products/copilot/ai_tools/tools/slides.tsx))
edit any slide by id through the REST routes; the editor tools
([slide_editor.tsx](client/src/components/products/copilot/ai_tools/tools/slide_editor.tsx))
edit only the open slide through its draft, and `update_figure` refuses a
`slideId` that is not the open slide and tells the model to ask the user to open
it
([slide_editor.tsx:431-441](client/src/components/products/copilot/ai_tools/tools/slide_editor.tsx#L431-L441)).
`update_slide_content`, `update_slide_header`, `modify_slide_layout` and
`update_slide_editor` are the same three operations (header, blocks, layout)
split by surface, and the layout-spec resolution is written twice. A REST write
to the open slide reaches the editor only through the live room
([server/routes/products/slides.ts:141](server/routes/products/slides.ts#L141));
with collab down, the canvas keeps the old content, since the editor is keyed by
slide id and deck config and never refetches.

**The AI's delete of the open slide alerts the user.** The `delete_slides`
commit calls the route directly
([slides.tsx:606-607](client/src/components/products/copilot/ai_tools/tools/slides.tsx#L606-L607)).
The server then closes the slide's room with a fatal error, which the mounted
editor shows as an alert
([slide_editor.tsx:645](client/src/components/products/slide_deck/slide_editor/slide_editor.tsx#L645)).
The rail's own delete moves the editor off the slide before the request
([slide_list.tsx:306](client/src/components/products/slide_deck/slide_list.tsx#L306)).

## 2. The model

Vocabulary, used throughout:

- **The deck view**: `editing_slide_deck`, the one copilot view of the deck
  editor, set once the deck has loaded and current until the editor unmounts or
  a place inside the deck (settings, history, the figure editor) sets its own
  over it.
- **The open slide**: the slide the deck editor shows beside the rail; absent in
  an empty deck.
- **The draft**: the open slide's live store in the slide editor, which the
  editor syncs to the collab room and saves over REST when the room is not
  persisting.
- **A stored slide**: any slide read and written through the REST routes with
  the optimistic lock.
- **The pair**: the deck's results package and scope, with the scope's
  definition hash.

The end state:

- The deck view's identity is the deck and the pair. The open slide is view
  state: it rides every message as a line, and changing it is not a move.
- The deck context carries the open slide: `getOpenSlide()` returns one object
  per slide editor mount (`slideId`, `getDraft`, `setDraft`) or undefined, and
  `deleteSlides(ids)` runs the deck's own sequence (move the editor off a
  deleted open slide, then the request). The slide editor sets no view; it hands
  its draft to the deck through `onApi`.
- Nine slide tools, one set: `get_deck`, `get_slide`, `create_slide`,
  `update_slide`, `update_figure`, `replace_slide`, `delete_slides`,
  `duplicate_slides`, `move_slides`. Every tool that names a slide takes
  `slideId`. One routing rule: the open slide is read from and written to the
  draft; any other slide is read and written as a stored slide.
- One instructions text for the deck, which the model gets whether or not a
  slide is open.

## 3. Rulings

- **R1 One view.** `editing_slide` is deleted from the catalogue, the registry,
  the interactions, the placeholders, the tours and the draft card.
  `editing_slide_figure` stays: the figure editor is its own place over the
  deck, as settings and history are.
- **R2 Identity and state.** `editing_slide_deck` keeps its identity parts
  (`deck`, `pair`). Its state line is, in this order: `deckId: <id>`; the open
  slide as `Open slide: <id> (<n> of <total>, <type>): "<title>"`, or
  `Open slide: none (the deck has no slides)`; the selected slide ids when any.
  The title is read from the draft, so an edit never leaves it stale.
- **R3 The editor hands its draft up.** `SlideEditorApi` becomes
  `{ slideId, flush, getDraft, setDraft }`; the deck keeps it in a signal and
  `getOpenSlide()` returns it. The object is created once per mount, so a
  handler that captured it compares it by reference before writing
  (`getOpenSlide() !== captured` refuses with "The user switched slides; nothing
  was applied."), which is the guarantee `assertSlideStillOpen` gives today.
  `getDraft` returns the store; callers `unwrap` it. `setDraft` is the raw store
  setter, not the notifying one: the AI's own edit is never reported as the
  user's.
- **R4 One routing rule, in one place.** `readSlideTarget(view, slideId)` checks
  presence (`assertSlidesNotBusy`) and returns either
  `{ kind: "open", open, slide }` from the draft or
  `{ kind: "stored", slide, lastUpdated }` from `getSlide`.
  `writeSlideTarget(view, target, updated)` reconciles into the draft after the
  R3 check, or calls `updateSlide` with `expectedLastUpdated` and turns
  `CONFLICT` into the existing re-read message. Every slide write goes through
  these two functions; no handler reads `getOpenSlide()` itself.
- **R5 `update_slide` replaces four tools.** `update_slide_content`,
  `update_slide_header`, `modify_slide_layout` and `update_slide_editor` are
  deleted. `update_slide` takes `slideId` and `update_slide_editor`'s per-type
  discriminated union (`cover` fields; `section` fields; `content` with
  `header`, `blockUpdates`, `layoutChange`, the last two mutually exclusive),
  and its handler is `update_slide_editor`'s, over
  `readSlideTarget`/`writeSlideTarget`. The layout-spec resolution exists once.
- **R6 `get_slide_editor` is deleted.** `get_slide` reads the open slide from
  the draft and any other slide as stored, through `readSlideTarget`.
- **R7 `update_figure` takes `slideId`, required.** Its pipeline is unchanged;
  the load and the save go through R4. The description no longer speaks of a
  deck level or a slide editor.
- **R8 `get_deck` marks the open slide.** `getDeckSummaryForAI` takes the open
  slide (id and draft) and prints its line from the draft with `(open)` after
  the id.
- **R9 The AI deletes as the rail does.** `delete_slides`' commit calls the deck
  context's `deleteSlides(ids)`. The deck owns that function: if the open slide
  is among the ids it first selects the neighbour (the slide after the last
  deleted one, else before the first, else none), computed over the deck's
  `slideIds`; a refused flush returns the rail's "Delete cancelled." failure;
  then it calls the route. The rail's `handleDelete` calls the same function
  through a prop, and its own `neighbourOf` goes.
- **R10 Structure writes leave the open slide alone.** `create_slide`,
  `duplicate_slides` and `move_slides` never open a slide; the deck's own rule
  (open the first slide when none is open) is the only one that moves the editor
  on the AI's behalf.
- **R11 Draft writes mark their echo keys** _(proposed)_. A write through the
  draft marks `slide:<id>` and `product:<deckId>` as every stored write does, so
  the collab checkpoint's SSE echo of the AI's own edit drops at drain. Within
  the 30s TTL a collaborator's checkpoint on the same slide drops too, which the
  workflow absorbs: the model re-reads a slide before editing it. This closes
  the "Residual SSE self-echo under live collab" open item in S13.
- **R12 One instructions text.** `getEditingSlideInstructions` is deleted.
  `getEditingSlideDeckInstructions` is headed
  `# Current View: Editing slide
  deck`, so the heading and the view line name
  the same thing, and carries: the deck's name and the package line; slide
  types; content blocks; text length; communication style; a paragraph on the
  open slide (the state line names it; an edit to it shows on the canvas at once
  and saves automatically; an edit to any other slide is saved immediately;
  never ask the user to open, close or switch a slide or a view); and the
  workflow: `get_deck` first, `get_slide` before changing a slide,
  `update_slide` for header, blocks and layout, `update_figure` to tweak a
  figure, `replace_slide` to rebuild or change type, `create_slide`,
  `delete_slides`, `duplicate_slides` and `move_slides` for the deck's
  structure, `get_metric_data` before any `from_metric` block.
- **R13 The composer reads "Ask about this slide deck..."** in the deck view.
- **R14 No migration, no cache bump.** A conversation saved before this plan
  names the old tools and view in its history text only; nothing reads those
  names back.
- **R15 No panther change.** The gate's unit, a view's identity, is right once
  the open slide is state.
- **R16 Files.** In `client/src/components/products/copilot/ai_tools/tools/`:
  `slides.tsx` keeps the builder `getClientToolsForSlides` and the structure
  tools (`get_deck`, `create_slide`, `replace_slide`, `delete_slides`,
  `duplicate_slides`, `move_slides`); `get_slide.ts` stays; `update_slide.ts`
  exports `createUpdateSlideTool`; `update_figure.ts` exports
  `createUpdateFigureTool` and takes `replaceFigureBundleInLayout` with it;
  `slide_target.ts` exports R4's two functions and the `SlideTarget` type;
  `slide_editor.tsx` is deleted, and with it `getClientToolsForSlideEditor` from
  `tools/mod.ts`, `products/copilot/mod.ts` and `copilot_tools.ts`.

## 4. Steps

### Step 1: The deck exposes the open slide

**Surface.** `client/src/components/products/slide_deck/slide_deck.tsx`,
`client/src/components/products/slide_deck/slide_editor/slide_editor.tsx`,
`client/src/components/products/slide_deck/slide_list.tsx`,
`client/src/components/instance/copilot/ai_views.ts`,
`SYSTEM_12_documents_sharing.md`.

**Deliverable.**

- `ai_views.ts` exports `OpenSlide` (`slideId`, `getDraft`, `setDraft`) and
  `EditingSlideDeckContext` gains `getOpenSlide` and `deleteSlides` (R3, R9).
  `EditingSlideContext` still extends it and still carries `getTempSlide` and
  `setTempSlide`, which the editor tools read until step 2.
- The slide editor's `onApi` delivers R3's object; `slide_deck.tsx` holds it in
  a signal, serves it from `deckContext.getOpenSlide`, and owns `deleteSlides`
  (R9), passed to the rail as `onDeleteSlides`; the rail's `handleDelete` calls
  it and `neighbourOf` leaves `slide_list.tsx`.
- S12's "One screen" paragraph says what `onApi` carries and that the deck owns
  the delete sequence for the rail and the copilot alike.

**Not in this step.** Any tool, the catalogue, the view registry's views.

**Gates.** The floor.

**Ends with.** One commit.

### Step 2: One set of slide tools

**Surface.** `lib/ai_tools/copilot_catalogue.ts` (the tool tables only:
`COPILOT_TOOL_VIEWS`, `COPILOT_TOOL_REQUIREMENTS`, `COPILOT_APPROVAL_EXEMPT`),
`server/tests/copilot_catalogue_test.ts`,
`client/src/components/products/copilot/ai_tools/tools/slides.tsx`,
`client/src/components/products/copilot/ai_tools/tools/get_slide.ts`,
`client/src/components/products/copilot/ai_tools/tools/update_slide.ts` (new),
`client/src/components/products/copilot/ai_tools/tools/update_figure.ts` (new),
`client/src/components/products/copilot/ai_tools/tools/slide_target.ts` (new),
`client/src/components/products/copilot/ai_tools/tools/slide_editor.tsx`
(deleted), `client/src/components/products/copilot/ai_tools/tools/mod.ts`,
`client/src/components/products/copilot/mod.ts`,
`client/src/components/instance/copilot_tools.ts`,
`client/src/components/products/copilot/slide_ai/get_deck_summary.ts`,
`client/src/components/instance/copilot/ai_views.ts`,
`client/src/components/products/slide_deck/slide_editor/slide_editor.tsx`,
`client/src/components/instance/copilot/build_system_prompt.ts`,
`SYSTEM_13_ai_assistant.md`.

**Deliverable.**

- The catalogue's tool tables list the nine tools of §2 and no other slide tool;
  `update_slide` is `product_edit` and approval-exempt, as the four it replaces
  were; the test's groups and exemptions say the same. Both views still admit
  the deck tools (`DECK_VIEWS` is unchanged until step 3).
- R4 to R11 are in the code, laid out as R16 says. `get_deck`'s completion
  message and every description name only tools that exist.
- `EditingSlideContext` loses `getTempSlide` and `setTempSlide`; the slide
  view's label reads `getOpenSlide()`; the editor's `setView` passes the deck's
  context and nothing else.
- Both instructions texts name `update_slide` and `get_slide` where they named
  the deleted tools.
- S13's prose on the tools, the gating, the contexts and validate-before-commit
  describes the nine tools and the routing rule, and the collab self-echo open
  item is deleted (R11).

**Not in this step.** Deleting the slide view, the state line, the interactions,
the placeholders, the tours, the draft card, merging the instructions.

**Gates.** The floor, and G2 with the step-2 pattern (§5).

**Ends with.** One commit.

### Step 3: One view

**Surface.** `lib/ai_tools/copilot_catalogue.ts` (`COPILOT_VIEW_IDS`,
`COPILOT_PACKAGE_VIEWS`, `COPILOT_VIEW_IDENTITY_PARTS`, `DECK_VIEWS`,
`SLIDE_VIEWS`), `server/tests/copilot_catalogue_test.ts`,
`client/src/components/instance/copilot/ai_views.ts`,
`client/src/components/instance/copilot/interactions.ts`,
`client/src/components/instance/copilot/chat_pane.tsx`,
`client/src/components/instance/copilot/tool_guard.ts`,
`client/src/components/instance/copilot/build_system_prompt.ts`,
`client/src/components/products/slide_deck/slide_editor/slide_editor.tsx`,
`client/src/components/products/copilot/ai_tools/tools/drafts.tsx`,
`client/src/components/products/copilot/ai_tools/tools/draft_slide_preview.tsx`,
`client/src/onboarding/index.ts`, `SYSTEM_12_documents_sharing.md`,
`SYSTEM_13_ai_assistant.md`.

**Deliverable.**

- R1, R2, R12 and R13 are in the code: the view, its params and context types,
  `getEditingSlideInstructions`, the `restoreCopilotView` and `tool_guard`
  cases, the placeholder entry and the test's rows for `editing_slide` are gone;
  `DECK_VIEWS` is `["editing_slide_deck"]` and `SLIDE_VIEWS` is gone; the slide
  editor neither holds nor sets a view.
- `interactions.ts`: `edited_slide` and `selected_slides` are relevant in the
  deck view alone, the former filtered on the deck's slide ids;
  `edited_slide_locally` is relevant in the deck view, filtered on
  `getOpenSlide()?.slideId`, and reads "The open slide's content changed
  (re-read it with get_slide before editing it)".
- `onboarding/index.ts`: `editingSlideOfType` and the tour manager's watch read
  the open slide's type through `getOpenSlide()` on the deck view.
- `drafts.tsx` and `draft_slide_preview.tsx` test the one view id.
- S12 and S13 describe one deck view with the open slide as state; S13's
  sync-site, state, interaction, card and gating paragraphs are rewritten.

**Not in this step.** Anything in §6.

**Gates.** The floor, G1, and G2 with the step-3 pattern (§5).

**Ends with.** One commit. The review that passes this step deletes the plan
file in its last commit.

## 5. Gates catalogue

- **The floor**, every step: `deno task typecheck`, `deno task test`,
  `./validate_protocols`, `./run`.
- **G1 The catalogue test** (`server/tests/copilot_catalogue_test.ts`, in
  `deno task test`): from step 2, the tool groups are §2's nine; from step 3,
  the views have no `editing_slide` and the identity parts of
  `editing_slide_deck` are `deck` and `pair`.
- **G2 No stale name**, run from the repo root, expected to print nothing:
  - step 2:
    `git grep -n -E "get_slide_editor|update_slide_editor|update_slide_content|update_slide_header|modify_slide_layout|getTempSlide|getClientToolsForSlideEditor" -- ':!panther/_*'`
  - step 3:
    `git grep -n -E "editing_slide\b|EditingSlideParams|EditingSlideContext|getEditingSlideInstructions|SLIDE_VIEWS" -- ':!panther/_*'`

## 6. Out of scope

- The slide and report style surface, image blocks and value ordering (S13 open
  items): the read projection and the write schemas keep their fields.
- A tool that opens a slide or navigates: the user moves, the state line tells
  the model where.
- The rail's optimistic order during an in-flight reorder: R9's neighbour reads
  the deck's `slideIds`.
- Per-tool identity parts in panther's gate (R15).
- The collab layer and the REST routes: unchanged.

## 7. Rollout and rollback

Nothing ships from a step. After step 3's review passes, the change rides the
next version 2 ad-hoc deploy to the v2 testing instances, which Tim runs. No
migration and no cache prefix are involved, so rollback is the previous image
tag. A conversation started before the deploy keeps the old tool and view names
in its history text and continues under the new ones.

## 8. Build log

Append-only, newest last.

| Step | Session    | Row                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| ---- | ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1    | 2026-10-16 | Deviation: `client/src/components/instance/copilot/mod.ts` is outside the surface. It exports `OpenSlide`, since `SlideEditorApi` is `OpenSlide & { flush }` and a type crosses folders only through `mod.ts` (lint:structure).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| 1    | 2026-10-16 | Choice: the open slide (`currentSlideId`, the content fetch, the keyed mount, the follow-the-deck and tour-replay effects, `selectSlide`) moved from `SlideDeckEditorInner` up to `SlideDeckEditor`, where the deck view's context is built and set, so `getOpenSlide` and `deleteSlides` read it directly; the inner component takes them as props. `neighbourOf` is a module-level pure function over the deck's `slideIds`.                                                                                                                                                                                                                                                                                                                                                                                         |
| 1    | 2026-10-16 | Fact: `./validate_protocols` prints "1 baseline entry no longer match"; HEAD before this step prints the same, so it is not this plan's.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| 1    | 2026-10-16 | Step 1 built.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| 1    | 2026-10-16 | Finding (code): `client/src/components/products/slide_deck/slide_deck.tsx:641`, `neighbourOf`. `order.slice(0, order.findIndex(isGone))` ends before the first deleted id, so it holds no deleted id and its `.findLast((id) => !isGone(id))` is a predicate that cannot fail. Edit: `order.slice(0, order.findIndex(isGone)).at(-1)`. A harness over twelve delete sets agrees with the rail's old rule before and after.                                                                                                                                                                                                                                                                                                                                                                                             |
| 1    | 2026-10-16 | Finding (prose), fixed in this review's own commit ea8b4e21b: `SYSTEM_12_documents_sharing.md:534-535` read "a refused flush cancels the delete with "Delete cancelled.", and only then is the request sent", which placed the request after the cancel. Now: the request goes once the editor has moved; a refused flush cancels the delete and sends nothing.                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| 1    | 2026-10-16 | Step 1 reviewed: 2 findings.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| 1    | 2026-10-16 | Step 1 fixed.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| 1    | 2026-10-16 | Step 1 re-reviewed: pass.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| 2    | 2026-10-16 | Deviation: two files outside the surface. `client/src/components/instance/copilot/interactions.ts`: the `edited_slide_locally` line named `get_slide_editor`, now `get_slide`, as G2 and "every description names only tools that exist" require. `client/src/onboarding/index.ts`: read `getTempSlide()`, now `getOpenSlide()?.getDraft()`. Both are in step 3's surface, which rewrites them again.                                                                                                                                                                                                                                                                                                                                                                                                                  |
| 2    | 2026-10-16 | Deviation from R4: the presence check (`assertSlidesNotBusy`) is in `writeSlideTarget`, run immediately before the write, not in `readSlideTarget`. R6 routes `get_slide` through `readSlideTarget`, so a check in the read would refuse reading any slide a collaborator has open, which `get_slide` never did. Reads are never refused; writes are refused as before.                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| 2    | 2026-10-16 | Choice: `writeSlideTarget` also refuses a stored target whose slide the user opened after the read ("The user opened this slide while the edit was being prepared; nothing was applied."), so the open slide is only ever written through its draft, as R4's routing rule states.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| 2    | 2026-10-16 | Choice: `slide_target.ts` also exports `slideTargetOutcome`, the result's last sentence by target kind, shared by `update_slide`, `update_figure` and `replace_slide`. `replace_slide` reads and writes through R4's two functions, as every slide write does; it reads after its conversion so a stored version is as fresh as possible.                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| 2    | 2026-10-16 | Choice: `EditingSlideContext` is deleted, not emptied: without `getTempSlide`/`setTempSlide` it is the deck context, and the slide view is declared over `EditingSlideDeckContext`. `SLIDE_VIEWS` is deleted from the catalogue, outside "the tool tables only": its two tools are gone and nothing else reads it. The catalogue test's per-view `tools` field went with `update_figure`'s special row in the deck view.                                                                                                                                                                                                                                                                                                                                                                                               |
| 2    | 2026-10-16 | Choice: `create_slide` and `replace_slide` share `validateAiSlideInput` in `slides.tsx`, the content checks each held a copy of.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| 2    | 2026-10-16 | Fact: G2's patterns match the plan file's own text, so as written they never print nothing while the plan exists. With `':!PLAN_COPILOT_ONE_DECK_VIEW.md'` added to the pathspec, the step-2 pattern prints nothing.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| 2    | 2026-10-16 | Fact: S13 said `products/copilot/mod.ts` exports "the four tool builders"; it exported six, five now. The prose says five.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| 2    | 2026-10-16 | Step 2 built.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| 2    | 2026-10-16 | Finding (code): `client/src/components/products/copilot/ai_tools/tools/slide_target.ts:37`, `readSlideTarget` returns `structuredClone(unwrap(open.getDraft()))`, a snapshot, where R3 says callers `unwrap` the store. Solid's setter mutates the raw object in place, so the unwrapped object is the live draft and a tree a handler builds from it shares every untouched node with the store, which `reconcile` skips; a snapshot shares nothing, so a write after the handler's awaits (a figure resolve takes seconds) puts the snapshot's copy of every block back over what the user typed meanwhile, and the room gets the revert. The deleted `update_slide_editor` read the live object. Edit: `slide: unwrap(open.getDraft())`, and the `SlideTarget` comment no longer calls `slide` the tool's own copy. |
| 2    | 2026-10-16 | Finding (code): `client/src/components/instance/copilot/client_env.ts:52-55,109-110`, `ClientAIToolEnv.getSlide` has no caller: `get_slide` was its only one and now reads through `readSlideTarget`. Edit: delete it, with the `SlideWithMeta` and `getSlideFromCacheOrFetch` imports and "product content (slides)" in the file comment; in S13 the "and the product-content getters" clause of the `ClientAIToolEnv` sentence (Principles, 2) goes with it.                                                                                                                                                                                                                                                                                                                                                         |
| 2    | 2026-10-16 | Finding (prose), fixed in this review's own commit 63831e51d: `SYSTEM_12_documents_sharing.md:536-539` named `EditingSlideContext`, deleted this step; now the view is declared over `EditingSlideDeckContext`, which the editor passes to `setView` unchanged. `SYSTEM_13_ai_assistant.md:612-613` said no handler reads `getOpenSlide()` for itself, but `get_deck`'s does (`slides.tsx:78`), to hand the open slide to `getDeckSummaryForAI`; now: no handler routes a slide by it itself.                                                                                                                                                                                                                                                                                                                          |
| 2    | 2026-10-16 | Step 2 reviewed: 2 findings.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| 2    | 2026-10-16 | Fix: the second finding's deletion also takes `getSlide: templateThrow` out of the template env in `client/src/components/instance/copilot/bind_package_tools.ts`, which typechecks `ClientAIToolEnv` and so must lose the member with it.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| 2    | 2026-10-16 | Fact: an untracked `transcript.md` from another workstream appeared at the repo root during Review 2 and is not fmt-clean, so `deno task typecheck` stops at `deno fmt --check`. Fix 2 ran the rest of the chain as written and `deno fmt --check` over its changed files, all green; the file was left alone.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| 2    | 2026-10-16 | Step 2 fixed.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| 2    | 2026-10-16 | Re-review: both findings resolved by the stated edits. `slide_target.ts:40` reads `unwrap(open.getDraft())`, and every handler that receives the open slide (`update_slide`, `update_figure`, `replace_slide`, `get_slide`, with `getSlideWithUpdatedBlocks`, `applyFigureConfigPatch`, `convertVisualizationType` and `simplifySlideForAI`) builds a fresh tree by spread and never mutates it, so the nodes an update leaves alone are the store's own. `ClientAIToolEnv.getSlide`, its two imports and the comment clause are gone from `client_env.ts`, the S13 clause with them; `bind_package_tools.ts` lost the member's template entry, the one consequential file the Fix's row names. The Fix changed no other file.                                                                                         |
| 2    | 2026-10-16 | Fact: the untracked file is now `demo_video/transcript.md` and still stops `deno task typecheck` at `deno fmt --check`. The re-review ran `deno fmt --check` over the Fix's five files and the rest of the chain as `deno.json` writes it, `deno task test` (682 passed, G1 among them), `./validate_protocols` (the pre-existing baseline note only), G2's step-2 pattern with the plan file excluded (prints nothing) and `./run` (server and Vite up, the three changed client modules served 200, no error lines): all green.                                                                                                                                                                                                                                                                                      |
| 2    | 2026-10-16 | Step 2 re-reviewed: pass.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| 3    | 2026-10-16 | Deviation: three files outside the surface. `client/src/components/products/slide_deck/slide_deck.tsx`: the slide editor's `deckContext` prop existed only for its `setView`, so the deck no longer passes it, `SlideDeckEditorInner` loses the prop, and two comments that named `editing_slide` are rewritten. `client/src/components/products/copilot/ai_tools/tools/slides.tsx`: `get_deck`'s completion message compared the view id with `editing_slide`, a type error once the id is gone. `SYSTEM_14_client_shell.md`: its tour paragraph named the deck editor's views as `editing_slide_deck` or `editing_slide`.                                                                                                                                                                                            |
| 3    | 2026-10-16 | Deviation from the step's text for `edited_slide_locally`: the line names the slide, "The content of slide <id> changed while it was open (re-read it with get_slide before editing it)", one line per slide (`oncePerSlide`, shared with `edited_slide`), not "The open slide's content changed (...)". Panther runs `filter` when an entry is recorded and suffixes the line with the label of the view it was recorded in, which was the slide's title in the slide view and is the deck's name now; so after the user edits one slide and opens another before writing, "the open slide" would name the wrong slide, and the default keep-latest coalescing would drop every slide's line but the last.                                                                                                            |
| 3    | 2026-10-16 | Choice: R2 gives no line for a deck with slides and none open (the open slide's fetch is in flight or failed): the line is `Open slide: none`, with "(the deck has no slides)" only when it has none. The position reads "no longer in the deck" in the moment between a collaborator's delete of the open slide and the deck moving the editor on. The title is collapsed to one line.                                                                                                                                                                                                                                                                                                                                                                                                                                |
| 3    | 2026-10-16 | Fact: G2's step-3 pattern uses `\b` under `git grep -E`, which Apple Git 2.50.1 does not support, so `editing_slide\b` matches nothing and the gate prints nothing whatever the tree holds. Run as `git grep -n -P` with `':!PLAN_COPILOT_ONE_DECK_VIEW.md'` added (step 2's row), it prints one line: `panther/protocols/PROTOCOL_UI_AI_CHAT.md:272`, an example in the vendored panther protocol, which `:!panther/_*` does not exclude and this repo never edits (R15, "this app only").                                                                                                                                                                                                                                                                                                                            |
| 3    | 2026-10-16 | Fact: `interactions.ts` said the local-edit filter keeps the one open "at drain" and S13 repeated it; panther runs `relevantIn` and `filter` at record time (`panther/_305_ai/_core/interactions.ts`). Both now say when the edit is recorded.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| 3    | 2026-10-16 | Fact: the untracked `demo_video/transcript.md` still stops `deno task typecheck` at `deno fmt --check` (the only unformatted file of 1950). The rest of the chain as `deno.json` writes it, `deno task test` (682 passed), `./validate_protocols` (the pre-existing baseline note only) and `./run` (server and Vite up, the eleven changed client modules served 200, no error lines) are green.                                                                                                                                                                                                                                                                                                                                                                                                                      |
| 3    | 2026-10-16 | Step 3 built.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
