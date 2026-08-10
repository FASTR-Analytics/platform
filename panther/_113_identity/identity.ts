// Copyright 2023-2026, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

// The identity seam: the provider-agnostic credential → identity → guard
// contract for panterra-style apps. The app defines its own identity type and
// permission vocabulary; a provider (dev header, Clerk, PAT store, …) stands
// behind `resolve`; guards are pure decisions the app derives from declared
// per-operation policy data. This module owns only the contract and the one
// evaluation order — provider concerns (caching, TTLs, token formats,
// revocation windows) stay behind the seam and never appear here.

// Resolution is tri-state, and the distinction is load-bearing:
//   - TIdentity  → a valid credential (or a deliberate anonymous identity).
//   - null       → an invalid credential; callers answer 401, telling the
//                  client its credential is bad (it should re-authenticate).
//   - throw      → the backend could not JUDGE the credential; callers answer
//                  503 so clients retry rather than discard a good token.
// Providers must map only unambiguously-bad credentials to null and let
// everything else throw: an auth backend that folds outages into "signed out"
// would otherwise 401 during downtime and force every client back through
// consent. The same three states are what createMCPHttpHandler's authenticate
// hook expects, so one provider serves HTTP routes and the MCP door alike.
export type IdentityProvider<TIdentity> = {
  resolve: (request: Request) => Promise<TIdentity | null> | TIdentity | null;
  // Stable key for one credential-holder (e.g. email): the parity join (the
  // same person via any credential type resolves to the same key), the cache
  // and MCP principalKey, and the provenance subject.
  identityKey: (identity: TIdentity) => string;
};

export type GuardDecision =
  | { allow: true }
  | { allow: false; reason: string };

// A guard judges an already-resolved identity. It may be async (scoped checks
// read storage) and may throw only for "cannot judge" (storage down → 503);
// an ordinary deny is a returned decision with a human-readable reason.
export type Guard<TIdentity> = (
  identity: TIdentity,
) => GuardDecision | Promise<GuardDecision>;

export function allow(): GuardDecision {
  return { allow: true };
}

export function deny(reason: string): GuardDecision {
  return { allow: false, reason };
}

export type AuthOutcome<TIdentity> =
  | { ok: true; identity: TIdentity }
  | { ok: false; status: 401 | 403 | 503; err: string; cause?: unknown };

// The single evaluation order for every judgment point: resolve the
// credential (null → 401, throw → 503), then apply the guard (deny → 403,
// throw → 503). Wire text stays generic — a 503 must not leak backend error
// detail to unauthenticated callers — so the underlying error rides `cause`
// for the app to log.
export async function authorize<TIdentity>(
  provider: IdentityProvider<TIdentity>,
  request: Request,
  guard: Guard<TIdentity>,
): Promise<AuthOutcome<TIdentity>> {
  let identity: TIdentity | null;
  try {
    identity = await Promise.resolve(provider.resolve(request));
  } catch (cause) {
    return {
      ok: false,
      status: 503,
      err: "Could not verify credentials",
      cause,
    };
  }
  if (identity === null) {
    return { ok: false, status: 401, err: "Authentication required" };
  }
  let decision: GuardDecision;
  try {
    decision = await Promise.resolve(guard(identity));
  } catch (cause) {
    return {
      ok: false,
      status: 503,
      err: "Could not check permissions",
      cause,
    };
  }
  if (!decision.allow) {
    return { ok: false, status: 403, err: decision.reason };
  }
  return { ok: true, identity };
}
