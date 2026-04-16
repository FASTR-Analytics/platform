import type { CalculatedIndicator } from "../../types/mod.ts";
import { route } from "../route-utils.ts";

export const calculatedIndicatorRouteRegistry = {
  getCalculatedIndicators: route({
    path: "/calculated-indicators",
    method: "GET",
    response: {} as CalculatedIndicator[],
  }),

  createCalculatedIndicator: route({
    path: "/calculated-indicators",
    method: "POST",
    body: {} as { indicator: CalculatedIndicator },
  }),

  updateCalculatedIndicator: route({
    path: "/calculated-indicators/update",
    method: "POST",
    body: {} as {
      oldCalculatedIndicatorId: string;
      indicator: CalculatedIndicator;
    },
  }),

  deleteCalculatedIndicators: route({
    path: "/calculated-indicators/delete",
    method: "POST",
    body: {} as { calculatedIndicatorIds: string[] },
  }),
} as const;
