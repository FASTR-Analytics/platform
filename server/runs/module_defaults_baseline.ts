import type { Sql } from "postgres";
import {
  type APIResponseWithData,
  getMergedModuleConfigSelections,
  MODULE_DEFAULTS_BASELINE_URL,
  type ModuleDefaultsBaselineEntry,
  moduleDefaultsBaselineFileSchema,
  type ModuleDefaultsSnapshotResponse,
} from "lib";
import { getRunGenerationDefaultsConfig } from "../db/instance/config.ts";
import { _INSTANCE_ID, _SERVER_VERSION } from "../exposed_env_vars.ts";
import { getRunGenerationModuleOptions } from "./generation_wizard_reads.ts";

// The country baseline for the module-defaults editor (S8 "Instance module
// defaults"). Contract on ModuleDefaultsBaselineEntry in lib.

// The status-site scrape: the raw store plus every offerable param resolved
// the way the editor resolves it (stored value, else definition default),
// and the definitions resolved against.
export async function getModuleDefaultsSnapshot(
  mainDb: Sql,
): Promise<APIResponseWithData<ModuleDefaultsSnapshotResponse>> {
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

// This instance's entry in the resource-hub baseline file. A missing file,
// an unparseable one, or no entry for this instance all read as "no
// baseline": the editor then just hides its baseline controls. Wrapped in
// an object because the editor's state holder blanks on falsy ready-data.
export async function getModuleDefaultsBaseline(): Promise<
  APIResponseWithData<{ baseline: ModuleDefaultsBaselineEntry | null }>
> {
  try {
    const res = await fetch(`${MODULE_DEFAULTS_BASELINE_URL}?t=${Date.now()}`, {
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) {
      return { success: true, data: { baseline: null } };
    }
    const parsed = moduleDefaultsBaselineFileSchema.safeParse(
      await res.json(),
    );
    if (!parsed.success) {
      console.error(
        `[module_defaults_baseline] baseline file does not parse: ${parsed.error.message}`,
      );
      return { success: true, data: { baseline: null } };
    }
    return {
      success: true,
      data: { baseline: parsed.data.countries[_INSTANCE_ID] ?? null },
    };
  } catch (e) {
    console.error(
      `[module_defaults_baseline] could not fetch the baseline file: ${
        e instanceof Error ? e.message : String(e)
      }`,
    );
    return { success: true, data: { baseline: null } };
  }
}
