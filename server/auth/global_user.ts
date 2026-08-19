// =============================================================================
// GlobalUser — resolving the authenticated caller
// =============================================================================
//
// The one place a request's identity becomes a `GlobalUser`. Three credential
// shapes converge here: the dev bypass, a headless credential (PAT or OAuth,
// already resolved to an email by the headless auth middleware), and a Clerk
// session.
//
// `approved` is the load-bearing field: `_OPEN_ACCESS || !!usersRow`. It is
// what `requireApprovedUser()` gates the whole product surface on
// (PLAN_PRODUCTS_RESTRUCTURE D2) — the six instance permission flags say
// nothing about approval, and before the restructure the project path was the
// only place approval was enforced.
// =============================================================================

import type { Context } from "hono";
import {
  _BYPASS_AUTH,
  _INSTANCE_CALENDAR,
  _INSTANCE_FISCAL_YEAR,
  _INSTANCE_LANGUAGE,
  _INSTANCE_NAME,
  _OPEN_ACCESS,
} from "../exposed_env_vars.ts";
import type { DBUser } from "../db/mod.ts";
import { getPgConnectionFromCacheOrNew } from "../db/mod.ts";
import type { GlobalUser } from "lib";
import {
  _USER_PERMISSIONS_DEFAULT_FULL_ACCESS,
  _USER_PERMISSIONS_DEFAULT_NO_ACCESS,
  buildUserPermissionsFromRow,
  createDevGlobalUser,
  H_USERS,
} from "lib";
import {
  getClerkSessionAuth,
  getHeadlessAuthEmail,
} from "../middleware/auth.ts";

export async function getGlobalUser(
  c: Context,
): Promise<GlobalUser | "NOT_AUTHENTICATED"> {
  if (_BYPASS_AUTH) {
    return createDevGlobalUser(
      _INSTANCE_NAME,
      _INSTANCE_LANGUAGE,
      _INSTANCE_CALENDAR,
      _INSTANCE_FISCAL_YEAR,
    );
  }

  // Headless requests (PAT or OAuth) carry no Clerk session; the headless auth
  // middleware already resolved the credential to the user's email.
  const headlessEmail = getHeadlessAuthEmail(c);
  if (headlessEmail !== undefined) {
    return await buildGlobalUserFromDb(headlessEmail, null, null);
  }

  const auth = getClerkSessionAuth(c);
  if (!auth?.userId) {
    return "NOT_AUTHENTICATED";
  }

  return await buildGlobalUserFromDb(
    auth.sessionClaims.email as string,
    auth.sessionClaims.firstName as string,
    auth.sessionClaims.lastName as string,
  );
}

// Exported for the /mcp context cache (PLAN_112): it resolves a headless
// caller's email to the same GlobalUser the middleware chain builds. Headless
// callers carry no name claims — pass null/null, exactly as getGlobalUser's
// headless branch does.
export async function buildGlobalUserFromDb(
  email: string,
  claimFirstName: string | null,
  claimLastName: string | null,
): Promise<GlobalUser> {
  try {
    const mainDb = getPgConnectionFromCacheOrNew("main", "READ_ONLY");

    const rawUserResult = await mainDb<
      DBUser[]
    >`SELECT * FROM users WHERE email = ${email}`;
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
      ? _USER_PERMISSIONS_DEFAULT_FULL_ACCESS
      : rawUser
      ? buildUserPermissionsFromRow(rawUser)
      : _USER_PERMISSIONS_DEFAULT_NO_ACCESS;

    const globalUser: GlobalUser = {
      instanceName: _INSTANCE_NAME,
      instanceLanguage: _INSTANCE_LANGUAGE,
      instanceCalendar: _INSTANCE_CALENDAR,
      instanceFiscalYear: _INSTANCE_FISCAL_YEAR,
      openAccess: _OPEN_ACCESS,
      email,
      firstName: claimFirstName ?? rawUser?.first_name ?? "",
      lastName: claimLastName ?? rawUser?.last_name ?? "",
      approved: _OPEN_ACCESS || !!rawUser,
      isGlobalAdmin,
      thisUserPermissions,
      unlimitedAi: H_USERS.includes(email) || (rawUser?.unlimited_ai ?? false),
    };
    return globalUser;
  } catch (error) {
    // If database is down or slow, throw a service error instead of auth error
    console.error("Database error in getGlobalUser:", error);
    throw new Error("SERVICE_UNAVAILABLE");
  }
}
