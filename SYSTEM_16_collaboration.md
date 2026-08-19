---
system: 16
name: Realtime Collaboration & Version History
globs:
  - client/src/components/version_history/**
  - client/src/state/instance/collab.ts
  - lib/collab/**
  - lib/types/collab.ts
  - lib/types/versions.ts
  - server/collab/**
  - server/routes/instance/collab.ts
---

# S16 — Realtime Collaboration & Version History

_Google-Docs-style real-time co-editing for slide decks and reports —
WebSocket transport, server-authoritative Yjs rooms, presence, live cursors —
plus the version-history layer built on top: editing-session capture,
per-character / per-slide / per-element attribution, and restore._
Reviewed against code 2026-07-27 (absorbs DOC_SLIDE_COLLAB,
DOC_SLIDE_COLLAB_FEATURES, DOC_VIZ_COLLAB, DOC_VERSION_HISTORY).

## Scope

See the `globs:` frontmatter (the lint-enforced manifest) and the S16 row in
[SYSTEMS.md](SYSTEMS.md). In one breath:

- **Transport & rooms** — `server/routes/instance/collab.ts` (the ONE
  instance-wide WS endpoint), `server/collab/doc_rooms.ts` (the generic
  master-copy room core: seed, relay, debounced checkpoint, chokepoint), the
  two thin per-document-type bindings `slide_rooms.ts` / `report_rooms.ts`,
  and `server/collab/presence_registry.ts`.
- **CRDT model** — `lib/collab/{crdt_util,report_crdt,slide_crdt}.ts`,
  `lib/types/collab.ts` (the WS message protocol), client
  `state/instance/collab.ts` (one WS manager for the instance — the
  T1-adjacent store, PROTOCOL_APP_STATE.md).
- **Figure co-editing** — `lib/collab/figure_config_crdt.ts` (the shared
  `PresentationObjectConfig ⇄ Y.Map` bridge: per-field LWW for the `d`/`s`
  form config, `Y.Text` for the three captions). Every figure lives INSIDE a
  slide or report: the bridge is applied to a `figConfig` Y.Map nested in the
  host doc's figure node (the heavy bundle data rides beside it as an opaque
  `figData`), and the figure editor modal binds to it live via a
  `collabBinding` — no binding (the Explore tab's standalone editor) means
  Apply/Cancel, not co-editing. There is no separate figure room, no figure
  message family and no figure CRDT column: a figure's persistence is its
  host's checkpoint.
- **Version history** — `server/collab/{version_tracker,version_capture}.ts`,
  the attribution ledgers `authorship.ts` (per-character report bodies, with
  tombstones) + `deck_session_ledger.ts` (per-slide / per-element decks),
  `server/db/products/versions.ts`, `lib/types/versions.ts`, and the client
  `components/version_history/**` (diff, compare, previews, restore modals).
- **Shared custody.** The server chokepoint branches, checkpoint functions, and
  version routes ride **S12**'s files (`server/db/products/**`,
  `server/routes/products/**` — SYSTEMS.md §4.1). The collab client UI
  (`_shared/live_cursors.tsx`, `_shared/cursors/`,
  `_shared/presence_toasts.tsx`, `_shared/connection_banner.tsx`,
  `_shared/collab_markdown_editor.tsx`, the presence avatars and editor
  overlays) lives inside S12's manifest globs — S12 owns those files; this
  system documents the collab behavior in them. The figure editor modal that
  binds `figConfig` is **S11**'s (`components/figure_editor/**`).

## Contract

- **Master copy is authoritative.** Each open document has one server Y.Doc;
  browsers sync over WS; it debounce-checkpoints (1.5 s) to the normal DB row.
  Every programmatic write (REST save while a room is live, restore) goes
  **through** the room via the `apply*ToLiveRoom` chokepoints so the master
  copy is never bypassed.
- **Rides two neighbouring systems, replaces neither.** Checkpoints persist by
  calling **S12**'s document tables (`saveReportCheckpoint` /
  `saveSlideCheckpoint` in `server/db/products/{reports,slides}.ts`, onto the
  `crdt_state` / `body_authors` / `slide_editors` columns) and then ring
  **S3**'s notify hub (`notifyProductsUpserted` always; a slide checkpoint
  additionally `notifyLastUpdated("slides", …)`). See the boundary section
  below — this is the load-bearing integration contract.
- **Attribution is honest.** Exact per-character / per-slide / per-element
  "who" accrues only for edits made through a live collab room; everything
  else falls back to session-level "one of: …" wording. Ledgers self-poison
  rather than show wrong names.
- **Version capture is session-based** (10 min idle / 45 min max / 2 min
  room-empty), hash-deduped, retained newest-100-per-document, restore writes a
  safety version first. Session finalization also writes `user_logs` activity
  rows (`reportEditSession`/`deckEditSession`) — contract on `onSessionEnd` in
  `version_tracker.ts`.

## What users get

Presence avatars inside the editors — the deck overview header and its
per-slide cards, the slide editor header, the report editor header, and the
figure editor's panel tabs (`+N` overflow chip past five people); idle dimming
(`opacity-40 grayscale` after 3 min without input, lit again on the next
input, never while editing); join/leave toasts (top-right, below the header)
keyed per person with a short grace window so refreshes/reconnects stay silent
and switching documents yourself never announces the people already there.
Live co-editing: character-merged text with remote carets/selections and
per-user undo (Ctrl+Z never undoes a collaborator); layout, figure, and style
changes propagate live; "who is editing what" borders on the slide canvas and
around report embeds. Figma-style live cursors with name tags, click ripples,
and `/`-triggered cursor chat on the slide canvas, the figure editor modal
(preview + settings panel), and the report editor (both panes; typing hides
your own pointer). Continuous autosave with no Save button; graceful
single-user fallback when the WS can't connect (explicit save with conflict
dialog); reconnect-forever with two-way catch-up; deterministic per-user
identity color (hashed from email, server-stamped, unspoofable — only the
avatar URL is self-reported).

**Presence is per PRODUCT and lives only in the editors.** Opening a product
puts you in its presence group; the Products page, the Explore tab and every
instance tab put you in none. So there are no list-page cursors and no
presence avatars on product cards — those surfaces show no peers at all.

## Transport — one WebSocket per instance

- Endpoint: `GET /collab`, upgraded in
  [server/routes/instance/collab.ts](server/routes/instance/collab.ts),
  mounted raw in `main.ts` behind the global `authMiddleware` (off-registry —
  S1's inventory). Auth mirrors the SSE endpoint and completes **before** the
  upgrade (the auth middleware precedes `upgradeWebSocket` in the same chain,
  so no message can precede the check): origin check → Clerk auth →
  `globalUser.approved`. **Admission is origin + Clerk + approved, full stop.**
  There is no per-document gate below it: every approved user is a full editor
  of every product, so a connection that is admitted may subscribe to and edit
  any slide or report. Presence carries identity plus opaque ids, never labels
  or content.
  Authorization refusals are delivered as a **post-upgrade close** with
  `COLLAB_CLOSE_UNAUTHORIZED` (4403) rather than an HTTP status, because a
  browser cannot read a refused handshake (it surfaces as an unreadable 1006,
  indistinguishable from a network drop); only the Origin check (403, never
  upgrade for a foreign origin) and the **retryable 503** — a throw while
  resolving the connecting user, i.e. DB trouble rather than a verdict — stay
  pre-upgrade, the latter precisely so the client keeps its normal reconnect
  behaviour instead of latching `unauthorized`.
  The Origin allowlist mirrors `server/middleware/cors.ts` (WS handshakes
  bypass CORS); same-origin requests are additionally allowed, and requests
  with **no** Origin header pass (non-browser clients). Frames over 32 MiB
  (measured in string length) are rejected unparsed (`error` reply); every
  parsed frame is schema-validated (`collabClientMessageSchema` in
  [lib/types/collab.ts](lib/types/collab.ts) — bounded presence/awareness
  payload sizes, `avatarUrl` restricted to bounded https URLs) before any
  handler touches it.
- **`RoomConn.canEdit` is always `true`.** The field is kept rather than
  removed so a later permission model slots in at the one place the conn is
  built, instead of having to be re-threaded back through `doc_rooms`, both
  adapters and every error path. `applyDocUpdate` still enforces it, and
  `COLLAB_NO_EDIT_PERMISSION` still exists as the non-fatal refusal the client
  recognizes — the machinery is live, its answer is currently unconditional.
- Message protocol ([lib/types/collab.ts](lib/types/collab.ts)) — two document
  families, kept as separate message sets (rather than a generic `doc_*`
  protocol) so each family's wire format stays byte-stable across deploys:
  - client → server: `presence_update`, `{slide,report}_subscribe` /
    `_update` / `_unsubscribe`, `awareness_update`, `report_awareness_update`,
    and `ping` (liveness probe — below).
  - server → client: `hello` (connectionId + serverVersion), `presence_state`
    (full peer list), `{slide,report}_sync` / `_update` / `_error`,
    `awareness` / `report_awareness`, `doc_save_state` (room checkpoint
    health), `pong`, and a connection-level `error` (oversized or invalid
    frame). The `*_error` messages carry an optional `fatal` flag: fatal ⇔ the
    document/room is gone (deleted, replaced, not found) and the session must
    stop editing; non-fatal = per-operation rejection.
- Dead-peer detection is asymmetric by platform necessity:
  - **Server side is the runtime's.** Deno pings every client at the protocol
    level and closes unresponsive connections (`idleTimeout: 30`, pinned
    explicitly at the upgrade call in collab.ts), firing the same
    onClose/onError handlers as a graceful close — so an ungracefully dropped
    client leaves presence and its rooms within ~30 s. (Verified empirically:
    a handshaked-but-silent TCP peer is reaped at exactly 30 s.) These
    protocol pings also keep idle tunnels alive through nginx's default 60 s
    proxy timeouts.
  - **Client side is the app-level `ping`/`pong` watchdog** (collab.ts):
    browsers can neither observe protocol pings nor send their own, so the
    client pings every 25 s and force-closes the socket when no traffic at
    all returns within 10 s — dropping into the normal reconnect + catch-up
    path. Without it, a silently dead path (NAT drop, server hard-kill) keeps
    the socket OPEN-looking for minutes: editors claim "Live" and
    `session.isLive()` misleads the close-flush logic.
- Client manager:
  [client/src/state/instance/collab.ts](client/src/state/instance/collab.ts)
  (~1,110 lines) — one module-level connection, mirroring the SSE manager.
  `InstanceSSEBoundary`
  ([t1_sse.tsx](client/src/state/instance/t1_sse.tsx)) disconnects it on
  cleanup, and an effect on `instanceState.currentUserApproved` connects it:
  approval is the one thing the socket waits on, because an unapproved user
  was never allowed on it. Nothing client-side DISCONNECTS on a false reading
  — `currentUserApproved` goes false transiently on every SSE reconnect (the
  store reset), and a real de-approval is closed server-side
  (`closeConnectionsForEmail`), which is the authority anyway.
- Reconnect: exponential backoff (1 s → 30 s cap), retrying FOREVER;
  `online` / tab-refocus events short-circuit the wait; a top-center banner
  ([connection_banner.tsx](client/src/components/_shared/connection_banner.tsx))
  shows "Connection lost — reconnecting…" (+ Reload) and flashes "Live again"
  on recovery — never on a normal initial connect. The **one** exception to
  retrying forever is an authorization refusal (close 4403, or the standard
  policy code 1008): `onclose` reads the code, latches `unauthorized`, and
  stands down in the silent `"unauthorized"` state — no banner, since nothing
  is broken and no retry could help. `reconnectCollab(reason)` clears the
  latch, so a later grant reconnects; its two callers are
  `reconnectForApproval` (the unapproved → approved transition, in `t1_sse`)
  and `reconnectForStaleEditAuth` (a cooldown-guarded reconnect when the
  server refuses an edit the client's own state says is allowed — the socket's
  snapshot auth is stale). Close-intent is tracked **per socket** (WeakSet) so
  a deliberate teardown can't be mistaken for a failure and open a duplicate
  connection. `socket.onopen` re-sends presence and re-subscribes every open
  doc session (the server then sends only what each doc's state vector is
  missing). The server's `hello` carries `serverVersion`; a mismatch against
  the mount-check's localStorage key forces a page reload (once per version,
  sessionStorage-guarded) — a tab surviving a deploy must NOT ship its
  pre-deploy Yjs docs into freshly re-seeded rooms via the catch-up, and the
  reload re-runs the mount check, busting the IndexedDB caches off the same
  trigger.
- Ops requirement: reverse proxies must forward WebSocket upgrade headers on
  `/collab`.

## Presence — who is where

- Server:
  [server/collab/presence_registry.ts](server/collab/presence_registry.ts)
  keeps a flat `connectionId → PresenceEntry` map plus `productId →
  connectionIds` broadcast groups. An entry is server-stamped identity
  (`email`, `name`, `color` via `presenceColorForKey(email)`) plus the
  client-controlled view fields (`deckId`, `slideId`, `selectedBlockId`,
  `selectedTextTarget`, `reportId`, `editingFigureId`, `idle` — see
  `PresenceView` in [lib/types/collab.ts](lib/types/collab.ts), the single
  source). View fields are replaced **wholesale** on every `presence_update`
  so a client clears them by omission; `avatarUrl` is the exception — sticky
  once provided.
- **The presence group is the PRODUCT**, derived from the entry
  (`productIdFor` = `entry.deckId ?? entry.reportId ?? null`; a client is only
  ever in one editor, so the two never both carry a value). Connecting alone
  puts you in NO group — `addConnection` registers identity and nothing else,
  and the client's first `presence_update` naming a doc is the first moment
  there is a group to broadcast. Moving between products is therefore a field
  update, not a re-registration, and `updateConnectionPresence` broadcasts
  BOTH the group left and the group joined so a peer leaving a deck disappears
  from its peer list immediately. `broadcastPresence(productId)` sends the
  group's full peer list to that group only — a keystroke in one deck never
  re-serializes anyone else's peers. The registry owns ALL broadcasting;
  `removeConnection` and `closeConnectionsForEmail` (a user email rename: the
  socket's identity was frozen at connect time and cannot be patched in place,
  so the connection is closed and the client reconnects refreshed) go through
  the same path.
- Client: a Solid store mirrors `presence_state`. Presence is keyed per
  CONNECTION, but every consumer asks about PEOPLE, so `otherPeers()` collapses
  it: this user's own connections drop out entirely (their second tab is not a
  collaborator — otherwise you see your own name in the avatar stack and the AI
  busy-guard refuses to edit a slide because "you" have it open), and each
  remaining person yields ONE entry — the connection that is `isEditing`, else
  one that isn't `idle`, else the lowest connectionId so every viewer agrees.
  Anything reading `collabState.peers` directly is asking about connections and
  must say why. Consumers: the deck overview header (filtered on `deckId`) and
  its per-slide cards (filtered on `slideId`) via
  [presence_avatars.tsx](client/src/components/slide_deck/presence_avatars.tsx),
  the slide editor header (same stack, same filter), the report editor header
  (filtered on `reportId`), the figure editor's per-tab avatars, the
  join/leave toasts
  ([presence_toasts.tsx](client/src/components/_shared/presence_toasts.tsx)),
  the in-editor peer overlays, and the AI busy-guard
  ([presence_guard.ts](client/src/components/copilot/ai_tools/validators/presence_guard.ts)).
- Semantics: `slideId` set ⇔ that user has the slide open in the editor (set
  on editor mount, cleared to deck-level on unmount). `selectedBlockId`
  (layout node id) and `selectedTextTarget` (panther text primitive id, e.g.
  `coverTitle`) are mutually exclusive and say which element they're editing.
- Activity signals (both ride the presence entry, NOT Yjs awareness — a peer's
  deck-overview card is outside the slide's doc room):
  - `idle` — client-self-reported. collab.ts tracks local input
    (pointermove/pointerdown/keydown/wheel, capture-phase) and broadcasts only
    the two transitions: idle after 3 min without input (detected on a 15 s
    poll), active again on the next input. Editing state overrides a stale
    idle flag in the avatar UIs.
  - `isEditing` — **server-stamped** in `markConnectionEditing` when a
    `slide_update`/`report_update` arrives. Broadcasts once on the false→true
    edge; each update re-arms an 8 s quiet-period timer whose expiry
    broadcasts the clear — a typing burst costs two presence broadcasts total.
    A `presence_update` preserves the flag (it is not client-settable). It
    still suppresses idle dimming; `PresenceAvatars` can also render it as a
    pulsing badge via `showEditingPulse`, which no surface passes today
    (Open items).

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
  from its push (the modal owns it live). The skip applies ONLY when a
  `figConfig` map already exists: `readFigureBundle`/`readFigureEntry` key off
  `figConfig`, so writing `figData` without one makes the whole bundle
  unreadable and the checkpoint stores an empty figure — with `trusted` TRUE
  (materialize and the row agree, on the wrong thing), so the loss survives
  every re-open. Reachable before the guard: a peer's "Remove visualization"
  deletes `figConfig` while your modal is open, then the modal's close pushes a
  fresh bundle with that block id still in the skip set.
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

### Figure config ⇄ Y.Map

[lib/collab/figure_config_crdt.ts](lib/collab/figure_config_crdt.ts): one
co-editable config Y.Map — scalars per-field LWW, the three captions as
Y.Text. Its only mounting is the `figConfig` nested inside a slide or report
doc's figure node, so a figure has no room, no state vector and no persistence
of its own: its host's checkpoint stores it and its host's version history
versions it. Per-user undo inside the figure editor comes from a local-origin
`Y.UndoManager` over that nested map.

## Server rooms — authoritative doc, relay, checkpoint

The room mechanics are generic
([server/collab/doc_rooms.ts](server/collab/doc_rooms.ts), parameterized by a
`DocRoomAdapter` + injected `DocRoomDeps`) and shared by the two thin
bindings [slide_rooms.ts](server/collab/slide_rooms.ts) and
[report_rooms.ts](server/collab/report_rooms.ts). Rooms are keyed
`docType::docId` — instance-wide, one room per document, no project in the
key; described here in slide terms:

- **Open**: first `slide_subscribe` creates the room. It restores the exact
  prior Y.Doc from `slides.crdt_state` when that state is _current_
  (`crdt_state_last_updated === last_updated` — the staleness rule below),
  else seeds from `slides.config`; a corrupt stored state is caught and falls
  back to seeding. Every subscriber sends its state vector and receives a
  `slide_sync` containing exactly what it's missing, plus the room's own state
  vector (a malformed client SV degrades to a full sync).
- **Relay**: `slide_update` (base64 Yjs update) is permission-checked
  (`canEdit`, enforced in `applyDocUpdate`) and applied to the room doc with
  the sender connection as origin; the doc's update handler forwards it to
  every _other_ connection and marks the room dirty. A malformed update is
  rejected non-fatally without touching the doc.
- **Checkpoint**: dirty rooms persist on a 1.5 s debounce —
  `materializeSlide(doc)` → `saveSlideCheckpoint`
  ([server/db/products/slides.ts](server/db/products/slides.ts)) writes
  `config`, `crdt_state`, and both slide timestamps, and bumps the deck's
  `products` row, in one transaction; then SSE fires —
  `notifyLastUpdated("slides", …)` for the slide and `notifyProductsUpserted`
  for the deck. Collab is authoritative: the checkpoint
  intentionally has no conflict check. Checkpoints are SERIALIZED per room
  (each chains behind the previous save) so two saves can never commit out of
  order — and `flushRoomForDoc` awaits the chain even when the room looks
  clean, because "clean" may mean a save is in flight (the restore routes
  snapshot the DB right after flushing). It RETURNS whether the row is now
  settled: `false` ⇔ the room is still dirty, i.e. its checkpoint failed and
  the DB does NOT hold the room's state. Every caller that reads the row
  afterwards must honour it (see Version history) — silently snapshotting a
  wedged room's stale row would date the version, and hash-dedup would then
  usually write no version at all. A failed save keeps the room dirty
  and broadcasts `doc_save_state failing` to the room (recovery broadcasts the
  clear; late joiners get the failing state re-sent right after their sync) so
  editors show "Not saving — retrying" instead of a false "Live". Failures are
  CLASSIFIED by the save closure (`DocSaveResult`): TRANSIENT (DB trouble)
  retries on a 10 s timer; PERMANENT (schema validation — the same doc state
  fails identically forever) retries only on the next edit, never on a timer
  (a wedged room once burned ~6k log lines/day hot-retrying a figure config
  that could never save — 2026-07-23). Failure logs are throttled to the first
  attempt and every 30th.
- **Close**: when the last connection unsubscribes (or its socket dies),
  `finalizeRoom` flushes a final checkpoint and destroys the room — unless a
  new subscriber arrived during the async flush, in which case the room stays
  alive for them. A FAILED final checkpoint never discards the room (its doc
  is the sole copy of the session tail): a transient failure retries with
  backoff, then keeps the room registered and re-runs on a 30 s cycle until
  the save lands; a PERMANENT (validation) failure keeps the room registered
  with NO cycle — only a returning editor's repair edit (or a restart, which
  drops the tail) resolves it.
  A subscribe whose async load outlives its connection (socket died, or an
  unsubscribe raced it) is NOT registered — the room finalizes instead of
  leaking with a phantom member. On shutdown, `main.ts` starts an 8 s
  force-exit timer, then awaits `flushAllRooms()` before `flushAllVersions()`
  before closing the pools.
- **External writes** (`applySlideToLiveRoom` in `slide_rooms.ts` and
  `applyReportToLiveRoom` in `report_rooms.ts`, both over the generic
  `applyToLiveRoom` in `doc_rooms.ts`):
  the plain update routes first offer the save to a live room. If one exists,
  the payload is synced _into_ the authoritative doc (relayed live to all
  editors) and checkpointed immediately — the chokepoint forces the room
  dirty even when the doc already matched, so the HTTP caller always gets a
  fresh `last_updated`; only when no room is live (`LiveRoomApplyResult`
  `no_room`) does the route write the DB directly. On `save_failed` (room
  applied it, checkpoint failed) routes return an error WITHOUT a direct-write
  fallback — the room retains the change and owns persistence; a direct write
  would be clobbered by the room's next successful checkpoint. (Previously
  both outcomes were a single `null`, so routes double-wrote the DB while a
  wedged room kept serving its divergent doc.) This is what prevents the
  room's next checkpoint from silently reverting AI/manual saves — and why
  those saves appear live in open editors.
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
  (the slide_editor file of the same name is a thin wrapper injecting
  `canEditProducts()` — the ONE product-surface edit gate, which today is just
  "approved"; the figure editor reuses the shared component for caption
  fields): CodeMirror 6 + `yCollab(yText, awareness)`
  (y-codemirror.next). Renders remote carets (colored bar, hover name tag) and
  selections (translucent `colorLight = color + "33"`); Yjs relative positions
  keep every caret stable through concurrent edits. `yUndoManagerKeymap`
  scopes undo to local edits. `plain` prop disables markdown highlighting for
  title fields. Read-only (`EditorState.readOnly` +
  `EditorView.editable(false)`) when `canEdit` is false — read reactively, so
  it re-runs when permissions arrive after mount.
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

### Figure editor

[visualization_editor_inner.tsx](client/src/components/figure_editor/visualization_editor_inner.tsx)
has **one** collaborative surface: the host slide or report editor passes a
`collabBinding` and the figure's config is co-edited IN the host's shared doc
— there is no session of its own to open, and no binding (the Explore tab's
standalone editor) means Apply/Cancel. The binding carries the host's
awareness, a local origin, `isLive()` and `canEdit()`; `pushConfig` diffs the
working config onto the nested `figConfig` map inside a transaction stamped
with that origin, so per-user undo tracks it and the remote-reconcile observer
skips the echo. The `d`/`s` config co-edits per-field and the captions
per-character; per-user undo is a local-origin `Y.UndoManager` over the map;
presence gains `editingFigureId`; the Data / Presentation / Text panel tabs
show per-tab peer avatars via the `vizTab` awareness field on the HOST
awareness (internal keys `"data" | "style" | "text"`, scope-gated
`fig:<figureId>` so one figure's peers never bleed into another's, and cleared
on unmount because that awareness outlives this editor). Live cursors are
scoped the same way. A refetch additionally pushes a COHERENT bundle
(`onCoherentBundle`: the co-edited config plus its freshly-fetched items) so
canvas peers render config and data in step — config alone streams live per
keystroke. The room whose checkpoints persist all of this is the HOST
document's, so `saveFailing` reads `docSaveFailing(hostDoc.docType,
hostDoc.docId)` rather than owning an indicator.
Accepted trade-off: the live push is deliberately unnormalized, so a latent
roll-up flag (the per-entry `rollup`/`rollupPosition` fields on
`disaggregateBy` — valid optional schema fields whose gate is transiently
closed) can persist through a live-session checkpoint; the modal's own
Apply path strips it via `normalizePOConfigForStorage` (`getConfigForSave`).
Schema-INVALID transients are instead dropped from the stored content at
checkpoint — the slide closure runs `dropStorageInvalidTransientsInSlide`, the
report closure `dropStorageInvalidTransientsInFigures`, both walking down to
`dropStorageInvalidTransients` on each embedded figure's `bundle.config` —
without touching the doc: the
strict parse used to throw on them, permanently wedging the room's checkpoint
(observed in production 2026-07-23). Covered: a filter chip with all values
un-ticked, an emptied `valuesFilter` (both min(1) in storage), and a bounded
`periodFilter` (`custom`/`from_month`) whose min/max don't self-identify the
same period format or aren't ordered (`periodFilterSchema`'s refine).
**Every constraint reachable from a live doc belongs in that function** — the
WS ingress applies raw Yjs updates with NO content validation (only the REST
routes validate), so it is the sole guard between a mid-edit state and a
permanently wedged checkpoint. The mirror hazard is a MISSING key rather than
an invalid value: `syncSection` deletes doc keys the pushed config lacks, which
is right for a cleared optional field but would strip a REQUIRED one from the
SHARED doc (wedging every peer's checkpoint), so it never drops a key the
storage schema requires — the required sets are derived from
`presentationObjectConfigSchema` itself so they cannot drift. Such checkpoints
stamp the CRDT state untrusted — see the staleness rule under Persistence &
migrations.

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
report). Every cursor surface is inside a document editor, so there is no
page-level cursor family.

**Awareness field registry** (one shared Awareness per session — do not
collide): `cursor` = yCollab text caret (nulled on every CM blur); `user` =
identity — name/color/colorLight plus the `email` and `connectionId` the
one-cursor-per-person rule below is built on (re-stamped on every
presence_state, skipped when unchanged so identical identities don't broadcast);
`pointer` = live mouse
cursor (`PointerAwarenessState` — Figma-style cursors, coordinates in
surface-relative spaces, throttled ~20 msg/s; also carries an optional `click`
counter — bumped per primary-button press and shipped immediately, bypassing
the throttle — whose observed INCREASE renders an expanding click-ripple ring,
baselined at attach so history never pings); `pointerChat` = cursor-chat
message (`{ text } | null`, streamed live while typing, attached to the
pointer bubble — `/` opens it, Enter keeps it up a few seconds, Escape
discards); `vizTab` = which figure-editor panel tab the peer is on
(`{ scope, tab } | null`). New machinery must claim a NEW field, never reuse
these. The SAME field names ride the report session's awareness (report-code /
report-preview pointer surfaces); a figure editor open over either host uses
its host's awareness, scope-gated `fig:<figureId>`.
Cursor name tags fade after ~4 s of stillness (hover near a
cursor to reveal its name), idle cursors disappear after 30 s, and a cursor
leaving the surface vanishes for everyone; the report editor sets
`hideWhileTyping` so typing hides your pointer until the mouse moves.

**One cursor per person, enforced not assumed.** Awareness is keyed per
CONNECTION and a user legitimately holds several (second tab, a reconnect
overlapping the old socket's teardown, a dropped connection whose state has not
yet aged out of the ~30 s sweep), so the overlay gates on the `user` identity
three ways: states carrying MY OWN email never render (my other tabs are me,
not a peer), states whose `connectionId` is absent from the current
`presence_state` never render (`liveConnectionIds()` — the server deregisters a
closed socket and rebroadcasts presence within a round trip, an order of
magnitude faster than the awareness sweep; an ABSENT connectionId means
"unknown", never "dead"), and survivors collapse to one sprite per email with
the most recently MOVED connection winning (clientID breaks exact ties, so
every viewer picks the same one). Click ripples ride the same gates. The sender
side backs this up: `visibilitychange` to hidden, window `blur` (a tab stays
"visible" while another window or monitor has focus — the side-by-side case)
and `pointerleave` each clear the pointer outright, so an unfocused tab holds
no cursor at all; focus/visible re-broadcasts the resting position without
waiting for a mouse move.

**Awareness rides a doc room, so cursors exist only where one does.** Every
awareness instance belongs to a slide or report session and its updates travel
as that family's `awareness_update` / `report_awareness_update`, relayed by
the server without applying or persisting. Outside an editor — the Products
page, the Explore tab, every instance tab — there is no session, no awareness
and no cursor.

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
| User not allowed on the socket (not approved) | Server accepts then closes 4403; client stops retrying and shows NO banner (`"unauthorized"`); the rest of the app keeps working. Approval calls `reconnectForApproval` → `reconnectCollab`, which clears the latch. |
| Server restarts mid-edit                         | Room state restored from `crdt_state` on next subscribe — including un-checkpointed edits.                                                                                                     |
| Two users type in the same field                 | Character-level CRDT merge; both carets visible; per-user undo.                                                                                                                                |
| Two users restructure the layout concurrently    | Per-key LWW can duplicate a block; `materializeSlide` dedupes deterministically on every client and the next push deletes the shadowed copy — self-healing.                                    |
| AI edits a slide someone has open                | Refused with a named warning (busy guard).                                                                                                                                                     |
| Non-collab save while a room is live             | Routed through the room: merged, relayed live, checkpointed (no clobber in either direction).                                                                                                  |
| Deploy skew (old server / new client)            | `slide_sync` without `stateVector` is tolerated (catch-up skipped, sync still completes).                                                                                                      |

Known limits: carets render only in the side-panel editors, not on the canvas
itself (panther's canvas is non-DOM — the canvas shows the peer border
instead); a peer's body-text caret is visible only when you have the same
block selected; an empty optional title field has no rendered rect, so its
peer border appears only once text exists.

## Persistence & migrations

- Columns (all in `server/db/instance/_main_database.sql`, created by migration
  `079_products.sql`): `crdt_state` (base64 full Yjs state) +
  `crdt_state_last_updated` on `slides` and `reports`;
  `reports.body_authors` + `report_versions.body_authors`;
  `deck_versions.slide_editors`; the `report_versions` / `deck_versions`
  tables.
- **Staleness rule**: the CRDT state is only trusted when
  `crdt_state_last_updated === last_updated`. The checkpoint stamps them
  equal; any non-collab write bumps `last_updated` alone, invalidating the
  state so the next room open re-seeds from content. (With the
  `apply*ToLiveRoom` chokepoints, non-collab writes during a live room go
  through the room anyway.)
  **Which `last_updated` differs by family, and the asymmetry is real.** A
  REPORT compares against `products.last_updated` — the report IS the product,
  and the `reports` row carries no stamp of its own. A SLIDE compares against
  `slides.last_updated` — the slide is the collab document, and the deck's
  `products` stamp is bumped in the same transaction purely so the Products
  list re-renders. So a slide checkpoint writes two stamps to two tables and
  compares only its own; a report checkpoint writes one and compares that one.
  Both checkpoints additionally stamp the state untrusted (NULL) whenever the
  doc does NOT materialize to exactly the
  stored content (dropped schema-invalid transients, parse-stripped keys) —
  restoring such a doc would make every editor open adopt a state that
  disagrees with the row, visibly "flipping" the document ~1s after open
  (observed on a figure 2026-07-24). Trusted state therefore always
  materializes to the row content, by construction. The
  validate/normalize/trust policy lives in the per-type save closures in
  `server/routes/instance/collab.ts`; the db checkpoint functions are plain
  writes.
  Both closures ask that question through **`storedMatchesDoc`**
  ([crdt_util.ts](lib/collab/crdt_util.ts)), not a bare `canonicalJson`
  equality: `canonicalJson` is `JSON.stringify`-based, so it describes
  `JSON.parse(JSON.stringify(x))` rather than `x`. A doc holding a value JSON
  cannot represent (`NaN`/`±Infinity`, which item layout nodes admit via
  `style: z.record(z.string(), z.unknown())`) therefore compared EQUAL to the
  `null` Postgres would store and stamped the state trusted while doc and row
  disagreed — the same flip class, through a hole the check could not see.
  `storedMatchesDoc` additionally requires that the DOC survive the round trip,
  so such a state is stamped untrusted and the room re-seeds from content.
  The rendering is inert for every JSON-representable value, so version dedup
  hashes are unchanged (`hashVersionData` shares `canonicalJson`).
- **Model changes**: changing the doc schema breaks restore of old states —
  ship a migration that nulls `crdt_state`; rooms re-seed from content, which
  is always safe.
- Bundling constraint — exactly one yjs: Yjs breaks (`instanceof` failures,
  "Yjs was already imported") if two copies are bundled.
  [client/vite.config.ts](client/vite.config.ts) pins `resolve.dedupe` for
  `yjs`, `y-protocols`, `y-codemirror.next`, `lib0` (+ an alias for `yjs`);
  server (`deno.json`) and client pin the same exact yjs version. Sanity check
  after a build: `grep -c "Yjs was already imported"
  client/dist/assets/index-*.js` must be 1.

## AI integration

- [presence_guard.ts](client/src/components/copilot/ai_tools/validators/presence_guard.ts):
  `assertSlidesNotBusy(slideIds)` throws an `AIToolFailure` (surfaced to the
  AI, relayed to its user) when any _other_ peer has a target slide open.
  `otherPeers()` is instance-wide, so the guard works from the chat context
  wherever it is opened. Best-effort by design: if collab isn't connected,
  `otherPeers()` is empty and edits proceed. Called by every slide-mutating AI
  tool; `create_slide`/`move_slides`/`duplicate_slides` are exempt by design.
- AI `updateSlide` calls pass `expectedLastUpdated` from the slide they just
  read; the server's optimistic-concurrency check turns races into a clear
  retry error. When a live room exists the save merges through the room
  instead, where the CRDT is the conflict resolution.

---

## Collab (WebSocket) ⇄ SSE boundary

How this system sits on top of **S3 (Realtime Sync & Cache Invalidation)**
without replacing any of it.

**Principle: the WS layer is strictly additive.** It adds a fast, fine-grained
live layer _inside_ the instance SSE boundary; it owns no responsibility SSE
has. Delete every file in this system and save-then-refetch still works end to
end — you lose live co-editing, nothing else.

```text
                       ┌──────────────── instance boundary ───────────────┐
                       │                                                   │
  live co-editors ─────┤  S16 WS layer (additive)                          │
  in one document      │   • Yjs deltas relayed sub-second                 │
                       │   • presence / awareness, scoped to the product   │
                       │   • authoritative server Y.Doc per document       │
                       │        │ 1.5s debounced checkpoint                │
                       │        ▼                                          │
  everyone else on ────┤  S3 SSE layer (instance-wide)                     │
  the instance         │   • "row X changed → invalidate → refetch"        │
                       │   • notifyProductsUpserted / notifyLastUpdated    │
                       └───────────────────────────────────────────────────┘
       The WS checkpoint FEEDS the SSE bus. It never bypasses it.
```

### 1. Two write paths, one row discipline

- **The plain DB write functions and the checkpoints are separate functions on
  the same rows.** `updateReportBody`, `updateReportFigures`,
  `updateReportImages`, `updateSlide` write one column plus `last_updated`;
  `saveReportCheckpoint` / `saveSlideCheckpoint` write the superset plus the
  CRDT columns.
- **Each mutating REST route starts with a live-room check and falls through
  to the plain write.** See the `updateReportBody` route in
  [server/routes/products/reports.ts](server/routes/products/reports.ts): the
  room branch returns early, otherwise it runs `updateReportBody` +
  `notifyProductsUpserted`.
- **The CRDT columns are nullable and invisible to the plain read paths**, so
  a document that has never been co-edited behaves identically.

### 2. The flow

**No live room:** client edits → REST `PUT` → DB `UPDATE` (one column +
`last_updated`) → notify → SSE → other clients see the bump and refetch.
Last-write-wins, no live merge.

**Live room:**

1. Client edits go over the **WebSocket** as Yjs deltas → applied to the
   server's authoritative master Y.Doc (`applySlideUpdate` /
   `applyReportUpdate` in `slide_rooms.ts` / `report_rooms.ts`, invoked from
   `server/routes/instance/collab.ts`).
2. The master doc **relays** the delta to the other subscribers immediately —
   sub-second, no refetch.
3. A **1.5 s debounced checkpoint** materializes the doc and calls the
   checkpoint function → the same DB row, same `last_updated` discipline.
4. That checkpoint rings the **same SSE bell** so everything _outside_ the
   room — product cards, anyone not currently in the document — invalidates
   and refetches as usual.

**The chokepoint:** a REST save arriving _while a room is live_ must not write
the DB directly (the room's next checkpoint would clobber it). It is routed
**through** the room via `applyReportToLiveRoom` / `applySlideToLiveRoom`
(binding wrappers over `applyToLiveRoom` in
[server/collab/doc_rooms.ts](server/collab/doc_rooms.ts)) so the master doc
stays authoritative. Merging into the live doc _is_ the conflict resolution —
the report room path reports `conflicted: false`; the slide room path returns
just the fresh `lastUpdated` (that family's conflict signal is the CONFLICT
error, which the room path never produces).

### 3. Same notifies, same stamping

**SSE: identical wrappers.** Both the REST routes and the collab checkpoint
deps call the same S3 catalog entries — `notifyProductsUpserted(mainDb, ids)`
for the product row (a per-row `products_upserted`, so a keystroke checkpoint
on one deck never re-sends the instance's other cards; the summary's own
`lastUpdated` is what versions that product's detail cache) and, for slides
only, `notifyLastUpdated("slides", ids, lastUpdated)`. A report checkpoint
emits only `notifyProductsUpserted`: the report IS the product, so its summary
— preview included — is the whole notification. There is no debounced list
rebroadcast on top; per-row upserts are cheap enough to ride the 1.5 s
checkpoint cadence directly. A failed summary re-read after a committed write
is logged and swallowed — losing a broadcast costs one stale card, throwing
would turn a succeeded write into a failed request.

**Postgres: different function, same table, same stamping.** The plain path
uses the per-column `update*` functions; the collab path uses the checkpoint
functions (`saveReportCheckpoint`: one superset `UPDATE` writing body +
figures + images + `crdt_state` + `crdt_state_last_updated` + `body_authors`,
plus the product's `last_updated`; `saveSlideCheckpoint`: one transaction
updating the slide and bumping the deck's `products` row). What matters is
that **both stamp `last_updated = new Date().toISOString()` identically** —
that is what keeps S3's `last_updated → SSE → cache` triangle working the same
way regardless of which path wrote the row.

### 4. WebSocket vs the SSE boundary

The WS endpoint is a **sibling of the SSE endpoint at the same instance
boundary**, not a new boundary: same origin/Clerk/approved admission resolved
BEFORE the upgrade; **one WS connection per client**, registered by
`connectionId` and **multiplexing** individual documents via the
`*_subscribe`/`*_unsubscribe` families — exactly parallel to the one-SSE-per-
client model. Presence broadcasts per product; SSE broadcasts per instance.

Hold it as two layers inside one boundary: **SSE (S3) = the invalidation bus**
(instance-wide) — authoritative for keeping every surface consistent; **WS
(S16) = the live collaboration layer** (per-document, only while subscribed) —
Yjs deltas, presence, awareness, none of it persisted through SSE. They are
not alternatives — **the WS layer feeds the SSE layer.** For two users in the
same live room the WS relay outruns the SSE-driven refetch, so for that pair
the notify is effectively redundant — but it still fires, and it is still what
informs everyone _outside_ the room.

---

## Version history

Google-Docs-style version history for reports and slide decks: a browsable
list of versions at timestamps showing which users edited in each window, with
preview, compare (reports), restore, and restore-as-copy. Versions are **whole
documents** — a full report (body + figure/image registries) or a full deck
(deck config + every slide) — one per _editing session_, not per keystroke or
per CRDT operation.

### Storage

Two tables in `main` (`server/db/instance/_main_database.sql`):
`report_versions` and `deck_versions`. Each row is a full content snapshot —
report: `label, body, figures, images`; deck: `label, deck_config, slides`
(JSON `[{id, sortOrder, config}]` — original slide ids are kept so restore
preserves identity) — plus `editors` (JSON `[{email, name}]` — everyone who
edited in the session window), `content_hash`, `created_at`, and nullable
`restored_from_version_id` (set only by the restore routes).

- **Label is snapshotted explicitly** in both tables: the label lives on the
  `products` row and `updateProductLabel` writes only that column, so neither
  detail row nor deck config is label-authoritative. **Not versioned**: report
  `config` (display prefs), deck `plan` (AI planning text), and the product's
  package/scope pair — none of them document content.
- **Dedup**: `content_hash` = md5 of `canonicalJson` of the snapshot data
  (`canonicalJson` in [crdt_util.ts](lib/collab/crdt_util.ts) kills key-order
  nondeterminism across write paths). A session whose end state hashes equal
  to the _newest_ stored version writes nothing. (`body_authors` /
  `slide_editors` are NOT part of the hash — dedup is about content, not
  attribution.)
- **Retention**: newest 100 per document, pruned in the writer after each
  insert ([server/db/products/versions.ts](server/db/products/versions.ts));
  `ON DELETE CASCADE` removes versions with their parent document — and since
  the detail rows themselves cascade from `products`, deleting a product takes
  its versions with it.
- **Ordering**: every version query (list, lineage, latest-hash, prune) orders
  by `(created_at, id)` — same tiebreak everywhere, so list order and lineage
  "newer than" can never disagree. Restore writes two versions back-to-back;
  the restored-state insert stamps `created_at` strictly after the safety
  version's (`isoStrictlyAfter`), so the pair can't tie.
- **Schema drift**: snapshots are stored _verbatim_ (no zod re-parse on
  insert — a schema change must never fail the version write). Validation
  happens on the way OUT: every path that reads a snapshot first runs the
  shared figure-block transforms (`upgradeSnapshotFigures` /
  `upgradeSnapshotSlideConfig` → `transformFigureBlock`, the same upgrade the
  boot sweeps apply to live rows — walking a slide's layout tree to reach
  every `item` node's figure), THEN parses with the _current_ schemas
  (`reportFiguresSchema`/`reportImagesSchema`; `slideDeckConfigSchema` +
  per-slide `slideConfigSchema`). The transform is not optional: Zod strip
  mode DELETES an unknown key instead of normalizing it, so a parse alone
  would silently drop a renamed setting out of an old snapshot.
  What the transforms deliberately do NOT do is supply a missing
  `bundle.scope` or `bundle.provenance.runId`. Both are required in
  `figureBundleSchema` because a figure that cannot say which (package, scope)
  pair it was resolved under cannot be judged stale; migration `080` stamped
  them into every live and snapshot figure block, so a missing key is a
  fail-loud parse error, never something to default. A snapshot the current
  schemas reject fails fast with a clear error and zero side effects — it is
  never applied to a live room, whose checkpoints would otherwise fail
  forever.
- **`sizeBytes`** is true stored bytes: `octet_length()` in the list SQL and a
  `TextEncoder` count in the detail path, so the two always agree.

### Capture — editing sessions

[version_tracker.ts](server/collab/version_tracker.ts) is a pure factory
(`createVersionTracker(deps, opts)`) with injected clock and storage. It keeps
one in-memory accumulator keyed `<kind>::<docId>` holding the
contributor set and timing. A session flushes to ONE version when any of:
document idle 10 min, session length 45 min (long sessions split), or collab
room emptied and quiet for 2 min. A 30 s sweeper drives flushes
([version_capture.ts](server/collab/version_capture.ts)
`startVersionSweeper()`, started in main.ts). Flush = detach accumulator →
load current content → hash-dedup vs newest version → insert + prune. The
loaders flush any LIVE room first (report room / every open slide room, then
re-read) — a room can be up to 1.5 s ahead of the DB, and snapshotting the
stale row would both date the version and fail the ledger-vs-text validation
below. A flush that reports NOT-settled (`flushRoomForDoc` → false: that room's
checkpoint is failing) THROWS for the same reason a failed read does — the row
is stale, and versioning it anyway would freeze pre-tail content and then
usually hash-dedup to nothing, silently ending the document's version history
for as long as its room stays wedged. The load contract is strict: **null means
the document ROW IS GONE** (session dropped); the loaders map only
not-found to null and THROW on
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
- **Direct route writes**: `recordVersionEdit(kind, docId, editor)` after
  success, identity from `c.var.globalUser`. Slides:
  create/delete/duplicate/move/copy + the updateSlide fallback (the DB fn
  returns `deckId` for attribution); decks: config; reports:
  body/figures/images fallbacks; and the cross-type label route in
  `server/routes/products/products.ts`, which dispatches on the product's type
  to record against the right kind.
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

**Every ledger and accumulator is keyed by document id alone** — no project in
any key. `authorship.ts` uses `report::<reportId>` for report bodies and
`slideel::<slideId>::<elementKey>` for slide text elements;
`deck_session_ledger.ts` uses `deck::<deckId>` with `slide::<slideId>`
inside; `version_tracker.ts` accumulates on `<kind>::<docId>`; rooms on
`<docType>::<docId>`. Since slide-level keys carry only the slide id, a room's
teardown must drop its ledgers and pending touches or they would drain into
whichever later session first records a reused id.

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

Registry entries in [lib/api-routes/products/reports.ts](lib/api-routes/products/reports.ts)
and [slide-decks.ts](lib/api-routes/products/slide-decks.ts); handlers in the
matching S12 route files. Every one of them — list, get, lineage, restore,
copy — is guarded by `requireApprovedUser()` alone: the path id is the
authority and an approved user is a full editor. List summaries compute
sizes/counts in SQL and never ship snapshot content.

**Restore sequencing** (both kinds): ⓪ validate the snapshot's content fields
with current schemas (fail fast, zero side effects), flush the document's live
room(s) (`flushRoomForDoc`) — a flush that reports NOT-settled ABORTS the
restore, because the safety version would be written from a stale row and so
would not actually be the rollback point the confirm dialog promises — and
drain the document's open tracker session (`drainVersionEditors`)
→ ① write a **safety version** of the current state
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
  follow the restore live in their open editors); the label lives on the
  `products` row rather than in the room doc, so `updateProductLabel` restores
  it separately — a failed label write fails the request and skips the
  restored-state version (partial restore is reported, never masked). No room ⇒
  `restoreReportContent` — one transaction writing body/figures/images on
  `reports` and bumping `products.last_updated`, which auto-invalidates the
  stored `crdt_state` (that stamp is what the report's staleness rule reads).
- **Deck**: `planDeckRestore(currentIds, snapshotSlides)` (pure) partitions
  into `toDelete` / `toInsert` / `toUpdate`; then `remapCollidingSlideIds`
  replaces any `toInsert` id that a slide in ANOTHER deck now holds (short
  nanoids are only unique against live rows — re-inserting verbatim would abort on
  the PK forever). Rooms for the final `toDelete ∪ toInsert` ids are discarded
  via `closeSlideRoom` (a stale room would fail checkpoints forever on a
  deleted row, or clobber a re-created one; remapping first means another
  deck's live room is never touched). Then ONE transaction
  (`restoreDeckStructure`): delete rows, re-insert with snapshot ids +
  snapshot order, restore every survivor's sort_order, the deck's `config` on
  `slide_decks` and its `label` + `last_updated` on `products`, `reSequence`.
  Then each `toUpdate` slide's config applies through
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
brand-new PRODUCT from the snapshot — a fresh `products` row that inherits the
source's `run_id` and `admin_area_2` (`INSERT … SELECT` off the original, so
the copy lands on the same package and scope), plus its detail rows. Decks get
FRESH slide ids, deduped against live rows AND within the batch itself, since
the originals may still exist. Zero-risk path; no room interaction. Deck copy
validates every config first and inserts product + deck + slides in ONE
transaction.

**Room hygiene on delete**: the delete routes discard live rooms via the
binding wrappers `closeSlideRoom` / `closeReportRoom` (over
`closeRoomsForDoc`) — without them a deleted row would leave zombie rooms
retrying failed checkpoints forever, and clobber any future row re-created
with the same short id. The batch `deleteProducts` route
(`server/routes/products/products.ts`) is the whole-product path: it reads the
summaries FIRST (to learn which ids are reports) and aborts the delete if that
read fails, then deletes, then closes a room for every slide the transaction
actually removed (`deletedSlideIds`, pre-read inside the transaction and
returned solely for this) and for every deleted report. `deleteSlides` — the
per-slide route — closes rooms and
records `removed` attribution only for the ids the DB ACTUALLY deleted
(`RETURNING id` — the delete is deck-scoped, and a requested short id that
now belongs to another deck must not have that deck's live room discarded or a
false "removed by" recorded). `closeSlideRoom` also drops the slide's element
ledgers AND its pending element touches — both are keyed by slide id alone,
so left behind they would drain into whichever later session first records a
reused id.

### UI

[client/src/components/version_history/](client/src/components/version_history/)
— `VersionHistoryEditor`, a full-panel editor: day-grouped version list on the
left (pinned "Current version" row, contributor chips via `PresenceAvatars` +
`presenceColorForKey(email)`, names resolved by `editorDisplayName`
(`diff_segments.tsx`) against the live `instanceState.users` roster in
preference to the capture-time name — people get renamed, emails don't, and a
product's editors always come from that one roster — "Restored"
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

Footer (gated on `canEditProducts()`): **Restore** (confirm explains the
safety version) and **Restore as copy** (name prompt). Both editors open it as
a full-panel overlay: the History button in the report editor's heading bar,
and "Version history" in the deck overview's overflow menu.

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

- **Roll-up toggles merge at whole-array granularity in figure co-editing**
  (2026-07-28, from the facility roll-up adversarial review). The roll-up flag
  moved from d-level scalars into `disaggregateBy` entries, and the CRDT
  bridge (`lib/collab/figure_config_crdt.ts`) treats `disaggregateBy` as
  whole-array LWW — so a roll-up toggle can clobber (or be clobbered by) a
  concurrent peer's edit to another dimension's display slot, where the old
  d-scalar merged independently. Accepted for now (same class as any two
  concurrent disaggregation edits); fix shape if taken up: per-entry keyed
  merge for `disaggregateBy`.
- **Canonical roll-up form holds only on the explicit save path** (2026-08-03).
  `normalizePOConfigForStorage` strips `rollup`/`rollupPosition` from every
  non-gate-selected `disaggregateBy` entry, but the host checkpoint applies
  only `dropStorageInvalidTransients`, so collab-saved rows persist latent
  flags on gated-off entries. Accepted deliberately — both repair options are
  worse:
  an effective-gate strip at checkpoint needs `RollupEligibilityInputs` loaded
  server-side, where a stale/weaker `hasFacilityLevelRows` would strip an
  _active_ AVG-over-facility-rows flag (silently turning roll-up off); a
  config-shape-only strip (`getRollupDimension`) diverges the stored row from
  the live doc for the whole session whenever a latent flag exists, making
  `trusted` false on every checkpoint and forcing a re-seed on every open.
  Consequences are benign: a latent flag can resurrect roll-up across sessions
  when a later edit reopens the gate (extends the in-session keep-the-flag
  design), and two latently flagged entries that both become candidates make
  `getRollupDimension` return `undefined` (roll-up silently off, display
  gates inert — contrived edit sequence, no bad data). The schema comment on
  `rollup` in `_metric_installed.ts` points here. Revisit if per-entry keyed
  merge for `disaggregateBy` (previous item) is taken up.
- ~~**No heartbeat/ping-pong or idle-connection reaper on the collab WS**~~
  RESOLVED — both halves of dead-peer detection now exist and are described
  under Transport: the server side is Deno's protocol ping with `idleTimeout:
  30` pinned explicitly at the upgrade call
  (`server/routes/instance/collab.ts`), which fires
  the same `onClose` that runs `removeConnection`/`handleConnGone`; the client
  side is the app-level ping/pong watchdog in collab.ts (25 s ping, 10 s
  no-traffic deadline, then force-close into the normal reconnect path). The
  ON-HOLD note contradicted the Transport section of this same file and the
  code; retired 2026-07-27.
- ~~**Unguarded per-send broadcasts in `doc_rooms.ts`**~~ Mostly resolved, and
  the escalation it described is not reachable. The update fan-out, the
  awareness relay and `subscribeDoc`'s two sync sends all carry the per-send
  try/catch now, so a throwing peer can no longer unwind into
  `applyDocUpdate`'s catch — a valid update is still applied, attributed, and
  marked dirty (verified by executing the described interleaving). Separately,
  a server-side `WebSocket.send()` in Deno does not throw on a dead peer at
  all: the only mandated throw is `readyState === CONNECTING`, unreachable
  after the upgrade (verified empirically).
  The last two unguarded loops (`broadcastSaveState`, the error loop in
  `closeRoomsForDoc`) were closed 2026-07-27 for symmetry: a throw in the
  former aborted `noteSaveFailure` before it armed the `CHECKPOINT_RETRY_MS`
  timer (dirty room, no retry, no log line until the last client left), and one
  in the latter would have skipped `rooms.delete` / `doc.destroy()` /
  `onDocClosed` and leaked a zombie room.
- **The embedded-figure wedge guard rests on client-side widgets, not on
  the server.** `dropStorageInvalidTransients` covers the three states the
  editor is known to produce (all-values-unticked filter chip, emptied
  `valuesFilter`, and any `periodFilter` that `periodFilterSchema` rejects —
  the drop delegates to `safeParse`, so the whole filter incl. `nMonths`/
  `nYears`/`nQuarters` `.min(1)` and `NaN` bounds is schema-covered and cannot
  drift). But the WS ingress validates nothing, so a _crafted_ update can
  still wedge a checkpoint on a constraint outside those three fields — e.g.
  `NaN` in any other `z.number()` field (`t` rel font sizes). Those are not
  reachable through the current UI. Treat "every constraint reachable from a
  live doc belongs in that function" as a rule about the editor's _current_
  widgets — adding a free-text numeric input to the figure editor re-opens the
  class.
- **`lib/normalize_po_config.ts` is load-bearing for this system's checkpoints
  but is not in the `globs:` manifest above** (it is S11's). Changes to
  `dropStorageInvalidTransients*` are S16 changes in everything but the lint.
- **`showEditingPulse` on `PresenceAvatars` is dead UI.** The server still
  stamps `isEditing` and it still suppresses idle dimming, but no surface
  passes the prop, so the pulsing "editing now" badge never renders. Wire it
  into the editor headers or drop the prop and the badge markup.

- **[URGENT] Report registry edits are outside undo entirely, and collab is why.**
  Absorbed from PLAN_REPORT_UNDO_REDO.md, deleted 2026-07-26 — its design was
  written 2026-07-02, before the collab merge landed on 2026-07-21, and that
  design no longer works. Recorded here rather than re-planned because the fix
  belongs to this system.

  **The state.** A report's body text is undoable; its figure and image
  registries are not. `setFigures`/`setImages` + `persistFigures`/`persistImages`
  in [report/index.tsx](client/src/components/report/index.tsx) bypass history
  completely, so registry-only edits — the AI's `update_report_figure`, sidebar
  Edit/Switch, an image-file change — cannot be reversed by the user at all.
  (`handleDelete` is already token-only, so undoing a _delete_ does restore a
  working embed; it is the other writes that are stranded.)

  **Why the obvious fix is dead.** The retired plan routed registry writes into
  CodeMirror transactions as `StateEffect`s and let `invertedEffects` +
  CM's own history undo "doc change + registry change" atomically. That only
  works where CM history is the authority, and it isn't:
  [report_editor.tsx](client/src/components/report/report_editor.tsx)
  installs `yUndoManagerKeymap` ahead of `basicSetup` precisely because
  yCollab's per-user undo takes precedence, and installs `yCollab` a few lines
  later. `collabReady` latches at the first `report_sync`, so the editor
  upgrades from plain to collab shortly after mount and **Y.UndoManager, not CM
  history, owns undo in the steady state.** Building the `invertedEffects`
  version would produce a registry undo that is live only in the brief pre-sync
  window or when the socket is down — and would split behaviour confusingly:
  Ctrl+Z undoing body text via Yjs while toolbar buttons drove an inert CM
  stack.

  **The shape of a real fix.** Put the figure/image registries into the room's
  Y.Doc (Y.Maps) and construct the undo manager over all three shared types —
  `new Y.UndoManager([yText, yFigures, yImages])` — so one per-user undo stack
  covers body and registry atomically, which is what the original plan actually
  wanted. That means moving the registries off Solid-signals-plus-REST-autosave
  onto the shared doc, extending the room checkpoint to carry them, and
  migrating existing checkpoints. It is a real piece of S16 design work, not a
  drop-in, which is why it is an open item and not a plan.

  Whatever lands must also cover the AI `undo`/`redo` tools the retired plan
  specced (mode-guarded, calling into the editor API) — a reversal path for the
  no-modal `update_report_figure` was the plan's original motivation.
