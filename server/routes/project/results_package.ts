import { Hono } from "hono";
import {
  getAttachedRunForProject,
  listAttachableRunsForProject,
} from "../../db/instance/run_generation.ts";
import { log } from "../../middleware/logging.ts";
import {
  getGlobalUser,
  requireProjectPermission,
  resolveProjectUserAccess,
} from "../../project_auth.ts";
import { _BYPASS_AUTH } from "../../exposed_env_vars.ts";
import { getPgConnectionFromCacheOrNew } from "../../db/mod.ts";
import {
  attachRunToProject,
  buildResultsPackageCompatibilityReport,
  listRunModuleFiles,
  readRunModuleLogs,
  readRunModuleScript,
  resolveRunModuleFileForDownload,
  setProjectFollowPinnedAndAlign,
} from "../../runs/mod.ts";
import { getRunReadContext } from "../../run_query/mod.ts";
import {
  notifyInstanceProjectsLastUpdated,
  notifyInstanceRunsCatalogUpdated,
} from "../../task_management/notify_instance_updated.ts";
import { defineRoute } from "../route-helpers.ts";

// The project's Results package surface (PLAN_RESULTS_RUNS Phase 3 item 4):
// read the package this project serves from, explore what is inside it, and —
// for an editor — pick a different one after seeing the §2.6 compatibility
// report.
//
// Permissions, per §4 Phase 3 (generation instance-admin, attach project
// editor): the attached package is `can_view_data`, since it is the project's
// own data; the picker is `can_configure_visualizations`, the authoring bit
// the Editor preset is built on, because a repoint changes what every
// authored visualization resolves against. The repoint also refuses a locked
// project, like every other edit.
//
// Package INTERNALS (Tim's ruling 2026-07-30 — what lives inside the run
// package directory is visible to a user of an attached project) are gated on
// the per-project bit built for each kind of content: `can_view_script_code`
// for the script, `can_view_logs` for the log, `can_view_data` for the raw
// output files. None of these routes takes a runId — the run comes from
// `projects.run_id`, so a member can only read the package their project
// actually serves from.

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

///////////////////////////////////////////////////////////////////////////////
// Package internals — the PROJECT's copy (no runId; per-content permission)
///////////////////////////////////////////////////////////////////////////////

defineRoute(
  routesProjectResultsPackage,
  "getAttachedPackageModuleScript",
  requireProjectPermission("can_view_script_code"),
  log("getAttachedPackageModuleScript"),
  async (c, { params }) => {
    const ctxRes = await getRunReadContext(c.var.mainDb, c.var.ppk.projectId);
    if (ctxRes.success === false) return c.json(ctxRes);
    return c.json(
      await readRunModuleScript(ctxRes.data.runId, params.module_id),
    );
  },
);

defineRoute(
  routesProjectResultsPackage,
  "getAttachedPackageModuleLogs",
  requireProjectPermission("can_view_logs"),
  log("getAttachedPackageModuleLogs"),
  async (c, { params }) => {
    const ctxRes = await getRunReadContext(c.var.mainDb, c.var.ppk.projectId);
    if (ctxRes.success === false) return c.json(ctxRes);
    return c.json(await readRunModuleLogs(ctxRes.data.runId, params.module_id));
  },
);

defineRoute(
  routesProjectResultsPackage,
  "listAttachedPackageModuleFiles",
  requireProjectPermission("can_view_data"),
  log("listAttachedPackageModuleFiles"),
  async (c, { params }) => {
    const ctxRes = await getRunReadContext(c.var.mainDb, c.var.ppk.projectId);
    if (ctxRes.success === false) return c.json(ctxRes);
    return c.json(await listRunModuleFiles(ctxRes.data.runId, params.module_id));
  },
);

// Raw output-file download for a project member. NOT a registry route, for the
// same reason the project SSE endpoint isn't: an `<a download>` cannot send
// the `Project-Id` header, so the project has to live in the path and the
// permission check has to run inside the handler. It calls
// `resolveProjectUserAccess` — the one authoritative project-access function
// the route middleware and SSE both use — so there is no second copy of the
// access rules, only a second place the project id comes from.
//
// It streams the file (`Deno.open` → `.readable`) rather than buffering it: raw
// module CSVs are multi-GB on Nigeria-scale runs, so the alternative
// (fetch → Blob → object URL, as the backups surface does) would be a real
// regression for the files this exists to serve.
routesProjectResultsPackage.get(
  "/results_package_file/:project_id/:module_id/:file_name",
  async (c) => {
    const projectId = c.req.param("project_id");
    const globalUser = await getGlobalUser(c);
    if (globalUser === "NOT_AUTHENTICATED") {
      c.status(401);
      return c.json({
        success: false,
        err: "Authentication required",
        authError: true,
      });
    }
    if (!_BYPASS_AUTH) {
      if (!globalUser.approved) {
        c.status(403);
        return c.json({ success: false, err: "User is not approved" });
      }
      const mainDb = getPgConnectionFromCacheOrNew("main", "READ_ONLY");
      try {
        const access = await resolveProjectUserAccess(
          globalUser,
          projectId,
          mainDb,
        );
        if (!access.projectUser.can_view_data) {
          c.status(403);
          return c.json({
            success: false,
            err: "You do not have permission to download this file",
          });
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : "";
        if (message === "SERVICE_UNAVAILABLE") {
          c.status(503);
          return c.json({
            success: false,
            err: "Service temporarily unavailable",
          });
        }
        c.status(403);
        return c.json({
          success: false,
          err: "User does not have access to this project",
        });
      }
    }

    // The run comes from the pointer, never the URL — the caller names a
    // project and a file, never a package.
    const mainDb = getPgConnectionFromCacheOrNew("main", "READ_ONLY");
    const ctxRes = await getRunReadContext(mainDb, projectId);
    if (ctxRes.success === false) {
      c.status(404);
      return c.json(ctxRes);
    }
    const fileName = decodeURIComponent(c.req.param("file_name"));
    const resolved = await resolveRunModuleFileForDownload(
      ctxRes.data.runId,
      c.req.param("module_id"),
      fileName,
    );
    if (resolved.success === false) {
      c.status(404);
      return c.json(resolved);
    }
    const file = await Deno.open(resolved.data.path, { read: true });
    return new Response(file.readable, {
      headers: {
        "Content-Type": "application/octet-stream",
        "Content-Length": String(resolved.data.sizeBytes),
        "Content-Disposition": `attachment; filename="${
          fileName.replaceAll('"', "")
        }"`,
      },
    });
  },
);
