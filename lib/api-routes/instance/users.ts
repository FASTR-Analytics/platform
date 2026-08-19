import { z } from "zod";
import type {
  GlobalUser,
  OtherUser,
  PersonalAccessTokenSummary,
  RenameEmailInstanceResult,
  UserLog,
  UserPermission,
} from "../../types/mod.ts";
import { USER_PERMISSIONS } from "../../types/mod.ts";
import { route } from "../route-utils.ts";

const emailParamsSchema = z.object({ email: z.string() });

// Closed key sets — these flow into `UPDATE users SET ${sql(permissions)}`, so the keys
// become column identifiers. Derived from the exhaustive permission constants and `.partial()`
// (any subset is valid); strip mode drops any non-permission key a client might send, which
// is what keeps an arbitrary column out of the SET clause.
const userPermissionsSchema = z
  .object(
    Object.fromEntries(USER_PERMISSIONS.map((k) => [k, z.boolean()])) as Record<
      UserPermission,
      z.ZodBoolean
    >,
  )
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
    response: {} as { user: OtherUser },
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
    body: z.object({
      asset_file_name: z.string(),
      replace_all_existing: z.boolean(),
    }),
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
    body: z.object({
      emails: z.array(z.string()),
      permissions: userPermissionsSchema,
    }),
  }),
  getAiUsage: route({
    path: "/user/ai-usage",
    method: "GET",
    response: {} as {
      tokensUsedToday: number;
      dailyTokenLimit: number | null;
      isUnlimited: boolean;
      tokensUsedThisWeek: number;
      weeklyTokenLimit: number | null;
    },
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
  // Renames a user on THIS instance only (main DB — including the product
  // and version attribution columns — plus live collab state). Fleet-internal:
  // called machine-to-machine by renameUserEmailEverywhere with the
  // status-api-key header, or by a local can_configure_users admin as a
  // support fallback.
  renameUserEmail: route({
    path: "/user/rename-email",
    method: "POST",
    body: z.object({ oldEmail: z.string(), newEmail: z.string() }),
    response: {} as { changed: boolean; warnings: string[] },
  }),
  // Self-service: renames the CALLER's email in every instance that has it.
  // Authorization is the Clerk ownership check (both addresses on the caller's
  // account, new one verified), not a permission flag.
  renameUserEmailEverywhere: route({
    path: "/user/rename-email-everywhere",
    method: "POST",
    body: z.object({ oldEmail: z.string(), newEmail: z.string(), dryRun: z.boolean() }),
    response: {} as { instances: RenameEmailInstanceResult[]; warnings: string[] },
  }),
  // Personal access tokens: self-service, always scoped to the caller.
  createPersonalAccessToken: route({
    path: "/personal-access-tokens",
    method: "POST",
    body: z.object({ label: z.string() }),
    response: {} as { token: string; pat: PersonalAccessTokenSummary },
  }),
  listPersonalAccessTokens: route({
    path: "/personal-access-tokens",
    method: "GET",
    response: {} as PersonalAccessTokenSummary[],
  }),
  revokePersonalAccessToken: route({
    path: "/personal-access-tokens",
    method: "DELETE",
    body: z.object({ id: z.number() }),
  }),
} as const;
