# PLAN — Future AI adoptions (panther view/approval/interaction system)

Status: PARKED / adoption menu. Written 2026-07-17; updated 2026-07-20 after
panther Phases 1+2 (views + gating/validation); updated again 2026-07-21 —
**panther's own plan (`PLAN_AI_VIEWS_AND_APPROVAL.md` in the panther repo) is
now COMPLETE: all phases (0A/0B, 1–5) are implemented, verified, AND
adversarially reviewed** — interactions (feature 3), approval + policy (features
4/5), and a NEW feature this doc didn't previously cover — a built-in navigation
tool with AI-origin attribution (feature 8 below) — are all real, not just
Phases 1+2. **wb-fastr's vendored `panther/` copy is STALE** — verified
2026-07-21 it has Phases 0A–4 (interactions and approval types are present) but
**not Phase 5** (`createNavigationTool` / `buildToolCatalog` are absent from the
vendored `_305_ai/mod.ts`). **wb-fastr app code has adopted NONE of this yet** —
zero uses of `createAIViewController`/`defineAIViews` anywhere in `client/src`,
and HFA still runs the old `confirmChain` pattern this doc's feature 4 describes
replacing. Re-sync before starting any rung that touches feature 8. Nothing here
is required — every feature is opt-in behind config, adoption is per-surface and
per-feature, and "never adopt" is a fully supported end state. This doc exists
so the adoption options aren't forgotten once the panther work lands. All
file/line references and counts were verified 2026-07-17; they age — **re-grep
every reference at migration time.** See "Review findings that shape adoption
(2026-07-20)" AND "(2026-07-21, Phase 5)" below before starting rung 3 or
adopting feature 8.

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
- Before the first post-Phase-2 sync, run panther's `validateAIChatConfig`
  against both surfaces' tool arrays (one-off script) and fix any hits.

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

- 8 copy-pasted throws in `project_ai/tools/report_editor.ts` (lines 195, 244,
  283, 354, 389, 433, 477, 521) → `availableIn: ["editing_report"]`.
- `requireDeckContext()` helper in `project_ai/tools/slides.tsx` (`:48`) and its
  9 call sites (70, 121, 173, 227, 282, 335, 484, 521, 566) →
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

### 4. Tool approval (`approval: { prepare, mode, presentation }`)

Panther provides: a `prepare → preview → await decision → commit` lifecycle
where the mutation structurally cannot run before consent; inline card or
`openConfirm` modal presentation with structured previews (`changes`, `diff`,
markdown `description`, `intent: "danger"`, `confirmLabel`); a `present(signal)`
override for domain UIs (staged editor diffs); `stillValid` staleness checks;
auto-decline on view exit; `{skip}` for detected no-ops; "don't ask again this
conversation" (`mode: "session"`, persisted); decline as a normal (non-error)
tool result; and `approvalPolicy` (below).

**HFA adoption (the smallest, highest-value rung — do this first):**

- The five `confirmGate` write tools in `indicator_manager_hfa/ai/tools.ts`
  (update_labels, assign_categories, create, set_code, delete) →
  `approval.prepare` + `presentation: "modal"`. Each fits:
  `set_hfa_indicator_code`'s sequential per-indicator saves and
  partial-failure-on-throw semantics live unchanged inside its `commit` closure;
  `delete_hfa_indicators` keeps danger styling via `ApprovalPreview.intent` +
  `confirmLabel: "Delete"`.
- The structured previews the tools already compute stop degrading to
  `\n`-joined strings (today: lines 235, 321, 538, 595 flatten
  `{label, before, after}`-grade data into one collapsed paragraph).
- `confirmChain` (`tools.ts:54-63`) → deleted. It serializes dialogs against an
  engine that ran tools concurrently; the engine's sequential-execution contract
  makes it dead code.
- `validate_hfa_indicators` gained a `confirmGate` on its persist app-side
  (2026-07-17), so it is now the SIXTH confirm-gated write tool → migrate it to
  `approval.prepare` alongside the other five.

**Copilot adoption:**

- Report `proposeEdit` (`project_ai/types.ts:108-110` contract;
  `report/index.tsx:453-472` implementation) → `approval.prepare` with the
  `present(signal)` override staging the CodeMirror diff. This FIXES two live
  bugs: the orphaned proposal on navigate-away (type contract promises
  supersede-on-close; implementation orphans the modal, and a later accept still
  fires the `persistBody` server write at `report/index.tsx:522` against a
  torn-down editor) — auto-decline aborts the presenter's signal on view exit;
  and the identical-body no-op, which today throws and should map to `{skip}`.
- `update_*` validate-before-commit tools → `prepare` (validation) + `commit`
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

1. `proposeEdit` orphan: navigate-away leaves the staged modal live and a later
   accept fires `persistBody` (`report/index.tsx:522`) against a torn-down
   editor. Live correctness hole. A proper fix duplicates Feature 4's lifecycle
   machinery — wait for adoption (rung 2).
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

## Recommended adoption order

1. **HFA approval + policy** (features 4+5) — smallest diff, biggest safety win,
   exercises the new engine surface end-to-end on 5 tools.
2. **Copilot `proposeEdit` → approval** (feature 4) — kills the orphan bug.
3. **Copilot views + gating** (features 1+2) — the big rung: deletes the
   AIContext union interpretation sprawl and all ~23 guards; adds the two
   missing tab views. Do views and gating together (gating needs the registry).
   Decide `switch_tab`'s fate here too (feature 8, option 1 vs 2) even if
   feature 8/3 aren't adopted yet — it's cheaper to settle while already
   touching `navigation.ts` than to revisit it later.
4. **Copilot interactions + echo** (feature 3) — after views (the `filter` hook
   wants view context). **Before shipping this rung, resolve `switch_tab`
   attribution** (feature 8) — this is the point where an unattributed AI tab
   switch would start actually appearing as a false "User navigated" digest
   line; it's silent and easy to miss in review since nothing throws or looks
   broken.
5. **Copilot prompt catalog + promptSection** (feature 6) — after views; measure
   the cache-hit improvement.
6. **Copilot navigation tool** (feature 8) — bundle with rung 4 (see above)
   rather than as a separate rung; it exists specifically to serve interactions
   correctly.

Each rung ships independently; mixed states are supported indefinitely (the old
hand-rolled mechanisms keep working on the new engine until deleted).

## Relationship to other plans

`PLAN_AI_TOOL_GAPS.md` (read-projection/write-schema/stored-shape gaps, G1–G12)
is orthogonal content-level work — nothing here subsumes it. The tool-file
migration pass (rung 3) is a natural moment to fix its Tier-0 bugs.
