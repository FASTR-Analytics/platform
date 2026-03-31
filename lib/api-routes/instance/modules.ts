import type { ModuleLatestCommit } from "../../types/mod.ts";
import { route } from "../route-utils.ts";

export const instanceModuleRouteRegistry = {
  checkModuleUpdates: route({
    path: "/modules/check_updates",
    method: "GET",
    response: {} as ModuleLatestCommit[],
  }),
} as const;
