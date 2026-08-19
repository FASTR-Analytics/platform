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
  applyBodyDelta,
  type BodyDeltaOp,
  dropLedger,
  initLedger,
} from "./authorship.ts";
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
  msgError: (reportId, message, fatal) => ({
    type: "report_error",
    data: { reportId, message, fatal },
  }),
  msgAwareness: (reportId, update) => ({
    type: "report_awareness",
    data: { reportId, update },
  }),
  // Per-character authorship: Y.Text deltas are exact retain/insert/delete
  // ops; the transaction origin tells us WHO (a RoomConn's identity for collab
  // edits, the versionEditor tag applyToLiveRoom sets for HTTP-routed writes,
  // nothing for restores).
  onDocCreated: (reportId, doc) => {
    const text = findReportBodyText(doc);
    initLedger(reportId, text.toString());
    text.observe((event, transaction) => {
      const origin = transaction.origin as
        | { identity?: VersionEditor; versionEditor?: VersionEditor }
        | null
        | undefined;
      const email = origin?.identity?.email ?? origin?.versionEditor?.email ??
        null;
      const ops: BodyDeltaOp[] = [];
      for (const d of event.delta) {
        if (d.retain !== undefined) {
          ops.push({ retain: d.retain });
        } else if (typeof d.insert === "string") {
          ops.push({ insert: d.insert });
        } else if (d.insert !== undefined) {
          ops.push({ insert: " " }); // embed = length 1
        } else if (d.delete !== undefined) {
          ops.push({ delete: d.delete });
        }
      }
      applyBodyDelta(reportId, ops, email);
    });
  },
  onDocClosed: (reportId) => dropLedger(reportId),
};

export type ReportRoomDeps = DocRoomDeps<ReportDocContent>;

/** A client opens a report for (read-only or editing) collaboration. */
export function subscribeReport(
  reportId: string,
  conn: RoomConn,
  clientStateVectorB64: string,
  deps: ReportRoomDeps,
): Promise<void> {
  return subscribeDoc(
    reportId,
    conn,
    clientStateVectorB64,
    reportAdapter,
    deps,
  );
}

/** Apply a client's update to the authoritative doc (which relays + checkpoints). */
export function applyReportUpdate(
  reportId: string,
  conn: RoomConn,
  updateB64: string,
): void {
  applyDocUpdate(reportId, conn, updateB64, reportAdapter);
}

/** Relay a Yjs awareness (cursor/selection) update to the other room members. */
export function relayReportAwareness(
  reportId: string,
  sender: RoomConn,
  updateB64: string,
): void {
  relayDocAwareness(reportId, sender, updateB64, reportAdapter);
}

export function unsubscribeReport(reportId: string, conn: RoomConn): void {
  unsubscribeDoc(DOC_TYPE, reportId, conn);
}

/** Persist a report room's un-checkpointed edits now (no-op when none).
 *  False ⇒ the checkpoint failed and the DB row is NOT current (see
 *  flushRoomForDoc). */
export function flushReportRoom(reportId: string): Promise<boolean> {
  return flushRoomForDoc(DOC_TYPE, reportId);
}

/** Discard a report's live room without checkpointing — call when the report
 *  row is deleted (see closeRoomsForDoc in doc_rooms.ts). */
export function closeReportRoom(reportId: string, message: string): void {
  closeRoomsForDoc(DOC_TYPE, reportId, message);
}

/** Route a non-collab report save (the body/figures/images HTTP routes)
 *  through a live room, if one exists. Only the provided fields are synced
 *  onto the doc; the checkpoint persists the whole document. See
 *  LiveRoomApplyResult — on `save_failed` the caller must NOT fall back to a
 *  direct DB write. `editor` attributes the write to version history; omit
 *  for restores (they version themselves explicitly). */
export function applyReportToLiveRoom(
  reportId: string,
  partial: Partial<ReportDocContent>,
  editor?: VersionEditor,
): Promise<LiveRoomApplyResult> {
  return applyToLiveRoom(
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
