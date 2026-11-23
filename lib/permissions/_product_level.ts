export const PRODUCT_LEVELS = ["none", "view", "edit", "own"] as const;
export type ProductLevel = (typeof PRODUCT_LEVELS)[number];
export type ProductGrantLevel = Extract<ProductLevel, "view" | "edit">;
export type ProductDefaultAccess = Exclude<ProductLevel, "own">;
export type ProductGrant = { email: string; level: ProductGrantLevel };
// A team's grant: every member of the team holds the level for as long as
// they are a member (teams, server/db/instance/_main_database.sql).
export type ProductTeamGrant = { teamId: string; level: ProductGrantLevel };

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
  teamGrants: ProductTeamGrant[];
};

// All that productLevelFor reads of a user. `teamIds` are the teams the user
// is a member of, as every roster row and GlobalUser carries them.
export type ProductLevelUser = {
  email: string;
  isGlobalAdmin: boolean;
  teamIds: readonly string[];
};

export function productLevelAtLeast(
  level: ProductLevel,
  required: ProductLevel,
): boolean {
  return PRODUCT_LEVELS.indexOf(level) >= PRODUCT_LEVELS.indexOf(required);
}

function higherLevel(a: ProductLevel, b: ProductLevel): ProductLevel {
  return productLevelAtLeast(a, b) ? a : b;
}

// The one derivation: a global admin and the owner hold own; everyone else
// holds the highest of the general access, their own grant and the grant of
// every team they are in. The highest always wins, so the general access is a
// floor no grant lowers and a personal grant never holds a team member below
// their team's level.
export function productLevelFor(
  access: ProductAccess,
  user: ProductLevelUser,
): ProductLevel {
  if (user.isGlobalAdmin || access.owner === user.email) {
    return "own";
  }
  let level: ProductLevel = access.defaultAccess;
  for (const grant of access.grants) {
    if (grant.email === user.email) {
      level = higherLevel(level, grant.level);
    }
  }
  for (const grant of access.teamGrants) {
    if (user.teamIds.includes(grant.teamId)) {
      level = higherLevel(level, grant.level);
    }
  }
  return level;
}

// The teams a user's level comes from: the teams they are in whose grant is
// the level they hold, and none when the owner, an admin, the general access
// or their own grant already gives it. What "Editor through <team>" names.
export function productLevelTeamIds(
  access: ProductAccess,
  user: ProductLevelUser,
): string[] {
  if (user.isGlobalAdmin || access.owner === user.email) {
    return [];
  }
  const level = productLevelFor(access, user);
  const own = access.grants.find((g) => g.email === user.email)?.level ??
    "none";
  if (
    level === "none" || level === access.defaultAccess || level === own
  ) {
    return [];
  }
  return access.teamGrants
    .filter((g) => g.level === level && user.teamIds.includes(g.teamId))
    .map((g) => g.teamId);
}

// Whether two users are in the same teams, whatever the order.
export function teamIdsEqual(
  a: readonly string[],
  b: readonly string[],
): boolean {
  if (a.length !== b.length) {
    return false;
  }
  const held = new Set(b);
  return a.every((id) => held.has(id));
}
