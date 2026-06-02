import { Hono } from "hono";
import {
  getHfaIndicators,
  getHfaIndicatorCategories,
  getHfaIndicatorSubCategories,
  createHfaIndicatorCategory,
  updateHfaIndicatorCategory,
  deleteHfaIndicatorCategory,
  reorderHfaIndicatorCategories,
  createHfaIndicatorSubCategory,
  updateHfaIndicatorSubCategory,
  deleteHfaIndicatorSubCategory,
  reorderHfaIndicatorSubCategories,
  getInstanceIndicatorsSummary,
  importHfaIndicatorsWorkbook,
  createHfaIndicator,
  updateHfaIndicator,
  deleteHfaIndicators,
  batchUploadHfaIndicators,
  getHfaIndicatorCode,
  getAllHfaIndicatorCode,
  updateHfaIndicatorCode,
  saveHfaIndicatorFull,
  getHfaDictionaryForValidation,
  bulkUpdateHfaIndicatorValidation,
} from "../../db/mod.ts";
import { requireGlobalPermission } from "../../middleware/mod.ts";
import { notifyInstanceIndicatorsUpdated } from "../../task_management/notify_instance_updated.ts";
import { defineRoute } from "../route-helpers.ts";

export const routesHfaIndicators = new Hono();

defineRoute(
  routesHfaIndicators,
  "importHfaIndicatorsWorkbook",
  requireGlobalPermission("can_configure_data"),
  async (c, { body }) => {
    const res = await importHfaIndicatorsWorkbook(c.var.mainDb, body);
    if (res.success) {
      notifyInstanceIndicatorsUpdated(await getInstanceIndicatorsSummary(c.var.mainDb));
    }
    return c.json(res);
  },
);

// ============================================================================
// Categories
// ============================================================================

defineRoute(
  routesHfaIndicators,
  "getHfaIndicatorCategories",
  requireGlobalPermission("can_configure_data"),
  async (c) => {
    const res = await getHfaIndicatorCategories(c.var.mainDb);
    return c.json(res);
  },
);

defineRoute(
  routesHfaIndicators,
  "createHfaIndicatorCategory",
  requireGlobalPermission("can_configure_data"),
  async (c, { body }) => {
    const res = await createHfaIndicatorCategory(c.var.mainDb, body.category);
    if (res.success) {
      notifyInstanceIndicatorsUpdated(await getInstanceIndicatorsSummary(c.var.mainDb));
    }
    return c.json(res);
  },
);

defineRoute(
  routesHfaIndicators,
  "updateHfaIndicatorCategory",
  requireGlobalPermission("can_configure_data"),
  async (c, { body }) => {
    const res = await updateHfaIndicatorCategory(c.var.mainDb, body.oldId, body.category);
    if (res.success) {
      notifyInstanceIndicatorsUpdated(await getInstanceIndicatorsSummary(c.var.mainDb));
    }
    return c.json(res);
  },
);

defineRoute(
  routesHfaIndicators,
  "deleteHfaIndicatorCategory",
  requireGlobalPermission("can_configure_data"),
  async (c, { body }) => {
    const res = await deleteHfaIndicatorCategory(c.var.mainDb, body.id);
    if (res.success) {
      notifyInstanceIndicatorsUpdated(await getInstanceIndicatorsSummary(c.var.mainDb));
    }
    return c.json(res);
  },
);

defineRoute(
  routesHfaIndicators,
  "reorderHfaIndicatorCategories",
  requireGlobalPermission("can_configure_data"),
  async (c, { body }) => {
    const res = await reorderHfaIndicatorCategories(c.var.mainDb, body.orderedIds);
    if (res.success) {
      notifyInstanceIndicatorsUpdated(await getInstanceIndicatorsSummary(c.var.mainDb));
    }
    return c.json(res);
  },
);

// ============================================================================
// Sub-Categories
// ============================================================================

defineRoute(
  routesHfaIndicators,
  "getHfaIndicatorSubCategories",
  requireGlobalPermission("can_configure_data"),
  async (c) => {
    const res = await getHfaIndicatorSubCategories(c.var.mainDb);
    return c.json(res);
  },
);

defineRoute(
  routesHfaIndicators,
  "createHfaIndicatorSubCategory",
  requireGlobalPermission("can_configure_data"),
  async (c, { body }) => {
    const res = await createHfaIndicatorSubCategory(c.var.mainDb, body.subCategory);
    if (res.success) {
      notifyInstanceIndicatorsUpdated(await getInstanceIndicatorsSummary(c.var.mainDb));
    }
    return c.json(res);
  },
);

defineRoute(
  routesHfaIndicators,
  "updateHfaIndicatorSubCategory",
  requireGlobalPermission("can_configure_data"),
  async (c, { body }) => {
    const res = await updateHfaIndicatorSubCategory(c.var.mainDb, body.oldId, body.subCategory);
    if (res.success) {
      notifyInstanceIndicatorsUpdated(await getInstanceIndicatorsSummary(c.var.mainDb));
    }
    return c.json(res);
  },
);

defineRoute(
  routesHfaIndicators,
  "deleteHfaIndicatorSubCategory",
  requireGlobalPermission("can_configure_data"),
  async (c, { body }) => {
    const res = await deleteHfaIndicatorSubCategory(c.var.mainDb, body.id);
    if (res.success) {
      notifyInstanceIndicatorsUpdated(await getInstanceIndicatorsSummary(c.var.mainDb));
    }
    return c.json(res);
  },
);

defineRoute(
  routesHfaIndicators,
  "reorderHfaIndicatorSubCategories",
  requireGlobalPermission("can_configure_data"),
  async (c, { body }) => {
    const res = await reorderHfaIndicatorSubCategories(c.var.mainDb, body.categoryId, body.orderedIds);
    if (res.success) {
      notifyInstanceIndicatorsUpdated(await getInstanceIndicatorsSummary(c.var.mainDb));
    }
    return c.json(res);
  },
);

// ============================================================================
// Indicators
// ============================================================================

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
    if (res.success) {
      notifyInstanceIndicatorsUpdated(await getInstanceIndicatorsSummary(c.var.mainDb));
    }
    return c.json(res);
  },
);

defineRoute(
  routesHfaIndicators,
  "updateHfaIndicator",
  requireGlobalPermission("can_configure_data"),
  async (c, { body }) => {
    const res = await updateHfaIndicator(c.var.mainDb, body.oldVarName, body.indicator);
    if (res.success) {
      notifyInstanceIndicatorsUpdated(await getInstanceIndicatorsSummary(c.var.mainDb));
    }
    return c.json(res);
  },
);

defineRoute(
  routesHfaIndicators,
  "deleteHfaIndicators",
  requireGlobalPermission("can_configure_data"),
  async (c, { body }) => {
    const res = await deleteHfaIndicators(c.var.mainDb, body.varNames);
    if (res.success) {
      notifyInstanceIndicatorsUpdated(await getInstanceIndicatorsSummary(c.var.mainDb));
    }
    return c.json(res);
  },
);

defineRoute(
  routesHfaIndicators,
  "batchUploadHfaIndicators",
  requireGlobalPermission("can_configure_data"),
  async (c, { body }) => {
    const res = await batchUploadHfaIndicators(c.var.mainDb, body.indicators, body.code, body.replaceAll);
    if (res.success) {
      notifyInstanceIndicatorsUpdated(await getInstanceIndicatorsSummary(c.var.mainDb));
    }
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
  "getAllHfaIndicatorCode",
  requireGlobalPermission("can_configure_data"),
  async (c) => {
    const data = await getAllHfaIndicatorCode(c.var.mainDb);
    return c.json({ success: true, data });
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
    const res = await saveHfaIndicatorFull(c.var.mainDb, body.oldVarName, body.indicator, body.code, body.hasSyntaxError, body.codeConsistent);
    if (res.success) {
      notifyInstanceIndicatorsUpdated(await getInstanceIndicatorsSummary(c.var.mainDb));
    }
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

defineRoute(
  routesHfaIndicators,
  "bulkUpdateHfaIndicatorValidation",
  requireGlobalPermission("can_configure_data"),
  async (c, { body }) => {
    const res = await bulkUpdateHfaIndicatorValidation(c.var.mainDb, body.updates);
    if (res.success) {
      notifyInstanceIndicatorsUpdated(await getInstanceIndicatorsSummary(c.var.mainDb));
    }
    return c.json(res);
  },
);
