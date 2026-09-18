import { z } from "zod";
import type {
  Dhis2DataElementSearchItem,
  Dhis2IndicatorSearchItem,
} from "../../types/mod.ts";
import { route } from "../route-utils.ts";
import { indicatorNamingElementSchema } from "./indicators.ts";

export const indicatorsDhis2RouteRegistry = {
  searchDhis2Indicators: route({
    path: "/indicators-dhis2/search",
    method: "POST",
    body: z.object({
      query: z.string(),
      searchBy: z.enum(["name", "code"]).optional(),
    }),
    response: {} as Dhis2IndicatorSearchItem[],
  }),
  searchDhis2DataElements: route({
    path: "/data-elements-dhis2/search",
    method: "POST",
    body: z.object({
      query: z.string(),
      additionalFilters: z.array(z.string()).optional(),
    }),
    response: {} as Dhis2DataElementSearchItem[],
  }),
  searchDhis2All: route({
    path: "/indicators-dhis2/search-all",
    method: "POST",
    body: z.object({
      query: z.string(),
      searchBy: z.enum(["name", "code"]).optional(),
      includeDataElements: z.boolean().optional(),
      includeIndicators: z.boolean().optional(),
    }),
    response: {} as {
      dataElements: Dhis2DataElementSearchItem[];
      indicators: Dhis2IndicatorSearchItem[];
    },
  }),
  // The naming step's save (PLAN_A4 ruling 6): the server re-reads every
  // element and indicator from DHIS2, judges them itself, and creates
  // everything in one transaction or nothing.
  createIndicatorsFromDhis2: route({
    path: "/indicators-dhis2/create",
    method: "POST",
    body: z.object({
      elements: z.array(indicatorNamingElementSchema),
      // `uid` is the DHIS2 indicator's own UID; the calculated it becomes is
      // named `indicator_id`.
      indicators: z.array(
        z.object({
          uid: z.string(),
          indicator_id: z.string(),
          label: z.string(),
        }),
      ),
    }),
    response: {} as { created: number },
  }),
} as const;
