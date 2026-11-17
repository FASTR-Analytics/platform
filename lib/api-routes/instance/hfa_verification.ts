import { z } from "zod";
import { hfaVerificationRulesOffSchema } from "../../hfa_verification.ts";
import { GUARD, type RouteGuard } from "../../permissions/mod.ts";
import type { HfaVerificationRows } from "../../types/mod.ts";
import { route } from "../route-utils.ts";

export const hfaVerificationRouteRegistry = {
  getHfaVerification: route({
    path: "/hfa-verification",
    method: "GET",
    guard: GUARD.permission("can_view_data"),
    response: {} as HfaVerificationRows,
  }),
  startHfaVerificationRun: route({
    path: "/hfa-verification/run",
    method: "POST",
    guard: GUARD.permission("can_configure_data"),
    body: z.object({ indicatorIds: z.array(z.string()).min(1) }),
  }),
  stopHfaVerificationRun: route({
    path: "/hfa-verification/run/stop",
    method: "POST",
    guard: GUARD.permission("can_configure_data"),
  }),
  setHfaVerificationFindingsDismissed: route({
    path: "/hfa-verification/dismissed",
    method: "POST",
    guard: GUARD.permission("can_configure_data"),
    body: z.object({
      findingIds: z.array(z.string()).min(1),
      dismissed: z.boolean(),
    }),
  }),
  setHfaVerificationRulesOff: route({
    path: "/hfa-verification/rules-off",
    method: "POST",
    guard: GUARD.permission("can_configure_data"),
    body: z.object({ ruleIds: hfaVerificationRulesOffSchema }),
  }),
} as const satisfies Record<string, { guard: RouteGuard }>;
