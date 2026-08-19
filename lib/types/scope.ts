// =============================================================================
// PackageScope — the (package, scope) pair every figure read resolves under
// =============================================================================
//
// A product carries exactly one pair: the results package it is attached to
// (`products.run_id`) and its admin-area-2 identity (`products.admin_area_2`;
// null = national). Every figure inside that product is resolved under it, and
// a FigureBundle captures the pair it was resolved under so staleness is a
// per-figure comparison (PLAN_PRODUCTS_RESTRUCTURE D4).
//
// The pair is a DATA-plane concern only: it keys server cache entries and
// client cache versions, and it never enters a figure's stored config or its
// fetch hash (SYSTEM_09 rule — a render knob in the data layer means spurious
// refetches and gets frozen into stored figure snapshots).
// =============================================================================

export type PackageScope = {
  runId: string;
  adminArea2: string | null;
};

// The ONE scope token used by server cache keys, response-holder stamps, and
// the client version key. encodeURIComponent keeps it readable in Valkey keys
// and escapes `|` (cache-segment separator); the tilde replace closes the one
// unreserved char that would collide with the client version-key separator.
export function scopeToken(adminArea2: string | null): string {
  return adminArea2 === null
    ? "national"
    : encodeURIComponent(adminArea2.toUpperCase()).replaceAll("~", "%7E");
}

export function packageScopesEqual(a: PackageScope, b: PackageScope): boolean {
  return a.runId === b.runId && a.adminArea2 === b.adminArea2;
}
