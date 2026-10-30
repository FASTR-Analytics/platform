import { Hono } from "hono";
import {
  batchUploadHfaIndicators,
  createHfaIndicator,
  createHfaIndicatorCategory,
  createHfaIndicatorServiceCategory,
  createHfaIndicatorSubCategory,
  createHfaIndicatorVariantGroup,
  createHfaIndicatorVariantItem,
  deleteHfaIndicatorCategory,
  deleteHfaIndicators,
  deleteHfaIndicatorServiceCategory,
  deleteHfaIndicatorSubCategory,
  deleteHfaIndicatorVariantGroup,
  deleteHfaIndicatorVariantItem,
  getAllHfaIndicatorCode,
  getAllHfaIndicatorVariantCode,
  getHfaDictionaryForValidation,
  getHfaIndicatorCategories,
  getHfaIndicatorCode,
  getHfaIndicators,
  getHfaIndicatorServiceCategories,
  getHfaIndicatorSubCategories,
  getHfaIndicatorVariantCode,
  getHfaIndicatorVariantGroups,
  getHfaIndicatorVariantItems,
  getInstanceIndicatorsSummary,
  importHfaIndicatorsWorkbook,
  reorderHfaIndicatorCategories,
  reorderHfaIndicatorServiceCategories,
  reorderHfaIndicatorSubCategories,
  reorderHfaIndicatorVariantGroups,
  reorderHfaIndicatorVariantItems,
  saveHfaIndicatorFull,
  saveHfaIndicatorsBatch,
  updateHfaIndicator,
  updateHfaIndicatorCategory,
  updateHfaIndicatorServiceCategory,
  updateHfaIndicatorSubCategory,
  updateHfaIndicatorVariantGroup,
  updateHfaIndicatorVariantItem,
} from "../../db/mod.ts";
import { log } from "../../middleware/logging.ts";
import { notifyInstanceIndicatorsUpdated } from "../../task_management/notify_instance_updated.ts";
import { defineRoute } from "../route-helpers.ts";
import { requirePermission } from "../../auth/guards.ts";

export const routesHfaIndicators = new Hono();

defineRoute(
  routesHfaIndicators,
  "importHfaIndicatorsWorkbook",
  requirePermission("can_configure_data"),
  log("importHfaIndicatorsWorkbook"),
  async (c, { body }) => {
    const res = await importHfaIndicatorsWorkbook(c.var.mainDb, body);
    if (res.success) {
      notifyInstanceIndicatorsUpdated(
        await getInstanceIndicatorsSummary(c.var.mainDb),
      );
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
  requirePermission("can_configure_data"),
  log("getHfaIndicatorCategories"),
  async (c) => {
    const res = await getHfaIndicatorCategories(c.var.mainDb);
    return c.json(res);
  },
);

defineRoute(
  routesHfaIndicators,
  "createHfaIndicatorCategory",
  requirePermission("can_configure_data"),
  log("createHfaIndicatorCategory"),
  async (c, { body }) => {
    const res = await createHfaIndicatorCategory(c.var.mainDb, body.category);
    if (res.success) {
      notifyInstanceIndicatorsUpdated(
        await getInstanceIndicatorsSummary(c.var.mainDb),
      );
    }
    return c.json(res);
  },
);

defineRoute(
  routesHfaIndicators,
  "updateHfaIndicatorCategory",
  requirePermission("can_configure_data"),
  log("updateHfaIndicatorCategory"),
  async (c, { body }) => {
    const res = await updateHfaIndicatorCategory(
      c.var.mainDb,
      body.oldId,
      body.category,
    );
    if (res.success) {
      notifyInstanceIndicatorsUpdated(
        await getInstanceIndicatorsSummary(c.var.mainDb),
      );
    }
    return c.json(res);
  },
);

defineRoute(
  routesHfaIndicators,
  "deleteHfaIndicatorCategory",
  requirePermission("can_configure_data"),
  log("deleteHfaIndicatorCategory"),
  async (c, { body }) => {
    const res = await deleteHfaIndicatorCategory(c.var.mainDb, body.id);
    if (res.success) {
      notifyInstanceIndicatorsUpdated(
        await getInstanceIndicatorsSummary(c.var.mainDb),
      );
    }
    return c.json(res);
  },
);

defineRoute(
  routesHfaIndicators,
  "reorderHfaIndicatorCategories",
  requirePermission("can_configure_data"),
  log("reorderHfaIndicatorCategories"),
  async (c, { body }) => {
    const res = await reorderHfaIndicatorCategories(
      c.var.mainDb,
      body.orderedIds,
    );
    if (res.success) {
      notifyInstanceIndicatorsUpdated(
        await getInstanceIndicatorsSummary(c.var.mainDb),
      );
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
  requirePermission("can_configure_data"),
  log("getHfaIndicatorSubCategories"),
  async (c) => {
    const res = await getHfaIndicatorSubCategories(c.var.mainDb);
    return c.json(res);
  },
);

defineRoute(
  routesHfaIndicators,
  "createHfaIndicatorSubCategory",
  requirePermission("can_configure_data"),
  log("createHfaIndicatorSubCategory"),
  async (c, { body }) => {
    const res = await createHfaIndicatorSubCategory(
      c.var.mainDb,
      body.subCategory,
    );
    if (res.success) {
      notifyInstanceIndicatorsUpdated(
        await getInstanceIndicatorsSummary(c.var.mainDb),
      );
    }
    return c.json(res);
  },
);

defineRoute(
  routesHfaIndicators,
  "updateHfaIndicatorSubCategory",
  requirePermission("can_configure_data"),
  log("updateHfaIndicatorSubCategory"),
  async (c, { body }) => {
    const res = await updateHfaIndicatorSubCategory(
      c.var.mainDb,
      body.oldId,
      body.subCategory,
    );
    if (res.success) {
      notifyInstanceIndicatorsUpdated(
        await getInstanceIndicatorsSummary(c.var.mainDb),
      );
    }
    return c.json(res);
  },
);

defineRoute(
  routesHfaIndicators,
  "deleteHfaIndicatorSubCategory",
  requirePermission("can_configure_data"),
  log("deleteHfaIndicatorSubCategory"),
  async (c, { body }) => {
    const res = await deleteHfaIndicatorSubCategory(c.var.mainDb, body.id);
    if (res.success) {
      notifyInstanceIndicatorsUpdated(
        await getInstanceIndicatorsSummary(c.var.mainDb),
      );
    }
    return c.json(res);
  },
);

defineRoute(
  routesHfaIndicators,
  "reorderHfaIndicatorSubCategories",
  requirePermission("can_configure_data"),
  log("reorderHfaIndicatorSubCategories"),
  async (c, { body }) => {
    const res = await reorderHfaIndicatorSubCategories(
      c.var.mainDb,
      body.categoryId,
      body.orderedIds,
    );
    if (res.success) {
      notifyInstanceIndicatorsUpdated(
        await getInstanceIndicatorsSummary(c.var.mainDb),
      );
    }
    return c.json(res);
  },
);

// ============================================================================
// Service Categories
// ============================================================================

defineRoute(
  routesHfaIndicators,
  "getHfaIndicatorServiceCategories",
  requirePermission("can_configure_data"),
  log("getHfaIndicatorServiceCategories"),
  async (c) => {
    const res = await getHfaIndicatorServiceCategories(c.var.mainDb);
    return c.json(res);
  },
);

defineRoute(
  routesHfaIndicators,
  "createHfaIndicatorServiceCategory",
  requirePermission("can_configure_data"),
  log("createHfaIndicatorServiceCategory"),
  async (c, { body }) => {
    const res = await createHfaIndicatorServiceCategory(
      c.var.mainDb,
      body.serviceCategory,
    );
    if (res.success) {
      notifyInstanceIndicatorsUpdated(
        await getInstanceIndicatorsSummary(c.var.mainDb),
      );
    }
    return c.json(res);
  },
);

defineRoute(
  routesHfaIndicators,
  "updateHfaIndicatorServiceCategory",
  requirePermission("can_configure_data"),
  log("updateHfaIndicatorServiceCategory"),
  async (c, { body }) => {
    const res = await updateHfaIndicatorServiceCategory(
      c.var.mainDb,
      body.oldId,
      body.serviceCategory,
    );
    if (res.success) {
      notifyInstanceIndicatorsUpdated(
        await getInstanceIndicatorsSummary(c.var.mainDb),
      );
    }
    return c.json(res);
  },
);

defineRoute(
  routesHfaIndicators,
  "deleteHfaIndicatorServiceCategory",
  requirePermission("can_configure_data"),
  log("deleteHfaIndicatorServiceCategory"),
  async (c, { body }) => {
    const res = await deleteHfaIndicatorServiceCategory(c.var.mainDb, body.id);
    if (res.success) {
      notifyInstanceIndicatorsUpdated(
        await getInstanceIndicatorsSummary(c.var.mainDb),
      );
    }
    return c.json(res);
  },
);

defineRoute(
  routesHfaIndicators,
  "reorderHfaIndicatorServiceCategories",
  requirePermission("can_configure_data"),
  log("reorderHfaIndicatorServiceCategories"),
  async (c, { body }) => {
    const res = await reorderHfaIndicatorServiceCategories(
      c.var.mainDb,
      body.orderedIds,
    );
    if (res.success) {
      notifyInstanceIndicatorsUpdated(
        await getInstanceIndicatorsSummary(c.var.mainDb),
      );
    }
    return c.json(res);
  },
);

// ============================================================================
// Variant Groups / Items
// ============================================================================

defineRoute(
  routesHfaIndicators,
  "getHfaIndicatorVariantGroups",
  requirePermission("can_configure_data"),
  log("getHfaIndicatorVariantGroups"),
  async (c) => {
    const res = await getHfaIndicatorVariantGroups(c.var.mainDb);
    return c.json(res);
  },
);

defineRoute(
  routesHfaIndicators,
  "createHfaIndicatorVariantGroup",
  requirePermission("can_configure_data"),
  log("createHfaIndicatorVariantGroup"),
  async (c, { body }) => {
    const res = await createHfaIndicatorVariantGroup(c.var.mainDb, body.group);
    if (res.success) {
      notifyInstanceIndicatorsUpdated(
        await getInstanceIndicatorsSummary(c.var.mainDb),
      );
    }
    return c.json(res);
  },
);

defineRoute(
  routesHfaIndicators,
  "updateHfaIndicatorVariantGroup",
  requirePermission("can_configure_data"),
  log("updateHfaIndicatorVariantGroup"),
  async (c, { body }) => {
    const res = await updateHfaIndicatorVariantGroup(
      c.var.mainDb,
      body.oldId,
      body.group,
    );
    if (res.success) {
      notifyInstanceIndicatorsUpdated(
        await getInstanceIndicatorsSummary(c.var.mainDb),
      );
    }
    return c.json(res);
  },
);

defineRoute(
  routesHfaIndicators,
  "deleteHfaIndicatorVariantGroup",
  requirePermission("can_configure_data"),
  log("deleteHfaIndicatorVariantGroup"),
  async (c, { body }) => {
    const res = await deleteHfaIndicatorVariantGroup(c.var.mainDb, body.id);
    if (res.success) {
      notifyInstanceIndicatorsUpdated(
        await getInstanceIndicatorsSummary(c.var.mainDb),
      );
    }
    return c.json(res);
  },
);

defineRoute(
  routesHfaIndicators,
  "reorderHfaIndicatorVariantGroups",
  requirePermission("can_configure_data"),
  log("reorderHfaIndicatorVariantGroups"),
  async (c, { body }) => {
    const res = await reorderHfaIndicatorVariantGroups(
      c.var.mainDb,
      body.orderedIds,
    );
    if (res.success) {
      notifyInstanceIndicatorsUpdated(
        await getInstanceIndicatorsSummary(c.var.mainDb),
      );
    }
    return c.json(res);
  },
);

defineRoute(
  routesHfaIndicators,
  "getHfaIndicatorVariantItems",
  requirePermission("can_configure_data"),
  log("getHfaIndicatorVariantItems"),
  async (c) => {
    const res = await getHfaIndicatorVariantItems(c.var.mainDb);
    return c.json(res);
  },
);

defineRoute(
  routesHfaIndicators,
  "createHfaIndicatorVariantItem",
  requirePermission("can_configure_data"),
  log("createHfaIndicatorVariantItem"),
  async (c, { body }) => {
    const res = await createHfaIndicatorVariantItem(c.var.mainDb, body.item);
    if (res.success) {
      notifyInstanceIndicatorsUpdated(
        await getInstanceIndicatorsSummary(c.var.mainDb),
      );
    }
    return c.json(res);
  },
);

defineRoute(
  routesHfaIndicators,
  "updateHfaIndicatorVariantItem",
  requirePermission("can_configure_data"),
  log("updateHfaIndicatorVariantItem"),
  async (c, { body }) => {
    const res = await updateHfaIndicatorVariantItem(
      c.var.mainDb,
      body.oldId,
      body.item,
    );
    if (res.success) {
      notifyInstanceIndicatorsUpdated(
        await getInstanceIndicatorsSummary(c.var.mainDb),
      );
    }
    return c.json(res);
  },
);

defineRoute(
  routesHfaIndicators,
  "deleteHfaIndicatorVariantItem",
  requirePermission("can_configure_data"),
  log("deleteHfaIndicatorVariantItem"),
  async (c, { body }) => {
    const res = await deleteHfaIndicatorVariantItem(c.var.mainDb, body.id);
    if (res.success) {
      notifyInstanceIndicatorsUpdated(
        await getInstanceIndicatorsSummary(c.var.mainDb),
      );
    }
    return c.json(res);
  },
);

defineRoute(
  routesHfaIndicators,
  "reorderHfaIndicatorVariantItems",
  requirePermission("can_configure_data"),
  log("reorderHfaIndicatorVariantItems"),
  async (c, { body }) => {
    const res = await reorderHfaIndicatorVariantItems(
      c.var.mainDb,
      body.groupId,
      body.orderedIds,
    );
    if (res.success) {
      notifyInstanceIndicatorsUpdated(
        await getInstanceIndicatorsSummary(c.var.mainDb),
      );
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
  requirePermission("can_configure_data"),
  log("getHfaIndicators"),
  async (c) => {
    const res = await getHfaIndicators(c.var.mainDb);
    return c.json(res);
  },
);

defineRoute(
  routesHfaIndicators,
  "createHfaIndicator",
  requirePermission("can_configure_data"),
  log("createHfaIndicator"),
  async (c, { body }) => {
    const res = await createHfaIndicator(c.var.mainDb, body.indicator);
    if (res.success) {
      notifyInstanceIndicatorsUpdated(
        await getInstanceIndicatorsSummary(c.var.mainDb),
      );
    }
    return c.json(res);
  },
);

defineRoute(
  routesHfaIndicators,
  "updateHfaIndicator",
  requirePermission("can_configure_data"),
  log("updateHfaIndicator"),
  async (c, { body }) => {
    const res = await updateHfaIndicator(c.var.mainDb, body.indicator);
    if (res.success) {
      notifyInstanceIndicatorsUpdated(
        await getInstanceIndicatorsSummary(c.var.mainDb),
      );
    }
    return c.json(res);
  },
);

defineRoute(
  routesHfaIndicators,
  "deleteHfaIndicators",
  requirePermission("can_configure_data"),
  log("deleteHfaIndicators"),
  async (c, { body }) => {
    const res = await deleteHfaIndicators(c.var.mainDb, body.indicatorIds);
    if (res.success) {
      notifyInstanceIndicatorsUpdated(
        await getInstanceIndicatorsSummary(c.var.mainDb),
      );
    }
    return c.json(res);
  },
);

defineRoute(
  routesHfaIndicators,
  "batchUploadHfaIndicators",
  requirePermission("can_configure_data"),
  log("batchUploadHfaIndicators"),
  async (c, { body }) => {
    const res = await batchUploadHfaIndicators(
      c.var.mainDb,
      body.indicators,
      body.code,
      body.variantCode,
    );
    if (res.success) {
      notifyInstanceIndicatorsUpdated(
        await getInstanceIndicatorsSummary(c.var.mainDb),
      );
    }
    return c.json(res);
  },
);

defineRoute(
  routesHfaIndicators,
  "getHfaIndicatorCode",
  requirePermission("can_configure_data"),
  log("getHfaIndicatorCode"),
  async (c, { body }) => {
    const res = await getHfaIndicatorCode(c.var.mainDb, body.indicatorId);
    return c.json(res);
  },
);

defineRoute(
  routesHfaIndicators,
  "getAllHfaIndicatorCode",
  requirePermission("can_configure_data"),
  log("getAllHfaIndicatorCode"),
  async (c) => {
    const data = await getAllHfaIndicatorCode(c.var.mainDb);
    return c.json({ success: true, data });
  },
);

defineRoute(
  routesHfaIndicators,
  "getHfaIndicatorVariantCode",
  requirePermission("can_configure_data"),
  log("getHfaIndicatorVariantCode"),
  async (c, { body }) => {
    const res = await getHfaIndicatorVariantCode(
      c.var.mainDb,
      body.indicatorId,
    );
    return c.json(res);
  },
);

defineRoute(
  routesHfaIndicators,
  "getAllHfaIndicatorVariantCode",
  requirePermission("can_configure_data"),
  log("getAllHfaIndicatorVariantCode"),
  async (c) => {
    const data = await getAllHfaIndicatorVariantCode(c.var.mainDb);
    return c.json({ success: true, data });
  },
);

defineRoute(
  routesHfaIndicators,
  "saveHfaIndicatorFull",
  requirePermission("can_configure_data"),
  log("saveHfaIndicatorFull"),
  async (c, { body }) => {
    const res = await saveHfaIndicatorFull(
      c.var.mainDb,
      body.indicator,
      body.code,
      body.variantCode,
    );
    if (res.success) {
      notifyInstanceIndicatorsUpdated(
        await getInstanceIndicatorsSummary(c.var.mainDb),
      );
    }
    return c.json(res);
  },
);

defineRoute(
  routesHfaIndicators,
  "saveHfaIndicatorsBatch",
  requirePermission("can_configure_data"),
  log("saveHfaIndicatorsBatch"),
  async (c, { body }) => {
    const res = await saveHfaIndicatorsBatch(c.var.mainDb, body.indicators);
    if (res.success) {
      notifyInstanceIndicatorsUpdated(
        await getInstanceIndicatorsSummary(c.var.mainDb),
      );
    }
    return c.json(res);
  },
);

defineRoute(
  routesHfaIndicators,
  "getHfaDictionaryForValidation",
  requirePermission("can_configure_data"),
  log("getHfaDictionaryForValidation"),
  async (c) => {
    const res = await getHfaDictionaryForValidation(c.var.mainDb);
    return c.json(res);
  },
);
