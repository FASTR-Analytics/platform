import { Hono } from "hono";
import { listAttachableRunsForProject } from "../../db/instance/run_generation.ts";
import { log } from "../../middleware/logging.ts";
import { requireProjectPermission } from "../../project_auth.ts";
import {
  attachRunToProject,
  buildResultsPackageCompatibilityReport,
  setProjectFollowPinnedAndAlign,
} from "../../runs/mod.ts";
import {
  notifyInstanceProjectsLastUpdated,
  notifyInstanceRunsCatalogUpdated,
} from "../../task_management/notify_instance_updated.ts";
import { defineRoute } from "../route-helpers.ts";

// The project's Results package surface (PLAN_RESULTS_RUNS Phase 3 item 4):
// pick a different package after seeing the §2.6 compatibility report, and
// subscribe to the instance's pin. Reading a package — what it contains — is
// NOT here: it is a function of the runId alone and lives on the run-keyed
// instance mount under the instance data bits (routes/instance/
// run_generation.ts, Tim's ruling 2026-08-18); the attached row itself rides
// project T1 (`attachedRun`, pushed on starting + run_attached).
//
// Permissions, per §4 Phase 3 (generation instance-admin, attach project
// editor): every route is `can_configure_visualizations`, the authoring bit
// the Editor preset is built on, because a repoint changes what every
// authored visualization resolves against. The repoint also refuses a locked
// project, like every other edit.

export const routesProjectResultsPackage = new Hono();

defineRoute(
  routesProjectResultsPackage,
  "listAttachableResultsPackages",
  requireProjectPermission("can_configure_visualizations"),
  log("listAttachableResultsPackages"),
  async (c) => {
    const res = await listAttachableRunsForProject(c.var.mainDb);
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
      c.var.mainDb,
      c.var.ppk.projectDb,
      c.var.ppk.projectId,
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
    if (res.success) {
      // A repoint changes attachedProjects — the catalogue's delete-blocking
      // column — so the instance listing must move too, and the project
      // cards' package badge (ProjectSummary.attachedRunId) with it.
      notifyInstanceRunsCatalogUpdated();
      notifyInstanceProjectsLastUpdated(new Date().toISOString());
    }
    return c.json(res);
  },
);

// The follow toggle — the enable-time attach + realign live in
// server/runs/pin_run.ts (SYSTEM_08 "Enabling follow attaches immediately").
defineRoute(
  routesProjectResultsPackage,
  "setProjectFollowPinned",
  requireProjectPermission(
    { preventAccessToLockedProjects: true },
    "can_configure_visualizations",
  ),
  log("setProjectFollowPinned"),
  async (c, { body }) => {
    const res = await setProjectFollowPinnedAndAlign(
      c.var.mainDb,
      c.var.ppk.projectId,
      c.var.ppk.projectDb,
      body.follow,
    );
    return c.json(res);
  },
);
