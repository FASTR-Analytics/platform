// =============================================================================
// Slide collaboration rooms — thin binding over the generic doc_rooms core
// =============================================================================
//
// All room mechanics (seed/restore, state-vector sync, relay, debounced
// checkpoints, teardown, external-write chokepoint) live in doc_rooms.ts and
// are shared with report_rooms.ts. This module only supplies the slide adapter
// (Slide <-> Y.Doc bridge + slide_* wire messages) and keeps the original
// export names so the WS route and updateSlide route are unchanged.

import {
  materializeSlide,
  observeSlideDocElements,
  seedSlideDoc,
  type Slide,
  syncSlideToDoc,
  type VersionEditor,
} from "lib";
import { recordSlideElementTouch } from "./deck_session_ledger.ts";
import {
  applyDocUpdate,
  applyToLiveRoom,
  closeRoomsForDoc,
  type DocRoomAdapter,
  type DocRoomDeps,
  flushRoomForDoc,
  relayDocAwareness,
  type RoomConn,
  subscribeDoc,
  unsubscribeDoc,
} from "./doc_rooms.ts";

export { handleConnGone, type RoomConn } from "./doc_rooms.ts";

const DOC_TYPE = "slide";

const slideAdapter: DocRoomAdapter<Slide> = {
  docType: DOC_TYPE,
  notFoundMessage: "Slide not found",
  seed: seedSlideDoc,
  materialize: materializeSlide,
  msgSync: (slideId, update, stateVector) => ({
    type: "slide_sync",
    data: { slideId, update, stateVector },
  }),
  msgUpdate: (slideId, update) => ({
    type: "slide_update",
    data: { slideId, update },
  }),
  msgError: (slideId, message) => ({
    type: "slide_error",
    data: { slideId, message },
  }),
  msgAwareness: (slideId, update) => ({
    type: "awareness",
    data: { slideId, update },
  }),
  // Element-level attribution for version history: which title field / block
  // each transaction touched, attributed via the transaction origin (RoomConn
  // identity for collab edits, applyToLiveRoom's versionEditor tag for
  // HTTP-routed writes; restores carry neither and are not recorded). Ops are
  // classified (added / structurally removed / text deleted) so the version
  // diff can attribute deletions exactly instead of to every element editor.
  onDocCreated: (projectId, slideId, doc) => {
    observeSlideDocElements(doc, (touches, origin) => {
      const o = origin as
        | { identity?: VersionEditor; versionEditor?: VersionEditor }
        | null
        | undefined;
      const email = o?.identity?.email ?? o?.versionEditor?.email ?? null;
      if (email === null) return;
      for (const elementKey of touches.touched) {
        recordSlideElementTouch(projectId, slideId, elementKey, email);
      }
      for (const elementKey of touches.added) {
        recordSlideElementTouch(projectId, slideId, elementKey, email, "added");
      }
      for (const elementKey of touches.removed) {
        recordSlideElementTouch(
          projectId,
          slideId,
          elementKey,
          email,
          "removed",
        );
      }
      for (const elementKey of touches.textDeleted) {
        recordSlideElementTouch(
          projectId,
          slideId,
          elementKey,
          email,
          "textDeleted",
        );
      }
    });
  },
};

export type SlideRoomDeps = {
  /** Load the slide. `crdtState` is the base64 Yjs state to restore the doc
   *  from (present only when current); when null the room seeds from `slide`. */
  loadSlide: () => Promise<{ slide: Slide; crdtState: string | null } | null>;
  /** Persist the materialized slide config + Yjs state (collab is
   *  authoritative, so this overwrites) and fire SSE notifications. Returns
   *  the new last_updated, or null when the save failed. */
  saveSlide: (slide: Slide, crdtState: string) => Promise<string | null>;
  /** Version-history capture (see DocRoomDeps). */
  onEdit?: (editor: VersionEditor) => void;
  onEmpty?: () => void;
};

function toDocDeps(deps: SlideRoomDeps): DocRoomDeps<Slide> {
  return {
    load: async () => {
      const r = await deps.loadSlide();
      return r ? { content: r.slide, crdtState: r.crdtState } : null;
    },
    save: deps.saveSlide,
    onEdit: deps.onEdit,
    onEmpty: deps.onEmpty,
  };
}

/** A client opens a slide for (read-only or editing) collaboration. */
export function subscribeSlide(
  projectId: string,
  slideId: string,
  conn: RoomConn,
  clientStateVectorB64: string,
  deps: SlideRoomDeps,
): Promise<void> {
  return subscribeDoc(
    projectId,
    slideId,
    conn,
    clientStateVectorB64,
    slideAdapter,
    toDocDeps(deps),
  );
}

/** Apply a client's update to the authoritative doc (which relays + checkpoints). */
export function applySlideUpdate(
  projectId: string,
  slideId: string,
  conn: RoomConn,
  updateB64: string,
): void {
  applyDocUpdate(projectId, slideId, conn, updateB64, slideAdapter);
}

/** Relay a Yjs awareness (cursor/selection) update to the other room members. */
export function relayAwareness(
  projectId: string,
  slideId: string,
  sender: RoomConn,
  updateB64: string,
): void {
  relayDocAwareness(projectId, slideId, sender, updateB64, slideAdapter);
}

export function unsubscribeSlide(
  projectId: string,
  slideId: string,
  conn: RoomConn,
): void {
  unsubscribeDoc(projectId, DOC_TYPE, slideId, conn);
}

/** Persist a slide room's un-checkpointed edits now (no-op when none). */
export function flushSlideRoom(
  projectId: string,
  slideId: string,
): Promise<void> {
  return flushRoomForDoc(projectId, DOC_TYPE, slideId);
}

/** Discard a slide's live room without checkpointing — call when the slide
 *  row is deleted or replaced (see closeRoomsForDoc in doc_rooms.ts). */
export function closeSlideRoom(
  projectId: string,
  slideId: string,
  message: string,
): void {
  closeRoomsForDoc(projectId, DOC_TYPE, slideId, message);
}

/** Route a non-collab slide save through a live room, if one exists (see
 *  applyToLiveRoom in doc_rooms.ts). `editor` attributes the write to version
 *  history; omit for restores (they version themselves explicitly). */
export function applySlideToLiveRoom(
  projectId: string,
  slideId: string,
  slide: Slide,
  editor?: VersionEditor,
): Promise<string | null> {
  return applyToLiveRoom(
    projectId,
    DOC_TYPE,
    slideId,
    (doc) => syncSlideToDoc(doc, slide),
    editor,
  );
}
