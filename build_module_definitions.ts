import { walk } from "@std/fs/walk";
import { join } from "@std/path";
import type {
  ModuleDefinitionJSON,
  ModuleId,
  ScriptSource,
  PartialDefaultPresentationObjectJSON,
} from "./lib/types/module_definitions.ts";
import { DEFAULT_S_CONFIG, DEFAULT_T_CONFIG } from "./lib/types/presentation_object_defaults.ts";

function stripFrontmatter(script: string): string {
  const lines = script.split("\n");
  const markerIndex = lines.findIndex((line) => line.trimStart().startsWith("#---"));

  if (markerIndex === -1) {
    return script;
  }

  return lines.slice(markerIndex).join("\n");
}

async function fetchGitHubScript(
  source: Extract<ScriptSource, { type: "github" }>
): Promise<{ script: string, sha: string }> {
  const url = `https://raw.githubusercontent.com/${source.owner}/${source.repo}/${source.commit}/${source.path}`;

  console.log(`  Fetching from GitHub: ${url}`);

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(
      `Failed to fetch from GitHub: ${response.status} ${response.statusText}`
    );
  }

  const rawScript = await response.text();
  // get the commit sha
  const shaUrl = `https://api.github.com/repos/${source.owner}/${source.repo}/commits/${source.commit}`;
  const shaResponse = await fetch(shaUrl);

  if (!shaResponse.ok) {
    throw new Error(`Failed to fetch commit SHA: ${shaResponse.status} ${shaResponse.statusText}`);
  }

  const commitInfo = await shaResponse.json();
  const sha = commitInfo.sha;

  let script = stripFrontmatter(rawScript);

  if (source.replacements) {
    for (const { from, to } of source.replacements) {
      script = script.replaceAll(from, to);
    }
  }

  return { script, sha };
}

type ModuleManifest = {
  modules: Record<
    ModuleId,
    {
      label: string;
      versions: string[];
      latest: string;
      prerequisites?: ModuleId[];
    }
  >;
  lastBuild: string;
};

async function scanModuleDefinitions(): Promise<
  Map<
    ModuleId,
    Map<string, { definition: ModuleDefinitionJSON; script: string }>
  >
> {
  const modules = new Map<
    ModuleId,
    Map<string, { definition: ModuleDefinitionJSON; script: string }>
  >();
  const sourceDir = "./module_defs";

  for await (const entry of walk(sourceDir, {
    maxDepth: 3,
    includeDirs: true,
    includeFiles: false,
  })) {
    if (!entry.isDirectory) continue;

    const pathParts = entry.path.split("/");
    // Path should be: module_defs/m001/1.0.0 or module_defs/hfa001/1.0.0
    if (pathParts.length >= 3) {
      const moduleId = pathParts[pathParts.length - 2] as ModuleId;
      const version = pathParts[pathParts.length - 1];

      // Skip the module directory itself, only process version directories
      if (!version.match(/^\d+\.\d+\.\d+$/)) continue;

      const definitionPath = `./${entry.path}/definition.ts`;

      try {
        const { definition } = (await import(definitionPath)) as {
          definition: ModuleDefinitionJSON;
        };

        // Load script based on source type
        let script: string;
        let sha: string | undefined;
        if (definition.scriptSource.type === "local") {
          const scriptSourcePath = join(
            entry.path,
            definition.scriptSource.filename
          );
          script = await Deno.readTextFile(scriptSourcePath);
        } else if (definition.scriptSource.type === "github") {
          const githubResponse = await fetchGitHubScript(definition.scriptSource);
          script = githubResponse.script;
          sha = githubResponse.sha;
          console.log(`  Fetched script for ${moduleId} v${version} (SHA: ${sha})`);
        } else {
          console.error(
            `✗ Skipping ${moduleId} v${version}: Unknown script source type`
          );
          continue;
        }

        // Generate new script filename for dist
        const distScriptFilename = `${moduleId}-${version}.R`;

        // Inject id from folder structure and update scriptSource and lastScriptUpdate
        const jsonDefinition = {
          ...definition,
          commitSha: sha,
          id: moduleId,
          lastScriptUpdate: new Date().toISOString(),
          scriptSource: {
            type: "local",
            filename: distScriptFilename,
          } as const,
        };

        if (!modules.has(moduleId)) {
          modules.set(moduleId, new Map());
        }
        modules.get(moduleId)!.set(version, {
          definition: jsonDefinition,
          script,
        });

        console.log(`✓ Built ${moduleId} v${version}`);
      } catch (error) {
        console.error(`✗ Failed to build ${moduleId} v${version}:`, error);
      }
    }
  }

  return modules;
}

function generateManifest(
  modules: Map<
    ModuleId,
    Map<string, { definition: ModuleDefinitionJSON; script: string }>
  >
): ModuleManifest {
  const manifest: ModuleManifest = {
    modules: {} as ModuleManifest["modules"],
    lastBuild: new Date().toISOString(),
  };

  for (const [moduleId, versions] of modules.entries()) {
    const versionList = Array.from(versions.keys()).sort();
    const latestVersion = versionList[versionList.length - 1];
    const latestEntry = versions.get(latestVersion)!;

    manifest.modules[moduleId] = {
      label: latestEntry.definition.label,
      versions: versionList,
      latest: latestVersion,
    };
  }

  return manifest;
}

function generateModuleMetadata(
  modules: Map<
    ModuleId,
    Map<string, { definition: ModuleDefinitionJSON; script: string }>
  >
): string {
  // Collect module metadata from latest versions
  const moduleMetadata: Array<{
    id: ModuleId;
    label: string;
    prerequisites: ModuleId[];
  }> = [];

  // Collect mappings
  const metricToModule: Record<string, ModuleId> = {};
  const resultsObjectToModule: Record<string, ModuleId> = {};
  const metricStaticData: Record<string, {
    label: string;
    variantLabel?: string;
    resultsObjectId: string;
    valueProps: string[];
    valueFunc: string;
    formatAs: string;
    valueLabelReplacements?: Record<string, string>;
    requiredDisaggregationOptions: string[];
    postAggregationExpression?: any;
  }> = {};

  for (const [moduleId, versions] of modules.entries()) {
    const versionList = Array.from(versions.keys()).sort();
    const latestVersion = versionList[versionList.length - 1];
    const latestEntry = versions.get(latestVersion)!;
    const latestDef = latestEntry.definition;

    moduleMetadata.push({
      id: moduleId,
      label: latestDef.label,
      prerequisites: latestDef.prerequisites,
    });

    // Add metrics for this module
    for (const metric of latestDef.metrics) {
      metricToModule[metric.id] = moduleId;
      metricStaticData[metric.id] = {
        label: metric.label,
        variantLabel: metric.variantLabel,
        resultsObjectId: metric.resultsObjectId,
        valueProps: metric.valueProps,
        valueFunc: metric.valueFunc,
        formatAs: metric.formatAs,
        valueLabelReplacements: metric.valueLabelReplacements,
        requiredDisaggregationOptions: metric.requiredDisaggregationOptions,
        postAggregationExpression: metric.postAggregationExpression,
      };
    }

    // Add results objects for this module
    for (const resultsObject of latestDef.resultsObjects) {
      resultsObjectToModule[resultsObject.id] = moduleId;
    }
  }

  // Sort by module ID for consistent output, with HFA modules last
  moduleMetadata.sort((a, b) => {
    const aIsHfa = a.id.startsWith("hfa");
    const bIsHfa = b.id.startsWith("hfa");
    if (aIsHfa && !bIsHfa) return 1;
    if (!aIsHfa && bIsHfa) return -1;
    return a.id.localeCompare(b.id);
  });

  const moduleIds = moduleMetadata.map((m) => `"${m.id}"`).join(", ");
  const possibleModules = moduleMetadata
    .map(
      (m) =>
        `  { id: "${m.id}", label: "${
          m.label
        }", prerequisiteModules: [${m.prerequisites
          .map((p) => `"${p}"`)
          .join(", ")}] }`
    )
    .join(",\n");

  // Sort metric mappings for consistent output
  const sortedMetricIds = Object.keys(metricToModule).sort();
  const metricMapping = sortedMetricIds
    .map((metricId) => `  "${metricId}": "${metricToModule[metricId]}"`)
    .join(",\n");

  // Sort results object mappings for consistent output
  const sortedResultsObjectIds = Object.keys(resultsObjectToModule).sort();
  const resultsObjectMapping = sortedResultsObjectIds
    .map((roId) => `  "${roId}": "${resultsObjectToModule[roId]}"`)
    .join(",\n");

  // Generate metric static data map
  const sortedMetricStaticIds = Object.keys(metricStaticData).sort();
  const metricStaticDataCode = sortedMetricStaticIds
    .map((metricId) => {
      const d = metricStaticData[metricId];
      const variant = d.variantLabel ? `, variantLabel: "${d.variantLabel}"` : "";
      const replacements = d.valueLabelReplacements ? `, valueLabelReplacements: ${JSON.stringify(d.valueLabelReplacements)}` : "";
      const postAgg = d.postAggregationExpression ? `, postAggregationExpression: ${JSON.stringify(d.postAggregationExpression)}` : "";
      return `  "${metricId}": { label: "${d.label}"${variant}, resultsObjectId: "${d.resultsObjectId}", valueProps: ${JSON.stringify(d.valueProps)}, valueFunc: "${d.valueFunc}", formatAs: "${d.formatAs}"${replacements}, requiredDisaggregationOptions: ${JSON.stringify(d.requiredDisaggregationOptions)}${postAgg} }`;
    })
    .join(",\n");

  return `// ⚠️  THIS FILE IS AUTO-GENERATED - DO NOT EDIT MANUALLY
// Generated by build_module_definitions.ts
// Last generated: ${new Date().toISOString()}

// Define module IDs as a const array first
const MODULE_IDS = [${moduleIds}] as const;
export type ModuleId = (typeof MODULE_IDS)[number];

export function getValidatedModuleId(id: string): ModuleId {
  if (!MODULE_IDS.includes(id as ModuleId)) {
    throw new Error("Bad module id");
  }
  return id as ModuleId;
}

// Now use ModuleId type in the module definitions
export const _POSSIBLE_MODULES: {
  id: ModuleId;
  label: string;
  prerequisiteModules: ModuleId[];
}[] = [
${possibleModules},
];

// Metric ID to Module ID mapping
export const METRIC_TO_MODULE: Record<string, ModuleId> = {
${metricMapping},
};

export function getModuleIdForMetric(metricId: string): ModuleId {
  const moduleId = METRIC_TO_MODULE[metricId];
  if (!moduleId) {
    throw new Error(\`Unknown metricId: \${metricId}. This may indicate a migration issue.\`);
  }
  return moduleId;
}

// Results Object ID to Module ID mapping
export const RESULTS_OBJECT_TO_MODULE: Record<string, ModuleId> = {
${resultsObjectMapping},
};

export function getModuleIdForResultsObject(resultsObjectId: string): ModuleId {
  const moduleId = RESULTS_OBJECT_TO_MODULE[resultsObjectId];
  if (!moduleId) {
    throw new Error(\`Unknown resultsObjectId: \${resultsObjectId}. This may indicate a migration issue.\`);
  }
  return moduleId;
}

// Static metric data for building fetchConfig client-side
export const METRIC_STATIC_DATA: Record<string, {
  label: string;
  variantLabel?: string;
  resultsObjectId: string;
  valueProps: string[];
  valueFunc: "SUM" | "AVG" | "COUNT" | "MIN" | "MAX" | "identity";
  formatAs: "percent" | "number";
  valueLabelReplacements?: Record<string, string>;
  requiredDisaggregationOptions: string[];
  postAggregationExpression?: any;
}> = {
${metricStaticDataCode},
};

export function getMetricStaticData(metricId: string) {
  const data = METRIC_STATIC_DATA[metricId];
  if (!data) {
    throw new Error(\`Unknown metricId: \${metricId}. This may indicate a migration issue.\`);
  }
  return data;
}
`;
}

function validateResultsObjects(
  modules: Map<
    ModuleId,
    Map<string, { definition: ModuleDefinitionJSON; script: string }>
  >
): void {
  const resultsObjectIds = new Map<string, { moduleId: ModuleId; version: string }>();
  const duplicates: string[] = [];

  for (const [moduleId, versions] of modules.entries()) {
    for (const [version, { definition }] of versions.entries()) {
      for (const ro of definition.resultsObjects) {
        const existing = resultsObjectIds.get(ro.id);
        if (existing) {
          duplicates.push(
            `  "${ro.id}" in ${moduleId}@${version} conflicts with ${existing.moduleId}@${existing.version}`
          );
        } else {
          resultsObjectIds.set(ro.id, { moduleId, version });
        }
      }
    }
  }

  if (duplicates.length > 0) {
    console.error("\n✗ Duplicate results object IDs found:");
    for (const dup of duplicates) {
      console.error(dup);
    }
    throw new Error("Results object validation failed");
  }

  console.log(`✓ Validated ${resultsObjectIds.size} unique results object IDs`);
}

function validateMetrics(
  modules: Map<
    ModuleId,
    Map<string, { definition: ModuleDefinitionJSON; script: string }>
  >
): void {
  const metricIds = new Map<string, { moduleId: ModuleId; version: string }>();
  const duplicates: string[] = [];
  const invalidRoutes: string[] = [];
  const variantErrors: string[] = [];

  for (const [moduleId, versions] of modules.entries()) {
    for (const [version, { definition }] of versions.entries()) {
      const validResultsObjectIds = new Set(
        definition.resultsObjects.map((ro) => ro.id)
      );

      // Group metrics by label to validate variantLabel consistency
      const metricsByLabel = new Map<string, typeof definition.metrics>();
      for (const metric of definition.metrics) {
        const existing = metricsByLabel.get(metric.label) ?? [];
        existing.push(metric);
        metricsByLabel.set(metric.label, existing);
      }

      // Validate variantLabel consistency
      for (const [label, metricsWithLabel] of metricsByLabel.entries()) {
        if (metricsWithLabel.length > 1) {
          // Multiple metrics share this label - ALL must have variantLabel
          const missingVariant = metricsWithLabel.filter((m) => !m.variantLabel);
          if (missingVariant.length > 0) {
            variantErrors.push(
              `  ${moduleId}@${version}: Metrics with label "${label}" have ${metricsWithLabel.length} entries but ${missingVariant.length} are missing variantLabel: ${missingVariant.map((m) => m.id).join(", ")}`
            );
          }
        } else if (metricsWithLabel.length === 1 && metricsWithLabel[0].variantLabel) {
          // Single metric with variantLabel but no siblings - warn
          variantErrors.push(
            `  ${moduleId}@${version}: Metric "${metricsWithLabel[0].id}" has variantLabel "${metricsWithLabel[0].variantLabel}" but no other metrics share its label "${label}"`
          );
        }
      }

      for (const metric of definition.metrics) {
        // Check for duplicate metric IDs
        const existing = metricIds.get(metric.id);
        if (existing) {
          duplicates.push(
            `  "${metric.id}" in ${moduleId}@${version} conflicts with ${existing.moduleId}@${existing.version}`
          );
        } else {
          metricIds.set(metric.id, { moduleId, version });
        }

        // Check resultsObjectId points to valid resultsObject
        if (!validResultsObjectIds.has(metric.resultsObjectId)) {
          invalidRoutes.push(
            `  "${metric.id}" in ${moduleId}@${version}: resultsObjectId "${metric.resultsObjectId}" not found in resultsObjects`
          );
        }
      }
    }
  }

  if (duplicates.length > 0) {
    console.error("\n✗ Duplicate metric IDs found:");
    for (const dup of duplicates) {
      console.error(dup);
    }
  }

  if (invalidRoutes.length > 0) {
    console.error("\n✗ Invalid resultsObjectId references:");
    for (const route of invalidRoutes) {
      console.error(route);
    }
  }

  if (variantErrors.length > 0) {
    console.error("\n✗ Variant label validation errors:");
    for (const err of variantErrors) {
      console.error(err);
    }
  }

  if (duplicates.length > 0 || invalidRoutes.length > 0 || variantErrors.length > 0) {
    throw new Error("Metric validation failed");
  }

  console.log(`✓ Validated ${metricIds.size} unique metric IDs with valid resultsObjectId`);
}

async function buildModules() {
  console.log("Building module definitions...\n");

  const modules = await scanModuleDefinitions();

  validateResultsObjects(modules);
  validateMetrics(modules);

  const outDir = "./module_defs_dist";
  await Deno.mkdir(outDir, { recursive: true });
  await Deno.mkdir(join(outDir, "modules"), { recursive: true });

  for (const [_moduleId, versions] of modules.entries()) {
    for (const [_version, { definition, script }] of versions.entries()) {
      // At this point, all scriptSources have been converted to local during scanning
      if (definition.scriptSource.type !== "local") {
        throw new Error("Unexpected: scriptSource should be local at build output stage");
      }

      // Write JSON definition (without script)
      const jsonFilename = definition.scriptSource.filename.replace(
        ".R",
        ".json"
      );
      const jsonFilepath = join(outDir, "modules", jsonFilename);
      await Deno.writeTextFile(
        jsonFilepath,
        JSON.stringify(definition, null, 2)
      );

      // Write script file
      const scriptFilepath = join(
        outDir,
        "modules",
        definition.scriptSource.filename
      );
      await Deno.writeTextFile(scriptFilepath, script);
    }
  }

  const manifest = generateManifest(modules);
  await Deno.writeTextFile(
    join(outDir, "manifest.json"),
    JSON.stringify(manifest, null, 2)
  );

  // Generate module metadata TypeScript file
  const metadataContent = generateModuleMetadata(modules);
  const metadataPath = "./lib/types/module_metadata_generated.ts";

  // Remove readonly if file exists
  try {
    await Deno.chmod(metadataPath, 0o644);
  } catch {
    // File doesn't exist yet, that's fine
  }

  await Deno.writeTextFile(metadataPath, metadataContent);

  // Set file to readonly (444 permissions)
  await Deno.chmod(metadataPath, 0o444);

  console.log(`\n✓ Build complete!`);
  console.log(`  - ${modules.size} modules`);
  console.log(
    `  - ${Array.from(modules.values()).reduce(
      (acc, v) => acc + v.size,
      0
    )} total versions`
  );
  console.log(`  - Output: ${outDir}/`);
  console.log(`  - Generated: ${metadataPath}`);
}

function cleanPresentationObjectJSON(
  obj: PartialDefaultPresentationObjectJSON,
): PartialDefaultPresentationObjectJSON {
  const cleaned: PartialDefaultPresentationObjectJSON = {
    id: obj.id,
    label: obj.label,
    metricId: obj.metricId,
    config: {
      d: obj.config.d,
    },
  };

  if (obj.config.s) {
    const cleanedS: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj.config.s)) {
      const defaultValue = DEFAULT_S_CONFIG[key as keyof typeof DEFAULT_S_CONFIG];
      if (JSON.stringify(value) !== JSON.stringify(defaultValue)) {
        cleanedS[key] = value;
      }
    }
    if (Object.keys(cleanedS).length > 0) {
      cleaned.config.s = cleanedS as typeof obj.config.s;
    }
  }

  if (obj.config.t) {
    const cleanedT: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj.config.t)) {
      const defaultValue = DEFAULT_T_CONFIG[key as keyof typeof DEFAULT_T_CONFIG];
      if (JSON.stringify(value) !== JSON.stringify(defaultValue)) {
        cleanedT[key] = value;
      }
    }
    if (Object.keys(cleanedT).length > 0) {
      cleaned.config.t = cleanedT as typeof obj.config.t;
    }
  }

  return cleaned;
}

async function cleanPresentationObjectFile(filePath: string) {
  console.log(`\nCleaning presentation object JSON file: ${filePath}`);

  const content = await Deno.readTextFile(filePath);
  const obj = JSON.parse(content) as PartialDefaultPresentationObjectJSON;

  const cleaned = cleanPresentationObjectJSON(obj);

  await Deno.writeTextFile(filePath, JSON.stringify(cleaned, null, 2));
  console.log(`✓ Cleaned and saved: ${filePath}`);
}

if (import.meta.main) {
  const args = Deno.args;

  if (args.length > 0 && args[0] === "clean") {
    if (args.length < 2) {
      console.error("Usage: deno task build:modules clean <path-to-json-file>");
      Deno.exit(1);
    }
    await cleanPresentationObjectFile(args[1]);
  } else {
    await buildModules();
  }
}
