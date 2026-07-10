import { join } from "@std/path";
import { Hono } from "hono";
import {
  _MODULE_LOG_FILE_NAME,
  _SANDBOX_DIR_PATH,
} from "../../exposed_env_vars.ts";
import {
  getPackageReadContext,
  getResultsObjectItemsFromRun,
} from "../../run_query/mod.ts";
import { refreshSandboxPackageSafe } from "../../runs/mod.ts";
import {
  getAllCalculatedIndicatorsFromSnapshot,
  getAllHfaIndicatorCodeFromSnapshot,
  getAllHfaIndicatorsFromSnapshot,
  getHfaSentinelRowsFromSnapshot,
  getHfaTimePointOrder,
  getAllMetrics,
  getAllModulesForProject,
  getCountryIso3Config,
  getMetricsForModule,
  getMetricsWithStatus,
  getModuleDetail,
  getModuleWithConfigSelections,
  // getModuleParameters,
  installModule,
  uninstallModule,
  updateModuleDefinition,
  updateModuleParameters,
} from "../../db/mod.ts";
import {
  _DATASET_LIMIT,
  MODULE_REGISTRY,
  isModuleAllowedForCountry,
  throwIfErrWithData,
  type CalculatedIndicator,
  type HfaIndicator,
  type HfaIndicatorCode,
  type ModuleUpdatePreview,
  type ModuleId,
} from "lib";
import { requireProjectPermission } from "../../project_auth.ts";
import { fetchCommits } from "../../github/fetch_module.ts";
import { compareDefinitions, fetchModuleFiles, recommendsRerun } from "../../module_loader/mod.ts";
import { getScriptWithParameters } from "../../server_only_funcs/get_script_with_parameters.ts";
import {
  notifyLastUpdated,
  setModuleDirty,
} from "../../task_management/mod.ts";
import {
  notifyProjectModulesUpdated,
  notifyProjectVisualizationsUpdated,
} from "../../task_management/notify_project_v2.ts";
import { addOtherModulesThatDependOnModule } from "../../task_management/get_dependents.ts";
import {
  hasRunningModule,
  removeRunningModule,
} from "../../task_management/running_tasks_map.ts";
import { getAllPresentationObjectsForProject } from "../../db/mod.ts";
import { defineRoute } from "../route-helpers.ts";
import { log } from "../../middleware/logging.ts";

export const routesModules = new Hono();

/////////////////////////
//                     //
//    Module detail    //
//                     //
/////////////////////////

defineRoute(
  routesModules,
  "installModule",
  requireProjectPermission(
    { preventAccessToLockedProjects: true },
    "can_configure_modules",
  ),
  log("installModule"),
  async (c, { params }) => {
    const registryEntry = MODULE_REGISTRY.find((m) => m.id === params.module_id);
    if (registryEntry) {
      const countryRes = await getCountryIso3Config(c.var.mainDb);
      const countryIso3 = countryRes.success ? countryRes.data.countryIso3 : undefined;
      if (!isModuleAllowedForCountry(registryEntry, countryIso3)) {
        return c.json({ success: false as const, err: "This module is not available for this country" });
      }
    }
    const res = await installModule(c.var.ppk.projectDb, params.module_id as ModuleId);
    if (res.success === false) {
      return c.json(res);
    }
    // Eager finalize (PLAN_RESULTS_RUNS §3.8) — module install/uninstall/
    // param/definition changes are project-level acts.
    await refreshSandboxPackageSafe(
      c.var.mainDb,
      c.var.ppk.projectDb,
      c.var.ppk.projectId,
    );
    await setModuleDirty(c.var.ppk, params.module_id);
    notifyLastUpdated(
      c.var.ppk.projectId,
      "modules",
      [params.module_id],
      res.data.lastUpdated,
    );
    notifyLastUpdated(
      c.var.ppk.projectId,
      "presentation_objects",
      res.data.presObjIdsWithNewLastUpdateds,
      res.data.lastUpdated,
    );
    const [modulesRes, metricsRes] = await Promise.all([
      getAllModulesForProject(c.var.ppk.projectDb),
      getMetricsWithStatus(c.var.mainDb, c.var.ppk.projectDb),
    ]);
    const commonIndicators = (
      await c.var.ppk.projectDb<{ indicator_common_id: string; indicator_common_label: string }[]>`
        SELECT indicator_common_id, indicator_common_label FROM indicators ORDER BY indicator_common_label
      `
    ).map((row: { indicator_common_id: string; indicator_common_label: string }) => ({ id: row.indicator_common_id, label: row.indicator_common_label }));
    const icehIndicators = (
      await c.var.ppk.projectDb<{ iceh_indicator: string; indicator_name: string; category: string }[]>`
        SELECT iceh_indicator, indicator_name, category FROM iceh_indicators_snapshot ORDER BY sort_order, iceh_indicator
      `
    ).map((row: { iceh_indicator: string; indicator_name: string; category: string }) => ({ id: row.iceh_indicator, label: row.indicator_name, category: row.category }));
    if (modulesRes.success && metricsRes.success) {
      notifyProjectModulesUpdated(c.var.ppk.projectId, modulesRes.data, metricsRes.data, commonIndicators, icehIndicators);
    }
    const vizRes = await getAllPresentationObjectsForProject(c.var.ppk.projectDb);
    if (vizRes.success) {
      notifyProjectVisualizationsUpdated(c.var.ppk.projectId, vizRes.data);
    }
    return c.json(res);
  },
);

defineRoute(
  routesModules,
  "uninstallModule",
  requireProjectPermission(
    { preventAccessToLockedProjects: true },
    "can_configure_modules",
  ),
  log("uninstallModule"),
  async (c, { params }) => {
    // The client blocks this too; enforce server-side so direct API calls or
    // stale-client races cannot uninstall a producer other installed modules
    // depend on (the readiness gate treats an absent producer as ready).
    const dependents: string[] = [];
    await addOtherModulesThatDependOnModule(
      c.var.ppk.projectDb,
      params.module_id,
      dependents,
    );
    if (dependents.length > 0) {
      return c.json({
        success: false as const,
        err: `Cannot uninstall this module: ${dependents.join(", ")} depend(s) on its results. Uninstall those first.`,
      });
    }
    if (hasRunningModule(c.var.ppk.projectId, params.module_id)) {
      removeRunningModule(c.var.ppk.projectId, params.module_id);
    }
    const res = await uninstallModule(c.var.ppk.projectDb, params.module_id);
    if (res.success === false) {
      return c.json(res);
    }
    await refreshSandboxPackageSafe(
      c.var.mainDb,
      c.var.ppk.projectDb,
      c.var.ppk.projectId,
    );
    const [modulesRes, metricsRes] = await Promise.all([
      getAllModulesForProject(c.var.ppk.projectDb),
      getMetricsWithStatus(c.var.mainDb, c.var.ppk.projectDb),
    ]);
    const commonIndicators = (
      await c.var.ppk.projectDb<{ indicator_common_id: string; indicator_common_label: string }[]>`
        SELECT indicator_common_id, indicator_common_label FROM indicators ORDER BY indicator_common_label
      `
    ).map((row: { indicator_common_id: string; indicator_common_label: string }) => ({ id: row.indicator_common_id, label: row.indicator_common_label }));
    const icehIndicators = (
      await c.var.ppk.projectDb<{ iceh_indicator: string; indicator_name: string; category: string }[]>`
        SELECT iceh_indicator, indicator_name, category FROM iceh_indicators_snapshot ORDER BY sort_order, iceh_indicator
      `
    ).map((row: { iceh_indicator: string; indicator_name: string; category: string }) => ({ id: row.iceh_indicator, label: row.indicator_name, category: row.category }));
    if (modulesRes.success && metricsRes.success) {
      notifyProjectModulesUpdated(c.var.ppk.projectId, modulesRes.data, metricsRes.data, commonIndicators, icehIndicators);
    }
    return c.json(res);
  },
);

defineRoute(
  routesModules,
  "updateModuleDefinition",
  requireProjectPermission(
    { preventAccessToLockedProjects: true },
    "can_configure_modules",
  ),
  log("updateModuleDefinition"),
  async (c, { params, body }) => {
    const res = await updateModuleDefinition(
      c.var.ppk.projectDb,
      params.module_id as ModuleId,
      body.reinstall,
      body.rerun,
      body.preserveSettings,
    );
    if (res.success === false) {
      return c.json(res);
    }
    await refreshSandboxPackageSafe(
      c.var.mainDb,
      c.var.ppk.projectDb,
      c.var.ppk.projectId,
    );

    // If rerun requested, notify task manager
    if (body.rerun) {
      await setModuleDirty(c.var.ppk, params.module_id);
    }

    // Notify clients
    notifyLastUpdated(
      c.var.ppk.projectId,
      "modules",
      [params.module_id],
      res.data.lastUpdated,
    );
    notifyLastUpdated(
      c.var.ppk.projectId,
      "presentation_objects",
      res.data.presObjIdsWithNewLastUpdateds,
      res.data.lastUpdated,
    );
    const [modulesRes, metricsRes] = await Promise.all([
      getAllModulesForProject(c.var.ppk.projectDb),
      getMetricsWithStatus(c.var.mainDb, c.var.ppk.projectDb),
    ]);
    const commonIndicators = (
      await c.var.ppk.projectDb<{ indicator_common_id: string; indicator_common_label: string }[]>`
        SELECT indicator_common_id, indicator_common_label FROM indicators ORDER BY indicator_common_label
      `
    ).map((row: { indicator_common_id: string; indicator_common_label: string }) => ({ id: row.indicator_common_id, label: row.indicator_common_label }));
    const icehIndicators = (
      await c.var.ppk.projectDb<{ iceh_indicator: string; indicator_name: string; category: string }[]>`
        SELECT iceh_indicator, indicator_name, category FROM iceh_indicators_snapshot ORDER BY sort_order, iceh_indicator
      `
    ).map((row: { iceh_indicator: string; indicator_name: string; category: string }) => ({ id: row.iceh_indicator, label: row.indicator_name, category: row.category }));
    if (modulesRes.success && metricsRes.success) {
      notifyProjectModulesUpdated(c.var.ppk.projectId, modulesRes.data, metricsRes.data, commonIndicators, icehIndicators);
    }

    return c.json(res);
  },
);

defineRoute(
  routesModules,
  "updateModuleParameters",
  requireProjectPermission(
    { preventAccessToLockedProjects: true },
    "can_configure_modules",
  ),
  log("updateModuleParameters"),
  async (c, { params, body }) => {
    const res = await updateModuleParameters(
      c.var.ppk.projectDb,
      params.module_id,
      body.newParams,
    );
    if (res.success === false) {
      return c.json(res);
    }
    await refreshSandboxPackageSafe(
      c.var.mainDb,
      c.var.ppk.projectDb,
      c.var.ppk.projectId,
    );
    await setModuleDirty(c.var.ppk, params.module_id);
    notifyLastUpdated(
      c.var.ppk.projectId,
      "modules",
      [params.module_id],
      res.data.lastUpdated,
    );
    return c.json(res);
  },
);

///////////////
//           //
//    Run    //
//           //
///////////////

defineRoute(
  routesModules,
  "rerunModule",
  requireProjectPermission(
    { preventAccessToLockedProjects: true },
    "can_run_modules",
  ),
  log("rerunModule"),
  async (c, { params }) => {
    const res = await getModuleDetail(c.var.ppk.projectDb, params.module_id);
    if (res.success === false) {
      return c.json(res);
    }
    await setModuleDirty(c.var.ppk, params.module_id);
    return c.json({ success: true });
  },
);

///////////////////////////
//                       //
//    Results objects    //
//                       //
///////////////////////////

defineRoute(
  routesModules,
  "getResultsObjectItems",
  requireProjectPermission(),
  log("getResultsObjectItems"),
  async (c, { params }) => {
    const ctxRes = await getPackageReadContext(
      c.var.mainDb,
      c.var.ppk.projectDb,
      c.var.ppk.projectId,
    );
    if (ctxRes.success === false) return c.json(ctxRes);
    const res = await getResultsObjectItemsFromRun(
      ctxRes.data,
      params.results_object_id,
      _DATASET_LIMIT,
    );
    return c.json(res);
  },
);

///////////////////////////
//                       //
//    Module Script      //
//                       //
///////////////////////////

defineRoute(
  routesModules,
  "getScript",
  requireProjectPermission("can_configure_modules"),
  log("getModuleScript"),
  async (c, { params }) => {
    const res = await getModuleDetail(c.var.ppk.projectDb, params.module_id);
    if (res.success === false) {
      return c.json(res);
    }
    const resCountryIso3 = await getCountryIso3Config(c.var.mainDb);
    throwIfErrWithData(resCountryIso3);

    let knownDatasetVariables: Set<string> | undefined;
    let hfaIndicators: HfaIndicator[] | undefined;
    let hfaIndicatorCode: HfaIndicatorCode[] | undefined;
    let calculatedIndicators: CalculatedIndicator[] | undefined;
    let hfaSentinelRows: Awaited<
      ReturnType<typeof getHfaSentinelRowsFromSnapshot>
    > = [];
    let hfaTimePointOrder: string[] | undefined;

    if (res.data.moduleDefinition.scriptGenerationType === "hfa") {
      const hfaVarRows = await c.var.ppk.projectDb<{ var_name: string }[]>`
        SELECT DISTINCT var_name FROM indicators_hfa ORDER BY var_name
      `;
      knownDatasetVariables = new Set(
        hfaVarRows.map((r: { var_name: string }) => r.var_name),
      );

      // Read from the project-level snapshot so preview matches what the
      // runner actually executes (same source, same rows).
      hfaIndicators = await getAllHfaIndicatorsFromSnapshot(c.var.ppk.projectDb);
      hfaIndicatorCode = await getAllHfaIndicatorCodeFromSnapshot(
        c.var.ppk.projectDb,
      );
      hfaSentinelRows = await getHfaSentinelRowsFromSnapshot(c.var.ppk.projectDb);
      hfaTimePointOrder = await getHfaTimePointOrder(c.var.mainDb);
    }

    if (res.data.moduleDefinition.scriptGenerationType === "calculated_indicators") {
      // Read from the project-level snapshot so preview matches what the
      // runner actually executes (same source, same rows).
      calculatedIndicators = await getAllCalculatedIndicatorsFromSnapshot(
        c.var.ppk.projectDb,
      );
    }

    const script = getScriptWithParameters(
      res.data.moduleDefinition,
      res.data.configSelections,
      resCountryIso3.data.countryIso3,
      knownDatasetVariables,
      hfaIndicators,
      hfaIndicatorCode,
      calculatedIndicators,
      hfaSentinelRows,
      hfaTimePointOrder,
    );
    return c.json({ success: true, data: { script } });
  },
);

///////////////////////////
//                       //
//    Module Logs        //
//                       //
///////////////////////////

defineRoute(
  routesModules,
  "getLogs",
  requireProjectPermission("can_configure_modules"),
  log("getModuleLogs"),
  async (c, { params }) => {
    const logFilePath = join(
      _SANDBOX_DIR_PATH,
      c.var.ppk.projectId,
      params.module_id,
      _MODULE_LOG_FILE_NAME,
    );

    try {
      const logs = await Deno.readTextFile(logFilePath);
      return c.json({ success: true, data: { logs } });
    } catch (error) {
      if (error instanceof Deno.errors.NotFound) {
        return c.json({
          success: false,
          err: "Log file not found. Module may not have been run yet.",
        });
      }
      return c.json({
        success: false,
        err: "Error reading log file: " + String(error),
      });
    }
  },
);

///////////////////////////////////
//                               //
//    New Routes for Modules     //
//                               //
///////////////////////////////////

defineRoute(
  routesModules,
  "getModuleWithConfigSelections",
  requireProjectPermission(),
  log("getModuleWithConfigSelections"),
  async (c, { params }) => {
    const res = await getModuleWithConfigSelections(
      c.var.ppk.projectDb,
      params.module_id,
    );
    return c.json(res);
  },
);

defineRoute(
  routesModules,
  "getAllMetrics",
  requireProjectPermission(),
  async (c) => {
    const res = await getMetricsWithStatus(c.var.mainDb, c.var.ppk.projectDb);
    return c.json(res);
  },
);

defineRoute(
  routesModules,
  "previewModuleUpdate",
  requireProjectPermission("can_configure_modules"),
  async (c, { params }) => {
    const registryEntry = MODULE_REGISTRY.find((m) => m.id === params.module_id);
    if (!registryEntry) {
      return c.json({ success: false, err: `Unknown module: ${params.module_id}` });
    }

    // Get stored module
    const stored = await getModuleDetail(c.var.ppk.projectDb, params.module_id);
    if (stored.success === false) {
      return c.json(stored);
    }
    const storedDef = stored.data.moduleDefinition;

    // Get presentation def git ref (most recently installed)
    const presentationDefGitRef =
      (
        await c.var.ppk.projectDb<{ presentation_def_git_ref: string | null }[]>`
      SELECT presentation_def_git_ref FROM modules WHERE id = ${params.module_id}
    `
      ).at(0)?.presentation_def_git_ref ?? null;

    // Fetch incoming definition from source (GitHub or local)
    let incomingDef, incomingScript, incomingGitRef;
    try {
      const fetched = await fetchModuleFiles(params.module_id);
      incomingDef = fetched.definition;
      incomingScript = fetched.script;
      incomingGitRef = fetched.gitRef;
    } catch (e) {
      return c.json({
        success: false,
        err: `Failed to fetch module from source: ${e instanceof Error ? e.message : String(e)}`,
      });
    }

    // Determine if there's an update available (git refs differ)
    const hasUpdate =
      incomingGitRef !== undefined &&
      (!presentationDefGitRef || incomingGitRef !== presentationDefGitRef);

    // Get stored metrics from DB (not in module_definition JSON)
    const storedMetrics = await getMetricsForModule(
      c.var.ppk.projectDb,
      params.module_id,
    );
    if (storedMetrics.success === false) {
      return c.json(storedMetrics);
    }

    // Compare definitions using shared comparison logic
    const changes = compareDefinitions(
      incomingDef,
      incomingScript,
      storedDef,
      storedMetrics.data,
    );

    // Get commits since installed version
    let commitsSince: ModuleUpdatePreview["commitsSince"] = [];
    if (hasUpdate) {
      const { owner, repo, path } = registryEntry.github;
      const commitsRes = await fetchCommits(owner, repo, path, "main");
      if (commitsRes.success) {
        if (presentationDefGitRef) {
          const idx = commitsRes.data.findIndex(
            (cm) => cm.sha === presentationDefGitRef,
          );
          if (idx === -1) {
            // Installed commit not found in recent history — return all commits
            commitsSince = commitsRes.data;
          } else {
            // Return commits between HEAD and installed (exclusive)
            commitsSince = commitsRes.data.slice(0, idx);
          }
        } else {
          // No installed ref — return all commits
          commitsSince = commitsRes.data;
        }
      }
    }

    const preview: ModuleUpdatePreview = {
      hasUpdate,
      currentGitRef: presentationDefGitRef,
      incomingGitRef: incomingGitRef ?? "",
      changes,
      recommendsRerun: recommendsRerun(changes),
      commitsSince,
    };

    return c.json({ success: true, data: preview });
  },
);
