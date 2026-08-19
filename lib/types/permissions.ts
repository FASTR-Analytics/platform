// =============================================================================
// Permissions — six instance flags, and nothing else
// =============================================================================
//
// The project tier died with projects (PLAN_PRODUCTS_RESTRUCTURE D2). The
// product surface is guarded by `requireApprovedUser()`: signed in AND
// approved, full editor of everything. These six flags keep guarding exactly
// the surfaces they guarded before — users, logs, settings, and the data /
// results-package plane — with unchanged semantics.
//
// The permission system is rebuilt later (§8). Nothing new is designed here.
// =============================================================================

export type UserPermissions = {
  can_configure_users: boolean;
  can_view_users: boolean;
  can_view_logs: boolean;
  can_configure_settings: boolean;
  can_configure_data: boolean;
  can_view_data: boolean;
};

export type UserPermission = keyof UserPermissions;

export const USER_PERMISSIONS = [
  "can_configure_users",
  "can_view_users",
  "can_view_logs",
  "can_configure_settings",
  "can_configure_data",
  "can_view_data",
] as const satisfies readonly UserPermission[];

type _AssertUserExhaustive =
  Exclude<UserPermission, (typeof USER_PERMISSIONS)[number]> extends never
    ? true
    : "ERROR: USER_PERMISSIONS array is missing a permission key";
const _userCheck: _AssertUserExhaustive = true;
void _userCheck;

export const _USER_PERMISSIONS_DEFAULT_NO_ACCESS: UserPermissions = {
  can_configure_users: false,
  can_view_users: false,
  can_view_logs: false,
  can_configure_settings: false,
  can_configure_data: false,
  can_view_data: false,
};

export const _USER_PERMISSIONS_DEFAULT_FULL_ACCESS: UserPermissions = {
  can_configure_users: true,
  can_view_users: true,
  can_view_logs: true,
  can_configure_settings: true,
  can_configure_data: true,
  can_view_data: true,
};

export function buildUserPermissionsFromRow(
  row: Record<string, unknown>,
): UserPermissions {
  return Object.fromEntries(
    USER_PERMISSIONS.map((k) => {
      const val = row[k];
      if (val === undefined) {
        console.warn(`buildUserPermissionsFromRow: missing column "${k}" — defaulting to false`);
      }
      return [k, !!val];
    }),
  ) as UserPermissions;
}
