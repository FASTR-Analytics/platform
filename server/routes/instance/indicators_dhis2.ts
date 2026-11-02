import { Hono } from "hono";
import type { Sql } from "postgres";
import {
  dataElementIdOf,
  type FetchOptions,
  getIndicatorsByIds,
  readDhis2ElementIds,
  searchAllIndicatorsAndDataElements,
  searchDataElementsFromDHIS2,
  searchIndicatorsFromDHIS2,
  withDecompositions,
  withElementVerdicts,
} from "../../dhis2/mod.ts";
import { type Dhis2Credentials, dhis2ElementName } from "lib";
import {
  createIndicatorsFromDhis2,
  getDhis2ElementDataIds,
  getInstanceIndicatorsSummary,
  getStoredDhis2CredentialsDecrypted,
  setDhis2Labels,
} from "../../db/mod.ts";
import { log } from "../../middleware/logging.ts";
import { notifyInstanceIndicatorsUpdated } from "../../task_management/notify_instance_updated.ts";
import { defineRoute } from "../route-helpers.ts";

async function resolveOrErr(
  mainDb: Sql,
): Promise<
  { ok: true; credentials: Dhis2Credentials } | { ok: false; err: string }
> {
  try {
    return {
      ok: true,
      credentials: await getStoredDhis2CredentialsDecrypted(mainDb),
    };
  } catch (error) {
    return {
      ok: false,
      err: error instanceof Error
        ? error.message
        : "No stored DHIS2 credentials.",
    };
  }
}

export const routesIndicatorsDhis2 = new Hono();

// POST /indicators-dhis2/refresh-labels - Re-read every element's DHIS2 name
defineRoute(
  routesIndicatorsDhis2,
  "refreshDhis2Labels",
  log("refreshDhis2Labels"),
  async (c) => {
    try {
      const resolved = await resolveOrErr(c.var.mainDb);
      if (!resolved.ok) {
        return c.json({ success: false, err: resolved.err });
      }
      const options: FetchOptions = { dhis2Credentials: resolved.credentials };
      const stored = await getDhis2ElementDataIds(c.var.mainDb);
      const reading = await readDhis2ElementIds(
        options,
        stored.map((s) => s.data_id),
      );
      // A name is refreshed for every element the server has, whatever its
      // verdict: the refresh changes labels, never ids.
      const labels = new Map<string, string>();
      const formulas: string[] = [];
      const notFound: string[] = [];
      for (const s of stored) {
        const element = reading.elements.get(dataElementIdOf(s.data_id));
        if (element !== undefined) {
          labels.set(
            s.indicator_common_id,
            dhis2ElementName(element, s.data_id),
          );
          continue;
        }
        const verdict = reading.verdicts.get(s.data_id);
        if (!verdict?.accepted && verdict?.refusal.kind === "formula") {
          formulas.push(s.indicator_common_id);
        } else {
          notFound.push(s.indicator_common_id);
        }
      }
      const refreshed = await setDhis2Labels(c.var.mainDb, labels);
      if (refreshed > 0) {
        notifyInstanceIndicatorsUpdated(
          await getInstanceIndicatorsSummary(c.var.mainDb),
        );
      }
      return c.json({
        success: true,
        data: {
          refreshed,
          unchanged: labels.size - refreshed,
          formulas,
          notFound,
        },
      });
    } catch (error) {
      console.error("Error refreshing DHIS2 labels:", error);
      return c.json({
        success: false,
        err: error instanceof Error ? error.message : "Unknown error occurred",
      });
    }
  },
);

// POST /indicators-dhis2/search - Search DHIS2 indicators
defineRoute(
  routesIndicatorsDhis2,
  "searchDhis2Indicators",
  log("searchDhis2Indicators"),
  async (c, { body }) => {
    try {
      const resolved = await resolveOrErr(c.var.mainDb);
      if (!resolved.ok) {
        return c.json({ success: false, err: resolved.err });
      }
      const options = { dhis2Credentials: resolved.credentials };
      const indicators = await searchIndicatorsFromDHIS2(options, body.query);

      return c.json({
        success: true,
        data: await withDecompositions(options, indicators),
      });
    } catch (error) {
      console.error("Error searching DHIS2 indicators:", error);
      return c.json({
        success: false,
        err: error instanceof Error ? error.message : "Unknown error occurred",
      });
    }
  },
);

// POST /data-elements-dhis2/search - Search DHIS2 data elements
defineRoute(
  routesIndicatorsDhis2,
  "searchDhis2DataElements",
  log("searchDhis2DataElements"),
  async (c, { body }) => {
    try {
      const resolved = await resolveOrErr(c.var.mainDb);
      if (!resolved.ok) {
        return c.json({ success: false, err: resolved.err });
      }
      const dataElements = await searchDataElementsFromDHIS2(
        { dhis2Credentials: resolved.credentials },
        body.query,
        body.additionalFilters,
      );

      return c.json({
        success: true,
        data: withElementVerdicts(dataElements),
      });
    } catch (error) {
      console.error("Error searching DHIS2 data elements:", error);
      return c.json({
        success: false,
        err: error instanceof Error ? error.message : "Unknown error occurred",
      });
    }
  },
);

// POST /indicators-dhis2/search-all - Combined search
defineRoute(
  routesIndicatorsDhis2,
  "searchDhis2All",
  log("searchDhis2All"),
  async (c, { body }) => {
    try {
      const resolved = await resolveOrErr(c.var.mainDb);
      if (!resolved.ok) {
        return c.json({ success: false, err: resolved.err });
      }
      const options = { dhis2Credentials: resolved.credentials };
      const results = await searchAllIndicatorsAndDataElements(
        options,
        body.query,
        body.includeDataElements ?? true,
        body.includeIndicators ?? true,
      );

      return c.json({
        success: true,
        data: {
          dataElements: withElementVerdicts(results.dataElements),
          indicators: await withDecompositions(
            options,
            results.indicators,
            results.dataElements,
          ),
        },
      });
    } catch (error) {
      console.error("Error in combined DHIS2 search:", error);
      return c.json({
        success: false,
        err: error instanceof Error ? error.message : "Unknown error occurred",
      });
    }
  },
);

// POST /indicators-dhis2/create - Save the naming step
defineRoute(
  routesIndicatorsDhis2,
  "createIndicatorsFromDhis2",
  log("createIndicatorsFromDhis2"),
  async (c, { body }) => {
    try {
      const resolved = await resolveOrErr(c.var.mainDb);
      if (!resolved.ok) {
        return c.json({ success: false, err: resolved.err });
      }
      const options: FetchOptions = { dhis2Credentials: resolved.credentials };
      // The verdicts and the DHIS2 labels are the server's own reading of
      // the live metadata: the client's search results may be stale or
      // edited.
      const reading = await readDhis2ElementIds(
        options,
        body.elements.map((e) => e.data_id),
      );
      const indicators = await withDecompositions(
        options,
        await getIndicatorsByIds(options, body.indicators.map((i) => i.uid)),
        [...reading.elements.values()],
      );
      const indicatorsById = new Map(indicators.map((i) => [i.id, i]));
      const missing = body.indicators
        .map((i) => i.uid)
        .filter((id) => !indicatorsById.has(id));
      if (missing.length > 0) {
        return c.json({
          success: false,
          err: `DHIS2 indicators not found on the server: ${
            missing.join(", ")
          }`,
        });
      }

      const res = await createIndicatorsFromDhis2(c.var.mainDb, {
        elements: body.elements.map((e) => {
          const element = reading.elements.get(dataElementIdOf(e.data_id));
          return {
            ...e,
            dhis2_label: element === undefined
              ? null
              : dhis2ElementName(element, e.data_id),
            verdict: reading.verdicts.get(e.data_id)!,
          };
        }),
        indicators: body.indicators.map((i) => ({
          ...i,
          decomposition: indicatorsById.get(i.uid)!.decomposition,
        })),
      });
      if (res.success) {
        notifyInstanceIndicatorsUpdated(
          await getInstanceIndicatorsSummary(c.var.mainDb),
        );
      }
      return c.json(res);
    } catch (error) {
      console.error("Error creating indicators from DHIS2:", error);
      return c.json({
        success: false,
        err: error instanceof Error ? error.message : "Unknown error occurred",
      });
    }
  },
);
