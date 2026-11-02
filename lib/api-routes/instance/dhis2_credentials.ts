import { GUARD, type RouteGuard } from "../../permissions/mod.ts";
import { z } from "zod";
import type { InstanceDhis2CredentialsInfo } from "../../types/mod.ts";
import { route } from "../route-utils.ts";

const dhis2CredentialsSchema = z.object({
  url: z.string(),
  username: z.string(),
  password: z.string(),
});

// Instance-wide stored DHIS2 credentials, shared by every DHIS2 flow.
// Save/delete are configuration actions: every consumer is a configuration
// flow.
export const dhis2CredentialsRouteRegistry = {
  getInstanceDhis2CredentialsInfo: route({
    path: "/instance/dhis2-credentials",
    method: "GET",
    guard: GUARD.permission("can_configure_data"),
    response: {} as InstanceDhis2CredentialsInfo,
  }),
  saveInstanceDhis2Credentials: route({
    path: "/instance/dhis2-credentials",
    method: "POST",
    guard: GUARD.permission("can_configure_data"),
    body: z.object({ credentials: dhis2CredentialsSchema }),
  }),
  deleteInstanceDhis2Credentials: route({
    path: "/instance/dhis2-credentials",
    method: "DELETE",
    guard: GUARD.permission("can_configure_data"),
  }),
} as const satisfies Record<string, { guard: RouteGuard }>;
