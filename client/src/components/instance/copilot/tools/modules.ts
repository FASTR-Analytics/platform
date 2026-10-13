import { AIToolFailure, createAITool } from "panther";
import { z } from "zod";
import {
  COPILOT_TOOL_VIEWS,
  type InstalledModuleSummary,
  type MetricWithStatus,
} from "lib";
import type { ModuleInternalsEnv } from "../mod.ts";
import { formatModulesListForAI } from "./format_modules_list_for_ai.ts";
import { formatModuleSettingsForAI } from "./format_module_settings_for_ai.ts";

// How a package was produced (SPA-only: the /mcp surface is for seeing
// results, not module internals). Which package is never a model-facing
// input: each tool is a template the chat binds per call to the inner set of
// the view's package (bind_package_tools.ts). The module list is built over
// the pair's authoring context with the package reads; the script, log and
// settings reads bind by run id alone (what a package contains is a
// function of the runId alone), so they answer for a package that is still
// generating or has failed. The gates are the
// catalogue's, declared in the plain shape: the chat checks the ids against
// its registry when the tool registers.

export function getClientToolsForModules(
  modules: InstalledModuleSummary[],
  metrics: MetricWithStatus[],
) {
  return [
    createAITool({
      name: "get_available_modules",
      description: "Get a list of the analysis modules in the results package",
      inputSchema: z.object({}),
      availableIn: COPILOT_TOOL_VIEWS.get_available_modules,
      handler: async () => {
        return formatModulesListForAI(modules, metrics);
      },
      inProgressLabel: "Getting available modules...",
      kind: "read",
    }),
  ];
}

export function getClientToolsForModuleInternals(env: ModuleInternalsEnv) {
  return [
    createAITool({
      name: "get_module_r_script",
      description: "Get the R script for a specific module",
      inputSchema: z.object({ id: z.string().describe("Module ID") }),
      availableIn: COPILOT_TOOL_VIEWS.get_module_r_script,
      handler: async (input) => {
        const res = await env.getModuleScript(input.id);
        if (!res.success) throw new AIToolFailure(res.err);
        return res.data.script;
      },
      inProgressLabel: "Getting module script...",
      kind: "read",
    }),

    createAITool({
      name: "get_module_log",
      description:
        "Get the log file for a module that has recently run. This is useful for debugging errors or explaining why a module hasn't run.",
      inputSchema: z.object({ id: z.string().describe("Module ID") }),
      availableIn: COPILOT_TOOL_VIEWS.get_module_log,
      handler: async (input) => {
        const res = await env.getModuleLogs(input.id);
        if (!res.success) throw new AIToolFailure(res.err);
        return res.data.logs;
      },
      inProgressLabel: "Getting module log...",
      kind: "read",
    }),

    createAITool({
      name: "get_module_settings",
      description:
        "Get the configuration settings and parameters for a specific module. This shows what options are selected for the module.",
      inputSchema: z.object({ id: z.string().describe("Module ID") }),
      availableIn: COPILOT_TOOL_VIEWS.get_module_settings,
      handler: async (input) => {
        const res = await env.getModuleSettings(input.id);
        if (!res.success) throw new AIToolFailure(res.err);
        return formatModuleSettingsForAI(res.data);
      },
      inProgressLabel: "Getting module settings...",
      kind: "read",
    }),
  ];
}
