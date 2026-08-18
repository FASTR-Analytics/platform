// Minimal Clerk Backend API client. The only server-side Clerk call the
// platform makes: the self-service email rename must prove the caller's Clerk
// account owns BOTH addresses (old and new, new one verified) before renaming
// DB rows — the session JWT alone can only vouch for one of them at a time.
// Everything else Clerk-related is client-driven (the user manages addresses
// through Clerk's own account UI) or handled by clerkMiddleware.

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
      err: `Could not verify your account with Clerk (status ${response.status})`,
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
