import { z } from "zod";
import {
  type GlobalUser,
  USER_PERMISSIONS,
  type UserPermission,
} from "../../permissions/mod.ts";
import type {
  PersonalAccessTokenSummary,
  RenameEmailInstanceResult,
  UserLastActive,
} from "../../types/mod.ts";
import { scopeUuidSchema } from "../../types/scope.ts";
import { route } from "../route-utils.ts";

const emailParamsSchema = z.object({ email: z.string() });

// Closed key sets: these flow into `UPDATE users SET ${sql(permissions)}`, so the keys
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

// Named, unlike the other route-local response shapes in this file: the AI
// panel holds it in a signal that starts null, which needs the type by name.
export type AiUsage = {
  tokensUsedToday: number;
  dailyTokenLimit: number | null;
  isUnlimited: boolean;
  tokensUsedThisWeek: number;
  weeklyTokenLimit: number | null;
};

const userProfileSchema = z.object({
  organisation: z.string().max(200).nullable(),
});

const scopeAccessSchema = z.discriminatedUnion("all", [
  z.object({ all: z.literal(true) }),
  z.object({ all: z.literal(false), scopeIds: z.array(scopeUuidSchema) }),
]);

export const userRouteRegistry = {
  getCurrentUser: route({
    path: "/user",
    method: "GET",
    response: {} as GlobalUser,
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
      asset_file_name: z.string().min(1),
      replace_all_existing: z.boolean(),
    }),
  }),
  getUsersLastActive: route({
    path: "/users/last-active",
    method: "GET",
    response: {} as UserLastActive[],
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
    response: {} as AiUsage,
  }),
  setUserUnlimitedAi: route({
    path: "/user/unlimited-ai",
    method: "POST",
    body: z.object({ email: z.string(), unlimited: z.boolean() }),
  }),
  // The user-management rule (refuseUserManagement) keeps a holder of
  // can_configure_users off their own row and any admin's, so no one lifts
  // their own restriction. Refused for a global admin, who always has every
  // scope.
  setUserScopeAccess: route({
    path: "/user/scope-access",
    method: "POST",
    body: z.object({ email: z.string(), scopeAccess: scopeAccessSchema }),
  }),
  // The batch form: replaces the scope access of every named user, under the
  // same rule. An admin caller's selection skips global admins (who always
  // have every scope).
  bulkSetUserScopeAccess: route({
    path: "/user/scope-access/bulk",
    method: "POST",
    body: z.object({
      emails: z.array(z.string()),
      scopeAccess: scopeAccessSchema,
    }),
    response: {} as { updated: number; skippedAdmins: number },
  }),
  setUserContactPerson: route({
    path: "/user/contact-person",
    method: "POST",
    body: z.object({ email: z.string(), isContactPerson: z.boolean() }),
  }),
  // Renames a user on THIS instance only (main DB, product attribution and
  // live collab state). Called machine-to-machine by
  // renameUserEmailEverywhere with the status-api-key header and the Clerk
  // user id the originating instance verified, which this instance verifies
  // again, or by a global admin as a support fallback.
  renameUserEmail: route({
    path: "/user/rename-email",
    method: "POST",
    body: z.object({
      oldEmail: z.string(),
      newEmail: z.string(),
      clerkUserId: z.string().optional(),
    }),
    response: {} as { changed: boolean; warnings: string[] },
  }),
  // Self-service: renames the CALLER's email in every instance that has it.
  // Authorization is the Clerk ownership check (both addresses on the caller's
  // account, new one verified), not a permission flag.
  renameUserEmailEverywhere: route({
    path: "/user/rename-email-everywhere",
    method: "POST",
    body: z.object({
      oldEmail: z.string(),
      newEmail: z.string(),
      dryRun: z.boolean(),
    }),
    response: {} as {
      instances: RenameEmailInstanceResult[];
      warnings: string[];
    },
  }),
  // Applies a Clerk name change pushed by the peer instance that observed it
  // (contract on syncUserName). Fleet-internal and machine-only: the
  // status-api-key header is the sole authorization, a session caller is
  // refused because Clerk, not an admin, is the source of truth for names.
  receiveUserNameSync: route({
    path: "/user/sync-name",
    method: "POST",
    body: z.object({
      email: z.string(),
      firstName: z.string().nullable(),
      lastName: z.string().nullable(),
    }),
    response: {} as { changed: boolean },
  }),
  // The caller's own organisation: self-service, and pushed to the fleet so
  // the profile follows the user as their name does.
  updateMyProfile: route({
    path: "/user/profile",
    method: "POST",
    body: userProfileSchema,
  }),
  // Applies a profile change pushed by the peer instance the user wrote it
  // on. Fleet-internal and machine-only, as receiveUserNameSync is.
  receiveUserProfileSync: route({
    path: "/user/sync-profile",
    method: "POST",
    body: userProfileSchema.extend({ email: z.string() }),
    response: {} as { changed: boolean },
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
