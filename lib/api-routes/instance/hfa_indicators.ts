import type { HfaIndicator } from "../../types/mod.ts";
import { route } from "../route-utils.ts";

export const hfaIndicatorRouteRegistry = {
  getHfaIndicators: route({
    path: "/hfa-indicators",
    method: "GET",
    response: {} as HfaIndicator[],
  }),

  createHfaIndicator: route({
    path: "/hfa-indicators",
    method: "POST",
    body: {} as { indicator: HfaIndicator; sortOrder: number },
  }),

  updateHfaIndicator: route({
    path: "/hfa-indicators/update",
    method: "POST",
    body: {} as { oldVarName: string; indicator: HfaIndicator; sortOrder: number },
  }),

  deleteHfaIndicators: route({
    path: "/hfa-indicators/delete",
    method: "POST",
    body: {} as { varNames: string[] },
  }),

  batchUploadHfaIndicators: route({
    path: "/hfa-indicators/batch",
    method: "POST",
    body: {} as { indicators: HfaIndicator[]; replaceAll: boolean },
  }),
} as const;
