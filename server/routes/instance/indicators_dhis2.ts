import { Hono } from "hono";
import type { Sql } from "postgres";
import {
  searchAllIndicatorsAndDataElements,
  searchDataElementsFromDHIS2,
  searchIndicatorsFromDHIS2,
  testIndicatorsConnection,
} from "../../dhis2/mod.ts";
import { t3, type Dhis2Credentials, type Dhis2RunCredentialsSource } from "lib";
import { resolveDhis2Credentials } from "../../db/mod.ts";
import { log } from "../../middleware/logging.ts";
import { requireGlobalPermission } from "../../middleware/mod.ts";
import { defineRoute } from "../route-helpers.ts";

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
      const indicators = await searchIndicatorsFromDHIS2(
        { dhis2Credentials: resolved.credentials },
        body.query,
      );

      return c.json({
        success: true,
        data: indicators,
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
        data: dataElements,
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
      const results = await searchAllIndicatorsAndDataElements(
        { dhis2Credentials: resolved.credentials },
        body.query,
        body.includeDataElements ?? true,
        body.includeIndicators ?? true,
      );

      return c.json({
        success: true,
        data: results,
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
