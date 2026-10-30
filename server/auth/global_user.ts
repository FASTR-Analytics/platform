// The one place a request's identity becomes a GlobalUser. Three credential
// shapes converge here: the dev bypass, a headless credential (PAT or OAuth,
// already resolved to an email by the headless auth middleware), and a Clerk
// session. `approved` (`_OPEN_ACCESS || !!usersRow`) is what
// requireApprovedUser() and productAccessPolicy gate on; the six instance
// permission flags say nothing about approval.
// `thisUserPermissions` is effectivePermissions of the row, derived here once.

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
import {
  getInstanceUsers,
  getPgConnectionFromCacheOrNew,
  getScopeGrantsByEmail,
} from "../db/mod.ts";
import { notifyInstanceUsersUpdated } from "../task_management/notify_instance_updated.ts";
import type { GlobalUser } from "lib";
import {
  createDevGlobalUser,
  effectivePermissions,
  normaliseEmail,
  pickUserPermissions,
  scopeAccessOf,
} from "lib";
import {
  getClerkSessionAuth,
  getHeadlessAuthEmail,
} from "../middleware/auth.ts";
import { isHUser } from "./operators.ts";

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

// Exported for the /mcp context cache: it resolves a headless
// caller's email to the same GlobalUser the middleware chain builds. Headless
// callers carry no name claims: pass null/null, exactly as getGlobalUser's
// headless branch does.
export async function buildGlobalUserFromDb(
  claimEmail: string,
  claimFirstName: string | null,
  claimLastName: string | null,
): Promise<GlobalUser> {
  const email = normaliseEmail(claimEmail);
  try {
    const mainDb = getPgConnectionFromCacheOrNew("main", "READ_ONLY");

    const rawUserResult = await mainDb<
      DBUser[]
    >`SELECT * FROM users WHERE email = ${email}`;
    const rawUser = rawUserResult.at(0);

    // Open access approves every signed-in email and makes it an admin for
    // as long as the mode is on; the row it writes is an ordinary user, so
    // turning the mode off leaves no one an admin it did not appoint. Not
    // awaited: the request does not depend on it.
    if (_OPEN_ACCESS && !rawUser) {
      const writeDb = getPgConnectionFromCacheOrNew("main", "READ_AND_WRITE");
      writeDb<{ email: string }[]>`
        INSERT INTO users (email, is_admin) VALUES (${email}, FALSE)
        ON CONFLICT DO NOTHING
        RETURNING email
      `
        .then(async (inserted) => {
          if (inserted.length > 0) {
            notifyInstanceUsersUpdated(await getInstanceUsers(writeDb));
          }
        })
        .catch((error) =>
          console.error("Open-access user insert failed:", error)
        );
    }

    const isGlobalAdmin = _OPEN_ACCESS || (!!rawUser && rawUser.is_admin);

    const allScopes = !rawUser || rawUser.all_scopes;
    const scopeAccess = scopeAccessOf(
      isGlobalAdmin,
      allScopes,
      isGlobalAdmin || allScopes
        ? []
        : (await getScopeGrantsByEmail(mainDb, [email])).get(email) ?? [],
    );
    const thisUserPermissions = effectivePermissions({
      isGlobalAdmin,
      scopeAccess,
      ...pickUserPermissions(rawUser ?? {}),
    });

    const globalUser: GlobalUser = {
      instanceName: _INSTANCE_NAME,
      instanceLanguage: _INSTANCE_LANGUAGE,
      instanceCalendar: _INSTANCE_CALENDAR,
      instanceFiscalYear: _INSTANCE_FISCAL_YEAR,
      openAccess: _OPEN_ACCESS,
      email,
      firstName: claimFirstName ?? rawUser?.first_name ?? "",
      lastName: claimLastName ?? rawUser?.last_name ?? "",
      organisation: rawUser?.organisation ?? null,
      approved: _OPEN_ACCESS || !!rawUser,
      isGlobalAdmin,
      isHUser: isHUser(email),
      thisUserPermissions,
      unlimitedAi: isHUser(email) || (rawUser?.unlimited_ai ?? false),
      scopeAccess,
    };
    return globalUser;
  } catch (error) {
    // If database is down or slow, throw a service error instead of auth error
    console.error("Database error in getGlobalUser:", error);
    throw new Error("SERVICE_UNAVAILABLE");
  }
}
