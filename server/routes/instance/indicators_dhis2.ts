import { Hono } from "hono";
import {
  searchIndicatorsFromDHIS2,
  searchDataElementsFromDHIS2,
  searchAllIndicatorsAndDataElements,
  testIndicatorsConnection,
} from "../../dhis2/goal2_indicators/get_indicators_from_dhis2.ts";
import { defineRoute } from "../route-helpers.ts";
import { getGlobalAdmin } from "../../project_auth.ts";

export const routesIndicatorsDhis2 = new Hono();

// POST /indicators-dhis2/search - Search DHIS2 indicators
defineRoute(
  routesIndicatorsDhis2,
  "searchDhis2Indicators",
  getGlobalAdmin,
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
        body.searchBy || "all"
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
  getGlobalAdmin,
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
  getGlobalAdmin,
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
        body.includeDataElements !== false,
        body.includeIndicators !== false
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
  getGlobalAdmin,
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