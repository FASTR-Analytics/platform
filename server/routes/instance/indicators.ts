import { Hono } from "hono";
import { type CommonIndicatorDefinition, isCommonIndicatorType } from "lib";
import {
  batchUploadIndicators,
  createIndicators,
  deleteIndicators,
  getInstanceIndicatorDetails,
  getInstanceIndicatorsSummary,
  type NewIndicator,
  reorderCommonIndicators,
  updateIndicator,
} from "../../db/mod.ts";
import { log } from "../../middleware/logging.ts";
import { requireGlobalPermission } from "../../middleware/mod.ts";
import { notifyInstanceIndicatorsUpdated } from "../../task_management/notify_instance_updated.ts";
import { defineRoute } from "../route-helpers.ts";

export const routesIndicators = new Hono();

// The definition arrives already shape-checked by the route registry's Zod
// body schema. The expression: its grammar, its indicators and its
// population terms: is validated in the DB layer against the live
// dictionary and the population store, because only there is the full
// vocabulary available.
function narrowIndicatorDefinition(
  raw: { type: string } & Record<string, unknown>,
): CommonIndicatorDefinition {
  if (!isCommonIndicatorType(raw.type)) {
    throw new Error(`Unknown indicator type: ${raw.type}`);
  }
  if (raw.type === "base") {
    return { type: "base" };
  }
  return { type: "derived", expression: String(raw.expression) };
}

function toNewIndicator(raw: Record<string, unknown>): NewIndicator {
  return {
    indicator_common_id: String(raw.indicator_common_id),
    indicator_common_label: String(raw.indicator_common_label),
    sources: raw.sources as NewIndicator["sources"],
    definition: narrowIndicatorDefinition(
      raw.definition as { type: string } & Record<string, unknown>,
    ),
    format_as: raw.format_as as NewIndicator["format_as"],
    thresholds: (raw.thresholds ?? null) as NewIndicator["thresholds"],
  };
}

// GET /indicators - The dictionary: every indicator with its sources
defineRoute(
  routesIndicators,
  "getIndicators",
  requireGlobalPermission("can_configure_data"),
  log("getIndicators"),
  async (c) => {
    const res = await getInstanceIndicatorDetails(c.var.mainDb);
    return c.json(res);
  },
);

// POST /indicators - Create indicators, each with its sources
defineRoute(
  routesIndicators,
  "createIndicators",
  requireGlobalPermission("can_configure_data"),
  log("createIndicators"),
  async (c, { body }) => {
    let indicators: NewIndicator[];
    try {
      indicators = body.indicators.map(toNewIndicator);
    } catch (err) {
      return c.json({ success: false, err: (err as Error).message });
    }

    const res = await createIndicators(c.var.mainDb, indicators);
    if (res.success) {
      notifyInstanceIndicatorsUpdated(
        await getInstanceIndicatorsSummary(c.var.mainDb),
      );
    }
    return c.json(res);
  },
);

// POST /indicators/update - Update an indicator and replace its sources
defineRoute(
  routesIndicators,
  "updateIndicator",
  requireGlobalPermission("can_configure_data"),
  log("updateIndicator"),
  async (c, { body }) => {
    let indicator: NewIndicator;
    try {
      indicator = toNewIndicator(body.indicator);
    } catch (err) {
      return c.json({ success: false, err: (err as Error).message });
    }

    const res = await updateIndicator(
      c.var.mainDb,
      body.old_indicator_common_id,
      indicator,
    );
    if (res.success) {
      notifyInstanceIndicatorsUpdated(
        await getInstanceIndicatorsSummary(c.var.mainDb),
      );
    }
    return c.json(res);
  },
);

// POST /indicators/reorder - Set the dictionary's display order
defineRoute(
  routesIndicators,
  "reorderIndicators",
  requireGlobalPermission("can_configure_data"),
  log("reorderIndicators"),
  async (c, { body }) => {
    const res = await reorderCommonIndicators(c.var.mainDb, body.order);
    if (res.success) {
      notifyInstanceIndicatorsUpdated(
        await getInstanceIndicatorsSummary(c.var.mainDb),
      );
    }
    return c.json(res);
  },
);

// POST /indicators/delete - Delete indicators (their sources go with them)
defineRoute(
  routesIndicators,
  "deleteIndicators",
  requireGlobalPermission("can_configure_data"),
  log("deleteIndicators"),
  async (c, { body }) => {
    const res = await deleteIndicators(c.var.mainDb, body.indicator_common_ids);
    if (res.success) {
      notifyInstanceIndicatorsUpdated(
        await getInstanceIndicatorsSummary(c.var.mainDb),
      );
    }
    return c.json(res);
  },
);

// POST /indicators/batch - Batch upload the dictionary file (PLAN_A3 ruling 11)
defineRoute(
  routesIndicators,
  "batchUploadIndicators",
  requireGlobalPermission("can_configure_data"),
  log("batchUploadIndicators"),
  async (c, { body }) => {
    const res = await batchUploadIndicators(
      c.var.mainDb,
      body.asset_file_name,
      body.replace_all_existing,
    );
    if (res.success) {
      notifyInstanceIndicatorsUpdated(
        await getInstanceIndicatorsSummary(c.var.mainDb),
      );
    }
    return c.json(res);
  },
);
