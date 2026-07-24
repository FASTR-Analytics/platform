// =============================================================================
// Collaborative document rooms (server-authoritative Yjs relay) — generic core
// =============================================================================
//
// One room per co-edited document (slides, reports, visualizations). The
// server holds the authoritative Y.Doc and a set of connected clients. It:
//   - seeds the doc from persisted content on first open (or restores the
//     exact prior Yjs state so co-editing survives a server restart),
//   - syncs each joining client (sends what they're missing + our state vector
//     so they can push back what WE are missing — two-way catch-up),
//   - relays every update to the other clients in the room,
//   - debounced-checkpoints the materialized content back to storage so
//     viewers, exports and list previews see the result,
//   - lets non-collab writes (HTTP saves) merge through a live room instead of
//     racing its checkpoints (applyToLiveRoom).
//
// This module is document-type agnostic: everything type-specific (seed/
// materialize, wire message shapes) comes in via a DocRoomAdapter, and DB
// access is injected per room (DocRoomDeps) so the module stays pure and
// testable. Thin wrappers (slide_rooms.ts, report_rooms.ts, po_rooms.ts)
// bind the adapters. The hardened behaviors here are load-bearing — preserve them when
// editing: finalize re-checks for late subscribers and retries a failed final
// checkpoint (the doc is the sole copy of the session tail), a TRANSIENT-failed
// checkpoint keeps the room dirty and schedules a timer retry while a
// PERMANENT (validation) failure retries only on the next edit — the same doc
// state fails identically forever, and a timer would spin for the life of the
// process (observed 2026-07-23: a wedged PO room burned ~6k log lines/day) —
// checkpoints are SERIALIZED per room (a straggler save must never commit over
// a newer one — flushRoomForDoc's callers snapshot the DB right after it
// resolves), and first-subscribes re-check the registry, the connection's
// liveness and the cancellation tombstones after the async load.

import * as Y from "yjs";
import {
  base64ToBytes,
  bytesToBase64,
  type CollabServerMessage,
  type VersionEditor,
} from "lib";

const CHECKPOINT_DEBOUNCE_MS = 1500;
// A failed save retries on this cadence (not just on the next edit) so an
// idle-but-dirty room still converges once the DB recovers.
const CHECKPOINT_RETRY_MS = 10_000;
// Final-checkpoint retry backoff inside finalizeRoom, then the whole finalize
// re-runs on a slow cycle for as long as the room stays dirty — the room is
// intentionally kept registered rather than destroying unsaved edits.
const FINALIZE_RETRY_DELAYS_MS = [1_000, 5_000];
const FINALIZE_RETRY_CYCLE_MS = 30_000;
// Failure logging is throttled to the first attempt and then every Nth — a
// room retrying on the 10s cadence would otherwise log ~8.6k lines/day.
const SAVE_FAILURE_LOG_EVERY = 30;

export type RoomConn = {
  connectionId: string;
  canEdit: boolean;
  /** Who this connection is — attributed to version history on every edit. */
  identity?: VersionEditor;
  send: (msg: CollabServerMessage) => void;
  /** Whether the underlying socket is still open. subscribeDoc re-checks this
   *  after its async load — a connection that died during the load must not be
   *  registered (its close handler already ran and found nothing to clean, so
   *  a late registration would hold the room open forever). */
  isLive?: () => boolean;
};

/** Everything document-type-specific about a room. */
export type DocRoomAdapter<T> = {
  /** Namespaces the room key so a slide and a report can share an id. */
  docType: string;
  notFoundMessage: string;
  seed: (doc: Y.Doc, content: T) => void;
  materialize: (doc: Y.Doc) => T;
  msgSync: (docId: string, update: string, stateVector: string) => CollabServerMessage;
  msgUpdate: (docId: string, update: string) => CollabServerMessage;
  /** `fatal` ⇔ the document/room is gone (deleted, replaced, not found) — the
   *  client session must stop editing. See CollabServerMessage. */
  msgError: (docId: string, message: string, fatal?: boolean) => CollabServerMessage;
  msgAwareness: (docId: string, update: string) => CollabServerMessage;
  /** Fired once per room lifetime, after the doc holds its initial content
   *  (seed or crdt_state restore) — reports attach their authorship observer
   *  here. Paired with onDocClosed on every teardown path. */
  onDocCreated?: (projectId: string, docId: string, doc: Y.Doc) => void;
  onDocClosed?: (projectId: string, docId: string) => void;
};

/** Outcome of a DocRoomDeps.save. `permanent: true` marks a failure the same
 *  doc state will reproduce forever (schema validation) — the room then
 *  retries only when the doc next changes, never on a timer. Omitted/false
 *  means transient (DB trouble): timer retries until the DB recovers. */
export type DocSaveResult =
  | { ok: true; lastUpdated: string }
  | { ok: false; permanent?: boolean };

export type DocRoomDeps<T> = {
  /** Load the document. `crdtState` is the base64 Yjs state to restore the doc
   *  from (present only when current); when null the room seeds from `content`. */
  load: () => Promise<{ content: T; crdtState: string | null } | null>;
  /** Persist the materialized content + Yjs state (collab is authoritative, so
   *  this overwrites) and fire SSE notifications. Validation belongs HERE (not
   *  in the DB write): classify a schema rejection as `permanent` so the room
   *  doesn't hot-retry an input that can never save. */
  save: (content: T, crdtState: string) => Promise<DocSaveResult>;
  /** Version-history capture: fired for every attributed edit applied to the
   *  room's doc (collab updates + external writes routed through the room). */
  onEdit?: (editor: VersionEditor) => void;
  /** Version-history capture: fired when the room is torn down (last client
   *  left) — starts the session-end grace timer. */
  onEmpty?: () => void;
};

type Room = {
  key: string;
  projectId: string;
  docId: string;
  adapter: DocRoomAdapter<unknown>;
  doc: Y.Doc;
  conns: Map<string, RoomConn>;
  deps: DocRoomDeps<unknown>;
  dirty: boolean;
  checkpointTimer: ReturnType<typeof setTimeout> | null;
  /** Serializes checkpoint saves: every checkpoint chains behind the previous
   *  one, so two saves can never race in the pool and commit out of order
   *  (which would leave the DB row OLDER than the room doc, silently reverting
   *  e.g. a just-completed version restore). flushRoomForDoc awaits the chain
   *  even when the room is clean, so its callers always observe a settled row. */
  saveChain: Promise<unknown>;
  /** True while deps.save is erroring — drives the doc_save_state messages so
   *  clients can stop showing "Live" while nothing persists. */
  saveFailing: boolean;
  /** Consecutive failed save attempts (log throttling); reset on success. */
  saveFailCount: number;
  /** Last failure was permanent (validation): no timer retry — the next edit
   *  re-attempts, since only a changed doc can produce a different outcome. */
  savePermanent: boolean;
  /** last_updated of the most recent successful save. A chained checkpoint
   *  that finds the room clean returns this: an earlier run in the chain
   *  already persisted the caller's change (coalescing), and returning null
   *  would make applyToLiveRoom callers mistake that for "no room live" and
   *  double-write the DB directly. */
  lastSavedStamp: string | null;
  /** Re-entrancy guard for finalizeRoom (unsubscribe + conn-gone + the retry
   *  cycle can all trigger it). */
  finalizing: boolean;
  finalizeRetryTimer: ReturnType<typeof setTimeout> | null;
};

const rooms = new Map<string, Room>();
const connRooms = new Map<string, Set<string>>(); // connectionId -> room keys
// Unsubscribes that raced an in-flight first-subscribe load (`${connectionId}
// ::${roomKey}`): the room didn't exist yet so there was nothing to remove —
// subscribeDoc consumes the tombstone after its load instead of registering a
// member that already left. Entries are consumed there or dropped with the
// connection in handleConnGone.
const cancelledSubscribes = new Set<string>();

function roomKey(projectId: string, docType: string, docId: string): string {
  return `${projectId}::${docType}::${docId}`;
}

function subscribeCancelKey(connectionId: string, key: string): string {
  return `${connectionId}::${key}`;
}

function trackConnRoom(connectionId: string, key: string): void {
  let set = connRooms.get(connectionId);
  if (!set) {
    set = new Set();
    connRooms.set(connectionId, set);
  }
  set.add(key);
}

/** Whether a live room currently exists for the doc — lets the version writer
 *  decide between compacting a still-open doc's ledgers and dropping a closed
 *  one's. */
export function isRoomOpen(
  projectId: string,
  docType: string,
  docId: string,
): boolean {
  return rooms.has(roomKey(projectId, docType, docId));
}

function attachDoc(room: Room): void {
  room.doc.on("update", (update: Uint8Array, origin: unknown) => {
    const originConn = origin as RoomConn | undefined;
    const payload = bytesToBase64(update);
    for (const conn of room.conns.values()) {
      // Skip the client that produced this update — it already has it locally.
      if (originConn && conn.connectionId === originConn.connectionId) {
        continue;
      }
      try {
        conn.send(room.adapter.msgUpdate(room.docId, payload));
      } catch {
        // A dead socket is cleaned up by its own close/error handler — must
        // not abort this loop, or a later peer's send failure would make the
        // originating client's valid update look "malformed" (see the outer
        // catch in applyDocUpdate) and could skip marking the room dirty.
      }
    }
    room.dirty = true;
    scheduleCheckpoint(room);
  });
}

function scheduleCheckpoint(
  room: Room,
  delayMs = CHECKPOINT_DEBOUNCE_MS,
): void {
  if (room.checkpointTimer) {
    return;
  }
  room.checkpointTimer = setTimeout(() => {
    room.checkpointTimer = null;
    void checkpoint(room);
  }, delayMs);
}

function broadcastSaveState(room: Room, failing: boolean): void {
  const msg: CollabServerMessage = {
    type: "doc_save_state",
    data: { docType: room.adapter.docType, docId: room.docId, failing },
  };
  for (const conn of room.conns.values()) conn.send(msg);
}

function noteSaveFailure(room: Room, permanent: boolean): void {
  room.saveFailCount++;
  room.savePermanent = permanent;
  if (!room.saveFailing) {
    room.saveFailing = true;
    broadcastSaveState(room, true);
  }
  if (
    room.saveFailCount === 1 ||
    room.saveFailCount % SAVE_FAILURE_LOG_EVERY === 0
  ) {
    console.error(
      `[collab] checkpoint ${
        permanent ? "rejected (permanent for this doc state)" : "save failed"
      } for ${room.key} (attempt ${room.saveFailCount}) — ${
        permanent ? "will retry on next edit" : "retrying"
      }`,
    );
  }
  // TRANSIENT (DB trouble): retry on a timer, not just on the next edit — an
  // idle-but-dirty room would otherwise never converge once the DB recovers.
  // PERMANENT (validation): no timer — the same doc state fails identically
  // forever; the doc's update handler marks dirty and re-attempts on the next
  // edit, which is the only event that can change the outcome.
  if (!permanent && !room.finalizing) {
    scheduleCheckpoint(room, CHECKPOINT_RETRY_MS);
  }
}

function noteSaveRecovered(room: Room): void {
  room.saveFailCount = 0;
  room.savePermanent = false;
  if (!room.saveFailing) {
    return;
  }
  room.saveFailing = false;
  broadcastSaveState(room, false);
  console.error(`[collab] checkpoint recovered for ${room.key}`);
}

/** Persist the room's content. Never call directly — checkpoint() serializes
 *  it behind the room's saveChain. Never throws: a materialize/save failure
 *  re-marks the room dirty and schedules a retry (see noteSaveFailure). */
async function doCheckpoint(room: Room): Promise<string | null> {
  // Clean ⇒ the chain's previous run already persisted the current doc state
  // (possibly coalescing this caller's change) — report that save's stamp.
  if (!room.dirty) {
    return room.lastSavedStamp;
  }
  room.dirty = false;
  let result: DocSaveResult;
  try {
    const content = room.adapter.materialize(room.doc);
    const crdtState = bytesToBase64(Y.encodeStateAsUpdate(room.doc));
    result = await room.deps.save(content, crdtState);
  } catch (err) {
    // materialize() can throw on a doc corrupted into an un-materializable
    // shape — permanent for this doc state (identical input fails
    // identically); an edit may repair the doc, and edits re-trigger
    // checkpoints. Must not escape into `void checkpoint(...)` call sites.
    console.error(`[collab] checkpoint materialize threw for ${room.key}`, err);
    result = { ok: false, permanent: true };
  }
  if (!result.ok) {
    room.dirty = true;
    noteSaveFailure(room, result.permanent === true);
    return null;
  }
  room.lastSavedStamp = result.lastUpdated;
  noteSaveRecovered(room);
  return result.lastUpdated;
}

/** Checkpoint the room, serialized behind any in-flight save. Awaiting this
 *  guarantees every save that was in flight OR requested at call time has
 *  settled — the property flushRoomForDoc's restore-safety contract needs. */
function checkpoint(room: Room): Promise<string | null> {
  const run = room.saveChain.then(() => doCheckpoint(room));
  // Keep the chain alive whatever happens (doCheckpoint shouldn't throw, but
  // a rejected chain would deadlock every future checkpoint).
  room.saveChain = run.catch(() => null);
  return run;
}

/** A client opens a document for (read-only or editing) collaboration.
 *  `deps` is used only when this call CREATES the room; for an already-live
 *  room the argument is ignored — the creating subscriber's deps (and any
 *  closures inside them) stay bound for the room's whole lifetime. */
export async function subscribeDoc<T>(
  projectId: string,
  docId: string,
  conn: RoomConn,
  clientStateVectorB64: string,
  adapter: DocRoomAdapter<T>,
  deps: DocRoomDeps<T>,
): Promise<void> {
  const key = roomKey(projectId, adapter.docType, docId);
  // A fresh subscribe supersedes any tombstone an earlier unsubscribe left.
  cancelledSubscribes.delete(subscribeCancelKey(conn.connectionId, key));
  let room = rooms.get(key);

  if (!room) {
    const loaded = await deps.load();
    // Another concurrent subscribe may have created the room during the await.
    room = rooms.get(key);
    if (!room) {
      if (!loaded) {
        conn.send(adapter.msgError(docId, adapter.notFoundMessage, true));
        return;
      }
      const doc = new Y.Doc();
      let restored = false;
      if (loaded.crdtState) {
        // Restore the exact prior Yjs doc (survives server restart cleanly).
        // Corrupt/incompatible stored state must never throw here: this runs on
        // the shared server process, so a bad row would crash every project.
        try {
          Y.applyUpdate(doc, base64ToBytes(loaded.crdtState));
          restored = true;
        } catch (err) {
          console.error(
            `[collab] failed to restore crdt_state for ${key}; seeding from content`,
            err,
          );
        }
      }
      if (!restored) {
        // First-ever open (or stale/corrupt CRDT state): seed from the content.
        adapter.seed(doc, loaded.content);
      }
      room = {
        key,
        projectId,
        docId,
        // Room deliberately erases T: one heterogeneous map holds slide/report/
        // po rooms together. adapter.seed/deps.save are never invoked with a
        // mismatched T at any call site in this file (each call reads its own
        // adapter/deps back from the same room, never mixes rooms), so this
        // narrowing cast is safe.
        adapter: adapter as DocRoomAdapter<unknown>,
        doc,
        conns: new Map(),
        deps: deps as DocRoomDeps<unknown>,
        dirty: false,
        checkpointTimer: null,
        saveChain: Promise.resolve(),
        saveFailing: false,
        saveFailCount: 0,
        savePermanent: false,
        lastSavedStamp: null,
        finalizing: false,
        finalizeRetryTimer: null,
      };
      rooms.set(key, room);
      attachDoc(room);
      adapter.onDocCreated?.(projectId, docId, doc);
    }
  }

  // The load was async: the connection may have unsubscribed (tombstone) or
  // its socket may have died (handleConnGone already ran and found nothing)
  // while we were away. Registering it anyway would park a phantom member in
  // the room — conns.size never reaches 0, so the room never finalizes and the
  // doc leaks for the life of the process.
  const cancelled = cancelledSubscribes.delete(
    subscribeCancelKey(conn.connectionId, key),
  );
  if (cancelled || (conn.isLive && !conn.isLive())) {
    if (room.conns.size === 0) {
      void finalizeRoom(room);
    }
    return;
  }

  room.conns.set(conn.connectionId, conn);
  trackConnRoom(conn.connectionId, key);

  // Send the client whatever it is missing relative to its state vector, plus
  // our state vector so it can push back anything WE are missing (e.g. a local
  // edit whose update was lost before a reconnect).
  let sv: Uint8Array | undefined;
  if (clientStateVectorB64) {
    try {
      sv = base64ToBytes(clientStateVectorB64);
    } catch {
      sv = undefined;
    }
  }
  // A malformed client state vector (valid base64, invalid Yjs bytes) makes
  // encodeStateAsUpdate throw. Since subscribeDoc is called un-awaited (`void
  // subscribe*`), that throw would become an unhandled rejection and take down
  // the whole process — reachable with view-only access. Fall back to a full
  // sync (encode against no state vector, always valid on our own doc).
  let sync: Uint8Array;
  try {
    sync = Y.encodeStateAsUpdate(room.doc, sv);
  } catch {
    sync = Y.encodeStateAsUpdate(room.doc);
  }
  const stateVector = Y.encodeStateVector(room.doc);
  try {
    conn.send(
      adapter.msgSync(docId, bytesToBase64(sync), bytesToBase64(stateVector)),
    );
  } catch {
    // A dead socket is cleaned up by its own close/error handler.
  }
  // Clients reset their save-state on every sync, so a joiner of a room whose
  // saves are currently failing must be told immediately.
  if (room.saveFailing) {
    try {
      conn.send({
        type: "doc_save_state",
        data: { docType: room.adapter.docType, docId: room.docId, failing: true },
      });
    } catch {
      // A dead socket is cleaned up by its own close/error handler.
    }
  }
}

/** Apply a client's update to the authoritative doc (which relays + checkpoints). */
export function applyDocUpdate<T>(
  projectId: string,
  docId: string,
  conn: RoomConn,
  updateB64: string,
  adapter: DocRoomAdapter<T>,
): void {
  if (!conn.canEdit) {
    conn.send(adapter.msgError(docId, "No edit permission"));
    return;
  }
  const room = rooms.get(roomKey(projectId, adapter.docType, docId));
  if (!room) {
    return;
  }
  let bytes: Uint8Array;
  try {
    bytes = base64ToBytes(updateB64);
  } catch (err) {
    console.error(`[collab] rejected malformed base64 update for ${room.key}`, err);
    conn.send(adapter.msgError(docId, "Malformed document update"));
    return;
  }
  // origin = conn so the doc's update handler skips echoing back to the sender.
  // A malformed update (valid base64, invalid Yjs bytes) makes applyUpdate
  // throw synchronously into the WS onMessage handler, whose try/catch only
  // covers JSON.parse — that would crash the shared server. Reject it to the
  // sender and leave the authoritative doc untouched.
  try {
    Y.applyUpdate(room.doc, bytes, conn);
  } catch (err) {
    console.error(`[collab] rejected malformed update for ${room.key}`, err);
    conn.send(adapter.msgError(docId, "Malformed document update"));
    return;
  }
  if (conn.identity) {
    room.deps.onEdit?.(conn.identity);
  }
}

/** Relay a Yjs awareness (cursor/selection) update to the other room members.
 *  Awareness is ephemeral — not applied to the server doc and not persisted. */
export function relayDocAwareness<T>(
  projectId: string,
  docId: string,
  sender: RoomConn,
  updateB64: string,
  adapter: DocRoomAdapter<T>,
): void {
  const room = rooms.get(roomKey(projectId, adapter.docType, docId));
  if (!room) {
    return;
  }
  for (const conn of room.conns.values()) {
    if (conn.connectionId === sender.connectionId) {
      continue;
    }
    try {
      conn.send(adapter.msgAwareness(docId, updateB64));
    } catch {
      // A dead socket is cleaned up by its own close/error handler.
    }
  }
}

export function unsubscribeDoc(
  projectId: string,
  docType: string,
  docId: string,
  conn: RoomConn,
): void {
  const key = roomKey(projectId, docType, docId);
  const room = rooms.get(key);
  connRooms.get(conn.connectionId)?.delete(key);
  if (!room || !room.conns.has(conn.connectionId)) {
    // The matching subscribe may still be awaiting its load (room not yet
    // registered, or registered by someone else without this member) — leave
    // a tombstone it consumes instead of registering a member that left.
    cancelledSubscribes.add(subscribeCancelKey(conn.connectionId, key));
    return;
  }
  room.conns.delete(conn.connectionId);
  if (room.conns.size === 0) {
    void finalizeRoom(room);
  }
}

/** A connection (WebSocket) closed — drop it from every room it was in
 *  (all document types; the registry is shared). */
export function handleConnGone(connectionId: string): void {
  // Drop any pending-subscribe tombstones with the connection (in-flight
  // subscribes are additionally covered by conn.isLive).
  const prefix = `${connectionId}::`;
  for (const k of cancelledSubscribes) {
    if (k.startsWith(prefix)) {
      cancelledSubscribes.delete(k);
    }
  }
  const keys = connRooms.get(connectionId);
  if (!keys) {
    return;
  }
  for (const key of keys) {
    const room = rooms.get(key);
    if (!room) {
      continue;
    }
    room.conns.delete(connectionId);
    if (room.conns.size === 0) {
      void finalizeRoom(room);
    }
  }
  connRooms.delete(connectionId);
}

async function finalizeRoom(room: Room): Promise<void> {
  // Unsubscribe, conn-gone and the retry cycle can all trigger finalize; only
  // one run at a time, and later triggers are subsumed by the running one's
  // own re-checks.
  if (room.finalizing) {
    return;
  }
  room.finalizing = true;
  if (room.finalizeRetryTimer) {
    clearTimeout(room.finalizeRetryTimer);
    room.finalizeRetryTimer = null;
  }
  try {
    if (room.checkpointTimer) {
      clearTimeout(room.checkpointTimer);
      room.checkpointTimer = null;
    }
    await checkpoint(room);
    // A failed FINAL checkpoint means the room doc is the only copy of the
    // session tail — destroying the room here (the old behavior) silently
    // discarded it. Retry with backoff while the room stays empty. A
    // PERMANENT (validation) failure skips the retries: the same doc state
    // fails identically forever.
    for (const delayMs of FINALIZE_RETRY_DELAYS_MS) {
      if (!room.dirty || room.savePermanent) {
        break;
      }
      if (room.conns.size > 0) {
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, delayMs));
      if (room.conns.size > 0) {
        return;
      }
      await checkpoint(room);
    }
    if (room.dirty && room.savePermanent) {
      // Validation-rejected doc: keep the room registered (preserving the
      // edits) but schedule NOTHING — the retry cycle would spin for the life
      // of the process on an input that can never save. A returning editor
      // restores the state, repairs it, and the repair edit checkpoints and
      // finalizes normally. Cleared only by that, or by a restart (which
      // drops the tail — same loss the retry cycle merely deferred).
      console.error(
        `[collab] final checkpoint rejected for ${room.key} — keeping room; will retry on next edit`,
      );
      return;
    }
    if (room.dirty) {
      // Still failing (transiently) — keep the room registered (preserving
      // the edits) and re-run the whole finalize later rather than dropping
      // the data.
      console.error(
        `[collab] final checkpoint still failing for ${room.key} — keeping room, retrying in ${FINALIZE_RETRY_CYCLE_MS}ms`,
      );
      room.finalizeRetryTimer = setTimeout(() => {
        room.finalizeRetryTimer = null;
        if (room.conns.size === 0) {
          void finalizeRoom(room);
        }
      }, FINALIZE_RETRY_CYCLE_MS);
      return;
    }
    // A client may have subscribed while the final checkpoint was in flight —
    // the room is still registered during the await, so it must stay alive for
    // them (destroying it would silently drop all their future updates).
    if (room.conns.size > 0) {
      return;
    }
    if (rooms.get(room.key) === room) {
      rooms.delete(room.key);
    }
    room.doc.destroy();
    room.adapter.onDocClosed?.(room.projectId, room.docId);
    room.deps.onEmpty?.();
  } finally {
    room.finalizing = false;
  }
}

/**
 * Persist a live room's un-checkpointed edits NOW (no-op when no room is
 * live). The restore routes call this before snapshotting the safety version —
 * without it, up to CHECKPOINT_DEBOUNCE_MS of co-editor typing exists only in
 * the room's doc and would be missed by the snapshot and then destroyed by the
 * restore. Always awaits the room's save chain, even when the room is clean:
 * "clean" may mean a save is IN FLIGHT (dirty clears at save start), and the
 * caller is about to read the DB expecting this room's latest state.
 */
export async function flushRoomForDoc(
  projectId: string,
  docType: string,
  docId: string,
): Promise<void> {
  const room = rooms.get(roomKey(projectId, docType, docId));
  if (!room) {
    return;
  }
  if (room.checkpointTimer) {
    clearTimeout(room.checkpointTimer);
    room.checkpointTimer = null;
  }
  await checkpoint(room);
}

/**
 * Shutdown path: persist EVERY dirty room (and settle every in-flight save)
 * before the DB pools close. Runs before flushAllVersions in main.ts — the
 * version flush reads document content from the DB, so the rooms' checkpoints
 * must land first or the captured versions (and the rows themselves) miss the
 * last CHECKPOINT_DEBOUNCE_MS of typing on every deploy.
 */
export async function flushAllRooms(): Promise<void> {
  await Promise.all(
    [...rooms.values()].map(async (room) => {
      if (room.checkpointTimer) {
        clearTimeout(room.checkpointTimer);
        room.checkpointTimer = null;
      }
      await checkpoint(room);
    }),
  );
}

/**
 * Discard a live room WITHOUT checkpointing — for documents whose row is being
 * deleted or replaced (slide/report delete, deck restore). A room left alive
 * would either fail its checkpoints forever (row gone) or clobber a re-created
 * row with its stale doc. Connected clients get the adapter's error message
 * (their sessions surface it via onError) and must re-subscribe to whatever
 * replaces the document.
 */
export function closeRoomsForDoc(
  projectId: string,
  docType: string,
  docId: string,
  message: string,
): void {
  const key = roomKey(projectId, docType, docId);
  const room = rooms.get(key);
  if (!room) {
    return;
  }
  if (room.checkpointTimer) {
    clearTimeout(room.checkpointTimer);
    room.checkpointTimer = null;
  }
  if (room.finalizeRetryTimer) {
    clearTimeout(room.finalizeRetryTimer);
    room.finalizeRetryTimer = null;
  }
  room.dirty = false; // explicit discard — never checkpoint this doc again
  for (const conn of room.conns.values()) {
    conn.send(room.adapter.msgError(docId, message, true));
    connRooms.get(conn.connectionId)?.delete(key);
  }
  room.conns.clear();
  rooms.delete(key);
  room.doc.destroy();
  room.adapter.onDocClosed?.(room.projectId, room.docId);
}

/** Outcome of routing an external write through a live room.
 *  - `saved`: the room applied AND persisted it — done.
 *  - `save_failed`: the room applied it (peers already saw it) but the
 *    checkpoint failed. The caller must NOT fall back to a direct DB write:
 *    the room retains the change and owns persistence, and a direct write
 *    would be clobbered by the room's next successful checkpoint. Report the
 *    failure to the HTTP caller instead.
 *  - `no_room`: nothing live — the caller writes the DB directly. */
export type LiveRoomApplyResult =
  | { status: "saved"; lastUpdated: string }
  | { status: "save_failed" }
  | { status: "no_room" };

/**
 * Route a non-collab document save (plain HTTP updates: AI edits, fallback
 * saves) through a live room, if one exists. The external change is applied
 * onto the authoritative doc — relaying it live to connected editors — and
 * checkpointed immediately so the caller gets read-your-write semantics.
 * Without this, a direct DB write would be silently clobbered by the room's
 * next checkpoint.
 *
 * `apply` performs the type-specific (possibly partial) sync onto the doc.
 * `editor` attributes the write to version history (the HTTP caller — AI
 * edits, fallback saves); omit it for writes that must NOT be tracked
 * (restores version explicitly). See LiveRoomApplyResult for the outcomes —
 * `save_failed` was previously conflated with `no_room` (both null), which
 * made routes double-write the DB while a wedged room kept serving and
 * eventually re-clobbering its own divergent doc.
 */
export async function applyToLiveRoom(
  projectId: string,
  docType: string,
  docId: string,
  apply: (doc: Y.Doc) => void,
  editor?: VersionEditor,
): Promise<LiveRoomApplyResult> {
  const room = rooms.get(roomKey(projectId, docType, docId));
  if (!room) {
    return { status: "no_room" };
  }
  // The origin is not a RoomConn, so the update handler relays this to every
  // connected client; it carries the editor so the authorship observer can
  // attribute the change (restores pass no editor -> unattributed).
  room.doc.transact(
    () => apply(room.doc),
    editor ? { versionEditor: editor } : undefined,
  );
  if (editor) {
    room.deps.onEdit?.(editor);
  }
  if (room.checkpointTimer) {
    clearTimeout(room.checkpointTimer);
    room.checkpointTimer = null;
  }
  // Force the write even when the doc already matched the payload, so the
  // caller always gets a fresh last_updated for its response.
  room.dirty = true;
  const lastUpdated = await checkpoint(room);
  // An empty room kept alive by a permanently-failed finalize has no timers
  // and no members — if this external write just made it saveable, nothing
  // else would ever finalize it, and it would leak for the life of the
  // process. Re-run finalize: a clean room tears down, a still-failing one
  // keeps its documented keep-the-room behavior.
  if (room.conns.size === 0 && !room.finalizing) {
    void finalizeRoom(room);
  }
  return lastUpdated !== null
    ? { status: "saved", lastUpdated }
    : { status: "save_failed" };
}
