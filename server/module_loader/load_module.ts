import {
  DEFAULT_S_CONFIG,
  DEFAULT_T_CONFIG,
  MODULE_REGISTRY,
  type APIResponseWithData,
  type DefaultPresentationObject,
  type InstanceLanguage,
  type MetricDefinition,
  type MetricDefinitionJSON,
  type ModuleDefinition,
  type ModuleDefinitionJSON,
  type ModuleId,
  type PeriodFilter,
  type PeriodOption,
  type ResultsObjectDefinition,
  type ResultsObjectDefinitionJSON,
  type TranslatableString,
} from "lib";
import { ModuleDefinitionJSONSchema } from "../../lib/types/module_definition_validator.ts";
import { getTranslateFunc } from "./translation_utils.ts";

const _MODULE_SOURCE = Deno.env.get("MODULE_SOURCE") ?? "local";
const _MODULES_DIR = Deno.env.get("MODULES_DIR") ?? "./modules";
const _GITHUB_TOKEN = Deno.env.get("GITHUB_TOKEN");

export function resolveTS(ts: TranslatableString, lang: InstanceLanguage): string {
  return lang === "fr" ? (ts.fr || ts.en) : ts.en;
}

function computePeriodFilter(periodOpt: PeriodOption, nMonths: number): PeriodFilter {
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;

  if (periodOpt === "year") {
    return {
      filterType: "last_n_months",
      nMonths,
      periodOption: "year",
      min: currentYear,
      max: currentYear,
    };
  }

  if (periodOpt === "quarter_id") {
    const maxQuarter = currentYear * 10 + Math.ceil(currentMonth / 3);
    const startDate = new Date(currentYear, currentMonth - 1 - nMonths, 1);
    const minQuarter = startDate.getFullYear() * 10 + Math.ceil((startDate.getMonth() + 1) / 3);
    return {
      filterType: "last_n_months",
      nMonths,
      periodOption: "quarter_id",
      min: minQuarter,
      max: maxQuarter,
    };
  }

  const maxPeriod = currentYear * 100 + currentMonth;
  const startDate = new Date(currentYear, currentMonth - 1 - nMonths + 1, 1);
  const minPeriod = startDate.getFullYear() * 100 + (startDate.getMonth() + 1);
  return {
    filterType: "last_n_months",
    nMonths,
    periodOption: "period_id",
    min: minPeriod,
    max: maxPeriod,
  };
}

export function deriveDefaultPresentationObjects(
  metrics: MetricDefinition[],
  moduleId: string,
  language: InstanceLanguage,
): DefaultPresentationObject[] {
  const results: DefaultPresentationObject[] = [];
  let sortOrder = 0;
  for (const metric of metrics) {
    for (const preset of metric.vizPresets ?? []) {
      if (!preset.createDefaultVisualizationOnInstall) continue;
      const periodFilter = preset.defaultPeriodFilterForDefaultVisualizations
        ? computePeriodFilter(preset.config.d.periodOpt, preset.defaultPeriodFilterForDefaultVisualizations.nMonths)
        : undefined;
      results.push({
        id: preset.createDefaultVisualizationOnInstall,
        label: resolveTS(preset.label, language),
        moduleId,
        metricId: metric.id,
        sortOrder: sortOrder++,
        config: {
          d: {
            ...preset.config.d,
            ...(periodFilter ? { periodFilter } : {}),
          },
          s: { ...DEFAULT_S_CONFIG, ...preset.config.s },
          t: {
            caption: preset.config.t?.caption ? resolveTS(preset.config.t.caption, language) : DEFAULT_T_CONFIG.caption,
            captionRelFontSize: preset.config.t?.captionRelFontSize ?? DEFAULT_T_CONFIG.captionRelFontSize,
            subCaption: preset.config.t?.subCaption ? resolveTS(preset.config.t.subCaption, language) : DEFAULT_T_CONFIG.subCaption,
            subCaptionRelFontSize: preset.config.t?.subCaptionRelFontSize ?? DEFAULT_T_CONFIG.subCaptionRelFontSize,
            footnote: preset.config.t?.footnote ? resolveTS(preset.config.t.footnote, language) : DEFAULT_T_CONFIG.footnote,
            footnoteRelFontSize: preset.config.t?.footnoteRelFontSize ?? DEFAULT_T_CONFIG.footnoteRelFontSize,
          },
        },
      });
    }
  }
  return results;
}

export async function fetchModuleFiles(
  moduleId: string,
): Promise<{ definition: ModuleDefinitionJSON; script: string; gitRef?: string }> {
  const registryEntry = MODULE_REGISTRY.find((m) => m.id === moduleId);
  if (!registryEntry) {
    throw new Error(`Module "${moduleId}" not found in registry`);
  }

  if (_MODULE_SOURCE === "local") {
    const basePath = `${_MODULES_DIR}/${registryEntry.github.path}`;
    const definitionText = await Deno.readTextFile(`${basePath}/definition.json`);
    const script = await Deno.readTextFile(`${basePath}/script.R`);
    const definition = JSON.parse(definitionText);
    return { definition, script, gitRef: "local" };
  }

  const { owner, repo, path } = registryEntry.github;
  const ref = "main";
  const baseUrl = `https://raw.githubusercontent.com/${owner}/${repo}/${ref}/${path}`;

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

  const definition = await defRes.json();
  const script = await scriptRes.text();

  return { definition, script, gitRef };
}

function validateDefinition(definition: unknown, moduleId: string): ModuleDefinitionJSON {
  const result = ModuleDefinitionJSONSchema.safeParse(definition);
  if (!result.success) {
    const issues = result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    throw new Error(`Invalid definition for module "${moduleId}": ${issues}`);
  }
  return result.data as ModuleDefinitionJSON;
}

function translateMetrics(
  metrics: MetricDefinitionJSON[],
  tc: (v: string) => string,
  language: InstanceLanguage,
): MetricDefinition[] {
  return metrics.map((m) => ({
    ...m,
    label: resolveTS(m.label, language),
    variantLabel: m.variantLabel ? resolveTS(m.variantLabel, language) : undefined,
    importantNotes: m.importantNotes ? resolveTS(m.importantNotes, language) : undefined,
    valueLabelReplacements: m.valueLabelReplacements
      ? Object.fromEntries(
          Object.entries(m.valueLabelReplacements).map(([key, value]) => [
            key,
            tc(value),
          ])
        )
      : undefined,
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
  language: InstanceLanguage,
): Promise<APIResponseWithData<ModuleDefinition>> {
  try {
    const { definition: rawDefinition, script } = await fetchModuleFiles(id);
    const definition = validateDefinition(rawDefinition, id);

    const tc = getTranslateFunc(language);

    const resultsObjectsWithModuleId: ResultsObjectDefinition[] =
      definition.resultsObjects.map((ro: ResultsObjectDefinitionJSON) => ({
        ...ro,
        moduleId: id,
      }));

    const translatedMetrics = translateMetrics(definition.metrics, tc, language);

    const translatedModule: ModuleDefinition = {
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

    return { success: true, data: translatedModule };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      err: `Failed to load module ${id}: ${errorMessage}`,
    };
  }
}
