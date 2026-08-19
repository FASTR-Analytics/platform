import type { Context } from "hono";
import { createMiddleware } from "hono/factory";
import type { GlobalUser, UserPermission } from "lib";
import type { Sql } from "postgres";
import { getPgConnectionFromCacheOrNew } from "../db/mod.ts";
import { _STATUS_API_KEY } from "../exposed_env_vars.ts";
import { getGlobalUser } from "../auth/global_user.ts";

type RequireGlobalPermissionOptions = {
  requireAdmin?: boolean;
};

/**
 * The product surface's guard: signed in AND approved. Nothing finer
 * (PLAN_PRODUCTS_RESTRUCTURE D2 — every approved user is a full editor of
 * every product; the permission system is rebuilt later).
 *
 * It guards product/folder CRUD, the run-keyed figure-data reads, the
 * authoring context, the ready-package list, the Explore tab's reads, the
 * copilot `/ai` mounts and the collab socket. `requireGlobalPermission()` is
 * NOT this: its zero-permission form never checks `approved`, and its 31 call
 * sites keep exactly the semantics they have today.
 *
 * DOCTRINE (SYSTEM_01): the product id in the path IS the authority. A future
 * permission scheme must replace this ONE guard with a product-aware one —
 * never scatter per-handler checks behind it.
 */
export function requireApprovedUser() {
  return createMiddleware<{
    Variables: {
      globalUser: GlobalUser;
      mainDb: Sql;
    };
  }>(async (c: Context, next: () => Promise<void>) => {
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

      if (!globalUser.approved) {
        c.status(403);
        return c.json({
          success: false,
          err: "Your account is awaiting approval",
        });
      }

      c.set("globalUser", globalUser);
      c.set("mainDb", getPgConnectionFromCacheOrNew("main", "READ_AND_WRITE"));
      await next();
    } catch (error) {
      console.error("Database error in requireApprovedUser:", error);
      c.status(503);
      return c.json({
        success: false,
        err: "Service temporarily unavailable",
      });
    }
  });
}

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

/** Like requireGlobalPermission, but ALSO passes fleet-internal machine calls
 *  authenticated by the shared status-api-key header (same key
 *  /health_check/pg_stat_statements_reset checks). Machine calls get mainDb
 *  but NO globalUser — a handler behind this guard must treat a missing
 *  globalUser as the machine actor. */
export function requireGlobalPermissionOrStatusKey(
  firstArg?: RequireGlobalPermissionOptions | UserPermission,
  ...restArgs: UserPermission[]
) {
  const sessionGuard = requireGlobalPermission(firstArg, ...restArgs);
  return createMiddleware<{
    Variables: {
      globalUser: GlobalUser | undefined;
      mainDb: Sql;
    };
  }>(async (c: Context, next: () => Promise<void>) => {
    if (
      c.req.method !== "OPTIONS" &&
      _STATUS_API_KEY &&
      c.req.header("status-api-key") === _STATUS_API_KEY
    ) {
      c.set("mainDb", getPgConnectionFromCacheOrNew("main", "READ_AND_WRITE"));
      await next();
      return;
    }
    return await sessionGuard(c, next);
  });
}
