import type { Context } from "hono";
import { createMiddleware } from "hono/factory";
import type { GlobalUser, UserPermission } from "lib";
import type { Sql } from "postgres";
import { getPgConnectionFromCacheOrNew } from "../db/mod.ts";
import { getGlobalUser } from "../project_auth.ts";

export const requireUserPermission = (
  requireAdmin: boolean,
  ...perms: UserPermission[]
) =>
  createMiddleware<{
    Variables: {
      globalUser: GlobalUser;
      mainDb: Sql;
    };
  }>(async (c: Context, next: () => Promise<void>) => {
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

      const mainDb = getPgConnectionFromCacheOrNew("main", "READ_AND_WRITE");

      // If requireAdmin is true, only allow global admins
      if (requireAdmin) {
        if (!globalUser.isGlobalAdmin) {
          c.status(403);
          return c.json({
            success: false,
            err: "Admin access required",
            authError: true,
          });
        }
        c.set("globalUser", globalUser);
        c.set("mainDb", mainDb);
        await next();
        return;
      }

      // Global admins bypass permission checks
      if (globalUser.isGlobalAdmin) {
        c.set("globalUser", globalUser);
        c.set("mainDb", mainDb);
        await next();
        return;
      }

      // Fetch user permissions from database
      const permissionsResult = await mainDb<Record<UserPermission, boolean>[]>`
        SELECT
          can_configure_users,
          can_view_users,
          can_view_logs,
          can_configure_settings,
          can_configure_assets,
          can_configure_data,
          can_view_data,
          can_create_projects
        FROM user_permissions
        WHERE user_email = ${globalUser.email}
      `;
      const userPermissions = permissionsResult.at(0);

      // If no permissions row exists, deny access
      if (!userPermissions) {
        c.status(403);
        return c.json({
          success: false,
          err: "User does not have any permissions configured",
          authError: true,
        });
      }

      // Check all required permissions
      for (const perm of perms) {
        if (!userPermissions[perm]) {
          c.status(403);
          return c.json({
            success: false,
            err: `User does not have ${perm.replaceAll("_", " ")} permission`,
            authError: true,
          });
        }
      }

      c.set("globalUser", globalUser);
      c.set("mainDb", mainDb);
      await next();
    } catch (error) {
      if (error instanceof Error && error.message === "SERVICE_UNAVAILABLE") {
        c.status(503);
        return c.json({
          success: false,
          err: "Service temporarily unavailable",
        });
      }
      console.error("Database error in requireUserPermission:", error);
      throw new Error("SERVICE_UNAVAILABLE");
    }
  });
