import { z } from "zod";
import { thresholdsRuleSchema } from "../../types/conditional_formatting.ts";
import type { InstanceIndicatorDetails } from "../../types/mod.ts";
import { route } from "../route-utils.ts";

// What an indicator IS (PLAN_1a §1.2). The expression grammar itself is
// checked server-side against the live dictionary and the population store:
// the shape check here only says which fields each type carries. The
// base→number format rule lives in the DB layer too, where the type is known.
const indicatorDefinitionSchema = z.union([
  z.object({ type: z.literal("base") }),
  z.object({ type: z.literal("derived"), expression: z.string() }),
]);

const indicatorSourceSchema = z.object({
  source_id: z.string(),
  source_label: z.string(),
});

// The rule's shape rules (ascending cutoffs, one more bucket than cutoffs,
// stored units) are the schema's refinements; the route only narrows. Sources
// are written in the indicator's own transaction: a base's sources, empty
// for a derived (the DB layer refuses otherwise).
const indicatorItemSchema = z.object({
  indicator_common_id: z.string(),
  indicator_common_label: z.string(),
  sources: z.array(indicatorSourceSchema),
  definition: indicatorDefinitionSchema,
  format_as: z.enum(["percent", "number", "rate_per_10k"]),
  thresholds: thresholdsRuleSchema.nullable(),
});

export const indicatorRouteRegistry = {
  getIndicators: route({
    path: "/indicators",
    method: "GET",
    response: {} as InstanceIndicatorDetails,
  }),
  createIndicators: route({
    path: "/indicators",
    method: "POST",
    body: z.object({ indicators: z.array(indicatorItemSchema) }),
  }),
  updateIndicator: route({
    path: "/indicators/update",
    method: "POST",
    body: z.object({
      old_indicator_common_id: z.string(),
      indicator: indicatorItemSchema,
    }),
  }),
  deleteIndicators: route({
    path: "/indicators/delete",
    method: "POST",
    body: z.object({ indicator_common_ids: z.array(z.string()) }),
  }),
  reorderIndicators: route({
    path: "/indicators/reorder",
    method: "POST",
    body: z.object({ order: z.array(z.string()) }),
  }),
  batchUploadIndicators: route({
    path: "/indicators/batch",
    method: "POST",
    body: z.object({
      asset_file_name: z.string(),
      replace_all_existing: z.boolean(),
    }),
  }),
} as const;
