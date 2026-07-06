// =============================================================================
// Collaborative document rooms (server-authoritative Yjs relay) — generic core
// =============================================================================
//
// One room per co-edited document (slides, reports). The server holds the
// authoritative Y.Doc and a set of connected clients. It:
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
// access is injected per subscription (DocRoomDeps) so the module stays pure
// and testable. Thin wrappers (slide_rooms.ts, report_rooms.ts) bind the
// adapters. The hardened behaviors here are load-bearing — preserve them when
// editing: finalize re-checks for late subscribers, a failed checkpoint keeps
// the room dirty for retry, and concurrent first-subscribes re-check the
// registry after the async load.

import * as Y from "yjs";
import {
  base64ToBytes,
  bytesToBase64,
  type CollabServerMessage,
  type VersionEditor,
} from "lib";

const CHECKPOINT_DEBOUNCE_MS = 1500;

export type RoomConn = {
  connectionId: string;
  canEdit: boolean;
  /** Who this connection is — attributed to version history on every edit. */
  identity?: VersionEditor;
  send: (msg: CollabServerMessage) => void;
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
  msgError: (docId: string, message: string) => CollabServerMessage;
  msgAwareness: (docId: string, update: string) => CollabServerMessage;
};

export type DocRoomDeps<T> = {
  /** Load the document. `crdtState` is the base64 Yjs state to restore the doc
   *  from (present only when current); when null the room seeds from `content`. */
  load: () => Promise<{ content: T; crdtState: string | null } | null>;
  /** Persist the materialized content + Yjs state (collab is authoritative, so
   *  this overwrites) and fire SSE notifications. Returns the new
   *  last_updated, or null when the save failed. */
  save: (content: T, crdtState: string) => Promise<string | null>;
  /** Version-history capture: fired for every attributed edit applied to the
   *  room's doc (collab updates + external writes routed through the room). */
  onEdit?: (editor: VersionEditor) => void;
  /** Version-history capture: fired when the room is torn down (last client
   *  left) — starts the session-end grace timer. */
  onEmpty?: () => void;
};

type Room = {
  key: string;
  docId: string;
  // deno-lint-ignore no-explicit-any
  adapter: DocRoomAdapter<any>;
  doc: Y.Doc;
  conns: Map<string, RoomConn>;
  // deno-lint-ignore no-explicit-any
  deps: DocRoomDeps<any>;
  dirty: boolean;
  checkpointTimer: ReturnType<typeof setTimeout> | null;
};

const rooms = new Map<string, Room>();
const connRooms = new Map<string, Set<string>>(); // connectionId -> room keys

function roomKey(projectId: string, docType: string, docId: string): string {
  return `${projectId}::${docType}::${docId}`;
}

function trackConnRoom(connectionId: string, key: string): void {
  let set = connRooms.get(connectionId);
  if (!set) {
    set = new Set();
    connRooms.set(connectionId, set);
  }
  set.add(key);
}

function attachDoc(room: Room): void {
  room.doc.on("update", (update: Uint8Array, origin: unknown) => {
    const originConn = origin as RoomConn | undefined;
    const payload = bytesToBase64(update);
    for (const conn of room.conns.values()) {
      // Skip the client that produced this update — it already has it locally.
      if (originConn && conn.connectionId === originConn.connectionId) continue;
      conn.send(room.adapter.msgUpdate(room.docId, payload));
    }
    room.dirty = true;
    scheduleCheckpoint(room);
  });
}

function scheduleCheckpoint(room: Room): void {
  if (room.checkpointTimer) return;
  room.checkpointTimer = setTimeout(() => {
    room.checkpointTimer = null;
    void checkpoint(room);
  }, CHECKPOINT_DEBOUNCE_MS);
}

async function checkpoint(room: Room): Promise<string | null> {
  if (!room.dirty) return null;
  room.dirty = false;
  const content = room.adapter.materialize(room.doc);
  const crdtState = bytesToBase64(Y.encodeStateAsUpdate(room.doc));
  const lastUpdated = await room.deps.save(content, crdtState);
  // [VIZSYNC-SRV] temporary diagnostic — remove after debugging viz-sync.
  console.log("[VIZSYNC-SRV] checkpoint", { room: room.key, saved: lastUpdated !== null });
  if (lastUpdated === null) {
    // Save failed — keep dirty so the next change (or finalize) retries.
    room.dirty = true;
  }
  return lastUpdated;
}

/** A client opens a document for (read-only or editing) collaboration. */
export async function subscribeDoc<T>(
  projectId: string,
  docId: string,
  conn: RoomConn,
  clientStateVectorB64: string,
  adapter: DocRoomAdapter<T>,
  deps: DocRoomDeps<T>,
): Promise<void> {
  const key = roomKey(projectId, adapter.docType, docId);
  let room = rooms.get(key);

  if (!room) {
    const loaded = await deps.load();
    // Another concurrent subscribe may have created the room during the await.
    room = rooms.get(key);
    if (!room) {
      if (!loaded) {
        conn.send(adapter.msgError(docId, adapter.notFoundMessage));
        return;
      }
      const doc = new Y.Doc();
      if (loaded.crdtState) {
        // Restore the exact prior Yjs doc (survives server restart cleanly).
        Y.applyUpdate(doc, base64ToBytes(loaded.crdtState));
      } else {
        // First-ever open (or stale CRDT state): seed from the content.
        adapter.seed(doc, loaded.content);
      }
      room = {
        key,
        docId,
        adapter,
        doc,
        conns: new Map(),
        deps,
        dirty: false,
        checkpointTimer: null,
      };
      rooms.set(key, room);
      attachDoc(room);
    }
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
  const sync = Y.encodeStateAsUpdate(room.doc, sv);
  const stateVector = Y.encodeStateVector(room.doc);
  conn.send(
    adapter.msgSync(docId, bytesToBase64(sync), bytesToBase64(stateVector)),
  );
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
  if (!room) return;
  let bytes: Uint8Array;
  try {
    bytes = base64ToBytes(updateB64);
  } catch {
    return;
  }
  // origin = conn so the doc's update handler skips echoing back to the sender.
  Y.applyUpdate(room.doc, bytes, conn);
  if (conn.identity) room.deps.onEdit?.(conn.identity);
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
  if (!room) return;
  for (const conn of room.conns.values()) {
    if (conn.connectionId === sender.connectionId) continue;
    conn.send(adapter.msgAwareness(docId, updateB64));
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
  if (!room) return;
  room.conns.delete(conn.connectionId);
  if (room.conns.size === 0) void finalizeRoom(room);
}

/** A connection (WebSocket) closed — drop it from every room it was in
 *  (both document types; the registry is shared). */
export function handleConnGone(connectionId: string): void {
  const keys = connRooms.get(connectionId);
  if (!keys) return;
  for (const key of keys) {
    const room = rooms.get(key);
    if (!room) continue;
    room.conns.delete(connectionId);
    if (room.conns.size === 0) void finalizeRoom(room);
  }
  connRooms.delete(connectionId);
}

async function finalizeRoom(room: Room): Promise<void> {
  if (room.checkpointTimer) {
    clearTimeout(room.checkpointTimer);
    room.checkpointTimer = null;
  }
  await checkpoint(room);
  // A client may have subscribed while the final checkpoint was in flight —
  // the room is still registered during the await, so it must stay alive for
  // them (destroying it would silently drop all their future updates).
  if (room.conns.size > 0) return;
  if (rooms.get(room.key) === room) rooms.delete(room.key);
  room.doc.destroy();
  room.deps.onEmpty?.();
}

/**
 * Route a non-collab document save (plain HTTP updates: AI edits, fallback
 * saves) through a live room, if one exists. The external change is applied
 * onto the authoritative doc — relaying it live to connected editors — and
 * checkpointed immediately so the caller gets read-your-write semantics.
 * Without this, a direct DB write would be silently clobbered by the room's
 * next checkpoint.
 *
 * `apply` performs the type-specific (possibly partial) sync onto the doc.
 * Returns the new last_updated when a room handled the save, or null when no
 * room is live (caller should write to the DB directly). `editor` attributes
 * the write to version history (the HTTP caller — AI edits, fallback saves);
 * omit it for writes that must NOT be tracked (restores version explicitly).
 */
export async function applyToLiveRoom(
  projectId: string,
  docType: string,
  docId: string,
  apply: (doc: Y.Doc) => void,
  editor?: VersionEditor,
): Promise<string | null> {
  const room = rooms.get(roomKey(projectId, docType, docId));
  if (!room) return null;
  // No origin conn: the update handler relays this to every connected client.
  room.doc.transact(() => apply(room.doc));
  if (editor) room.deps.onEdit?.(editor);
  if (room.checkpointTimer) {
    clearTimeout(room.checkpointTimer);
    room.checkpointTimer = null;
  }
  // Force the write even when the doc already matched the payload, so the
  // caller always gets a fresh last_updated for its response.
  room.dirty = true;
  return await checkpoint(room);
}
