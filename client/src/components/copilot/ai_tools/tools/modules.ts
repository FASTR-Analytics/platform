import { AIToolFailure, createAITool } from "panther";
import { z } from "zod";
import type { InstalledModuleSummary, MetricWithStatus } from "lib";
import { copilotAIToolEnv } from "../client_env";
import { formatModulesListForAI } from "./_internal/format_modules_list_for_ai";
import { formatModuleSettingsForAI } from "./_internal/format_module_settings_for_ai";

// How the copilot's current package was produced (SPA-only — the /mcp surface
// is for seeing results, not module internals). Which package is never a
// model-facing input: the env resolves the open product's run at call time, so
// opening a product on another package moves these tools with it. The
// script/log/settings reads are the run-keyed package reads
// (`getRunModuleScript`/`getRunModuleLogs`/`getRunModuleWithConfigSelections`,
// instance data bits — Tim's ruling 2026-08-18: what a package contains is a
// function of the runId alone).
export function getClientToolsForModules(
  modules: InstalledModuleSummary[],
  metrics: MetricWithStatus[],
) {
  const env = copilotAIToolEnv;
  return [
    createAITool({
      name: "get_available_modules",
      description:
        "Get a list of the analysis modules in the results package",
      inputSchema: z.object({}),
      handler: async () => {
        return formatModulesListForAI(modules, metrics);
      },
      inProgressLabel: "Getting available modules...",
      kind: "read",
    }),

    createAITool({
      name: "get_module_r_script",
      description: "Get the R script for a specific module",
      inputSchema: z.object({ id: z.string().describe("Module ID") }),
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
