import { GUARD, type RouteGuard } from "../../permissions/mod.ts";
import { z } from "zod";
import {
  instanceConfigAdminAreaLabelsSchema,
  structureSchemaSchema,
} from "../../types/mod.ts";
import type { InstanceMeta } from "../../types/mod.ts";
import { route } from "../route-utils.ts";

export const instanceRouteRegistry = {
  getInstanceMeta: route({
    path: "/instance_meta",
    method: "GET",
    guard: GUARD.public,
    response: {} as InstanceMeta,
  }),
  updateStructureSchema: route({
    path: "/update_structure_schema",
    method: "POST",
    guard: GUARD.permission("can_configure_data"),
    body: z.object({
      family: z.enum(["hmis", "hfa"]),
      schema: structureSchemaSchema,
    }),
  }),
  updateAdminAreaLabelsConfig: route({
    path: "/update_admin_area_labels_config",
    method: "POST",
    guard: GUARD.permission("can_configure_data"),
    body: instanceConfigAdminAreaLabelsSchema,
  }),
  updateAiContextConfig: route({
    path: "/update_ai_context_config",
    method: "POST",
    guard: GUARD.permission("can_configure_data"),
    body: z.object({ aiContext: z.string().max(20000) }),
  }),
} as const satisfies Record<string, { guard: RouteGuard }>;
