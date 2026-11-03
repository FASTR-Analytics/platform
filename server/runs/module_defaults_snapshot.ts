import type { Sql } from "postgres";
import {
  type APIResponseWithData,
  getMergedModuleConfigSelections,
  type ModuleDefaultsSnapshot,
} from "lib";
import { getRunGenerationDefaultsConfig } from "../db/instance/config.ts";
import { _INSTANCE_ID, _SERVER_VERSION } from "../exposed_env_vars.ts";
import { getRunGenerationModuleOptions } from "./generation_wizard_reads.ts";

// The status site's module-defaults scrape (S8 "Instance module defaults"):
// the raw store plus every offerable param resolved the way the editor
// resolves it (stored value, else definition default), and the definitions
// resolved against. Contract on ModuleDefaultsSnapshot in lib.
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
