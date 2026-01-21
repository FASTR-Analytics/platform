import type {
  HfaIndicator,
  InstalledModuleWithConfigSelections,
  ItemsHolderResultsObject,
  ModuleId,
  ResultsValue,
} from "../../types/mod.ts";
import { route } from "../route-utils.ts";

export const moduleRouteRegistry = {
  installModule: route({
    path: "/install_module/:module_id",
    method: "GET",
    params: {} as { module_id: ModuleId },
    response: {} as {
      lastUpdated: string;
      presObjIdsWithNewLastUpdateds: string[];
    },
    requiresProject: true,
  }),
  uninstallModule: route({
    path: "/install_module/:module_id",
    method: "DELETE",
    params: {} as { module_id: ModuleId },
    requiresProject: true,
  }),
  updateModuleDefinition: route({
    path: "/update_module_definition/:module_id",
    method: "POST",
    params: {} as { module_id: ModuleId },
    body: {} as {
      preserveSettings: boolean;
      rerunModule: boolean;
    },
    response: {} as {
      lastUpdated: string;
      presObjIdsWithNewLastUpdateds: string[];
    },
    requiresProject: true,
  }),
  updateModuleParameters: route({
    path: "/module_parameters/:module_id",
    method: "POST",
    params: {} as { module_id: ModuleId },
    body: {} as {
      newParams:
        | Record<string, string>
        | { indicators?: HfaIndicator[]; useSampleWeights?: boolean };
    },
    response: {} as { lastUpdated: string },
    requiresProject: true,
  }),
  rerunModule: route({
    path: "/module/:module_id/rerun",
    method: "POST",
    params: {} as { module_id: ModuleId },
    response: {} as { success: true },
    requiresProject: true,
  }),
  getResultsObjectItems: route({
    path: "/results_object_items/:results_object_id",
    method: "GET",
    params: {} as { results_object_id: string },
    response: {} as ItemsHolderResultsObject,
    requiresProject: true,
  }),
  getScript: route({
    path: "/module/:module_id/script",
    method: "GET",
    params: {} as { module_id: ModuleId },
    response: {} as { script: string },
    requiresProject: true,
  }),
  getLogs: route({
    path: "/module/:module_id/logs",
    method: "GET",
    params: {} as { module_id: ModuleId },
    response: {} as { logs: string },
    requiresProject: true,
  }),
  getAllMetrics: route({
    path: "/metrics",
    method: "GET",
    response: {} as ResultsValue[],
    requiresProject: true,
  }),
  getModuleWithConfigSelections: route({
    path: "/module/:module_id/config_selections",
    method: "GET",
    params: {} as { module_id: ModuleId },
    response: {} as InstalledModuleWithConfigSelections,
    requiresProject: true,
  }),
} as const;
