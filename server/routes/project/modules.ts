import { join } from "@std/path";
import { Hono } from "hono";
import {
  _MODULE_LOG_FILE_NAME,
  _SANDBOX_DIR_PATH,
} from "../../exposed_env_vars.ts";
import {
  getAllHfaIndicatorCodeFromSnapshot,
  getAllHfaIndicatorsFromSnapshot,
  getAllMetrics,
  getCountryIso3Config,
  getModuleDetail,
  getModuleWithConfigSelections,
  // getModuleParameters,
  getResultsObjectItems,
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
  type HfaIndicator,
  type HfaIndicatorCode,
  type ModuleUpdatePreview,
} from "lib";
import { requireProjectPermission } from "../../project_auth.ts";
import { fetchCommits } from "../../github/fetch_module.ts";
import { fetchModuleFiles } from "../../module_loader/load_module.ts";
import { getScriptWithParameters } from "../../server_only_funcs/get_script_with_parameters.ts";
import {
  notifyLastUpdated,
  setModuleDirty,
} from "../../task_management/mod.ts";
import { notifyProjectUpdated } from "../../task_management/notify_last_updated.ts";
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
    const res = await installModule(c.var.ppk.projectDb, params.module_id);
    if (res.success === false) {
      return c.json(res);
    }
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
    notifyProjectUpdated(c.var.ppk.projectId, res.data.lastUpdated);
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
    const res = await uninstallModule(c.var.ppk.projectDb, params.module_id);
    if (res.success === false) {
      return c.json(res);
    }
    notifyProjectUpdated(c.var.ppk.projectId, new Date().toISOString());
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
      params.module_id,
      body.preserveSettings,
    );
    if (res.success === false) {
      return c.json(res);
    }
    if (res.data.computeChange) {
      await setModuleDirty(c.var.ppk, params.module_id);
    }
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
    notifyProjectUpdated(c.var.ppk.projectId, res.data.lastUpdated);
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
    const res = await getResultsObjectItems(
      c.var.ppk.projectDb,
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
    }

    const script = getScriptWithParameters(
      res.data.moduleDefinition,
      res.data.configSelections,
      resCountryIso3.data.countryIso3,
      knownDatasetVariables,
      hfaIndicators,
      hfaIndicatorCode,
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
    const res = await getAllMetrics(c.var.mainDb, c.var.ppk.projectDb);
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

    const stored = await getModuleDetail(c.var.ppk.projectDb, params.module_id);
    if (stored.success === false) {
      return c.json(stored);
    }

    const { definition: incomingDef, script: incomingScript, gitRef } =
      await fetchModuleFiles(params.module_id);

    const installedGitRef = (await c.var.ppk.projectDb<{ installed_git_ref: string | null }[]>`
      SELECT installed_git_ref FROM modules WHERE id = ${params.module_id}
    `).at(0)?.installed_git_ref;

    let impactType: ModuleUpdatePreview["impactType"];
    if (gitRef && installedGitRef && gitRef === installedGitRef) {
      impactType = "no_change";
    } else {
      const storedDef = stored.data.moduleDefinition;
      const scriptChanged = incomingScript !== storedDef.script;
      const configReqChanged =
        JSON.stringify(incomingDef.configRequirements) !==
        JSON.stringify(storedDef.configRequirements);
      const resultsObjChanged =
        JSON.stringify(incomingDef.resultsObjects) !==
        JSON.stringify(storedDef.resultsObjects);

      if (scriptChanged || configReqChanged || resultsObjChanged) {
        impactType = "script_change";
      } else {
        impactType = "definition_only";
      }
    }

    let commitsSince: ModuleUpdatePreview["commitsSince"] = [];
    if (impactType !== "no_change") {
      const { owner, repo, path } = registryEntry.github;
      const commitsRes = await fetchCommits(owner, repo, path, "main");
      if (commitsRes.success) {
        if (installedGitRef) {
          const idx = commitsRes.data.findIndex((cm) => cm.sha === installedGitRef);
          commitsSince = idx > 0 ? commitsRes.data.slice(0, idx) : [];
        } else {
          commitsSince = commitsRes.data;
        }
      }
    }

    const preview: ModuleUpdatePreview = {
      impactType,
      commitsSince,
      headGitRef: gitRef ?? "",
    };

    return c.json({ success: true, data: preview });
  },
);
