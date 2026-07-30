import { Hono } from "hono";
import {
  getAttachedRunForProject,
  listAttachableRunsForProject,
} from "../../db/instance/run_generation.ts";
import { log } from "../../middleware/logging.ts";
import { requireProjectPermission } from "../../project_auth.ts";
import {
  attachRunToProject,
  buildResultsPackageCompatibilityReport,
} from "../../runs/mod.ts";
import { defineRoute } from "../route-helpers.ts";

// The project's Results package surface (PLAN_RESULTS_RUNS Phase 3 item 4):
// read the package this project serves from, and — for an editor — pick a
// different one after seeing the §2.6 compatibility report.
//
// Permissions, per §4 Phase 3 (generation instance-admin, attach project
// editor): the attached package is `can_view_data`, since it is the project's
// own data; the picker is `can_configure_visualizations`, the authoring bit
// the Editor preset is built on, because a repoint changes what every
// authored visualization resolves against. The repoint also refuses a locked
// project, like every other edit.

export const routesProjectResultsPackage = new Hono();

defineRoute(
  routesProjectResultsPackage,
  "getAttachedResultsPackage",
  requireProjectPermission("can_view_data"),
  log("getAttachedResultsPackage"),
  async (c) => {
    const res = await getAttachedRunForProject(c.var.mainDb, c.var.ppk.projectId);
    return c.json(res);
  },
);

defineRoute(
  routesProjectResultsPackage,
  "listAttachableResultsPackages",
  requireProjectPermission("can_configure_visualizations"),
  log("listAttachableResultsPackages"),
  async (c) => {
    const res = await listAttachableRunsForProject(
      c.var.mainDb,
      c.var.ppk.projectId,
    );
    return c.json(res);
  },
);

defineRoute(
  routesProjectResultsPackage,
  "getResultsPackageCompatibility",
  requireProjectPermission("can_configure_visualizations"),
  log("getResultsPackageCompatibility"),
  async (c, { params }) => {
    const res = await buildResultsPackageCompatibilityReport(
      c.var.ppk.projectDb,
      params.run_id,
    );
    return c.json(res);
  },
);

defineRoute(
  routesProjectResultsPackage,
  "attachResultsPackage",
  requireProjectPermission(
    { preventAccessToLockedProjects: true },
    "can_configure_visualizations",
  ),
  log("attachResultsPackage"),
  async (c, { params }) => {
    const res = await attachRunToProject(
      c.var.mainDb,
      c.var.ppk.projectId,
      c.var.ppk.projectDb,
      params.run_id,
    );
    return c.json(res);
  },
);
