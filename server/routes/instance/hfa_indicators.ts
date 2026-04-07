import { Hono } from "hono";
import {
  getHfaIndicators,
  createHfaIndicator,
  updateHfaIndicator,
  deleteHfaIndicators,
  batchUploadHfaIndicators,
  getHfaIndicatorCode,
  updateHfaIndicatorCode,
  saveHfaIndicatorFull,
  getHfaDictionaryForValidation,
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
    const res = await createHfaIndicator(c.var.mainDb, body.indicator);
    return c.json(res);
  },
);

defineRoute(
  routesHfaIndicators,
  "updateHfaIndicator",
  requireGlobalPermission("can_configure_data"),
  async (c, { body }) => {
    const res = await updateHfaIndicator(c.var.mainDb, body.oldVarName, body.indicator);
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

defineRoute(
  routesHfaIndicators,
  "getHfaIndicatorCode",
  requireGlobalPermission("can_configure_data"),
  async (c, { body }) => {
    const res = await getHfaIndicatorCode(c.var.mainDb, body.varName);
    return c.json(res);
  },
);

defineRoute(
  routesHfaIndicators,
  "updateHfaIndicatorCode",
  requireGlobalPermission("can_configure_data"),
  async (c, { body }) => {
    const res = await updateHfaIndicatorCode(c.var.mainDb, body.varName, body.timePoint, body.rCode, body.rFilterCode);
    return c.json(res);
  },
);

defineRoute(
  routesHfaIndicators,
  "saveHfaIndicatorFull",
  requireGlobalPermission("can_configure_data"),
  async (c, { body }) => {
    const res = await saveHfaIndicatorFull(c.var.mainDb, body.oldVarName, body.indicator, body.code);
    return c.json(res);
  },
);

defineRoute(
  routesHfaIndicators,
  "getHfaDictionaryForValidation",
  requireGlobalPermission("can_configure_data"),
  async (c) => {
    const res = await getHfaDictionaryForValidation(c.var.mainDb);
    return c.json(res);
  },
);
