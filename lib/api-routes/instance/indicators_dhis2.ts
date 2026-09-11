import { z } from "zod";
import type {
  Dhis2DataElementSearchItem,
  Dhis2IndicatorSearchItem,
} from "../../types/mod.ts";
import { route } from "../route-utils.ts";
import { indicatorNamingSourceSchema } from "./indicators.ts";

const dhis2CredentialsSchema = z.object({
  url: z.string(),
  username: z.string(),
  password: z.string(),
});

const dhis2RunCredentialsSourceSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("inline"), credentials: dhis2CredentialsSchema }),
  z.object({ kind: z.literal("stored") }),
]);

export const indicatorsDhis2RouteRegistry = {
  searchDhis2Indicators: route({
    path: "/indicators-dhis2/search",
    method: "POST",
    body: z.object({
      credentialsSource: dhis2RunCredentialsSourceSchema,
      query: z.string(),
      searchBy: z.enum(["name", "code"]).optional(),
    }),
    response: {} as Dhis2IndicatorSearchItem[],
  }),
  searchDhis2DataElements: route({
    path: "/data-elements-dhis2/search",
    method: "POST",
    body: z.object({
      credentialsSource: dhis2RunCredentialsSourceSchema,
      query: z.string(),
      additionalFilters: z.array(z.string()).optional(),
    }),
    response: {} as Dhis2DataElementSearchItem[],
  }),
  searchDhis2All: route({
    path: "/indicators-dhis2/search-all",
    method: "POST",
    body: z.object({
      credentialsSource: dhis2RunCredentialsSourceSchema,
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
  // The naming step's save (PLAN_A3 rulings 6 and 8): the server re-reads
  // every element and indicator from DHIS2, judges them itself, and creates
  // everything in one transaction or nothing.
  createIndicatorsFromDhis2: route({
    path: "/indicators-dhis2/create",
    method: "POST",
    body: z.object({
      credentialsSource: dhis2RunCredentialsSourceSchema,
      sources: z.array(indicatorNamingSourceSchema),
      indicators: z.array(
        z.object({
          dhis2_id: z.string(),
          indicator_id: z.string(),
          label: z.string(),
        }),
      ),
    }),
    response: {} as { created: number; attached: number },
  }),
  testDhis2IndicatorsConnection: route({
    path: "/indicators-dhis2/test-connection",
    method: "POST",
    body: z.object({ credentialsSource: dhis2RunCredentialsSourceSchema }),
    response: {} as {
      dataElementCount?: number;
      indicatorCount?: number;
      dataElementGroups?: number;
      indicatorGroups?: number;
    },
  }),
} as const;
