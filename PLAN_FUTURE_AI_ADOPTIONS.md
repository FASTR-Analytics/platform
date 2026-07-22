# PLAN — Future AI adoptions (panther view/approval/interaction system)

Status: ACTIVE / adoption in rungs. Written 2026-07-17; updated 2026-07-20
(panther Phases 1+2), 2026-07-21 (panther plan complete), 2026-07-22 (full
re-verification + rung restructure for staged implementation).

State verified 2026-07-22:

- **The vendored `panther/` copy is CURRENT** — the 2026-07-21 morning syncs
  (`4aeb7d2f`, `22c5f62c`) brought Phase 5; `createNavigationTool` and
  `buildToolCatalog` are present in `panther/_305_ai/`. No re-sync
  precondition remains.
- **Panther's own plan (`PLAN_AI_VIEWS_AND_APPROVAL.md`) is COMPLETE and has
  been DELETED** in the panther repo. The authoritative contract doc is
  **`DOC_AI_CHAT.md` at the panther repo root**
  (`~/projects/panther/timroberton-panther/DOC_AI_CHAT.md`) — it is NOT
  vendored (the sync copies modules + protocols only). Read it from the
  panther repo when implementing or reviewing any rung.
- **wb-fastr app code has adopted NONE of this yet** — zero uses of
  `createAIViewController` / `defineAIViews` / `availableIn` /
  `defineAIInteractions` anywhere in `client/src`; HFA still runs the old
  `confirmChain` pattern (`indicator_manager_hfa/ai/tools.ts:54`, six
  `confirmGate` sites).
- **The sync tripwires are already live** — the app deployed (1.61.1) after
  the Phase 5 sync with no construction throws, so both surfaces' tool arrays
  are de-facto clean. The old "run `validateAIChatConfig` before the first
  post-Phase-2 sync" gate is moot; it becomes rung 0 (committed smoke test).

Nothing here is required — every feature is opt-in behind config, adoption is
per-surface and per-feature, and "never adopt" is a fully supported end state.
File/line references were re-verified 2026-07-22 where noted; they age —
**re-grep every reference at migration time.** See "Review findings that shape
adoption (2026-07-20)" AND "(2026-07-21, Phase 5)" below before starting the
views rung or adopting feature 8.

## Workflow for this plan

Each rung below is implemented by a separate agent as one self-contained pass,
then independently reviewed before the next rung starts. Rules:

- One rung per pass; do not start the next rung in the same pass. Mixed states
  are supported indefinitely (old hand-rolled mechanisms keep working on the
  new engine until deleted), so every rung must land typecheck-green and
  shippable on its own.
- The implementing agent re-greps every file/line reference in its rung before
  editing (they drift), and reads `DOC_AI_CHAT.md` from the panther repo root
  for the feature contracts it is adopting.
- The reviewing agent verifies against the panther contracts and this doc's
  per-rung "review focus" notes, and checks nothing outside the rung's scope
  was touched.
- After a rung ships, update ONLY its checkbox/status line here — no session
  notes in this doc.

## Background

Panther's `_305_ai` engine is gaining an organizing layer for exactly the things
wb-fastr hand-rolls today: telling the model where the user is (views), scoping
tools to views (gating), reporting user edits between turns (interactions), and
confirm-before-apply (approval). wb-fastr has two AI surfaces that would adopt
independently:

- **Project copilot** (`client/src/components/project_ai/`) — 13-mode
  `AIContext` (11 original + `viewing_dashboards`/`viewing_cache` added
  2026-07-17), 42 tools, ~23 hand-rolled mode guards.
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
  clean 2026-07-17 (both surfaces); re-audited clean 2026-07-20 by panther's
  combined Phase 1+2 review; can only bite a future change, in dev. The
  strict-schema guard is wider than the original `z.strictObject` ban: it also
  catches `.catchall(z.never())` AND **enum/pattern-keyed `z.record`** inputs
  (keyed records reject unknown keys at parse — the same runtime failure). A
  tool named `str_replace_based_edit_tool` alongside `textEditorHandler` also
  throws (the built-in branch would silently shadow it). And `callAI` (one-shot)
  now throws on any tool declaring `availableIn` — never reuse view-gated chat
  tools in one-shot calls.
- ~~Before the first post-Phase-2 sync, run panther's `validateAIChatConfig`
  against both surfaces' tool arrays~~ — MOOT 2026-07-22: the sync landed and
  1.61.1 deployed after it with no construction throws, so both surfaces are
  de-facto clean. The durable version of this protection is rung 0 below.

## The features and how we'd adopt them

### 1. View registry + controller (`view()`, `defineAIViews`, `createAIViewController`)

Panther provides: typed view declarations (id, label fn, optional zod params,
optional live context, optional per-view `promptSection`), a controller
(`setView`/`clearView`/`current()`/`currentLabel()`), and automatic per-turn
delivery of `[Current view: <id> — "<label>"]` as typed ephemeral sections.

**Copilot adoption:**

- `AIContext` union (`project_ai/types.ts`, 13 arms — `viewing_dashboards` /
  `viewing_cache` were added app-side 2026-07-17, fixing the stale-mode gap
  ahead of adoption) → a `view()` registry of 13 views.
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
handler runs; a static "Only available in view(s): …" line auto-appended to tool
descriptions; `viewController.createTool` gives handlers the narrowed
`(input, view)` with typed params/context; construction-time validation of view
ids (including on dynamic `register()`).

**Copilot adoption — deletes all ~23 hand-rolled guards:**

- 8 copy-pasted throws in `project_ai/ai_tools/tools/report_editor.ts` (lines
  195, 244, 283, 354, 389, 433, 477, 521 — path corrected 2026-07-22, the tool
  files live under `ai_tools/tools/`, line numbers not re-verified) →
  `availableIn: ["editing_report"]`.
- `requireDeckContext()` helper in `project_ai/ai_tools/tools/slides.tsx` (1
  definition + 9 call sites, counts re-verified 2026-07-22) →
  `availableIn: ["editing_slide_deck", …]`.
- `slide_editor.tsx` guards (76, 147, and the `update_figure` mode branch at
  366-376) and `visualization_editor.tsx` guards (87, 109) → `availableIn`.
- `get_slide`'s deliberate guard-bypass becomes an explicit `availableIn`
  omission (documented in the tool, not an accident).
- **EXCEPT** `switch_tab`'s family guard in `navigation.ts:19`
  (`startsWith("editing_")` — "not while editing anything"): stays a one-line
  in-handler check. Enumerating all viewing ids would silently drift when a view
  is added.
- Tag tools with `kind: "read" | "write" | "nav"` while touching each file —
  free metadata that feeds approval policy later.

**HFA adoption:** none needed (one view).

### 3. Interaction log (`defineAIInteractions`, `notify`, `markAIEdit`)

Panther provides: typed interaction declarations with per-view relevance
(`relevantIn`), per-entry payload×view filtering (`filter`), coalescing,
formatting, echo suppression (`echoKey` + `markAIEdit` with a 30s TTL window), a
built-in `__navigation` digest line, and transactional engine-owned
drain/restore (digest restored if the send fails).

**Copilot adoption:**

- `pendingInteractions` queue + `notifyAI` (`project_ai/context.tsx:10-40`) +
  `reduceInteractions` (`project_ai/interactions.ts`) + the clear-inside-getter
  side effect (`project_ai/index.tsx:138-142`, correctness currently depends on
  the engine reading it exactly once) → one `defineAIInteractions` registry +
  `viewController.notify(...)` calls.
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

### 4. Tool approval (`approval: { propose, mode, presentation }`)

Panther provides: a `propose → preview → await decision → commit` lifecycle
where the mutation structurally cannot run before consent; inline card or
`openConfirm` modal presentation with structured previews (`changes`, `diff`,
markdown `description`, `intent: "danger"`, `confirmLabel`); a `customProposalUI(signal)`
override for domain UIs (staged editor diffs); `stillValid` staleness checks;
auto-decline on view exit; `{skip}` for detected no-ops; "don't ask again this
conversation" (`mode: "session"`, persisted); decline as a normal (non-error)
tool result; and `approvalPolicy` (below).

**Naming (renamed 2026-07-22, panther + both apps swept in lockstep):** the
propose phase was `prepare` (`PrepareResult`) and the custom-UI override was
`present` — now `propose` / `ProposalResult` / `ProposalPreview` /
`customProposalUI`. Vocabulary rule: "proposal" for what the tool produces,
"approval" for what the user grants and policy enforces. Rungs 3-5 use the
new names; old names exist nowhere.

**HFA adoption (the smallest, highest-value rung — do this first):**

- The five `confirmGate` write tools in `indicator_manager_hfa/ai/tools.ts`
  (update_labels, assign_categories, create, set_code, delete) →
  `approval.propose` + `presentation: "modal"`. Each fits:
  `set_hfa_indicator_code`'s sequential per-indicator saves and
  partial-failure-on-throw semantics live unchanged inside its `commit` closure;
  `delete_hfa_indicators` keeps danger styling via `ProposalPreview.intent` +
  `confirmLabel: "Delete"`.
- The structured previews the tools already compute stop degrading to
  `\n`-joined strings (today: lines 235, 321, 538, 595 flatten
  `{label, before, after}`-grade data into one collapsed paragraph).
- `confirmChain` (`tools.ts:54-63`) → deleted. It serializes dialogs against an
  engine that ran tools concurrently; the engine's sequential-execution contract
  makes it dead code.
- `validate_hfa_indicators` gained a `confirmGate` on its persist app-side
  (2026-07-17), so it is now the SIXTH confirm-gated write tool → migrate it to
  `approval.propose` alongside the other five.
- **Constraint (verified 2026-07-22):** `approval.mode: "session"` requires
  `presentation: "inline"` — the modal dialog has no "don't ask again"
  affordance and panther THROWS at construction on the combination
  (`tool_helpers.ts:367-371`). The modal presentation prescribed here is fine
  because no HFA tool wants session mode; don't add session mode later without
  switching that tool to inline.

**Copilot adoption:**

- Report `proposeEdit` (`project_ai/types.ts` contract; implementation now at
  `report/index.tsx:604` — re-verified 2026-07-22) → `approval.propose` with
  the `customProposalUI(signal)` override staging the CodeMirror diff.
- **The implementation has been substantially rewritten since this plan's
  original snapshot** (re-verified 2026-07-22): it now captures `baseBody` at
  proposal time, REBASES an accepted proposal over concurrent collaborator
  edits via `applyProposal` (`report/index.tsx:648`, skipped-hunk surfacing),
  and branches persistence on `collabReady()`. The migration's `commit`
  closure must absorb these semantics unchanged — budget for this; it is no
  longer a simple modal-swap.
- **Auto-decline scoping caveat (verified 2026-07-22, changes what this rung
  delivers):** panther's view-exit auto-decline is keyed to the tool's
  `availableIn` plus a bound view controller
  (`conversation_store.ts:78-82`) — a tool without `availableIn` has "declared
  view-independence and opted out", and the engine REJECTS `availableIn` on
  any tool when the chat has no `viewController`. Before the views rung, the
  copilot has neither, so migrating `proposeEdit` to approval does NOT make
  navigate-away dismiss the modal. What it CAN fix pre-views:
  1. The dangerous half of the orphan — a stale accept firing `persistBody`
     against a torn-down editor (`onCleanup` at `report/index.tsx:723-761`
     resets the AI context but never declines an open proposal) — via
     `stillValid` (`tool_helpers.ts:58`): return false once the report editor
     is unmounted or the mode has left `editing_report`; accept then resolves
     `auto_declined`.
  2. The identical-body no-op, which today throws
     (`report/index.tsx:610-613`) and should map to `{skip}`.
  The lingering-modal half fixes itself when the views rung adds
  `availableIn: ["editing_report"]` to the report tools.
- `update_*` validate-before-commit tools → `propose` (validation) + `commit`
  (write) — the same discipline they already follow, formalized.

### 5. Approval policy (`approvalPolicy: { requireForKind, requireKind, exempt }`)

Panther provides: construction throws for any `kind: "write"` tool without
`approval` or an `exempt` entry; `requireKind: true` additionally requires every
tool to declare `kind`, so a colleague's new write tool can never silently skip
approval — it over-asks or fails boot.

- **HFA:** set `{ requireForKind: "write", requireKind: true }` (12 tools, easy
  to tag).
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
editor tools). **Cache rule:** the call composed into the `system` accessor must
omit `currentView` (view-grouped ordering would bust the system cache breakpoint
on every navigation; the per-tool view annotations are static and included
regardless).

**HFA adoption:** optional; its prompt's tool list is small.

### 7. Misc surface

- `validateAIChatConfig(config)` — add one committed test per surface calling it
  against the real tool arrays, so tool-declaration mistakes fail CI, not a live
  conversation.
- `pendingUserAction()` — optional composer hint ("waiting for your decision")
  while an approval/question card is pending.
- Custom `DisplayRegistry` slots `approvalPending` / `approvalDecision` if we
  want to restyle the cards.

### 8. Built-in navigation tool (`viewController.createNavigationTool`) — NEW, panther Phase 5

Panther provides: a library-built AI tool that lets the model ask to navigate —
it validates the target against a view registry (params through the view's own
zod schema) and calls a consumer `onAiNavigation(target)` callback that performs
the ACTUAL routing; it does NOT call `setView` itself. The point: once feature 3
(interactions) is adopted and the `__navigation` digest is live, an AI-DRIVEN
tab switch would otherwise be misreported to the model next turn as "User
navigated from X to Y" — `createNavigationTool` closes that by opening an
attribution window around the callback (`markAINavigation()` before and after
awaiting it) so any `setView`/`clearView` it triggers is stamped `origin: "ai"`
and dropped from the digest before rendering. This is the SAME misattribution
class `markAIEdit` already solves for interaction entries, applied to
navigation.

**Directly relevant to `switch_tab`.** wb-fastr already has exactly one
AI-driven navigation tool today: `switch_tab`
(`project_ai/ai_tools/tools/navigation.ts`). Once views (feature 1) AND
interactions (feature 3) are both adopted, `switch_tab`'s resulting tab change —
today `updateProjectView({ tab })`, a synchronous Solid signal setter (verified
2026-07-21, `state/t4_ui.ts:201-216` — no async, no router) — would need to
route through `setView`/`clearView` for the view system to see it at all, and
WITHOUT attribution wired in, that change would misreport as a user action in
the next turn's digest. Three options at migration time, in order of preference:

1. **Rewrite `switch_tab` as `viewController.createNavigationTool` directly.**
   Cleanest, but `switch_tab`'s refusal semantics currently diverge from the nav
   tool's: `switch_tab` returns a plain string ("Cannot switch tabs - user is
   currently editing...") — a SOFT return, deliberately preserved per the
   2026-07-20 review finding below (a throw would flip it to `is_error: true`
   and change today's behavior) — while `createNavigationTool`'s refusal channel
   is throwing `AIToolFailure` from `onAiNavigation` (a hard, `is_error`
   refusal). Reconciling this means accepting the tone change, or keeping the
   soft-return check as a pre-check inside `onAiNavigation` that just doesn't
   call `setView` and returns its own message via a different path — check
   whether `createNavigationTool`'s config actually supports a non-throwing
   decline this way before committing (it currently does not; a soft decline
   would have to look like the callback resolving without navigating and the
   tool falling through to the standardized PENDING message, which is honest but
   not custom-worded).
2. **Keep `switch_tab` as a plain `createAITool`/`viewController.createTool`,
   but call `viewController.markAINavigation()` manually around the
   `updateProjectView`/`setView` call** — smaller diff, keeps the exact existing
   refusal wording and soft-return behavior, still gets correct attribution.
   Since the tab switch is confirmed synchronous, the fire-and-forget gap (next
   paragraph) does not apply here — a single `markAINavigation()` call
   immediately before `setView` is sufficient, no escape-hatch re-marking
   needed.
3. **Do nothing and accept the misattribution** — a real but low-stakes gap (the
   copilot's own tab switches would occasionally show up as fake "user
   navigated" digest lines). Only reasonable if features 1+3 are adopted without
   feature 8, and even then, option 2 above is cheap enough that there's little
   reason to choose this.

**The fire-and-forget attribution contract (Phase 5 review, 2026-07-21):** if
ANY future AI-driven navigation in this app performs routing asynchronously and
the tool's callback resolves BEFORE the real view change lands (e.g. a
lazy-loaded editor mount, a router transition that settles later via an effect)
— unlike today's synchronous `switch_tab` — the attribution window can close
before the real `setView` fires, misattributing it to the user. The fix is NOT
automatic: either await the routing to true completion inside `onAiNavigation`,
or call the public `viewController.markAINavigation()` again from wherever the
real `setView` eventually happens. Keep this in mind if `switch_tab` (or any
future nav tool) ever grows async routing (e.g. if tab content becomes
lazy-loaded).

**Other Phase 5 review notes relevant to any future adoption:**
`navAttributionMs`/`echoTtlMs` must be strictly positive —
`createAIViewController` throws at construction otherwise (only matters if a
future config override sets one to 0, which nothing here would deliberately do).
`createNavigationTool`'s `views` list is an explicit allowlist (not default-all)
— for the copilot this maps naturally onto whichever of the 13 views should be
AI-navigable; deep editor views reached only through component state
(`editing_slide`, `editing_visualization`) are natural candidates to EXCLUDE,
matching panther-test's own demonstration of the same choice.

**HFA adoption:** none — HFA has one view, nothing to navigate to.

## Worth fixing app-side even if we NEVER adopt

These are wb-fastr bugs the panther features would fix at migration; if we
decide not to adopt, fix them directly:

1. `proposeEdit` orphan: navigate-away leaves the staged modal live and a
   later accept fires the persist path against a torn-down editor
   (re-verified 2026-07-22: `onCleanup` at `report/index.tsx:723-761` resets
   the AI context but never declines the open modal; on accept
   `editorApi?.applyRebasedBody` silently no-ops and `persistBody` still
   writes). Live correctness hole. A proper fix duplicates Feature 4's
   lifecycle machinery — wait for adoption (rung 2 closes the stale-accept
   half via `stillValid`; rung 3 closes the lingering-modal half via
   `availableIn`).
2. ~~`validate_hfa_indicators` mutates server state with no confirm~~ — **FIXED
   app-side 2026-07-17** (`confirmGate` before the persist).
3. ~~`dashboards` / `cache` tabs missing from `AIContextSync`~~ — **FIXED
   app-side 2026-07-17** (two new `AIContext` arms + sync cases + prompt/label
   switches; `switch_tab`'s nav enum deliberately NOT extended — whether the AI
   may navigate to those tabs is a product decision for the views migration).
4. `getAllToolsList()` prompt drift (18 listed vs 42 registered). Hand-updating
   re-drifts immediately — wait for `buildToolCatalog` (rung 5).
5. SSE self-echo on persist-path AI writes (`project_ai/index.tsx:69-96`, no
   origin filter) — the model is told its own edits were user actions. A
   hand-rolled fix duplicates `markAIEdit` — wait for adoption (rung 4).

## Review findings that shape adoption (2026-07-20)

Panther's combined Phase 1+2 adversarial review audited THIS repo's guard sites
guard-by-guard. What it settled for the migration:

1. **The ~23 guard deletions lose nothing** — verified: every guard being
   deleted (all 8 report_editor throws, both slide_editor and both
   visualization_editor guards, `requireDeckContext`) tests ONLY the mode
   string. The nullable-within-correct-mode checks (`vizId: string | null`,
   `getSelection()` returning undefined) live inside handler bodies that migrate
   verbatim. Rung 3 is de-risked.
2. **Two situational redirects must move into tool DESCRIPTIONS** — the uniform
   gate message drops them: `requireDeckContext`'s "Close the slide editor first
   to make deck-level changes" (`slides.tsx:50-52`) and `update_figure`'s "use
   update_report_figure instead" (`slide_editor.tsx:374-376`). Panther
   deliberately offers no per-tool gate-message hints; the description is the
   cache-stable channel the model reads BEFORE its first refusal. Fold each
   redirect into the tool's description text during the migration sweep.
3. **One controller instance, period** — controller-created tools carry an
   identity stamp, and chat construction THROWS if a tool was made by a
   different `createAIViewController` instance than the chat's (id-set equality
   is not enough — the handler's narrowed view state reads the creating
   controller's signal). wb-fastr builds tools in separate modules
   (`build_tools.ts`): construct the controller once at module level and import
   it everywhere; never build a second controller from the same registry.
4. **Editor mount/unmount are setView sync sites** — today `getAIContext()` is
   DERIVED (it structurally cannot report `editing_slide` after the editor
   unmounts); the controller is IMPERATIVE. The tab map covers tab changes, but
   what flips modes to `editing_*` today is editor lifecycle — every editor
   mount/unmount/teardown must call `setView`/`clearView`, or the gate keeps
   ADMITTING execution against a torn-down context (panther's safety net covers
   labels/promptSections, deliberately not handlers). Enumerate the editor
   lifecycle hooks as sync sites in the rung-3 migration list.
5. **`switch_tab` keeps its soft return** — the family guard
   (`startsWith("editing_")`) migrates verbatim onto the full view-state union
   (`keyof` unions are string literals, so `.startsWith` typechecks). Keep it a
   RETURN, not a throw — a throw would become `is_error: true` on the wire and
   change today's behavior.
6. **Handler view narrowing requires `availableIn`** — panther blocks inferring
   the narrowed view type from a handler annotation alone (`NoInfer`), so
   "narrowed type but no gate" is unwritable. Declare `availableIn` on every
   tool that wants typed params/context; a tool that omits it gets the full
   state union and narrows manually (the `switch_tab` / `get_slide` pattern).

## Review findings that shape adoption (2026-07-21, Phase 5)

Panther's standalone Phase 5 adversarial review (three finder passes,
per-candidate verification, headline findings reproduced empirically against the
real engine) found and fixed six defects in the navigation tool + AI-origin
attribution surface before it shipped. What matters for this app's future
adoption:

1. **The fire-and-forget attribution gap is real and was reproduced live** — see
   feature 8 above. `switch_tab` is unaffected today (confirmed synchronous),
   but any future async navigation needs either full-await or the
   `markAINavigation()` escape hatch; this is a caller obligation the engine
   cannot enforce, only document.
2. **`switch_tab`'s soft-return refusal and `createNavigationTool`'s
   AIToolFailure-throw refusal are different shapes** — decide at migration time
   whether to reconcile them (see the three options under feature 8) or keep
   `switch_tab` as a plain gated tool with manual attribution.
3. **A cross-controller-instance construction throw applies to
   `createNavigationTool` exactly as it does to `createTool`** (both carry the
   identical `_viewController` identity stamp) — reinforces review finding 3
   from 2026-07-20 below: build the view controller ONCE at module level,
   `switch_tab` (or its replacement) included.
4. **`navAttributionMs`/`echoTtlMs` now throw at construction if set to `<= 0`**
   — a hardening, not a behavior change for any config this app would plausibly
   write; noted here only so a `0`-as-"disable" instinct doesn't get tried and
   doesn't silently misbehave instead of failing loud.

## Failure-channel ruling (2026-07-22)

Decided by Tim after the rung 1 review: `AIToolFailure` means any
**anticipated** failure — model-correctable input problems AND anticipated
operational failures (a failed server call, an unavailable resource). The
message is the complete record; the wire content to the model is identical
either way, so the classification controls only the timeline rendering
(clean row vs stack section). Plain `Error` is reserved for bugs — including
deliberate assertion/invariant throws ("should never happen"), which are bug
detectors, not anticipated failures. Authority: panther `DOC_AI_CHAT.md`
"Failure channel" (updated with this ruling; `tool_failure.ts` comment and
module README aligned).

Applied to the HFA surface (rung 1 file) 2026-07-22 — `tools.ts` now has
zero plain `Error` throws. The copilot's ~91 plain-`Error` throw sites
(counted 2026-07-22, zero `AIToolFailure` uses) migrate to this rule during
the rung 3 tool-file sweep; reviewers verify classification per this rule.

## Adoption rungs (implementation order)

One rung per implementation pass, independently reviewed before the next (see
"Workflow for this plan" above). Each rung ships independently; mixed states
are supported indefinitely (the old hand-rolled mechanisms keep working on the
new engine until deleted).

### Rung 0 — DEV-guarded eager `validateAIChatConfig` (feature 7) — [x]

Scope: revised from the original "one committed test per surface" — this repo
has no client test runner, and the real tool arrays are client-only,
SolidJS-entangled code that plain `deno test` cannot load, so a Vitest harness
would have been new infra built solely to satisfy the word "test," not the
actual goal. Instead, each surface now calls `validateAIChatConfig(config)`
guarded by `import.meta.env.DEV`, right where its real, fully-assembled
`AIChatConfig` object is constructed: copilot
(`client/src/components/project_ai/index.tsx`, the config object previously
inlined into the `AIChatProvider` JSX prop was factored into a `config` local
so it could be validated before render, then passed to `AIChatProvider`
unchanged) and HFA
(`client/src/components/indicator_manager_hfa/ai/index.tsx`, right after its
existing `config` local is assembled). Vite sets `import.meta.env.DEV` true in
dev and false in prod builds, so this runs against the real 42-tool and
12-tool arrays on every dev mount at zero production cost and zero new
tooling/dependencies — tool-declaration mistakes now fail loud on any dev page
load instead of only when someone opens the AI pane in a live conversation.

Review focus: both call sites validate the REAL registered `config` object
(no parallel/stub construction), the `import.meta.env.DEV` guard compiles out
in production builds, and nothing else changed.

### Rung 1 — HFA approval + policy (features 4+5) — [x]

Scope: the six `confirmGate` write tools → `approval.propose` +
`presentation: "modal"`; delete `confirmChain`; set
`approvalPolicy: { requireForKind: "write", requireKind: true }` and tag all
12 tools with `kind`. Smallest diff, biggest safety win, exercises the new
engine surface end-to-end.

Review focus: each `commit` closure preserves the old post-confirm semantics
verbatim (especially `set_hfa_indicator_code`'s sequential saves +
partial-failure-on-throw); structured previews replace the flattened
`\n`-joined strings; delete keeps danger styling; no session mode on modal
tools (construction throw).

Post-ship fixes (2026-07-22): two passes. First, the propose-closure
(then still named `prepare`)
validation throws (unknown varName, bad taxonomy ids, invalid time point,
duplicate-in-batch, already-exists) were converted from plain `Error` to
`AIToolFailure`. Then the failure-channel ruling (section above) landed and
the `commit`-phase and loader throws — anticipated operational failures —
were converted too. End state: `tools.ts` contains zero plain `Error`
throws; every deliberate throw is `AIToolFailure` per the ruling.

### Rung 2 — copilot `proposeEdit` → approval (feature 4) — [x]

Scope: `proposeEdit` → `approval.propose` with the `customProposalUI(signal)` override
staging the CodeMirror diff, `stillValid` guarding stale accepts, identical
body → `{skip}`. See the feature 4 copilot section for the 2026-07-22
caveats: the rebase/collab semantics must move into `commit` unchanged, and
this rung fixes only the stale-accept half of the orphan (view-exit
auto-decline needs rung 3's `availableIn`).

Review focus: `baseBody` capture and `applyProposal` rebase behavior are
byte-identical to today; `collabReady()` persistence branching preserved;
`stillValid` actually detects editor unmount; the plan's claim boundary
(lingering modal NOT fixed yet) is not silently papered over with app-side
hacks.

### Rung 3 — copilot views + gating (features 1+2) — [ ]

Scope: the big rung. 13-view registry replacing the `AIContext` union
interpretation sprawl; typed tab→view map; delete `getEphemeralContext`;
delete all ~23 hand-rolled guards via `availableIn` (per the guard-by-guard
inventory in feature 2 and the 2026-07-20 review findings — controller built
ONCE at module level, editor mount/unmount as `setView` sync sites, the two
situational redirects folded into tool descriptions, `switch_tab` keeps its
soft return); tag tools with `kind` in passing; add
`availableIn: ["editing_report"]` to the report tools, completing the rung-2
orphan fix. Decide `switch_tab`'s fate here (feature 8, option 1 vs 2) even
though attribution only starts mattering at rung 4. While sweeping each tool
file, apply the failure-channel ruling (section above) to its throw sites —
anticipated failures → `AIToolFailure`, assertion/bug throws stay plain
`Error`.

Review focus: the six 2026-07-20 review findings, one by one — they are the
known failure modes of this migration — plus throw-site classification per
the failure-channel ruling (~91 sites).

### Rung 4 — copilot interactions + echo + `switch_tab` attribution (features 3+8) — [ ]

Scope: `defineAIInteractions` registry replacing
`pendingInteractions`/`notifyAI`/`reduceInteractions`; `markAIEdit` on the
persist-path write tools to kill the SSE self-echo; keep the raw
non-notifying setters for temp-store edit tools; `__navigation` digest.
Bundled here: `switch_tab` attribution per the rung-3 decision — an
unattributed AI tab switch starts appearing as a false "User navigated"
digest line at exactly this rung, and it's silent (nothing throws), so it
cannot ship without this resolved.

Review focus: echo suppression on EVERY persist-path write tool feature 3
lists; AI edits must NOT route through the `manuallyUpdate*` notify wrappers;
`switch_tab` attribution present and (if async routing ever appears) the
fire-and-forget contract from the 2026-07-21 findings respected.

### Rung 5 — copilot prompt catalog + promptSection (feature 6) — [ ]

Scope: `buildToolCatalog` replaces the drifted `getAllToolsList()`; per-view
`promptSection` with ephemeral delivery making the system prompt byte-stable
across navigation.

Review focus: the cache rule — the system-accessor call must omit
`currentView`; measure and report the prompt-cache-hit improvement.

## Relationship to other plans

`PLAN_AI_TOOL_GAPS.md` (read-projection/write-schema/stored-shape gaps, G1–G12)
is orthogonal content-level work — nothing here subsumes it. The tool-file
migration pass (rung 3) is a natural moment to fix its Tier-0 bugs.
