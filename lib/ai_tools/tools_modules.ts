import { AIToolFailure, createAITool } from "@timroberton/panther";
import { z } from "zod";
import type { InstalledModuleSummary, MetricWithStatus } from "../types/mod.ts";
import { formatModulesListForAI } from "./format_modules_list_for_ai.ts";
import { formatModuleSettingsForAI } from "./format_module_settings_for_ai.ts";
import type { AIToolEnv } from "./env.ts";

// Tools over ONE results package. Which package is never a model-facing
// input — on every surface there is exactly one correct answer (the SPA:
// whatever the project has attached; /mcp: the instance's pinned package),
// so asking the model to name a run would invite it to get right what it
// cannot get wrong. The env is bound to that package (env.ts); the
// script/log/settings reads are the run-keyed package reads behind it
// (`getRunModuleScript`/`getRunModuleLogs`/`getRunModuleWithConfigSelections`,
// instance data bits — Tim's ruling 2026-08-18: what a package contains is a
// function of the runId alone).
export function getSharedToolsForModules(
  env: AIToolEnv,
  modules: InstalledModuleSummary[],
  metrics: MetricWithStatus[],
) {
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
      headless: true,
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
      headless: true,
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
      headless: true,
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
      headless: true,
    }),
  ];
}
