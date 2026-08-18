import { AIToolFailure, createAITool } from "@timroberton/panther";
import { z } from "zod";
import type { InstalledModuleSummary, MetricWithStatus } from "../types/mod.ts";
import { formatModulesListForAI } from "./format_modules_list_for_ai.ts";
import { formatModuleSettingsForAI } from "./format_module_settings_for_ai.ts";
import type { AIToolEnv } from "./env.ts";

// Tools over ONE results package. Which package is never a model-facing
// input — inside a project there is exactly one correct answer (whatever is
// attached), so asking the model to name a run would invite it to get right
// what it cannot get wrong. The script/log reads are the run-keyed package
// reads (`getRunModuleScript`/`getRunModuleLogs`, instance data bits — Tim's
// ruling 2026-08-18: what a package contains is a function of the runId
// alone); the runId is RESOLVED AT CALL TIME through `getAttachedRunId`, so a
// mid-conversation repoint moves these tools to the new package (the SPA
// snapshots project T1; the MCP host reads its cached context — a bounded
// 30 s window, the same one `pinnedRunId` has there).
export function getSharedToolsForModules(
  env: AIToolEnv,
  projectId: string,
  getAttachedRunId: () => string | null,
  modules: InstalledModuleSummary[],
  metrics: MetricWithStatus[],
) {
  function requireRunId(): string {
    const runId = getAttachedRunId();
    if (runId === null) {
      throw new AIToolFailure(
        "This project has no results package attached.",
      );
    }
    return runId;
  }
  return [
    createAITool({
      name: "get_available_modules",
      description:
        "Get a list of the analysis modules in the project's attached results package",
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
        const res = await env.serverActions.getRunModuleScript({
          run_id: requireRunId(),
          module_id: input.id,
        });
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
        const res = await env.serverActions.getRunModuleLogs({
          run_id: requireRunId(),
          module_id: input.id,
        });
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
        const res = await env.serverActions.getModuleWithConfigSelections({
          projectId,
          module_id: input.id,
        });
        if (!res.success) throw new AIToolFailure(res.err);
        return formatModuleSettingsForAI(res.data);
      },
      inProgressLabel: "Getting module settings...",
      kind: "read",
      headless: true,
    }),
  ];
}
