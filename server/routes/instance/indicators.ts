import { Hono } from "hono";
import type { Sql } from "postgres";
import { type HmisIndicatorDefinitionInput, isHmisIndicatorType } from "lib";
import {
  createIndicators,
  deleteIndicators,
  type Dhis2ElementIdCheck,
  getInstanceIndicatorDetails,
  getInstanceIndicatorsSummary,
  getStoredDhis2CredentialsDecrypted,
  type NewIndicator,
  reorderHmisIndicators,
  setIndicatorsIncludeInAnalysis,
  updateIndicator,
} from "../../db/mod.ts";
import { readDhis2ElementIds } from "../../dhis2/mod.ts";
import { log } from "../../middleware/logging.ts";
import { notifyInstanceIndicatorsUpdated } from "../../task_management/notify_instance_updated.ts";
import { defineRoute } from "../route-helpers.ts";

export const routesIndicators = new Hono();

// The definition arrives already shape-checked by the route registry's Zod
// body schema. The expression: its grammar, its indicators and its
// population terms: is validated in the DB layer against the live
// dictionary and the population store, because only there is the full
// vocabulary available. An Uploaded indicator posts no data id, and one
// posted anyway is dropped here: its key is the server's.
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
    case "calculated":
      return { type: "calculated", expression: String(raw.expression) };
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
    direction: raw.direction as NewIndicator["direction"],
    target: (raw.target ?? null) as NewIndicator["target"],
    expected_low_counts: Boolean(raw.expected_low_counts),
  };
}

// The DB layer asks this only for a typed DHIS2 element id, so the stored
// connection is resolved on demand: an instance without one can still save
// everything else. One attempt and a 15 s budget: the editor waits on it.
function dhis2ElementIdCheck(mainDb: Sql): Dhis2ElementIdCheck {
  return async (ids) => {
    const reading = await readDhis2ElementIds({
      dhis2Credentials: await getStoredDhis2CredentialsDecrypted(mainDb),
      retryOptions: { maxAttempts: 1 },
      timeout: 15000,
    }, ids);
    return reading.verdicts;
  };
}

// GET /indicators - The dictionary: every indicator
defineRoute(
  routesIndicators,
  "getIndicators",
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
  log("createIndicators"),
  async (c, { body }) => {
    let indicators: NewIndicator[];
    try {
      indicators = body.indicators.map(toNewIndicator);
    } catch (err) {
      return c.json({ success: false, err: (err as Error).message });
    }

    const res = await createIndicators(
      c.var.mainDb,
      indicators,
      dhis2ElementIdCheck(c.var.mainDb),
    );
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
      dhis2ElementIdCheck(c.var.mainDb),
    );
    if (res.success) {
      notifyInstanceIndicatorsUpdated(
        await getInstanceIndicatorsSummary(c.var.mainDb),
      );
    }
    return c.json(res);
  },
);

// POST /indicators/include-in-analysis - Set the flag on many indicators
defineRoute(
  routesIndicators,
  "setIndicatorsIncludeInAnalysis",
  log("setIndicatorsIncludeInAnalysis"),
  async (c, { body }) => {
    const res = await setIndicatorsIncludeInAnalysis(
      c.var.mainDb,
      body.indicator_common_ids,
      body.include_in_analysis,
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
