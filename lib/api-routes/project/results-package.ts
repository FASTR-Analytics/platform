import { z } from "zod";
import type {
  ResultsPackageCompatibilityReport,
  RunListingItem,
} from "../../types/mod.ts";
import { route } from "../route-utils.ts";

// A project's relationship with results packages (PLAN_RESULTS_RUNS Phase 3
// item 4): the picker and the follow-pinned subscription. Generation and
// housekeeping are instance acts (`runGenerationRouteRegistry`), and so is
// READING a package — what it contains is a function of the runId alone, so
// the run-keyed reads there serve every surface (Tim's ruling 2026-08-18);
// the package a project serves from rides project T1 as `attachedRun`.
//
// The permission (§4 Phase 3: generation instance-admin, attach project
// editor): every route here is `can_configure_visualizations`, the authoring
// bit the Editor preset is built on, because a repoint changes what every
// authored visualization resolves against.

const runIdParamsSchema = z.object({ run_id: z.string() });

export const projectResultsPackageRouteRegistry = {
  // The picker's options: every ready package on the instance, newest first
  // (the attached one included — a Select needs its current value listed).
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
  // Subscribe/unsubscribe this project to the instance's pinned package
  // (SYSTEM_08 "The pinned package + followers"): enabling attaches the
  // current pin immediately if one is set and differs; a later manual
  // attach to a non-pinned package clears it. Same permission class as
  // attach — subscribing IS consenting to future repoints.
  setProjectFollowPinned: route({
    path: "/results_package/follow_pinned",
    method: "POST",
    body: z.object({ follow: z.boolean() }),
    requiresProject: true,
  }),
} as const;
