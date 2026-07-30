import { z } from "zod";
import type {
  ResultsPackageCompatibilityReport,
  RunListingItem,
} from "../../types/mod.ts";
import { route } from "../route-utils.ts";

// A project's relationship with results packages (PLAN_RESULTS_RUNS Phase 3
// item 4). Generation and housekeeping are instance acts
// (`runGenerationRouteRegistry`); what a project does with packages is read
// the one it serves from, and — for an editor — pick a different one.
//
// The permission split (§4 Phase 3: generation instance-admin, attach project
// editor): reading the attached package is `can_view_data`, the project's own
// data; the three picker routes are `can_configure_visualizations`, the
// authoring bit the Editor preset is built on, because a repoint changes what
// every authored visualization resolves against.

const runIdParamsSchema = z.object({ run_id: z.string() });

export const projectResultsPackageRouteRegistry = {
  // The package this project serves from — null is the typed no-package
  // state, not an error.
  getAttachedResultsPackage: route({
    path: "/results_package/attached",
    method: "GET",
    response: {} as RunListingItem | null,
    requiresProject: true,
  }),
  // The picker's candidates: every ready package except the attached one.
  listAttachableResultsPackages: route({
    path: "/results_package/attachable",
    method: "GET",
    response: {} as RunListingItem[],
    requiresProject: true,
  }),
  // The §2.6 compatibility report for a candidate, shown before any repoint.
  getResultsPackageCompatibility: route({
    path: "/results_package/:run_id/compatibility",
    method: "GET",
    params: runIdParamsSchema,
    response: {} as ResultsPackageCompatibilityReport,
    requiresProject: true,
  }),
  // The repoint: projects.run_id UPDATE + the run_attached event, which is
  // the publish machinery minus the status flip.
  attachResultsPackage: route({
    path: "/results_package/:run_id/attach",
    method: "POST",
    params: runIdParamsSchema,
    requiresProject: true,
  }),
} as const;
