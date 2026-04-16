import { Hono } from "hono";
import {
  createScorecardIndicator,
  deleteScorecardIndicators,
  getInstanceIndicatorsSummary,
  getScorecardIndicators,
  updateScorecardIndicator,
} from "../../db/mod.ts";
import { requireGlobalPermission } from "../../middleware/mod.ts";
import { notifyInstanceIndicatorsUpdated } from "../../task_management/notify_instance_updated.ts";
import { defineRoute } from "../route-helpers.ts";

export const routesScorecardIndicators = new Hono();

defineRoute(
  routesScorecardIndicators,
  "getScorecardIndicators",
  requireGlobalPermission("can_configure_data"),
  async (c) => {
    const res = await getScorecardIndicators(c.var.mainDb);
    return c.json(res);
  },
);

defineRoute(
  routesScorecardIndicators,
  "createScorecardIndicator",
  requireGlobalPermission("can_configure_data"),
  async (c, { body }) => {
    const res = await createScorecardIndicator(c.var.mainDb, body.indicator);
    if (res.success) {
      notifyInstanceIndicatorsUpdated(
        await getInstanceIndicatorsSummary(c.var.mainDb),
      );
    }
    return c.json(res);
  },
);

defineRoute(
  routesScorecardIndicators,
  "updateScorecardIndicator",
  requireGlobalPermission("can_configure_data"),
  async (c, { body }) => {
    const res = await updateScorecardIndicator(
      c.var.mainDb,
      body.oldScorecardIndicatorId,
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
  routesScorecardIndicators,
  "deleteScorecardIndicators",
  requireGlobalPermission("can_configure_data"),
  async (c, { body }) => {
    const res = await deleteScorecardIndicators(
      c.var.mainDb,
      body.scorecardIndicatorIds,
    );
    if (res.success) {
      notifyInstanceIndicatorsUpdated(
        await getInstanceIndicatorsSummary(c.var.mainDb),
      );
    }
    return c.json(res);
  },
);
