import type { ScopeAccess } from "./_scope_access.ts";

export type UserPermissions = {
  can_configure_users: boolean;
  can_view_users: boolean;
  can_configure_data: boolean;
  can_view_data: boolean;
};

export type UserPermission = keyof UserPermissions;

export const USER_PERMISSIONS = [
  "can_configure_users",
  "can_view_users",
  "can_configure_data",
  "can_view_data",
] as const satisfies readonly UserPermission[];

type _AssertUserExhaustive =
  Exclude<UserPermission, (typeof USER_PERMISSIONS)[number]> extends never
    ? true
    : "ERROR: USER_PERMISSIONS array is missing a permission key";
const _userCheck: _AssertUserExhaustive = true;
void _userCheck;

export function userPermissions(bit: boolean): UserPermissions {
  return Object.fromEntries(
    USER_PERMISSIONS.map((k) => [k, bit]),
  ) as UserPermissions;
}

// The stored bits of a row-shaped source; a missing or non-boolean column
// reads as false, so an unmigrated column denies.
export function pickUserPermissions(
  source: Partial<Record<UserPermission, unknown>>,
): UserPermissions {
  return Object.fromEntries(
    USER_PERMISSIONS.map((k) => [k, source[k] === true]),
  ) as UserPermissions;
}

// The one derivation of what a user may do from what is stored: a global
// admin holds every flag; configure implies view; a restricted user holds
// none, because every flag reaches instance-wide data or the roster.
export function effectivePermissions(
  row: { isGlobalAdmin: boolean; scopeAccess: ScopeAccess } & UserPermissions,
): UserPermissions {
  if (row.isGlobalAdmin) return userPermissions(true);
  if (!row.scopeAccess.all) return userPermissions(false);
  const stored = pickUserPermissions(row);
  return {
    ...stored,
    can_view_users: stored.can_view_users || stored.can_configure_users,
    can_view_data: stored.can_view_data || stored.can_configure_data,
  };
}

export function holdsPermission(
  user: { approved: boolean; thisUserPermissions: UserPermissions },
  key: UserPermission,
): boolean {
  return user.approved && user.thisUserPermissions[key];
}
