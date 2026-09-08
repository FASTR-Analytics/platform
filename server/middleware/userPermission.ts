import type { Context } from "hono";
import { createMiddleware } from "hono/factory";
import type { GlobalUser, ProductAccessLevel, UserPermission } from "lib";
import type { Sql } from "postgres";
import { getPgConnectionFromCacheOrNew } from "../db/mod.ts";
import { _STATUS_API_KEY } from "../exposed_env_vars.ts";
import { getGlobalUser } from "../auth/global_user.ts";
import {
  type ProductAccessTargets,
  productAccessPolicy,
} from "../auth/product_access.ts";

type RequireGlobalPermissionOptions = {
  requireAdmin?: boolean;
};

type GuardVariables = {
  globalUser: GlobalUser;
  mainDb: Sql;
};

const SERVICE_UNAVAILABLE = {
  success: false,
  err: "Service temporarily unavailable",
} as const;

// The identity step every guard below shares: the resolved user, or the 401
// response to return as-is.
async function authenticate(c: Context): Promise<GlobalUser | Response> {
  const globalUser = await getGlobalUser(c);
  if (globalUser === "NOT_AUTHENTICATED") {
    c.status(401);
    return c.json({
      success: false,
      err: "Authentication required",
      authError: true,
    });
  }
  return globalUser;
}

function admit(c: Context, globalUser: GlobalUser): void {
  c.set("globalUser", globalUser);
  c.set("mainDb", getPgConnectionFromCacheOrNew("main", "READ_AND_WRITE"));
}

/**
 * The approved-user guard: signed in AND `globalUser.approved`
 * (PLAN_PRODUCTS_RESTRUCTURE D2). It guards the run-keyed figure-data reads,
 * the authoring context, the ready-package list, the copilot proxies and the
 * collab socket. `requireGlobalPermission()` is not this: its zero-permission
 * form never checks `approved`, and its call sites keep their semantics.
 */
export function requireApprovedUser() {
  return createMiddleware<{ Variables: GuardVariables }>(
    async (c: Context, next: () => Promise<void>) => {
      if (c.req.method === "OPTIONS") {
        await next();
        return;
      }
      try {
        const globalUser = await authenticate(c);
        if (globalUser instanceof Response) {
          return globalUser;
        }
        if (!globalUser.approved) {
          c.status(403);
          return c.json({
            success: false,
            err: "Your account is awaiting approval",
          });
        }
        admit(c, globalUser);
        await next();
      } catch (error) {
        console.error("Database error in requireApprovedUser:", error);
        c.status(503);
        return c.json(SERVICE_UNAVAILABLE);
      }
    },
  );
}

function stringsOf(value: unknown): string[] {
  if (typeof value === "string") {
    return [value];
  }
  if (Array.isArray(value)) {
    return value.filter((v): v is string => typeof v === "string");
  }
  return [];
}

// The route's targets come from the id fields the contract declares (§3.2)
// and nowhere else: path product_id / folder_id; body productIds and
// targetProductId (products), folderId and parentId (folders; null = root).
async function resolveProductAccessTargets(
  c: Context,
): Promise<ProductAccessTargets> {
  const params = c.req.param() as Record<string, string | undefined>;
  let body: Record<string, unknown> = {};
  if (c.req.method !== "GET") {
    try {
      const parsed: unknown = await c.req.json();
      if (parsed !== null && typeof parsed === "object") {
        body = parsed as Record<string, unknown>;
      }
    } catch {
      // No body or invalid JSON: defineRoute validates it after this guard
    }
  }
  return {
    productIds: [
      ...stringsOf(params.product_id),
      ...stringsOf(body.productIds),
      ...stringsOf(body.targetProductId),
    ],
    folderIds: [
      ...stringsOf(params.folder_id),
      ...stringsOf(body.folderId),
      ...stringsOf(body.parentId),
    ],
  };
}

/**
 * The product and folder guard, installed by defineRoute for every registry
 * entry that declares `access` (PLAN_PRODUCTS_RESTRUCTURE §3.2). It resolves
 * the route's targets from the declared id fields and asks
 * productAccessPolicy once; a handler behind it never checks access itself.
 * The product id in the path is the authority: a future permission scheme
 * replaces the policy, never the handlers.
 */
export function requireProductAccess(level: ProductAccessLevel) {
  return createMiddleware<{ Variables: GuardVariables }>(
    async (c: Context, next: () => Promise<void>) => {
      if (c.req.method === "OPTIONS") {
        await next();
        return;
      }
      try {
        const globalUser = await authenticate(c);
        if (globalUser instanceof Response) {
          return globalUser;
        }
        const targets = await resolveProductAccessTargets(c);
        if (!productAccessPolicy(globalUser, level, targets)) {
          c.status(403);
          return c.json({
            success: false,
            err: "You do not have access to this product",
          });
        }
        admit(c, globalUser);
        await next();
      } catch (error) {
        console.error("Database error in requireProductAccess:", error);
        c.status(503);
        return c.json(SERVICE_UNAVAILABLE);
      }
    },
  );
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
 *  but NO globalUser: a handler behind this guard must treat a missing
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
