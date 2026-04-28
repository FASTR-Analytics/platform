import { getAuth } from "@hono/clerk-auth";
import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import {
  buildProjectPermissionsFromRow,
  ProjectSseMessage,
  ProjectUser,
  _PROJECT_USER_PERMISSIONS_DEFAULT_FULL_ACCESS,
} from "lib";
import type { DBProjectUserRole, DBUser } from "../../db/instance/_main_database_types.ts";
import { getPgConnectionFromCacheOrNew } from "../../db/mod.ts";
import { _BYPASS_AUTH } from "../../exposed_env_vars.ts";
import { ProjectPk } from "../../server_only_types/mod.ts";
import { buildProjectState } from "../../task_management/build_project_state.ts";

export const routesProjectSSEV2 = new Hono();

type QueuedMessage = { projectId: string; message: ProjectSseMessage };

/**
 * V2 Project SSE endpoint.
 *
 * Key difference from v1: subscribe-before-build ordering prevents the race
 * condition where messages broadcast during buildProjectState() are dropped.
 *
 * Order:
 * 1. Subscribe to BroadcastChannel (queue messages)
 * 2. Build full ProjectState from DB
 * 3. Send `starting` with full state
 * 4. Drain queued messages
 * 5. Forward subsequent messages
 */
routesProjectSSEV2.get("/project_sse_v2/:project_id", async (c) => {
  const projectId = c.req.param("project_id");

  const mainDb = getPgConnectionFromCacheOrNew("main", "READ_ONLY");
  const projectDb = getPgConnectionFromCacheOrNew(projectId, "READ_ONLY");

  const ppk: ProjectPk = {
    projectDb,
    projectId,
  };

  // Get project user for thisUserPermissions (optional - undefined if not authenticated)
  const projectUser = await getProjectUserForSSE(c, mainDb, projectId);

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

    try {
      // Step 2: Build full ProjectState
      const result = await buildProjectState(mainDb, ppk, projectUser);

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

      // Step 4+5: Drain queue and forward subsequent messages
      while (true) {
        while (messageQueue.length > 0) {
          const queued = messageQueue.shift()!;
          await stream.writeSSE({ data: JSON.stringify(queued.message) });
        }
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

/**
 * Get project user for SSE connection.
 * Returns undefined if user cannot be authenticated or has no project access.
 * Does not throw - SSE will work with undefined (thisUserPermissions all false).
 */
async function getProjectUserForSSE(
  c: any,
  mainDb: any,
  projectId: string
): Promise<ProjectUser | undefined> {
  try {
    if (_BYPASS_AUTH) {
      return undefined;
    }

    const auth = getAuth(c);
    if (!auth?.userId) {
      return undefined;
    }

    const email = auth.sessionClaims?.email as string | undefined;
    if (!email) {
      return undefined;
    }

    // Check if user is a global admin
    const rawUser = (
      await mainDb<DBUser[]>`SELECT * FROM users WHERE email = ${email}`
    ).at(0);

    if (rawUser?.is_admin) {
      return {
        email,
        role: "editor",
        isGlobalAdmin: true,
        ..._PROJECT_USER_PERMISSIONS_DEFAULT_FULL_ACCESS,
      };
    }

    // Look up project-specific permissions
    const rawProjectUserRole = (
      await mainDb<DBProjectUserRole[]>`
        SELECT * FROM project_user_roles
        WHERE email = ${email} AND project_id = ${projectId}
      `
    ).at(0);

    if (!rawProjectUserRole) {
      return undefined;
    }

    return {
      email,
      role: rawProjectUserRole.role === "editor" ? "editor" : "viewer",
      isGlobalAdmin: false,
      ...buildProjectPermissionsFromRow(rawProjectUserRole),
    };
  } catch {
    return undefined;
  }
}
