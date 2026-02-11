import type { Context } from "hono";
import { createMiddleware } from "hono/factory";
import type { GlobalUser, UserPermission } from "lib";
import type { Sql } from "postgres";
import { getPgConnectionFromCacheOrNew } from "../db/mod.ts";
import { getGlobalUser } from "../project_auth.ts";

type RequireGlobalPermissionOptions = {
  requireAdmin?: boolean;
};

export function requireGlobalPermission(
  firstArg?: RequireGlobalPermissionOptions | UserPermission,
  ...restArgs: UserPermission[]
) {
  // Determine if first arg is options object or permission
  const isOptions = typeof firstArg === "object" && firstArg !== null;
  const options: RequireGlobalPermissionOptions = isOptions ? firstArg : {};
  const perms: UserPermission[] = isOptions
    ? restArgs
    : (firstArg ? [firstArg as UserPermission, ...restArgs] : restArgs);

  const { requireAdmin = false } = options;

  return createMiddleware<{
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

      // Check all required permissions using already-fetched permissions
      for (const perm of perms) {
        if (!globalUser.thisUserPermissions[perm]) {
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
      console.error("Database error in requireGlobalPermission:", error);
      c.status(503);
      return c.json({
        success: false,
        err: "Service temporarily unavailable",
      });
    }
  });
}
