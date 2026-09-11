import { Hono } from "hono";
import type { Sql } from "postgres";
import {
  type FetchOptions,
  getDataElementsFromDHIS2,
  getDhis2OperandVerdict,
  getIndicatorsFromDHIS2,
  searchAllIndicatorsAndDataElements,
  searchDataElementsFromDHIS2,
  searchIndicatorsFromDHIS2,
  testIndicatorsConnection,
  withDecompositions,
  withSourceVerdicts,
} from "../../dhis2/mod.ts";
import { t3, type Dhis2Credentials, type Dhis2RunCredentialsSource } from "lib";
import {
  createIndicatorsFromDhis2,
  getInstanceIndicatorsSummary,
  resolveDhis2Credentials,
} from "../../db/mod.ts";
import { log } from "../../middleware/logging.ts";
import { requireGlobalPermission } from "../../middleware/mod.ts";
import { notifyInstanceIndicatorsUpdated } from "../../task_management/notify_instance_updated.ts";
import { defineRoute } from "../route-helpers.ts";

// DHIS2 caps a filter's value list, so id lookups go in chunks.
const ID_FILTER_CHUNK_SIZE = 100;

async function fetchByIds<T>(
  ids: string[],
  fetch: (filter: string) => Promise<T[]>,
): Promise<T[]> {
  const unique = [...new Set(ids)];
  const chunks: string[][] = [];
  for (let i = 0; i < unique.length; i += ID_FILTER_CHUNK_SIZE) {
    chunks.push(unique.slice(i, i + ID_FILTER_CHUNK_SIZE));
  }
  const results = await Promise.all(
    chunks.map((chunk) => fetch(`id:in:[${chunk.join(",")}]`)),
  );
  return results.flat();
}

function dataElementIdOf(sourceId: string): string {
  return sourceId.split(".")[0];
}

async function resolveOrErr(
  mainDb: Sql,
  credentialsSource: Dhis2RunCredentialsSource,
): Promise<{ ok: true; credentials: Dhis2Credentials } | { ok: false; err: string }> {
  try {
    return { ok: true, credentials: await resolveDhis2Credentials(mainDb, credentialsSource) };
  } catch (error) {
    return {
      ok: false,
      err: error instanceof Error ? error.message : "No stored DHIS2 credentials.",
    };
  }
}

export const routesIndicatorsDhis2 = new Hono();

// POST /indicators-dhis2/search - Search DHIS2 indicators
defineRoute(
  routesIndicatorsDhis2,
  "searchDhis2Indicators",
  requireGlobalPermission("can_configure_data"),
  log("searchDhis2Indicators"),
  async (c, { body }) => {
    try {
      const resolved = await resolveOrErr(c.var.mainDb, body.credentialsSource);
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
  requireGlobalPermission("can_configure_data"),
  log("searchDhis2DataElements"),
  async (c, { body }) => {
    try {
      const resolved = await resolveOrErr(c.var.mainDb, body.credentialsSource);
      if (!resolved.ok) {
        return c.json({ success: false, err: resolved.err });
      }
      const dataElements = await searchDataElementsFromDHIS2(
        { dhis2Credentials: resolved.credentials },
        body.query,
        {
          filter: body.additionalFilters,
        },
      );

      return c.json({
        success: true,
        data: withSourceVerdicts(dataElements),
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
  requireGlobalPermission("can_configure_data"),
  log("searchDhis2All"),
  async (c, { body }) => {
    try {
      const resolved = await resolveOrErr(c.var.mainDb, body.credentialsSource);
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
          dataElements: withSourceVerdicts(results.dataElements),
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

// POST /indicators-dhis2/create - Save the naming step (PLAN_A3 rulings 6, 8)
defineRoute(
  routesIndicatorsDhis2,
  "createIndicatorsFromDhis2",
  requireGlobalPermission("can_configure_data"),
  log("createIndicatorsFromDhis2"),
  async (c, { body }) => {
    try {
      const resolved = await resolveOrErr(c.var.mainDb, body.credentialsSource);
      if (!resolved.ok) {
        return c.json({ success: false, err: resolved.err });
      }
      const options: FetchOptions = { dhis2Credentials: resolved.credentials };
      // The verdicts are the server's own reading of the live metadata: the
      // client's search results may be stale or edited.
      const elements = await fetchByIds(
        body.sources.map((s) => dataElementIdOf(s.source_id)),
        (filter) =>
          getDataElementsFromDHIS2(options, { filter: [filter], paging: false }),
      );
      const elementsById = new Map(elements.map((e) => [e.id, e]));
      const indicators = await withDecompositions(
        options,
        await fetchByIds(
          body.indicators.map((i) => i.dhis2_id),
          (filter) =>
            getIndicatorsFromDHIS2(options, { filter: [filter], paging: false }),
        ),
        elements,
      );
      const indicatorsById = new Map(indicators.map((i) => [i.id, i]));
      const missing = body.indicators
        .map((i) => i.dhis2_id)
        .filter((id) => !indicatorsById.has(id));
      if (missing.length > 0) {
        return c.json({
          success: false,
          err: `DHIS2 indicators not found on the server: ${missing.join(", ")}`,
        });
      }

      const res = await createIndicatorsFromDhis2(c.var.mainDb, {
        sources: body.sources.map((s) => ({
          ...s,
          verdict: getDhis2OperandVerdict(
            elementsById.get(dataElementIdOf(s.source_id)),
          ),
        })),
        indicators: body.indicators.map((i) => ({
          ...i,
          decomposition: indicatorsById.get(i.dhis2_id)!.decomposition,
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

// POST /indicators-dhis2/test-connection - Test DHIS2 connection
defineRoute(
  routesIndicatorsDhis2,
  "testDhis2IndicatorsConnection",
  requireGlobalPermission("can_configure_data"),
  log("testDhis2IndicatorsConnection"),
  async (c, { body }) => {
    try {
      const resolved = await resolveOrErr(c.var.mainDb, body.credentialsSource);
      if (!resolved.ok) {
        return c.json({ success: false, err: resolved.err });
      }
      const result = await testIndicatorsConnection({ dhis2Credentials: resolved.credentials });

      if (!result.success) {
        return c.json({ success: false, err: t3(result.message) });
      }
      return c.json({ success: true, data: result.details ?? {} });
    } catch (error) {
      console.error("Error testing DHIS2 connection:", error);
      return c.json({
        success: false,
        err: error instanceof Error ? error.message : "Unknown error occurred",
      });
    }
  },
);
