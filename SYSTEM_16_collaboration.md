---
system: 16
name: Realtime Collaboration & Version History
globs:
  - server/collab/**
  - lib/collab/**
  - client/src/components/version_history/**
  - client/src/state/project/collab.ts
  - lib/types/collab.ts
  - lib/types/versions.ts
  - server/db/project/versions.ts
  - server/routes/project/project-collab.ts
---

# S16 — Realtime Collaboration & Version History

_Google-Docs-style real-time co-editing for slide decks, reports, and
visualizations — WebSocket transport, server-authoritative Yjs rooms, presence,
live cursors — plus the version-history layer built on top: editing-session
capture, per-character / per-slide / per-element attribution, and restore._
Reviewed against code 2026-07-21 (absorbs DOC_SLIDE_COLLAB,
DOC_SLIDE_COLLAB_FEATURES, DOC_VIZ_COLLAB, DOC_VERSION_HISTORY).

## Scope

See the `globs:` frontmatter (the lint-enforced manifest) and the S16 row in
[SYSTEMS.md](SYSTEMS.md). In one breath:

- **Transport & rooms** — `server/routes/project/project-collab.ts` (the one WS
  endpoint per project), `server/collab/doc_rooms.ts` (the generic master-copy
  room core: seed, relay, debounced checkpoint, chokepoint), the three thin
  per-document-type bindings `slide_rooms.ts` / `report_rooms.ts` /
  `po_rooms.ts`, and `server/collab/presence_registry.ts`.
- **CRDT model** — `lib/collab/{crdt_util,report_crdt,slide_crdt}.ts`,
  `lib/types/collab.ts` (the WS message protocol), client
  `state/project/collab.ts` (one WS manager per project — the T1-adjacent
  store, PROTOCOL_APP_STATE.md).
- **Visualization co-editing** — `lib/collab/figure_config_crdt.ts` (the shared
  `PresentationObjectConfig ⇄ Y.Map` bridge: per-field LWW for the `d`/`s`
  form config, `Y.Text` for the three captions), `server/collab/po_rooms.ts`
  (a third room type `"po"` for the standalone visualization editor, with its
  own `po_*` message family + `crdt_state` columns on `presentation_objects`).
  Embedded figures inside slides/reports are the SAME bridge applied to a
  `figConfig` Y.Map nested in the host doc's figure node (the heavy bundle data
  rides beside it as an opaque `figData`); the figure editor modal binds to it
  live via a `collabBinding`. Chokepoints in `server/routes/project/
  presentation_objects.ts` route REST config writes through the live PO room.
- **Version history** — `server/collab/{version_tracker,version_capture}.ts`,
  the attribution ledgers `authorship.ts` (per-character report bodies, with
  tombstones) + `deck_session_ledger.ts` (per-slide / per-element decks),
  `server/db/project/versions.ts`, `lib/types/versions.ts`, and the client
  `components/version_history/**` (diff, compare, previews, restore modals).
- **Shared custody.** The server chokepoint branches, checkpoint functions, and
  version routes ride **S12**'s files (`server/db/project/{reports,slides,
  slide_decks}.ts`, `server/routes/project/{reports,slide_decks,slides}.ts` —
  SYSTEMS.md §4.1), and the PO chokepoint rides **S9**'s
  `presentation_objects.ts`. The collab client UI (`_shared/live_cursors.tsx`,
  `_shared/cursors/`, `_shared/presence_toasts.tsx`,
  `_shared/connection_banner.tsx`, `_shared/collab_markdown_editor.tsx`, the
  presence avatars and editor overlays) lives inside S12's manifest globs —
  S12 owns those files; this system documents the collab behavior in them.

## Contract

- **Master copy is authoritative.** Each open document has one server Y.Doc;
  browsers sync over WS; it debounce-checkpoints (1.5 s) to the normal DB row.
  Every programmatic write (REST save while a room is live, restore) goes
  **through** the room via the `apply*ToLiveRoom` chokepoints so the master
  copy is never bypassed.
- **Rides two neighbouring systems, replaces neither.** Checkpoints persist by
  calling **S12**'s document tables (`saveReportCheckpoint` /
  `saveSlideCheckpoint` in `server/db/project/{reports,slides}.ts`, onto
  additive `crdt_state` / `body_authors` / `slide_editors` columns) and then
  ring **S3**'s notify hub (`notifyLastUpdated`). See the boundary section
  below — this is the load-bearing integration contract.
- **Attribution is honest.** Exact per-character / per-slide / per-element
  "who" only accrues for edits made through live collab rooms after deploy;
  everything else falls back to session-level "one of: …" wording. Ledgers
  self-poison rather than show wrong names.
- **Version capture is session-based** (10 min idle / 45 min max / 2 min
  room-empty), hash-deduped, retained newest-100-per-document, restore writes a
  safety version first.

## What users get

Presence avatars on deck/report/viz list cards, editor headers, and per-slide
cards (`+N` overflow chip past five people); idle dimming (`opacity-40
grayscale` after 3 min without input, lit again on the next input, never while
editing); a pulsing "editing now" badge on list-card avatars only; join/leave
toasts (top-right, below the header) keyed per person with a short grace
window so refreshes/reconnects stay silent and switching documents yourself
never announces the people already there. Live co-editing: character-merged
text with remote carets/selections and per-user undo (Ctrl+Z never undoes a
collaborator); layout, figure, and style changes propagate live; "who is
editing what" borders on the slide canvas and around report embeds.
Figma-style live cursors with name tags, click ripples, and `/`-triggered
cursor chat on the slide canvas, the viz editor (preview + settings panel),
the report editor (both panes; typing hides your own pointer), and the project
tab pages (scoped to same tab + same folder view). Continuous autosave with no
Save button; graceful single-user fallback when the WS can't connect (explicit
save with conflict dialog); reconnect-forever with two-way catch-up; view-only
users see everything live with read-only editors; deterministic per-user
identity color (hashed from email, server-stamped, unspoofable — only the
avatar URL is self-reported).

## Transport — one WebSocket per project

- Endpoint: `GET /project_collab/:project_id`, upgraded in
  [server/routes/project/project-collab.ts](server/routes/project/project-collab.ts),
  mounted raw in `main.ts` behind the global `authMiddleware` (off-registry —
  S1's inventory). Auth mirrors the SSE endpoint and completes **before** the
  upgrade (the auth middleware precedes `upgradeWebSocket` in the same chain,
  so no message can precede the check): origin check → Clerk auth (401) →
  `globalUser.approved` (403) → `resolveProjectUserAccess` (the same shared
  core REST/SSE use; 503/403) → admission requires ANY of
  `can_view_slide_decks` / `can_view_reports` / `can_view_visualizations`.
  The Origin allowlist mirrors `server/middleware/cors.ts` (WS handshakes
  bypass CORS); same-origin requests are additionally allowed, and requests
  with **no** Origin header pass (non-browser clients). Each message family
  re-checks its own view permission per message and carries its own edit
  permission on its RoomConn; a LOCKED project admits viewers with every edit
  permission forced off for the connection's lifetime. Frames over ~32 MiB
  (measured in string length) are rejected unparsed (`error` reply); every
  parsed frame is schema-validated (`collabClientMessageSchema` in
  [lib/types/collab.ts](lib/types/collab.ts) — bounded presence/awareness
  payload sizes, `avatarUrl` restricted to bounded https URLs) before any
  handler touches it.
- Message protocol ([lib/types/collab.ts](lib/types/collab.ts)):
  - client → server: `presence_update`, `{slide,report,po}_subscribe` /
    `_update` / `_unsubscribe`, `awareness_update`, `report_awareness_update`,
    `po_awareness_update`, and the project-scoped `project_awareness_update`
    (page cursors — below).
  - server → client: `hello` (connectionId), `presence_state` (full peer
    list), `{slide,report,po}_sync` / `_update` / `_error`, `awareness` /
    `report_awareness` / `po_awareness`, `project_awareness`, `doc_save_state`
    (room checkpoint health), and a connection-level `error` (oversized or
    invalid frame). The `*_error` messages carry an optional `fatal` flag:
    fatal ⇔ the document/room is gone (deleted, replaced, not found) and the
    session must stop editing; non-fatal = per-operation rejection.
- Client manager:
  [client/src/state/project/collab.ts](client/src/state/project/collab.ts)
  (~1,150 lines). `ProjectSSEBoundary`
  ([t1_sse.tsx](client/src/state/project/t1_sse.tsx)) calls
  `connectCollab(projectId)` on mount / `disconnectCollab()` on cleanup, so
  presence is live anywhere inside a project, not just in the editors
  (teardown runs before the socket closes so awareness removals reach peers).
- Reconnect: exponential backoff (1 s → 30 s cap), retrying FOREVER;
  `online` / tab-refocus events short-circuit the wait; a top-center banner
  ([connection_banner.tsx](client/src/components/_shared/connection_banner.tsx))
  shows "Connection lost — reconnecting…" (+ Reload) and flashes "Live again"
  on recovery — never on a normal initial connect. Close-intent is tracked
  **per socket** (WeakSet) so a project switch can't mistake its own teardown
  for a failure and open a duplicate connection. `socket.onopen` re-sends
  presence, re-subscribes every open doc session, and re-announces project
  awareness.
- Ops requirement: reverse proxies must forward WebSocket upgrade headers on
  `/project_collab` (the server-cli site generator emits this; older sites
  were patched in place).

## Presence — who is where

- Server:
  [server/collab/presence_registry.ts](server/collab/presence_registry.ts)
  keeps `projectId → connectionId → PresenceEntry`: server-stamped identity
  (`email`, `name`, `color` via `presenceColorForKey(email)`) plus the
  client-controlled view fields (`deckId`, `slideId`, `selectedBlockId`,
  `selectedTextTarget`, `reportId`, `poId`, `editingFigureId`, `idle` — see
  `PresenceView` in [lib/types/collab.ts](lib/types/collab.ts), the single
  source). View fields are replaced **wholesale** on every `presence_update`
  so a client clears them by omission; `avatarUrl` is the exception — sticky
  once provided. Every change broadcasts the full peer list to the project
  (`broadcastPresence(projectId)`).
- Client: a Solid store mirrors `presence_state`; `otherPeers()` filters out
  self by connectionId. Consumers: deck thumbnails, deck header + per-slide
  cards via
  [presence_avatars.tsx](client/src/components/slide_deck/presence_avatars.tsx),
  report + viz cards (same avatar stack filtered on `reportId`/`poId`), the
  join/leave toasts
  ([presence_toasts.tsx](client/src/components/_shared/presence_toasts.tsx)),
  the in-editor peer overlays, and the AI busy-guard.
- Semantics: `slideId` set ⇔ that user has the slide open in the editor (set
  on editor mount, cleared to deck-level on unmount). `selectedBlockId`
  (layout node id) and `selectedTextTarget` (panther text primitive id, e.g.
  `coverTitle`) are mutually exclusive and say which element they're editing.
- Activity signals (both ride the presence entry, NOT Yjs awareness — list
  cards live outside any doc room):
  - `idle` — client-self-reported. collab.ts tracks local input
    (pointermove/pointerdown/keydown/wheel, capture-phase) and broadcasts only
    the two transitions: idle after 3 min without input (detected on a 15 s
    poll), active again on the next input. Editing state overrides a stale
    idle flag in the avatar UIs.
  - `isEditing` — **server-stamped** in `markConnectionEditing` when a
    `slide_update`/`report_update`/`po_update` arrives from a connection with
    the matching edit permission. Broadcasts once on the false→true edge; each
    update re-arms an 8 s quiet-period timer whose expiry broadcasts the clear
    — a typing burst costs two presence broadcasts total. A `presence_update`
    preserves the flag (it is not client-settable). Rendered as the pulsing
    badge on list-card avatars only (`showEditingPulse`).

## The CRDT model

### Slide ⇄ Y.Doc

[lib/collab/slide_crdt.ts](lib/collab/slide_crdt.ts) is the shared bridge
(compiled into both server and client). Doc schema, under one root Y.Map:

- **Scalars** (type, split, flags, style knobs): plain values, `setScalar`
  (identity-compare write).
- **Text fields**: every root title/header field and every text block's
  `markdown` is a **Y.Text** — this is what makes character merging and remote
  carets possible. Optional fields exist as empty Y.Text so editors can bind
  before first input; `materializeSlide` omits optional-empties and keeps
  required ones. `syncText` applies a line-anchored multi-hunk diff
  (patience-style; regions it can't anchor collapse to one splice) — separate
  edit regions stay separate ops, so a routed full-body save doesn't
  tombstone/re-author everything between two distant edits or revert
  co-editors' text in the span.
- **Layout tree**: nested Y.Maps keyed by node id under a `children` Y.Map,
  ordered by a `fracIndex` fractional-index key (the `fractional-indexing`
  package) — reorders touch only out-of-order siblings, so concurrent moves
  don't clobber each other. Type changes rebuild a node in place.
- **Opaque values** (style objects, and a figure's heavy `figData`): plain
  JSON values via `setOpaque`, which short-circuits on reference equality (a
  WeakMap cache) before falling back to a `canonicalJson` content compare.
  **Invariant:** callers must pass structurally-shared values — a changed
  value must be a NEW object reference (the editor's path-set write-backs
  guarantee this; `reconcile()` merges in place and must not be used to write
  figure bundles). `setOpaqueByValue` is the sibling for small values a caller
  may mutate in place: it clones on store and always content-compares.
- **Figures are decomposed, not one opaque blob.** A figure node splits its
  `FigureBundle` into `figConfig` (a nested Y.Map via the
  `figure_config_crdt.ts` bridge — the visualization config co-edits
  field-by-field, captions per character) + `figData` (the opaque remainder:
  items, geo, provenance). `materialize` recomposes the bundle; legacy docs
  that stored the whole bundle under `bundle` are read and converted on the
  next sync. `syncSlideToDoc(doc, slide, { skipFigureConfigForBlockIds })`
  lets a host with an open figure-editor modal exclude that figure's config
  from its push (the modal owns it live). This shape change is why migration
  037 clears stored slide + report `crdt_state` (rooms re-seed from the
  unchanged stored content).
- Entry points: `seedSlideDoc(doc, slide)` (build), `materializeSlide(doc)`
  (read back), `syncSlideToDoc(doc, slide)` (idempotent 2-way diff used for
  every local push — a no-op when the doc already matches, which is what makes
  the "push everything, unconditionally" client loop echo-free).
- **Self-healing duplicate ids.** Concurrent layout restructures can leave the
  same logical block in two places under per-key LWW (one user moves it, the
  other rebuilds its old container). `materializeSlide` DEDUPES: only the
  first copy in the deterministic (fracIndex, id) walk survives, identically
  on every client, and the next push's `syncChildren` deletes the shadowed
  copy from the doc itself.

### Report ⇄ Y.Doc

[lib/collab/report_crdt.ts](lib/collab/report_crdt.ts): the whole markdown
body is ONE `doc.getText("body")` (the editor binds CodeMirror to it via
yCollab — carets/merging come from the same binding as slides).
`doc.getMap("figures")` holds per-id figure entries **decomposed exactly like
slide figures** (`figConfig` Y.Map + opaque `figData`); `doc.getMap("images")`
holds opaque per-id `ImageBlock` entries (LWW via `setOpaque`; shared helpers
in [crdt_util.ts](lib/collab/crdt_util.ts)). `label` and `config` stay out of
the doc (separate routes/UI).

### Visualization config ⇄ Y.Map

[lib/collab/figure_config_crdt.ts](lib/collab/figure_config_crdt.ts): one
co-editable config Y.Map — scalars per-field LWW, the three captions as
Y.Text. Used by the standalone PO rooms (`po_rooms.ts`, persistence in
`presentation_objects.crdt_state`) and by embedded figures in slide/report
docs (the nested `figConfig`). Per-user undo comes from a local-origin
`Y.UndoManager`; POs have **no version history**.

## Server rooms — authoritative doc, relay, checkpoint

The room mechanics are generic
([server/collab/doc_rooms.ts](server/collab/doc_rooms.ts), parameterized by a
`DocRoomAdapter` + injected `DocRoomDeps`) and shared by the three thin
bindings [slide_rooms.ts](server/collab/slide_rooms.ts),
[report_rooms.ts](server/collab/report_rooms.ts),
[po_rooms.ts](server/collab/po_rooms.ts). One room per
`(projectId, docType, docId)`; described here in slide terms:

- **Open**: first `slide_subscribe` creates the room. It restores the exact
  prior Y.Doc from `slides.crdt_state` when that state is _current_
  (`crdt_state_last_updated === last_updated` — the staleness rule below),
  else seeds from `slides.config`; a corrupt stored state is caught and falls
  back to seeding. Every subscriber sends its state vector and receives a
  `slide_sync` containing exactly what it's missing, plus the room's own state
  vector (a malformed client SV degrades to a full sync). `depsForPo` refuses
  rooms for default visualizations.
- **Relay**: `slide_update` (base64 Yjs update) is permission-checked
  (`canEdit`, enforced in `applyDocUpdate`) and applied to the room doc with
  the sender connection as origin; the doc's update handler forwards it to
  every _other_ connection and marks the room dirty. A malformed update is
  rejected non-fatally without touching the doc.
- **Checkpoint**: dirty rooms persist on a 1.5 s debounce —
  `materializeSlide(doc)` → `saveSlideCheckpoint`
  ([server/db/project/slides.ts](server/db/project/slides.ts)) writes
  `config`, `crdt_state`, and both timestamps, and bumps the parent
  `slide_decks` row, in one transaction; then SSE `notifyLastUpdated` fires
  for the slide and its deck. Collab is authoritative: the checkpoint
  intentionally has no conflict check. Checkpoints are SERIALIZED per room
  (each chains behind the previous save) so two saves can never commit out of
  order — and `flushRoomForDoc` awaits the chain even when the room looks
  clean, because "clean" may mean a save is in flight (the restore routes
  snapshot the DB right after flushing). A failed save keeps the room dirty,
  retries on a 10 s timer, and broadcasts `doc_save_state failing` to the room
  (recovery broadcasts the clear; late joiners get the failing state re-sent
  right after their sync) so editors show "Not saving — retrying" instead of a
  false "Live".
- **Close**: when the last connection unsubscribes (or its socket dies),
  `finalizeRoom` flushes a final checkpoint and destroys the room — unless a
  new subscriber arrived during the async flush, in which case the room stays
  alive for them. A FAILED final checkpoint never discards the room (its doc
  is the sole copy of the session tail): finalize retries with backoff, then
  keeps the room registered and re-runs on a 30 s cycle until the save lands.
  A subscribe whose async load outlives its connection (socket died, or an
  unsubscribe raced it) is NOT registered — the room finalizes instead of
  leaking with a phantom member. On shutdown, `main.ts` starts an 8 s
  force-exit timer, then awaits `flushAllRooms()` before `flushAllVersions()`
  before closing the pools.
- **External writes** (`applySlideToLiveRoom` in `slide_rooms.ts`,
  `applyReportToLiveRoom` in `report_rooms.ts`, `applyPoToLiveRoom` in
  `po_rooms.ts` — all over the generic `applyToLiveRoom` in `doc_rooms.ts`):
  the plain update routes first offer the save to a live room. If one exists,
  the payload is synced _into_ the authoritative doc (relayed live to all
  editors) and checkpointed immediately — the chokepoint forces the room
  dirty even when the doc already matched, so the HTTP caller always gets a
  fresh `last_updated`; only when no room is live does the route write the DB
  directly. This is what prevents the room's next checkpoint from silently
  reverting AI/manual saves — and why those saves appear live in open editors.
  `closeRoomsForDoc` is the opposite primitive: discard a live room WITHOUT
  checkpointing and error its clients fatally (used when the row is deleted or
  wholesale-replaced — see Version history).
- **Lifecycle hooks** (`onDocCreated`/`onDocClosed` on the adapter): fire once
  per room open/teardown. The report binding uses them to init/drop the
  per-character authorship ledger; the slide binding attaches
  `observeSlideDocElements` (element-level attribution). Both are
  version-history machinery.

## Editor bridges

### Slide editor — tempSlide ⇄ session doc

[slide_editor/index.tsx](client/src/components/slide_deck/slide_editor/index.tsx)
keeps the pre-collab editing model (a local `tempSlide` Solid store driving
the canvas) and bridges it to a per-slide session doc from
`openSlideSession(slideId, onRemote)` (which first destroys any prior session
for the same slide):

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

### Text editors — CodeMirror + yCollab

- [_shared/collab_markdown_editor.tsx](client/src/components/_shared/collab_markdown_editor.tsx)
  (the slide_editor file of the same name is a thin wrapper injecting the
  slide-deck permission; the viz editor reuses the shared component for
  caption fields): CodeMirror 6 + `yCollab(yText, awareness)`
  (y-codemirror.next). Renders remote carets (colored bar, hover name tag) and
  selections (translucent `colorLight = color + "33"`); Yjs relative positions
  keep every caret stable through concurrent edits. `yUndoManagerKeymap`
  scopes undo to local edits. `plain` prop disables markdown highlighting for
  title fields. Read-only (`EditorState.readOnly` +
  `EditorView.editable(false)`) for users without the family's configure
  permission or on locked projects.
- [collab_text_field.tsx](client/src/components/slide_deck/slide_editor/collab_text_field.tsx)
  wraps one root text field — binds the field's Y.Text (`findRootTextField`)
  when collab is ready, falls back to panther `TextArea` otherwise; both paths
  mirror into `tempSlide` so the canvas re-renders; focus broadcasts
  `selectedTextTarget`.
- Awareness (cursor positions) rides the same WS as `awareness_update` /
  `awareness`; the server relays without applying or persisting (ephemeral).
  The `user` awareness field (name/color) is stamped from the client's own
  server-issued presence entry.

### Report editor

[report/index.tsx](client/src/components/report/index.tsx) +
[report_editor.tsx](client/src/components/report/report_editor.tsx): the
CodeMirror view rebuilds once when the session becomes ready, swapping in
`yCollab` + per-user undo; the latched `collabReady` turns the 800 ms REST
autosave off for good (offline edits accumulate in the doc and the reconnect
catch-up ships them — a parallel REST save would double-apply); registry edits
flow through the doc while live. The AI accept applies as a **rebase**
(`rebaseProposedEdits` → line-anchored multi-hunk apply): hunks whose text a
collaborator concurrently edited are skipped and surfaced to the user and the
AI, so an accept merges with concurrent peer typing instead of clobbering it.
Close-flush mirrors the slide rules (never-ready → REST flush; ready+offline →
best-effort REST flush of the doc state; live → the room finalizes). AI edits
need no busy-guard: they apply through the proposing user's own live session
and merge via CRDT.

### Visualization editor

[visualization_editor_inner.tsx](client/src/components/visualization/visualization_editor_inner.tsx)
opens a `po` session over the same machinery: the `d`/`s` config co-edits
per-field, captions per-character; per-user undo via a local-origin
`Y.UndoManager`; presence gains `poId`/`editingFigureId`; the Data /
Presentation / Text panel tabs show per-tab peer avatars via the `vizTab`
awareness field (internal keys `"data" | "style" | "text"`). REST config
writes route through the live room via the chokepoints in
`server/routes/project/presentation_objects.ts` (config save + the batch
period-filter update), skipping the optimistic lock while a room is live.
Accepted trade-off: the live push is deliberately unnormalized, so the
render-only `d.includeAdminAreaRollup`/`adminAreaRollupPosition` fields can
persist through a live-session checkpoint (they are valid optional schema
fields); the next standard save strips them via `normalizePOConfigForStorage`.

### Canvas overlays

`PeerSelectionOverlay` (in the slide editor) draws the "who is editing what"
borders. Rects come from the measured page: layout blocks via a map mirroring
panther's `collectItemHitRegions`, title fields via panther's
`buildHitRegions` (keyed by text-primitive id), scaled from page DU to
viewport px against the canvas's bounding rect. Boxes are grouped **per
element** — co-editors of the same element get side-by-side name tags and
concentric borders. Rendered in a body Portal (`pointer-events-none`),
recomputed on scroll/resize/presence changes, and suppressed while a
sub-editor modal covers the canvas (open-modal counter + `elementFromPoint`
backstop). The report editor's equivalent outlines figure/image embeds in
both panes, anchored on `[data-embed-id]` with the CodeMirror widget as the
primary anchor.

## Live cursors & the awareness field registry

The rendering engine is
[live_cursors.tsx](client/src/components/_shared/live_cursors.tsx);
per-surface glue (coordinate mapping + scope gate) lives one file per surface
in [\_shared/cursors/](client/src/components/_shared/cursors/) (slide / viz /
report / page).

**Awareness field registry** (one shared Awareness per session — do not
collide): `cursor` = yCollab text caret (nulled on every CM blur); `user` =
identity (rewritten wholesale on every presence_state); `pointer` = live mouse
cursor (`PointerAwarenessState` — Figma-style cursors, coordinates in
surface-relative spaces, throttled ~20 msg/s; also carries an optional `click`
counter — bumped per primary-button press and shipped immediately, bypassing
the throttle — whose observed INCREASE renders an expanding click-ripple ring,
baselined at attach so history never pings); `pointerChat` = cursor-chat
message (`{ text } | null`, streamed live while typing, attached to the
pointer bubble — `/` opens it, Enter keeps it up a few seconds, Escape
discards); `vizTab` = which viz-editor panel tab the peer is on
(`{ scope, tab } | null`). New machinery must claim a NEW field, never reuse
these. The SAME field names ride two more awareness instances: the report
session (report-code / report-preview pointer surfaces) and the PROJECT-level
awareness (below). Cursor name tags fade after ~4 s of stillness (hover near a
cursor to reveal its name), idle cursors disappear after 30 s, and a cursor
leaving the surface vanishes for everyone; the report editor sets
`hideWhileTyping` so typing hides your pointer until the mouse moves.

**Project-level awareness — page cursors.** The project tab pages have no doc
room, so their live cursors ride a dedicated PROJECT-scoped Awareness: one
instance per `connectCollab` (`projectAwareness`), destroyed on
`disconnectCollab`; local updates ship as `project_awareness_update`,
re-announced on every socket (re)open (there is no subscribe to trigger
catch-up). The server relays opaquely to every OTHER admitted connection
(`relayProjectAwareness` — presence-class visibility; no doc, no persistence).
Each tab page tags its content element with `data-page-cursor-surface`
([page_cursors.tsx](client/src/components/_shared/cursors/page_cursors.tsx)).
Coordinates: x normalized to the element width, y in content px against the
element's OWN scrollTop — one formula covers self-scrolling card grids and
content divs whose panther ancestor scrolls. Scope = tab plus the
folder/grouping selection on the list tabs (different folders = different
cards; cursors must not cross); a surface can override the scope via the
attribute VALUE — the deck overview tags itself `deck:<id>` this way.
Suppression is geometric, not signaled: every editor overlay hides page
content via `display:none` → zero-size rect → both sides bail; z-50 modals
are rejected by elementFromPoint containment in the pane helpers.

**Chrome zones** (`data-cursor-zone`, shared by every surface family): header
bars, side panels, tab navs and canvas surroundings are per-user
resizable/collapsible, so each is its own coordinate space — a generic `zone`
pointer variant maps against the RECEIVER's copy of the same-named element,
stamped with the owning surface's scope. Wrappers fall back to
`zonePointerAt`/`acceptZonePointer` after their content surfaces miss, so
cursors survive crossing the chrome instead of vanishing.

## Reconnect catch-up & failure modes

`*_subscribe` carries the client's state vector (server → client diff);
`*_sync` carries the server's state vector, and the client answers with
`Y.encodeStateAsUpdate(doc, serverSV)` — the ops the _server_ is missing
(e.g. edits made while the socket was down whose sends failed). Both
directions ship only diffs; an in-sync exchange applies as a pure no-op.

| Situation                                        | Behavior                                                                                                                                                                                       |
| ------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| WS can't connect / proxy unpatched               | Editors fall back to plain TextAreas; back button saves explicitly with conflict dialog; no presence.                                                                                          |
| Socket drops mid-edit                            | Edits keep accumulating locally; banner + auto-reconnect forever (≤30 s backoff, instant on network/tab return), then two-way catch-up recovers them; closing before reconnect → explicit save.|
| Server restarts mid-edit                         | Room state restored from `crdt_state` on next subscribe — including un-checkpointed edits.                                                                                                     |
| Two users type in the same field                 | Character-level CRDT merge; both carets visible; per-user undo.                                                                                                                                |
| Two users restructure the layout concurrently    | Per-key LWW can duplicate a block; `materializeSlide` dedupes deterministically on every client and the next push deletes the shadowed copy — self-healing.                                    |
| AI edits a slide someone has open                | Refused with a named warning (busy guard).                                                                                                                                                     |
| Non-collab save while a room is live             | Routed through the room: merged, relayed live, checkpointed (no clobber in either direction).                                                                                                  |
| Deploy skew (old server / new client)            | `slide_sync` without `stateVector` is tolerated (catch-up skipped, sync still completes).                                                                                                      |
| View-only user opens the editor                  | Sees everything live; editors read-only; server rejects any forged ops per-message.                                                                                                            |

Known limits: carets render only in the side-panel editors, not on the canvas
itself (panther's canvas is non-DOM — the canvas shows the peer border
instead); a peer's body-text caret is visible only when you have the same
block selected; an empty optional title field has no rendered rect, so its
peer border appears only once text exists.

## Persistence & migrations

- Columns (all mirrored in `_project_database.sql`): `crdt_state` (base64 full
  Yjs state) + `crdt_state_last_updated` on `slides` (migration `030`),
  `reports` (`032`), and `presentation_objects` (`036`);
  `reports.body_authors` + `report_versions.body_authors` (`034`);
  `deck_versions.slide_editors` (`035`); the `report_versions` /
  `deck_versions` tables (`033`).
- **Staleness rule**: the CRDT state is only trusted when
  `crdt_state_last_updated === last_updated`. The checkpoint stamps them
  equal; any non-collab write bumps `last_updated` alone, invalidating the
  state so the next room open re-seeds from content. (With the
  `apply*ToLiveRoom` chokepoints, non-collab writes during a live room go
  through the room anyway.)
- **Model changes**: changing the doc schema breaks restore of old states —
  ship a migration that nulls `crdt_state`; rooms re-seed from content, which
  is always safe. Precedents: `031` (slide titles became Y.Text), `037`
  (figure decomposition — clears both slides and reports).
- Bundling constraint — exactly one yjs: Yjs breaks (`instanceof` failures,
  "Yjs was already imported") if two copies are bundled.
  [client/vite.config.ts](client/vite.config.ts) pins `resolve.dedupe` for
  `yjs`, `y-protocols`, `y-codemirror.next`, `lib0` (+ an alias for `yjs`);
  server (`deno.json`) and client pin the same exact yjs version. Sanity check
  after a build: `grep -c "Yjs was already imported"
  client/dist/assets/index-*.js` must be 1.

## AI integration

- [presence_guard.ts](client/src/components/project_ai/ai_tools/validators/presence_guard.ts):
  `assertSlidesNotBusy(slideIds)` throws (surfaced to the AI, relayed to its
  user) when any _other_ peer has a target slide open. Called by every
  slide-mutating AI tool; `create_slide`/`move_slides`/`duplicate_slides` are
  exempt by design.
- AI `updateSlide` calls pass `expectedLastUpdated` from the slide they just
  read; the server's optimistic-concurrency check turns races into a clear
  retry error. When a live room exists the save merges through the room
  instead, where the CRDT is the conflict resolution.

---

## Collab (WebSocket) ⇄ SSE boundary

How this system sits on top of **S3 (Realtime Sync & Cache Invalidation)**
without replacing any of it. The question it answers: "did adding live
co-editing change how saves and refetches worked before?" — answer: no, it
extended them.

**Principle: WebSockets are strictly additive.** They add a fast, fine-grained
live layer _inside_ the existing per-project SSE boundary; they do not take
over any responsibility SSE already had. Delete all of this system's code and
the original save-then-refetch flow still works end to end — you would only
lose live co-editing and fall back to save-then-refetch.

```text
                       ┌──────────────── project boundary ────────────────┐
                       │                                                   │
  live co-editors ─────┤  S16 WS layer (additive)                         │
  in one document      │   • Yjs deltas relayed sub-second                │
                       │   • presence / awareness                          │
                       │   • authoritative server Y.Doc per document       │
                       │        │ 1.5s debounced checkpoint                │
                       │        ▼                                          │
  everyone else in ────┤  S3 SSE layer (unchanged, project-wide)          │
  the project          │   • "row X changed → invalidate → refetch"        │
                       │   • notifyLastUpdated / notifyProjectReportsUpdated│
                       └───────────────────────────────────────────────────┘
       The WS checkpoint FEEDS the SSE bus. It never bypasses it.
```

### 1. The old system is untouched — extended, not replaced

- **The classic DB write functions are unchanged.** `updateReportBody`,
  `updateReportFigures`, `updateReportImages`, `updateSlide`, etc. still exist
  and still do exactly what they did (one column + `last_updated`). The collab
  checkpoints are **new, separate** functions sitting alongside them.
- **The REST routes got a branch prepended; the original path is the
  fall-through.** Each mutating route now starts with a live-room check; if no
  room is live it runs the original code unchanged (see the `updateReportBody`
  route in [server/routes/project/reports.ts](server/routes/project/reports.ts)
  — the room branch returns early, otherwise it falls through to the same
  `updateReportBody` + `notifyLastUpdated` it always did).
- **The schema change is purely additive.** All new columns are nullable and
  ignored by the old read paths. Old rows and non-collab reads behave
  identically. Zero `notify*` calls were removed from the pre-existing
  routes — the collab path only adds notifies on top.

### 2. How the flow changes

**Old flow (still the fallback):** client edits → REST `PUT` → DB `UPDATE`
(one column + `last_updated`) → `notifyLastUpdated` → SSE → other clients see
the `last_updated` bump and refetch. Last-write-wins, no live merge.

**New flow (when a collab room is live):**

1. Client edits go over the **WebSocket** as Yjs deltas → applied to the
   server's authoritative master Y.Doc (`applySlideUpdate` /
   `applyReportUpdate` — defined in `slide_rooms.ts` / `report_rooms.ts`,
   invoked from `project-collab.ts`).
2. The master doc **relays** the delta to the other subscribers immediately
   (sub-second, no refetch — this is the genuinely new capability).
3. A **1.5 s debounced checkpoint** materializes the doc and calls the
   checkpoint function → the same DB row, same `last_updated` discipline.
4. That checkpoint then rings the **same SSE bell** (`notifyLastUpdated`) so
   everything _outside_ the room — list cards, project members not currently
   in the document — invalidates and refetches as before.

**The crucial glue (the "chokepoint"):** when a REST save arrives _while a
room is live_, it does not write the DB directly (that would clobber the
master copy on its next checkpoint). It is routed **through** the room via
`applyReportToLiveRoom` / `applySlideToLiveRoom` / `applyPoToLiveRoom` (thin
binding wrappers over `applyToLiveRoom` in
[server/collab/doc_rooms.ts](server/collab/doc_rooms.ts)) so the master doc
stays authoritative. Merging into the live doc _is_ the conflict resolution —
the report room path reports `conflicted: false`; the slide room path returns
just the fresh `lastUpdated` (that family's conflict signal is the CONFLICT
error, which the room path never produces).

### 3. Same functions for the Postgres save and the SSE?

**SSE: identical wrappers.** Both the REST routes and the collab checkpoint
deps call the same `notifyLastUpdated(projectId, resource, [ids],
lastUpdated)` from S3's notify catalog. The collab side adds **two** debounced
extras — the reports-list and viz-list rebroadcasts
(`scheduleReportsListRebroadcast` / `scheduleVizListRebroadcast` in
`project-collab.ts`, 5 s per project, calling the existing
`notifyProjectReportsUpdated` / `notifyProjectVisualizationsUpdated`) —
because those list payloads are too heavy to fire on the 1.5 s checkpoint
cadence. Slide checkpoints need no list rebroadcast; they row-notify both the
slide and its deck. Same SSE mechanism, just throttled per project.

**Postgres: different function, same table, same stamping.** The classic path
uses the per-column `update*` functions; the collab path uses the checkpoint
functions (`saveReportCheckpoint`: one superset `UPDATE` writing body +
figures + images + `crdt_state` + `crdt_state_last_updated` + `body_authors`;
`saveSlideCheckpoint`: one transaction updating the slide + bumping the deck;
`savePresentationObjectCheckpoint`: one `UPDATE`, gated
`is_default_visualization = FALSE`). What matters is that **both stamp
`last_updated = new Date().toISOString()` identically** — that is precisely
what keeps S3's `last_updated → SSE → cache` triangle working the same way
regardless of which path wrote the row.

### 4. WebSocket vs the SSE project boundary

The WS endpoint is a **sibling of the SSE endpoint at the same project
boundary**, not a new boundary: same scoping and auth (keyed by
`:project_id`, resolved via the same `resolveProjectUserAccess` BEFORE
upgrading — the code cites project-sse-v2.ts explicitly); **one WS connection
per client per project**, registered at project level
(`addConnection(projectId, connectionId, …)`) and **multiplexing** individual
documents via the `*_subscribe`/`*_unsubscribe` families — exactly parallel to
the one-SSE-per-project model. Presence broadcasts per project.

Hold it as two layers inside the same project boundary: **SSE (S3) = the
invalidation bus** (unchanged, project-wide) — authoritative for keeping every
surface consistent; **WS (S16) = the live collaboration layer** (per-document,
only while subscribed) — Yjs deltas, presence, awareness, none of it persisted
through SSE. They are not alternatives — **the WS layer feeds the SSE layer.**
For two users in the same live room, the WS relay outruns the SSE-driven
refetch, so for that pair the SSE notify is effectively redundant — but it
still fires, and it is still what informs everyone _outside_ the room.

---

## Version history

Google-Docs-style version history for reports and slide decks: a browsable
list of versions at timestamps showing which users edited in each window, with
preview, compare (reports), restore, and restore-as-copy. Versions are **whole
documents** — a full report (body + figure/image registries) or a full deck
(deck config + every slide) — one per _editing session_, not per keystroke or
per CRDT operation.

### Storage

Two project-DB tables (migration `033`, mirrored in `_project_database.sql`):
`report_versions` and `deck_versions`. Each row is a full content snapshot —
report: `label, body, figures, images`; deck: `label, deck_config, slides`
(JSON `[{id, sortOrder, config}]` — original slide ids are kept so restore
preserves identity) — plus `editors` (JSON `[{email, name}]` — everyone who
edited in the session window), `content_hash`, `created_at`, and nullable
`restored_from_version_id` (set only by the restore routes).

- **Label is snapshotted explicitly** in both tables (`updateSlideDeckLabel`
  writes only the label column, so the deck config alone is not
  label-authoritative). **Not versioned (v1)**: report `config` (display
  prefs) and deck `plan` (AI planning text) — not document content.
- **Dedup**: `content_hash` = md5 of `canonicalJson` of the snapshot data
  (`canonicalJson` in [crdt_util.ts](lib/collab/crdt_util.ts) kills key-order
  nondeterminism across write paths). A session whose end state hashes equal
  to the _newest_ stored version writes nothing. (`body_authors` /
  `slide_editors` are NOT part of the hash — dedup is about content, not
  attribution.)
- **Retention**: newest 100 per document, pruned in the writer after each
  insert ([server/db/project/versions.ts](server/db/project/versions.ts));
  `ON DELETE CASCADE` removes versions with their parent document.
- **Ordering**: every version query (list, lineage, latest-hash, prune) orders
  by `(created_at, id)` — same tiebreak everywhere, so list order and lineage
  "newer than" can never disagree. Restore writes two versions back-to-back;
  the restored-state insert stamps `created_at` strictly after the safety
  version's (`isoStrictlyAfter`), so the pair can't tie.
- **Schema drift**: snapshots are stored _verbatim_ (no zod re-parse on
  insert — a schema change must never fail the version write). Migration
  transform blocks do NOT sweep the version tables; instead, restore/copy
  validate every content field of the snapshot with the _current_ schemas
  (`reportFiguresSchema`/`reportImagesSchema`; `slideDeckConfigSchema` +
  per-slide `slideConfigSchema`) BEFORE touching anything. A snapshot the
  current schemas reject fails fast with a clear error and zero side effects —
  it is never applied to a live room, whose checkpoints would otherwise fail
  forever.
- **`sizeBytes`** is true stored bytes: `octet_length()` in the list SQL and a
  `TextEncoder` count in the detail path, so the two always agree.

### Capture — editing sessions

[version_tracker.ts](server/collab/version_tracker.ts) is a pure factory
(`createVersionTracker(deps, opts)`) with injected clock and storage. It keeps
one in-memory accumulator per `(projectId, kind, docId)` holding the
contributor set and timing. A session flushes to ONE version when any of:
document idle 10 min, session length 45 min (long sessions split), or collab
room emptied and quiet for 2 min. A 30 s sweeper drives flushes
([version_capture.ts](server/collab/version_capture.ts)
`startVersionSweeper()`, started in main.ts). Flush = detach accumulator →
load current content → hash-dedup vs newest version → insert + prune. The
loaders flush any LIVE room first (report room / every open slide room, then
re-read) — a room can be up to 1.5 s ahead of the DB, and snapshotting the
stale row would both date the version and fail the ledger-vs-text validation
below. The load contract is strict: **null means the document ROW IS GONE**
(session dropped); the loaders map only not-found to null and THROW on
anything else (connection blip, pool exhaustion), which — like a failed
insert — merges the accumulator back and retries next sweep. Graceful shutdown
calls `flushAllVersions()` **before** the DB pools close; a hard crash loses
at most one session window's attribution (accepted).

**Capture points** (all writes are covered — every non-collab write goes
through the HTTP routes, including client-side AI tools):

- **Collab edits**: `RoomConn.identity` ({email, name}, stamped by the WS
  route) → `DocRoomDeps.onEdit(editor)` fires in `applyDocUpdate`; `onEmpty()`
  fires when the room finalizes. Slide rooms record against the **deck** id
  (whole-deck versions) via the deps closure's captured `deckId`.
- **Room-routed HTTP writes** (AI accepts, fallback saves):
  `applySlideToLiveRoom` / `applyReportToLiveRoom` take an optional `editor`
  param → same `onEdit` hook.
- **Direct route writes**: `recordVersionEdit(projectId, kind, docId, editor)`
  after success, identity from `c.var.globalUser`. Slides:
  create/delete/duplicate/move + the updateSlide fallback (the DB fn returns
  `deckId` for attribution); decks: config + label; reports:
  body/figures/images fallbacks + label.
- **Restore routes do NOT record** — they write versions explicitly (below).

### Per-character authorship (report bodies)

Session-level attribution can't say WHO typed a specific word when two people
share a session. [authorship.ts](server/collab/authorship.ts) closes that gap:
while a report room is live, a Y.Text observer (exact retain/insert/delete
deltas — no diffing) maintains a run-length author-per-character ledger in
lockstep with the body. WHO comes from the transaction origin: the RoomConn's
identity for collab edits, the `versionEditor` origin tag `applyToLiveRoom`
sets for HTTP-routed writes, nothing for restores (⇒ unknown). Checkpoints
persist the ledger in `reports.body_authors` under the same validity stamp as
`crdt_state`; version snapshots freeze it in `report_versions.body_authors`.

**Deletions leave TOMBSTONES**: a deleted range's runs stay in the ledger with
`deletedBy` set (keeping the original writer in `email`) AND the deleted
`text` itself, anchored exactly where the text vanished — live runs
concatenated still equal the body (the alignment invariant, checked at persist
time). Inserts land AFTER tombstones at the same anchor. The client attributes
removals by building the step's **ghost document** (body + tombstone texts
spliced back in) and diffing the previous version against it — each removed
character lands on the tombstone that swallowed it, which survives
word-aligned hunk boundaries, unrelated typed-then-deleted ghosts at the same
spot, and several deleters inside one hunk (a boundary character shared by two
adjacent deletions can align to either — inherent diff ambiguity, ≤1 char).
Tombstones live for ONE version window: `compactTombstones` drops them right
after a version snapshots them (in `writeVersion` and after a restore's
version inserts), so a version's tombstones are precisely "deletions since the
previous version". Compaction covers BOTH copies: the in-memory ledger AND the
persisted `reports.body_authors` row (`stripPersistedBodyAuthorTombstones`,
guarded by the validity stamp so a concurrent checkpoint wins) — a version
insert never bumps `last_updated`, so without the DB strip the next room would
re-adopt the old tombstones and every later version would re-freeze deletions
from long-closed sessions. A defensive cap (~2000 tombstone runs) bounds
churn-heavy sessions.

The diff views split each inserted range by the step's ledger, so hover reads
"Added by Alice A" (exact) instead of the whole editor set, and split each
REMOVED range by the step's tombstones, so struck-through spans name the exact
deleter too. Each change is tinted with its author's presence color
(`presenceColorForKey(email)` + the editors' translucent `"33"` convention;
neutral gray when unknown), removals additionally struck through, and hovering
shows a caret-style name flag (the y-codemirror `.cm-ySelectionInfo` look, not
a browser tooltip). Characters the ledger can't attribute — pre-feature text,
non-collab edits, restores, a stale-crdt_state re-seed, ranges chipped across
multiple sessions — fall back to the session label, phrased honestly as
"Added/Removed by one of: Alice A, Bob B". The ledger is best-effort — if it
ever falls out of alignment with the body it is discarded (poisoned run /
live-length check), never persisted wrong; belt-and-braces, the version loader
also refuses a ledger whose live length doesn't match the body it read.

### Deck attribution — session ledger + element ledgers

Per-slide attribution comes from
[deck_session_ledger.ts](server/collab/deck_session_ledger.ts) — the deck
analog of the report body ledger: every slide-level write path (room edits via
the slide-room deps closure, create/duplicate/delete/move/update routes, deck
settings/label) records WHO touched WHICH slide; the map freezes into
`deck_versions.slide_editors` when the version is written, and drains into the
safety version on restore. Bounded per entry (`SLIDE_CAP=500`,
`ELEMENTS_PER_SLIDE_CAP=100`). Unlike report bodies this ledger is in-memory
only (accepted restart window; there is no deck-level checkpoint row to
persist it to).

**Element level**: `observeSlideDocElements`
([slide_crdt.ts](lib/collab/slide_crdt.ts)) — a deep observer on the slide
room's doc — maps each transaction's Yjs paths to stable element keys
(`field:<name>`, `block:<id>`, `layout`, `props`; fracIndex-only changes count
as layout, not block edits) and records them per slide in the deck ledger
(`elements` in slide_editors). On top of the plain touched set, the observer
CLASSIFIES ops into extra buckets: block add/remove comes from SET-DIFFING the
layout's item-id inventory before vs after the transaction
(`elementsAdded`/`elementsRemoved` — deliberately semantic, NOT event-shaped:
`syncSlideToDoc` collapses/unwraps containers, so a deleted block frequently
never appears as its own children-key delete; the id-inventory diff catches
every structural encoding, and a MOVE classifies as neither), and Y.Text
delete ops (or a root-field key removal) become `elementsTextDeleted` — only
the item's own `markdown` Y.Text counts; figConfig's three caption Y.Texts are
excluded (their interleaved deltas would corrupt the ledger). Only map events
under the layout trigger the re-walk — typing never pays for it.

**Per-character text authorship on slides**: every text element additionally
gets a run-length ledger — the report body machinery keyed per
(slide, element), fed by the observer's `textDeltas`. Deletions become
text-carrying tombstones; `snapshotSlideElementAuthors` freezes them into
`slide_editors.slides[id].elementAuthors` at version write (validated against
the persisted texts — current, because the version loader flushed the rooms
first), and the element diff hands them to `computeAttributedDiff` — the same
ghost-alignment path as report diffs — so even TWO people deleting in the SAME
textbox each get their own exactly-attributed spans. Blocks created WITH
seeded text (duplicate, AI insert, paste) get their ledger registered on the
observer's `added` event, seed attributed to the adder. Cleared optional root
fields stay covered: `listSlideConfigTextElements` emits every type field
(empty string when absent), so an emptied field's tombstones survive to
snapshot. Fallback layering per removed span: `authors` ghost (per-span
exact) → `removedLabel` (element deleter set) → session label. Ledgers are
compacted after the version insert succeeds — per CAPTURED element only, so a
ledger that failed validation keeps its tombstones for the next window —
dropped when the room is gone or the slide row is deleted. Whole-slide
deletion is exact independently: the deleteSlides route records the deleting
user in the slide-level `removed` bucket.

### Read + restore APIs

Registry entries in [lib/api-routes/project/reports.ts](lib/api-routes/project/reports.ts)
and [slide-decks.ts](lib/api-routes/project/slide-decks.ts); handlers in the
matching S12 route files. `list*Versions` / `get*Versions` /
`getReportVersionLineage` need `can_view_*`; `restore*Version` /
`copy*Version` need `can_configure_*` + `preventAccessToLockedProjects`. List
summaries compute sizes/counts in SQL and never ship snapshot content.

**Restore sequencing** (both kinds): ⓪ validate the snapshot's content fields
with current schemas (fail fast, zero side effects), flush the document's live
room(s) (`flushRoomForDoc`), and drain the document's open tracker session
(`drainVersionEditors`) → ① write a **safety version** of the current state
(editors = the drained session's editors, or [restorer] when none; skipped
when it already equals the newest version by hash — on any early failure the
drained editors are re-injected into the tracker) → ② apply the snapshot →
③ write a **restored-state version** with `restored_from_version_id` set.
Nothing is ever lost, and the restore itself appears in history. The
restored-state version keeps the source snapshot's LIVE authorship runs but
STRIPS its tombstones (`stripTombstoneRuns`) — those describe deletions
already captured by that old version, and carried along they would
misattribute what THIS restore removed to those long-ago deleters.

Step ② by kind:

- **Report**: through `applyReportToLiveRoom` when a room is live (co-editors
  follow the restore live in their open editors); label restored by direct
  update (not part of the room doc) — a failed label write fails the request
  (partial restore is reported, never masked). No room ⇒
  `restoreReportContent` — one UPDATE whose `last_updated` bump
  auto-invalidates stored `crdt_state`.
- **Deck**: `planDeckRestore(currentIds, snapshotSlides)` (pure) partitions
  into `toDelete` / `toInsert` / `toUpdate`; then `remapCollidingSlideIds`
  replaces any `toInsert` id that a slide in ANOTHER deck now holds (3-char
  ids are only unique against live rows — re-inserting verbatim would abort on
  the PK forever). Rooms for the final `toDelete ∪ toInsert` ids are discarded
  via `closeSlideRoom` (a stale room would fail checkpoints forever on a
  deleted row, or clobber a re-created one; remapping first means another
  deck's live room is never touched). Then ONE transaction
  (`restoreDeckStructure`): delete rows, re-insert with snapshot ids +
  snapshot order, restore every survivor's sort_order, deck label + config,
  `reSequence`. Then each `toUpdate` slide's config applies through
  `applySlideToLiveRoom` (or a direct update when no room); failures are
  collected — any failure returns an error and skips the restored-state
  version (history must never claim content the DB doesn't hold; the safety
  version makes retrying safe). Safe ordering: checkpoints never write
  `sort_order`, so a straggler checkpoint after the transaction can only
  rewrite config, and the safety version covers the crash window. Attribution
  across the restore: the safety version freezes the drained session's
  `elementAuthors` (compacting the captured elements' tombstones), and after
  the restored-state insert every surviving slide's element ledgers are
  compacted wholesale — the config re-apply floods them with unknown-deleter
  tombstones that must not leak into the next session's version.

**Restore-as-copy**: `copyReportFromVersion` / `copyDeckFromVersion` create a
brand-new document from the snapshot (decks get FRESH slide ids — the
originals may still exist). Zero-risk path; no room interaction. Deck copy
validates every config first and inserts deck + slides in ONE transaction.

**Room hygiene on delete**: the delete routes discard live rooms via the
binding wrappers `closeSlideRoom` / `closeReportRoom` (over
`closeRoomsForDoc`) — without them, `deleteSlides` / `deleteSlideDeck` /
`deleteReport` would leave zombie rooms retrying failed checkpoints forever.
`deleteSlideDeck` aborts if the pre-delete slide-id fetch fails (deleting
anyway would leave every live room a zombie). `deleteSlides` closes rooms and
records `removed` attribution only for the ids the DB ACTUALLY deleted
(`RETURNING id` — the delete is deck-scoped, and a requested 3-char id that
now belongs to another deck must not have that deck's live room discarded or a
false "removed by" recorded). `closeSlideRoom` also drops the slide's element
ledgers AND its pending element touches — both are keyed by slide id alone,
so left behind they would drain into whichever later session first records a
reused id.

### UI

[client/src/components/version_history/](client/src/components/version_history/)
— `VersionHistoryEditor`, a full-panel editor: day-grouped version list on the
left (pinned "Current version" row, contributor chips via `PresenceAvatars` +
`presenceColorForKey(email)`, names preferring live
`projectState.projectUsers` over the stored capture-time name, "Restored"
badge, slide counts), preview on the right. The version list is a plain
one-shot fetch refreshed by its own Refresh button — deliberately not tied to
the `last_updated` cache triangle (a version insert never bumps
`last_updated`, by design).

- **Report**: opens on **"Edits in this session"** — the diff of the selected
  version against the version immediately before it (the oldest diffs against
  an empty document); a toggle switches to **Preview** — the snapshot body
  through `MarkdownPresentationJsx` with embed tokens resolved against the
  version's OWN figure/image registries. "Compare with current" opens a
  unified one-page diff (additions highlighted, removals struck through) where
  hovering a change names who made it. Attribution is per editing session: the
  `getReportVersionLineage` route returns the compared version plus every
  newer version (bodies + editors + per-character `bodyAuthors`; no figure
  payloads), and `version_diff.ts` diffs adjacent steps, mapping each step's
  changes forward through CodeMirror `ChangeSet`s into current-document
  coordinates — insertions carry the session that wrote them (later sessions
  editing inside win on overlap), deletions the session(s) whose diff consumed
  the text. Changes newer than the newest stored version are labeled as
  recent, not-yet-versioned edits.
- **Deck**: paged canvas grid — 6 per page (`convertSlideToPageInputs` →
  `PageHolder`; live canvases are expensive) with click-to-expand. Session
  edits show as thumbnail badges (New/Edited vs the previous version,
  `canonicalJson` compare) and slides REMOVED in the session render as dimmed
  ghost thumbnails (previous version's config, near their old position), plus
  a summary line. Badges are tinted with the author's presence color (single
  author) and hover names them exactly, falling back to the session's editor
  set ("by one of: …", neutral gray) for pre-feature versions or after a
  restart. The previous version loads alongside; a FAILED load is
  distinguished from "oldest version" — badges and the summary are suppressed
  with an explanatory note instead of asserting wrong attribution. Clicking an
  EDITED slide expands it with a "Changes in this session" list — which title
  field / text block / visualization / image changed, who changed each one,
  and inline text diffs for text elements. WHAT comes from `diffSlideElements`
  (client, pure — element-by-element config diff); WHO comes from the deck
  ledger's buckets; the two key vocabularies match by construction. The
  preview resolves a removed/added element row from its exact bucket first, so
  a block Bob deleted after Alice edited it reads "removed by Bob B", not
  "removed by one of: Alice, Bob". Element attribution exists only for collab
  edits (the observer lives on the room doc); REST-path slide saves fall back
  to the slide-level editors.

Footer (configure permission + unlocked): **Restore** (confirm explains the
safety version) and **Restore as copy** (name prompt). Entry points: History
button in the report editor heading bar; "Version history" in the deck
overflow menu.

### Known tradeoffs (v1)

- Full snapshots × multi-MB figure bundles ⇒ storage growth; contained by
  hash-dedup + the 100 cap (summaries expose `sizeBytes`). Delta storage is
  future work.
- In-flight checkpoint racing `closeRoomsForDoc`: harmless for deletes (save
  fails on the gone row); microsecond window for re-inserted ids. Same class:
  an id collision appearing between `remapCollidingSlideIds` and the restore
  transaction.
- Contributor attribution on hard crash: at most one open session window lost;
  deck element ledgers are in-memory only (same window).
- Hash false-negatives (schema-normalization drift between write paths) can
  produce an occasional duplicate version — harmless.
- The report editor logs (rather than alerts) collab errors: report rooms are
  only discarded when the report row is deleted, where the whole editor is
  already stale.

## Open items

- **No heartbeat/ping-pong or idle-connection reaper on the collab WS**
  (Sweep 5 finding, ON HOLD per Tim 2026-07-21). Cleanup of the presence map
  and room `conns` runs exclusively off WS `onClose`/`onError`; a connection
  that dies without a close frame (killed tab, sleep, silent network drop) can
  leave a ghost presence entry and keep a doc room alive while any other real
  user stays in it. Fix shape when taken up: periodic server→client ping with
  pong-timeout invoking the existing `removeConnection`/`handleConnGone`
  cleanup.
- **Unguarded per-send broadcasts in `doc_rooms.ts`** (Sweep 5 finding,
  awaiting ruling): the update fan-out and awareness relay loops (and
  `subscribeDoc`'s two sync sends) lack the per-send try/catch
  `presence_registry.ts` uses. One stale peer's throwing `send()` can unwind
  into `applyDocUpdate`'s catch, misreport a valid editor's update as
  "Malformed document update", skip attribution, and in a worst-case
  interleaving leave the last edit un-dirty so `finalizeRoom` skips
  persisting it.
