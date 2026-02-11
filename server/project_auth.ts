import { getAuth } from "@hono/clerk-auth";
import type { Context } from "hono";
import { createMiddleware } from "hono/factory";
import { Sql } from "postgres";
import {
  _BYPASS_AUTH,
  _INSTANCE_CALENDAR,
  _INSTANCE_LANGUAGE,
  _INSTANCE_NAME,
  _OPEN_ACCESS,
} from "./exposed_env_vars.ts";
import type { DBProjectUserRole, DBUser } from "./db/mod.ts";
import { getPgConnectionFromCacheOrNew } from "./db/mod.ts";
import type { GlobalUser, ProjectUser, ProjectPermission } from "lib";
import { createDevGlobalUser, createDevProjectUser } from "lib";
import { ProjectPk } from "./server_only_types/mod.ts";

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
          authError: true,
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
              authError: true,
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
            authError: true,
          });
        }
      }
      throw error;
    }
  });
}

export async function getGlobalUser(
  c: Context,
): Promise<GlobalUser | "NOT_AUTHENTICATED"> {
  if (_BYPASS_AUTH) {
    return createDevGlobalUser(
      _INSTANCE_NAME,
      _INSTANCE_LANGUAGE,
      _INSTANCE_CALENDAR,
    );
  }

  // @ts-ignore: Clerk middleware types not fully compatible with Hono
  const auth = getAuth(c);
  if (!auth?.userId) {
    return "NOT_AUTHENTICATED";
  }

  try {
    const mainDb = getPgConnectionFromCacheOrNew("main", "READ_ONLY");
    const email = auth.sessionClaims.email as string;

    const rawUserResult = await mainDb<DBUser[]>`SELECT * FROM users WHERE email = ${email}`;
    const rawUser = rawUserResult.at(0);

    if (_OPEN_ACCESS && (!rawUser || !rawUser.is_admin)) {
      // Non-critical insert, don't wait if it fails
      mainDb`
        INSERT INTO users (email, is_admin)
        VALUES (${email}, TRUE)
        ON CONFLICT DO NOTHING
      `.catch(() => {}); // Ignore errors on this insert
    }

    const isGlobalAdmin = _OPEN_ACCESS || (!!rawUser && rawUser.is_admin);

    // Admins get all permissions, others get their configured permissions
    const thisUserPermissions: GlobalUser["thisUserPermissions"] = isGlobalAdmin
      ? {
          can_configure_users: true,
          can_view_users: true,
          can_view_logs: true,
          can_configure_settings: true,
          can_configure_assets: true,
          can_configure_data: true,
          can_view_data: true,
          can_create_projects: true,
        }
      : rawUser
        ? {
            can_configure_users: rawUser.can_configure_users,
            can_view_users: rawUser.can_view_users,
            can_view_logs: rawUser.can_view_logs,
            can_configure_settings: rawUser.can_configure_settings,
            can_configure_assets: rawUser.can_configure_assets,
            can_configure_data: rawUser.can_configure_data,
            can_view_data: rawUser.can_view_data,
            can_create_projects: rawUser.can_create_projects,
          }
        : {
            can_configure_users: false,
            can_view_users: false,
            can_view_logs: false,
            can_configure_settings: false,
            can_configure_assets: false,
            can_configure_data: false,
            can_view_data: false,
            can_create_projects: false,
          };

    const globalUser: GlobalUser = {
      instanceName: _INSTANCE_NAME,
      instanceLanguage: _INSTANCE_LANGUAGE,
      instanceCalendar: _INSTANCE_CALENDAR,
      openAccess: _OPEN_ACCESS,
      email,
      firstName: auth.sessionClaims.firstName as string,
      lastName: auth.sessionClaims.lastName as string,
      approved: _OPEN_ACCESS || !!rawUser,
      isGlobalAdmin,
      thisUserPermissions,
    };
    return globalUser;
  } catch (error) {
    // If database is down or slow, throw a service error instead of auth error
    console.error("Database error in getGlobalUser:", error);
    throw new Error("SERVICE_UNAVAILABLE");
  }
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

  try {
    if (!globalUser.approved) {
      throw new Error("Middleware error: User is not approved");
    }

    const projectId = c.req.header("Project-Id");
    if (!projectId) {
      throw new Error("Middleware error: Project id not in header");
    }

    const mainDb = getPgConnectionFromCacheOrNew("main", "READ_ONLY");

    const rawProjectResult = await mainDb<
      { label: string; is_locked: boolean }[]
    >`SELECT label, is_locked FROM projects WHERE id = ${projectId}`;
    const rawProject = rawProjectResult.at(0);

    if (!rawProject) {
      throw new Error("Middleware error: No project listing in main.db");
    }

    if (globalUser.isGlobalAdmin) {
      return {
        projectId,
        projectLabel: rawProject.label,
        isLocked: rawProject.is_locked,
        projectUser: {
          email: globalUser.email,
          role: "editor", // deprecated
          isGlobalAdmin: true,
          can_configure_settings: true,
          can_create_backups: true,
          can_restore_backups: true,
          can_configure_modules: true,
          can_run_modules: true,
          can_configure_users: true,
          can_configure_visualizations: true,
          can_view_visualizations: true,
          can_configure_reports: true,
          can_view_reports: true,
          can_configure_slide_decks: true,
          can_view_slide_decks: true,
          can_configure_data: true,
          can_view_data: true,
          can_view_metrics: true,
          can_view_logs: true,
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
        ([key, value]) => key.startsWith("can_") && value
      )
    ) {
      throw new Error(
        "Middleware error: User does not have access to this project",
      );
    }
    return {
      projectId,
      projectLabel: rawProject.label,
      isLocked: rawProject.is_locked,
      projectUser: {
        email: globalUser.email,
        role: rawProjectUserRole.role === "editor" ? "editor" : "viewer", // deprecated
        isGlobalAdmin: false,
        can_configure_settings: rawProjectUserRole.can_configure_settings,
        can_create_backups: rawProjectUserRole.can_create_backups,
        can_restore_backups: rawProjectUserRole.can_restore_backups,
        can_configure_modules: rawProjectUserRole.can_configure_modules,
        can_run_modules: rawProjectUserRole.can_run_modules,
        can_configure_users: rawProjectUserRole.can_configure_users,
        can_configure_visualizations:
          rawProjectUserRole.can_configure_visualizations,
        can_view_visualizations: rawProjectUserRole.can_view_visualizations,
        can_configure_reports: rawProjectUserRole.can_configure_reports,
        can_view_reports: rawProjectUserRole.can_view_reports,
        can_configure_slide_decks: rawProjectUserRole.can_configure_slide_decks,
        can_view_slide_decks: rawProjectUserRole.can_view_slide_decks,
        can_configure_data: rawProjectUserRole.can_configure_data,
        can_view_data: rawProjectUserRole.can_view_data,
        can_view_metrics: rawProjectUserRole.can_view_metrics,
        can_view_logs: rawProjectUserRole.can_view_logs,
      },
    };
  } catch (error) {
    if (
      error instanceof Error &&
      error.message.startsWith("Middleware error:")
    ) {
      throw error;
    }
    console.error("Database error in getProjectUser:", error);
    throw new Error("SERVICE_UNAVAILABLE");
  }
}
