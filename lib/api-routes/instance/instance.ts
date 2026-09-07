import { z } from "zod";
import {
  instanceConfigAdminAreaLabelsSchema,
  structureSchemaSchema,
} from "../../types/mod.ts";
import type {
  InstanceDetail,
  InstanceMeta,
  ProjectSummary,
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
  getMyProjects: route({
    path: "/my_projects",
    method: "GET",
    response: {} as ProjectSummary[],
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
  getDiskSpace: route({
    path: "/disk_space",
    method: "GET",
    response: {} as { ok: boolean; availableGB?: number },
  }),
} as const;
