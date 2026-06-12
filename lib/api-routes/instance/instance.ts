import { z } from "zod";
import {
  instanceConfigAdminAreaLabelsSchema,
  instanceConfigFacilityColumnsSchema,
} from "../../types/mod.ts";
import type {
  InstanceConfigAdminAreaLabels,
  InstanceConfigFacilityColumns,
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
  updateMaxAdminArea: route({
    path: "/update_max_admin_area",
    method: "POST",
    body: z.object({ maxAdminArea: z.number() }),
  }),
  updateFacilityColumnsConfig: route({
    path: "/update_facility_columns_config",
    method: "POST",
    body: instanceConfigFacilityColumnsSchema,
  }),
  updateAdminAreaLabelsConfig: route({
    path: "/update_admin_area_labels_config",
    method: "POST",
    body: instanceConfigAdminAreaLabelsSchema,
  }),
  updateCountryIso3: route({
    path: "/update_country_iso3",
    method: "POST",
    body: z.object({ countryIso3: z.string().optional() }),
  }),
  getDiskSpace: route({
    path: "/disk_space",
    method: "GET",
    response: {} as { ok: boolean; availableGB?: number },
  }),
} as const;
