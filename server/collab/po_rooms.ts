// =============================================================================
// Visualization (presentation object) collaboration rooms — thin binding
// =============================================================================
//
// See doc_rooms.ts for the shared mechanics and report_rooms.ts / slide_rooms.ts
// for the twins. This module supplies the presentation-object adapter (a
// PresentationObjectConfig <-> Y.Doc bridge over the shared figure-config CRDT,
// plus po_* wire messages).
//
// Unlike slides/reports, a PO room has NO authorship ledger and NO version
// tracking — visualizations are not versioned (see DOC_VERSION_HISTORY.md) — so
// the adapter omits onDocCreated/onDocClosed and the deps omit onEdit/onEmpty.

import * as Y from "yjs";
import {
  materializeFigureConfig,
  PO_CONFIG_MAP_KEY,
  type PresentationObjectConfig,
  seedFigureConfigMap,
} from "lib";
import {
  applyDocUpdate,
  applyToLiveRoom,
  closeRoomsForDoc,
  type DocRoomAdapter,
  type DocRoomDeps,
  relayDocAwareness,
  type RoomConn,
  subscribeDoc,
  unsubscribeDoc,
} from "./doc_rooms.ts";

const DOC_TYPE = "po";
const CONFIG_KEY = PO_CONFIG_MAP_KEY;

const poAdapter: DocRoomAdapter<PresentationObjectConfig> = {
  docType: DOC_TYPE,
  notFoundMessage: "Visualization not found",
  seed: (doc, config) => seedFigureConfigMap(doc.getMap<unknown>(CONFIG_KEY), config),
  materialize: (doc) => materializeFigureConfig(doc.getMap<unknown>(CONFIG_KEY)),
  msgSync: (poId, update, stateVector) => ({
    type: "po_sync",
    data: { poId, update, stateVector },
  }),
  msgUpdate: (poId, update) => ({
    type: "po_update",
    data: { poId, update },
  }),
  msgError: (poId, message, fatal) => ({
    type: "po_error",
    data: { poId, message, fatal },
  }),
  msgAwareness: (poId, update) => ({
    type: "po_awareness",
    data: { poId, update },
  }),
};

export type PoRoomDeps = DocRoomDeps<PresentationObjectConfig>;

/** A client opens a visualization for (read-only or editing) collaboration. */
export function subscribePo(
  projectId: string,
  poId: string,
  conn: RoomConn,
  clientStateVectorB64: string,
  deps: PoRoomDeps,
): Promise<void> {
  return subscribeDoc(projectId, poId, conn, clientStateVectorB64, poAdapter, deps);
}

/** Apply a client's update to the authoritative doc (which relays + checkpoints). */
export function applyPoUpdate(
  projectId: string,
  poId: string,
  conn: RoomConn,
  updateB64: string,
): void {
  applyDocUpdate(projectId, poId, conn, updateB64, poAdapter);
}

/** Relay a Yjs awareness (cursor/selection) update to the other room members. */
export function relayPoAwareness(
  projectId: string,
  poId: string,
  sender: RoomConn,
  updateB64: string,
): void {
  relayDocAwareness(projectId, poId, sender, updateB64, poAdapter);
}

export function unsubscribePo(
  projectId: string,
  poId: string,
  conn: RoomConn,
): void {
  unsubscribeDoc(projectId, DOC_TYPE, poId, conn);
}

/** Discard a visualization's live room without checkpointing — call when the
 *  PO row is deleted (see closeRoomsForDoc in doc_rooms.ts). */
export function closePoRoom(
  projectId: string,
  poId: string,
  message: string,
): void {
  closeRoomsForDoc(projectId, DOC_TYPE, poId, message);
}

/** Route a non-collab visualization config write through a live room, if one
 *  exists. `apply` receives the config map (the shared figure-config bridge
 *  target). Returns the new last_updated, or null when no room is live (caller
 *  writes the DB directly). No editor/attribution — POs are not versioned. */
export function applyPoToLiveRoom(
  projectId: string,
  poId: string,
  apply: (configMap: Y.Map<unknown>) => void,
): Promise<string | null> {
  return applyToLiveRoom(
    projectId,
    DOC_TYPE,
    poId,
    (doc) => apply(doc.getMap<unknown>(CONFIG_KEY)),
  );
}
