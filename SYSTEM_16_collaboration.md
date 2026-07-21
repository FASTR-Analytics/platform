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
  - server/task_management/presence_registry.ts
docs_absorbed:
  - DOC_SLIDE_COLLAB
  - DOC_SLIDE_COLLAB_FEATURES
  - DOC_VERSION_HISTORY
---
# S16 — Realtime Collaboration & Version History

> **Manifest live; prose partial.** The `globs:` above are lint-enforced. The
> `docs_absorbed` files (`DOC_SLIDE_COLLAB`, `DOC_SLIDE_COLLAB_FEATURES`,
> `DOC_VERSION_HISTORY`) hold the full transport / CRDT / capture / attribution
> detail and are still standalone — they are inlined and deleted in this
> system's Phase-2 review cycle (PLAN_DOC_CONSOLIDATION §2). The **§ Collab
> (WebSocket) ⇄ SSE boundary** section below was authored directly here (it has
> no predecessor DOC).

_Google-Docs-style real-time co-editing for slide decks and reports — WebSocket
transport, server-authoritative Yjs rooms, presence — plus the version-history
layer built on top: editing-session capture, per-character / per-slide / per-
element attribution, and restore._

## Scope

See the `globs:` frontmatter (the lint-enforced manifest) and the S16 entry in
[SYSTEMS.md](SYSTEMS.md) "System details". In one breath:

- **Transport & rooms** — `server/routes/project/project-collab.ts` (the one WS
  endpoint per project), `server/collab/doc_rooms.ts` (the generic
  master-copy room core: seed, relay, debounced checkpoint, chokepoint),
  `report_rooms.ts` / `slide_rooms.ts` (the per-document-type adapters),
  `server/task_management/presence_registry.ts`.
- **CRDT model** — `lib/collab/{crdt_util,report_crdt,slide_crdt}.ts`,
  `lib/types/collab.ts` (the WS message protocol), client
  `state/project/collab.ts` (one WS manager per project).
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
  Shared-custody: the visualization editor UI (S11) and the PO query/routes
  (S9/S11) host this collab code; S16 owns the CRDT + room + protocol pieces.
- **Version history** — `server/collab/{version_tracker,version_capture}.ts`,
  the attribution ledgers `authorship.ts` (per-character report bodies, with
  tombstones) + `deck_session_ledger.ts` (per-slide / per-element decks),
  `server/db/project/versions.ts`, `lib/types/versions.ts`, and the client
  `components/version_history/**` (diff, compare, previews, restore modals).

## Contract

- **Master copy is authoritative.** Each open document has one server Y.Doc;
  browsers sync over WS; it debounce-checkpoints (~1.5s) to the normal DB row.
  Every programmatic write (REST save while a room is live, restore) goes
  **through** the room via `applyToLiveRoom` so the master copy is never
  bypassed.
- **Rides two neighbouring systems, replaces neither.** Checkpoints persist by
  calling **S12**'s document tables (`saveReportCheckpoint` /
  `saveSlideCheckpoint` in `server/db/project/{reports,slides,slide_decks}.ts`,
  onto additive `crdt_state` / `body_authors` / `slide_editors` columns) and
  then ring **S3**'s notify hub (`notifyLastUpdated`). See the boundary section
  below — this is the load-bearing integration contract.
- **Attribution is honest.** Exact per-character / per-slide / per-element
  "who" only accrues for edits made through live collab rooms after deploy;
  everything else falls back to session-level "one of: …" wording. Ledgers
  self-poison rather than show wrong names.
- **Version capture is session-based** (10min idle / 45min max / 2min
  room-empty), hash-deduped, retained newest-100-per-document, restore writes a
  safety version first.

---

## Collab (WebSocket) ⇄ SSE boundary

How this system sits on top of **S3 (Realtime Sync & Cache Invalidation)**
without replacing any of it. The question it answers: "did adding live
co-editing change how saves and refetches worked before?" — answer: no, it
extended them.

**Principle: WebSockets are strictly additive.** They add a fast, fine-grained
live layer *inside* the existing per-project SSE boundary; they do not take over
any responsibility SSE already had. Delete all of this system's code and the
original save-then-refetch flow still works end to end — you would only lose
live co-editing and fall back to save-then-refetch.

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

### 1. Is the old system still untouched?

**Effectively yes — it was extended, not replaced.**

- **The classic DB write functions are unchanged.** `updateReportBody`,
  `updateReportFigures`, `updateReportImages` (in
  [server/db/project/reports.ts](server/db/project/reports.ts), S12),
  `updateSlide`, etc. still exist and still do exactly what they did (one column
  + `last_updated`). The collab checkpoint is a **new, separate** function,
  `saveReportCheckpoint`, sitting alongside them — it does not modify or wrap
  them.
- **The REST routes got a branch prepended; the original path is the
  fall-through.** Each mutating route now starts with a live-room check; if no
  room is live it runs the original code unchanged. See the `updateReportBody`
  route in
  [server/routes/project/reports.ts](server/routes/project/reports.ts) — the
  room branch returns early, otherwise it falls through to the same
  `updateReportBody` + `notifyLastUpdated` it always did.
- **The schema change is purely additive.** The `reports` table gained
  `crdt_state`, `crdt_state_last_updated`, and `body_authors` (and decks/slides
  the analogous columns) — all nullable, all ignored by the old read paths. Old
  rows and non-collab reads behave identically.

So a report or deck edited by a single user through the normal REST UI, with no
collab room open, flows exactly as it did before this work.

### 2. How the flow changes

**Old flow (still the fallback):** client edits → REST `PUT` → DB `UPDATE`
(one column + `last_updated`) → `notifyLastUpdated` → SSE → other clients see the
`last_updated` bump and refetch. Last-write-wins, no live merge.

**New flow (when a collab room is live):**

1. Client edits go over the **WebSocket** as Yjs deltas → applied to the
   server's authoritative master Y.Doc (`applyReportUpdate` / `applySlideUpdate`
   in
   [server/routes/project/project-collab.ts](server/routes/project/project-collab.ts)).
2. The master doc **relays** the delta to the other subscribers immediately
   (sub-second, no refetch — this is the genuinely new capability).
3. A **1.5 s debounced checkpoint** materializes the doc and calls
   `saveReportCheckpoint` / `saveSlideCheckpoint` → the same DB row, same
   `last_updated` discipline.
4. That checkpoint then rings the **same SSE bell** (`notifyLastUpdated`) so
   everything *outside* the room — the report list cards, project members not
   currently in the document — invalidates and refetches as before.

**The crucial glue (the "chokepoint"):** when a REST save arrives *while a room
is live*, it does not write the DB directly (that would clobber the master copy
on its next checkpoint). It is routed **through** the room via
`applyReportToLiveRoom` / `applyToLiveRoom` (in
[server/collab/doc_rooms.ts](server/collab/doc_rooms.ts)) so the master doc stays
authoritative. Merging into the live doc *is* the conflict resolution, so the
room path reports `conflicted: false`.

### 3. Same functions for the Postgres save and the SSE?

**SSE: identical.** Both the REST routes and the collab checkpoint call the same
`notifyLastUpdated(projectId, resource, [ids], lastUpdated)` from S3's notify
catalog ([server/task_management/mod.ts](server/task_management/mod.ts)). The
collab side adds exactly **one** extra notify — the debounced reports-list
rebroadcast (`notifyProjectReportsUpdated`,
[server/task_management/notify_project_v2.ts](server/task_management/notify_project_v2.ts))
— because card previews derive from the body and that payload is too heavy to
fire on the 1.5 s cadence. Same SSE mechanism, just throttled per project.

**Postgres: different function, same table, same stamping.** The classic path
uses the per-column `updateReport*` functions; the collab path uses
`saveReportCheckpoint`, which writes `body` + `figures` + `images` +
`crdt_state` + `crdt_state_last_updated` + `body_authors` in a single `UPDATE`
(a superset write). What matters is that **both stamp
`last_updated = new Date().toISOString()` identically** — that is precisely what
keeps S3's `last_updated → SSE → cache` triangle working the same way regardless
of which path wrote the row.

| Concern            | Classic REST path (S12)      | Collab checkpoint path (S16)              |
| ------------------ | ---------------------------- | ----------------------------------------- |
| Postgres write     | `updateReportBody` etc.      | `saveReportCheckpoint` (superset `UPDATE`) |
| Columns touched    | one content column           | body + figures + images + crdt_state + body_authors |
| `last_updated`     | `new Date().toISOString()`   | `new Date().toISOString()` (same)         |
| SSE notify         | `notifyLastUpdated`          | `notifyLastUpdated` (same) + throttled list rebroadcast |

### 4. WebSocket vs the SSE project boundary

The WS endpoint is a **sibling of the SSE endpoint at the same project
boundary**, not a new boundary:

- **Same scoping and auth.** Keyed by `:project_id`, and the code explicitly
  notes it "mirrors the SSE endpoint (project-sse-v2.ts) — we resolve the same
  project-access gate BEFORE" upgrading
  ([server/routes/project/project-collab.ts](server/routes/project/project-collab.ts)),
  using the same `resolveProjectUserAccess`.
- **One WS connection per client per project**, registered at project level
  (`addConnection(projectId, connectionId, …)`) and **multiplexing** individual
  documents via `slide_subscribe` / `slide_unsubscribe` (and the report
  equivalents) — exactly parallel to the one-SSE-per-project model. Presence is
  broadcast per project (`broadcastPresence(projectId)`).

Hold it as **two layers inside the same project boundary**:

- **SSE (S3) = the invalidation bus** (unchanged, project-wide): "row X changed,
  refetch." Authoritative for keeping every surface in the project consistent.
- **WS (S16) = the live collaboration layer** (per-document, only while
  subscribed): Yjs deltas, presence, awareness — none of it persisted through
  SSE.

They are not alternatives — **the WS layer feeds the SSE layer.** Every collab
checkpoint materializes to the same DB row and then rings the same SSE bell, so
a live co-edit still propagates to non-collab surfaces through the exact
pre-existing triangle.

### 5. The one nuance

For **two users in the same live room at the same time**, they see each other's
edits via the WS relay *before* the SSE-driven refetch would arrive. So for that
specific pair the SSE notify becomes effectively redundant — but **it still
fires**, and it is still what informs everyone *outside* the room. WS did not
take that responsibility from SSE; it just gets the change to co-editors faster.

Verified on the collab branch: **zero** `notify*` calls were removed from the
pre-existing S12 report/slide/deck routes — the collab path only *adds* notify
calls on top of the ones that were already there.

---

## Docs absorbed (Phase 2)

- [DOC_SLIDE_COLLAB](DOC_SLIDE_COLLAB.md) — WS transport, presence, Yjs CRDT
  model, server rooms/checkpoints, editor bridge.
- [DOC_SLIDE_COLLAB_FEATURES](DOC_SLIDE_COLLAB_FEATURES.md) — user-facing
  feature catalog.
- [DOC_VERSION_HISTORY](DOC_VERSION_HISTORY.md) — editing-session capture +
  attribution, hash-dedup/retention, restore sequencing, room-discard rules.

## Open items

- **Phase-2 prose port.** Inline the three `docs_absorbed` files here and delete
  them, verifying each against code (SYSTEMS.md §5 review cycle).
- **Custody seam with S12.** `server/db/project/{reports,slides,slide_decks}.ts`
  are S12-owned but carry the collab checkpoint functions
  (`saveReportCheckpoint`, `getReportBodyAuthors`, the `crdt_state` /
  `body_authors` / `slide_editors` logic) — S16 is a mandatory reader of those.
  Recorded in SYSTEMS.md §4.1.
