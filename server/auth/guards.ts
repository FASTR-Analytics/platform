import type { Context, MiddlewareHandler } from "hono";
import { createMiddleware } from "hono/factory";
import {
  type GlobalUser,
  holdsPermission,
  type ProductAccessLevel,
  type RouteGuard,
  type ScopeId,
  scopeIdSchema,
  type UserPermission,
} from "lib";
import type { Sql } from "postgres";
import { getPgConnectionFromCacheOrNew } from "../db/mod.ts";
import { _STATUS_API_KEY } from "../exposed_env_vars.ts";
import { getGlobalUser } from "./global_user.ts";
import {
  productAccessPolicy,
  type ProductAccessTargets,
} from "./product_access.ts";
import {
  ADMIN_REQUIRED,
  AUTHENTICATION_REQUIRED,
  AWAITING_APPROVAL,
  OPERATOR_REQUIRED,
  permissionRequired,
  PRODUCT_ACCESS_REFUSED,
  SERVICE_UNAVAILABLE,
  STATUS_KEY_REQUIRED,
} from "./refusals.ts";

export type GuardEnv = {
  Variables: { globalUser: GlobalUser; mainDb: Sql };
};

// A policy answers the refusal the guard sends as a 403, or nothing to admit.
type Policy = (
  user: GlobalUser,
  c: Context,
) => Promise<string | undefined> | string | undefined;

function mainDb(): Sql {
  return getPgConnectionFromCacheOrNew("main", "READ_AND_WRITE");
}

// The one guard factory. Every guard skips OPTIONS (CORS preflight), answers
// 401 with `authError: true` when the request carries no identity, 403 with
// the policy's refusal, 503 when the identity read throws, and on admission
// sets `c.var.globalUser` and `c.var.mainDb`.
export function guard(policy: Policy) {
  return createMiddleware<GuardEnv>(
    async (c, next) => {
      if (c.req.method === "OPTIONS") {
        await next();
        return;
      }
      try {
        const user = await getGlobalUser(c);
        if (user === "NOT_AUTHENTICATED") {
          return c.json(
            { success: false, err: AUTHENTICATION_REQUIRED, authError: true },
            401,
          );
        }
        const refusal = await policy(user, c);
        if (refusal !== undefined) {
          return c.json({ success: false, err: refusal }, 403);
        }
        c.set("globalUser", user);
        c.set("mainDb", mainDb());
        await next();
      } catch (error) {
        console.error("Database error in guard:", error);
        return c.json({ success: false, err: SERVICE_UNAVAILABLE }, 503);
      }
    },
  );
}

export function requireSignedIn() {
  return guard(() => undefined);
}

export function requireApprovedUser() {
  return guard((user) => user.approved ? undefined : AWAITING_APPROVAL);
}

export function requireAdmin() {
  return guard((user) => user.isGlobalAdmin ? undefined : ADMIN_REQUIRED);
}

export function requirePermission(flag: UserPermission) {
  return guard((user) =>
    !user.approved
      ? AWAITING_APPROVAL
      : holdsPermission(user, flag)
      ? undefined
      : permissionRequired(flag)
  );
}

export function requireHUser() {
  return guard((user) =>
    user.approved && user.isHUser ? undefined : OPERATOR_REQUIRED
  );
}

export function requireProductAccess(level: ProductAccessLevel) {
  return guard(async (user, c) =>
    await productAccessPolicy(
        mainDb(),
        user,
        level,
        await resolveProductAccessTargets(c, false),
      )
      ? undefined
      : PRODUCT_ACCESS_REFUSED
  );
}

export function requireFolderAccess(level: ProductAccessLevel) {
  return guard(async (user, c) =>
    await productAccessPolicy(
        mainDb(),
        user,
        level,
        await resolveProductAccessTargets(c, true),
      )
      ? undefined
      : PRODUCT_ACCESS_REFUSED
  );
}

function holdsStatusKey(c: Context): boolean {
  return !!_STATUS_API_KEY &&
    c.req.header("status-api-key") === _STATUS_API_KEY;
}

// Fleet-internal machine calls only: the shared status-api-key header, no
// session. A request without it, a signed-in user's included, is 401. Sets
// mainDb and no globalUser.
export function requireStatusKey() {
  return createMiddleware<{ Variables: { mainDb: Sql } }>(
    async (c, next) => {
      if (c.req.method !== "OPTIONS" && !holdsStatusKey(c)) {
        return c.json({ success: false, err: STATUS_KEY_REQUIRED }, 401);
      }
      c.set("mainDb", mainDb());
      await next();
    },
  );
}

// Admits a machine call carrying the status key ahead of the inner guard,
// with mainDb and NO globalUser: a handler behind it treats a missing
// globalUser as the machine actor.
export function orStatusKey(inner: MiddlewareHandler) {
  return createMiddleware<
    { Variables: { globalUser: GlobalUser | undefined; mainDb: Sql } }
  >(async (c, next) => {
    if (c.req.method !== "OPTIONS" && holdsStatusKey(c)) {
      c.set("mainDb", mainDb());
      await next();
      return;
    }
    return await inner(c, next);
  });
}

// The middleware a registry entry's guard declares; a public route has none.
export function guardMiddleware(
  routeGuard: RouteGuard,
  withStatusKey: boolean,
): MiddlewareHandler | undefined {
  const inner = guardFor(routeGuard);
  if (inner === undefined) return undefined;
  return withStatusKey ? orStatusKey(inner) : inner;
}

function guardFor(routeGuard: RouteGuard): MiddlewareHandler | undefined {
  switch (routeGuard.kind) {
    case "public":
      return undefined;
    case "signed_in":
      return requireSignedIn();
    case "approved":
      return requireApprovedUser();
    case "admin":
      return requireAdmin();
    case "permission":
      return requirePermission(routeGuard.flag);
    case "h_user":
      return requireHUser();
    case "status_key":
      return requireStatusKey();
    case "product":
      return requireProductAccess(routeGuard.level);
    case "folder":
      return requireFolderAccess(routeGuard.level);
  }
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

// A value that is not a scope id names no scope here, and defineRoute's body
// validation refuses it after this guard.
function scopeIdsOf(value: unknown): ScopeId[] {
  return stringsOf(value).flatMap((id) => {
    const parsed = scopeIdSchema.safeParse(id);
    return parsed.success ? [parsed.data] : [];
  });
}

// The route's targets come from the id fields the contract declares and nowhere
// else: path product_id / folder_id and body productIds (subjects), body
// targetProductId (a destination product), folderId and parentId (folders;
// null = root), and scopeId. Whether the route is a folder route is the
// registry's to say, never the request's.
async function resolveProductAccessTargets(
  c: Context,
  folderRoute: boolean,
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
    ],
    destinationProductIds: stringsOf(body.targetProductId),
    folderIds: [
      ...stringsOf(params.folder_id),
      ...stringsOf(body.folderId),
      ...stringsOf(body.parentId),
    ],
    scopeIds: scopeIdsOf(body.scopeId),
    folderRoute,
  };
}
