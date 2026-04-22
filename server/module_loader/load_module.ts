import {
  DEFAULT_S_CONFIG,
  DEFAULT_T_CONFIG,
  MODULE_REGISTRY,
  MODULE_SOURCE,
  MODULES_LOCAL_DIR,
  moduleDefinitionGithubSchema,
  resolveTS,
  type APIResponseWithData,
  type DefaultPresentationObject,
  type Language,
  type Metric,
  type MetricDefinitionGithub,
  type ModuleDefinitionDetail,
  type ModuleDefinitionGithub,
  type ModuleId,
  type ResultsObjectDefinition,
  type ResultsObjectDefinitionGithub,
} from "lib";
import { stripFrontmatter } from "../github/fetch_module.ts";
import { getTranslateFunc } from "./translation_utils.ts";

import { _GITHUB_TOKEN } from "../exposed_env_vars.ts";

export function deriveDefaultPresentationObjects(
  metrics: Metric[],
  moduleId: string,
  language: Language,
): DefaultPresentationObject[] {
  const results: DefaultPresentationObject[] = [];
  let sortOrder = 0;
  for (const metric of metrics) {
    for (const preset of metric.vizPresets ?? []) {
      if (!preset.createDefaultVisualizationOnInstall) continue;
      results.push({
        id: preset.createDefaultVisualizationOnInstall,
        label: resolveTS(preset.label, language),
        moduleId,
        metricId: metric.id,
        sortOrder: sortOrder++,
        config: {
          d: { ...preset.config.d },
          s: { ...DEFAULT_S_CONFIG, ...preset.config.s },
          t: {
            caption: preset.config.t.caption ? resolveTS(preset.config.t.caption, language) : DEFAULT_T_CONFIG.caption,
            captionRelFontSize: preset.config.t.captionRelFontSize ?? DEFAULT_T_CONFIG.captionRelFontSize,
            subCaption: preset.config.t.subCaption ? resolveTS(preset.config.t.subCaption, language) : DEFAULT_T_CONFIG.subCaption,
            subCaptionRelFontSize: preset.config.t.subCaptionRelFontSize ?? DEFAULT_T_CONFIG.subCaptionRelFontSize,
            footnote: preset.config.t.footnote ? resolveTS(preset.config.t.footnote, language) : DEFAULT_T_CONFIG.footnote,
            footnoteRelFontSize: preset.config.t.footnoteRelFontSize ?? DEFAULT_T_CONFIG.footnoteRelFontSize,
          },
        },
      });
    }
  }
  return results;
}

export async function fetchModuleFiles(
  moduleId: string,
): Promise<{ definition: ModuleDefinitionGithub; script: string; gitRef?: string }> {
  const registryEntry = MODULE_REGISTRY.find((m) => m.id === moduleId);
  if (!registryEntry) {
    throw new Error(`Module "${moduleId}" not found in registry`);
  }

  if (MODULE_SOURCE === "local") {
    const basePath = `${MODULES_LOCAL_DIR}/${registryEntry.github.path}`;
    const definitionText = await Deno.readTextFile(`${basePath}/definition.json`);
    const rawScript = await Deno.readTextFile(`${basePath}/script.R`);
    const rawDefinition = JSON.parse(definitionText);
    const definition = validateDefinition(rawDefinition, moduleId);
    return { definition, script: stripFrontmatter(rawScript), gitRef: "local" };
  }

  const { owner, repo, path } = registryEntry.github;

  const headers: Record<string, string> = {};
  if (_GITHUB_TOKEN) {
    headers["Authorization"] = `Bearer ${_GITHUB_TOKEN}`;
  }

  // Fetch HEAD commit SHA for this path
  let gitRef: string | undefined;
  try {
    const commitsRes = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/commits?path=${path}&per_page=1`,
      { headers },
    );
    if (commitsRes.ok) {
      const commits = await commitsRes.json();
      if (commits.length > 0) {
        gitRef = commits[0].sha;
      }
    }
  } catch {
    // Non-fatal — we can still install without a git ref
  }

  // Use commit SHA if available to avoid GitHub's raw content cache (~5min)
  const ref = gitRef ?? "main";
  const baseUrl = `https://raw.githubusercontent.com/${owner}/${repo}/${ref}/${path}`;

  const [defRes, scriptRes] = await Promise.all([
    fetch(`${baseUrl}/definition.json`, { headers }),
    fetch(`${baseUrl}/script.R`, { headers }),
  ]);

  if (!defRes.ok) {
    throw new Error(`Failed to fetch definition.json for ${moduleId}: ${defRes.status} ${defRes.statusText}`);
  }
  if (!scriptRes.ok) {
    throw new Error(`Failed to fetch script.R for ${moduleId}: ${scriptRes.status} ${scriptRes.statusText}`);
  }

  const rawDefinition = await defRes.json();
  const definition = validateDefinition(rawDefinition, moduleId);
  const rawScript = await scriptRes.text();

  return { definition, script: stripFrontmatter(rawScript), gitRef };
}

function validateDefinition(definition: unknown, moduleId: string): ModuleDefinitionGithub {
  const result = moduleDefinitionGithubSchema.safeParse(definition);
  if (!result.success) {
    const issues = result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    throw new Error(`Invalid definition for module "${moduleId}": ${issues}`);
  }
  return result.data as ModuleDefinitionGithub;
}

function translateMetrics(
  metrics: MetricDefinitionGithub[],
  tc: (v: string) => string,
  language: Language,
): Metric[] {
  return metrics.map((m) => ({
    ...m,
    label: resolveTS(m.label, language),
    variantLabel: m.variantLabel ? resolveTS(m.variantLabel, language) : null,
    importantNotes: m.importantNotes ? resolveTS(m.importantNotes, language) : null,
    postAggregationExpression: m.postAggregationExpression ?? null,
    aiDescription: m.aiDescription ?? null,
    valueLabelReplacements: Object.keys(m.valueLabelReplacements).length > 0
      ? Object.fromEntries(
          Object.entries(m.valueLabelReplacements).map(([key, value]) => [
            key,
            tc(value),
          ])
        )
      : null,
  }));
}

function translateResultsObjects(
  resultsObjects: ResultsObjectDefinition[],
  tc: (v: string) => string,
): ResultsObjectDefinition[] {
  return resultsObjects.map((ro) => ({
    ...ro,
    description: tc(ro.description),
  }));
}

export async function getModuleDefinitionDetail(
  id: ModuleId,
  language: Language,
): Promise<APIResponseWithData<ModuleDefinitionDetail & { gitRef?: string }>> {
  try {
    const { definition, script, gitRef } = await fetchModuleFiles(id);

    const tc = getTranslateFunc(language);

    const resultsObjectsWithModuleId: ResultsObjectDefinition[] =
      definition.resultsObjects.map((ro: ResultsObjectDefinitionGithub) => ({
        ...ro,
        moduleId: id,
      }));

    const translatedMetrics = translateMetrics(definition.metrics, tc, language);

    const translatedModule: ModuleDefinitionDetail = {
      id,
      label: resolveTS(definition.label, language),
      prerequisites: definition.prerequisites as ModuleId[],
      lastScriptUpdate: new Date().toISOString(),
      dataSources: definition.dataSources,
      scriptGenerationType: definition.scriptGenerationType,
      configRequirements: definition.configRequirements,
      script,
      assetsToImport: definition.assetsToImport,
      resultsObjects: translateResultsObjects(resultsObjectsWithModuleId, tc),
      defaultPresentationObjects: deriveDefaultPresentationObjects(
        translatedMetrics,
        id,
        language,
      ),
      metrics: translatedMetrics,
    };

    return { success: true, data: { ...translatedModule, gitRef } };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      err: `Failed to load module ${id}: ${errorMessage}`,
    };
  }
}
