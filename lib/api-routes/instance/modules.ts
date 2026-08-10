import type { CompareProjectsData } from "../../types/mod.ts";
import { route } from "../route-utils.ts";

export const instanceModuleRouteRegistry = {
  compareProjects: route({
    path: "/modules/compare_projects",
    method: "GET",
    response: {} as CompareProjectsData,
  }),
} as const;
