import type { Context } from "hono";
import { createMiddleware } from "hono/factory";
import { Sql } from "postgres";
import { _BYPASS_AUTH } from "./exposed_env_vars.ts";
import type { DBProjectUserRole } from "./db/mod.ts";
import { getPgConnectionFromCacheOrNew } from "./db/mod.ts";
import type { GlobalUser, ProjectPermission, ProjectUser } from "lib";
import {
  _PROJECT_USER_PERMISSIONS_DEFAULT_FULL_ACCESS,
  buildProjectPermissionsFromRow,
  createDevProjectUser,
  H_USERS,
} from "lib";
import { ProjectPk } from "./server_only_types/mod.ts";
import { getGlobalUser } from "./auth/global_user.ts";

// The identity half lives in server/auth/global_user.ts; the re-export keeps
// this file's importers working until 9b deletes it.
export { buildGlobalUserFromDb, getGlobalUser } from "./auth/global_user.ts";

type RequireProjectPermissionOptions = {
  requireAdmin?: boolean;
  preventAccessToLockedProjects?: boolean;
};

export function requireProjectPermission(
  firstArg?: RequireProjectPermissionOptions | ProjectPermission,
  ...restArgs: ProjectPermission[]
) {
  // Determine if first arg is options object or permission
  const isOptions = typeof firstArg === "object" && firstArg !== null;
  const options: RequireProjectPermissionOptions = isOptions ? firstArg : {};
  const perms: ProjectPermission[] = isOptions
    ? restArgs
    : firstArg
    ? [firstArg as ProjectPermission, ...restArgs]
    : restArgs;

  const { requireAdmin = false, preventAccessToLockedProjects = false } =
    options;

  return createMiddleware<{
    Variables: {
      ppk: ProjectPk;
      projectUser: ProjectUser;
      projectLabel: string;
      globalUser: GlobalUser;
      mainDb: Sql;
    };
  }>(async (c: Context, next: any) => {
    // Skip auth for OPTIONS requests (CORS preflight)
    if (c.req.method === "OPTIONS") {
      await next();
      return;
    }

    try {
      // Get global user first (like getGlobalAdmin/getGlobalNonAdmin)
      const globalUser = await getGlobalUser(c);
      if (globalUser === "NOT_AUTHENTICATED") {
        c.status(401);
        return c.json({
          success: false,
          err: "Authentication required",
          authError: true,
        });
      }

      // Get mainDb connection
      const mainDb = getPgConnectionFromCacheOrNew("main", "READ_AND_WRITE");

      // If requireAdmin is true, only allow global admins
      if (requireAdmin && !globalUser.isGlobalAdmin) {
        c.status(403);
        return c.json({
          success: false,
          err: "Admin access required",
        });
      }

      const res = await getProjectUser(c, globalUser);

      // Global admins bypass permission checks
      if (!globalUser.isGlobalAdmin) {
        // check all permissions for non-admins
        for (const perm of perms) {
          if (!res.projectUser[perm]) {
            c.status(403);
            return c.json({
              success: false,
              err: `User does not have ${perm} permissions for this project`,
            });
          }
        }
      }

      if (preventAccessToLockedProjects && res.isLocked) {
        c.status(403);
        return c.json({
          success: false,
          err: "This project is locked and cannot be edited",
        });
      }

      const projectDb = getPgConnectionFromCacheOrNew(
        res.projectId,
        "READ_AND_WRITE",
      );
      const ppk: ProjectPk = {
        projectDb,
        projectId: res.projectId,
      };

      // Set all context variables (project + global)
      c.set("ppk", ppk);
      c.set("projectUser", res.projectUser);
      c.set("projectLabel", res.projectLabel);
      c.set("globalUser", globalUser);
      c.set("mainDb", mainDb);
      await next();
    } catch (error) {
      if (error instanceof Error) {
        if (error.message === "SERVICE_UNAVAILABLE") {
          c.status(503);
          return c.json({
            success: false,
            err: "Service temporarily unavailable",
          });
        }
        if (error.message.startsWith("Middleware error:")) {
          c.status(403);
          return c.json({
            success: false,
            err: error.message.replace("Middleware error: ", ""),
          });
        }
      }
      throw error;
    }
  });
}

async function getProjectUser(
  c: Context,
  globalUser: GlobalUser,
): Promise<{
  projectId: string;
  projectLabel: string;
  projectUser: ProjectUser;
  isLocked: boolean;
}> {
  if (_BYPASS_AUTH) {
    const projectId = c.req.header("Project-Id");
    if (!projectId) {
      throw new Error("Middleware error: Project id not in header");
    }
    return {
      projectId,
      projectLabel: "Dev Project",
      projectUser: createDevProjectUser(),
      isLocked: false,
    };
  }

  if (!globalUser.approved) {
    throw new Error("Middleware error: User is not approved");
  }

  const projectId = c.req.header("Project-Id");
  if (!projectId) {
    throw new Error("Middleware error: Project id not in header");
  }

  const mainDb = getPgConnectionFromCacheOrNew("main", "READ_ONLY");
  const res = await resolveProjectUserAccess(globalUser, projectId, mainDb);
  return { projectId, ...res };
}

/**
 * The single authoritative project-access check: central-reporting gate,
 * admin/H_USERS grant, then a role row with >=1 true `can_` flag. Used by both
 * the route middleware (getProjectUser) and the SSE endpoint so the two cannot
 * drift. Throws "Middleware error: ..." on deny, "SERVICE_UNAVAILABLE" on DB
 * failure.
 */
export async function resolveProjectUserAccess(
  globalUser: GlobalUser,
  projectId: string,
  mainDb: Sql,
): Promise<{
  projectLabel: string;
  projectUser: ProjectUser;
  isLocked: boolean;
}> {
  try {
    const rawProjectResult = await mainDb<
      { label: string; is_locked: boolean; is_central_reporting: boolean }[]
    >`SELECT label, is_locked, is_central_reporting FROM projects WHERE id = ${projectId}`;
    const rawProject = rawProjectResult.at(0);

    if (!rawProject) {
      throw new Error("Middleware error: No project listing in main.db");
    }

    if (
      rawProject.is_central_reporting && !H_USERS.includes(globalUser.email)
    ) {
      throw new Error(
        "Middleware error: User does not have access to this project",
      );
    }

    if (globalUser.isGlobalAdmin || H_USERS.includes(globalUser.email)) {
      return {
        projectLabel: rawProject.label,
        isLocked: rawProject.is_locked,
        projectUser: {
          email: globalUser.email,
          role: "editor", // deprecated
          isGlobalAdmin: true,
          ..._PROJECT_USER_PERMISSIONS_DEFAULT_FULL_ACCESS,
        },
      };
    }

    const rawProjectUserRoleResult = await mainDb<
      DBProjectUserRole[]
    >`SELECT * FROM project_user_roles WHERE email = ${globalUser.email} AND project_id = ${projectId}`;
    const rawProjectUserRole = rawProjectUserRoleResult.at(0);

    if (
      !rawProjectUserRole ||
      !Object.entries(rawProjectUserRole).some(
        ([key, value]) => key.startsWith("can_") && value,
      )
    ) {
      throw new Error(
        "Middleware error: User does not have access to this project",
      );
    }
    return {
      projectLabel: rawProject.label,
      isLocked: rawProject.is_locked,
      projectUser: {
        email: globalUser.email,
        role: rawProjectUserRole.role === "editor" ? "editor" : "viewer", // deprecated
        isGlobalAdmin: false,
        ...buildProjectPermissionsFromRow(rawProjectUserRole),
      },
    };
  } catch (error) {
    if (
      error instanceof Error &&
      error.message.startsWith("Middleware error:")
    ) {
      throw error;
    }
    console.error("Database error in resolveProjectUserAccess:", error);
    throw new Error("SERVICE_UNAVAILABLE");
  }
}
