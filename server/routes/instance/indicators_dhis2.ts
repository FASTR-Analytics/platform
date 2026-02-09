import { Hono } from "hono";
import {
  searchIndicatorsFromDHIS2,
  searchDataElementsFromDHIS2,
  searchAllIndicatorsAndDataElements,
  testIndicatorsConnection,
} from "../../dhis2/mod.ts";
import { defineRoute } from "../route-helpers.ts";
import { getGlobalAdmin } from "../../project_auth.ts";
import { log } from "../../middleware/logging.ts";
import { requireGlobalPermission } from "../../middleware/mod.ts";

export const routesIndicatorsDhis2 = new Hono();

// POST /indicators-dhis2/search - Search DHIS2 indicators
defineRoute(
  routesIndicatorsDhis2,
  "searchDhis2Indicators",
  requireGlobalPermission("can_configure_data"),
  log("searchDhis2Indicators"),
  async (c, { body }) => {
    try {
      // Validate required fields
      if (!body.dhis2Credentials || !body.query) {
        return c.json({
          success: false,
          err: "Missing required fields: dhis2Credentials and query are required",
        });
      }

      const options = {
        dhis2Credentials: body.dhis2Credentials,
      };

      const indicators = await searchIndicatorsFromDHIS2(
        options,
        body.query,
        body.searchBy || "name"
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
  }
);

// POST /data-elements-dhis2/search - Search DHIS2 data elements
defineRoute(
  routesIndicatorsDhis2,
  "searchDhis2DataElements",
  requireGlobalPermission("can_configure_data"),
  log("searchDhis2DataElements"),
  async (c, { body }) => {
    try {
      // Validate required fields
      if (!body.dhis2Credentials || !body.query) {
        return c.json({
          success: false,
          err: "Missing required fields: dhis2Credentials and query are required",
        });
      }

      const options = {
        dhis2Credentials: body.dhis2Credentials,
      };

      const dataElements = await searchDataElementsFromDHIS2(
        options,
        body.query,
        "name",
        {
          filter: body.additionalFilters,
        }
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
  }
);

// POST /indicators-dhis2/search-all - Combined search
defineRoute(
  routesIndicatorsDhis2,
  "searchDhis2All",
  requireGlobalPermission("can_configure_data"),
  log("searchDhis2All"),
  async (c, { body }) => {
    try {
      // Validate required fields
      if (!body.dhis2Credentials || !body.query) {
        return c.json({
          success: false,
          err: "Missing required fields: dhis2Credentials and query are required",
        });
      }

      const options = {
        dhis2Credentials: body.dhis2Credentials,
      };

      const results = await searchAllIndicatorsAndDataElements(
        options,
        body.query,
        body.searchBy || "name",
        body.includeDataElements ?? true,
        body.includeIndicators ?? true
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
  }
);

// POST /indicators-dhis2/test-connection - Test DHIS2 connection
defineRoute(
  routesIndicatorsDhis2,
  "testDhis2IndicatorsConnection",
  requireGlobalPermission("can_configure_data"),
  log("testDhis2IndicatorsConnection"),
  async (c, { body }) => {
    try {
      // Validate required fields
      if (!body.dhis2Credentials) {
        return c.json({
          success: false,
          err: "Missing required field: dhis2Credentials",
        });
      }

      const options = {
        dhis2Credentials: body.dhis2Credentials,
      };

      const result = await testIndicatorsConnection(options);

      // The testIndicatorsConnection function should return APIResponseWithData format
      return c.json(result);
    } catch (error) {
      console.error("Error testing DHIS2 connection:", error);
      return c.json({
        success: false,
        err: error instanceof Error ? error.message : "Unknown error occurred",
      });
    }
  }
);