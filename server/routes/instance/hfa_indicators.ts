import { Hono } from "hono";
import {
  getHfaIndicators,
  createHfaIndicator,
  updateHfaIndicator,
  deleteHfaIndicators,
  batchUploadHfaIndicators,
} from "../../db/mod.ts";
import { requireGlobalPermission } from "../../middleware/mod.ts";
import { defineRoute } from "../route-helpers.ts";

export const routesHfaIndicators = new Hono();

defineRoute(
  routesHfaIndicators,
  "getHfaIndicators",
  requireGlobalPermission("can_configure_data"),
  async (c) => {
    const res = await getHfaIndicators(c.var.mainDb);
    return c.json(res);
  },
);

defineRoute(
  routesHfaIndicators,
  "createHfaIndicator",
  requireGlobalPermission("can_configure_data"),
  async (c, { body }) => {
    const res = await createHfaIndicator(c.var.mainDb, body.indicator, body.sortOrder);
    return c.json(res);
  },
);

defineRoute(
  routesHfaIndicators,
  "updateHfaIndicator",
  requireGlobalPermission("can_configure_data"),
  async (c, { body }) => {
    const res = await updateHfaIndicator(c.var.mainDb, body.oldVarName, body.indicator, body.sortOrder);
    return c.json(res);
  },
);

defineRoute(
  routesHfaIndicators,
  "deleteHfaIndicators",
  requireGlobalPermission("can_configure_data"),
  async (c, { body }) => {
    const res = await deleteHfaIndicators(c.var.mainDb, body.varNames);
    return c.json(res);
  },
);

defineRoute(
  routesHfaIndicators,
  "batchUploadHfaIndicators",
  requireGlobalPermission("can_configure_data"),
  async (c, { body }) => {
    const res = await batchUploadHfaIndicators(c.var.mainDb, body.indicators, body.replaceAll);
    return c.json(res);
  },
);
