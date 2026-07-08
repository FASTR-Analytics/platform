# Slide Deck Collaboration — Architecture

How the real-time slide co-editing system works, end to end. The companion
doc [DOC_SLIDE_COLLAB_FEATURES.md](DOC_SLIDE_COLLAB_FEATURES.md) catalogs the
user-facing behavior.

```
┌────────────── client (per browser tab) ──────────────┐        ┌─────────── server ───────────┐
│ SlideEditor                                          │        │                               │
│  tempSlide (Solid store) ⇄ session Y.Doc ⇄ CodeMirror│  WS    │ per-slide Room                │
│        │  syncSlideToDoc / materializeSlide          │◄──────►│  authoritative Y.Doc          │
│  PeerSelectionOverlay / PresenceAvatars              │        │  relay + debounced checkpoint │
│  collab.ts: one WS per project (presence + docs)     │        │ presence_registry (per proj)  │
└──────────────────────────────────────────────────────┘        │  Postgres: slides.config +    │
                                                                │  crdt_state (+timestamps)     │
                                                                └───────────────────────────────┘
```

## 1. Transport — one WebSocket per project

- Endpoint: `GET /project_collab/:project_id`, upgraded in
  [server/routes/project/project-collab.ts](server/routes/project/project-collab.ts)
  (registered in [main.ts](main.ts)). Auth mirrors the SSE endpoint and runs
  **before** the upgrade: Clerk user → project access; presence requires
  `can_view_slide_decks`; the connection is stamped `canEdit =
  can_configure_slide_decks` and every edit op re-checks it.
- Client manager: [client/src/state/project/collab.ts](client/src/state/project/collab.ts).
  `ProjectSSEBoundary` ([t1_sse.tsx](client/src/state/project/t1_sse.tsx))
  calls `connectCollab(projectId)` on mount / `disconnectCollab()` on cleanup,
  so presence is live anywhere inside a project, not just in the editor.
- Message protocol ([lib/types/collab.ts](lib/types/collab.ts)):
  - client → server: `presence_update`, `slide_subscribe`, `slide_update`,
    `slide_unsubscribe`, `awareness_update` (plus a reserved `heartbeat`,
    currently unused).
  - server → client: `hello` (connectionId), `presence_state` (full peer
    list), `slide_sync`, `slide_update`, `slide_error`, `awareness`.
- Reconnect: exponential backoff (max 5 attempts). Close-intent is tracked
  **per socket** (WeakSet) so a project switch can't mistake its own teardown
  for a failure and open a duplicate connection. `socket.onopen` re-sends
  presence and re-subscribes every open slide session.
- Ops requirement: nginx must forward WebSocket upgrade headers on
  `/project_collab` (the server-cli site generator emits this; older sites
  were patched in place).

## 2. Presence — who is where

- Server: [presence_registry.ts](server/task_management/presence_registry.ts)
  keeps `projectId → connectionId → PresenceEntry` where the entry is
  server-stamped identity (`email`, `name`, `color` via
  `presenceColorForKey(email)`) plus the client-controlled view fields
  (`avatarUrl`, `deckId`, `slideId`, `selectedBlockId`, `selectedTextTarget`).
  View fields are replaced **wholesale** on every `presence_update` so a
  client clears them by omission; every change broadcasts the full peer list
  to the whole project.
- Client: a Solid store mirrors `presence_state`; `otherPeers()` filters out
  self by connectionId. Consumers: deck thumbnails
  ([project_decks.tsx](client/src/components/project/project_decks.tsx)),
  deck header + per-slide cards
  ([slide_list.tsx](client/src/components/slide_deck/slide_list.tsx),
  [slide_card.tsx](client/src/components/slide_deck/slide_card.tsx)) via
  [presence_avatars.tsx](client/src/components/slide_deck/presence_avatars.tsx),
  the in-editor peer overlay, and the AI busy-guard.
- Semantics: `slideId` set ⇔ that user has the slide open in the editor
  (set on editor mount, cleared to deck-level on unmount).
  `selectedBlockId` (layout node id) and `selectedTextTarget` (panther text
  primitive id, e.g. `coverTitle`/`headerText`) are mutually exclusive and
  say which element they're editing.

## 3. The CRDT model — Slide ⇄ Y.Doc

[lib/collab/slide_crdt.ts](lib/collab/slide_crdt.ts) is the shared bridge
(compiled into both server and client). Doc schema, under one root Y.Map:

- **Scalars** (type, split, flags, style knobs): plain values, `setScalar`
  (identity-compare write).
- **Text fields**: every root title/header field (content
  header/subHeader/date/footer; cover title/subtitle/presenter/date; section
  sectionTitle/sectionSubtitle) and every text block's `markdown` is a
  **Y.Text** — this is what makes character merging and remote carets
  possible. Optional fields exist as empty Y.Text so editors can bind before
  first input; `materializeSlide` omits optional-empties and keeps required
  ones. `syncText` applies a minimal single-region 2-way diff.
- **Layout tree**: nested Y.Maps keyed by node id under a `children` Y.Map,
  ordered by a `fracIndex` fractional-index key
  ([fractional-indexing](https://www.npmjs.com/package/fractional-indexing)) —
  reorders touch only out-of-order siblings, so concurrent moves don't
  clobber each other. Type changes rebuild a node in place.
- **Opaque values** (style objects, and a figure's heavy `figData`): stored as
  plain JSON values via `setOpaque`, which short-circuits on reference equality
  (a WeakMap cache) before falling back to a `canonicalJson` content compare.
  **Invariant:** callers must pass structurally-shared values — a changed
  value must be a NEW object reference (the editor's path-set write-backs
  guarantee this; `reconcile()` merges in place and must not be used to write
  figure bundles). `setOpaqueByValue` is the sibling for small values a caller
  may mutate in place (config sub-objects): it clones on store and always
  content-compares (no reference cache).
- **Figures are decomposed, not one opaque blob.** A figure node splits its
  `FigureBundle` into `figConfig` (a nested `Y.Map` via the
  `lib/collab/figure_config_crdt.ts` bridge — so the visualization config
  co-edits field-by-field, captions per character) + `figData` (the opaque
  remainder: items, geo, provenance). `materialize` recomposes the bundle;
  legacy docs that stored the whole bundle under `bundle` are read and
  converted on the next sync. `syncSlideToDoc(doc, slide, { skipFigureConfig
  ForBlockIds })` lets a host with an open figure-editor modal exclude that
  figure's config from its push (the modal owns it live). Report figures use
  the identical split in `doc.getMap("figures")`. This is why migration 036
  clears `crdt_state` (the stored CRDT shape changed; rooms re-seed from the
  unchanged stored config/body+figures).
- Entry points: `seedSlideDoc(doc, slide)` (build), `materializeSlide(doc)`
  (read back), `syncSlideToDoc(doc, slide)` (idempotent 2-way diff used for
  every local push — a no-op when doc already matches, which is what makes
  the "push everything, unconditionally" client loop echo-free).

## 4. Server rooms — authoritative doc, relay, checkpoint

The room mechanics are generic ([server/collab/doc_rooms.ts](server/collab/doc_rooms.ts),
parameterized by a `DocRoomAdapter` + injected `DocRoomDeps`) and shared by two
thin bindings: [slide_rooms.ts](server/collab/slide_rooms.ts) and
[report_rooms.ts](server/collab/report_rooms.ts) (see §13). One room per
`(projectId, docType, docId)`; described here in slide terms:

- **Open**: first `slide_subscribe` creates the room. It restores the exact
  prior Y.Doc from `slides.crdt_state` when that state is *current*
  (`crdt_state_last_updated === last_updated` — see §7), else seeds from
  `slides.config`. Every subscriber sends its state vector and receives a
  `slide_sync` containing exactly what it's missing, plus the room's own
  state vector (see §6).
- **Relay**: `slide_update` (base64 Yjs update) is permission-checked
  (`canEdit`) and applied to the room doc with the sender connection as
  origin; the doc's update handler forwards it to every *other* connection
  and marks the room dirty.
- **Checkpoint**: dirty rooms persist on a 1.5s debounce —
  `materializeSlide(doc)` → [saveSlideCheckpoint](server/db/project/slides.ts)
  writes `config`, `crdt_state` (full encoded doc), and both timestamps
  atomically, then fires SSE `notifyLastUpdated` for the slide and its deck
  (thumbnails/list refresh). Collab is authoritative: the checkpoint
  intentionally has no conflict check.
- **Close**: when the last connection unsubscribes (or its socket dies),
  `finalizeRoom` flushes a final checkpoint and destroys the room — unless a
  new subscriber arrived during the async flush, in which case the room stays
  alive for them.
- **External writes** (`applySlideToLiveRoom`): the plain `updateSlide` route
  first offers the save to a live room. If one exists, the payload is synced
  *into* the authoritative doc (relayed live to all editors) and checkpointed
  immediately; only when no room is live does the route write the DB
  directly. This is what prevents the room's next checkpoint from silently
  reverting AI/manual saves — and why those saves appear live in open
  editors.
- **Lifecycle hooks** (`onDocCreated`/`onDocClosed` on the adapter): fire once
  per room open/teardown so a binding can attach per-doc observers. The report
  binding uses them to init/drop the per-character authorship ledger; the slide
  binding to attach `observeSlideDocElements` (element-level attribution). Both
  are version-history machinery — see [DOC_VERSION_HISTORY.md](DOC_VERSION_HISTORY.md).

## 5. The editor bridge — tempSlide ⇄ session doc

[slide_editor/index.tsx](client/src/components/slide_deck/slide_editor/index.tsx)
keeps the pre-collab editing model (a local `tempSlide` Solid store driving
the canvas) and bridges it to a per-slide session doc from
`openSlideSession(slideId, onRemote)`:

- **Local → doc**: one tracking effect (`trackStore(tempSlide)`) runs on every
  store change and calls `session.pushLocal(unwrap(tempSlide))` →
  `syncSlideToDoc` inside a transaction. Any resulting update auto-sends as
  `slide_update`. Remote-applied changes push back as no-ops (idempotency is
  the echo guard — deliberately no "was this remote?" flag, which could stick
  and swallow edits). The same effect debounces the canvas re-render.
- **Doc → local**: `onRemote` (fired on `slide_sync`/`slide_update`)
  materializes the doc and `setTempSlide(reconcile(docSlide))`. reconcile
  preserves object identity of unchanged subtrees — which keeps `setOpaque`'s
  reference cache effective and avoids re-rendering untouched figures.
- **First-sync merge rule**: if local edits raced the first sync, they are
  pushed only when the doc still equals the slide this editor loaded
  (`canonicalJson` compare); if the doc already diverged (a peer's content),
  the doc wins and the pre-sync keystrokes are dropped — a 2-way diff push
  over a diverged doc would delete the peer's work.
- **Readiness**: `collabReady` (latched, drives which editors render) vs
  `session.isLive()` (ready AND socket open — drives save decisions).
- **Saving when collab can't**: while `isLive()`, closing needs no save (the
  room checkpoints). Otherwise the back button runs the explicit save
  (`updateSlide` with `expectedLastUpdated`; on CONFLICT a resolution modal —
  cancel keeps editing), and `onCleanup` does a best-effort silent save for
  exits that bypass the back button. Edits made while disconnected also
  accumulate in the local doc and are pushed by the reconnect catch-up if a
  reconnect happens first.

## 6. Reconnect catch-up — two-way sync

`slide_subscribe` carries the client's state vector (server → client diff);
`slide_sync` carries the server's state vector, and the client answers with
`Y.encodeStateAsUpdate(doc, serverSV)` — the ops the *server* is missing
(e.g. edits made while the socket was down whose sends failed). Both
directions ship only diffs; an in-sync exchange applies as a pure no-op.

## 7. Persistence & migrations

- Columns (migration `029`, mirrored in `_project_database.sql`):
  `slides.crdt_state` (base64 full Yjs state) and
  `slides.crdt_state_last_updated`.
- Staleness rule: the CRDT state is only trusted when
  `crdt_state_last_updated === last_updated`. The checkpoint stamps them
  equal; any non-collab write bumps `last_updated` alone, invalidating the
  state so the next room open re-seeds from `config`. (With the
  `applySlideToLiveRoom` chokepoint, non-collab writes during a live room go
  through the room anyway.)
- Model changes: changing the doc schema (e.g. titles became Y.Text) breaks
  restore of old states — ship a migration that nulls `crdt_state`
  (migration `030`); rooms re-seed from `config`, which is always safe.

## 8. Text editors — CodeMirror + yCollab

- [collab_markdown_editor.tsx](client/src/components/slide_deck/slide_editor/collab_markdown_editor.tsx):
  CodeMirror 6 + `yCollab(yText, awareness)` (y-codemirror.next). Renders
  remote carets (colored bar, hover name tag) and selections (translucent
  `colorLight = color + "33"`); Yjs relative positions keep every caret
  stable through concurrent edits. `yUndoManagerKeymap` scopes undo to local
  edits. `plain` prop disables markdown highlighting for title fields.
  Read-only (`EditorState.readOnly` + `EditorView.editable(false)`) for users
  without `can_configure_slide_decks` or on locked projects.
- [collab_text_field.tsx](client/src/components/slide_deck/slide_editor/collab_text_field.tsx):
  wraps one root text field — binds the field's Y.Text
  (`findRootTextField`) when collab is ready, falls back to panther
  `TextArea` otherwise; both paths mirror into `tempSlide` so the canvas
  re-renders; focus broadcasts `selectedTextTarget`.
- Awareness (cursor positions) rides the same WS as `awareness_update` /
  `awareness`; the server relays without applying or persisting
  (ephemeral). The `user` awareness field (name/color) is stamped from the
  client's own server-issued presence entry.
- **Awareness field registry** (one shared Awareness per session — do not
  collide): `cursor` = yCollab text caret (nulled on every CM blur); `user` =
  identity (rewritten wholesale on every presence_state); `pointer` = live
  mouse cursor (`PointerAwarenessState` in
  [live_cursors.tsx](client/src/components/_shared/live_cursors.tsx) —
  Figma-style cursors on the slide canvas and viz editor, coordinates in
  surface-relative spaces, throttled ~20 msg/s); `pointerChat` = cursor-chat
  message (`{ text } | null`, streamed live while typing, attached to the
  pointer bubble); `vizTab` = which viz-editor panel tab the peer is on
  (`{ scope, tab } | null`). New machinery must claim a NEW field, never
  reuse these.

## 9. Canvas overlays

[PeerSelectionOverlay](client/src/components/slide_deck/slide_editor/index.tsx)
draws the "who is editing what" borders. Rects come from the measured page:
layout blocks via a map mirroring panther's `collectItemHitRegions`, title
fields via panther's `buildHitRegions` (keyed by text-primitive id), scaled
from page DU to viewport px against the canvas's bounding rect. Boxes are
grouped **per element** — co-editors of the same element get side-by-side
name tags and concentric borders. Rendered in a body Portal
(`pointer-events-none`), recomputed on scroll/resize/presence changes, and
suppressed while a sub-editor modal covers the canvas (open-modal counter +
`elementFromPoint` backstop).

## 10. AI integration

- [presence_guard.ts](client/src/components/project_ai/ai_tools/validators/presence_guard.ts):
  `assertSlidesNotBusy(slideIds)` throws (surfaced to the AI, relayed to its
  user) when any *other* peer has a target slide open. Called by every
  slide-mutating AI tool; `create_slide`/`move_slides`/`duplicate_slides` are
  exempt by design.
- AI `updateSlide` calls pass `expectedLastUpdated` from the slide they just
  read; the server's optimistic-concurrency check turns races into a clear
  retry error. When a live room exists the save merges through the room
  instead (§4), where the CRDT is the conflict resolution.

## 11. Bundling constraint — exactly one yjs

Yjs breaks (`instanceof` failures, "Yjs was already imported") if two copies
are bundled. [client/vite.config.ts](client/vite.config.ts) pins
`resolve.dedupe` + aliases for `yjs`, `y-protocols`, `y-codemirror.next`,
`lib0`; server and client pin the same exact yjs version. Sanity check after
a build: `grep -c "Yjs was already imported" client/dist/assets/index-*.js`
must be 1.

## 12. Failure modes — what happens when…

| Situation | Behavior |
|---|---|
| WS can't connect / nginx unpatched | Editors fall back to plain TextAreas; back button saves explicitly with conflict dialog; no presence. |
| Socket drops mid-edit | Edits keep accumulating locally; auto-reconnect (≤5 tries) then two-way catch-up recovers them; closing before reconnect triggers the explicit-save flush. |
| Server restarts mid-edit | Room state restored from `crdt_state` on next subscribe — including un-checkpointed edits. |
| Two users type in the same field | Character-level CRDT merge; both carets visible; per-user undo. |
| AI edits a slide someone has open | Refused with a named warning (busy guard). |
| Non-collab save while a room is live | Routed through the room: merged, relayed live, checkpointed (no clobber in either direction). |
| Deploy skew (old server / new client) | `slide_sync` without `stateVector` is tolerated (catch-up skipped, sync still completes). |
| View-only user opens the editor | Sees everything live; editors read-only; server rejects any forged ops per-message. |

## 13. Report collaboration

Reports get the same feature set through the same machinery, with a far
simpler document model:

- **Doc shape** ([lib/collab/report_crdt.ts](lib/collab/report_crdt.ts)): the
  whole markdown body is ONE `doc.getText("body")` (the editor binds CodeMirror
  to it via yCollab — carets/merging come from the same binding as slides),
  plus `doc.getMap("figures")` / `doc.getMap("images")` holding opaque
  per-id `FigureBlock`/`ImageBlock` entries (LWW via `setOpaque`; the shared
  helpers live in [lib/collab/crdt_util.ts](lib/collab/crdt_util.ts)). `label`
  and `config` stay out of the doc (separate routes/UI).
- **Protocol**: a parallel `report_*` message family (subscribe/update/
  unsubscribe/awareness both ways) so the slide messages stay byte-identical
  across deploys. Presence gains `reportId` (set ⇔ report open in the editor;
  drives the report-card avatars).
- **Permissions**: the WS admits `can_view_slide_decks OR can_view_reports`;
  each message family re-checks its own view permission and carries its own
  edit permission (`can_configure_reports` for report ops); the editor is
  read-only client-side without it.
- **Persistence**: `reports.crdt_state` + `crdt_state_last_updated`
  (migration 031, same staleness rule); checkpoints write body + figures +
  images + state atomically (`saveReportCheckpoint`). The list rebroadcast
  (previews derive from body) is debounced ~5s per project — see
  DOC_SSE_REALTIME.md.
- **External writes**: `updateReportBody/Figures/Images` route through a live
  room first (`applyReportToLiveRoom`, partial-field sync + immediate
  checkpoint); the pre-collab advisory `conflicted` flag remains for the
  no-room path only.
- **Editor bridge** ([report/index.tsx](client/src/components/report/index.tsx),
  [report_editor.tsx](client/src/components/report/report_editor.tsx)): the
  CodeMirror view rebuilds once when the session becomes ready, swapping in
  `yCollab` + per-user undo; the latched `collabReady` turns the 800ms REST
  autosave off for good (offline edits accumulate in the doc and the reconnect
  catch-up ships them — a parallel REST save would double-apply); registry
  edits flow through the doc while live; the AI accept applies as a minimal
  single-region diff so it merges with concurrent peer typing; close-flush
  mirrors the slide rules (never-ready → REST flush; ready+offline →
  best-effort REST flush of the doc state; live → the room finalizes). AI
  edits need no busy-guard: they apply through the proposing user's own live
  session and merge via CRDT.

## Version history

Editing sessions on rooms (and every non-collab write path) feed a
Google-Docs-style version history for both decks and reports — capture points,
session semantics, restore sequencing and the room-discard rules live in
[DOC_VERSION_HISTORY.md](DOC_VERSION_HISTORY.md).

## Known limits

- Carets render only in the side-panel editors, not on the canvas itself
  (panther's canvas is non-DOM); the canvas shows the peer border instead.
- A peer's *body-text* caret is visible only when you have the same block
  selected (the body editor shows the selected block); title-field carets
  show whenever both users are on the same slide.
- An empty optional title field has no rendered rect, so its peer border
  appears only once text exists.
- `[VIZSYNC]`-prefixed console logging is temporary diagnostics for the
  viz-sync investigation and should be stripped once that is confirmed fixed.
