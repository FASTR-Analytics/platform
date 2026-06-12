import { z } from "zod";
import type { CalculatedIndicator } from "../../types/mod.ts";
import { route } from "../route-utils.ts";

const calculatedIndicatorSchema = z.object({
  calculated_indicator_id: z.string(),
  label: z.string(),
  group_label: z.string(),
  sort_order: z.number(),
  num_indicator_id: z.string(),
  denom: z.union([
    z.object({ kind: z.literal("none") }),
    z.object({ kind: z.literal("indicator"), indicator_id: z.string() }),
    z.object({ kind: z.literal("population"), population_type: z.string(), multiplier: z.number() }),
  ]),
  format_as: z.enum(["percent", "number", "rate_per_10k"]),
  threshold_direction: z.enum(["higher_is_better", "lower_is_better"]),
  threshold_green: z.number(),
  threshold_yellow: z.number(),
});

export const calculatedIndicatorRouteRegistry = {
  getCalculatedIndicators: route({
    path: "/calculated-indicators",
    method: "GET",
    response: {} as CalculatedIndicator[],
  }),
  createCalculatedIndicator: route({
    path: "/calculated-indicators",
    method: "POST",
    body: z.object({ indicator: calculatedIndicatorSchema }),
  }),
  updateCalculatedIndicator: route({
    path: "/calculated-indicators/update",
    method: "POST",
    body: z.object({
      oldCalculatedIndicatorId: z.string(),
      indicator: calculatedIndicatorSchema,
    }),
  }),
  deleteCalculatedIndicators: route({
    path: "/calculated-indicators/delete",
    method: "POST",
    body: z.object({ calculatedIndicatorIds: z.array(z.string()) }),
  }),
  reorderCalculatedIndicators: route({
    path: "/calculated-indicators/reorder",
    method: "POST",
    body: z.object({ order: z.array(z.string()) }),
  }),
} as const;
