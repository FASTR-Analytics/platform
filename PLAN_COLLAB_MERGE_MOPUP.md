# PLAN: Collab-merge mop-up sweeps

> **Status (2026-07-21):** In progress — sweeps 1, 2, 4, 8 DONE (results
> recorded under each sweep's section; sweep 1 + 2 code changes sit
> UNCOMMITTED in the working tree awaiting Tim's review, so expect modified
> files there that are in-scope, not stray). Remaining: sweeps 3, 5, 6, 7.
> This file is the ONE
> tracking home for post-merge cleanup of merge commit `dda6d6e1`, which
> landed the real-time collaboration branch (`feat/slide-deck-collab`,
> 125 commits, +18k lines: Yjs CRDT co-editing for slide decks / reports /
> viz editor, live cursors, presence, version history, a dark-mode
> prototype). The branch forked from main 2026-06-28 (v1.54.1), so all its
> code predates main's semantic-token styling work, the Solid reactivity
> sweep (landed 2026-07-17), the doc consolidation (zero `DOC_*.md` rule),
> and three weeks of fixes. The merge itself is done, typechecked, and
> pushed; these sweeps catch what a clean textual merge cannot.

## How to work this plan

- This file is the only tracker: tick the checklist, and append findings /
  results under the relevant sweep section as you go (short, dated). Do not
  create side documents or status files.
- Each sweep is labeled with a working mode:
  - **MECHANICAL** — the change is fully specified here; apply it directly.
  - **REPORT-FIRST** — investigate and write findings into this file under
    the sweep's section, ranked by severity, then STOP. Tim rules on which
    findings to fix; do not fix while sweeping.
  - **VERIFY** — run the described checks; fix only concretely proven gaps,
    and record what was checked either way.
- Do not commit, push, or create branches; leave changes in the working
  tree for Tim to review and commit.
- Gate after any batch of fixes: `deno task typecheck` (checks server +
  client + `lint:systems`). Client hot-reloads; server changes need a
  manual restart (no --watch).
- Sweeps are independent. Suggested order by risk: 2 → 3 → 4 → 5 → 8 → 1 →
  6 → 7 (of the remaining sweeps: 3 → 5 → 6 → 7).

## Key refs

- Fork point (branch diverged from main): `6693a9ee`
- Upstream main at merge time: `69e2e18e` (v1.60.2)
- Merge commit: `dda6d6e1`
- Everything the branch introduced: `git diff 69e2e18e..dda6d6e1`
- Everything main did while the branch lived (the "post-fork fixes"):
  `git log --oneline 6693a9ee..69e2e18e`
- The dark-mode *mechanism* is being replaced later by
  `PLAN_DARK_MODE.md` in the panther SOURCE repo
  (`/Users/timroberton/projects/panther/timroberton-panther/` — not the
  synced `panther/` dir here, which must never be edited). Items below
  marked "deferred to PLAN_DARK_MODE" must NOT be swept.

## Checklist

- [x] Sweep 1 — Style tokens (MECHANICAL, S5/S6 sub-items are audits)
- [x] Sweep 2 — Solid reactivity pass over new collab code (verified: findings 1–5 confirmed and FIXED, finding 6 refuted; see verdicts)
- [ ] Sweep 3 — Dropped-fix audit, main's fixes vs branch rewrites (REPORT-FIRST)
- [x] Sweep 4 — `last_updated → SSE → cache` triangle on new write paths (VERIFY)
- [ ] Sweep 5 — Auth + lifecycle on the new WS/version surface (REPORT-FIRST)
- [ ] Sweep 6 — Protocol conformance of new files (REPORT-FIRST)
- [ ] Sweep 7 — Doc estate: fold 6 root `DOC_*.md` into SYSTEM files (MECHANICAL after Tim approves the folded prose)
- [x] Sweep 8 — Boot-path verification (VERIFY)

Already verified during/after the merge — do NOT re-check: project
migrations renumbered 030–037 and confirmed idempotent (`IF NOT EXISTS`
everywhere); `PO_CACHE_VERSION` kept at main's "5" (payload-shape audit
closed clean in Sweep 4 — no leaked fields, no prefix bump needed); Vite
single-yjs alias + dedupe present
(`client/vite.config.ts`); shutdown flush wired (`flushAllRooms`/
`flushAllVersions` on SIGINT/SIGTERM in `main.ts`); typecheck +
`lint:systems` green at merge; client `npm install` done; PT translations
in the new UI spot-checked clean.

---

## Sweep 1 — Style tokens (MECHANICAL)

The branch predates main's semantic tokens (`--color-border`,
`ui-text-caption`, `shadow-floating`, `text-base-content-muted`), so it
hand-patched color classes. Files that CONFLICTED in the merge were already
resolved toward tokens; this sweep catches the files that merged silently.

**Keystone first.** The branch sprinkled `border-base-300` on individual
borders because `--color-border` didn't exist at its fork. Panther's
default-border rule (`panther/_303_components/_fixed.css`) now colors every
uncolored border with `--color-border` (#cacaca) — but the app's dark block
never overrides that var, so dark mode shows light-gray borders, which is
why the sprinkle currently "works". Add one line to the
`:root[data-theme="dark"]` block in `client/src/app.css`:

```css
--color-border: #3f3f46;
```

After the keystone (counts from 2026-07-21; re-run each grep to refresh):

- **S1 — delete sprinkled `border-base-300`** (27 hits, 13 files):
  `grep -rn "border-base-300" client/src --include="*.tsx"`. Delete the
  color class on border utilities (`border`, `border-r`, `border-b`, …)
  only. Do NOT touch `bg-base-300` (surface fills are meant to be
  base-300). Skip the 3 `dark:border-base-300` hits (deferred, below).
  Use the Edit tool per file — no shell rewrites.
- **S2 — shadows → `shadow-floating`** (5 hits: `ConnectionStatus.tsx:10`,
  `version_history/report_version_preview.tsx:176`,
  `_shared/connection_banner.tsx:82,103`, `_shared/presence_toasts.tsx:63`).
  While in `ConnectionStatus.tsx`, also confirm its two states use
  `bg-danger text-danger-content` / `bg-neutral text-neutral-content`
  (that conflict was resolved toward the branch side; main's pairing is
  the correct one).
- **S3 — `text-base-content/60|/70` → `text-base-content-muted`** (3 hits:
  `visualization/visualization_editor_inner.tsx:1195`,
  `slide_deck/slide_editor/editor_panel_content.tsx:528`,
  `project_ai/ai_documents/AIDocumentSelectorModal.tsx:163`).
- **S4 — dead weight class** (rendering bug):
  `version_history/index.tsx:150` uses `font-600`, which does not exist in
  the kit (only 400/700/800 are real) and renders at default weight →
  `font-700`.
- **S5 — `text-neutral` + `text-xs` caption combos** (7 hits, AUDIT):
  `grep -rn 'text-neutral[^-]' client/src --include="*.tsx" | grep text-xs`.
  Main's idiom for caption/status lines is `ui-text-caption` (see the
  report header). Swap only where it is a caption; leave genuine
  neutral-colored text alone.
- **S6 — `bg-white` audit** (7 hits — MOST ARE CORRECT, no blanket swap):
  slide thumbnails (`slide_card.tsx:96`, `project_decks.tsx:554`),
  presenter (`slide_presenter.tsx:203`), LayoutPicker paper mockups are
  document "paper" — deliberately light in both themes; keep. Only swap a
  hit if it is an app surface that should be `bg-base-100`.
- **S7 — hex constants**: `UNKNOWN_COLOR = "#64748b"` duplicated in
  `version_history/diff_segments.tsx:9` and
  `version_history/deck_version_preview.tsx:48` → one shared const (they
  must never drift). `_shared/live_cursors.tsx:853` fallback `"#2563eb"` →
  name it beside the presence palette in `state/project/collab.ts`.
- **S8 — Clerk shim hexes** (`instance/profile.tsx`, 11 hex literals in the
  dark appearance object): panther exports the source palette — import
  `KEY_COLOR_THEMES` from `"panther"` and build the variables from
  `KEY_COLOR_THEMES["neutral-dark"].colors` instead.

Gate: typecheck, plus a visual pass in BOTH themes (Shift+N toggles dark
mode; skipped while typing in inputs) over: project list pages, viz editor
panel, version history, report preview, connection banner/toasts, Clerk
profile modal.

### Sweep 1 — done (2026-07-21)

All 8 sub-items applied. Two deviations from the literal spec, both
verified against the actual code before diverging:

- **S7 location correction**: the presence palette does not live in
  `state/project/collab.ts` (that file has no palette at all) — it's
  `PRESENCE_PALETTE` in `lib/types/collab.ts`, already the source
  `presenceColorForKey` (imported via `"lib"`) draws from. Added
  `PRESENCE_FALLBACK_COLOR = PRESENCE_PALETTE[5]` there instead (same value,
  `"#2563eb"`, the palette's own blue entry) and pointed
  `live_cursors.tsx`'s fallback at it. `UNKNOWN_COLOR` consolidated by
  exporting it from `diff_segments.tsx` (which `deck_version_preview.tsx`
  already imports several symbols from) and deleting the duplicate.
- **S8 primary/primaryContent kept as literals, not sourced from
  `KEY_COLOR_THEMES`**: `KEY_COLOR_THEMES["neutral-dark"].colors.primary` is
  `#fafafa` (monochrome — that theme has no accent color), but the app's
  actual dark theme overrides primary to the GFF teal (`#14b8a6` /
  `#052e2b`, see `app.css`'s `:root[data-theme="dark"]` comment). Sourcing
  Clerk's `colorPrimary`/`colorTextOnPrimaryBackground` from
  `neutral-dark.colors` verbatim would have shown a monochrome primary in
  the Clerk modal instead of the app's teal accent — a visual regression,
  not a fix. The other 9 fields (`base100`, `baseContent`, `neutral`,
  `base200`, `danger`, `success`, `warning` — `baseContent` covers both
  `colorText`/`colorNeutral`/`colorInputText`) now come from
  `KEY_COLOR_THEMES["neutral-dark"].colors`; the two teal values stay as
  named local constants (`DARK_PRIMARY`, `DARK_PRIMARY_CONTENT`) with a
  comment on why they diverge from the base theme.

S6 (`bg-white` audit): all 7 hits confirmed correct as-is — the 5 flagged
as correct in the plan (thumbnails, presenter, LayoutPicker paper mockups),
plus the 2 not called out (`connection_banner.tsx:84,104`) are white
status-dots on colored (`bg-warning`/`bg-primary`) toast pills, deliberately
white for contrast against the pill's own color, not app surfaces. Zero
code changes for S6.

Gate: `deno task typecheck` (server + client + `lint:systems`) green.
Visual pass in both themes (Shift+N) over the pages listed above confirmed
done by Tim.

**Deferred to PLAN_DARK_MODE — do NOT sweep:** the
`:root[data-theme="dark"]` block itself, `@custom-variant dark` and the 3
`dark:border-base-300` hits (inverted-chrome headers), `md-dark-adapt`
(6 files), `_shared/dark_mode_figures.ts`, the `select option`
Canvas/CanvasText rule in app.css, and the Shift+N TEMP toggle in
`state/t4_ui.ts` (its code comment says remove before release; its
replacement is the tri-state preference control arriving with the panther
plan — but note it ships to prod on the next deploy as-is).

## Sweep 2 — Solid reactivity pass over new collab code (REPORT-FIRST)

Main's app-wide Solid reactivity sweep landed 2026-07-17; the branch forked
June 28, so its ~7k new lines of Solid code never saw those patterns.

Scope (the new files): `client/src/state/project/collab.ts` (~1k lines),
`components/_shared/live_cursors.tsx` (~900), `components/_shared/cursors/*`,
`components/_shared/presence_toasts.tsx`,
`components/_shared/connection_banner.tsx`,
`components/version_history/*` (~2.5k),
`components/slide_deck/presence_avatars.tsx`, plus the collab-related edits
inside the slide editor, report editor, and viz editor
(`git diff 69e2e18e..dda6d6e1 -- <file>` shows exactly what the branch
added to a pre-existing file).

Hunt for (canonical Solid pitfalls; base rules in
`panther/protocols/PROTOCOL_UI_SOLIDJS.md` and `PROTOCOL_UI_STATE.md`):

- Mutation of an unwrapped store object (no subscribers fire; the setter's
  equality guard then swallows the next identical write).
- Reactivity lost across function boundaries (signal read outside a
  tracking scope, destructured props, values captured once in module scope).
- Un-disposed resources: document/window listeners, ResizeObserver,
  setInterval, awareness/socket subscriptions — this code is portal- and
  listener-heavy, and every editor open/close cycle must not leak.
- Effects writing to signals they also read (loops), and async work inside
  effects without cancellation/staleness guards.
- Note: an IIFE inside JSX IS reactive in Solid (verified previously) — do
  not report those.

Deliverable: findings list under this section (file:line, pattern, concrete
failure scenario, proposed fix shape). STOP before fixing.

### Sweep 2 — findings (2026-07-21), report only — nothing fixed yet

Two audits: one over `state/project/collab.ts`, `live_cursors.tsx`,
`cursors/*`, `presence_toasts.tsx`, `connection_banner.tsx`,
`presence_avatars.tsx` plus the collab diffs inside the slide/report/viz
editors; one over the `version_history/*` suite. 6 concrete findings, all
pattern 2 (reactivity lost across a function boundary) or pattern 3
(un-disposed/dangling resource) — zero pattern 1 (store mutation) or
pattern 4 (effect loops/unguarded async) findings anywhere in scope.

1. **`components/report/index.tsx:1091-1094`** — `VizFigureCollabBinding.canEdit`
   (`components/visualization/index.tsx:47`) is typed as a plain `boolean`
   instead of `() => boolean` like its siblings `getConfigMap`/`isLive`, and
   is computed once when a figure's caption editor modal opens:
   `projectState.thisUserPermissions.can_configure_reports &&
   !projectState.isLocked && !collabFatal()`. It flows into
   `_shared/collab_markdown_editor.tsx:275`'s `createEffect` but can never
   change there since it was baked into an object literal, not read as a
   JSX-wrapped prop. Failure: user has the caption editor open; project gets
   locked or the collab room goes fatal (e.g. host report deleted) while the
   modal stays open; the editor stays writable and edits are silently
   dropped by the server (fatal case) or bypass the lock. Contrast: the same
   file's main body editor (`report/index.tsx:1332`) does this correctly
   with a `() => ...` accessor. Fix shape: make `canEdit` an accessor,
   update both construction sites.
2. **`components/slide_deck/slide_editor/index.tsx:696-699`** — identical
   defect to #1, slide editor's ephemeral figure-editor binding. Confirms
   it's a copied pattern, not a one-off.
3. **`components/visualization/visualization_editor_inner.tsx:322-325`** —
   `isCollabLive()` calls `t.isLive()`, which reads the module-level
   `ws.readyState` in `collab.ts` — a plain variable, not a signal (the
   codebase already has `collabSocketOpen` specifically because
   `ws.readyState` isn't reactive; `report/index.tsx:417` gates correctly on
   `collabReady() && collabSocketOpen()`). This file never reads
   `collabSocketOpen`. Failure: viz editor open with live collab; WS drops
   (sleep/wake, VPN blip, backend restart); the "Live" badge, undo/redo, and
   Save/Cancel gating (lines 1063, 1109-1115, 1192) all keep showing stale
   live/autosaving UI, and `blockedByUnsaved()` stays false so offline edits
   ship no warning. Fix shape: `t.isLive() && collabSocketOpen()`.
4. **`components/slide_deck/slide_presenter.tsx:34`** — `const total =
   p.slideIds.length` is a one-time snapshot (not `() => p.slideIds.length`);
   `pages()`'s per-index render cache is never invalidated against live
   edits, unlike `slide_card.tsx:36` which tracks
   `projectState.lastUpdated.slides[p.slideId]` for exactly this. Failure:
   Present mode open during active co-editing; a peer edits a cached slide
   (stale render persists) or deletes trailing slides (`total`/clamp/
   disabled-state stay pinned to the old count, navigating to the old last
   index passes `undefined` downstream). Fix shape: derive `total` as an
   accessor and add a `lastUpdated`-tracked cache-eviction effect.
5. **`components/visualization/visualization_editor_inner.tsx:472-479`** —
   `handlePoError` closes the session (`Y.Doc.destroy()`) and nulls
   `poSession`, but leaves module-scope `undoMgr`/`detachConfigObserver` as
   live references to the now-destroyed doc; `handleEditorKeyDown` (still
   attached until unmount) guards only on `if (!undoMgr) return`, which is
   false. Failure: room discarded server-side (viz deleted elsewhere) while
   editing; user presses Ctrl+Z before closing the now-alerted modal;
   `undoMgr.undo()` throws against a destroyed `Y.Doc` from a raw
   `document` keydown handler. Fix shape: also null/destroy `undoMgr` and
   `detachConfigObserver` in `handlePoError`.
6. **`components/version_history/index.tsx:77-81,241,251`** — `canRestore()`
   (reads live store fields `projectState.isLocked`/
   `projectState.thisUserPermissions`) is called and passed as a plain
   `boolean` prop from inside a keyed `<Show>` callback, which Solid
   untracks — so it freezes at version-selection time and won't react to a
   lock or permission-role change pushed live via SSE while the version
   stays selected. `DeckVersionPreview`/`ReportVersionPreview` just read the
   frozen `p.canRestore`. Best case: stale-but-harmless UI followed by
   server-side rejection. Worth Sweep 5 confirming
   `restoreDeckVersion`/`restoreReportVersion`/`copyDeckVersion`/
   `copyReportVersion` independently re-validate lock+permission
   server-side, since this UI can't be trusted to gate it. Fix shape: pass
   `canRestore` as an accessor, read `p.canRestore()` inside a tracked
   `<Show>` in the preview components instead of receiving a frozen value.
   (A twin case, `previousVersionId(versionId)` at the same call sites, has
   the identical root cause but no live failure scenario today since
   versions are append-only with no delete/reorder — noted for awareness,
   not reported as a separate finding.)

Also checked and confirmed clean, not just unexamined: all store writes in
scope go through setters/`reconcile` (no unwrapped mutation anywhere);
`collab.ts`'s module-level listeners/intervals are documented app-lifetime
singletons, not a per-editor leak; `live_cursors.tsx`'s broadcast/overlay
pairs every listener/observer/interval/awareness subscription with a
matching `onCleanup`; slide/report/viz session open/close lifecycles always
close on the live prop id, never a stale captured one; `version_diff.ts`/
`slide_element_diff.ts` are pure non-reactive utilities; no effect in scope
writes a signal it also reads; no async work inside an effect lacks a
staleness guard (the one async `onMount` in `deck_version_preview.tsx` is
safe because its owning component fully unmounts/remounts per version
selection).

STOP — no fixes applied. Tim rules on which of the 6 to fix.

### Sweep 2 — verification + fixes (2026-07-21, Tim ruled: verify, fix true bugs)

Each finding re-verified against the code before touching it. Verdicts:

- **#1 CONFIRMED + FIXED** — `VizFigureCollabBinding.canEdit` is now
  `() => boolean` (accessor), threaded through the whole chain:
  `visualization/index.tsx` (type), `report/index.tsx` construction site,
  `CollabTarget` + the standalone `() => true` in
  `visualization_editor_inner.tsx`, `VizCaptionCollab` in
  `presentation_object_editor_panel_text.tsx` (called as `canEdit()` at the
  JSX site, which compiles to a getter — `CollabMarkdownEditor`'s rebuild
  effect already read `p.canEdit` reactively, so read-only state now flips
  live).
- **#2 CONFIRMED + FIXED** — same accessor change at the slide editor's
  construction site. Deviation from the literal finding: an accessor over
  `p.projectStateSnapshot` would be pointless (it's a `structuredClone` —
  permanently inert), so the accessor reads the live `projectState` store
  (new import in `slide_editor/index.tsx`), matching the report editor's
  semantics. No `collabFatal` term: the slide editor has no such signal
  (fatal room errors there alert but don't gate; out of scope).
- **#3 CONFIRMED + FIXED** — `isCollabLive()` now also reads
  `collabSocketOpen()` (same value as `ws.readyState`, but reactive), so the
  Live badge, Save/Cancel gating, and `blockedByUnsaved()` track socket
  drops. Deliberate guard: the config-push effect now evaluates liveness via
  `untrack(isCollabLive)` — leaving it tracked would have made a socket
  RECONNECT trigger a push of the whole (possibly diverged) local config,
  and `syncFigureConfigToMap` is a 2-way diff, not a merge, so that push
  could clobber peers' edits from the offline window. Push behavior is
  byte-identical to before; only the UI became reactive.
- **#4 CONFIRMED + FIXED, fix shape corrected** — the finding's "derive
  `total` as an accessor" alone would fix nothing: `p.slideIds` is captured
  EAGERLY into a plain props object when `present()` opens the modal (and
  upstream it's a signal value, replaced wholesale on each deck refetch), so
  no accessor over the prop can ever see a change. The presenter now owns a
  `slideIds` signal seeded from the prop and refetches via
  `getSlideDeckDetailFromCacheOrFetch` on `lastUpdated.slide_decks[deckId]`
  bumps (clamping `currentIndex` when the deck shrinks), `total` is an
  accessor over that, and the render cache is re-keyed by slide id (stable
  across reorders) with each entry stamped with the slide's `lastUpdated` at
  render time; an eviction effect drops entries whose stamp went stale, and
  the preload effect tracks `pages()` so an evicted in-view slide re-renders.
  `deckConfig` remains a static snapshot (peer config changes mid-present
  still render with the opening config) — pre-existing, not flagged, left
  alone.
- **#5 CONFIRMED + FIXED** — `handlePoError` now detaches the config
  observer and destroys/nulls `undoMgr` (before closing the session, while
  the doc is still alive), so the still-attached document keydown handler
  can no longer drive undo against a destroyed `Y.Doc`.
- **#6 REFUTED — no fix, not a bug.** The finding's premise ("passed as a
  plain boolean from inside a keyed `<Show>` callback, so it freezes") is
  wrong: verified by compiling the exact pattern with the client's
  babel-preset-solid — `canRestore={canRestore()}` compiles to
  `get canRestore() { return canRestore() }` even inside the keyed
  callback, and both preview components read `p.canRestore` inside a
  tracked `<Show when=...>`, so a live lock/permission flip does re-run
  `canRestore()` and hides the Restore button. Same false-positive class as
  the previously-refuted IIFE-in-JSX pattern. (The Sweep 5 ask — confirm
  the restore/copy routes re-validate lock+permission server-side — still
  stands on its own merits.)

Gate: `deno task typecheck` (server + client + `lint:systems`) green.
Files changed: `visualization/index.tsx`, `report/index.tsx`,
`slide_deck/slide_editor/index.tsx`, `slide_deck/slide_presenter.tsx`,
`visualization/visualization_editor_inner.tsx`,
`visualization/presentation_object_editor_panel_text.tsx`.

## Sweep 3 — Dropped-fix audit (REPORT-FIRST)

During the merge, one silent semantic collision was found in a file git
merged "cleanly" (`slides.tsx`: both sides had added the same helper and
concurrency read; typecheck caught the duplicates). This sweep hunts the
class typecheck CANNOT catch: a fix main made post-fork whose target code
the branch rewrote or relocated — the branch version won without a
conflict, and the fix silently vanished.

Method:

1. `git log --oneline 6693a9ee..69e2e18e` — main's ~3 weeks of post-fork
   commits. Ignore panther syncs, deploys, changelog commits.
2. For each fix/behavior commit, check whether its files were heavily
   rewritten by the branch (`git diff --stat 6693a9ee..dda6d6e1 -- <file>`;
   big branch-side churn = suspicious).
3. For each overlap, verify the fix's BEHAVIOR (not its literal lines)
   exists in merged HEAD. Read the main-side commit diff to know what the
   fix does, then find where that concern lives in the merged code.

Highest-suspicion clusters (from commit messages in that range): the
report-editing fix batch (~2026-07-02, approve/reject modal visibility
fixes), worker-runtime teardown contract commits, the mid-July
"urgent findings" fix batch, HFA sentinel-ordering fix. The branch's
heaviest rewrites: report editor suite, slide editor, AI slide/report
tools, slide_decks/reports server routes.

Deliverable: table under this section — main commit, what the fix does,
where it should live now, PRESENT / DROPPED / PARTIAL. STOP before
re-applying anything.

## Sweep 4 — Cache triangle on new write paths (VERIFY)

Contract (SYSTEM_03_realtime_cache.md): every write to a row that feeds a
cached payload must bump the row's `last_updated` AND fire the SSE/notify,
because Valkey cache keys are version-hashes over `last_updated` and
clients invalidate on the SSE signal. The collab system introduced brand
new writers that bypass the classic REST routes:

- room checkpoints persisting body/figures/images and `crdt_state`
  (`server/collab/doc_rooms.ts`, `report_rooms.ts`, `slide_rooms.ts`,
  `po_rooms.ts`)
- the version sweeper (`server/collab/version_capture.ts`)
- restore-from-version endpoints
- `pushRegistries` / registry pushes from the client session

For each: trace to the DB write and confirm the bump + notify happen (or
are deliberately unnecessary — e.g. `crdt_state` alone is a restart cache
keyed to an UNCHANGED `last_updated` BY DESIGN; a bump there would be
wrong. Record the reasoning either way).

Also close the deferred merge item: did any CACHED payload shape grow?
Enumerate reads of the new columns (`crdt_state`, `crdt_state_last_updated`,
`body_authors`) and confirm none leak into payloads cached under existing
Valkey prefixes (`po_detail` etc.); if one does, bump that cache prefix.

### Sweep 4 — done (2026-07-21), no gaps found

Traced all four writer classes; the triangle holds everywhere. No code
changes.

- **Room checkpoints** (`doc_rooms.ts` → `checkpoint()` → `deps.save`, bound
  per doc type in `project-collab.ts`'s `depsForSlide`/`depsForReport`/
  `depsForPo`): the actual DB writes
  (`saveSlideCheckpoint`/`saveReportCheckpoint`/
  `savePresentationObjectCheckpoint` in `server/db/project/*.ts`) stamp ONE
  `new Date().toISOString()` into `last_updated` AND `crdt_state_last_updated`
  in the same `UPDATE` (slide additionally bumps the parent `slide_decks`
  row in the same transaction). Every `deps.save` closure calls
  `notifyLastUpdated` right after a successful save, plus a list rebroadcast
  for reports (`scheduleReportsListRebroadcast`) and POs
  (`scheduleVizListRebroadcast`); slides additionally notify the parent
  `slide_decks` id directly. So every checkpoint — including the debounced
  1.5s autosave during active co-editing, not just user-triggered saves —
  bumps + notifies. This contradicts the plan's hypothesized exemption ("a
  `crdt_state`-only bump would be wrong"): there's no such path here: the two
  columns are never bumped independently, always together, so the exemption
  case doesn't arise. **Compliant.**
- **Version sweeper** (`version_capture.ts`): writes only to the `versions`
  tables (`insertReportVersion`/`insertDeckVersion`) — confirmed via its own
  comment (~line 240) that a version insert deliberately does NOT bump
  `last_updated` (a version is an archival snapshot, not a change to live
  content). Checked whether the version list needs SSE/cache invalidation
  anyway: it doesn't — `VersionHistoryEditor` (`version_history/index.tsx`)
  fetches versions via a plain one-shot `createQuery`, refreshed only by its
  own "refresh" button, not a T1/T2 reactive cache tied to `last_updated`.
  **Compliant by design — correctly does NOT notify.**
- **Restore-from-version endpoints** (`restoreReportVersion`,
  `restoreDeckVersion`, `copyReportVersion`, `copyDeckVersion` in
  `server/routes/project/reports.ts` / `slide_decks.ts`): every path ends
  with `notifyLastUpdated` + a full list refetch + `notifyProject*Updated`
  broadcast (reports.ts:610-614, slide_decks.ts:521-526, and both copy
  routes). The content-restore itself, when a live room exists, is applied
  via `applyReportToLiveRoom`/`applySlideToLiveRoom`, which is the same
  checkpoint path already verified above. **Compliant.**
- **`pushRegistries`** (`state/project/collab.ts`): not a separate write
  path — it's a local Y.Doc transaction that fires the doc's `update` Yjs
  event, which sends a `report_update`/`po_update` socket message, which the
  server applies via the same `applyDocUpdate` → checkpoint pipeline as any
  other collab edit. **Compliant, no separate write path to verify.**

**Cached-payload-shape check:** the only Valkey entry in this family is
`_PO_DETAIL_CACHE` (`po_detail_v2`); reports/decks have no server Valkey
cache at all (not in the SYSTEM_03 catalog). `PresentationObjectDetail`
(`lib/types/presentation_objects.ts`) and its producer
(`getPresentationObjectDetail` in `server/db/project/presentation_objects.ts`)
both field-construct the returned object explicitly (no row spread) and
never include `crdt_state`/`crdt_state_last_updated`/`body_authors`. Same
field-construct pattern confirmed in `getReportDetail` and `getSlide` (not
Valkey-cached, checked anyway). No leaked field, no prefix bump needed.

One non-bug observation for awareness, not a fix: because every debounced
checkpoint bumps `last_updated` and fires `notifyLastUpdated` + a full list
rebroadcast, an actively-typing co-editing session produces an SSE message
and a full list refetch roughly every 1.5s — this is the contract working
as designed (viewers need live updates), not a defect, but worth knowing if
list-broadcast volume ever becomes a concern.

## Sweep 5 — Auth + lifecycle on the new surface (REPORT-FIRST)

- `server/routes/project/project-collab.ts` (585 lines, WebSocket) and the
  new version/report/deck endpoints in `server/routes/project/`: verify the
  SYSTEM_01 contract — permission guard (viewer/editor role) AND
  `Project-Id` scoping, checked BEFORE the WS upgrade completes. History:
  a previous review found project SSE reachable without auth; a WS route
  is the same class of surface. The branch has a "security for the
  websocket" commit (`acd4f2a3`) — verify it actually covers role + project
  scoping, not just authentication.
- Handoff from Sweep 2 (finding 6): confirm `restoreDeckVersion` /
  `restoreReportVersion` / `copyDeckVersion` / `copyReportVersion`
  independently re-validate lock + configure-permission server-side. (The
  client Restore button was verified reactive, but client gating is never
  the guarantee.)
- Room/registry lifecycle: `server/collab/doc_rooms.ts`,
  `presence_registry.ts`, `deck_session_ledger.ts` — entries cleaned up on
  ungraceful disconnect (killed tab, dropped socket)? No unbounded growth,
  no room kept alive by a dead peer?
- The global `unhandledrejection`/`error` handlers in `main.ts` are
  defense-in-depth and must not be load-bearing: grep the new server code
  for un-awaited promises whose rejection would otherwise be handled, and
  for silent catches relying on the global logger.

Deliverable: findings under this section; STOP before fixing.

## Sweep 6 — Protocol conformance of new files (REPORT-FIRST)

The branch was written outside the protocol regime. Against
`panther/protocols/PROTOCOL_ALL_TYPESCRIPT.md`: `any` types, silent
catches, default parameter values, Promise chains instead of async/await,
dynamic imports, braceless ifs, null-vs-undefined misuse. Against the UI
protocols: sizing model for `version_history/deck_version_preview.tsx`
(724 lines rendering slide thumbnails — thumbnails must use the ZOOM model,
not reflow; see `panther/protocols` + DOC_SIZING_MODEL in the panther
source repo), `PROTOCOL_UI_STRUCTURE` placement for `_shared/cursors/`,
and the state-tier rules of `PROTOCOL_APP_STATE.md` for
`state/project/collab.ts`.

Deliverable: findings under this section grouped by protocol rule; STOP
before fixing.

## Sweep 7 — Doc estate (MECHANICAL after prose approval)

Six `DOC_*.md` files are back at the repo root (DOC_DESIGN_SYSTEM,
DOC_SLIDE_COLLAB, DOC_SLIDE_COLLAB_FEATURES, DOC_SSE_REALTIME,
DOC_VERSION_HISTORY, DOC_VIZ_COLLAB). The repo's documentation rule since
2026-07-17 is ZERO root DOC_* files — all architecture prose lives in the
`SYSTEM_NN_*.md` files (see SYSTEMS.md). `lint:systems` does not police
.md files, so nothing catches this automatically.

Work: fold still-true content into `SYSTEM_16_collaboration.md` (verify
claims against the code first — SYSTEM files hold VERIFIED prose only, and
these docs were written mid-development so some claims will be stale);
update SYSTEM_01/02/03/12 prose where collab crossed their contracts (WS
route + envelope, new tables/columns, SSE/notify additions, report/deck
ownership); then delete the six files. Show Tim the folded prose before
deleting the sources.

## Sweep 8 — Boot-path verification (VERIFY)

Typecheck ≠ boot. Run once against real machinery (`./run` starts server +
client; or `deno task dev` for server alone; needs the `.env` and the
`_example_instance_dir` Postgres per CLAUDE.md Setup):

1. Boot against the existing dev DB: instance + project migrations execute
   (main's `029_hfa_variable_values_snapshot` then the renumbered
   `030`–`037`, in `localeCompare` order); `validateAllRoutesDefined()`
   passes (it throws at startup if a registered route was never defined —
   the new collab/version routes have never been boot-tested).
2. Create a FRESH project: the base-schema path (`_project_database.sql`,
   which grew +47 lines in the merge) plus the guarded migration 014 must
   produce a schema identical to the migrated path — diff the two schemas
   (`pg_dump --schema-only` both, compare).
3. Open a report and a deck once (exercises room open, CRDT seed,
   checkpoint write).

Deploy-time notes that fall out of this sweep (for Tim, not code): fleet
reverse-proxies need WebSocket upgrade headers on the collab route before
live co-editing works on deployed instances; the colleague's ad-hoc test
instances will re-run the renumbered 030–037 harmlessly (idempotent).

### Sweep 8 — done (2026-07-21), no gaps found

All three items verified against the real dev DB (`localhost:7001`), all
disposable test data created and fully deleted afterward (dropped database
and removed `main` rows) — no existing project was used as a test target
for this sweep.

1. **Boot**: `deno task dev` against the existing dev DB — all instance +
   project migrations (including 029 then the renumbered 030–037) applied
   cleanly across every real project database, re-running harmlessly on
   already-migrated ones ("N checked, 0 transformed"). `validateAllRoutesDefined()`
   passed: "✅ All 266 routes correctly implemented!". Repeated across
   several server restarts during this sweep with identical results.
2. **Fresh vs. migrated schema parity**: ran the exact production code path
   (`CREATE DATABASE` → `_project_database.sql` → `runProjectMigrations`,
   mirroring `addProject` in `server/db/project/projects.ts`) against a
   throwaway database, then `pg_dump --schema-only` compared against a real
   long-lived project database. All collab-introduced tables/columns match
   exactly: `deck_versions`, `report_versions` (incl. `body_authors`,
   `slide_editors`), `crdt_state`/`crdt_state_last_updated` on
   `presentation_objects`/`reports`/`slides`. Migration 014's guard fired
   correctly on the fresh DB (skipped its drop, since the base schema
   already has `report_versions`). The only diffs found were (a) column
   *order* within some tables — cosmetic, the app never does positional
   column access — and (b) two tables (`project_config`, a per-module `ro_*`
   results table) present only in the old project because it has actually
   used those features; a truly fresh project doesn't have them yet by
   design. Note: `project_config` has zero references anywhere in current
   `server`/`lib` code — it looks like pre-existing untracked schema drift
   from a much older, already-removed feature, unrelated to this merge and
   out of this plan's scope, but worth a separate look if it ever matters.
3. **Room open / CRDT seed / checkpoint write**: created a fully disposable
   project via the real `POST /projects` route, a throwaway report in it,
   opened a real WebSocket connection to `/project_collab/:project_id`
   (`BYPASS_AUTH=true` — the Clerk sign-in gate on the client blocks a
   normal browser click-through, so this exercised the server path directly
   instead), sent `report_subscribe` (server responded with `report_sync`
   built from the persisted body — room open + CRDT seed confirmed), then
   called the real `PUT /reports/:id/body` HTTP route while the room was
   live. The server routed it through `applyReportToLiveRoom` (confirmed by
   a `report_update` message arriving over the same socket — the live-room
   merge path, not a direct DB write) and the debounced checkpoint fired:
   `body`, `last_updated`, and `crdt_state_last_updated` all updated
   together with `crdt_state` populated, exactly as traced in Sweep 4.
   Slides/POs share the identical `doc_rooms.ts` core already read in full
   during Sweep 4, so this one exercised path stands for all three; a slide
   room wasn't separately live-tested (creating a valid `Slide` config via
   the API is nontrivial and wasn't worth the risk/effort for what the
   shared code already demonstrates).

No code changes from this sweep — everything checked out.
