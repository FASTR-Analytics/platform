# PLAN — Future AI adoptions (panther view/approval/interaction system)

Status: PARKED / adoption menu. Written 2026-07-17. Blocked on panther's
`PLAN_AI_VIEWS_AND_APPROVAL.md` (fifth revision, in the panther repo) being
implemented and synced. Nothing here is required — every feature is opt-in
behind config, adoption is per-surface and per-feature, and "never adopt" is a
fully supported end state. This doc exists so the adoption options aren't
forgotten once the panther work lands. All file/line references and counts were
verified 2026-07-17; they age — **re-grep every reference at migration time.**

## Background

Panther's `_305_ai` engine is gaining an organizing layer for exactly the
things wb-fastr hand-rolls today: telling the model where the user is (views),
scoping tools to views (gating), reporting user edits between turns
(interactions), and confirm-before-apply (approval). wb-fastr has two AI
surfaces that would adopt independently:

- **Project copilot** (`client/src/components/project_ai/`) — 11-mode
  `AIContext`, 42 tools, ~23 hand-rolled mode guards.
- **HFA assistant** (`client/src/components/indicator_manager_hfa/ai/`) — one
  context, 12 tools, hand-rolled `confirmChain` approval.

## What arrives with sync regardless of adoption

These ride the panther sync even if wb-fastr never adopts anything. No app code
changes; listed so they aren't a surprise:

- **Bug fixes we want anyway:** Stop works across chat instances (today a
  prompt-library turn started by `chat_pane.tsx`'s own `createAIChat` instance
  (`:116`) is unstoppable from the composer's Stop); one turn per conversation
  (no interleaving two sends into one store); queued messages land in the
  conversation they were typed in; typing while an `ask_user_questions` card is
  pending queues instead of destroying the card; no ghost bubbles from stopped
  queued messages.
- **Benign visible changes:** panther's conversation selector disables
  switch/delete/new while a turn runs (we already half-do this with
  `disabled: isLoading()`); Opus 4.8 conversations get ephemeral context as the
  standard marker block instead of a system entry (content identical).
- **Transparent:** persisted conversations migrate one-way to `formatVersion: 2`
  on first load (rollback-safe).
- **Tripwires (construction-time throws):** duplicate tool names and
  strict/unknown-key-rejecting tool schemas throw at chat construction. Audited
  clean 2026-07-17 (both surfaces); can only bite a future change, in dev.
- Before the first post-Phase-2 sync, run panther's `validateAIChatConfig`
  against both surfaces' tool arrays (one-off script) and fix any hits.

## The features and how we'd adopt them

### 1. View registry + controller (`view()`, `defineAIViews`, `createAIViewController`)

Panther provides: typed view declarations (id, label fn, optional zod params,
optional live context, optional per-view `promptSection`), a controller
(`setView`/`clearView`/`current()`/`currentLabel()`), and automatic per-turn
delivery of `[Current view: <id> — "<label>"]` as typed ephemeral sections.

**Copilot adoption:**

- `AIContext` union (`project_ai/types.ts:119-130`, 11 arms) → a `view()`
  registry of 11 views, **plus the two missing ones**: `dashboards` and `cache`
  tabs have no `AIContextSync` case today
  (`project/index.tsx:57-88` handles only 7 tabs), so the AI silently sees a
  stale mode there. Fix by construction during migration.
- `AIContextSync` switch → a typed `Record<TabOption, ViewId>` so a new tab
  fails typecheck instead of silently going stale.
- `getEphemeralContext` string builder (`project_ai/index.tsx:111-144`) →
  deleted. The live parts (deck's selected slide ids, report editor's selection
  preview) move onto view labels via the `(params, context)` signature.
- Chat-pane per-mode label switches (`chat_pane.tsx:263` and `:305`) →
  `viewController.currentLabel()`.
- Other `aiContext().mode` readers outside tool handlers move to `current()`:
  `DraftVisualizationPreview.tsx`, `DraftSlidePreview.tsx`, and `drafts.tsx`
  (mode-branched add-to-deck behavior).
- Per-mode prompt `switch` (`build_system_prompt.ts:281-305`) → `promptSection`
  on each view with `"ephemeral"` delivery — the system prompt becomes
  byte-stable across navigation. Measure the prompt-cache-hit improvement; it
  should be significant.

**HFA adoption:** a one-view registry (just a label) — or skip entirely; views
buy HFA almost nothing.

### 2. Tool↔view binding + soft gating (`availableIn`, `kind`)

Panther provides: `availableIn: [viewIds]` on tools; the engine refuses
out-of-view executions with a standardized self-correcting error before the
handler runs; a static "Only available in view(s): …" line auto-appended to
tool descriptions; `viewController.createTool` gives handlers the narrowed
`(input, view)` with typed params/context; construction-time validation of view
ids (including on dynamic `register()`).

**Copilot adoption — deletes all ~23 hand-rolled guards:**

- 8 copy-pasted throws in `project_ai/tools/report_editor.ts` (lines 195, 244,
  283, 354, 389, 433, 477, 521) → `availableIn: ["editing_report"]`.
- `requireDeckContext()` helper in `project_ai/tools/slides.tsx` (`:48`) and
  its 9 call sites (70, 121, 173, 227, 282, 335, 484, 521, 566) →
  `availableIn: ["editing_slide_deck", …]`.
- `slide_editor.tsx` guards (76, 147, and the `update_figure` mode branch at
  366-376) and `visualization_editor.tsx` guards (87, 109) → `availableIn`.
- `get_slide`'s deliberate guard-bypass becomes an explicit `availableIn`
  omission (documented in the tool, not an accident).
- **EXCEPT** `switch_tab`'s family guard in `navigation.ts:19`
  (`startsWith("editing_")` — "not while editing anything"): stays a one-line
  in-handler check. Enumerating all viewing ids would silently drift when a
  view is added.
- Tag tools with `kind: "read" | "write" | "nav"` while touching each file —
  free metadata that feeds approval policy later.

**HFA adoption:** none needed (one view).

### 3. Interaction log (`defineAIInteractions`, `notify`, `markAIEdit`)

Panther provides: typed interaction declarations with per-view relevance
(`relevantIn`), per-entry payload×view filtering (`filter`), coalescing,
formatting, echo suppression (`echoKey` + `markAIEdit` with a 30s TTL window),
a built-in `__navigation` digest line, and transactional engine-owned
drain/restore (digest restored if the send fails).

**Copilot adoption:**

- `pendingInteractions` queue + `notifyAI` (`project_ai/context.tsx:10-40`) +
  `reduceInteractions` (`project_ai/interactions.ts`) + the
  clear-inside-getter side effect (`project_ai/index.tsx:138-142`, correctness
  currently depends on the engine reading it exactly once) → one
  `defineAIInteractions` registry + `viewController.notify(...)` calls.
- `edited_slide`'s deck-membership and current-slide reductions → the `filter`
  hook (payload × view context, e.g. `view.context.getSlideIds()`).
- **SSE self-echo fix** — the real echo path is the global SSE listener
  (`project_ai/index.tsx:69-96`): it notifies `edited_slide` / viz-updated /
  `deck_structure_changed` on ALL `lastUpdated` row changes for
  slides/presentation_objects/slide_decks with **no origin filter**, so AI
  writes that persist server-side echo back as "user actions". Add
  `markAIEdit(key)` in the persist-path write tools (createSlide, updateSlide,
  deleteSlides, duplicateSlides, moveSlides, add_slide_to_deck, the
  immediate-persist figure branches) with matching `echoKey` on the
  interactions. Only report-body edits have suppression today
  (`applyingProgrammaticEdit`, `report/index.tsx:222`).
- **Preserve what already works:** temp-store-only edit tools are structurally
  echo-free — AI tools get the raw non-notifying setters (`setTempSlide` at
  `slide_editor/index.tsx:202`, `setTempConfig` at
  `visualization_editor_inner.tsx:227`) while user edits go through the
  `manuallyUpdate*` notify wrappers. The migration must keep the raw setters on
  view context; do not route AI edits through the notify wrappers.
- Navigation reporting comes free (`__navigation` digest) — today the model
  never learns the user moved between messages.

**HFA adoption:** none today (no interaction reporting exists); optional later.

### 4. Tool approval (`approval: { prepare, mode, presentation }`)

Panther provides: a `prepare → preview → await decision → commit` lifecycle
where the mutation structurally cannot run before consent; inline card or
`openConfirm` modal presentation with structured previews (`changes`, `diff`,
markdown `description`, `intent: "danger"`, `confirmLabel`); a
`present(signal)` override for domain UIs (staged editor diffs); `stillValid`
staleness checks; auto-decline on view exit; `{skip}` for detected no-ops;
"don't ask again this conversation" (`mode: "session"`, persisted); decline as
a normal (non-error) tool result; and `approvalPolicy` (below).

**HFA adoption (the smallest, highest-value rung — do this first):**

- The five `confirmGate` write tools in `indicator_manager_hfa/ai/tools.ts`
  (update_labels, assign_categories, create, set_code, delete) →
  `approval.prepare` + `presentation: "modal"`. Each fits:
  `set_hfa_indicator_code`'s sequential per-indicator saves and
  partial-failure-on-throw semantics live unchanged inside its `commit`
  closure; `delete_hfa_indicators` keeps danger styling via
  `ApprovalPreview.intent` + `confirmLabel: "Delete"`.
- The structured previews the tools already compute stop degrading to
  `\n`-joined strings (today: lines 235, 321, 538, 595 flatten
  `{label, before, after}`-grade data into one collapsed paragraph).
- `confirmChain` (`tools.ts:54-63`) → deleted. It serializes dialogs against an
  engine that ran tools concurrently; the engine's sequential-execution
  contract makes it dead code.
- **Decide at migration:** `validate_hfa_indicators` mutates server state
  (`bulkUpdateHfaIndicatorValidation`, `tools.ts:452`) with **no confirm
  today**. Under the policy below it must gain `approval` or an explicit
  `exempt` entry, or HFA throws at boot. (It should probably just get
  `approval` — see "worth fixing regardless" below.)

**Copilot adoption:**

- Report `proposeEdit` (`project_ai/types.ts:108-110` contract;
  `report/index.tsx:453-472` implementation) → `approval.prepare` with the
  `present(signal)` override staging the CodeMirror diff. This FIXES two live
  bugs: the orphaned proposal on navigate-away (type contract promises
  supersede-on-close; implementation orphans the modal, and a later accept
  still fires the `persistBody` server write at `report/index.tsx:522` against
  a torn-down editor) — auto-decline aborts the presenter's signal on view
  exit; and the identical-body no-op, which today throws and should map to
  `{skip}`.
- `update_*` validate-before-commit tools → `prepare` (validation) + `commit`
  (write) — the same discipline they already follow, formalized.

### 5. Approval policy (`approvalPolicy: { requireForKind, requireKind, exempt }`)

Panther provides: construction throws for any `kind: "write"` tool without
`approval` or an `exempt` entry; `requireKind: true` additionally requires
every tool to declare `kind`, so a colleague's new write tool can never
silently skip approval — it over-asks or fails boot.

- **HFA:** set `{ requireForKind: "write", requireKind: true }` (12 tools, easy
  to tag; this is what forces the `validate_hfa_indicators` decision).
- **Copilot:** optional/later. If adopted, tools that deliberately mutate
  without approval (`update_report_figure`, `update_figure`'s live-preview and
  immediate-persist branches) go in `exempt`.

### 6. Derived prompt sections (`buildToolCatalog`, `promptSection()`)

Panther provides: `buildToolCatalog(tools)` renders the registry's real
names/descriptions as markdown — it cannot drift because it IS the registry.

**Copilot adoption:** replace the hand-typed `getAllToolsList()`
(`build_system_prompt.ts:633-652` — 18 entries interpolated 11 times, already
heavily drifted from the 42 registered tools: omits `create_report`, all 8
report_editor tools, all 10 slides tools, all 3 slide_editor tools, both viz
editor tools). **Cache rule:** the call composed into the `system` accessor
must omit `currentView` (view-grouped ordering would bust the system cache
breakpoint on every navigation; the per-tool view annotations are static and
included regardless).

**HFA adoption:** optional; its prompt's tool list is small.

### 7. Misc surface

- `validateAIChatConfig(config)` — add one committed test per surface calling
  it against the real tool arrays, so tool-declaration mistakes fail CI, not a
  live conversation.
- `pendingUserAction()` — optional composer hint ("waiting for your decision")
  while an approval/question card is pending.
- Custom `DisplayRegistry` slots `approvalPending` / `approvalDecision` if we
  want to restyle the cards.

## Worth fixing app-side even if we NEVER adopt

These are wb-fastr bugs the panther features would fix at migration; if we
decide not to adopt, fix them directly:

1. `proposeEdit` orphan: navigate-away leaves the staged modal live and a later
   accept fires `persistBody` (`report/index.tsx:522`) against a torn-down
   editor. Live correctness hole.
2. `validate_hfa_indicators` mutates server state with no confirm
   (`tools.ts:426-460`).
3. `dashboards` / `cache` tabs missing from `AIContextSync` — AI sees a stale
   mode there (`project/index.tsx:57-88`).
4. `getAllToolsList()` prompt drift (18 listed vs 42 registered).
5. SSE self-echo on persist-path AI writes (`project_ai/index.tsx:69-96`, no
   origin filter) — the model is told its own edits were user actions.

## Recommended adoption order

1. **HFA approval + policy** (features 4+5) — smallest diff, biggest safety
   win, exercises the new engine surface end-to-end on 5 tools.
2. **Copilot `proposeEdit` → approval** (feature 4) — kills the orphan bug.
3. **Copilot views + gating** (features 1+2) — the big rung: deletes the
   AIContext union interpretation sprawl and all ~23 guards; adds the two
   missing tab views. Do views and gating together (gating needs the
   registry).
4. **Copilot interactions + echo** (feature 3) — after views (the `filter`
   hook wants view context).
5. **Copilot prompt catalog + promptSection** (feature 6) — after views;
   measure the cache-hit improvement.

Each rung ships independently; mixed states are supported indefinitely (the
old hand-rolled mechanisms keep working on the new engine until deleted).

## Relationship to other plans

`PLAN_AI_TOOL_GAPS.md` (read-projection/write-schema/stored-shape gaps, G1–G12)
is orthogonal content-level work — nothing here subsumes it. The tool-file
migration pass (rung 3) is a natural moment to fix its Tier-0 bugs.
