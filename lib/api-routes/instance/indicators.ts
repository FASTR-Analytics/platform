import { z } from "zod";
import { thresholdsRuleSchema } from "../../types/conditional_formatting.ts";
import type { InstanceIndicatorDetails } from "../../types/mod.ts";
import { route } from "../route-utils.ts";

// What an indicator IS (PLAN_A5 §2). The expression grammar itself is
// checked server-side against the live dictionary and the population store;
// a sum's members are checked there against the live list: the shape check
// here only says which fields each type carries. The count→number format
// rule lives in the DB layer too, where the type is known. An Uploaded
// indicator posts no data id: its key is generated at creation and kept on
// update (PLAN_A6 ruling 1).
const indicatorDefinitionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("uploaded") }),
  z.object({ type: z.literal("dhis2_element"), data_id: z.string() }),
  z.object({ type: z.literal("sum"), members: z.array(z.string()) }),
  z.object({ type: z.literal("derived"), expression: z.string() }),
]);

// The rule's shape rules (ascending cutoffs, one more bucket than cutoffs,
// stored units) are the schema's refinements; the route only narrows.
const indicatorItemSchema = z.object({
  indicator_common_id: z.string(),
  indicator_common_label: z.string(),
  definition: indicatorDefinitionSchema,
  include_in_analysis: z.boolean(),
  format_as: z.enum(["percent", "number", "rate_per_10k"]),
  thresholds: thresholdsRuleSchema.nullable(),
  direction: z.enum(["higher-is-better", "lower-is-better"]),
  target: z.number().nullable(),
  expected_low_counts: z.boolean(),
});

// The naming step's input (PLAN_A6 ruling 7): the DHIS2 create route's
// elements and the derived indicators over them.
export const indicatorNamingElementSchema = z.object({
  data_id: z.string(),
  indicator_id: z.string(),
  label: z.string(),
});

export const indicatorNamingInputSchema = z.object({
  elements: z.array(indicatorNamingElementSchema),
  derived: z.array(
    z.object({
      indicator_id: z.string(),
      label: z.string(),
      expression: z.string(),
      format_as: z.enum(["percent", "number", "rate_per_10k"]),
    }),
  ),
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
  setIndicatorsIncludeInAnalysis: route({
    path: "/indicators/include-in-analysis",
    method: "POST",
    body: z.object({
      indicator_common_ids: z.array(z.string()),
      include_in_analysis: z.boolean(),
    }),
  }),
} as const;
