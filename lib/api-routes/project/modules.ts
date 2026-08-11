import { z } from "zod";
import type {
  InstalledModuleWithConfigSelections,
  ItemsHolderResultsObject,
} from "../../types/mod.ts";
import { route } from "../route-utils.ts";

// module_id arrives as a string URL param; ModuleId is a large string union so
// z.string() is used rather than a Zod enum (don't tighten while migrating).
const moduleIdParamsSchema = z.object({ module_id: z.string() });

// The per-module script/logs/files viewers used to live here; they are now
// split by surface — `projectResultsPackageRouteRegistry` for a project (no
// runId, one permission per kind of content) and `runGenerationRouteRegistry`
// for the instance catalogue (run-keyed, can_configure_data).

export const moduleRouteRegistry = {
  getResultsObjectItems: route({
    path: "/results_object_items/:results_object_id",
    method: "GET",
    // results_object_id is a module-defined filename (e.g. "M10_hfa_results.csv"), not a UUID
    params: z.object({ results_object_id: z.string() }),
    response: {} as ItemsHolderResultsObject,
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
