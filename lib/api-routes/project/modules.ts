import { z } from "zod";
import type {
  InstalledModuleWithConfigSelections,
  ItemsHolderResultsObject,
} from "../../types/mod.ts";
import { route } from "../route-utils.ts";

// module_id arrives as a string URL param; ModuleId is a large string union so
// z.string() is used rather than a Zod enum (don't tighten while migrating).
const moduleIdParamsSchema = z.object({ module_id: z.string() });

// Script/logs/files read from an immutable run's outputs dir
// (runs/{runId}/outputs/{moduleId}) — the run must have been generated from
// this project or be its attached run.
const runModuleParamsSchema = z.object({
  run_id: z.string(),
  module_id: z.string(),
});

export const moduleRouteRegistry = {
  getResultsObjectItems: route({
    path: "/results_object_items/:results_object_id",
    method: "GET",
    // results_object_id is a module-defined filename (e.g. "M10_hfa_results.csv"), not a UUID
    params: z.object({ results_object_id: z.string() }),
    response: {} as ItemsHolderResultsObject,
    requiresProject: true,
  }),
  getScript: route({
    path: "/run/:run_id/module/:module_id/script",
    method: "GET",
    params: runModuleParamsSchema,
    response: {} as { script: string },
    requiresProject: true,
  }),
  getLogs: route({
    path: "/run/:run_id/module/:module_id/logs",
    method: "GET",
    params: runModuleParamsSchema,
    response: {} as { logs: string },
    requiresProject: true,
  }),
  listRunModuleFiles: route({
    path: "/run/:run_id/module/:module_id/files",
    method: "GET",
    params: runModuleParamsSchema,
    response: {} as { files: { name: string; sizeBytes: number }[] },
    requiresProject: true,
  }),
  getModuleWithConfigSelections: route({
    path: "/module/:module_id/config_selections",
    method: "GET",
    params: moduleIdParamsSchema,
    response: {} as InstalledModuleWithConfigSelections,
    requiresProject: true,
  }),
} as const;
