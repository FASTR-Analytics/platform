import { join } from "@std/path";
import { Hono } from "hono";
import {
  _MODULE_LOG_FILE_NAME,
  _SANDBOX_DIR_PATH,
} from "../../exposed_env_vars.ts";
import {
  getModuleDetail,
  // getModuleParameters,
  getResultsObjectItems,
  installModule,
  uninstallModule,
  updateModuleDefinition,
  updateModuleParameters,
  getAllModulesWithResultsValues,
  getModuleWithConfigSelections,
  getCountryIso3Config,
} from "../../db/mod.ts";
import { _DATASET_LIMIT, throwIfErrWithData } from "lib";
import {
  getGlobalNonAdmin,
  getProjectEditor,
  getProjectViewer,
  requireProjectPermission,
} from "../../project_auth.ts";
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
  getProjectEditor,
  requireProjectPermission(true,"can_configure_modules"),
  log("installModule"),
  async (c, { params }) => {
    const res = await installModule(c.var.ppk.projectDb, params.module_id);
    if (res.success === false) {
      return c.json(res);
    }
    await setModuleDirty(c.var.ppk, params.module_id);
    notifyLastUpdated(
      c.var.ppk.projectId,
      "modules",
      [params.module_id],
      res.data.lastUpdated
    );
    notifyLastUpdated(
      c.var.ppk.projectId,
      "presentation_objects",
      res.data.presObjIdsWithNewLastUpdateds,
      res.data.lastUpdated
    );
    notifyProjectUpdated(c.var.ppk.projectId, res.data.lastUpdated);
    return c.json(res);
  }
);

defineRoute(
  routesModules,
  "uninstallModule",
  getProjectEditor,
  requireProjectPermission(true,"can_configure_modules"),
  log("uninstallModule"),
  async (c, { params }) => {
    const res = await uninstallModule(c.var.ppk.projectDb, params.module_id);
    if (res.success === false) {
      return c.json(res);
    }
    notifyProjectUpdated(c.var.ppk.projectId, new Date().toISOString());
    return c.json(res);
  }
);

defineRoute(
  routesModules,
  "updateModuleDefinition",
  getProjectEditor,
  requireProjectPermission(true,"can_configure_modules"),
  log("updateModuleDefinition"),
  async (c, { params, body }) => {
    const res = await updateModuleDefinition(
      c.var.ppk.projectDb,
      params.module_id,
      body.preserveSettings
    );
    if (res.success === false) {
      return c.json(res);
    }
    if (body.rerunModule) {
      await setModuleDirty(c.var.ppk, params.module_id);
    }
    notifyLastUpdated(
      c.var.ppk.projectId,
      "modules",
      [params.module_id],
      res.data.lastUpdated
    );
    notifyLastUpdated(
      c.var.ppk.projectId,
      "presentation_objects",
      res.data.presObjIdsWithNewLastUpdateds,
      res.data.lastUpdated
    );
    notifyProjectUpdated(c.var.ppk.projectId, res.data.lastUpdated);
    return c.json(res);
  }
);

// routesModules.get(
//   "/module_parameters/:module_id",
//   getProjectViewer,
//   async (c) => {
//     const moduleId = c.req.param("module_id");
//     const res = await getModuleParameters(c.var.ppk.projectDb, moduleId);
//     return c.json(res);
//   }
// );

defineRoute(
  routesModules,
  "updateModuleParameters",
  getProjectEditor,
  requireProjectPermission(true,"can_configure_modules"),
  log("updateModuleParameters"),
  async (c, { params, body }) => {
    const res = await updateModuleParameters(
      c.var.ppk.projectDb,
      params.module_id,
      body.newParams
    );
    if (res.success === false) {
      return c.json(res);
    }
    await setModuleDirty(c.var.ppk, params.module_id);
    notifyLastUpdated(
      c.var.ppk.projectId,
      "modules",
      [params.module_id],
      res.data.lastUpdated
    );
    return c.json(res);
  }
);

///////////////
//           //
//    Run    //
//           //
///////////////

defineRoute(
  routesModules,
  "rerunModule",
  getProjectEditor,
  requireProjectPermission(true,"can_run_modules"),
  log("rerunModule"),
  async (c, { params }) => {
    const res = await getModuleDetail(c.var.ppk.projectDb, params.module_id);
    if (res.success === false) {
      return c.json(res);
    }
    await setModuleDirty(c.var.ppk, params.module_id);
    return c.json({ success: true });
  }
);

///////////////////////////
//                       //
//    Results objects    //
//                       //
///////////////////////////

defineRoute(
  routesModules,
  "getResultsObjectItems",
  getProjectViewer,
  log("getResultsObjectItems"),
  async (c, { params }) => {
    const res = await getResultsObjectItems(
      c.var.ppk.projectDb,
      params.results_object_id,
      _DATASET_LIMIT
    );
    return c.json(res);
  }
);

///////////////////////////
//                       //
//    Module Script      //
//                       //
///////////////////////////

defineRoute(
  routesModules,
  "getScript",
  getGlobalNonAdmin,
  getProjectViewer,
  requireProjectPermission(false,"can_configure_modules"),
  log("getModuleScript"),
  async (c, { params }) => {
    const res = await getModuleDetail(c.var.ppk.projectDb, params.module_id);
    if (res.success === false) {
      return c.json(res);
    }
    const resCountryIso3 = await getCountryIso3Config(c.var.mainDb);
    throwIfErrWithData(resCountryIso3);

    let knownDatasetVariables: Set<string> | undefined;
    if (res.data.moduleDefinition.configRequirements.configType === "hfa") {
      const hfaVarRows = await c.var.ppk.projectDb<{ var_name: string }[]>`
        SELECT DISTINCT var_name FROM indicators_hfa ORDER BY var_name
      `;
      knownDatasetVariables = new Set(
        hfaVarRows.map((r: { var_name: string }) => r.var_name)
      );
    }

    const script = getScriptWithParameters(
      res.data.moduleDefinition,
      res.data.configSelections,
      resCountryIso3.data.countryIso3,
      knownDatasetVariables
    );
    return c.json({ success: true, data: { script } });
  }
);

///////////////////////////
//                       //
//    Module Logs        //
//                       //
///////////////////////////

defineRoute(
  routesModules,
  "getLogs",
  getProjectViewer,
  requireProjectPermission(false,"can_configure_modules"),
  log("getModuleLogs"),
  async (c, { params }) => {
    const logFilePath = join(
      _SANDBOX_DIR_PATH,
      c.var.ppk.projectId,
      params.module_id,
      _MODULE_LOG_FILE_NAME
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
  }
);

///////////////////////////////////
//                               //
//    New Routes for Modules     //
//                               //
///////////////////////////////////

defineRoute(
  routesModules,
  "getAllModulesWithResultsValues",
  getGlobalNonAdmin,
  getProjectViewer,
  log("getAllModulesWithResultsValues"),
  async (c) => {
    const res = await getAllModulesWithResultsValues(c.var.mainDb, c.var.ppk.projectDb);
    return c.json(res);
  }
);

defineRoute(
  routesModules,
  "getModuleWithConfigSelections",
  getProjectViewer,
  log("getModuleWithConfigSelections"),
  async (c, { params }) => {
    const res = await getModuleWithConfigSelections(
      c.var.ppk.projectDb,
      params.module_id
    );
    return c.json(res);
  }
);
