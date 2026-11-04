// Minimal Clerk Backend API client, for the two server-side Clerk calls the
// platform makes. The self-service email rename must prove the caller's Clerk
// account owns BOTH addresses (old and new, new one verified) before renaming
// DB rows: the session JWT alone can only vouch for one of them at a time. An
// admin name edit writes the name to Clerk, the source of truth for names,
// before any users row. Everything else Clerk-related is client-driven (the
// user manages addresses through Clerk's own account UI) or handled by
// clerkMiddleware.

import { _CLERK_SECRET_KEY } from "./exposed_env_vars.ts";

const CLERK_API = "https://api.clerk.com/v1";

type ClerkEmailAddress = {
  id: string;
  email_address: string;
  verification: { status: string } | null;
};

type ClerkUser = {
  id: string;
  email_addresses: ClerkEmailAddress[];
};

export async function verifyClerkEmailOwnership(
  clerkUserId: string,
  oldEmail: string,
  newEmail: string,
): Promise<{ ok: true } | { ok: false; err: string }> {
  const response = await fetch(
    `${CLERK_API}/users/${encodeURIComponent(clerkUserId)}`,
    { headers: { Authorization: `Bearer ${_CLERK_SECRET_KEY}` } },
  );
  if (!response.ok) {
    return {
      ok: false,
      err:
        `Could not verify your account with Clerk (status ${response.status})`,
    };
  }
  const user = (await response.json()) as ClerkUser;
  const addresses = user.email_addresses.map((a) => ({
    email: a.email_address.toLowerCase(),
    verified: a.verification?.status === "verified",
  }));
  if (!addresses.some((a) => a.email === oldEmail)) {
    return {
      ok: false,
      err: "Your account does not include the current email address",
    };
  }
  const newAddress = addresses.find((a) => a.email === newEmail);
  if (!newAddress) {
    return {
      ok: false,
      err: "Add the new email address to your account first (account settings)",
    };
  }
  if (!newAddress.verified) {
    return {
      ok: false,
      err: "Verify the new email address first (account settings)",
    };
  }
  return { ok: true };
}

// Sets the name on the Clerk account that holds this email address. `found:
// false` = no Clerk account has it (a user invited but never signed up), which
// is not an error: there is no Clerk name to keep in step with yet.
export async function updateClerkUserNameByEmail(
  email: string,
  firstName: string | null,
  lastName: string | null,
): Promise<{ ok: true; found: boolean } | { ok: false; err: string }> {
  const headers = { Authorization: `Bearer ${_CLERK_SECRET_KEY}` };
  const lookup = await fetch(
    `${CLERK_API}/users?email_address=${encodeURIComponent(email)}`,
    { headers, signal: AbortSignal.timeout(10_000) },
  );
  if (!lookup.ok) {
    return {
      ok: false,
      err: `Could not look up the account in Clerk (status ${lookup.status})`,
    };
  }
  const users = (await lookup.json()) as ClerkUser[];
  if (users.length === 0) {
    return { ok: true, found: false };
  }
  const response = await fetch(
    `${CLERK_API}/users/${encodeURIComponent(users[0].id)}`,
    {
      method: "PATCH",
      headers: { ...headers, "content-type": "application/json" },
      // "" clears a name in Clerk; a null field would be left unchanged.
      body: JSON.stringify({
        first_name: firstName ?? "",
        last_name: lastName ?? "",
      }),
      signal: AbortSignal.timeout(10_000),
    },
  );
  if (!response.ok) {
    return {
      ok: false,
      err: `Could not update the name in Clerk (status ${response.status})`,
    };
  }
  await response.body?.cancel();
  return { ok: true, found: true };
}
