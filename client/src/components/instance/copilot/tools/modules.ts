import { AIToolFailure, createAITool } from "panther";
import {
  copilotToolContract,
  formatTextWindowForAI,
  type InstalledModuleSummary,
  type MetricWithStatus,
  t3,
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
      ...copilotToolContract("get_available_modules"),
      handler: async () => {
        return formatModulesListForAI(modules, metrics);
      },
      inProgressLabel: t3({
        en: "Getting the available modules...",
        fr: "Récupération des modules disponibles...",
        pt: "A obter os módulos disponíveis...",
      }),
      successMessage: t3({
        en: "Retrieved the available modules",
        fr: "Modules disponibles récupérés",
        pt: "Módulos disponíveis obtidos",
      }),
    }),
  ];
}

export function getClientToolsForModuleInternals(env: ModuleInternalsEnv) {
  return [
    createAITool({
      ...copilotToolContract("get_module_r_script"),
      handler: async (input) => {
        const res = await env.getModuleScript(input.id);
        if (!res.success) throw new AIToolFailure(res.err);
        return formatTextWindowForAI(res.data.script, "start", input);
      },
      inProgressLabel: t3({
        en: "Getting a module's R script...",
        fr: "Récupération du script R d'un module...",
        pt: "A obter o script R de um módulo...",
      }),
      successMessage: (input) =>
        t3({
          en: `Retrieved the R script of module ${input.id}`,
          fr: `Script R du module ${input.id} récupéré`,
          pt: `Script R do módulo ${input.id} obtido`,
        }),
    }),

    createAITool({
      ...copilotToolContract("get_module_log"),
      handler: async (input) => {
        const res = await env.getModuleLogs(input.id);
        if (!res.success) throw new AIToolFailure(res.err);
        return formatTextWindowForAI(res.data.logs, "end", input);
      },
      inProgressLabel: t3({
        en: "Getting a module's log...",
        fr: "Récupération du journal d'un module...",
        pt: "A obter o registo de um módulo...",
      }),
      successMessage: (input) =>
        t3({
          en: `Retrieved the log of module ${input.id}`,
          fr: `Journal du module ${input.id} récupéré`,
          pt: `Registo do módulo ${input.id} obtido`,
        }),
    }),

    createAITool({
      ...copilotToolContract("get_module_settings"),
      handler: async (input) => {
        const res = await env.getModuleSettings(input.id);
        if (!res.success) throw new AIToolFailure(res.err);
        return formatModuleSettingsForAI(res.data);
      },
      inProgressLabel: t3({
        en: "Getting a module's settings...",
        fr: "Récupération des paramètres d'un module...",
        pt: "A obter as definições de um módulo...",
      }),
      successMessage: (input) =>
        t3({
          en: `Retrieved the settings of module ${input.id}`,
          fr: `Paramètres du module ${input.id} récupérés`,
          pt: `Definições do módulo ${input.id} obtidas`,
        }),
    }),
  ];
}
