// ============================================================================
// Module Definition — INSTALLED SHAPE (stored in modules.module_definition)
//
// This file contains ONLY the Zod schema for the stored blob.
// Metrics are stored separately in the metrics table, not here.
// ============================================================================

import { z } from "zod";
import { presentationObjectConfigSchema } from "./_presentation_object_config.ts";

// ============================================================================
// Module-specific atoms
// ============================================================================

export const scriptGenerationType = z.enum(["template", "hfa", "calculated_indicators"]);

export const dataSourceDataset = z.object({
  sourceType: z.literal("dataset"),
  replacementString: z.string(),
  datasetType: z.enum(["hmis", "hfa", "iceh"]),
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

// Two kinds of asset (PLAN_RESULTS_RUNS item 2 ruling, 2026-07-13): a plain
// string names an instance-uploaded asset (resolved from the instance Assets
// dir); an object pins a modules-repo data file by repo path + full commit
// SHA, fetched by the server, verified against sha256, and cached
// content-addressed (repo_assets/{sha256}).
export const repoAssetToImport = z.object({
  name: z.string(),
  repoPath: z.string(),
  commit: z.string(),
  sha256: z.string(),
});

export const assetToImport = z.union([z.string(), repoAssetToImport]);

export function getAssetToImportName(asset: AssetToImport): string {
  return typeof asset === "string" ? asset : asset.name;
}

// ============================================================================
// Component schemas
// ============================================================================

export const resultsObjectDefinitionInstalledStrict = z.object({
  id: z.string(),
  moduleId: z.string(),
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
  config: presentationObjectConfigSchema,
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
  assetsToImport: z.array(assetToImport),
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
export type RepoAssetToImport = z.infer<typeof repoAssetToImport>;
export type AssetToImport = z.infer<typeof assetToImport>;
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
