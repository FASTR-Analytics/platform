import {
  isRosterRow,
  productLevelAtLeast,
  type RouteGuard,
  routeRegistry,
  type UserPermission,
} from "lib";
import { productLevel } from "./product_access";
import { instanceState } from "./t1_store";

// The client's permission accessors, over the connection's own effective
// permissions and the registry's declared guards, so no component spells a
// server rule by hand. The server is the authority; these exist so a caller
// the route would refuse sees no control rather than one that 403s.

export function isGlobalAdmin(): boolean {
  return instanceState.currentUserIsGlobalAdmin;
}

export function isHUser(): boolean {
  const me = instanceState.users.find((u) =>
    u.email === instanceState.currentUserEmail
  );
  return me !== undefined && isRosterRow(me) && me.isHUser;
}

export function can(key: UserPermission): boolean {
  return instanceState.currentUserPermissions[key];
}

// Whether the connection may call a registry route, by the guard its entry
// declares; a product route needs the product it would act on.
export function canCallRoute(
  name: keyof typeof routeRegistry,
  productId?: string,
): boolean {
  return guardHolds(routeRegistry[name].guard, productId);
}

function guardHolds(guard: RouteGuard, productId: string | undefined): boolean {
  switch (guard.kind) {
    case "public":
    case "signed_in":
      return true;
    case "approved":
      return instanceState.currentUserApproved;
    case "admin":
      return isGlobalAdmin();
    case "permission":
      return can(guard.flag);
    case "h_user":
      return instanceState.currentUserApproved && isHUser();
    case "status_key":
      return false;
    case "product":
      return productId !== undefined &&
        productLevelAtLeast(productLevel(productId), guard.level);
    case "folder":
      return instanceState.currentUserApproved &&
        (guard.level === "own"
          ? isGlobalAdmin()
          : instanceState.currentUserScopeAccess.all);
  }
}
