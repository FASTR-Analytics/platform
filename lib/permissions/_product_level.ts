export const PRODUCT_LEVELS = ["none", "view", "edit", "own"] as const;
export type ProductLevel = (typeof PRODUCT_LEVELS)[number];
export type ProductGrantLevel = Extract<ProductLevel, "view" | "edit">;
export type ProductDefaultAccess = Exclude<ProductLevel, "own">;
export type ProductGrant = { email: string; level: ProductGrantLevel };

// The level a product or folder route declares; the guard installed from it
// asks productAccessPolicy (server/auth/product_access.ts).
export type ProductAccessLevel = Exclude<ProductLevel, "none">;

// Who holds what on one product: what every summary carries, and all that
// productLevelFor reads. `owner` null = no owner (a consolidated row, or one
// whose owner was deleted); `defaultAccess` is the general access, what
// everyone else in the instance holds.
export type ProductAccess = {
  owner: string | null;
  defaultAccess: ProductDefaultAccess;
  grants: ProductGrant[];
};

export function productLevelAtLeast(
  level: ProductLevel,
  required: ProductLevel,
): boolean {
  return PRODUCT_LEVELS.indexOf(level) >= PRODUCT_LEVELS.indexOf(required);
}

// The one derivation: a global admin and the owner hold own; everyone else
// holds the higher of their grant and the general access, so the general access
// is a floor no grant lowers.
export function productLevelFor(
  access: ProductAccess,
  user: { email: string; isGlobalAdmin: boolean },
): ProductLevel {
  if (user.isGlobalAdmin || access.owner === user.email) {
    return "own";
  }
  const grant: ProductLevel =
    access.grants.find((g) => g.email === user.email)?.level ?? "none";
  return productLevelAtLeast(grant, access.defaultAccess)
    ? grant
    : access.defaultAccess;
}
