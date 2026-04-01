import type { CompareProjectsData, ModuleLatestCommit } from "../../types/mod.ts";
import { route } from "../route-utils.ts";

export const instanceModuleRouteRegistry = {
  checkModuleUpdates: route({
    path: "/modules/check_updates",
    method: "GET",
    response: {} as ModuleLatestCommit[],
  }),
  compareProjects: route({
    path: "/modules/compare_projects",
    method: "GET",
    response: {} as CompareProjectsData,
  }),
} as const;
