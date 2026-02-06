import { serverActions } from "~/server_actions";
import { createAITool } from "panther";
import { z } from "zod";
import type { InstalledModuleSummary, MetricWithStatus } from "lib";
import { formatModulesListForAI } from "./_internal/format_modules_list_for_ai";

export function getToolsForModules(
  projectId: string,
  modules: InstalledModuleSummary[],
  metrics: MetricWithStatus[],
) {
  return [
    createAITool({
      name: "get_available_modules",
      description: "Get a list of analysis modules and their status",
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
          module_id: input.id as any,
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
          module_id: input.id as any,
        });
        if (!res.success) throw new Error(res.err);
        return res.data.logs;
      },
      inProgressLabel: "Getting module log...",
    }),
  ];
}
