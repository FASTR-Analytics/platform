import { Hono } from "hono";
import type { Sql } from "postgres";
import { type APIResponseWithData, H_USERS, type RenameEmailInstanceResult } from "lib";
import { verifyClerkEmailOwnership } from "../../clerk_api.ts";
import { renameAuthorEmails } from "../../collab/authorship.ts";
import { renameDeckLedgerEmails } from "../../collab/deck_session_ledger.ts";
import { closeConnectionsForEmail } from "../../collab/presence_registry.ts";
import { renameVersionEditorEmail } from "../../collab/version_capture.ts";
import { GetLogs } from "../../db/instance/user_logs.ts";
import {
  addUsers,
  batchUploadUsers,
  bulkUpdateUserDefaultProjectPermissions,
  bulkUpdateUserPermissions,
  createPersonalAccessToken,
  deleteUser,
  getInstanceUsers,
  GetInstanceWeeklyTokenUsage,
  getOtherUser,
  getProjectUsers,
  GetUserDailyTokenUsage,
  getUserDefaultProjectPermissions,
  getUserEmailPresence,
  getUserPermissions,
  listPersonalAccessTokens,
  renameUserEmailInMainDb,
  renameUserEmailInProjects,
  revokePersonalAccessToken,
  setUserContactPerson,
  SetUserUnlimitedAi,
  syncUserName,
  toggleAdmin,
  updateUserDefaultProjectPermissions,
  updateUserPermissions,
} from "../../db/mod.ts";
import {
  _BYPASS_AUTH,
  _DAILY_TOKEN_LIMIT,
  _INSTANCE_ID,
  _OPEN_ACCESS,
  _STATUS_API_KEY,
  _WEEKLY_TOKEN_LIMIT,
} from "../../exposed_env_vars.ts";
import { log } from "../../middleware/logging.ts";
import {
  requireGlobalPermission,
  requireGlobalPermissionOrStatusKey,
} from "../../middleware/userPermission.ts";
import { getClerkSessionAuth } from "../../middleware/auth.ts";
import { notifyInstanceUsersUpdated, notifyInstanceProjectsLastUpdated } from "../../task_management/notify_instance_updated.ts";
import { notifyProjectUsersUpdated } from "../../task_management/notify_project_v2.ts";
import { COLLAB_CLOSE_UNAUTHORIZED } from "../project/project-collab.ts";
import { defineRoute } from "../route-helpers.ts";

export const routesUsers = new Hono();

defineRoute(
  routesUsers,
  "getCurrentUser",
  requireGlobalPermission(),
  log("getCurrentUser"),
  async (c) => {
    const { email, firstName, lastName } = c.var.globalUser;
    // Sync name from Clerk on first login only — syncUserName is a no-op once
    // the name is set. `|| null`, not `?? null`: GlobalUser coerces absent
    // names to "" (the PAT branch always does), and writing "" would defeat
    // the first_name IS NULL guard forever.
    syncUserName(c.var.mainDb, email, firstName || null, lastName || null)
      .catch(() => {});
    return c.json({ success: true, data: c.var.globalUser });
  },
);

defineRoute(
  routesUsers,
  "getProjectsForUser",
  requireGlobalPermission(),
  log("getProjectsForUser"),
  async (c) => {
    const globalUser = c.var.globalUser;
    const mainDb = c.var.mainDb;
    type RawProjectRow = {
      id: string;
      label: string;
      is_locked: boolean;
      is_central_reporting: boolean;
    };
    const rawProjects: RawProjectRow[] = await mainDb<
      RawProjectRow[]
    >`SELECT id, label, is_locked, is_central_reporting FROM projects ORDER BY label`;
    const isHUser = H_USERS.includes(globalUser.email);
    // Same access rules as resolveProjectUserAccess, applied list-wise:
    // central-reporting projects only for H_USERS; admins/H_USERS get the
    // rest; everyone else needs a role row with >=1 true can_* flag.
    if (globalUser.isGlobalAdmin || isHUser) {
      const data = rawProjects
        .filter((p) => !p.is_central_reporting || isHUser)
        .map((p) => ({
          id: p.id,
          label: p.label,
          role: "admin",
          isLocked: p.is_locked,
        }));
      return c.json({ success: true, data });
    }
    const roleRows = await mainDb<
      Record<string, unknown>[]
    >`SELECT * FROM project_user_roles WHERE email = ${globalUser.email}`;
    const roleByProject = new Map<string, string>();
    for (const row of roleRows) {
      const hasAccess = Object.entries(row).some(
        ([key, value]) => key.startsWith("can_") && value === true,
      );
      if (hasAccess) {
        roleByProject.set(
          String(row.project_id),
          row.role === "editor" ? "editor" : "viewer",
        );
      }
    }
    const data = rawProjects
      .filter((p) => !p.is_central_reporting && roleByProject.has(p.id))
      .map((p) => ({
        id: p.id,
        label: p.label,
        role: roleByProject.get(p.id)!,
        isLocked: p.is_locked,
      }));
    return c.json({ success: true, data });
  },
);

defineRoute(
  routesUsers,
  "getAiUsage",
  requireGlobalPermission(),
  async (c) => {
    const [tokensUsedToday, tokensUsedThisWeek] = await Promise.all([
      GetUserDailyTokenUsage(c.var.mainDb, c.var.globalUser.email),
      GetInstanceWeeklyTokenUsage(c.var.mainDb),
    ]);
    return c.json({
      success: true,
      data: {
        tokensUsedToday,
        dailyTokenLimit: _DAILY_TOKEN_LIMIT,
        isUnlimited: c.var.globalUser.unlimitedAi,
        tokensUsedThisWeek,
        weeklyTokenLimit: _WEEKLY_TOKEN_LIMIT,
      },
    });
  },
);

defineRoute(
  routesUsers,
  "setUserUnlimitedAi",
  requireGlobalPermission(),
  log("setUserUnlimitedAi"),
  async (c, { body }) => {
    if (!H_USERS.includes(c.var.globalUser.email)) {
      return c.json({ success: false, err: "Not authorized" }, 403);
    }
    const res = await SetUserUnlimitedAi(
      c.var.mainDb,
      body.email,
      body.unlimited,
    );
    if (res.success) {
      notifyInstanceUsersUpdated(await getInstanceUsers(c.var.mainDb));
    }
    return c.json(res);
  },
);

defineRoute(
  routesUsers,
  "getOtherUser",
  requireGlobalPermission("can_configure_users"),
  log("getOtherUser"),
  async (c, { params }) => {
    const res = await getOtherUser(c.var.mainDb, params.email);
    return c.json(res);
  },
);

defineRoute(
  routesUsers,
  "addUsers",
  requireGlobalPermission("can_configure_users"),
  log("addUsers"),
  async (c, { body }) => {
    const resUser = await addUsers(
      c.var.mainDb,
      body.emails,
      body.isGlobalAdmin,
    );
    if (resUser.success) {
      notifyInstanceUsersUpdated(await getInstanceUsers(c.var.mainDb));
    }
    return c.json(resUser);
  },
);

defineRoute(
  routesUsers,
  "toggleUserAdmin",
  requireGlobalPermission({ requireAdmin: true }),
  log("toggleUserAdmin"),
  async (c, { body }) => {
    if (!body.emails || !Array.isArray(body.emails)) {
      throw new Error("Invalid request: emails array is required");
    }
    if (body.emails.includes(c.var.globalUser.email)) {
      throw new Error(
        "You cannot remove yourself as admin. Ask another admin to do this.",
      );
    }
    const resUser = await toggleAdmin(
      c.var.mainDb,
      body.emails,
      body.makeAdmin,
    );
    if (resUser.success) {
      notifyInstanceUsersUpdated(await getInstanceUsers(c.var.mainDb));
      notifyInstanceProjectsLastUpdated(new Date().toISOString());
    }
    return c.json(resUser);
  },
);

defineRoute(
  routesUsers,
  "deleteUser",
  requireGlobalPermission("can_configure_users"),
  log("deleteUser"),
  async (c, { body }) => {
    if (!body.emails || !Array.isArray(body.emails)) {
      throw new Error("Invalid request: emails array is required");
    }
    if (body.emails.includes(c.var.globalUser.email)) {
      throw new Error(
        "You cannot remove yourself as a user. Ask another admin to do this.",
      );
    }
    const res = await deleteUser(c.var.mainDb, body.emails);
    if (res.success) {
      notifyInstanceUsersUpdated(await getInstanceUsers(c.var.mainDb));
    }
    return c.json(res);
  },
);

defineRoute(
  routesUsers,
  "batchUploadUsers",
  requireGlobalPermission("can_configure_users"),
  log("batchUploadUsers"),
  async (c, { body }) => {
    if (!body.asset_file_name || typeof body.asset_file_name !== "string") {
      return c.json({
        success: false,
        err: "asset_file_name is required and must be a string",
      });
    }

    const res = await batchUploadUsers(
      c.var.mainDb,
      body.asset_file_name,
      body.replace_all_existing,
      c.var.globalUser.email,
    );
    if (res.success) {
      notifyInstanceUsersUpdated(await getInstanceUsers(c.var.mainDb));
      notifyInstanceProjectsLastUpdated(new Date().toISOString());
    }
    return c.json(res);
  },
);

defineRoute(
  routesUsers,
  "setUserContactPerson",
  requireGlobalPermission(),
  log("setUserContactPerson"),
  async (c, { body }) => {
    if (!H_USERS.includes(c.var.globalUser.email)) {
      return c.json({ success: false, err: "Not authorized" }, 403);
    }
    const res = await setUserContactPerson(
      c.var.mainDb,
      body.email,
      body.isContactPerson,
    );
    if (res.success) {
      notifyInstanceUsersUpdated(await getInstanceUsers(c.var.mainDb));
    }
    return c.json(res);
  },
);

defineRoute(
  routesUsers,
  "getAllUserLogs",
  requireGlobalPermission("can_view_logs"),
  log("getAllUserLogs"),
  async (c) => {
    const res = await GetLogs(c.var.mainDb);
    return c.json(res);
  },
);

defineRoute(
  routesUsers,
  "getUserPermissions",
  requireGlobalPermission("can_configure_users"),
  log("getUserPermissions"),
  async (c, { params }) => {
    const res = await getUserPermissions(c.var.mainDb, params.email);
    return c.json(res);
  },
);

defineRoute(
  routesUsers,
  "updateUserPermissions",
  requireGlobalPermission("can_configure_users"),
  log("updateUserPermissions"),
  async (c, { body }) => {
    const res = await updateUserPermissions(
      c.var.mainDb,
      body.email,
      body.permissions,
    );
    if (res.success) {
      notifyInstanceUsersUpdated(await getInstanceUsers(c.var.mainDb));
    }
    return c.json(res);
  },
);

defineRoute(
  routesUsers,
  "getUserDefaultProjectPermissions",
  requireGlobalPermission("can_configure_users"),
  log("getUserDefaultProjectPermissions"),
  async (c, { params }) => {
    const res = await getUserDefaultProjectPermissions(
      c.var.mainDb,
      params.email,
    );
    return c.json(res);
  },
);

defineRoute(
  routesUsers,
  "updateUserDefaultProjectPermissions",
  requireGlobalPermission("can_configure_users"),
  log("updateUserDefaultProjectPermissions"),
  async (c, { body }) => {
    const res = await updateUserDefaultProjectPermissions(
      c.var.mainDb,
      body.email,
      body.permissions,
    );
    return c.json(res);
  },
);

defineRoute(
  routesUsers,
  "bulkUpdateUserPermissions",
  requireGlobalPermission("can_configure_users"),
  log("bulkUpdateUserPermissions"),
  async (c, { body }) => {
    const res = await bulkUpdateUserPermissions(
      c.var.mainDb,
      body.emails,
      body.permissions,
    );
    if (res.success) {
      notifyInstanceUsersUpdated(await getInstanceUsers(c.var.mainDb));
    }
    return c.json(res);
  },
);

defineRoute(
  routesUsers,
  "bulkUpdateUserDefaultProjectPermissions",
  requireGlobalPermission("can_configure_users"),
  log("bulkUpdateUserDefaultProjectPermissions"),
  async (c, { body }) => {
    const res = await bulkUpdateUserDefaultProjectPermissions(
      c.var.mainDb,
      body.emails,
      body.permissions,
    );
    return c.json(res);
  },
);

// ---------------------------------------------------------------------------
// Email rename
// ---------------------------------------------------------------------------

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const FLEET_DOMAIN = "fastr-analytics.org";

type LocalRenameResult = {
  changed: boolean;
  projectsUpdated: number;
  projectsFailed: string[];
  warnings: string[];
};

/** The full single-instance rename: main-DB flip, then the in-memory collab
 *  sweep, then the project-DB attribution sweep — in that order, so any collab
 *  checkpoint that flushes mid-rename already writes the new email and the
 *  sweep only has historical rows to fix. Fires all the notifies. */
async function renameUserEmailLocally(
  mainDb: Sql,
  oldEmail: string,
  newEmail: string,
  actor: string,
): Promise<APIResponseWithData<LocalRenameResult>> {
  const mainRes = await renameUserEmailInMainDb(mainDb, oldEmail, newEmail, actor);
  if (!mainRes.success) {
    return mainRes;
  }
  closeConnectionsForEmail(oldEmail, COLLAB_CLOSE_UNAUTHORIZED, "email renamed");
  renameVersionEditorEmail(oldEmail, newEmail);
  renameDeckLedgerEmails(oldEmail, newEmail);
  renameAuthorEmails(oldEmail, newEmail);
  const proj = await renameUserEmailInProjects(mainDb, oldEmail, newEmail);
  const warnings: string[] = [];
  if (H_USERS.includes(oldEmail)) {
    warnings.push(
      "The old email is a hardcoded superuser (lib/h_users.ts) — that status is lost until the code is updated",
    );
  }
  if (_OPEN_ACCESS && mainRes.data.changed) {
    warnings.push(
      "Open-access instance: logging in under the old email re-creates it until the Clerk account carries the new address",
    );
  }
  notifyInstanceUsersUpdated(await getInstanceUsers(mainDb));
  if (mainRes.data.changed) {
    notifyInstanceProjectsLastUpdated(new Date().toISOString());
    for (const projectId of mainRes.data.affectedRoleProjectIds) {
      const usersRes = await getProjectUsers(mainDb, projectId);
      if (usersRes.success) {
        notifyProjectUsersUpdated(projectId, usersRes.data);
      }
    }
  }
  return {
    success: true,
    data: {
      changed: mainRes.data.changed,
      projectsUpdated: proj.projectsUpdated,
      projectsFailed: proj.projectsFailed,
      warnings,
    },
  };
}

defineRoute(
  routesUsers,
  "renameUserEmail",
  requireGlobalPermissionOrStatusKey("can_configure_users"),
  log("renameUserEmail"),
  async (c, { body }) => {
    const oldEmail = body.oldEmail.trim().toLowerCase();
    const newEmail = body.newEmail.trim().toLowerCase();
    if (!EMAIL_REGEX.test(oldEmail) || !EMAIL_REGEX.test(newEmail)) {
      return c.json({ success: false, err: "Invalid email address" });
    }
    if (oldEmail === newEmail) {
      return c.json({ success: false, err: "The new email is the same as the old one" });
    }
    // No globalUser = fleet-internal machine call (status-api-key path).
    const actor = c.var.globalUser?.email as string | undefined;
    if (actor && actor.toLowerCase() === oldEmail) {
      return c.json({
        success: false,
        err: "You cannot rename your own email here. Use Change email in your profile instead.",
      });
    }
    const res = await renameUserEmailLocally(
      c.var.mainDb,
      oldEmail,
      newEmail,
      actor ?? "fleet-rename",
    );
    return c.json(res);
  },
);

// Personal access tokens are strictly self-service: every route operates on
// the authenticated user's own tokens (c.var.globalUser.email), never an
// email from the body.
defineRoute(
  routesUsers,
  "createPersonalAccessToken",
  requireGlobalPermission(),
  log("createPersonalAccessToken"),
  async (c, { body }) => {
    const res = await createPersonalAccessToken(
      c.var.mainDb,
      c.var.globalUser.email,
      body.label,
    );
    return c.json(res);
  },
);

type PeerPresence = {
  id: string;
  reachable: boolean;
  hasOld: boolean;
  hasNew: boolean;
};

/** Every other instance in the fleet and whether it knows either address,
 *  via servers.json + each instance's public /health_check user list. */
async function discoverPeers(
  oldEmail: string,
  newEmail: string,
): Promise<{ peers: PeerPresence[] } | { err: string }> {
  let servers: { id: string }[];
  try {
    const response = await fetch(`https://central.${FLEET_DOMAIN}/servers.json`, {
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) {
      throw new Error(`status ${response.status}`);
    }
    servers = await response.json();
  } catch (error) {
    return {
      err: `Could not load the server list — try again later (${
        error instanceof Error ? error.message : error
      })`,
    };
  }
  const queue = servers.map((s) => s.id).filter((id) => id !== _INSTANCE_ID);
  const peers: PeerPresence[] = [];
  await Promise.all(
    Array.from({ length: Math.min(8, queue.length) }, async () => {
      let id: string | undefined;
      while ((id = queue.shift()) !== undefined) {
        try {
          const response = await fetch(`https://${id}.${FLEET_DOMAIN}/health_check`, {
            signal: AbortSignal.timeout(10_000),
          });
          if (!response.ok) {
            throw new Error(`status ${response.status}`);
          }
          const health = (await response.json()) as { serverUsers?: string[] };
          const users = (health.serverUsers ?? []).map((u) => u.toLowerCase());
          peers.push({
            id,
            reachable: true,
            hasOld: users.includes(oldEmail),
            hasNew: users.includes(newEmail),
          });
        } catch {
          peers.push({ id, reachable: false, hasOld: false, hasNew: false });
        }
      }
    }),
  );
  peers.sort((a, b) => a.id.localeCompare(b.id));
  return { peers };
}

// Timeout is deliberately tight: the whole orchestrator request lives inside
// nginx's default 60s proxy_read_timeout, so one hung peer must not eat the
// budget — it becomes a failed row and the idempotent retry picks it up.
async function renameOnPeer(
  id: string,
  oldEmail: string,
  newEmail: string,
): Promise<{ row: RenameEmailInstanceResult; warnings: string[] }> {
  try {
    const response = await fetch(
      `https://${id}.${FLEET_DOMAIN}/user/rename-email`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "status-api-key": _STATUS_API_KEY,
        },
        body: JSON.stringify({ oldEmail, newEmail }),
        signal: AbortSignal.timeout(30_000),
      },
    );
    if (!response.ok) {
      // 404 = the instance runs an image without this route yet.
      return { row: { id, status: "failed", error: `HTTP ${response.status}` }, warnings: [] };
    }
    const res = (await response.json()) as APIResponseWithData<LocalRenameResult>;
    if (!res.success) {
      return { row: { id, status: "failed", error: res.err }, warnings: [] };
    }
    return {
      row: {
        id,
        status: "updated",
        projectsUpdated: res.data.projectsUpdated,
        projectsFailed: res.data.projectsFailed,
      },
      warnings: res.data.warnings.map((w) => `${id}: ${w}`),
    };
  } catch (error) {
    return {
      row: {
        id,
        status: "failed",
        error: error instanceof Error ? error.message : String(error),
      },
      warnings: [],
    };
  }
}

defineRoute(
  routesUsers,
  "renameUserEmailEverywhere",
  requireGlobalPermission(),
  log("renameUserEmailEverywhere"),
  async (c, { body }) => {
    const oldEmail = body.oldEmail.trim().toLowerCase();
    const newEmail = body.newEmail.trim().toLowerCase();
    if (!EMAIL_REGEX.test(oldEmail) || !EMAIL_REGEX.test(newEmail)) {
      return c.json({ success: false, err: "Invalid email address" });
    }
    if (oldEmail === newEmail) {
      return c.json({ success: false, err: "The new email is the same as the old one" });
    }
    // Deliberately NO approved check: approval is keyed to the session's
    // current email, and mid-rename the JWT can legitimately carry either
    // address while only the other has a users row. The Clerk ownership check
    // below is the real authorization; a caller with no rows anywhere just
    // gets an empty preview and renames nothing.
    const sessionEmail = c.var.globalUser.email.toLowerCase();
    // Either side of the rename may be the session identity: oldEmail before
    // the Clerk primary flips, newEmail after (which is what keeps a retry of
    // a partially-failed run possible).
    if (sessionEmail !== oldEmail && sessionEmail !== newEmail) {
      return c.json({
        success: false,
        err: "You can only change your own email address",
      });
    }
    // The load-bearing authorization: the caller's Clerk account must own BOTH
    // addresses, the new one verified. The session JWT alone can only vouch
    // for one of them, and without this check a caller could rename themselves
    // to an address they don't control — or claim someone else's old account.
    // Dry runs are exempt: the wizard previews BEFORE the user adds the new
    // address in Clerk, and the preview only reads user lists that
    // /health_check already exposes publicly.
    if (!_BYPASS_AUTH && !body.dryRun) {
      // Session tokens only: the ownership check is the ONLY authorization on
      // this route, so a machine token (PAT/M2M) must not be able to drive a
      // fleet-wide rename off its userId.
      const auth = getClerkSessionAuth(c);
      if (!auth?.userId) {
        return c.json({ success: false, err: "Not authenticated" }, 401);
      }
      const ownership = await verifyClerkEmailOwnership(auth.userId, oldEmail, newEmail);
      if (!ownership.ok) {
        return c.json({ success: false, err: ownership.err });
      }
    }

    const discovery = await discoverPeers(oldEmail, newEmail);
    if ("err" in discovery) {
      return c.json({ success: false, err: discovery.err });
    }
    const warnings: string[] = [];
    const instances: RenameEmailInstanceResult[] = [];
    const local = await getUserEmailPresence(c.var.mainDb, oldEmail, newEmail);

    if (body.dryRun) {
      if (local.hasOld && local.hasNew) {
        instances.push({
          id: _INSTANCE_ID,
          status: "conflict",
          error: "A user with the new email already exists",
        });
      } else if (local.hasOld) {
        instances.push({ id: _INSTANCE_ID, status: "pending" });
      }
      for (const peer of discovery.peers) {
        if (!peer.reachable) {
          instances.push({ id: peer.id, status: "unreachable" });
        } else if (peer.hasOld && peer.hasNew) {
          instances.push({
            id: peer.id,
            status: "conflict",
            error: "A user with the new email already exists",
          });
        } else if (peer.hasOld) {
          instances.push({ id: peer.id, status: "pending" });
        }
      }
      if (instances.some((i) => i.status === "unreachable")) {
        warnings.push(
          "Some instances could not be checked — if your account exists there, re-run the rename once they are back",
        );
      }
      return c.json({ success: true, data: { instances, warnings } });
    }

    // Execute: local instance first (in-process — no hairpin HTTP through
    // nginx), then the affected peers with bounded concurrency — the whole
    // request must finish inside nginx's default 60s proxy_read_timeout, so
    // peers cannot be visited one at a time. hasNew-only instances are
    // included so a retried run re-runs their idempotent attribution sweeps.
    if (local.hasOld || local.hasNew) {
      const res = await renameUserEmailLocally(
        c.var.mainDb,
        oldEmail,
        newEmail,
        sessionEmail,
      );
      if (res.success) {
        instances.push({
          id: _INSTANCE_ID,
          status: "updated",
          projectsUpdated: res.data.projectsUpdated,
          projectsFailed: res.data.projectsFailed,
        });
        warnings.push(...res.data.warnings);
      } else {
        instances.push({ id: _INSTANCE_ID, status: "failed", error: res.err });
      }
    }
    const peerRows: (RenameEmailInstanceResult | null)[] = discovery.peers.map(
      (peer) => {
        if (!peer.reachable) {
          return { id: peer.id, status: "unreachable" };
        }
        if (peer.hasOld && peer.hasNew) {
          return {
            id: peer.id,
            status: "conflict",
            error: "A user with the new email already exists",
          };
        }
        return null;
      },
    );
    const renameQueue = discovery.peers
      .map((peer, index) => ({ peer, index }))
      .filter(({ peer, index }) =>
        peerRows[index] === null && (peer.hasOld || peer.hasNew)
      );
    await Promise.all(
      Array.from({ length: Math.min(4, renameQueue.length) }, async () => {
        let next: { peer: PeerPresence; index: number } | undefined;
        while ((next = renameQueue.shift()) !== undefined) {
          const res = await renameOnPeer(next.peer.id, oldEmail, newEmail);
          peerRows[next.index] = res.row;
          warnings.push(...res.warnings);
        }
      }),
    );
    instances.push(
      ...peerRows.filter((row): row is RenameEmailInstanceResult => row !== null),
    );
    if (instances.some((i) => i.status !== "updated")) {
      warnings.push(
        "Some instances were not renamed — running the rename again is safe and retries only what is missing",
      );
    }
    // The central-reporting app keeps its own user accounts — this rename
    // never reaches them (central is not in servers.json and runs a separate
    // users table). Only relevant to the few users with central access.
    warnings.push(
      "Central reporting accounts are separate and were not renamed — contact an administrator if you use central reporting",
    );
    return c.json({ success: true, data: { instances, warnings } });
  },
);

defineRoute(
  routesUsers,
  "listPersonalAccessTokens",
  requireGlobalPermission(),
  async (c) => {
    const res = await listPersonalAccessTokens(
      c.var.mainDb,
      c.var.globalUser.email,
    );
    return c.json(res);
  },
);

defineRoute(
  routesUsers,
  "revokePersonalAccessToken",
  requireGlobalPermission(),
  log("revokePersonalAccessToken"),
  async (c, { body }) => {
    const res = await revokePersonalAccessToken(
      c.var.mainDb,
      c.var.globalUser.email,
      body.id,
    );
    return c.json(res);
  },
);
