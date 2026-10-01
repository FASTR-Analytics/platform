import { Hono } from "hono";
import type { APIResponseNoData } from "lib";
import type { Sql } from "postgres";
import {
  createScope,
  deleteScope,
  listScopes,
  SCOPE_NOT_FOUND,
  SCOPE_RESERVED,
  updateScope,
} from "../../db/instance/scopes.ts";
import { log } from "../../middleware/logging.ts";
import { requireGlobalPermission } from "../../middleware/mod.ts";
import { getInstanceUsers } from "../../db/instance/instance.ts";
import {
  notifyInstanceScopesUpdated,
  notifyInstanceUsersUpdated,
} from "../../task_management/notify_instance_updated.ts";
import { defineRoute } from "../route-helpers.ts";

export const routesScopes = new Hono();

function failureStatus(res: APIResponseNoData): 200 | 403 | 404 {
  if (res.success) return 200;
  return res.err === SCOPE_NOT_FOUND
    ? 404
    : res.err === SCOPE_RESERVED
    ? 403
    : 200;
}

// The write has committed, so a failed re-read is logged and swallowed, as
// notifyInstanceProductsUpserted does.
async function notifyScopes(mainDb: Sql): Promise<void> {
  const res = await listScopes(mainDb);
  if (!res.success) {
    console.error(`[notify] scope list broadcast failed: ${res.err}`);
    return;
  }
  notifyInstanceScopesUpdated(res.data);
}

defineRoute(
  routesScopes,
  "createScope",
  requireGlobalPermission({ requireAdmin: true }),
  log("createScope"),
  async (c, { body }) => {
    const res = await createScope(c.var.mainDb, {
      ...body,
      createdBy: c.var.globalUser.email,
    });
    if (res.success) await notifyScopes(c.var.mainDb);
    return c.json(res);
  },
);

defineRoute(
  routesScopes,
  "updateScope",
  requireGlobalPermission({ requireAdmin: true }),
  log("updateScope"),
  async (c, { params, body }) => {
    const res = await updateScope(c.var.mainDb, params.scope_id, body);
    if (res.success) await notifyScopes(c.var.mainDb);
    return c.json(res, failureStatus(res));
  },
);

defineRoute(
  routesScopes,
  "deleteScope",
  requireGlobalPermission({ requireAdmin: true }),
  log("deleteScope"),
  async (c, { params }) => {
    const res = await deleteScope(c.var.mainDb, params.scope_id);
    if (res.success) {
      await notifyScopes(c.var.mainDb);
      // The delete cascaded the scope's grants (user_scopes), so the roster's
      // scope access changed for every user who held it.
      notifyInstanceUsersUpdated(await getInstanceUsers(c.var.mainDb));
    }
    return c.json(res, failureStatus(res));
  },
);
