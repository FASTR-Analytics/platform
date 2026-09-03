import { z } from "zod";
import type { InstanceIndicatorDetails } from "../../types/mod.ts";
import { route } from "../route-utils.ts";

// What a common indicator IS (PLAN_1a §1.2). The expression grammar itself is
// checked server-side against the live dictionary and the population store —
// the shape check here only says which fields each type carries. The
// base→number format rule lives in the DB layer too, where the type is known.
const commonIndicatorDefinitionSchema = z.union([
  z.object({ type: z.literal("base") }),
  z.object({ type: z.literal("derived"), expression: z.string() }),
]);

const commonIndicatorThresholdsSchema = z
  .object({
    direction: z.enum(["higher_is_better", "lower_is_better"]),
    green: z.number(),
    yellow: z.number(),
  })
  .nullable();

const commonIndicatorItemSchema = z.object({
  indicator_common_id: z.string(),
  indicator_common_label: z.string(),
  mapped_raw_ids: z.array(z.string()),
  definition: commonIndicatorDefinitionSchema,
  format_as: z.enum(["percent", "number", "rate_per_10k"]),
  thresholds: commonIndicatorThresholdsSchema,
  group_label: z.string(),
});

const rawIndicatorItemSchema = z.object({
  indicator_raw_id: z.string(),
  indicator_raw_label: z.string(),
  mapped_common_ids: z.array(z.string()),
});

const batchUploadBodySchema = z.object({
  asset_file_name: z.string(),
  replace_all_existing: z.boolean(),
});

export const indicatorRouteRegistry = {
  getIndicators: route({
    path: "/indicators",
    method: "GET",
    response: {} as InstanceIndicatorDetails,
  }),
  createCommonIndicators: route({
    path: "/indicators",
    method: "POST",
    body: z.object({ indicators: z.array(commonIndicatorItemSchema) }),
  }),
  updateCommonIndicator: route({
    path: "/indicators/update",
    method: "POST",
    body: z.object({
      old_indicator_common_id: z.string(),
      indicator: commonIndicatorItemSchema,
    }),
  }),
  deleteCommonIndicators: route({
    path: "/indicators/delete",
    method: "POST",
    body: z.object({ indicator_common_ids: z.array(z.string()) }),
  }),
  reorderCommonIndicators: route({
    path: "/indicators/reorder",
    method: "POST",
    body: z.object({ order: z.array(z.string()) }),
  }),
  createRawIndicators: route({
    path: "/indicators-raw",
    method: "POST",
    body: z.object({ indicators: z.array(rawIndicatorItemSchema) }),
  }),
  updateRawIndicator: route({
    path: "/indicators-raw/update",
    method: "POST",
    body: z.object({
      old_indicator_raw_id: z.string(),
      new_indicator_raw_id: z.string(),
      indicator_raw_label: z.string(),
      mapped_common_ids: z.array(z.string()),
    }),
  }),
  deleteRawIndicators: route({
    path: "/indicators-raw/delete",
    method: "POST",
    body: z.object({ indicator_raw_ids: z.array(z.string()) }),
  }),
  batchUploadIndicators: route({
    path: "/indicators/batch",
    method: "POST",
    body: batchUploadBodySchema,
  }),
  batchUploadRawIndicators: route({
    path: "/indicators/batch-raw",
    method: "POST",
    body: batchUploadBodySchema,
  }),
} as const;
