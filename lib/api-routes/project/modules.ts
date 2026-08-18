import { z } from "zod";
import type { ItemsHolderResultsObject } from "../../types/mod.ts";
import { route } from "../route-utils.ts";

// Everything a package CONTAINS — script, logs, files, settings — is read
// run-keyed on the instance mount (`runGenerationRouteRegistry`, Tim's ruling
// 2026-08-18); this project mount keeps only the raw results-object read.

export const moduleRouteRegistry = {
  getResultsObjectItems: route({
    path: "/results_object_items/:results_object_id",
    method: "GET",
    // results_object_id is a module-defined filename (e.g. "M10_hfa_results.csv"), not a UUID
    params: z.object({ results_object_id: z.string() }),
    response: {} as ItemsHolderResultsObject,
    requiresProject: true,
  }),
} as const;
