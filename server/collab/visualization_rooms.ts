// =============================================================================
// Visualization collaboration rooms: thin binding over the generic doc_rooms core
// =============================================================================
//
// See doc_rooms.ts for the shared mechanics and report_rooms.ts for the
// closest twin. This module supplies the visualization adapter
// (VisualizationDocContent <-> Y.Doc bridge + visualization_* wire messages).
// A visualization IS its product, so the owning product id every entry point
// takes first equals the visualization id; both ride so the families share
// one shape.
//
// Unlike reports, a visualization room has NO authorship ledger: a version
// names the session's editors but not who changed what, so the adapter omits
// onDocCreated/onDocClosed. The deps' onEdit/onEmpty feed the version
// tracker as a report room's do.

import {
  dropStorageInvalidTransientsInFigureBlock,
  type FigureBundle,
  figureBundleSchema,
  materializeVisualization,
  seedVisualizationDoc,
  storedMatchesDoc,
  syncVisualizationToDoc,
  type VersionEditor,
  type VisualizationDocContent,
} from "lib";
import {
  applyDocUpdate,
  applyToLiveRoom,
  closeRoomsForDoc,
  type DocRoomAdapter,
  type DocRoomDeps,
  flushRoomForDoc,
  type LiveRoomApplyResult,
  relayDocAwareness,
  type RoomConn,
  subscribeDoc,
  unsubscribeDoc,
} from "./doc_rooms.ts";

const DOC_TYPE = "visualization";

const visualizationAdapter: DocRoomAdapter<VisualizationDocContent> = {
  docType: DOC_TYPE,
  notFoundMessage: "Visualization not found",
  seed: seedVisualizationDoc,
  materialize: materializeVisualization,
  msgSync: (visualizationId, update, stateVector, epoch) => ({
    type: "visualization_sync",
    data: { visualizationId, update, stateVector, epoch },
  }),
  msgUpdate: (visualizationId, update) => ({
    type: "visualization_update",
    data: { visualizationId, update },
  }),
  msgError: (visualizationId, message, fatal) => ({
    type: "visualization_error",
    data: { visualizationId, message, fatal },
  }),
  msgAwareness: (visualizationId, update) => ({
    type: "visualization_awareness",
    data: { visualizationId, update },
  }),
};

export type VisualizationRoomDeps = DocRoomDeps<VisualizationDocContent>;

/** What a checkpoint stores for the doc's bundle. The figure editor streams a
 *  mid-edit config straight into this doc, and a filter chip with every value
 *  un-ticked is legal mid-edit but fails the strict parse, which would wedge
 *  the checkpoint permanently: the stored copy drops those transients first.
 *  `trusted` = the doc materializes to exactly what is stored, so the CRDT
 *  state may be stamped current; a parse failure is permanent for this doc
 *  state (DocSaveResult). */
export function prepareVisualizationCheckpoint(
  bundle: FigureBundle,
): { stored: FigureBundle; trusted: boolean } | { permanent: true } {
  let stored: FigureBundle;
  try {
    const block = dropStorageInvalidTransientsInFigureBlock({
      type: "figure",
      bundle,
    });
    stored = figureBundleSchema.parse(block.bundle);
  } catch {
    return { permanent: true };
  }
  return { stored, trusted: storedMatchesDoc(stored, bundle) };
}

/** A client opens a visualization for (read-only or editing) collaboration. */
export function subscribeVisualization(
  productId: string,
  visualizationId: string,
  conn: RoomConn,
  clientStateVectorB64: string,
  deps: VisualizationRoomDeps,
): Promise<void> {
  return subscribeDoc(
    productId,
    visualizationId,
    conn,
    clientStateVectorB64,
    visualizationAdapter,
    deps,
  );
}

/** Apply a client's update to the authoritative doc (which relays + checkpoints). */
export function applyVisualizationUpdate(
  productId: string,
  visualizationId: string,
  conn: RoomConn,
  updateB64: string,
): void {
  applyDocUpdate(
    productId,
    visualizationId,
    conn,
    updateB64,
    visualizationAdapter,
  );
}

/** Relay a Yjs awareness (caption caret) update to the other room members. */
export function relayVisualizationAwareness(
  productId: string,
  visualizationId: string,
  sender: RoomConn,
  updateB64: string,
): void {
  relayDocAwareness(
    productId,
    visualizationId,
    sender,
    updateB64,
    visualizationAdapter,
  );
}

export function unsubscribeVisualization(
  productId: string,
  visualizationId: string,
  conn: RoomConn,
): void {
  unsubscribeDoc(productId, DOC_TYPE, visualizationId, conn);
}

/** Persist a visualization room's un-checkpointed edits now (no-op when
 *  none). False ⇒ the checkpoint failed and the DB row is NOT current. */
export function flushVisualizationRoom(
  productId: string,
  visualizationId: string,
): Promise<boolean> {
  return flushRoomForDoc(productId, DOC_TYPE, visualizationId);
}

/** Discard a visualization's live room without checkpointing: call when the
 *  row is deleted (see closeRoomsForDoc in doc_rooms.ts). */
export function closeVisualizationRoom(
  productId: string,
  visualizationId: string,
  message: string,
): void {
  closeRoomsForDoc(productId, DOC_TYPE, visualizationId, message);
}

/** Route a non-collab bundle save (the update HTTP route) through a live
 *  room, if one exists. `editor` attributes the write to version history;
 *  a restore omits it. See LiveRoomApplyResult: on `save_failed` the caller
 *  must NOT fall back to a direct DB write. */
export function applyVisualizationToLiveRoom(
  productId: string,
  visualizationId: string,
  content: VisualizationDocContent,
  editor?: VersionEditor,
): Promise<LiveRoomApplyResult> {
  return applyToLiveRoom(
    productId,
    DOC_TYPE,
    visualizationId,
    (doc) => syncVisualizationToDoc(doc, content),
    editor,
  );
}
