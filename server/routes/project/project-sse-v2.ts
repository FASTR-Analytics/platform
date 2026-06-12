import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import {
  buildProjectPermissionsFromRow,
  GlobalUser,
  ProjectSseMessage,
  ProjectUser,
  _PROJECT_USER_PERMISSIONS_DEFAULT_FULL_ACCESS,
} from "lib";
import { Sql } from "postgres";
import type { DBProjectUserRole } from "../../db/instance/_main_database_types.ts";
import { getPgConnectionFromCacheOrNew } from "../../db/mod.ts";
import { ProjectPk } from "../../server_only_types/mod.ts";
import { buildProjectState } from "../../task_management/build_project_state.ts";
import { getGlobalUser } from "../../project_auth.ts";

export const routesProjectSSEV2 = new Hono();

type QueuedMessage = ProjectSseMessage & { projectId: string };

/**
 * V2 Project SSE endpoint.
 *
 * Key difference from v1: subscribe-before-build ordering prevents the race
 * condition where messages broadcast during buildProjectState() are dropped.
 *
 * Order:
 * 1. Authenticate — hard-deny unauthenticated clients (no open-access exception)
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
  const projectDb = getPgConnectionFromCacheOrNew(projectId, "READ_ONLY");

  const ppk: ProjectPk = {
    projectDb,
    projectId,
  };

  const projectUser = await getProjectUserForSSE(globalUser, mainDb, projectId);
  if (projectUser === undefined) {
    c.status(403);
    return c.json({ success: false, err: "User does not have access to this project" });
  }

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

async function getProjectUserForSSE(
  globalUser: GlobalUser,
  mainDb: Sql,
  projectId: string,
): Promise<ProjectUser | undefined> {
  if (globalUser.isGlobalAdmin) {
    return {
      email: globalUser.email,
      role: "editor",
      isGlobalAdmin: true,
      ..._PROJECT_USER_PERMISSIONS_DEFAULT_FULL_ACCESS,
    };
  }

  const rawProjectUserRole = (
    await mainDb<DBProjectUserRole[]>`
      SELECT * FROM project_user_roles
      WHERE email = ${globalUser.email} AND project_id = ${projectId}
    `
  ).at(0);

  if (!rawProjectUserRole) {
    return undefined;
  }

  return {
    email: globalUser.email,
    role: rawProjectUserRole.role === "editor" ? "editor" : "viewer",
    isGlobalAdmin: false,
    ...buildProjectPermissionsFromRow(rawProjectUserRole),
  };
}
