import { z } from "zod";
import {
  instanceConfigAdminAreaLabelsSchema,
  structureSchemaSchema,
} from "../../types/mod.ts";
import type {
  InstanceDetail,
  InstanceMeta,
} from "../../types/mod.ts";
import { route } from "../route-utils.ts";

export const instanceRouteRegistry = {
  getInstanceMeta: route({
    path: "/instance_meta",
    method: "GET",
    response: {} as InstanceMeta,
  }),
  getInstanceDetail: route({
    path: "/instance",
    method: "GET",
    response: {} as InstanceDetail,
  }),
  updateStructureSchema: route({
    path: "/update_structure_schema",
    method: "POST",
    body: z.object({
      family: z.enum(["hmis", "hfa"]),
      schema: structureSchemaSchema,
    }),
  }),
  updateAdminAreaLabelsConfig: route({
    path: "/update_admin_area_labels_config",
    method: "POST",
    body: instanceConfigAdminAreaLabelsSchema,
  }),
  // The instance-level copilot grounding (D15). There is no getter: the value
  // rides InstanceState with the rest of the config, so the settings textarea
  // reads it from the store and only ever writes here.
  updateAiContextConfig: route({
    path: "/update_ai_context_config",
    method: "POST",
    body: z.object({ aiContext: z.string().max(20000) }),
  }),
  getDiskSpace: route({
    path: "/disk_space",
    method: "GET",
    response: {} as { ok: boolean; availableGB?: number },
  }),
} as const;
