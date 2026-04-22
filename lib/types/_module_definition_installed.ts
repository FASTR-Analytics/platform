// ============================================================================
// Module Definition — INSTALLED SHAPE (stored in modules.module_definition)
//
// This file contains ONLY the Zod schema for the stored blob.
// Metrics are stored separately in the metrics table, not here.
// ============================================================================

import { z } from "zod";

// ============================================================================
// Module-specific atoms
// ============================================================================

export const scriptGenerationType = z.enum(["template", "hfa"]);

export const dataSourceDataset = z.object({
  sourceType: z.literal("dataset"),
  replacementString: z.string(),
  datasetType: z.enum(["hmis", "hfa"]),
});

export const dataSourceResultsObject = z.object({
  sourceType: z.literal("results_object"),
  replacementString: z.string(),
  resultsObjectId: z.string(),
  moduleId: z.string(),
});

export const dataSource = z.discriminatedUnion("sourceType", [
  dataSourceDataset,
  dataSourceResultsObject,
]);

export const moduleParameterInput = z.discriminatedUnion("inputType", [
  z.object({ inputType: z.literal("number"), defaultValue: z.string() }),
  z.object({ inputType: z.literal("text"), defaultValue: z.string() }),
  z.object({
    inputType: z.literal("boolean"),
    defaultValue: z.enum(["TRUE", "FALSE"]),
  }),
  z.object({
    inputType: z.literal("select"),
    valueType: z.enum(["string", "number"]),
    options: z.array(z.object({ value: z.string(), label: z.string() })),
    defaultValue: z.string(),
  }),
]);

export const moduleParameter = z.object({
  replacementString: z.string(),
  description: z.string(),
  input: moduleParameterInput,
});

export const configRequirements = z.object({
  parameters: z.array(moduleParameter),
});

// ============================================================================
// Component schemas
// ============================================================================

export const resultsObjectDefinitionInstalledStrict = z.object({
  id: z.string(),
  moduleId: z.string(),
  description: z.string(),
  createTableStatementPossibleColumns: z.union([
    z.literal(false),
    z.record(z.string(), z.string()).refine(
      (obj) => Object.keys(obj).length > 0,
      { message: "Must have at least one column" },
    ),
  ]),
});

export const defaultPresentationObjectInstalledStrict = z.object({
  id: z.string(),
  label: z.string(),
  moduleId: z.string(),
  metricId: z.string(),
  sortOrder: z.number(),
  config: z.unknown(),
});

// ============================================================================
// Main schema
// ============================================================================

export const moduleDefinitionInstalledStrict = z.object({
  id: z.string(),
  label: z.string(),
  prerequisites: z.array(z.string()),
  lastScriptUpdate: z.string(),
  commitSha: z.string().optional(),
  dataSources: z.array(dataSource),
  scriptGenerationType: scriptGenerationType,
  configRequirements: configRequirements,
  script: z.string(),
  assetsToImport: z.array(z.string()),
  resultsObjects: z.array(resultsObjectDefinitionInstalledStrict),
  defaultPresentationObjects: z.array(defaultPresentationObjectInstalledStrict),
});

export const moduleDefinitionInstalledSchema = moduleDefinitionInstalledStrict;

// ============================================================================
// Types (z.infer)
// ============================================================================

export type ScriptGenerationType = z.infer<typeof scriptGenerationType>;
export type DataSource = z.infer<typeof dataSource>;
export type DataSourceDataset = z.infer<typeof dataSourceDataset>;
export type DataSourceResultsObject = z.infer<typeof dataSourceResultsObject>;
export type ModuleParameter = z.infer<typeof moduleParameter>;
export type ModuleConfigRequirements = z.infer<typeof configRequirements>;
export type ResultsObjectDefinition = z.infer<typeof resultsObjectDefinitionInstalledStrict>;
export type DefaultPresentationObject = z.infer<typeof defaultPresentationObjectInstalledStrict>;
export type ModuleDefinitionInstalled = z.infer<typeof moduleDefinitionInstalledStrict>;

// ============================================================================
// Parse helper
// ============================================================================

export function parseInstalledModuleDefinition(raw: string): ModuleDefinitionInstalled {
  return moduleDefinitionInstalledSchema.parse(JSON.parse(raw));
}
