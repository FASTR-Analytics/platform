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

type CollabAuth = { email: string; name: string; color: string };

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
    });
    await next();
  },
  upgradeWebSocket((c) => {
    const projectId = c.req.param("project_id");
    const auth = c.get("collabAuth") as CollabAuth;
    const connectionId = crypto.randomUUID();
    return {
      onOpen: (_evt, ws) => {
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
        if (msg.type === "presence_update") {
          updateConnectionPresence(projectId, connectionId, msg.data);
          broadcastPresence(projectId);
        }
      },
      onClose: () => {
        removeConnection(projectId, connectionId);
        broadcastPresence(projectId);
      },
      onError: () => {
        removeConnection(projectId, connectionId);
        broadcastPresence(projectId);
      },
    };
  }),
);
