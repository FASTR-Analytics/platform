import type {
  InstanceConfigAdminAreaLabels,
  InstanceConfigFacilityColumns,
  InstanceDetail,
  InstanceMeta,
  ProjectSummary,
} from "../../types/mod.ts";
import { route } from "../route-utils.ts";

// Route registry for instance
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
    body: {} as { maxAdminArea: number },
  }),
  updateFacilityColumnsConfig: route({
    path: "/update_facility_columns_config",
    method: "POST",
    body: {} as InstanceConfigFacilityColumns,
  }),
  updateAdminAreaLabelsConfig: route({
    path: "/update_admin_area_labels_config",
    method: "POST",
    body: {} as InstanceConfigAdminAreaLabels,
  }),
  updateCountryIso3: route({
    path: "/update_country_iso3",
    method: "POST",
    body: {} as { countryIso3: string | undefined },
  }),
} as const;
