import { Hono } from "hono";
import {
  assertValidCalculatedIndicatorIdentifier,
  type CalculatedIndicator,
} from "lib";
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

function validateCalculatedIndicatorIds(indicator: CalculatedIndicator): {
  success: true;
} | { success: false; err: string } {
  try {
    assertValidCalculatedIndicatorIdentifier(
      indicator.calculated_indicator_id,
      "calculated_indicator_id",
    );
    assertValidCalculatedIndicatorIdentifier(
      indicator.num_indicator_id,
      "num_indicator_id",
    );
    if (indicator.denom.kind === "indicator") {
      assertValidCalculatedIndicatorIdentifier(
        indicator.denom.indicator_id,
        "denom_indicator_id",
      );
    }
    return { success: true };
  } catch (err) {
    return { success: false, err: (err as Error).message };
  }
}

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
    const validation = validateCalculatedIndicatorIds(body.indicator);
    if (!validation.success) {
      return c.json(validation);
    }
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
    const validation = validateCalculatedIndicatorIds(body.indicator);
    if (!validation.success) {
      return c.json(validation);
    }
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
