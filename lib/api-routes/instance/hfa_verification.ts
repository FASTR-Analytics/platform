import { z } from "zod";
import {
  hfaVerificationNewFindingSchema,
  hfaVerificationRulesOffSchema,
} from "../../hfa_verification.ts";
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
  saveHfaIndicatorVerifications: route({
    path: "/hfa-verification/save",
    method: "POST",
    guard: GUARD.permission("can_configure_data"),
    body: z.object({
      results: z.array(z.object({
        indicatorId: z.string(),
        inputHash: z.string(),
        model: z.string(),
        findings: z.array(hfaVerificationNewFindingSchema),
      })).min(1),
    }),
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
