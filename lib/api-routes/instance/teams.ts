import { GUARD, type RouteGuard } from "../../permissions/mod.ts";
import { z } from "zod";
import { route } from "../route-utils.ts";

const teamIdParamsSchema = z.object({ team_id: z.uuid() });

// A team as the Teams editor saves it: the label, the description and the
// whole member list.
const teamBodySchema = z.object({
  label: z.string().trim().min(1),
  description: z.string().nullable(),
  memberEmails: z.array(z.string()),
});

const teamMembersBodySchema = z.object({
  emails: z.array(z.string()).min(1),
});

// A team hands its members every level a product grants it, so writing one
// is user management: can_configure_users, which a restricted user never
// holds. A caller who is not a global admin never adds themselves to a team
// (TEAM_SELF_ADD_REFUSED); removing themselves only lowers their access.
// Every write broadcasts the whole list as `teams_updated` and, when a
// membership changed, the roster, whose rows carry each user's team ids:
// there is no list route.
export const teamRouteRegistry = {
  createTeam: route({
    path: "/teams",
    method: "POST",
    guard: GUARD.permission("can_configure_users"),
    body: teamBodySchema,
    response: {} as { teamId: string },
  }),
  // Replaces the label, the description and the member list together.
  updateTeam: route({
    path: "/teams/:team_id",
    method: "PUT",
    guard: GUARD.permission("can_configure_users"),
    params: teamIdParamsSchema,
    body: teamBodySchema,
  }),
  // Deletes the team's memberships and every grant a product gave it.
  deleteTeam: route({
    path: "/teams/:team_id",
    method: "DELETE",
    guard: GUARD.permission("can_configure_users"),
    params: teamIdParamsSchema,
  }),
  // Adds only: a named user already in the team is left as they are.
  addTeamMembers: route({
    path: "/teams/:team_id/members",
    method: "POST",
    guard: GUARD.permission("can_configure_users"),
    params: teamIdParamsSchema,
    body: teamMembersBodySchema,
    response: {} as { added: number },
  }),
  removeTeamMembers: route({
    path: "/teams/:team_id/members/remove",
    method: "POST",
    guard: GUARD.permission("can_configure_users"),
    params: teamIdParamsSchema,
    body: teamMembersBodySchema,
    response: {} as { removed: number },
  }),
} as const satisfies Record<string, { guard: RouteGuard }>;
