import { z } from "zod";
import type {
  InstalledModuleWithConfigSelections,
  ItemsHolderResultsObject,
  ModuleId,
  ModuleUpdatePreview,
  ResultsValue,
} from "../../types/mod.ts";
import { route } from "../route-utils.ts";

// module_id arrives as a string URL param; ModuleId is a large string union so
// z.string() is used rather than a Zod enum (don't tighten while migrating).
const moduleIdParamsSchema = z.object({ module_id: z.string() });

export const moduleRouteRegistry = {
  installModule: route({
    path: "/install_module/:module_id",
    method: "GET",
    params: moduleIdParamsSchema,
    response: {} as {
      lastUpdated: string;
      presObjIdsWithNewLastUpdateds: string[];
    },
    requiresProject: true,
  }),
  uninstallModule: route({
    path: "/install_module/:module_id",
    method: "DELETE",
    params: moduleIdParamsSchema,
    requiresProject: true,
  }),
  updateModuleDefinition: route({
    path: "/update_module_definition/:module_id",
    method: "POST",
    params: moduleIdParamsSchema,
    body: z.object({
      reinstall: z.boolean(),
      rerun: z.boolean(),
      preserveSettings: z.boolean(),
    }),
    response: {} as {
      lastUpdated: string;
      presObjIdsWithNewLastUpdateds: string[];
    },
    requiresProject: true,
  }),
  updateModuleParameters: route({
    path: "/module_parameters/:module_id",
    method: "POST",
    params: moduleIdParamsSchema,
    body: z.object({ newParams: z.record(z.string(), z.string()) }),
    response: {} as { lastUpdated: string },
    requiresProject: true,
  }),
  rerunModule: route({
    path: "/module/:module_id/rerun",
    method: "POST",
    params: moduleIdParamsSchema,
    requiresProject: true,
  }),
  getResultsObjectItems: route({
    path: "/results_object_items/:results_object_id",
    method: "GET",
    // results_object_id is a module-defined filename (e.g. "M10_hfa_results.csv"), not a UUID
    params: z.object({ results_object_id: z.string() }),
    response: {} as ItemsHolderResultsObject,
    requiresProject: true,
  }),
  getScript: route({
    path: "/module/:module_id/script",
    method: "GET",
    params: moduleIdParamsSchema,
    response: {} as { script: string },
    requiresProject: true,
  }),
  getLogs: route({
    path: "/module/:module_id/logs",
    method: "GET",
    params: moduleIdParamsSchema,
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
    params: moduleIdParamsSchema,
    response: {} as InstalledModuleWithConfigSelections,
    requiresProject: true,
  }),
  previewModuleUpdate: route({
    path: "/module/:module_id/preview_update",
    method: "GET",
    params: moduleIdParamsSchema,
    response: {} as ModuleUpdatePreview,
    requiresProject: true,
  }),
} as const;
