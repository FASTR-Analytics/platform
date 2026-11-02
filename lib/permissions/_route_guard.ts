import type { UserPermission } from "./_flags.ts";
import type { ProductAccessLevel } from "./_product_level.ts";

// What a route requires of its caller, declared once on its registry entry.
// The server installs the guard middleware from it (defineRoute) and the
// client reads it to decide what to offer.
export type RouteGuard =
  | { kind: "public" }
  | { kind: "signed_in" }
  | { kind: "approved" }
  | { kind: "admin" }
  | { kind: "permission"; flag: UserPermission }
  | { kind: "h_user" }
  | { kind: "status_key" }
  | { kind: "product"; level: ProductAccessLevel }
  | { kind: "folder"; level: ProductAccessLevel };

export type RouteGuardKind = RouteGuard["kind"];

const publicGuard: RouteGuard = { kind: "public" };
const signedIn: RouteGuard = { kind: "signed_in" };
const approved: RouteGuard = { kind: "approved" };
const admin: RouteGuard = { kind: "admin" };
const hUser: RouteGuard = { kind: "h_user" };
const statusKey: RouteGuard = { kind: "status_key" };

export const GUARD = {
  public: publicGuard,
  signedIn,
  approved,
  admin,
  hUser,
  statusKey,
  permission: (flag: UserPermission): RouteGuard => ({
    kind: "permission",
    flag,
  }),
  product: (level: ProductAccessLevel): RouteGuard => ({
    kind: "product",
    level,
  }),
  folder: (level: ProductAccessLevel): RouteGuard => ({
    kind: "folder",
    level,
  }),
};
