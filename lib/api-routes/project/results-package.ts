import { z } from "zod";
import type {
  ResultsPackageCompatibilityReport,
  RunListingItem,
  RunModuleFileListing,
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
const moduleIdParamsSchema = z.object({ module_id: z.string() });

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

  // A package's INTERNALS, from the project side (Tim's ruling 2026-07-30:
  // what lives inside the run package directory is visible to a user of an
  // attached project). Three deliberate properties:
  //
  // 1. **No run_id.** The run is resolved from `projects.run_id`, so a member
  //    can only ever read the package their project actually serves from —
  //    knowing some other runId buys nothing. Same reasoning that made the AI
  //    tools take a run resolver instead of a model-supplied id.
  // 2. **One permission per kind of content**, using the per-project bits the
  //    app already has for exactly this and had never enforced:
  //    `can_view_script_code` (migration 009) for the R script,
  //    `can_view_logs` for the execution log, `can_view_data` for the raw
  //    output files. All three are false in the Viewer and Editor presets and
  //    true for a project Admin, which is the same population that reached
  //    these viewers before the wizard deploy moved them.
  // 3. The instance catalogue keeps its own run-keyed, `can_configure_data`
  //    copies (`runGenerationRouteRegistry`) because an admin browses packages
  //    attached to no project. Both mounts call one reader
  //    (server/runs/package_internals.ts); only the guard differs.
  //
  // The file DOWNLOAD is deliberately not here: an `<a download>` cannot send
  // the `Project-Id` header, so it is a raw streaming endpoint with the project
  // in its path, following the project-SSE precedent. See
  // `routes/project/results_package.ts`.
  getAttachedPackageModuleScript: route({
    path: "/results_package/module/:module_id/script",
    method: "GET",
    params: moduleIdParamsSchema,
    response: {} as { script: string },
    requiresProject: true,
  }),
  getAttachedPackageModuleLogs: route({
    path: "/results_package/module/:module_id/logs",
    method: "GET",
    params: moduleIdParamsSchema,
    response: {} as { logs: string },
    requiresProject: true,
  }),
  listAttachedPackageModuleFiles: route({
    path: "/results_package/module/:module_id/files",
    method: "GET",
    params: moduleIdParamsSchema,
    response: {} as RunModuleFileListing,
    requiresProject: true,
  }),
} as const;
