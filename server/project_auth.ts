import { getAuth } from "@hono/clerk-auth";
import type { Context } from "hono";
import { createMiddleware } from "hono/factory";
import { Sql } from "postgres";
import {
  _BYPASS_AUTH,
  _INSTANCE_CALENDAR,
  _INSTANCE_LANGUAGE,
  _INSTANCE_NAME,
  _IS_PRODUCTION,
  _OPEN_ACCESS,
} from "./exposed_env_vars.ts";
import type {
  DBProjectUserRole,
  // DBSession,
  DBUser,
} from "./db/mod.ts";
import { getPgConnectionFromCacheOrNew } from "./db/mod.ts";
import type { GlobalUser, ProjectUser, ProjectPermission } from "lib";
import { createDevGlobalUser, createDevProjectUser } from "lib";
import { ProjectPk } from "./server_only_types/mod.ts";

export const getGlobalNonAdmin = createMiddleware<{
  Variables: {
    globalUser: GlobalUser;
    mainDb: Sql;
  };
}>(async (c: Context, next: any) => {
  try {
    const globalUser = await getGlobalUser(c);
    if (globalUser === "NOT_AUTHENTICATED") {
      c.status(401);
      return c.json({
        success: false,
        err: "Authentication required",
        authError: true,
      });
    }
    const mainDb = getPgConnectionFromCacheOrNew("main", "READ_ONLY");
    c.set("globalUser", globalUser);
    c.set("mainDb", mainDb);
    await next();
  } catch (error) {
    if (error instanceof Error && error.message === "SERVICE_UNAVAILABLE") {
      c.status(503);
      return c.json({ success: false, err: "Service temporarily unavailable" });
    }
    throw error;
  }
});

export const getGlobalAdmin = createMiddleware<{
  Variables: {
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
    const globalUser = await getGlobalUser(c);
    if (globalUser === "NOT_AUTHENTICATED") {
      c.status(401);
      return c.json({
        success: false,
        err: "Authentication required",
        authError: true,
      });
    }
    if (!globalUser.isGlobalAdmin) {
      c.status(403);
      return c.json({
        success: false,
        err: "Admin access required",
        authError: true,
      });
    }
    const mainDb = getPgConnectionFromCacheOrNew("main", "READ_AND_WRITE");
    c.set("globalUser", globalUser);
    c.set("mainDb", mainDb);
    await next();
  } catch (error) {
    if (error instanceof Error && error.message === "SERVICE_UNAVAILABLE") {
      c.status(503);
      return c.json({ success: false, err: "Service temporarily unavailable" });
    }
    throw error;
  }
});

export const getProjectViewer = createMiddleware<{
  Variables: {
    ppk: ProjectPk;
    projectUser: ProjectUser;
    projectLabel: string;
  };
}>(async (c: Context, next: any) => {
  try {
    const res = await getProjectUser(c);
    if (res === "NOT_AUTHENTICATED") {
      c.status(401);
      return c.json({
        success: false,
        err: "Authentication required",
        authError: true,
      });
    }
    const projectDb = getPgConnectionFromCacheOrNew(
      res.projectId,
      "READ_AND_WRITE"
    );
    const ppk: ProjectPk = {
      projectDb,
      projectId: res.projectId,
    };
    c.set("ppk", ppk);
    c.set("projectUser", res.projectUser);
    c.set("projectLabel", res.projectLabel);
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

export const requireProjectPermission = (checkLock: boolean = false,...perms: ProjectPermission[]) => createMiddleware<{
  Variables: {
    ppk: ProjectPk;
    projectUser: ProjectUser;
    projectLabel: string;
  };
}>(async (c: Context, next: any) => {
  try{
    // check if project roles entry exists for the user
    const res = await getProjectUser(c);
    if (res === "NOT_AUTHENTICATED") {
      c.status(401);
      return c.json({
        success: false,
        err: "Authentication required",
        authError: true,
      });
    }
    // check all permisions
    for(const perm of perms){
      if(!res.projectUser[perm]){
        c.status(403);
        return c.json({
          success: false,
          err: `User does not have ${perm} permissions for this project`,
          authError: true,
        });
      }
    }

    if(checkLock){
      // Check if project is locked
      const mainDb = getPgConnectionFromCacheOrNew("main", "READ_ONLY");
      try {
        const rawProjectResult = await mainDb<
          { is_locked: boolean }[]
        >`SELECT is_locked FROM projects WHERE id = ${res.projectId}`;
        const rawProject = rawProjectResult.at(0);

        if (!rawProject) {
          c.status(404);
          return c.json({ success: false, err: "Project not found" });
        }

        if (rawProject.is_locked) {
          c.status(403);
          return c.json({
            success: false,
            err: "This project is locked and cannot be edited",
          });
        }
      } catch (dbError) {
        console.error("Database error checking project lock:", dbError);
        c.status(503);
        return c.json({ success: false, err: "Service temporarily unavailable" });
      }
    }

    const projectDb = getPgConnectionFromCacheOrNew(
      res.projectId,
      "READ_AND_WRITE"
    );
    const ppk: ProjectPk = {
      projectDb,
      projectId: res.projectId,
    };
    c.set("ppk", ppk);
    c.set("projectUser", res.projectUser);
    c.set("projectLabel", res.projectLabel);
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

export const getProjectEditor = createMiddleware<{
  Variables: {
    ppk: ProjectPk;
    projectUser: ProjectUser;
    projectLabel: string;
  };
}>(async (c: Context, next: any) => {
  try {
    const res = await getProjectUser(c);
    if (res === "NOT_AUTHENTICATED") {
      c.status(401);
      return c.json({
        success: false,
        err: "Authentication required",
        authError: true,
      });
    }
    if (res.projectUser.role !== "editor") {
      c.status(403);
      return c.json({
        success: false,
        err: "Editor access required for this project",
        authError: true,
      });
    }

    // Check if project is locked
    const mainDb = getPgConnectionFromCacheOrNew("main", "READ_ONLY");

    try {
      const rawProjectResult = await mainDb<
        { is_locked: boolean }[]
      >`SELECT is_locked FROM projects WHERE id = ${res.projectId}`;
      const rawProject = rawProjectResult.at(0);

      if (!rawProject) {
        c.status(404);
        return c.json({ success: false, err: "Project not found" });
      }

      if (rawProject.is_locked) {
        c.status(403);
        return c.json({
          success: false,
          err: "This project is locked and cannot be edited",
        });
      }
    } catch (dbError) {
      console.error("Database error checking project lock:", dbError);
      c.status(503);
      return c.json({ success: false, err: "Service temporarily unavailable" });
    }

    const projectDb = getPgConnectionFromCacheOrNew(
      res.projectId,
      "READ_AND_WRITE"
    );
    const ppk: ProjectPk = {
      projectDb,
      projectId: res.projectId,
    };
    c.set("ppk", ppk);
    c.set("projectUser", res.projectUser);
    c.set("projectLabel", res.projectLabel);
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

export const checkProjectNotLocked = createMiddleware(
  async (c: Context, next: any) => {
    const projectId = c.req.param("project_id");
    const mainDb = getPgConnectionFromCacheOrNew("main", "READ_ONLY");

    const rawProject = (
      await mainDb<
        { is_locked: boolean }[]
      >`SELECT is_locked FROM projects WHERE id = ${projectId}`
    ).at(0);

    if (!rawProject) {
      c.status(404);
      return c.json({ success: false, err: "Project not found" });
    }

    if (rawProject.is_locked) {
      c.status(403);
      return c.json({
        success: false,
        err: "This project is locked and cannot be edited",
      });
    }

    await next();
  }
);

///////////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////////

async function getGlobalUser(
  c: Context
): Promise<GlobalUser | "NOT_AUTHENTICATED"> {
  if (_BYPASS_AUTH) {
    return createDevGlobalUser(
      _INSTANCE_NAME,
      _INSTANCE_LANGUAGE,
      _INSTANCE_CALENDAR
    );
  }

  // @ts-ignore: Clerk middleware types not fully compatible with Hono
  const auth = getAuth(c);
  if (!auth?.userId) {
    return "NOT_AUTHENTICATED";
  }

  try {
    const mainDb = getPgConnectionFromCacheOrNew("main", "READ_ONLY");

    const rawUserResult = await mainDb<DBUser[]>`SELECT * FROM users WHERE email = ${
      auth.sessionClaims.email as string
    }`;
    const rawUser = rawUserResult.at(0);

    if (_OPEN_ACCESS && (!rawUser || !rawUser.is_admin)) {
      // Non-critical insert, don't wait if it fails
      mainDb<DBUser[]>`
INSERT INTO users (email, is_admin)
VALUES (${auth.sessionClaims.email as string}, TRUE)
ON CONFLICT do nothing;
`.catch(() => {}); // Ignore errors on this insert
    }

    const globalUser: GlobalUser = {
      instanceName: _INSTANCE_NAME,
      instanceLanguage: _INSTANCE_LANGUAGE,
      instanceCalendar: _INSTANCE_CALENDAR,
      openAccess: _OPEN_ACCESS,
      email: auth.sessionClaims.email as string,
      firstName: auth.sessionClaims.firstName as string,
      lastName: auth.sessionClaims.lastName as string,
      approved: _OPEN_ACCESS || !!rawUser,
      isGlobalAdmin: _OPEN_ACCESS || (!!rawUser && rawUser.is_admin),
    };
    return globalUser;
  } catch (error) {
    // If database is down or slow, throw a service error instead of auth error
    console.error("Database error in getGlobalUser:", error);
    throw new Error("SERVICE_UNAVAILABLE");
  }
}

async function getProjectUser(
  c: Context
): Promise<
  | "NOT_AUTHENTICATED"
  | { projectId: string; projectLabel: string; projectUser: ProjectUser }
> {
  if (_BYPASS_AUTH) {
    const projectId = c.req.header("Project-Id");
    if (!projectId) {
      throw new Error("Middleware error: Project id not in header");
    }
    return {
      projectId,
      projectLabel: "Dev Project",
      projectUser: createDevProjectUser(),
    };
  }

  // @ts-ignore: Clerk middleware types not fully compatible with Hono
  const auth = getAuth(c);
  if (!auth?.userId) {
    return "NOT_AUTHENTICATED";
  }

  try {
    const mainDb = getPgConnectionFromCacheOrNew("main", "READ_ONLY");

    const rawUserResult = await mainDb<
      DBUser[]
    >`SELECT * FROM users WHERE email = ${auth.sessionClaims.email as string}`;
    const rawUser = rawUserResult.at(0);

    if (!_OPEN_ACCESS && !rawUser) {
      throw new Error("Middleware error: User is not approved");
    }

    const projectId = c.req.header("Project-Id");
    if (!projectId) {
      throw new Error("Middleware error: Project id not in header");
    }

    const rawProjectResult = await mainDb<
      {
        label: string;
      }[]
    >`SELECT label FROM projects WHERE id = ${projectId}`;
    const rawProject = rawProjectResult.at(0);

    if (!rawProject) {
      throw new Error("Middleware error: No project listing in main.db");
    }

    if (_OPEN_ACCESS && (!rawUser || !rawUser.is_admin)) {
      // Non-critical insert, don't wait if it fails
      mainDb<DBUser[]>`
INSERT INTO users (email, is_admin)
VALUES (${auth.sessionClaims.email as string}, TRUE)
ON CONFLICT do nothing;
`.catch(() => {}); // Ignore errors on this insert
    }

    if (_OPEN_ACCESS || rawUser?.is_admin) {
      return {
        projectId,
        projectLabel: rawProject.label,
        projectUser: {
          email: auth.sessionClaims.email as string,
          role: "editor", // deprecated
          isGlobalAdmin: true,
          can_configure_settings: true,
          can_create_backups: true,
          can_restore_backups: true,
          can_configure_modules: true,
          can_run_modules: true,
          can_configure_users: true,
          can_configure_visulizations: true,
          can_configure_reports: true,
          can_configure_data: true,
          can_view_data: true,
          can_view_logs: true,
        },
      };
    }

    const rawProjectUserRoleResult = await mainDb<
      DBProjectUserRole[]
    >`SELECT * FROM project_user_roles WHERE email = ${
      auth.sessionClaims.email as string
    } AND project_id = ${projectId}`;
    const rawProjectUserRole = rawProjectUserRoleResult.at(0);

    if (!rawProjectUserRole) {
      throw new Error(
        "Middleware error: User does not have access to this project"
      );
    }
    return {
      projectId,
      projectLabel: rawProject.label,
      projectUser: {
        email: auth.sessionClaims.email as string,
        role: rawProjectUserRole.role === "editor" ? "editor" : "viewer", // deprecated
        isGlobalAdmin: false,
        can_configure_settings: rawProjectUserRole.can_configure_settings,
        can_create_backups: rawProjectUserRole.can_create_backups,
        can_restore_backups: rawProjectUserRole.can_restore_backups,
        can_configure_modules: rawProjectUserRole.can_configure_modules,
        can_run_modules: rawProjectUserRole.can_run_modules,
        can_configure_users: rawProjectUserRole.can_configure_users,
        can_configure_visulizations: rawProjectUserRole.can_configure_visulizations,
        can_configure_reports: rawProjectUserRole.can_configure_reports,
        can_configure_data: rawProjectUserRole.can_configure_data,
        can_view_data: rawProjectUserRole.can_view_data,
        can_view_logs: rawProjectUserRole.can_view_logs,
      },
    };
  } catch (error) {
    // Distinguish between auth errors and service errors
    if (
      error instanceof Error &&
      error.message.startsWith("Middleware error:")
    ) {
      throw error; // Re-throw auth-related errors
    }
    // Database or timeout errors
    console.error("Database error in getProjectUser:", error);
    throw new Error("SERVICE_UNAVAILABLE");
  }
}
