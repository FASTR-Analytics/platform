# Version history (reports + slide decks)

Google-Docs-style version history: a browsable list of versions at timestamps
showing which users edited in each window, with preview, compare (reports),
restore, and restore-as-copy. Versions are **whole documents** — a full report
(body + figure/image registries) or a full deck (deck config + every slide) —
one per *editing session*, not per keystroke or per CRDT operation.

Related: [DOC_SLIDE_COLLAB.md](DOC_SLIDE_COLLAB.md) (the live co-editing
system this feature captures from).

## 1. Storage

Two project-DB tables (migration `032_report_deck_versions.sql`, mirrored in
`_project_database.sql`): `report_versions` and `deck_versions`. Each row is a
full content snapshot:

- report: `label, body, figures, images`
- deck: `label, deck_config, slides` (JSON `[{id, sortOrder, config}]` —
  original slide ids are kept so restore preserves identity)

plus `editors` (JSON `[{email, name}]` — everyone who edited in the session
window), `content_hash`, `created_at`, and nullable
`restored_from_version_id` (set on versions created by a restore).

- **Label is snapshotted explicitly** in both tables: `updateSlideDeckLabel`
  writes only the label column (not `config.label`), so the deck config alone
  is not label-authoritative.
- **Not versioned (v1)**: report `config` (display prefs) and deck `plan`
  (AI planning text) — they aren't document content.
- **Dedup**: `content_hash` = md5 of `canonicalJson` of the snapshot data
  ([lib/collab/crdt_util.ts](lib/collab/crdt_util.ts) `canonicalJson` kills
  key-order nondeterminism across write paths). A session whose end state
  hashes equal to the *newest* stored version writes nothing.
- **Retention**: newest 100 per document, pruned in the writer after each
  insert ([server/db/project/versions.ts](server/db/project/versions.ts)).
  `ON DELETE CASCADE` removes versions with their parent document.
- **Schema drift caveat**: snapshots are stored *verbatim* (no zod re-parse on
  insert — a schema change must never fail the version write). Migration
  transform blocks do NOT sweep the version tables; instead, restore/copy
  validate the whole snapshot with the *current* schemas BEFORE touching
  anything (normalizing old snapshots the same way old live rows are
  normalized). A snapshot the current schemas reject fails fast with a clear
  error and zero side effects — it is never applied to a live room, whose
  checkpoints would otherwise fail forever.
- **`sizeBytes`** is true stored bytes: `octet_length()` in the list SQL and a
  `TextEncoder` count in the detail path, so the two always agree.

## 2. Capture — editing sessions

[server/collab/version_tracker.ts](server/collab/version_tracker.ts) is a pure
factory (`createVersionTracker(deps, opts)`) with injected clock and storage —
harness-testable with a fake clock. It keeps one in-memory accumulator per
`(projectId, kind, docId)` holding the contributor set and timing. A session
flushes to ONE version when any of:

| Trigger | Default |
|---|---|
| Document idle (no recorded edit) | 10 min |
| Session length cap (long sessions split) | 45 min |
| Collab room emptied and stayed quiet | 2 min grace |

A 30s sweeper drives flushes
([server/collab/version_capture.ts](server/collab/version_capture.ts)
`startVersionSweeper()`, started in main.ts). Flush = detach accumulator →
load current content → hash-dedup vs newest version → insert + prune. The
load contract is strict: **null means the document ROW IS GONE** (session
dropped); the live loaders map only the not-found errors to null and THROW on
anything else (connection blip, pool exhaustion, corrupt row), which — like a
failed insert — merges the accumulator back and retries next sweep. Graceful
shutdown calls `flushAllVersions()` **before** the DB pools close; a hard
crash loses at most one session window's attribution (accepted).

**Capture points** (all writes are covered — every non-collab write goes
through the HTTP routes, including client-side AI tools):

- **Collab edits**: `RoomConn.identity` ({email, name}, stamped by the WS
  route) → `DocRoomDeps.onEdit(editor)` fires in `applyDocUpdate`;
  `onEmpty()` fires when the room finalizes. Slide rooms record against the
  **deck** id (whole-deck versions) via the deps closure's captured `deckId`.
- **Room-routed HTTP writes** (AI accepts, fallback saves):
  `applySlideToLiveRoom` / `applyReportToLiveRoom` take an optional `editor`
  param → same `onEdit` hook.
- **Direct route writes**: `recordVersionEdit(projectId, kind, docId, editor)`
  after success, identity from `c.var.globalUser`
  (`editorFromGlobalUser`). Slides: create/delete/duplicate/move + updateSlide
  fallback (the DB fn returns `deckId` for attribution); decks: config +
  label; reports: body/figures/images fallbacks + label.
- **Restore routes do NOT record** — they write versions explicitly (below).

## 2b. Per-character authorship (reports)

Session-level attribution can't say WHO typed a specific word when two people
share a session. [server/collab/authorship.ts](server/collab/authorship.ts)
closes that gap for insertions: while a report room is live, a Y.Text observer
(exact retain/insert/delete deltas — no diffing) maintains a run-length
author-per-character ledger in lockstep with the body. WHO comes from the
transaction origin: the RoomConn's identity for collab edits, the
`versionEditor` origin tag `applyToLiveRoom` sets for HTTP-routed writes,
nothing for restores (⇒ unknown). Checkpoints persist the ledger in
`reports.body_authors` under the same validity stamp as `crdt_state`;
version snapshots freeze it in `report_versions.body_authors` (migration 033;
NOT part of the content hash — dedup is about content, not attribution).

**Deletions leave TOMBSTONES**: a deleted range's runs stay in the ledger with
`deletedBy` set (keeping the original writer in `email`) AND the deleted
`text` itself, anchored exactly where the text vanished — live runs
concatenated still equal the body, so the alignment invariant counts live
characters only (the ledger mirrors the body string to slice deletions out of
and as a hard integrity check at persist time). Inserts land AFTER tombstones
at the same anchor. The client attributes removals by building the step's
**ghost document** (body + tombstone texts spliced back in) and diffing the
previous version against it — each removed character lands on the tombstone
that swallowed it, which survives word-aligned hunk boundaries, unrelated
typed-then-deleted ghosts at the same spot, and several deleters inside one
hunk (a boundary character shared by two adjacent deletions can align to
either — inherent diff ambiguity, ≤1 char). Tombstones live for ONE version
window: `compactTombstones` drops them right after a version snapshots them
(called in `writeVersion` and after a restore's version inserts), so a
version's tombstones are precisely "deletions since the previous version". A
defensive cap (~2000 tombstone runs) bounds churn-heavy sessions.

The diff views split each inserted range by the step's ledger, so hover reads
"Added by Alice A" (exact) instead of the whole editor set, and split each
REMOVED range by the step's tombstones, so struck-through spans name the exact
deleter too — including several spans with different deleters inside one hunk.
Each change is tinted with its author's presence color
(`presenceColorForKey(email)` + the editors' translucent `"33"` convention;
neutral gray when the author is unknown), removals additionally struck
through, and hovering shows a caret-style name flag — the same label the
collab editors render above remote carets (y-codemirror's
`.cm-ySelectionInfo` look), not a browser tooltip.
Characters the ledger can't attribute — pre-feature text, non-collab edits,
restores, a stale-crdt_state re-seed, delete-then-retype mismatches, ranges
chipped across multiple sessions — fall back to the session label, phrased
honestly as "Added/Removed by one of: Alice A, Bob B". The ledger is
best-effort — if it ever falls out of alignment with the body it is discarded
(poisoned run / live-length check), never persisted wrong. Known 1.5s window:
a max-session flush snapshots the DB ledger (last checkpoint) but compacts the
live one, so tombstones from the final ≤1.5s of the window can miss the
version and fall back.

## 3. Read + restore APIs

Registry entries in [lib/api-routes/project/reports.ts](lib/api-routes/project/reports.ts)
and [slide-decks.ts](lib/api-routes/project/slide-decks.ts); handlers in the
matching route files. `list*Versions` / `get*Version` need `can_view_*`;
`restore*Version` / `copy*Version` need `can_configure_*` +
`preventAccessToLockedProjects`. List summaries compute sizes/counts in SQL
and never ship snapshot content.

**Restore sequencing** (both kinds): ⓪ validate the snapshot with current
schemas (fail fast, zero side effects), flush the document's live room(s)
(`flushRoomForDoc` — the safety snapshot reads the DB, and a room can be up to
1.5s ahead of it), and drain the document's open tracker session
(`drainVersionEditors`) → ① write a **safety version** of the current state
(editors = the drained session's editors, or [restorer] when none; skipped
when it already equals the newest version by hash — on any early failure the
drained editors are re-injected into the tracker) → ② apply the snapshot →
③ write a **restored-state version** with `restored_from_version_id` set.
Nothing is ever lost, and the restore itself appears in history.

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
  via `closeRoomsForDoc` (a stale room would fail checkpoints forever on a
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
  rewrite config, and the safety version covers the crash window between
  transaction and config-apply.

**Restore-as-copy**: `copyReportFromVersion` / `copyDeckFromVersion` create a
brand-new document from the snapshot (decks get FRESH slide ids — the
originals may still exist). Zero-risk path; no room interaction. Deck copy
validates every config first and inserts deck + slides in ONE transaction — a
mid-copy failure must not leave a half-copied deck.

**Room hygiene fix (pre-existing gap)**: `closeRoomsForDoc`
([server/collab/doc_rooms.ts](server/collab/doc_rooms.ts)) discards a live
room *without* checkpointing and errors its clients (the slide editor surfaces
that error as an alert — the user must not keep typing into a discarded room).
It is also wired into `deleteSlides`, `deleteSlideDeck` and `deleteReport`,
which previously left zombie rooms retrying failed checkpoints forever;
`deleteSlideDeck` aborts if the pre-delete slide-id fetch fails, since
deleting anyway would leave every live room a zombie.

## 4. UI

[client/src/components/version_history/](client/src/components/version_history/)
— `VersionHistoryEditor`, a full-panel editor (the dataset PreviousImports
pattern): day-grouped version list on the left (pinned "Current version" row,
contributor chips via `PresenceAvatars` + `presenceColorForKey(email)`, names
preferring live `projectState.projectUsers` over the stored capture-time name,
"Restored" badge, slide counts), preview on the right:

- **Report**: opens on **"Edits in this session"** — the diff of the selected
  version against the version immediately before it (the oldest version diffs
  against an empty document), rendered with the same highlight/strikethrough
  spans as compare; a toggle switches to **Preview** — the snapshot body
  through `MarkdownPresentationJsx` with embed tokens resolved against the
  version's OWN figure/image registries. "Compare with current" opens
  `ReportVersionCompare` — a unified ONE-page diff
  (additions highlighted, removals struck through) where hovering a change
  names who made it. Attribution is per editing session: the
  `getReportVersionLineage` route returns the compared version plus every
  newer version (bodies + editors + per-character `bodyAuthors`; no figure payloads), and
  `version_diff.ts` diffs adjacent steps, mapping each step's changes forward
  through CodeMirror `ChangeSet`s into current-document coordinates —
  insertions carry the session that wrote them (later sessions editing inside
  win on overlap), deletions the session(s) whose diff consumed the text.
  Changes newer than the newest stored version are labeled as recent,
  not-yet-versioned edits.
- **Deck**: paged canvas grid — 6 per page (`convertSlideToPageInputs` →
  `PageHolder`; live canvases are expensive, panther warns ~12-14) with
  click-to-expand. Session edits show as thumbnail badges (New/Edited vs the
  previous version, `canonicalJson` compare) and slides REMOVED in the
  session render as dimmed ghost thumbnails (previous version's config, near
  their old position), plus a summary line. Per-slide attribution comes from
  [server/collab/deck_session_ledger.ts](server/collab/deck_session_ledger.ts)
  — the deck analog of the report body ledger: every slide-level write path
  (room edits via the slide-room deps closure, create/duplicate/delete/move/
  update routes, deck settings/label) records WHO touched WHICH slide; the map
  freezes into `deck_versions.slide_editors` (migration 034) when the version
  is written, and drains into the safety version on restore. Badges are
  tinted with the author's presence color (single author) and hover names
  them exactly — "Edited by Bob B" — falling back to the session's editor set
  ("by one of: …", neutral gray) for pre-feature versions or after a restart
  (the ledger is in-memory only; there is no deck-level checkpoint row to
  persist it to — accepted, same class as the tracker's crash window). The
  previous version loads alongside; badges degrade gracefully if it can't.
  **Element level**: clicking an EDITED slide expands it with a "Changes in
  this session" list — which title field / text block / visualization / image
  changed, who changed each one, and inline text diffs for text elements
  (reusing the report DiffSegments). WHAT comes from `diffSlideElements`
  (client, pure — element-by-element config diff); WHO comes from
  `observeSlideDocElements` ([lib/collab/slide_crdt.ts](lib/collab/slide_crdt.ts))
  — a deep observer on the slide room's doc that maps each transaction's Yjs
  paths to stable element keys (`field:<name>`, `block:<id>`, `layout`,
  `props`; fracIndex-only changes count as layout, not block edits) and
  records them per slide in the deck ledger (`elements` in slide_editors).
  The two key vocabularies match by construction. Element attribution exists
  only for collab edits (the observer lives on the room doc); REST-path slide
  saves fall back to the slide-level editors.
  **Exact deletion attribution (deck-side tombstones)**: on top of the plain
  touched set, the observer CLASSIFIES each transaction's ops into extra
  slide_editors buckets alongside `elements` (their superset): block
  add/remove comes from SET-DIFFING the layout's item-id inventory before vs
  after the transaction (`elementsAdded`/`elementsRemoved`), and Y.Text
  delete ops (or a root-field key removal) become `elementsTextDeleted`. The
  set diff is deliberately semantic, NOT event-shaped: syncSlideToDoc
  collapses/unwraps containers via rebuildNodeInPlace and wholesale children
  replacement, so a deleted block frequently never appears as its own
  children-key delete (only an ancestor container's key does — an id the
  version diff never displays). Diffing the id inventory catches every
  structural encoding, and a MOVE (same id, new position) correctly
  classifies as neither added nor removed. Only map events under the layout
  (or the root layout key) trigger the re-walk — typing never pays for it.
  The preview resolves a removed/added element row from its exact bucket
  first, so a block Bob deleted after Alice edited it reads "removed by
  Bob B", not "removed by one of: Alice, Bob".
  **Per-character text authorship (slide element ledgers)**: every text
  element additionally gets a run-length authorship ledger — the report body
  machinery in [server/collab/authorship.ts](server/collab/authorship.ts)
  keyed per (slide, element), fed by the observer's `textDeltas` (every
  insert AND delete, so the mirror stays aligned; misalignment poisons the
  ledger, which is then dropped, never stored wrong). Deletions become
  text-carrying tombstones; `snapshotSlideElementAuthors` freezes them into
  `slide_editors.slides[id].elementAuthors` at version write (validated
  against the persisted texts), and the element diff hands them to
  `computeAttributedDiff` as `authors` — the same ghost-alignment path as
  report diffs — so even TWO people deleting in the SAME textbox each get
  their own exactly-attributed spans. Fallback layering per removed span:
  `authors` ghost (per-span exact) → `removedLabel` (element deleter set) →
  session label. Unlike report bodies these ledgers are in-memory only
  (accepted restart window): kept alive from room create through the
  version write (room close only prunes uninformative ones), compacted
  after the version insert succeeds, dropped when the room is gone
  (`isRoomOpen`) or the slide row is deleted.
  Whole-slide deletion was already exact: the deleteSlides route records the
  deleting user in the slide-level `removed` bucket (the ghost badge reads
  it), independent of who edited the slide beforehand.

Footer (configure permission + unlocked): **Restore** (confirm explains the
safety version) and **Restore as copy** (name prompt). Entry points: History
button in the report editor heading bar; "Version history" in the deck
overflow menu.

## 5. Known tradeoffs (v1)

- Full snapshots × multi-MB figure bundles ⇒ storage growth; contained by
  hash-dedup + the 100 cap (summaries expose `sizeBytes`). Delta storage is
  future work.
- In-flight checkpoint racing `closeRoomsForDoc`: harmless for deletes (save
  fails on the gone row); microsecond window for re-inserted ids. Same class:
  an id collision appearing between `remapCollidingSlideIds` and the restore
  transaction.
- Contributor attribution on hard crash: at most one open session window lost.
- Hash false-negatives (schema-normalization drift between write paths) can
  produce an occasional duplicate version — harmless.
- The report editor logs (rather than alerts) collab errors: report rooms are
  only discarded when the report row is deleted, where the whole editor is
  already stale.

## 6. Verification

- Tracker harness (fake clock, 29 asserts): idle-gap, contributor union +
  rename dedup, max-session split, empty-grace + cancellation, hash-dedup,
  deleted-doc drop, failed-write AND failed-load merge-back/retry, flushAll,
  drainEditors, per-doc independence.
- `planDeckRestore` harness (14 asserts): partition invariants, original-id
  preservation, snapshot ordering, empty edge cases.
- `deck_session_ledger` harness (13 asserts): per-slide kinds + dedup,
  added+edited coexistence, drain-clears semantics, merge-back after a failed
  insert, cross-deck isolation, the slide cap, element touches (drain-along,
  clear, merge-back round-trip).
- `slide_elements` harness (15 asserts): observer key derivation (root text
  fields, text/figure block edits, block add via sync, reorder→layout-only,
  props, origin passthrough) and diffSlideElements (field/block text diffs,
  figure/image edits, add/remove, reorder, cover props, identical=empty) —
  the two key vocabularies verified against each other.
- `deck_deletion_attribution` harness (43 asserts): observer op
  classification (insert vs text-delete, structural block remove/add,
  fracIndex-only excluded, root-field deletes, mixed transactions), the
  production structural encodings (container COLLAPSE hiding the block's
  delete, rebuild-at-root, the same collapse arriving as a remote binary
  update with RoomConn origin, moves classifying as neither added nor
  removed) and the ledger's classified buckets (superset invariant,
  drain/restore round-trip, no false buckets).
- `deck_diff_override` harness (16 asserts): `removedLabel` attribution of
  removed spans (exact single deleter, inexact multi-deleter, email carry),
  added spans keeping the editor label, no-override fallback unchanged, and
  the report tombstone path still winning over labels.
- `same_textbox_deletions` harness (server + client halves, 14 asserts):
  two users deleting different sentences from the SAME textbox through the
  real room pipeline → two text-carrying tombstones with distinct deleters,
  live runs covering exactly the final text, compact starting a fresh
  window; the captured runs then fed to the real `computeAttributedDiff` →
  each sentence attributed exactly to its own deleter (name + email/color),
  beating both label fallbacks.
- `version_diff` harness (46 asserts incl. 200-chain fuzz): current-doc
  reassembly, base-char coverage, per-session attribution (replacements,
  later-deletes, edits inside earlier insertions), author-run splitting
  (exact per-person spans, null-run fallback), ghost-document deletion
  attribution (exact deleter, multi-deleter splits within one hunk,
  replacement anchors, partial-ledger split into exact + fallback,
  typed-then-deleted ghost interference, mid-word deletions vs word-aligned
  hunks, null-deleter fallback), degenerate inputs.
- `authorship` harness (18 asserts incl. 300-run delta fuzz): attribution and
  alignment through interleaved edits, tombstone creation (writer + deleter +
  deleted text kept, ghost order, insert-after-anchor rule,
  delete-across-tombstone), unknown deleters, compaction, the tombstone cap,
  unattributed inserts, misalignment poisoning (body-mirror equality),
  persisted-run adoption/rejection.
- All are scratch scripts (`deno run --allow-all -c deno.json <file>` with
  absolute-path imports — the repo's standard harness idiom).
- Manual two-user matrix: see the feature checklist in the PR/commit series
  (`feat(version-history): …`).
