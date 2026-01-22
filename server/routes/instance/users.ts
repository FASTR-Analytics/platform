import { Hono } from "hono";
import {
  addUsers,
  batchUploadUsers,
  deleteUser,
  getOtherUser,
  toggleAdmin,
} from "../../db/mod.ts";
import { defineRoute } from "../route-helpers.ts";
import { getGlobalAdmin, getGlobalNonAdmin } from "../../project_auth.ts";
import { _IS_PRODUCTION } from "../../exposed_env_vars.ts";
import { GetLogs } from "../../db/instance/user_logs.ts";
import { log } from "../../middleware/logging.ts";

export const routesUsers = new Hono();

defineRoute(routesUsers, "getCurrentUser", getGlobalNonAdmin, log("getCurrentUser"), async (c) => {
  return c.json({ success: true, data: c.var.globalUser });
});

defineRoute(
  routesUsers,
  "getOtherUser",
  getGlobalAdmin,
  log("getOtherUser"),
  async (c, { params }) => {
    const res = await getOtherUser(c.var.mainDb, params.email);
    return c.json(res);
  }
);

defineRoute(routesUsers, "addUsers", getGlobalAdmin, log("addUsers"), async (c, { body }) => {
  const resUser = await addUsers(c.var.mainDb, body.emails, body.isGlobalAdmin);
  return c.json(resUser);
});

defineRoute(
  routesUsers,
  "toggleUserAdmin",
  getGlobalAdmin,
  log("toggleUserAdmin"),
  async (c, { body }) => {
    if (!body.emails || !Array.isArray(body.emails)) {
      throw new Error("Invalid request: emails array is required");
    }
    if (body.emails.includes(c.var.globalUser.email)) {
      throw new Error(
        "You cannot remove yourself as admin. Ask another admin to do this."
      );
    }
    const resUser = await toggleAdmin(
      c.var.mainDb,
      body.emails,
      body.makeAdmin
    );
    return c.json(resUser);
  }
);

defineRoute(routesUsers, "deleteUser", getGlobalAdmin, log("deleteUser"), async (c, { body }) => {
  if (!body.emails || !Array.isArray(body.emails)) {
    throw new Error("Invalid request: emails array is required");
  }
  if (body.emails.includes(c.var.globalUser.email)) {
    throw new Error(
      "You cannot remove yourself as a user. Ask another admin to do this."
    );
  }
  const res = await deleteUser(c.var.mainDb, body.emails);
  return c.json(res);
});

defineRoute(
  routesUsers,
  "batchUploadUsers",
  getGlobalAdmin,
  log("batchUploadUsers"),
  async (c, { body }) => {
    if (!body.asset_file_name || typeof body.asset_file_name !== "string") {
      return c.json({
        success: false,
        err: "asset_file_name is required and must be a string",
      });
    }

    const res = await batchUploadUsers(
      c.var.mainDb,
      body.asset_file_name,
      body.replace_all_existing,
      c.var.globalUser.email
    );
    return c.json(res);
  }
);

defineRoute(
  routesUsers,
  "getAllUserLogs",
  getGlobalAdmin,
  log("getAllUserLogs"),
  async(c) => {
    const res = await GetLogs(c.var.mainDb);
    return c.json(res);
  }
);