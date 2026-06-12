import { z } from "zod";
import type { GlobalUser, OtherUser, ProjectUserRole, UserLog, UserPermission, ProjectPermission } from "../../types/mod.ts";
import { USER_PERMISSIONS, PROJECT_PERMISSIONS } from "../../types/mod.ts";
import { route } from "../route-utils.ts";

const emailParamsSchema = z.object({ email: z.string() });

// Closed key sets — these flow into `UPDATE users SET ${sql(permissions)}`, so the keys
// become column identifiers. Derived from the exhaustive permission constants and `.partial()`
// (any subset is valid); strip mode drops any non-permission key a client might send, which
// is what keeps an arbitrary column out of the SET clause.
const userPermissionsSchema = z
  .object(Object.fromEntries(USER_PERMISSIONS.map((k) => [k, z.boolean()])) as Record<UserPermission, z.ZodBoolean>)
  .partial();
const projectPermissionsSchema = z
  .object(Object.fromEntries(PROJECT_PERMISSIONS.map((k) => [k, z.boolean()])) as Record<ProjectPermission, z.ZodBoolean>)
  .partial();

export const userRouteRegistry = {
  getCurrentUser: route({
    path: "/user",
    method: "GET",
    response: {} as GlobalUser,
  }),
  getOtherUser: route({
    path: "/user/:email",
    method: "GET",
    params: emailParamsSchema,
    response: {} as { user: OtherUser; projectUserRoles: ProjectUserRole[] },
  }),
  addUsers: route({
    path: "/user",
    method: "POST",
    body: z.object({ emails: z.array(z.string()), isGlobalAdmin: z.boolean() }),
  }),
  toggleUserAdmin: route({
    path: "/user/toggle-admin",
    method: "POST",
    body: z.object({ emails: z.array(z.string()), makeAdmin: z.boolean() }),
  }),
  deleteUser: route({
    path: "/user",
    method: "DELETE",
    body: z.object({ emails: z.array(z.string()) }),
  }),
  batchUploadUsers: route({
    path: "/users/batch",
    method: "POST",
    body: z.object({ asset_file_name: z.string(), replace_all_existing: z.boolean() }),
  }),
  getAllUserLogs: route({
    path: "/all-user-logs",
    method: "GET",
    response: {} as UserLog[],
  }),
  getUserPermissions: route({
    path: "/user/:email/permissions",
    method: "GET",
    params: emailParamsSchema,
    response: {} as { permissions: Record<UserPermission, boolean> },
  }),
  updateUserPermissions: route({
    path: "/user/permissions",
    method: "POST",
    body: z.object({ email: z.string(), permissions: userPermissionsSchema }),
  }),
  bulkUpdateUserPermissions: route({
    path: "/user/permissions/bulk",
    method: "POST",
    body: z.object({ emails: z.array(z.string()), permissions: userPermissionsSchema }),
  }),
  getUserDefaultProjectPermissions: route({
    path: "/user/:email/default-project-permissions",
    method: "GET",
    params: emailParamsSchema,
    response: {} as { permissions: Record<ProjectPermission, boolean> },
  }),
  updateUserDefaultProjectPermissions: route({
    path: "/user/default-project-permissions",
    method: "POST",
    body: z.object({ email: z.string(), permissions: projectPermissionsSchema }),
  }),
  bulkUpdateUserDefaultProjectPermissions: route({
    path: "/user/default-project-permissions/bulk",
    method: "POST",
    body: z.object({ emails: z.array(z.string()), permissions: projectPermissionsSchema }),
  }),
  getAiUsage: route({
    path: "/user/ai-usage",
    method: "GET",
    response: {} as { tokensUsedToday: number; dailyTokenLimit: number | null; isUnlimited: boolean; tokensUsedThisWeek: number; weeklyTokenLimit: number | null },
  }),
  setUserUnlimitedAi: route({
    path: "/user/unlimited-ai",
    method: "POST",
    body: z.object({ email: z.string(), unlimited: z.boolean() }),
  }),
  setUserContactPerson: route({
    path: "/user/contact-person",
    method: "POST",
    body: z.object({ email: z.string(), isContactPerson: z.boolean() }),
  }),
} as const;
