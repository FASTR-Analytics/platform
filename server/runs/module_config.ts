import {
  ModuleDefinitionDetail,
  parseJsonOrThrow,
  moduleDefinitionInstalledSchema,
  type ModuleConfigSelections,
} from "lib";

export function parseModuleConfigSelections(json: string): ModuleConfigSelections {
  const raw = parseJsonOrThrow<Record<string, unknown>>(json);
  return {
    parameterDefinitions: (raw.parameterDefinitions ?? []) as ModuleConfigSelections["parameterDefinitions"],
    parameterSelections: (raw.parameterSelections ?? {}) as ModuleConfigSelections["parameterSelections"],
  };
}

// The installed (monolingual) definition blob: metrics live in their own
// manifest array, never inside the blob.
export function prepareModuleDefinitionForStorage(
  mod: ModuleDefinitionDetail,
): string {
  const { metrics: _, ...rest } = mod;
  return JSON.stringify(moduleDefinitionInstalledSchema.parse(rest));
}
