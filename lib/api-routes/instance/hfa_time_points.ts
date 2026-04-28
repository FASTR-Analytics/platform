import type { HfaTimePoint } from "../../types/mod.ts";
import { route } from "../route-utils.ts";

export const hfaTimePointRouteRegistry = {
  updateHfaTimePoint: route({
    path: "/hfa-time-points/update",
    method: "POST",
    body: {} as { oldLabel: string; newLabel?: string; periodId?: string },
  }),

  reorderHfaTimePoints: route({
    path: "/hfa-time-points/reorder",
    method: "POST",
    body: {} as { order: string[] },
  }),

  deleteHfaTimePoint: route({
    path: "/hfa-time-points/delete",
    method: "POST",
    body: {} as { label: string },
  }),
} as const;
