import type { UserPermission } from "lib";

// Every refusal string the guards, the static tiers, the collab admission and
// the user-management routes answer, each defined once.

export const AUTHENTICATION_REQUIRED = "Authentication required";
export const SERVICE_UNAVAILABLE = "Service temporarily unavailable";
export const AWAITING_APPROVAL = "Your account is awaiting approval";
export const ADMIN_REQUIRED = "Admin access required";
export const OPERATOR_REQUIRED = "Not authorized";
export const STATUS_KEY_REQUIRED = "Status key required";
export const PRODUCT_ACCESS_REFUSED = "You do not have access to this product";
export const ORIGIN_NOT_ALLOWED = "Origin not allowed";
export const NOT_FOUND = "Not found";

export function permissionRequired(flag: UserPermission): string {
  return `User does not have ${flag.replaceAll("_", " ")} permission`;
}

export const ADMIN_FLAG_NEEDS_ADMIN =
  "Only a global admin can make a user an admin";
export const ADMIN_SELF_DEMOTION_REFUSED =
  "You cannot remove yourself as admin. Ask another admin to do this.";
export const SELF_DELETION_REFUSED =
  "You cannot remove yourself as a user. Ask another admin to do this.";
export const ADMIN_ROW_NEEDS_ADMIN =
  "Only a global admin can change a global admin's account";
export const OWN_ROW_REFUSED =
  "You cannot change your own account. Ask an admin to do this.";
export const RESTRICTED_CALLER_REFUSED =
  "A user limited to certain scopes cannot manage users";
export const SCOPE_ACCESS_ADMIN = "A global admin always has every scope";
