import { z } from "zod";
import type {
  InstalledModuleWithConfigSelections,
  ItemsHolderResultsObject,
} from "../../types/mod.ts";
import { route } from "../route-utils.ts";

// module_id arrives as a string URL param; ModuleId is a large string union so
// z.string() is used rather than a Zod enum (don't tighten while migrating).
const moduleIdParamsSchema = z.object({ module_id: z.string() });

// The per-module script/logs/files viewers used to live here; Phase 3 item 3
// moved them to the instance results-package catalogue
// (`runGenerationRouteRegistry`, can_configure_data) — a run belongs to no
// project, so a debug surface over its outputs is an instance-admin one.

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
