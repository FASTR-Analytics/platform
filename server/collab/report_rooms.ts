// =============================================================================
// Report collaboration rooms — thin binding over the generic doc_rooms core
// =============================================================================
//
// See doc_rooms.ts for the shared mechanics and slide_rooms.ts for the slide
// twin. This module supplies the report adapter (ReportDocContent <-> Y.Doc
// bridge + report_* wire messages).

import {
  findReportBodyText,
  materializeReport,
  type ReportDocContent,
  seedReportDoc,
  syncReportRegistries,
  syncText,
  type VersionEditor,
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

const DOC_TYPE = "report";

const reportAdapter: DocRoomAdapter<ReportDocContent> = {
  docType: DOC_TYPE,
  notFoundMessage: "Report not found",
  seed: seedReportDoc,
  materialize: materializeReport,
  msgSync: (reportId, update, stateVector) => ({
    type: "report_sync",
    data: { reportId, update, stateVector },
  }),
  msgUpdate: (reportId, update) => ({
    type: "report_update",
    data: { reportId, update },
  }),
  msgError: (reportId, message) => ({
    type: "report_error",
    data: { reportId, message },
  }),
  msgAwareness: (reportId, update) => ({
    type: "report_awareness",
    data: { reportId, update },
  }),
};

export type ReportRoomDeps = DocRoomDeps<ReportDocContent>;

/** A client opens a report for (read-only or editing) collaboration. */
export function subscribeReport(
  projectId: string,
  reportId: string,
  conn: RoomConn,
  clientStateVectorB64: string,
  deps: ReportRoomDeps,
): Promise<void> {
  return subscribeDoc(
    projectId,
    reportId,
    conn,
    clientStateVectorB64,
    reportAdapter,
    deps,
  );
}

/** Apply a client's update to the authoritative doc (which relays + checkpoints). */
export function applyReportUpdate(
  projectId: string,
  reportId: string,
  conn: RoomConn,
  updateB64: string,
): void {
  applyDocUpdate(projectId, reportId, conn, updateB64, reportAdapter);
}

/** Relay a Yjs awareness (cursor/selection) update to the other room members. */
export function relayReportAwareness(
  projectId: string,
  reportId: string,
  sender: RoomConn,
  updateB64: string,
): void {
  relayDocAwareness(projectId, reportId, sender, updateB64, reportAdapter);
}

export function unsubscribeReport(
  projectId: string,
  reportId: string,
  conn: RoomConn,
): void {
  unsubscribeDoc(projectId, DOC_TYPE, reportId, conn);
}

/** Discard a report's live room without checkpointing — call when the report
 *  row is deleted (see closeRoomsForDoc in doc_rooms.ts). */
export function closeReportRoom(
  projectId: string,
  reportId: string,
  message: string,
): void {
  closeRoomsForDoc(projectId, DOC_TYPE, reportId, message);
}

/** Route a non-collab report save (the body/figures/images HTTP routes)
 *  through a live room, if one exists. Only the provided fields are synced
 *  onto the doc; the checkpoint persists the whole document. Returns the new
 *  last_updated, or null when no room is live (caller writes the DB directly).
 *  `editor` attributes the write to version history; omit for restores (they
 *  version themselves explicitly). */
export function applyReportToLiveRoom(
  projectId: string,
  reportId: string,
  partial: Partial<ReportDocContent>,
  editor?: VersionEditor,
): Promise<string | null> {
  return applyToLiveRoom(
    projectId,
    DOC_TYPE,
    reportId,
    (doc) => {
      if (partial.body !== undefined) {
        syncText(findReportBodyText(doc), partial.body);
      }
      if (partial.figures !== undefined || partial.images !== undefined) {
        syncReportRegistries(doc, partial.figures, partial.images);
      }
    },
    editor,
  );
}
