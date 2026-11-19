import { AIToolFailure, createAITool } from "panther";
import { z } from "zod";
import {
  AI_TEXT_LINE_MAX_CHARS,
  AI_TEXT_WINDOW_MAX_CHARS,
  COPILOT_TOOL_VIEWS,
  formatTextWindowForAI,
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
      completionMessage: "Retrieved the available modules",
      kind: "read",
    }),
  ];
}

const ModuleFileQuerySchema = z.object({
  id: z.string().describe("Module ID"),
  fromLine: z
    .number()
    .int()
    .min(1)
    .optional()
    .describe(
      "Optional: the first line to write. Each result names the fromLine of its next window.",
    ),
  search: z
    .array(z.string())
    .min(1)
    .optional()
    .describe(
      "Optional: terms to find lines by. A line matches when it holds every word of one term, case and accents ignored. The matching lines are written with their numbers, from fromLine when given.",
    ),
});

const WINDOW =
  `One window a call: whole lines, at most ${AI_TEXT_WINDOW_MAX_CHARS} characters, a line over ${AI_TEXT_LINE_MAX_CHARS} cut with its length stated. Each result opens with the file's line and character counts and the lines it writes.`;

export function getClientToolsForModuleInternals(env: ModuleInternalsEnv) {
  return [
    createAITool({
      name: "get_module_r_script",
      description:
        `Get the R script for a specific module. ${WINDOW} With neither fromLine nor search, the window starts at the first line, and the result names the fromLine that reads on. search finds the lines that hold a term.`,
      inputSchema: ModuleFileQuerySchema,
      availableIn: COPILOT_TOOL_VIEWS.get_module_r_script,
      handler: async (input) => {
        const res = await env.getModuleScript(input.id);
        if (!res.success) throw new AIToolFailure(res.err);
        return formatTextWindowForAI(res.data.script, "start", input);
      },
      inProgressLabel: "Getting module script...",
      completionMessage: (input) =>
        `Retrieved the R script of module ${input.id}`,
      kind: "read",
    }),

    createAITool({
      name: "get_module_log",
      description:
        `Get the log file for a module that has recently run. This is useful for debugging errors or explaining why a module hasn't run. ${WINDOW} With neither fromLine nor search, the window ends at the last line, where an error is written; fromLine reads from an earlier line on. search finds the lines that hold a term, such as "error" or "warning".`,
      inputSchema: ModuleFileQuerySchema,
      availableIn: COPILOT_TOOL_VIEWS.get_module_log,
      handler: async (input) => {
        const res = await env.getModuleLogs(input.id);
        if (!res.success) throw new AIToolFailure(res.err);
        return formatTextWindowForAI(res.data.logs, "end", input);
      },
      inProgressLabel: "Getting module log...",
      completionMessage: (input) => `Retrieved the log of module ${input.id}`,
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
      completionMessage: (input) =>
        `Retrieved the settings of module ${input.id}`,
      kind: "read",
    }),
  ];
}
