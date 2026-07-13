import { serverActions } from "~/server_actions";
import { createAITool } from "panther";
import { z } from "zod";
import type { InstalledModuleSummary, MetricWithStatus } from "lib";
import { projectState } from "~/state/project/t1_store";
import { formatModulesListForAI } from "./_internal/format_modules_list_for_ai";
import { formatModuleSettingsForAI } from "./_internal/format_module_settings_for_ai";

// Script/logs read from the attached results package's run dir — resolved at
// call time so a mid-conversation repoint reads the new package.
function requireAttachedRunId(): string {
  const runId = projectState.attachedRunId;
  if (runId === null) {
    throw new Error("No results package is attached to this project yet.");
  }
  return runId;
}

export function getToolsForModules(
  projectId: string,
  modules: InstalledModuleSummary[],
  metrics: MetricWithStatus[],
) {
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
    }),

    createAITool({
      name: "get_module_r_script",
      description: "Get the R script for a specific module",
      inputSchema: z.object({ id: z.string().describe("Module ID") }),
      handler: async (input) => {
        const res = await serverActions.getScript({
          projectId,
          run_id: requireAttachedRunId(),
          module_id: input.id,
        });
        if (!res.success) throw new Error(res.err);
        return res.data.script;
      },
      inProgressLabel: "Getting module script...",
    }),

    createAITool({
      name: "get_module_log",
      description:
        "Get the log file for a module that has recently run. This is useful for debugging errors or explaining why a module hasn't run.",
      inputSchema: z.object({ id: z.string().describe("Module ID") }),
      handler: async (input) => {
        const res = await serverActions.getLogs({
          projectId,
          run_id: requireAttachedRunId(),
          module_id: input.id,
        });
        if (!res.success) throw new Error(res.err);
        return res.data.logs;
      },
      inProgressLabel: "Getting module log...",
    }),

    createAITool({
      name: "get_module_settings",
      description:
        "Get the configuration settings and parameters for a specific module. This shows what options are selected for the module.",
      inputSchema: z.object({ id: z.string().describe("Module ID") }),
      handler: async (input) => {
        const res = await serverActions.getModuleWithConfigSelections({
          projectId,
          module_id: input.id,
        });
        if (!res.success) throw new Error(res.err);
        return formatModuleSettingsForAI(res.data);
      },
      inProgressLabel: "Getting module settings...",
    }),
  ];
}
