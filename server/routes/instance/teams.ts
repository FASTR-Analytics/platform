import { Hono } from "hono";
import {
  addTeamMembers,
  createTeam,
  deleteTeam,
  removeTeamMembers,
  TEAM_NOT_FOUND,
  updateTeam,
} from "../../db/instance/teams.ts";
import { TEAM_SELF_ADD_REFUSED } from "../../auth/refusals.ts";
import { log } from "../../middleware/logging.ts";
import {
  notifyInstanceProductsUpserted,
  notifyInstanceTeamsChanged,
} from "../../task_management/notify_instance_updated.ts";
import { defineRoute } from "../route-helpers.ts";
import { broadcastRosterAndCloseStaleCollab } from "./users.ts";

export const routesTeams = new Hono();

// A membership change moves the level of every user who joined or left on
// every product that grants the team one, so each such write re-broadcasts
// the roster, whose rows carry the team ids, and closes the collab sockets
// whose teams are no longer the roster's (broadcastRosterAndCloseStaleCollab);
// the instance stream of each such user ends itself on the same roster.

defineRoute(
  routesTeams,
  "createTeam",
  log("createTeam"),
  async (c, { body }) => {
    const res = await createTeam(c.var.mainDb, c.var.globalUser, body);
    if (!res.success) {
      return c.json(res, failureStatus(res));
    }
    await notifyInstanceTeamsChanged(c.var.mainDb);
    if (res.data.hasMembers) {
      await broadcastRosterAndCloseStaleCollab(c.var.mainDb);
    }
    return c.json({
      success: true as const,
      data: { teamId: res.data.teamId },
    });
  },
);

defineRoute(
  routesTeams,
  "updateTeam",
  log("updateTeam"),
  async (c, { params, body }) => {
    const res = await updateTeam(
      c.var.mainDb,
      c.var.globalUser,
      params.team_id,
      body,
    );
    if (!res.success) {
      return c.json(res, failureStatus(res));
    }
    await notifyInstanceTeamsChanged(c.var.mainDb);
    if (res.data.membersChanged) {
      await broadcastRosterAndCloseStaleCollab(c.var.mainDb);
    }
    return c.json({ success: true as const });
  },
);

// The delete took the team's grant off every product that held one, so their
// summaries are re-broadcast before the roster: a member's stream then
// reconnects to products that no longer name the team.
defineRoute(
  routesTeams,
  "deleteTeam",
  log("deleteTeam"),
  async (c, { params }) => {
    const res = await deleteTeam(c.var.mainDb, params.team_id);
    if (!res.success) {
      return c.json(res, failureStatus(res));
    }
    await notifyInstanceProductsUpserted(c.var.mainDb, res.data.productIds);
    await notifyInstanceTeamsChanged(c.var.mainDb);
    if (res.data.hadMembers) {
      await broadcastRosterAndCloseStaleCollab(c.var.mainDb);
    }
    return c.json({ success: true as const });
  },
);

defineRoute(
  routesTeams,
  "addTeamMembers",
  log("addTeamMembers"),
  async (c, { params, body }) => {
    const res = await addTeamMembers(
      c.var.mainDb,
      c.var.globalUser,
      params.team_id,
      body.emails,
    );
    if (!res.success) {
      return c.json(res, failureStatus(res));
    }
    if (res.data.added > 0) {
      await broadcastRosterAndCloseStaleCollab(c.var.mainDb);
    }
    return c.json(res);
  },
);

defineRoute(
  routesTeams,
  "removeTeamMembers",
  log("removeTeamMembers"),
  async (c, { params, body }) => {
    const res = await removeTeamMembers(
      c.var.mainDb,
      params.team_id,
      body.emails,
    );
    if (!res.success) {
      return c.json(res, failureStatus(res));
    }
    if (res.data.removed > 0) {
      await broadcastRosterAndCloseStaleCollab(c.var.mainDb);
    }
    return c.json(res);
  },
);

function failureStatus(res: { success: false; err: string }): 200 | 403 | 404 {
  return res.err === TEAM_NOT_FOUND
    ? 404
    : res.err === TEAM_SELF_ADD_REFUSED
    ? 403
    : 200;
}
