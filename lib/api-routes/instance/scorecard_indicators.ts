import type { ScorecardIndicator } from "../../types/mod.ts";
import { route } from "../route-utils.ts";

export const scorecardIndicatorRouteRegistry = {
  getScorecardIndicators: route({
    path: "/scorecard-indicators",
    method: "GET",
    response: {} as ScorecardIndicator[],
  }),

  createScorecardIndicator: route({
    path: "/scorecard-indicators",
    method: "POST",
    body: {} as { indicator: ScorecardIndicator },
  }),

  updateScorecardIndicator: route({
    path: "/scorecard-indicators/update",
    method: "POST",
    body: {} as {
      oldScorecardIndicatorId: string;
      indicator: ScorecardIndicator;
    },
  }),

  deleteScorecardIndicators: route({
    path: "/scorecard-indicators/delete",
    method: "POST",
    body: {} as { scorecardIndicatorIds: string[] },
  }),
} as const;
