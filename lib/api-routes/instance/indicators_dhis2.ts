// Note: DHIS2DataElement and DHIS2Indicator types need to be properly exported
// For now, using any[] until types are available
type DHIS2DataElement = any;
type DHIS2Indicator = any;
import { type Dhis2Credentials } from "../../types/mod.ts";
import { route } from "../route-utils.ts";

export const indicatorsDhis2RouteRegistry = {
  // Search DHIS2 indicators
  searchDhis2Indicators: route({
    path: "/indicators-dhis2/search",
    method: "POST",
    body: {} as {
      dhis2Credentials: Dhis2Credentials;
      query: string;
      searchBy?: "name" | "code";
    },
    response: {} as DHIS2Indicator[],
  }),

  // Search DHIS2 data elements
  searchDhis2DataElements: route({
    path: "/data-elements-dhis2/search",
    method: "POST",
    body: {} as {
      dhis2Credentials: Dhis2Credentials;
      query: string;
      additionalFilters?: string[];
    },
    response: {} as DHIS2DataElement[],
  }),

  // Combined search for both indicators and data elements
  searchDhis2All: route({
    path: "/indicators-dhis2/search-all",
    method: "POST",
    body: {} as {
      dhis2Credentials: Dhis2Credentials;
      query: string;
      searchBy?: "name" | "code";
      includeDataElements?: boolean;
      includeIndicators?: boolean;
    },
    response: {} as {
      dataElements: DHIS2DataElement[];
      indicators: DHIS2Indicator[];
    },
  }),

  // Test DHIS2 connection
  testDhis2IndicatorsConnection: route({
    path: "/indicators-dhis2/test-connection",
    method: "POST",
    body: {} as {
      dhis2Credentials: Dhis2Credentials;
    },
    response: {} as {
      message: string;
      details?: {
        dataElementCount?: number;
        indicatorCount?: number;
        dataElementGroups?: number;
        indicatorGroups?: number;
      };
    },
  }),
} as const;
