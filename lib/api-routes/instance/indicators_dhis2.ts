import { z } from "zod";
import { route } from "../route-utils.ts";

const dhis2CredentialsSchema = z.object({
  url: z.string(),
  username: z.string(),
  password: z.string(),
});

export const indicatorsDhis2RouteRegistry = {
  searchDhis2Indicators: route({
    path: "/indicators-dhis2/search",
    method: "POST",
    body: z.object({
      dhis2Credentials: dhis2CredentialsSchema,
      query: z.string(),
      searchBy: z.enum(["name", "code"]).optional(),
    }),
    response: {} as any[],
  }),
  searchDhis2DataElements: route({
    path: "/data-elements-dhis2/search",
    method: "POST",
    body: z.object({
      dhis2Credentials: dhis2CredentialsSchema,
      query: z.string(),
      additionalFilters: z.array(z.string()).optional(),
    }),
    response: {} as any[],
  }),
  searchDhis2All: route({
    path: "/indicators-dhis2/search-all",
    method: "POST",
    body: z.object({
      dhis2Credentials: dhis2CredentialsSchema,
      query: z.string(),
      searchBy: z.enum(["name", "code"]).optional(),
      includeDataElements: z.boolean().optional(),
      includeIndicators: z.boolean().optional(),
    }),
    response: {} as { dataElements: any[]; indicators: any[] },
  }),
  testDhis2IndicatorsConnection: route({
    path: "/indicators-dhis2/test-connection",
    method: "POST",
    body: z.object({ dhis2Credentials: dhis2CredentialsSchema }),
    response: {} as {
      dataElementCount?: number;
      indicatorCount?: number;
      dataElementGroups?: number;
      indicatorGroups?: number;
    },
  }),
} as const;
