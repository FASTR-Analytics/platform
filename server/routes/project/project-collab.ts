import { Hono } from "hono";
import { upgradeWebSocket } from "hono/deno";
import {
  type CollabClientMessage,
  type CollabServerMessage,
  createDevProjectUser,
  presenceColorForKey,
  type ProjectUser,
} from "lib";
import { getPgConnectionFromCacheOrNew } from "../../db/mod.ts";
import { _BYPASS_AUTH } from "../../exposed_env_vars.ts";
import { getGlobalUser, resolveProjectUserAccess } from "../../project_auth.ts";
import {
  addConnection,
  broadcastPresence,
  markConnectionEditing,
  removeConnection,
  updateConnectionPresence,
} from "../../task_management/presence_registry.ts";
import {
  getSlide,
  getSlideCrdtState,
  saveSlideCheckpoint,
} from "../../db/project/slides.ts";
import {
  getAllReports,
  getReportBodyAuthors,
  getReportCrdtState,
  getReportDetail,
  saveReportCheckpoint,
} from "../../db/project/reports.ts";
import {
  getAuthorRuns,
  stashPersistedAuthors,
} from "../../collab/authorship.ts";
import { notifyLastUpdated } from "../../task_management/mod.ts";
import { notifyProjectReportsUpdated } from "../../task_management/notify_project_v2.ts";
import {
  applySlideUpdate,
  handleConnGone,
  relayAwareness,
  type RoomConn,
  type SlideRoomDeps,
  subscribeSlide,
  unsubscribeSlide,
} from "../../collab/slide_rooms.ts";
import {
  applyReportUpdate,
  relayReportAwareness,
  type ReportRoomDeps,
  subscribeReport,
  unsubscribeReport,
} from "../../collab/report_rooms.ts";
import {
  applyPoUpdate,
  type PoRoomDeps,
  relayPoAwareness,
  subscribePo,
  unsubscribePo,
} from "../../collab/po_rooms.ts";
import {
  getAllPresentationObjectsForProject,
  getPresentationObjectConfigRow,
  getPresentationObjectCrdtState,
  savePresentationObjectCheckpoint,
} from "../../db/project/presentation_objects.ts";
import { notifyProjectVisualizationsUpdated } from "../../task_management/notify_project_v2.ts";
import {
  noteVersionRoomEmpty,
  recordVersionEdit,
} from "../../collab/version_capture.ts";
import { recordSlideEdited } from "../../collab/deck_session_ledger.ts";

type CollabAuth = {
  email: string;
  name: string;
  color: string;
  canViewSlides: boolean;
  canEditSlides: boolean;
  canViewReports: boolean;
  canEditReports: boolean;
  canViewViz: boolean;
  canEditViz: boolean;
};

export const routesProjectCollab = new Hono<
  { Variables: { collabAuth: CollabAuth } }
>();

// The reports-list re-broadcast (card previews derive from body) runs
// getAllReports — loading every report's body — and pushes the whole summary
// list to every SSE client. Far too heavy for the 1.5s checkpoint cadence, so
// it trails on a per-project debounce; the finalize checkpoint schedules one
// too, so the final state always broadcasts.
const REPORTS_REBROADCAST_DEBOUNCE_MS = 5000;
const reportsRebroadcastTimers = new Map<
  string,
  ReturnType<typeof setTimeout>
>();

function scheduleReportsListRebroadcast(projectId: string): void {
  if (reportsRebroadcastTimers.has(projectId)) return;
  reportsRebroadcastTimers.set(
    projectId,
    setTimeout(async () => {
      reportsRebroadcastTimers.delete(projectId);
      const projectDb = getPgConnectionFromCacheOrNew(projectId, "READ_ONLY");
      const res = await getAllReports(projectDb);
      if (res.success) notifyProjectReportsUpdated(projectId, res.data);
    }, REPORTS_REBROADCAST_DEBOUNCE_MS),
  );
}

// Same idea for the visualizations list (cards derive from config): trail the
// full-list rebroadcast on a per-project debounce rather than firing it on every
// 1.5s config checkpoint.
const VIZ_REBROADCAST_DEBOUNCE_MS = 5000;
const vizRebroadcastTimers = new Map<string, ReturnType<typeof setTimeout>>();

function scheduleVizListRebroadcast(projectId: string): void {
  if (vizRebroadcastTimers.has(projectId)) return;
  vizRebroadcastTimers.set(
    projectId,
    setTimeout(async () => {
      vizRebroadcastTimers.delete(projectId);
      const projectDb = getPgConnectionFromCacheOrNew(projectId, "READ_ONLY");
      const res = await getAllPresentationObjectsForProject(projectDb);
      if (res.success) notifyProjectVisualizationsUpdated(projectId, res.data);
    }, VIZ_REBROADCAST_DEBOUNCE_MS),
  );
}

/**
 * Per-project collaboration WebSocket.
 *
 * Milestone 1: presence only. Auth/authorization mirrors the SSE endpoint
 * (project-sse-v2.ts) — we resolve the same project-access gate BEFORE the
 * upgrade so the socket can never become an unauthenticated channel. Presence
 * requires `can_view_slide_decks`; edit-level ops (later milestones) will
 * additionally require `can_configure_slide_decks` and re-authorize per op.
 */
routesProjectCollab.get(
  "/project_collab/:project_id",
  async (c, next) => {
    const projectId = c.req.param("project_id");

    const globalUser = await getGlobalUser(c);
    if (globalUser === "NOT_AUTHENTICATED") {
      c.status(401);
      return c.json({
        success: false,
        err: "Authentication required",
        authError: true,
      });
    }

    let projectUser: ProjectUser;
    if (_BYPASS_AUTH) {
      projectUser = createDevProjectUser();
    } else {
      if (!globalUser.approved) {
        c.status(403);
        return c.json({ success: false, err: "User is not approved" });
      }
      const mainDb = getPgConnectionFromCacheOrNew("main", "READ_ONLY");
      try {
        const res = await resolveProjectUserAccess(globalUser, projectId, mainDb);
        projectUser = res.projectUser;
      } catch (error) {
        const message = error instanceof Error ? error.message : "";
        if (message === "SERVICE_UNAVAILABLE") {
          c.status(503);
          return c.json({
            success: false,
            err: "Service temporarily unavailable",
          });
        }
        c.status(403);
        return c.json({
          success: false,
          err: message.startsWith("Middleware error: ")
            ? message.replace("Middleware error: ", "")
            : "User does not have access to this project",
        });
      }
    }

    // The socket carries slide, report AND visualization collaboration; any of
    // those view permissions admits the connection, and each message family
    // re-checks its own view/edit permission per operation.
    if (
      !projectUser.can_view_slide_decks && !projectUser.can_view_reports &&
      !projectUser.can_view_visualizations
    ) {
      c.status(403);
      return c.json({
        success: false,
        err: "No slide deck, report or visualization access",
      });
    }

    const name = `${globalUser.firstName} ${globalUser.lastName}`.trim() ||
      globalUser.email;
    c.set("collabAuth", {
      email: globalUser.email,
      name,
      color: presenceColorForKey(globalUser.email),
      canViewSlides: projectUser.can_view_slide_decks,
      canEditSlides: projectUser.can_configure_slide_decks,
      canViewReports: projectUser.can_view_reports,
      canEditReports: projectUser.can_configure_reports,
      canViewViz: projectUser.can_view_visualizations,
      canEditViz: projectUser.can_configure_visualizations,
    });
    await next();
  },
  upgradeWebSocket((c) => {
    const projectId = c.req.param("project_id");
    const auth = c.get("collabAuth") as CollabAuth;
    const connectionId = crypto.randomUUID();
    // Two conns sharing one connectionId: the room registry keys by
    // connectionId, and each carries its own family's edit permission.
    let roomConn: RoomConn | null = null;
    let reportRoomConn: RoomConn | null = null;
    let poRoomConn: RoomConn | null = null;

    // DB-backed room dependencies for one slide. deckId is captured on load so
    // the checkpoint can also notify the deck (refreshes thumbnails / list) and
    // version capture can record against the DECK (whole-deck versions). The
    // capture hooks only fire after loadSlide succeeded, so deckId is set.
    function depsForSlide(slideId: string): SlideRoomDeps {
      const projectDb = getPgConnectionFromCacheOrNew(projectId, "READ_AND_WRITE");
      let deckId = "";
      return {
        loadSlide: async () => {
          const res = await getSlide(projectDb, slideId);
          if (!res.success) return null;
          deckId = res.data.deckId;
          const crdtRes = await getSlideCrdtState(projectDb, slideId);
          const crdtState = crdtRes.success ? crdtRes.data.state : null;
          return { slide: res.data.slide, crdtState };
        },
        saveSlide: async (slide, crdtState) => {
          // Collab is authoritative → checkpoint overwrites config + CRDT state.
          const res = await saveSlideCheckpoint(projectDb, slideId, slide, crdtState);
          if (!res.success) return null;
          notifyLastUpdated(projectId, "slides", [slideId], res.data.lastUpdated);
          if (deckId) {
            notifyLastUpdated(projectId, "slide_decks", [deckId], res.data.lastUpdated);
          }
          return res.data.lastUpdated;
        },
        onEdit: (editor) => {
          if (deckId) {
            recordVersionEdit(projectId, "deck", deckId, editor);
            recordSlideEdited(projectId, deckId, slideId, editor.email);
          }
        },
        onEmpty: () => {
          if (deckId) noteVersionRoomEmpty(projectId, "deck", deckId);
        },
      };
    }

    // DB-backed room dependencies for one report (see depsForSlide).
    function depsForReport(reportId: string): ReportRoomDeps {
      const projectDb = getPgConnectionFromCacheOrNew(projectId, "READ_AND_WRITE");
      return {
        load: async () => {
          const res = await getReportDetail(projectDb, reportId);
          if (!res.success) return null;
          const crdtRes = await getReportCrdtState(projectDb, reportId);
          const crdtState = crdtRes.success ? crdtRes.data.state : null;
          // Authorship ledger: hand the persisted runs to the room's observer
          // (consumed when the doc is created; only valid alongside a current
          // crdt_state — a re-seeded doc starts with unknown authorship).
          const authorsRes = await getReportBodyAuthors(projectDb, reportId);
          stashPersistedAuthors(
            projectId,
            reportId,
            crdtState !== null && authorsRes.success
              ? authorsRes.data.authors
              : null,
          );
          return {
            content: {
              body: res.data.body,
              figures: res.data.figures,
              images: res.data.images,
            },
            crdtState,
          };
        },
        save: async (content, crdtState) => {
          // Collab is authoritative → checkpoint overwrites content + CRDT state.
          const res = await saveReportCheckpoint(
            projectDb,
            reportId,
            content,
            crdtState,
            getAuthorRuns(projectId, reportId, content.body),
          );
          if (!res.success) return null;
          notifyLastUpdated(projectId, "reports", [reportId], res.data.lastUpdated);
          scheduleReportsListRebroadcast(projectId);
          return res.data.lastUpdated;
        },
        onEdit: (editor) => recordVersionEdit(projectId, "report", reportId, editor),
        onEmpty: () => noteVersionRoomEmpty(projectId, "report", reportId),
      };
    }

    // DB-backed room dependencies for one visualization. No version/authorship
    // hooks (POs are not versioned), so onEdit/onEmpty are omitted.
    function depsForPo(poId: string): PoRoomDeps {
      const projectDb = getPgConnectionFromCacheOrNew(projectId, "READ_AND_WRITE");
      return {
        load: async () => {
          const res = await getPresentationObjectConfigRow(projectDb, poId);
          // Absent row OR a read-only default visualization → no room.
          if (!res.success || res.data === null || res.data.isDefault) return null;
          const crdtRes = await getPresentationObjectCrdtState(projectDb, poId);
          const crdtState = crdtRes.success ? crdtRes.data.state : null;
          return { content: res.data.config, crdtState };
        },
        save: async (config, crdtState) => {
          // Collab is authoritative → checkpoint overwrites config + CRDT state.
          const res = await savePresentationObjectCheckpoint(
            projectDb,
            poId,
            config,
            crdtState,
          );
          if (!res.success) return null;
          notifyLastUpdated(
            projectId,
            "presentation_objects",
            [poId],
            res.data.lastUpdated,
          );
          scheduleVizListRebroadcast(projectId);
          return res.data.lastUpdated;
        },
      };
    }

    return {
      onOpen: (_evt, ws) => {
        roomConn = {
          connectionId,
          canEdit: auth.canEditSlides,
          identity: { email: auth.email, name: auth.name },
          send: (msg: CollabServerMessage) => ws.send(JSON.stringify(msg)),
        };
        reportRoomConn = {
          connectionId,
          canEdit: auth.canEditReports,
          identity: { email: auth.email, name: auth.name },
          send: (msg: CollabServerMessage) => ws.send(JSON.stringify(msg)),
        };
        poRoomConn = {
          connectionId,
          canEdit: auth.canEditViz,
          identity: { email: auth.email, name: auth.name },
          send: (msg: CollabServerMessage) => ws.send(JSON.stringify(msg)),
        };
        addConnection(projectId, connectionId, auth, ws);
        const hello: CollabServerMessage = {
          type: "hello",
          data: { connectionId },
        };
        ws.send(JSON.stringify(hello));
        broadcastPresence(projectId);
      },
      onMessage: (evt) => {
        if (typeof evt.data !== "string") return;
        let msg: CollabClientMessage;
        try {
          msg = JSON.parse(evt.data);
        } catch {
          return;
        }
        switch (msg.type) {
          case "presence_update":
            updateConnectionPresence(projectId, connectionId, msg.data);
            broadcastPresence(projectId);
            break;
          case "slide_subscribe":
            if (roomConn && auth.canViewSlides) {
              void subscribeSlide(
                projectId,
                msg.data.slideId,
                roomConn,
                msg.data.stateVector,
                depsForSlide(msg.data.slideId),
              );
            } else if (roomConn) {
              roomConn.send({
                type: "slide_error",
                data: { slideId: msg.data.slideId, message: "No slide deck access" },
              });
            }
            break;
          case "slide_update":
            if (roomConn && auth.canViewSlides) {
              applySlideUpdate(projectId, msg.data.slideId, roomConn, msg.data.update);
              // "Editing now" presence pulse. canEdit-gated so a read-only
              // client's (room-rejected) update never counts as editing.
              if (auth.canEditSlides) markConnectionEditing(projectId, connectionId);
            }
            break;
          case "slide_unsubscribe":
            if (roomConn && auth.canViewSlides) {
              unsubscribeSlide(projectId, msg.data.slideId, roomConn);
            }
            break;
          case "awareness_update":
            if (roomConn && auth.canViewSlides) {
              relayAwareness(projectId, msg.data.slideId, roomConn, msg.data.update);
            }
            break;
          case "report_subscribe":
            if (reportRoomConn && auth.canViewReports) {
              void subscribeReport(
                projectId,
                msg.data.reportId,
                reportRoomConn,
                msg.data.stateVector,
                depsForReport(msg.data.reportId),
              );
            } else if (reportRoomConn) {
              reportRoomConn.send({
                type: "report_error",
                data: { reportId: msg.data.reportId, message: "No report access" },
              });
            }
            break;
          case "report_update":
            if (reportRoomConn && auth.canViewReports) {
              applyReportUpdate(projectId, msg.data.reportId, reportRoomConn, msg.data.update);
              if (auth.canEditReports) markConnectionEditing(projectId, connectionId);
            }
            break;
          case "report_unsubscribe":
            if (reportRoomConn && auth.canViewReports) {
              unsubscribeReport(projectId, msg.data.reportId, reportRoomConn);
            }
            break;
          case "report_awareness_update":
            if (reportRoomConn && auth.canViewReports) {
              relayReportAwareness(projectId, msg.data.reportId, reportRoomConn, msg.data.update);
            }
            break;
          case "po_subscribe":
            if (poRoomConn && auth.canViewViz) {
              void subscribePo(
                projectId,
                msg.data.poId,
                poRoomConn,
                msg.data.stateVector,
                depsForPo(msg.data.poId),
              );
            } else if (poRoomConn) {
              poRoomConn.send({
                type: "po_error",
                data: { poId: msg.data.poId, message: "No visualization access" },
              });
            }
            break;
          case "po_update":
            if (poRoomConn && auth.canViewViz) {
              applyPoUpdate(projectId, msg.data.poId, poRoomConn, msg.data.update);
              if (auth.canEditViz) markConnectionEditing(projectId, connectionId);
            }
            break;
          case "po_unsubscribe":
            if (poRoomConn && auth.canViewViz) {
              unsubscribePo(projectId, msg.data.poId, poRoomConn);
            }
            break;
          case "po_awareness_update":
            if (poRoomConn && auth.canViewViz) {
              relayPoAwareness(projectId, msg.data.poId, poRoomConn, msg.data.update);
            }
            break;
        }
      },
      onClose: () => {
        removeConnection(projectId, connectionId);
        broadcastPresence(projectId);
        handleConnGone(connectionId);
      },
      onError: () => {
        removeConnection(projectId, connectionId);
        broadcastPresence(projectId);
        handleConnGone(connectionId);
      },
    };
  }),
);
