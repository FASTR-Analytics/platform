import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { createDevProjectUser, ProjectSseMessage, ProjectUser } from "lib";
import { getPgConnectionFromCacheOrNew } from "../../db/mod.ts";
import { _BYPASS_AUTH } from "../../exposed_env_vars.ts";
import { ProjectPk } from "../../server_only_types/mod.ts";
import { buildProjectState } from "../../task_management/build_project_state.ts";
import {
  getGlobalUser,
  resolveProjectUserAccess,
} from "../../project_auth.ts";

export const routesProjectSSEV2 = new Hono();

type QueuedMessage = ProjectSseMessage & { projectId: string };

/**
 * V2 Project SSE endpoint.
 *
 * Key difference from v1: subscribe-before-build ordering prevents the race
 * condition where messages broadcast during buildProjectState() are dropped.
 *
 * Order:
 * 1. Authenticate + authorize — hard-deny unauthenticated clients (no
 *    open-access exception) and apply the canonical project-access check
 *    (resolveProjectUserAccess — same gate as the route middleware)
 * 2. Subscribe to BroadcastChannel (queue messages)
 * 3. Build full ProjectState from DB
 * 4. Send `starting` with full state
 * 5. Drain queued messages
 * 6. Forward subsequent messages
 */
routesProjectSSEV2.get("/project_sse_v2/:project_id", async (c) => {
  const projectId = c.req.param("project_id");

  const globalUser = await getGlobalUser(c);
  if (globalUser === "NOT_AUTHENTICATED") {
    c.status(401);
    return c.json({ success: false, err: "Authentication required", authError: true });
  }

  const mainDb = getPgConnectionFromCacheOrNew("main", "READ_ONLY");

  let projectUser: ProjectUser;
  if (_BYPASS_AUTH) {
    projectUser = createDevProjectUser();
  } else {
    if (!globalUser.approved) {
      c.status(403);
      return c.json({ success: false, err: "User is not approved" });
    }
    try {
      const res = await resolveProjectUserAccess(globalUser, projectId, mainDb);
      projectUser = res.projectUser;
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      if (message === "SERVICE_UNAVAILABLE") {
        c.status(503);
        return c.json({ success: false, err: "Service temporarily unavailable" });
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

  // projectDb only after the permission checks pass (no connection-cache
  // entries keyed by unauthorized project ids)
  const projectDb = getPgConnectionFromCacheOrNew(projectId, "READ_ONLY");
  const ppk: ProjectPk = {
    projectDb,
    projectId,
  };

  return streamSSE(c, async (stream) => {
    // Step 1: Subscribe BEFORE building state (prevents race condition)
    const messageQueue: QueuedMessage[] = [];
    let notifyNewMessage: (() => void) | null = null;

    const broadcastReceiver = new BroadcastChannel("project_updates_v2");

    const messageHandler = (evt: MessageEvent<QueuedMessage>) => {
      if (evt.data.projectId !== projectId) return;
      messageQueue.push(evt.data);
      notifyNewMessage?.();
    };

    broadcastReceiver.addEventListener("message", messageHandler);

    // A write to a disconnected client never throws on this hono version
    // (StreamingApi.write swallows errors), so the forward loop below can only
    // exit via the abort signal. Without this wake-up the loop parks on its
    // promise forever and the BroadcastChannel subscription leaks.
    stream.onAbort(() => {
      notifyNewMessage?.();
    });

    try {
      // Step 2: Build full ProjectState
      const result = await buildProjectState(mainDb, ppk, projectUser);

      if (stream.aborted) return;

      if (!result.success) {
        const errorMessage: ProjectSseMessage = {
          type: "error",
          data: { message: result.err },
        };
        await stream.writeSSE({ data: JSON.stringify(errorMessage) });
        return;
      }

      // Step 3: Send starting message with full state
      const startingMessage: ProjectSseMessage = {
        type: "starting",
        data: result.data,
      };
      await stream.writeSSE({ data: JSON.stringify(startingMessage) });

      // Step 4+5: Drain queue and forward subsequent messages until disconnect
      while (true) {
        while (messageQueue.length > 0 && !stream.aborted) {
          const queued = messageQueue.shift()!;
          const { projectId: _pid, ...message } = queued;
          await stream.writeSSE({ data: JSON.stringify(message) });
        }
        if (stream.aborted) break;
        await new Promise<void>((resolve) => {
          notifyNewMessage = resolve;
        });
        notifyNewMessage = null;
      }
    } finally {
      broadcastReceiver.removeEventListener("message", messageHandler);
      broadcastReceiver.close();
    }
  });
});
