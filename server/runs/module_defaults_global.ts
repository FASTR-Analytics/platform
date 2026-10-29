import type { Sql } from "postgres";
import {
  type APIResponseWithData,
  getMergedModuleConfigSelections,
  MODULE_DEFAULTS_GLOBAL_URL,
  type ModuleDefaultsGlobalFile,
  moduleDefaultsGlobalFileSchema,
  type ModuleDefaultsSnapshot,
} from "lib";
import { getRunGenerationDefaultsConfig } from "../db/instance/config.ts";
import { _INSTANCE_ID, _SERVER_VERSION } from "../exposed_env_vars.ts";
import { getRunGenerationModuleOptions } from "./generation_wizard_reads.ts";

// The fleet's global module defaults for the module-defaults editor (S8
// "Instance module defaults"). Contract on ModuleDefaultsGlobalFile in lib.

// The status-site scrape: the raw store plus every offerable param resolved
// the way the editor resolves it (stored value, else definition default),
// and the definitions resolved against.
export async function getModuleDefaultsSnapshot(
  mainDb: Sql,
): Promise<APIResponseWithData<ModuleDefaultsSnapshot>> {
  const [optionsRes, defaultsRes] = await Promise.all([
    getRunGenerationModuleOptions(mainDb),
    getRunGenerationDefaultsConfig(mainDb),
  ]);
  if (optionsRes.success === false) {
    return optionsRes;
  }
  if (defaultsRes.success === false) {
    return defaultsRes;
  }
  const stored = defaultsRes.data;
  return {
    success: true,
    data: {
      instanceId: _INSTANCE_ID,
      platformVersion: _SERVER_VERSION,
      modulesGitRef: optionsRes.data.gitRef,
      stored,
      effective: Object.fromEntries(
        optionsRes.data.modules.map((o) => [
          o.id,
          getMergedModuleConfigSelections(
            {
              parameterDefinitions: [],
              parameterSelections: stored.parameterSelections[o.id] ?? {},
            },
            { parameters: o.parameters },
          ).parameterSelections,
        ]),
      ),
      modules: optionsRes.data.modules.map((o) => ({
        id: o.id,
        label: o.label,
        parameters: o.parameters.map((param) => ({
          replacementString: param.replacementString,
          description: param.description,
          defaultValue: param.input.defaultValue,
        })),
      })),
    },
  };
}

// The published global defaults file. A missing file or an unparseable one
// reads as "no global defaults": the editor then just hides its global
// controls. Wrapped in an object because the editor's state holder blanks on
// falsy ready-data.
export async function getModuleDefaultsGlobal(): Promise<
  APIResponseWithData<{ global: ModuleDefaultsGlobalFile | null }>
> {
  try {
    const res = await fetch(`${MODULE_DEFAULTS_GLOBAL_URL}?t=${Date.now()}`, {
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) {
      return { success: true, data: { global: null } };
    }
    const parsed = moduleDefaultsGlobalFileSchema.safeParse(await res.json());
    if (!parsed.success) {
      console.error(
        `[module_defaults_global] global defaults file does not parse: ${parsed.error.message}`,
      );
      return { success: true, data: { global: null } };
    }
    return { success: true, data: { global: parsed.data } };
  } catch (e) {
    console.error(
      `[module_defaults_global] could not fetch the global defaults file: ${
        e instanceof Error ? e.message : String(e)
      }`,
    );
    return { success: true, data: { global: null } };
  }
}
