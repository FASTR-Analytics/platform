// PackageScope is the (package, scope) pair every figure read resolves
// under: the results package a product is attached to (`products.run_id`)
// and its admin-area-2 identity (`products.admin_area_2`; null = national).
// The pair keys server cache entries and client cache versions only. It
// never enters a figure's stored config or its fetch hash: a data-layer knob
// there causes spurious refetches and gets frozen into stored snapshots.

export type PackageScope = {
  runId: string;
  adminArea2: string | null;
};

// The one scope token for server cache keys, response-holder stamps and the
// client version key. encodeURIComponent keeps it readable in Valkey keys and
// escapes `|` (the cache-segment separator); the tilde replace closes the one
// unreserved character that would collide with the client version-key
// separator.
export function scopeToken(adminArea2: string | null): string {
  return adminArea2 === null
    ? "national"
    : encodeURIComponent(adminArea2.toUpperCase()).replaceAll("~", "%7E");
}

export function packageScopesEqual(a: PackageScope, b: PackageScope): boolean {
  return a.runId === b.runId && a.adminArea2 === b.adminArea2;
}
