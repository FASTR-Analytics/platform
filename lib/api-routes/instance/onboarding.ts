import { z } from "zod";
import { route } from "../route-utils.ts";

export const onboardingRouteRegistry = {
  // Guided-tour telemetry: one row per tour start / finish / abort, written
  // through the user-log pipeline (see server/routes/instance/onboarding.ts).
  recordTourEvent: route({
    path: "/onboarding/tour_event",
    method: "POST",
    body: z.object({
      tourId: z.string().max(100),
      event: z.enum(["start", "finish", "abort"]),
      page: z.string().max(100),
      trigger: z.enum(["auto", "manual"]),
      // abort only: where the user (or a missing target) ended the run
      stepIndex: z.number().int().min(0).optional(),
      stepId: z.string().max(100).optional(),
      reason: z.enum(["skip", "timeout", "programmatic"]).optional(),
      projectId: z.string().max(100).optional(),
    }),
  }),
} as const;
