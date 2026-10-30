import type { ScopeId, ScopeUuid } from "../types/scope.ts";

// Which scopes a user may use. `all: false` is a restricted user
// (`users.all_scopes = FALSE`), limited to the products that carry one of
// `scopeIds` and to package data read through one of them. A global admin
// and every user of an open-access instance are `{ all: true }`.
export type ScopeAccess =
  | { all: true }
  | { all: false; scopeIds: ScopeUuid[] };

export const ALL_SCOPES: ScopeAccess = { all: true };

// A global admin is unrestricted whatever all_scopes says.
export function scopeAccessOf(
  isAdmin: boolean,
  allScopes: boolean,
  grants: ScopeUuid[],
): ScopeAccess {
  return isAdmin || allScopes ? ALL_SCOPES : { all: false, scopeIds: grants };
}

export function canUseScope(access: ScopeAccess, scopeId: ScopeId): boolean {
  return access.all ||
    access.scopeIds.some((granted) => granted === scopeId);
}

export function scopeAccessEqual(a: ScopeAccess, b: ScopeAccess): boolean {
  if (a.all || b.all) {
    return a.all === b.all;
  }
  const bIds = new Set(b.scopeIds);
  return a.scopeIds.length === bIds.size &&
    a.scopeIds.every((id) => bIds.has(id));
}
