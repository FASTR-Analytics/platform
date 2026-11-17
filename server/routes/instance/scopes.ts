import { Hono } from "hono";
import { type APIResponseNoData, holdsPermission } from "lib";
import {
  createScope,
  deleteScope,
  SCOPE_GRANTED,
  SCOPE_NOT_FOUND,
  SCOPE_RESERVED,
  updateScope,
} from "../../db/instance/scopes.ts";
import { log } from "../../middleware/logging.ts";
import { notifyInstanceScopesChanged } from "../../task_management/notify_instance_updated.ts";
import { defineRoute } from "../route-helpers.ts";
import { broadcastRosterAndCloseStaleCollab } from "./users.ts";

export const routesScopes = new Hono();

defineRoute(
  routesScopes,
  "createScope",
  log("createScope"),
  async (c, { body }) => {
    const res = await createScope(c.var.mainDb, {
      ...body,
      createdBy: c.var.globalUser.email,
    });
    if (res.success) {
      await notifyInstanceScopesChanged(c.var.mainDb);
    }
    return c.json(res);
  },
);

defineRoute(
  routesScopes,
  "updateScope",
  log("updateScope"),
  async (c, { params, body }) => {
    const res = await updateScope(
      c.var.mainDb,
      params.scope_id,
      body,
      holdsPermission(c.var.globalUser, "can_configure_users"),
    );
    if (res.success) {
      await notifyInstanceScopesChanged(c.var.mainDb);
    }
    return c.json(res, failureStatus(res));
  },
);

defineRoute(
  routesScopes,
  "deleteScope",
  log("deleteScope"),
  async (c, { params }) => {
    const res = await deleteScope(
      c.var.mainDb,
      params.scope_id,
      holdsPermission(c.var.globalUser, "can_configure_users"),
    );
    if (res.success) {
      await notifyInstanceScopesChanged(c.var.mainDb);
      // The delete cascaded the scope's grants (user_scopes), so the roster's
      // scope access changed for every user who held it.
      await broadcastRosterAndCloseStaleCollab(c.var.mainDb);
    }
    return c.json(res, failureStatus(res));
  },
);

function failureStatus(res: APIResponseNoData): 200 | 403 | 404 {
  if (res.success) {
    return 200;
  }
  return res.err === SCOPE_NOT_FOUND
    ? 404
    : res.err === SCOPE_RESERVED || res.err === SCOPE_GRANTED
    ? 403
    : 200;
}
