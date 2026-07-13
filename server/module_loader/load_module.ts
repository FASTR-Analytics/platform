import {
  type APIResponseWithData,
  DEFAULT_S_CONFIG,
  DEFAULT_T_CONFIG,
  type DefaultPresentationObject,
  type Language,
  type Metric,
  type MetricDefinitionGithub,
  MODULE_REGISTRY,
  type ModuleDefinitionDetail,
  type ModuleDefinitionGithub,
  moduleDefinitionGithubSchema,
  type ModuleId,
  resolveTS,
  type ResultsObjectDefinition,
  type ResultsObjectDefinitionGithub,
} from "lib";
import { stripFrontmatter } from "../github/fetch_module.ts";

import { _GITHUB_TOKEN, _MODULES_LOCAL_DIR } from "../exposed_env_vars.ts";
import { MODULE_SOURCE } from "./module_source.ts";
import { ensureRepoAssetCached } from "./repo_assets.ts";

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
            caption: preset.config.t.caption
              ? resolveTS(preset.config.t.caption, language)
              : DEFAULT_T_CONFIG.caption,
            captionRelFontSize: preset.config.t.captionRelFontSize ??
              DEFAULT_T_CONFIG.captionRelFontSize,
            subCaption: preset.config.t.subCaption
              ? resolveTS(preset.config.t.subCaption, language)
              : DEFAULT_T_CONFIG.subCaption,
            subCaptionRelFontSize: preset.config.t.subCaptionRelFontSize ??
              DEFAULT_T_CONFIG.subCaptionRelFontSize,
            footnote: preset.config.t.footnote
              ? resolveTS(preset.config.t.footnote, language)
              : DEFAULT_T_CONFIG.footnote,
            footnoteRelFontSize: preset.config.t.footnoteRelFontSize ??
              DEFAULT_T_CONFIG.footnoteRelFontSize,
          },
        },
      });
    }
  }
  return results;
}

// pinnedGitRef: fetch the module's files at this exact commit instead of
// HEAD — the run pipeline re-fetches the definitions the wizard's step 2
// resolved (PLAN_RESULTS_RUNS item 2). undefined = HEAD (install/update).
// Local source ignores the pin: local refs are per-read placeholders, and
// dev reads the working tree by design.
export async function fetchModuleFiles(
  moduleId: string,
  pinnedGitRef: string | undefined,
): Promise<
  { definition: ModuleDefinitionGithub; script: string; gitRef?: string }
> {
  const registryEntry = MODULE_REGISTRY.find((m) => m.id === moduleId);
  if (!registryEntry) {
    throw new Error(`Module "${moduleId}" not found in registry`);
  }

  if (MODULE_SOURCE === "local") {
    const basePath = `${_MODULES_LOCAL_DIR}/${registryEntry.github.path}`;
    const definitionText = await Deno.readTextFile(
      `${basePath}/definition.json`,
    );
    const rawScript = await Deno.readTextFile(`${basePath}/script.R`);
    const rawDefinition = JSON.parse(definitionText);
    const definition = validateDefinition(rawDefinition, moduleId);
    await cachePinnedRepoAssets(moduleId, definition);
    const localRef = `loc-${crypto.randomUUID().slice(0, 8)}`;
    return {
      definition,
      script: stripFrontmatter(rawScript),
      gitRef: localRef,
    };
  }

  const { owner, repo, path } = registryEntry.github;

  const headers: Record<string, string> = {};
  if (_GITHUB_TOKEN) {
    headers["Authorization"] = `Bearer ${_GITHUB_TOKEN}`;
  }

  // Pinned or HEAD commit SHA for this path
  let gitRef: string | undefined = pinnedGitRef;
  if (gitRef === undefined) {
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
  }

  // Use commit SHA if available to avoid GitHub's raw content cache (~5min)
  const ref = gitRef ?? "main";
  const baseUrl =
    `https://raw.githubusercontent.com/${owner}/${repo}/${ref}/${path}`;

  const [defRes, scriptRes] = await Promise.all([
    fetch(`${baseUrl}/definition.json`, { headers }),
    fetch(`${baseUrl}/script.R`, { headers }),
  ]);

  if (!defRes.ok) {
    throw new Error(
      `Failed to fetch definition.json for ${moduleId}: ${defRes.status} ${defRes.statusText}`,
    );
  }
  if (!scriptRes.ok) {
    throw new Error(
      `Failed to fetch script.R for ${moduleId}: ${scriptRes.status} ${scriptRes.statusText}`,
    );
  }

  const rawDefinition = await defRes.json();
  const definition = validateDefinition(rawDefinition, moduleId);
  await cachePinnedRepoAssets(moduleId, definition);
  const rawScript = await scriptRes.text();

  return { definition, script: stripFrontmatter(rawScript), gitRef };
}

// Definition resolution is where pinned repo assets are fetched, verified,
// and cached (PLAN_RESULTS_RUNS item 2 ruling) — a bad pin fails install/
// update/preview in the admin's face, never a module run.
async function cachePinnedRepoAssets(
  moduleId: string,
  definition: ModuleDefinitionGithub,
): Promise<void> {
  for (const asset of definition.assetsToImport) {
    if (typeof asset === "string") continue;
    await ensureRepoAssetCached(moduleId, asset);
  }
}

function validateDefinition(
  definition: unknown,
  moduleId: string,
): ModuleDefinitionGithub {
  const result = moduleDefinitionGithubSchema.safeParse(definition);
  if (!result.success) {
    const issues = result.error.issues.map((i) =>
      `${i.path.join(".")}: ${i.message}`
    ).join("; ");
    throw new Error(`Invalid definition for module "${moduleId}": ${issues}`);
  }
  return result.data as ModuleDefinitionGithub;
}

function translateMetrics(
  metrics: MetricDefinitionGithub[],
  language: Language,
): Metric[] {
  return metrics.map((m) => ({
    ...m,
    label: resolveTS(m.label, language),
    variantLabel: m.variantLabel ? resolveTS(m.variantLabel, language) : null,
    importantNotes: m.importantNotes
      ? resolveTS(m.importantNotes, language)
      : null,
    postAggregationExpression: m.postAggregationExpression ?? null,
    aiDescription: m.aiDescription ?? null,
    valueLabelReplacements: Object.keys(m.valueLabelReplacements).length > 0
      ? m.valueLabelReplacements
      : null,
  }));
}

function translateConfigRequirements(
  configRequirements: ModuleDefinitionGithub["configRequirements"],
  language: Language,
): ModuleDefinitionDetail["configRequirements"] {
  return {
    parameters: configRequirements.parameters.map((p) => ({
      ...p,
      description: resolveTS(p.description, language),
    })),
  };
}

export async function getModuleDefinitionDetail(
  id: ModuleId,
  language: Language,
  pinnedGitRef: string | undefined,
): Promise<APIResponseWithData<ModuleDefinitionDetail & { gitRef?: string }>> {
  try {
    const { definition, script, gitRef } = await fetchModuleFiles(
      id,
      pinnedGitRef,
    );

    const resultsObjectsWithModuleId: ResultsObjectDefinition[] = definition
      .resultsObjects.map((ro: ResultsObjectDefinitionGithub) => ({
        id: ro.id,
        moduleId: id,
        createTableStatementPossibleColumns:
          ro.createTableStatementPossibleColumns,
      }));

    const translatedMetrics = translateMetrics(definition.metrics, language);

    const translatedModule: ModuleDefinitionDetail = {
      id,
      label: resolveTS(definition.label, language),
      prerequisites: definition.prerequisites as ModuleId[],
      lastScriptUpdate: new Date().toISOString(),
      dataSources: definition.dataSources,
      scriptGenerationType: definition.scriptGenerationType,
      configRequirements: translateConfigRequirements(
        definition.configRequirements,
        language,
      ),
      script,
      assetsToImport: definition.assetsToImport,
      resultsObjects: resultsObjectsWithModuleId,
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
