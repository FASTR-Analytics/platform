// =============================================================================
// Slide collaboration rooms (server-authoritative Yjs relay) — Milestone 2
// =============================================================================
//
// For each slide being co-edited, the server holds the authoritative Y.Doc and
// a set of connected clients. It:
//   - seeds the doc from the persisted slide config on first open,
//   - syncs each joining client (sends what they're missing),
//   - relays every update to the other clients in the room,
//   - debounced-checkpoints the materialized slide back to storage so viewers,
//     exports and thumbnails see the result (and the work survives the room
//     being torn down when everyone leaves).
//
// DB access is injected (SlideRoomDeps) so this module is pure and testable;
// the WS route supplies real load/save closures (getSlide/updateSlide + SSE
// notify). CRDT-state persistence that survives a *server restart* with
// un-checkpointed edits is a later step (M2.2b); a restart currently re-seeds
// from the last checkpoint.

import * as Y from "yjs";
import {
  base64ToBytes,
  bytesToBase64,
  type CollabServerMessage,
  materializeSlide,
  seedSlideDoc,
  type Slide,
} from "lib";

const CHECKPOINT_DEBOUNCE_MS = 1500;

export type RoomConn = {
  connectionId: string;
  canEdit: boolean;
  send: (msg: CollabServerMessage) => void;
};

export type SlideRoomDeps = {
  /** Load the slide. `crdtState` is the base64 Yjs state to restore the doc
   *  from (present only when current); when null the room seeds from `slide`. */
  loadSlide: () => Promise<{ slide: Slide; crdtState: string | null } | null>;
  /** Persist the materialized slide config + Yjs state (collab is
   *  authoritative, so this overwrites) and fire SSE notifications. Returns
   *  whether the save succeeded. */
  saveSlide: (slide: Slide, crdtState: string) => Promise<boolean>;
};

type Room = {
  key: string;
  slideId: string;
  doc: Y.Doc;
  conns: Map<string, RoomConn>;
  deps: SlideRoomDeps;
  dirty: boolean;
  checkpointTimer: ReturnType<typeof setTimeout> | null;
};

const rooms = new Map<string, Room>();
const connRooms = new Map<string, Set<string>>(); // connectionId -> room keys

function roomKey(projectId: string, slideId: string): string {
  return `${projectId}::${slideId}`;
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
      conn.send({ type: "slide_update", data: { slideId: room.slideId, update: payload } });
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

async function checkpoint(room: Room): Promise<void> {
  if (!room.dirty) return;
  room.dirty = false;
  const slide = materializeSlide(room.doc);
  const crdtState = bytesToBase64(Y.encodeStateAsUpdate(room.doc));
  const ok = await room.deps.saveSlide(slide, crdtState);
  // [VIZSYNC-SRV] temporary diagnostic — remove after debugging viz-sync.
  console.log("[VIZSYNC-SRV] checkpoint", { slideId: room.slideId, saved: ok });
  if (!ok) {
    // Save failed — keep dirty so the next change (or finalize) retries.
    room.dirty = true;
  }
}

/** A client opens a slide for (read-only or editing) collaboration. */
export async function subscribeSlide(
  projectId: string,
  slideId: string,
  conn: RoomConn,
  clientStateVectorB64: string,
  deps: SlideRoomDeps,
): Promise<void> {
  const key = roomKey(projectId, slideId);
  let room = rooms.get(key);

  if (!room) {
    const loaded = await deps.loadSlide();
    // Another concurrent subscribe may have created the room during the await.
    room = rooms.get(key);
    if (!room) {
      if (!loaded) {
        conn.send({ type: "slide_error", data: { slideId, message: "Slide not found" } });
        return;
      }
      const doc = new Y.Doc();
      if (loaded.crdtState) {
        // Restore the exact prior Yjs doc (survives server restart cleanly).
        Y.applyUpdate(doc, base64ToBytes(loaded.crdtState));
      } else {
        // First-ever open (or stale CRDT state): seed from the slide config.
        seedSlideDoc(doc, loaded.slide);
      }
      room = {
        key,
        slideId,
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

  // Send the client whatever it is missing relative to its state vector.
  let sv: Uint8Array | undefined;
  if (clientStateVectorB64) {
    try {
      sv = base64ToBytes(clientStateVectorB64);
    } catch {
      sv = undefined;
    }
  }
  const sync = Y.encodeStateAsUpdate(room.doc, sv);
  conn.send({ type: "slide_sync", data: { slideId, update: bytesToBase64(sync) } });
}

/** Apply a client's update to the authoritative doc (which relays + checkpoints). */
export function applySlideUpdate(
  projectId: string,
  slideId: string,
  conn: RoomConn,
  updateB64: string,
): void {
  if (!conn.canEdit) {
    conn.send({ type: "slide_error", data: { slideId, message: "No edit permission" } });
    return;
  }
  const room = rooms.get(roomKey(projectId, slideId));
  if (!room) return;
  let bytes: Uint8Array;
  try {
    bytes = base64ToBytes(updateB64);
  } catch {
    return;
  }
  // origin = conn so the doc's update handler skips echoing back to the sender.
  Y.applyUpdate(room.doc, bytes, conn);
}

/** Relay a Yjs awareness (cursor/selection) update to the other room members.
 *  Awareness is ephemeral — not applied to the server doc and not persisted. */
export function relayAwareness(
  projectId: string,
  slideId: string,
  sender: RoomConn,
  updateB64: string,
): void {
  const room = rooms.get(roomKey(projectId, slideId));
  if (!room) return;
  for (const conn of room.conns.values()) {
    if (conn.connectionId === sender.connectionId) continue;
    conn.send({ type: "awareness", data: { slideId, update: updateB64 } });
  }
}

export function unsubscribeSlide(projectId: string, slideId: string, conn: RoomConn): void {
  const key = roomKey(projectId, slideId);
  const room = rooms.get(key);
  connRooms.get(conn.connectionId)?.delete(key);
  if (!room) return;
  room.conns.delete(conn.connectionId);
  if (room.conns.size === 0) void finalizeRoom(room);
}

/** A connection (WebSocket) closed — drop it from every room it was in. */
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
  room.doc.destroy();
  rooms.delete(room.key);
}
