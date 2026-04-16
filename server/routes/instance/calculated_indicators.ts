import { Hono } from "hono";
import {
  createCalculatedIndicator,
  deleteCalculatedIndicators,
  getInstanceIndicatorsSummary,
  getCalculatedIndicators,
  updateCalculatedIndicator,
} from "../../db/mod.ts";
import { requireGlobalPermission } from "../../middleware/mod.ts";
import { notifyInstanceIndicatorsUpdated } from "../../task_management/notify_instance_updated.ts";
import { defineRoute } from "../route-helpers.ts";

export const routesCalculatedIndicators = new Hono();

defineRoute(
  routesCalculatedIndicators,
  "getCalculatedIndicators",
  requireGlobalPermission("can_configure_data"),
  async (c) => {
    const res = await getCalculatedIndicators(c.var.mainDb);
    return c.json(res);
  },
);

defineRoute(
  routesCalculatedIndicators,
  "createCalculatedIndicator",
  requireGlobalPermission("can_configure_data"),
  async (c, { body }) => {
    const res = await createCalculatedIndicator(c.var.mainDb, body.indicator);
    if (res.success) {
      notifyInstanceIndicatorsUpdated(
        await getInstanceIndicatorsSummary(c.var.mainDb),
      );
    }
    return c.json(res);
  },
);

defineRoute(
  routesCalculatedIndicators,
  "updateCalculatedIndicator",
  requireGlobalPermission("can_configure_data"),
  async (c, { body }) => {
    const res = await updateCalculatedIndicator(
      c.var.mainDb,
      body.oldCalculatedIndicatorId,
      body.indicator,
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
  routesCalculatedIndicators,
  "deleteCalculatedIndicators",
  requireGlobalPermission("can_configure_data"),
  async (c, { body }) => {
    const res = await deleteCalculatedIndicators(
      c.var.mainDb,
      body.calculatedIndicatorIds,
    );
    if (res.success) {
      notifyInstanceIndicatorsUpdated(
        await getInstanceIndicatorsSummary(c.var.mainDb),
      );
    }
    return c.json(res);
  },
);
