import { AIToolFailure, createAITool } from "@timroberton/panther";
import { z } from "zod";
import type { InstalledModuleSummary, MetricWithStatus } from "../types/mod.ts";
import { formatModulesListForAI } from "./format_modules_list_for_ai.ts";
import { formatModuleSettingsForAI } from "./format_module_settings_for_ai.ts";
import type { AIToolEnv } from "./env.ts";

// Tools over ONE results package. Which package is never a model-facing
// input — inside a project there is exactly one correct answer (whatever is
// attached), so asking the model to name a run would invite it to get right
// what it cannot get wrong. The host binds the package instead, and binds it
// as a RESOLVER, not a value: a mid-conversation repoint must move these
// tools to the new package, which a value captured at construction would
// not do.
//
// The resolver is also what makes these reusable beyond a project: an
// instance-level copilot over the results-package catalogue passes its
// selected run and gets the same tools, no duplication.
type AttachedRunResolver = () => string | null;

function requireRunId(resolveRunId: AttachedRunResolver): string {
  const runId = resolveRunId();
  if (runId === null) {
    // AIToolFailure, not Error: an unattached project is an anticipated
    // state the model should be told about, not a crash.
    throw new AIToolFailure(
      "No results package is attached to this project yet.",
    );
  }
  return runId;
}

export function getSharedToolsForModules(
  env: AIToolEnv,
  projectId: string,
  resolveRunId: AttachedRunResolver,
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
      kind: "read",
      headless: true,
    }),

    createAITool({
      name: "get_module_r_script",
      description: "Get the R script for a specific module",
      inputSchema: z.object({ id: z.string().describe("Module ID") }),
      handler: async (input) => {
        const res = await env.serverActions.getRunModuleScript({
          run_id: requireRunId(resolveRunId),
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
          run_id: requireRunId(resolveRunId),
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
