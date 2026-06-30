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
  removeConnection,
  updateConnectionPresence,
} from "../../task_management/presence_registry.ts";
import {
  getSlide,
  getSlideCrdtState,
  saveSlideCheckpoint,
} from "../../db/project/slides.ts";
import { notifyLastUpdated } from "../../task_management/mod.ts";
import {
  applySlideUpdate,
  handleConnGone,
  type RoomConn,
  type SlideRoomDeps,
  subscribeSlide,
  unsubscribeSlide,
} from "../../collab/slide_rooms.ts";

type CollabAuth = {
  email: string;
  name: string;
  color: string;
  canEdit: boolean;
};

export const routesProjectCollab = new Hono<
  { Variables: { collabAuth: CollabAuth } }
>();

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

    if (!projectUser.can_view_slide_decks) {
      c.status(403);
      return c.json({ success: false, err: "No slide deck access" });
    }

    const name = `${globalUser.firstName} ${globalUser.lastName}`.trim() ||
      globalUser.email;
    c.set("collabAuth", {
      email: globalUser.email,
      name,
      color: presenceColorForKey(globalUser.email),
      canEdit: projectUser.can_configure_slide_decks,
    });
    await next();
  },
  upgradeWebSocket((c) => {
    const projectId = c.req.param("project_id");
    const auth = c.get("collabAuth") as CollabAuth;
    const connectionId = crypto.randomUUID();
    let roomConn: RoomConn | null = null;

    // DB-backed room dependencies for one slide. deckId is captured on load so
    // the checkpoint can also notify the deck (refreshes thumbnails / list).
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
          if (!res.success) return false;
          notifyLastUpdated(projectId, "slides", [slideId], res.data.lastUpdated);
          if (deckId) {
            notifyLastUpdated(projectId, "slide_decks", [deckId], res.data.lastUpdated);
          }
          return true;
        },
      };
    }

    return {
      onOpen: (_evt, ws) => {
        roomConn = {
          connectionId,
          canEdit: auth.canEdit,
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
            if (roomConn) {
              void subscribeSlide(
                projectId,
                msg.data.slideId,
                roomConn,
                msg.data.stateVector,
                depsForSlide(msg.data.slideId),
              );
            }
            break;
          case "slide_update":
            if (roomConn) {
              applySlideUpdate(projectId, msg.data.slideId, roomConn, msg.data.update);
            }
            break;
          case "slide_unsubscribe":
            if (roomConn) {
              unsubscribeSlide(projectId, msg.data.slideId, roomConn);
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
