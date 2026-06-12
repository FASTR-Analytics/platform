import { z } from "zod";
import { route } from "../route-utils.ts";

export const hfaTimePointRouteRegistry = {
  createHfaTimePoint: route({
    path: "/hfa-time-points/create",
    method: "POST",
    body: z.object({ label: z.string(), periodId: z.string() }),
  }),
  updateHfaTimePoint: route({
    path: "/hfa-time-points/update",
    method: "POST",
    body: z.object({
      oldLabel: z.string(),
      newLabel: z.string().optional(),
      periodId: z.string().optional(),
    }),
  }),
  reorderHfaTimePoints: route({
    path: "/hfa-time-points/reorder",
    method: "POST",
    body: z.object({ order: z.array(z.string()) }),
  }),
  deleteHfaTimePoint: route({
    path: "/hfa-time-points/delete",
    method: "POST",
    body: z.object({ label: z.string() }),
  }),
} as const;
