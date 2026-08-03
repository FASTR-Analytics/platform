import {
  type APIResponseWithData,
  isSampleNProp,
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
  SAMPLE_N_PREFIX,
} from "lib";
import { stripFrontmatter } from "../github/fetch_module.ts";

import { _GITHUB_TOKEN, _MODULES_LOCAL_DIR } from "../exposed_env_vars.ts";
import { MODULE_SOURCE } from "./module_source.ts";
import { ensureRepoAssetCached } from "./repo_assets.ts";

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
    await cachePinnedRepoAssets(moduleId, definition, null);
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
  await cachePinnedRepoAssets(moduleId, definition, gitRef ?? null);
  const rawScript = await scriptRes.text();

  return { definition, script: stripFrontmatter(rawScript), gitRef };
}

// Definition resolution is where pinned repo assets are fetched, verified,
// and cached (PLAN_RESULTS_RUNS item 2 ruling) — a bad pin fails install/
// update/preview in the admin's face, never a module run. Assets are fetched
// at the same gitRef the definition was, so the two cannot disagree.
async function cachePinnedRepoAssets(
  moduleId: string,
  definition: ModuleDefinitionGithub,
  gitRef: string | null,
): Promise<void> {
  for (const asset of definition.assetsToImport) {
    if (typeof asset === "string") continue;
    await ensureRepoAssetCached(moduleId, asset, gitRef);
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

  // The query builder emits sample-size columns into the same result set as the
  // values (see lib/sample_n.ts), so an authored prop in that namespace would
  // collide with a generated alias — reject at install rather than emit
  // duplicate output column names.
  const reservedProps = result.data.metrics.flatMap((m) => [
    ...m.valueProps.filter(isSampleNProp),
    ...(m.postAggregationExpression?.ingredientValues ?? [])
      .map((iv) => iv.prop)
      .filter(isSampleNProp),
  ]);
  if (reservedProps.length > 0) {
    throw new Error(
      `Invalid definition for module "${moduleId}": value props may not start with "${SAMPLE_N_PREFIX}" (reserved for sample sizes): ${reservedProps.join(", ")}`,
    );
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
