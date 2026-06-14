import { z } from "zod";
import {
  disaggregationOption,
  periodFilterSchema,
  periodOption,
  presentationObjectConfigSchema,
  valueFuncStrict,
  ALL_DISAGGREGATION_OPTIONS,
} from "../../types/mod.ts";
import { ADMIN_LEVELS } from "../../admin_area_rollup.ts";
import {
  SQL_IDENTIFIER,
  isSafePostAggregationExpression,
} from "../../validate_fetch_config.ts";
import type {
  DisaggregationOption,
  GenericLongFormFetchConfig,
  ItemsHolderPresentationObject,
  PeriodFilter,
  PeriodOption,
  PresentationObjectConfig,
  PresentationObjectDetail,
  PresentationObjectSummary,
  PresentationOption,
  ReplicantOptionsForPresentationObject,
  ResultsValue,
  ResultsValueInfoForPresentationObject,
} from "../../types/mod.ts";
import { route } from "../route-utils.ts";

// po_id is a 3-char nanoid (generateUniquePresentationObjectId), not a UUID
const poIdParamsSchema = z.object({ po_id: z.string() });

// SQL injection guards: these fields are interpolated into projectDb.unsafe SQL.
// SQL_IDENTIFIER / SAFE_EXPRESSION are shared with the imperative validateFetchConfig
// (the single source of truth) so the boundary schema and the handler guard can't drift.
// groupBys / filters[].disOpt / replicateBy → closed enum (period options are a subset)
// values[].prop → bare SQL identifier
// postAggregationExpression → safe arithmetic (charset + structural rules)
const fetchConfigValuesItemSchema = z.object({
  prop: z.string().regex(SQL_IDENTIFIER),
  func: valueFuncStrict,
});

const genericLongFormFetchConfigSchema = z.object({
  values: z.array(fetchConfigValuesItemSchema),
  groupBys: z.array(disaggregationOption),
  filters: z.array(z.object({
    disOpt: disaggregationOption,
    values: z.array(z.union([z.string(), z.number()])),
  })),
  periodFilter: periodFilterSchema,
  periodFilterExactBounds: z.object({ min: z.number(), max: z.number() }).optional(),
  postAggregationExpression: z
    .string()
    .refine(isSafePostAggregationExpression)
    .optional(),
  includeAdminAreaRollup: z.boolean().optional(),
  adminAreaRollupLevel: z.enum(ADMIN_LEVELS).optional(),
});

export const presentationObjectRouteRegistry = {
  createPresentationObject: route({
    path: "/presentation_objects",
    method: "POST",
    body: z.object({
      label: z.string(),
      resultsValue: z.unknown(), // ResultsValue is a complex nested type without a boundary schema
      config: presentationObjectConfigSchema,
      makeDefault: z.boolean(),
      folderId: z.uuid().nullable().optional(),
    }),
    response: {} as {
      newPresentationObjectId: string;
      lastUpdated: string;
    },
    requiresProject: true,
  }),

  duplicatePresentationObject: route({
    path: "/duplicate_presentation_object/:po_id",
    method: "POST",
    params: poIdParamsSchema,
    body: z.object({
      label: z.string(),
      folderId: z.uuid().nullable().optional(),
    }),
    response: {} as {
      newPresentationObjectId: string;
      lastUpdated: string;
    },
    requiresProject: true,
  }),

  getAllPresentationObjects: route({
    path: "/presentation_objects",
    method: "GET",
    response: {} as PresentationObjectSummary[],
    requiresProject: true,
  }),

  getPresentationObjectDetail: route({
    path: "/presentation_objects/:po_id",
    method: "GET",
    params: poIdParamsSchema,
    response: {} as PresentationObjectDetail,
    requiresProject: true,
  }),

  updatePresentationObjectLabel: route({
    path: "/presentation_object_label/:po_id",
    method: "POST",
    params: poIdParamsSchema,
    body: z.object({ label: z.string() }),
    response: {} as { lastUpdated: string },
    requiresProject: true,
  }),

  updatePresentationObjectConfig: route({
    path: "/presentation_object_config/:po_id",
    method: "POST",
    params: poIdParamsSchema,
    body: z.object({
      config: presentationObjectConfigSchema,
      expectedLastUpdated: z.string().optional(),
      overwrite: z.boolean().optional(),
    }),
    response: {} as { lastUpdated: string },
    requiresProject: true,
  }),

  batchUpdatePresentationObjectsPeriodFilter: route({
    path: "/presentation_objects/batch_period_filter",
    method: "POST",
    body: z.object({
      presentationObjectIds: z.array(z.string()),
      periodFilter: periodFilterSchema,
    }),
    response: {} as { lastUpdated: string; updatedCount: number },
    requiresProject: true,
  }),

  deletePresentationObject: route({
    path: "/presentation_objects/:po_id",
    method: "DELETE",
    params: poIdParamsSchema,
    response: {} as { lastUpdated: string },
    requiresProject: true,
  }),

  getPresentationObjectItems: route({
    path: "/presentation_object_items",
    method: "POST",
    body: z.object({
      resultsObjectId: z.string(),
      fetchConfig: genericLongFormFetchConfigSchema,
      firstPeriodOption: periodOption.optional(),
    }),
    response: {} as ItemsHolderPresentationObject,
    requiresProject: true,
  }),

  getResultsValueInfoForPresentationObject: route({
    path: "/results_value_info",
    method: "POST",
    body: z.object({ metricId: z.string() }),
    response: {} as ResultsValueInfoForPresentationObject,
    requiresProject: true,
  }),

  getReplicantOptions: route({
    path: "/replicant_options",
    method: "POST",
    body: z.object({
      resultsObjectId: z.string(),
      replicateBy: disaggregationOption,
      fetchConfig: genericLongFormFetchConfigSchema,
    }),
    response: {} as ReplicantOptionsForPresentationObject,
    requiresProject: true,
  }),

} as const;

export type PresentationObjectRouteRegistry =
  typeof presentationObjectRouteRegistry;
