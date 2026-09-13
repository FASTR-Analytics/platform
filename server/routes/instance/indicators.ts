import { Hono } from "hono";
import { type HmisIndicatorDefinitionInput, isHmisIndicatorType } from "lib";
import {
  createIndicators,
  deleteIndicators,
  getInstanceIndicatorDetails,
  getInstanceIndicatorsSummary,
  type NewIndicator,
  reorderHmisIndicators,
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
// vocabulary available. An Uploaded indicator posts no data id, and one
// posted anyway is dropped here: its key is the server's (PLAN_A6 ruling 1).
export function narrowIndicatorDefinition(
  raw: { type: string } & Record<string, unknown>,
): HmisIndicatorDefinitionInput {
  if (!isHmisIndicatorType(raw.type)) {
    throw new Error(`Unknown indicator type: ${raw.type}`);
  }
  switch (raw.type) {
    case "uploaded":
      return { type: "uploaded" };
    case "dhis2_element":
      return { type: "dhis2_element", data_id: String(raw.data_id) };
    case "sum":
      return {
        type: "sum",
        members: (raw.members as unknown[]).map((m) => String(m)),
      };
    case "derived":
      return { type: "derived", expression: String(raw.expression) };
  }
}

function toNewIndicator(raw: Record<string, unknown>): NewIndicator {
  return {
    indicator_common_id: String(raw.indicator_common_id),
    indicator_common_label: String(raw.indicator_common_label),
    definition: narrowIndicatorDefinition(
      raw.definition as { type: string } & Record<string, unknown>,
    ),
    include_in_analysis: Boolean(raw.include_in_analysis),
    format_as: raw.format_as as NewIndicator["format_as"],
    thresholds: (raw.thresholds ?? null) as NewIndicator["thresholds"],
  };
}

// GET /indicators - The dictionary: every indicator
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

// POST /indicators - Create indicators
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

// POST /indicators/update - Update an indicator
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
    const res = await reorderHmisIndicators(c.var.mainDb, body.order);
    if (res.success) {
      notifyInstanceIndicatorsUpdated(
        await getInstanceIndicatorsSummary(c.var.mainDb),
      );
    }
    return c.json(res);
  },
);

// POST /indicators/delete - Delete indicators
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
