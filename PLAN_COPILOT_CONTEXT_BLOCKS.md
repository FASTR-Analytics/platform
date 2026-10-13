# PLAN_COPILOT_CONTEXT_BLOCKS: a user bubble shows the context block its message was sent with

> **Status (2026-10-13):** Not started.

Every message a user sends to the copilot goes to the model with a context block
in front of its text: the view line, the view's state, the interactions digest
and, when their text is new to the conversation, the view's instructions and the
date and package blocks. The chat shows the text as typed and nothing of the
block. This plan adds a per-browser preference, "Show context blocks", under
which each user bubble shows, above its text, the exact block its message was
sent with, so what the chat displays is what the model received. The engine
(panther) records the block on the bubble's display item as a string produced by
the same function that writes it to the wire; the app renders it behind the
preference.

**Next step: Do 1**

Branch: `version2` here; `main` in the panther repo. Repos touched: panther
(step 1), this app (step 2, which begins with the sync commit). Read first: what
§0's reading order names.

## 0. How to work this plan

Cadence, session shapes, the two-things rule and the step rules are
`panther/protocols/PROTOCOL_ALL_PLANS.md`; the app's floor, conditional gates
and sections are `PROTOCOL_APP_PLANS.md`. This plan binds them as follows.

- Instruction: "Do the next step of PLAN_COPILOT_CONTEXT_BLOCKS.md."
- Branch: `version2` here; `main` in `<panther>`, which is
  `/Users/timroberton/projects/panther/timroberton-panther`.
- Floor: step 1 runs in `<panther>` and its floor is panther's four commands
  (`<panther>/CLAUDE.md`): `deno task typecheck`,
  `deno run -A clean.ts --dry-run`, `deno task test`, `deno task test:engine`.
  Step 2 runs here and its floor is PROTOCOL_APP_PLANS's. No step touches a
  migration, the base schema, the seed, the query engine or help text, so no
  conditional gate applies.
- Build log: §8. Last step: 2.
- Reading order: the `CLAUDE.md` of the repo the step runs in; for step 1,
  `<panther>/DOC_AI_CHAT.md` and `<panther>/DOC_TESTING.md`; for step 2,
  `SYSTEMS.md`, `SYSTEM_13_ai_assistant.md`, `SYSTEM_14_client_shell.md` and
  `panther/protocols/PROTOCOL_UI_STRUCTURE.md`; then §2 and §3, the step's own
  section in §4, and §8.
- Paths: relative to the repo the step runs in. In step 2, `copilot/` stands for
  `client/src/components/instance/copilot/`. In §1, panther paths are the
  vendored copy's (`panther/` here), whose files are the source files plus a
  five-line sync banner, so a source line is the cited line minus 5.

Rules peculiar to this plan:

- **One plan, two repos.** Step 1's commits land in `<panther>` on `main`, and
  its review runs there. Step 2's first commit is the sync here, then the app's.
  A session confirms the branch and a clean tree in the repo its step runs in;
  step 2 also confirms `<panther>` is clean at step 1's last commit before it
  syncs, because the sync writes that commit into
  `panther/.panther-manifest.json` and a dirty source writes
  `pantherGitDirty: true`.

Vocabulary:

- **sections**: the typed `ephemeralSections` on a stored user message
  (panther's `EphemeralSection`).
- **carrier**: a user message with sections. Two sites create one: the turn's
  first message, and the tool-result message that a message typed mid-turn
  joins.
- **block**: the one string the wire splices in front of a carrier's first text
  block: `<<<[`, the sections' texts joined by a blank line, `]>>>`, a blank
  line.
- **bubble**: a `user_text` display item as the chat renders it.
- **the preference**: the per-browser "Show context blocks" setting.

## 1. The problem

Facts as of 2026-10-13: this repo at `cfa8b9373`; panther `main` at `9c158b5`,
whose module code is identical to the vendored `d8e55db`
(`panther/.panther-manifest.json`; the commits between touch only `.md` files).

- **The wire is derived at request time and never stored.**
  `renderOutgoingMessages` splices each carrier's block in front of its first
  text block (`panther/_110_ai_types/turn_logic.ts:59-79`). The block string is
  built inline in `spliceSections` (:63-65) and nowhere else.
- **A bubble is `{ type: "user_text"; text }`**
  (`panther/_305_ai/_core/types.ts:54-57`), derived from the message's clean
  text by `getDisplayItemsFromMessage`
  (`panther/_305_ai/_core/display_items.ts`) and persisted as its own list
  beside the messages (`panther/_305_ai/_core/persistence.ts:25-30`). It holds
  no link to its message and no sections, so the app's renderer
  (`copilot/ai_prompt_library/saveable_user_text_renderer.tsx:13-45`) cannot
  show what the message carried.
- **The sections are on the message before its bubble is derived** at the first
  site: `attachSections` (`panther/_305_ai/_components/_create_ai_chat.ts:667`)
  precedes `processMessageForDisplayTo` (:679). At the second site the order is
  reversed: the queued texts' bubbles are added (:1715-1727) before the
  tool-result message gets its sections (:1734-1738).
- **The only inspection today is the chat menu's "View system prompt"**
  (`copilot/chat_pane.tsx:405-436`), which shows the blocks the next message
  would carry, through `getNextTurnPreview()`. Nothing shows what an earlier
  message carried, so "did the model get the package block on that turn" is
  answered by reading the conversation record out of IndexedDB.

## 2. The model

- **Every carrier's block is on its first bubble, as a string.** The `user_text`
  display item gains `wireBlock?: string`, set when the item is derived from a
  message with sections, by the function the wire uses. So the bubble's
  `wireBlock + text` is, byte for byte, the first text block of the message as
  sent. The wire format stays panther's: the consumer parses nothing and renders
  no marker itself, and a block persisted under a later format change still
  shows what was sent at the time.
- **Both carrier sites set it.** At the queued-texts site the sections attach
  before the bubbles are added, and the first queued text's bubble carries the
  block, which is where the wire splices it: after the tool results, in front of
  the first text block (`buildToolResultUserMessage`,
  `panther/_110_ai_types/turn_logic.ts:316-327`). A bare tool-result message
  carries no sections and has no bubble. After this plan, every section ever
  sent precedes exactly one bubble.
- **Display text stays clean.** `text` is unchanged; save-to-prompt-library
  saves `text`; panther's default `UserTextRenderer` ignores `wireBlock`. The
  field is additive within persistence format v2, under the rule
  `DOC_AI_CHAT.md` states for `approvedTools`; a bubble saved before the field
  shows nothing extra.
- **The preference** is a signal and localStorage pair in `state/t4_ui.ts`
  (`copilotContextBlocks`), off by default, flipped by a chat-menu item whose
  label reads "Show context blocks" or "Hide context blocks" by its state,
  placed under "View system prompt". It is display-only: it enters no fetch
  config and no cache hash.
- **The rendering.** With the preference on and a `wireBlock` present, the
  bubble shows the block above the text, inside the same bubble, as preformatted
  small text, then the text as today. Preformatted, because the block holds the
  sections' own markdown (headings, lists) and the markers, which the markdown
  renderer would restyle or escape. The bubble then reads as the message does on
  the wire: block, blank line, text.
- **The types reach the app by name.** `DisplayItem` and `DisplayRegistry`
  become exported types of panther's `_305_ai/mod.ts`, and so of `mod.ui.ts`,
  which re-exports that module. The app's renderer types its item as
  `Extract<DisplayItem, { type: "user_text" }>` and the pane's renderer map is
  `satisfies DisplayRegistry`, replacing the
  `as Parameters<typeof AIChat>[0]["customRenderers"]` cast that exists only
  because the type was not exported.

## 3. Rulings

All _(proposed)_, 2026-10-13: derived from Tim's request, "user display messages
match what is actually sent", and from the code. Each stands unless overruled
here before `Do 1`.

1. The bubble carries the rendered block string, not the typed sections,
   produced by the function the wire uses (`renderEphemeralBlock`, extracted
   from `spliceSections`). Reason: byte equality with the wire, and
   `modules/mod.ui.ts:39-44`'s standing rule that the wire format is not a
   consumer surface.
2. The field is `wireBlock?: string` on the `user_text` display item, set by
   `getDisplayItemsFromMessage` on the first `user_text` item of a message with
   sections, and at the queued-texts site on the first queued bubble. No other
   display item has it.
3. No persistence format bump: additive within v2, like `approvedTools`.
4. The preference lives in `state/t4_ui.ts` as a signal and localStorage pair
   with a `set*` wrapper, following `navCollapsed`. Reason: the pane and the
   renderer in `copilot/ai_prompt_library/` both import it downward from
   `~/state`, which the structure protocol allows; a signal in `copilot/` would
   give the child folder a runtime import of its parent beside the parent's
   import of the child's `mod.ts`, a folder cycle.
5. The menu item flips its label and icon (`eye` to show, `eyeOff` to hide); it
   adds no checked state to panther's `MenuItemClickable`.
6. The block renders as preformatted text
   (`whitespace-pre-wrap break-words
   text-xs`), not through markdown-it, with
   its trailing blank line shown as the gap before the text.
7. `DisplayItem` and `DisplayRegistry` become exported types of
   `_305_ai/mod.ts`.
8. Panther's `tests/ai_display_items_test.ts` gains the two cases step 1 states.
   `tests/ai_turn_logic_test.ts` is not touched: its wire assertions pin the
   exact block strings and are the regression gate for the extraction.
9. Out of this plan: a block for a bubble saved before the field; a per-message
   copy affordance; the tool-result blocks and the assistant's side; the system
   prompt and the tools array, which View system prompt covers.

## 4. Steps

### Step 1 (panther): the block rides the bubble

Runs in `<panther>`, branch `main`.

**Surface.**

- `modules/_110_ai_types/turn_logic.ts`
- `modules/_110_ai_types/mod.ts`
- `modules/_305_ai/deps.ts`
- `modules/_305_ai/_core/types.ts`
- `modules/_305_ai/_core/display_items.ts`
- `modules/_305_ai/_components/_create_ai_chat.ts`
- `modules/_305_ai/mod.ts`
- `tests/ai_display_items_test.ts`
- `DOC_AI_CHAT.md`

**Deliverable.**

(a) `turn_logic.ts`: the block string is one exported pure function, and
`spliceSections` calls it (ruling 1). `_110_ai_types/mod.ts` exports it beside
`renderOutgoingMessages`; `deno run -A clean.ts` adds it to `_305_ai/deps.ts`.
`modules/mod.ui.ts` is not touched: the function stays inside the vendored
engine.

```ts
// The sections as one wire block: what a carrier's first text block starts
// with on the wire, and what its first display item records (wireBlock), so
// a bubble can show, byte for byte, what its message was sent with.
export function renderEphemeralBlock(sections: EphemeralSection[]): string {
  return `${EPHEMERAL_CONTEXT_OPEN}${
    sections.map((s) => collapseLiteralMarkers(s.text)).join("\n\n")
  }${EPHEMERAL_CONTEXT_CLOSE}\n\n`;
}

function spliceSections(
  msg: MessageParam,
  ephemeralSections: EphemeralSection[],
): MessageParam {
  const block = renderEphemeralBlock(ephemeralSections);
  // unchanged from here
```

(b) `types.ts` (ruling 2):

```ts
| {
  type: "user_text";
  text: string;
  // The block this message was sent with, in front of `text` on the wire
  // (renderEphemeralBlock over its sections). Only on the first user_text
  // item of a carrier; absent on a message without sections and on items
  // saved before the field existed.
  wireBlock?: string;
}
```

(c) `display_items.ts`: the block goes on the message's first bubble, where the
wire splices it. The two helpers are exported for the queued-texts site
(module-internal; not through `mod.ts`), and `getDisplayItemsFromMessage`
becomes the composition of the existing extraction (renamed
`collectDisplayItems`, body unchanged) and `withWireBlock`:

```ts
import type { ContentBlock, MessageParam } from "../deps.ts";
import { renderEphemeralBlock } from "../deps.ts";
import type { DisplayItem } from "./types.ts";

export function getDisplayItemsFromMessage(
  message: MessageParam,
): DisplayItem[] {
  return withWireBlock(wireBlockOf(message), collectDisplayItems(message));
}

export function wireBlockOf(message: MessageParam): string | undefined {
  const sections = message.ephemeralSections;
  return sections !== undefined && sections.length > 0
    ? renderEphemeralBlock(sections)
    : undefined;
}

export function withWireBlock(
  wireBlock: string | undefined,
  items: DisplayItem[],
): DisplayItem[] {
  if (wireBlock === undefined) return items;
  const first = items.findIndex((item) => item.type === "user_text");
  return items.map((item, i) =>
    i === first && item.type === "user_text" ? { ...item, wireBlock } : item
  );
}

function collectDisplayItems(message: MessageParam): DisplayItem[] {
  // today's body of getDisplayItemsFromMessage, unchanged
}
```

(d) `_create_ai_chat.ts`, the queued-texts site (vendored :1715-1738; ruling 2):
the tool-result message is built and gets its sections before the bubbles are
added, so the first queued bubble can carry the block. `buildTurnSections` reads
`getEphemeralContext`, the controller's `_turnSectionParts()` and
`_drainForSend()`, never the queue (:526-556), so moving it ahead of the queue's
clear changes nothing it reads. The two `if`s on the same condition become one:

```ts
const queueEntries = ts.queuedMessages[0]();
const queuedTexts = queueEntries.map((q) => q.text);
const toolResultMsg = buildToolResultUserMessage(allResults, queuedTexts);
// A message typed mid-turn rides the tool-result message with its own
// sections, so the model learns where the user is now and the gate's
// reference moves with it; a bare tool-result message carries none.
// The typed messages' bubbles materialize here (they rendered from the
// queue signal until now), the first with the block the message is
// sent with, and their senders' promises resolve when this turn
// finishes.
if (queueEntries.length > 0) {
  const built = buildTurnSections(false, turn.conversationId);
  turn.viewReference = built.reference;
  attachSections(turn, toolResultMsg, built, updatedMessages);
  batch(() => {
    ts.queuedMessages[1]([]);
    turn.resolveOnFinish.push(...queueEntries.map((q) => q.resolve));
    addDisplayItemsTo(
      ts,
      withWireBlock(
        wireBlockOf(toolResultMsg),
        queuedTexts
          .filter((text) => text.trim())
          .map((text) => ({ type: "user_text", text: text.trim() })),
      ),
    );
  });
}

const messagesWithToolResults = [...updatedMessages, toolResultMsg];
```

(e) `_305_ai/mod.ts` (ruling 7):

```ts
export type {
  AIChatConfig,
  DisplayItem,
  DisplayRegistry,
} from "./_core/types.ts";
```

(f) `tests/ai_display_items_test.ts`, two cases (ruling 8). The oracle is the
wire itself, `renderOutgoingMessages`; the header's five-gate justification
gains one sentence saying so (gate 4: a bubble that shows a block other than the
one sent is the lie this field exists to prevent, and nothing else would catch
it).

```ts
import { renderOutgoingMessages } from "../modules/_110_ai_types/turn_logic.ts";
import { withWireBlock } from "../modules/_305_ai/_core/display_items.ts";
import type { DisplayItem } from "../modules/_305_ai/_core/types.ts";

Deno.test("a carrier's first bubble records the block its message is sent with, byte for byte", () => {
  const carrier: MessageParam = {
    role: "user",
    content: [{ type: "text", text: "What is this?" }],
    ephemeralSections: [
      { kind: "view-label", text: "[Current view: a]" },
      { kind: "consumer", text: "ctx" },
    ],
  };
  const [item] = getDisplayItemsFromMessage(carrier);
  const [sent] = renderOutgoingMessages([carrier])[0].content as ContentBlock[];
  assert(item.type === "user_text" && sent.type === "text");
  assertEquals(item.wireBlock, "<<<[[Current view: a]\n\nctx]>>>\n\n");
  assertEquals(`${item.wireBlock}${item.text}`, sent.text);
  // A message without sections has no block.
  const [plain] = getDisplayItemsFromMessage({ role: "user", content: "Hi" });
  assertEquals(plain, { type: "user_text", text: "Hi" });
});

Deno.test("withWireBlock puts the block on the first bubble only", () => {
  const items: DisplayItem[] = [
    { type: "user_text", text: "first" },
    { type: "user_text", text: "second" },
  ];
  assertEquals(withWireBlock("<<<[x]>>>\n\n", items), [
    { type: "user_text", text: "first", wireBlock: "<<<[x]>>>\n\n" },
    { type: "user_text", text: "second" },
  ]);
  assertEquals(withWireBlock(undefined, items), items);
});
```

(g) `DOC_AI_CHAT.md`: the wire paragraph (:134-150), after "a stored turn's
sections are inspectable persisted data (debugging win)", gains: "and a
carrier's first `user_text` display item records the block as sent (`wireBlock`,
from `renderEphemeralBlock`, the function `spliceSections` uses), so a
consumer's renderer can show what the message carried without parsing the wire;
at the queued-texts site the sections attach before the bubbles are added, for
the same reason". The persistence paragraph's additive list (:201-208) gains
"`user_text.wireBlock`: absent on older items, old readers ignore it".

**Not in this step.** The sync into this app, the preference and the renderer
(step 2). `tests/ai_turn_logic_test.ts`, whose assertions pass unchanged.
`modules/mod.ui.ts`.

**Gates.** Panther's floor (§0). On top of it:
`deno test tests/ai_display_items_test.ts tests/ai_turn_logic_test.ts` passes
with the two new cases present; after `deno run -A clean.ts`,
`git status
--porcelain` lists `modules/_305_ai/deps.ts` as the only `deps.ts`
changed; `grep -n renderEphemeralBlock modules/mod.ui.ts` prints nothing;
`grep -n 'DisplayItem,\|DisplayRegistry,' modules/_305_ai/mod.ts` prints both.

**Ends with.** One commit in `<panther>` on `main`, green, whose message says
why: a user bubble records the block its message was sent with, so a consumer
can show what the model received.

### Step 2 (app): the sync, the preference and the rendering

Runs here, branch `version2`.

**Surface.**

- `panther/**` and `deno.lock` (the sync commit only)
- `client/src/state/t4_ui.ts`
- `copilot/chat_pane.tsx`
- `copilot/ai_prompt_library/saveable_user_text_renderer.tsx`
- `SYSTEM_13_ai_assistant.md`
- `SYSTEM_14_client_shell.md`

**Deliverable.**

(a) **The sync commit.** From `<panther>`, on a clean `main` at step 1's commit
whose `deno task typecheck` passes, once `git status --porcelain` here lists no
tracked change: `./sync wb-fastr-v2 --force --no-commit` (`--force` skips only
the clean-target check, which the shared tree can fail on another session's
untracked files; `--no-commit` leaves staging to the session). Then one commit
here staging only `panther/` and, if it changed, `deno.lock`.
`panther/.panther-manifest.json` then names step 1's commit with
`pantherGitDirty: false`.

(b) `state/t4_ui.ts`, a "Copilot panel" section beside the shell's (ruling 4):

```ts
// ============================================================================
// Copilot panel
// ============================================================================

// Whether each user bubble shows the context block its message was sent
// with (the display item's wireBlock). A debugging aid, per browser.
const [contextBlocks, setContextBlocks] = createSignal<boolean>(
  localStorage.getItem("copilotContextBlocks") === "true",
);
export const copilotContextBlocks = contextBlocks;
export function setCopilotContextBlocks(show: boolean) {
  localStorage.setItem("copilotContextBlocks", String(show));
  setContextBlocks(show);
}
```

(c) `chat_pane.tsx`: the menu item directly under "View system prompt" (ruling
5), and the renderer map typed by name (ruling 7). `DisplayRegistry` and
`copilotContextBlocks`, `setCopilotContextBlocks` join the existing imports from
`panther` and `~/state/t4_ui`. The pane's local `ToolErrorRenderer` and
`SystemNoticeRenderer` already take the fields of the matching `DisplayItem`
members, so `satisfies` passes without retyping them.

```tsx
{
  label: copilotContextBlocks()
    ? t3({
      en: "Hide context blocks",
      fr: "Masquer les blocs de contexte",
      pt: "Ocultar os blocos de contexto",
    })
    : t3({
      en: "Show context blocks",
      fr: "Afficher les blocs de contexte",
      pt: "Mostrar os blocos de contexto",
    }),
  icon: copilotContextBlocks() ? "eyeOff" : "eye",
  onClick: () => setCopilotContextBlocks(!copilotContextBlocks()),
},
```

```ts
const customChatRenderers = {
  toolError: ToolErrorRenderer,
  systemNotice: SystemNoticeRenderer,
  userText: SaveableUserTextRenderer,
} satisfies DisplayRegistry;
```

(d) `saveable_user_text_renderer.tsx` (rulings 3, 6): the item is panther's
type; the bubble keeps its classes on the outer div, the block renders first
when the preference is on, and the markdown moves to an inner div. The save
button and `handleSave` are unchanged: they save `props.item.text`, never the
block.

```tsx
import { type Component, Show } from "solid-js";
import {
  createMarkdownIt,
  type DisplayItem,
  Icon,
  openComponent,
} from "panther";
import { copilotContextBlocks } from "~/state/t4_ui";

type UserTextItem = Extract<DisplayItem, { type: "user_text" }>;

export const SaveableUserTextRenderer: Component<{ item: UserTextItem }> = (
  props,
) => {
  // handleSave unchanged
  return (
    <div class="group ml-auto flex max-w-[80%] items-start gap-1">
      {/* save button unchanged */}
      <div class="bg-base-200 text-base-content min-w-0 flex-1 rounded px-4 py-3 text-left text-sm">
        <Show when={copilotContextBlocks() ? props.item.wireBlock : undefined}>
          {(block) => (
            <pre class="text-base-content-muted mb-3 text-xs whitespace-pre-wrap break-words">
              {block().trimEnd()}
            </pre>
          )}
        </Show>
        <div innerHTML={md.render(props.item.text)} />
      </div>
    </div>
  );
};
```

(e) **Docs.** `SYSTEM_13`: the chat pane's renderer paragraph (the `userText`
sentence, :403-412) gains "and, with the Show context blocks preference on
(`copilotContextBlocks`, S14), the block the message was sent with above the
text, from the display item's `wireBlock`"; the "What a message carries"
paragraph (:515-535) gains "The carrier's first bubble records the block as a
string (`wireBlock`), set by the engine from the function that writes the wire,
so the chat can show what each message carried"; the View system prompt sentence
(:905-912) gains "and the menu's Show context blocks shows, on each user bubble,
the block that message was sent with". `SYSTEM_14` §UI preferences adds
`copilotContextBlocks` to the persisted pairs, with its purpose.

**Not in this step.** Anything in panther beyond the sync. Panther's default
renderer. Bubbles saved before the field (ruling 9).

**Gates.** The floor (§0). On top of it: `./validate_protocols` prints no new
tier-2 flag and no stale-baseline note; `git show --stat` of the sync commit
lists only `panther/` paths and `deno.lock`;
`grep -n 'as Parameters<typeof AIChat>' copilot/chat_pane.tsx` prints nothing;
`grep -n wireBlock copilot/ai_prompt_library/saveable_user_text_renderer.tsx`
prints the `Show` line.

**Ends with.** The sync commit, then one commit for the preference, the renderer
and the docs. Each green.

## 5. Gates catalogue

| Gate                                                              | First reached |
| ----------------------------------------------------------------- | ------------- |
| Panther's floor, with the two display-item cases                  | Step 1        |
| `renderEphemeralBlock` absent from `modules/mod.ui.ts`            | Step 1        |
| The app's floor and a quiet `./validate_protocols`                | Step 2        |
| `panther/.panther-manifest.json` names step 1's commit, not dirty | Step 2        |
| No `as Parameters<typeof AIChat>` cast in `chat_pane.tsx`         | Step 2        |

## 6. Out of scope

- A block for a bubble saved before the field. No migration reconstructs one.
- The tool-result blocks and the assistant's side; a per-message copy
  affordance; a whole-conversation wire panel.
- Changing what the model is sent. This plan writes nothing new to the wire;
  `tests/ai_turn_logic_test.ts` passing unchanged is the evidence.
- Any change to View system prompt.

## 7. Rollout and rollback

- Nothing ships before step 2's review passes. After it, `version2` carries the
  change like any other; `./deploy_testing` is not part of a step.
- Rollback: reverting step 2's app commits removes the preference and the
  rendering, and the vendored engine's `wireBlock` is inert without a renderer
  that reads it. Reverting step 1 in panther and re-syncing leaves persisted
  bubbles with a `wireBlock` field an older reader ignores (the v2 additive
  rule), so no record breaks either way.

## 8. Build log

Append-only, newest last. One row per decision, deviation, correction or defect,
plus one closing row per session.

| Date | Step | Row |
| ---- | ---- | --- |
