import {
  DEFAULT_S_CONFIG,
  DEFAULT_T_CONFIG,
  type APIResponseWithData,
  type BuiltModuleDefinitionJSON,
  type DefaultPresentationObject,
  type InstanceLanguage,
  type MetricDefinition,
  type MetricDefinitionJSON,
  type ModuleDefinition,
  type ModuleId,
  type PeriodFilter,
  type PeriodOption,
  type ResultsObjectDefinition,
  type TranslatableString,
} from "lib";
import { getTranslateFunc } from "./translation_utils.ts";

function resolveTS(ts: TranslatableString, lang: InstanceLanguage): string {
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
    const monthsBack = nMonths;
    const startDate = new Date(currentYear, currentMonth - 1 - monthsBack, 1);
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

function deriveDefaultPresentationObjects(
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

type ModuleManifest = {
  modules: Record<
    ModuleId,
    {
      label: { en: string; fr: string };
      versions: string[];
      latest: string;
      prerequisites?: ModuleId[];
    }
  >;
  lastBuild: string;
};

let manifestCache: ModuleManifest | null = null;

async function loadManifest(): Promise<ModuleManifest> {
  if (manifestCache) {
    return manifestCache;
  }

  const manifestPath = "./module_defs_dist/manifest.json";
  const manifestText = await Deno.readTextFile(manifestPath);
  manifestCache = JSON.parse(manifestText);
  return manifestCache!;
}

export async function getModuleDefinitionDetail(
  id: ModuleId,
  language: InstanceLanguage,
  version?: string
): Promise<APIResponseWithData<ModuleDefinition>> {
  try {
    const manifest = await loadManifest();
    const moduleInfo = manifest.modules[id];

    if (!moduleInfo) {
      return {
        success: false,
        err: `No module definition with id: ${id}`,
      };
    }

    const versionToLoad = version ?? moduleInfo.latest;
    const modulePath = `./module_defs_dist/modules/${id}-${versionToLoad}.json`;

    const moduleText = await Deno.readTextFile(modulePath);
    const rawModuleJSON: BuiltModuleDefinitionJSON = JSON.parse(moduleText);

    // Load script from local file (all scripts are bundled at build time)
    if (rawModuleJSON.scriptSource.type !== "local") {
      throw new Error(
        `Runtime scriptSource must be local, got: ${rawModuleJSON.scriptSource.type}`
      );
    }
    const scriptPath = `./module_defs_dist/modules/${rawModuleJSON.scriptSource.filename}`;
    const script = await Deno.readTextFile(scriptPath);

    const tc = getTranslateFunc(language);

    // Add moduleId to resultsObjects (derived from parent)
    const resultsObjectsWithModuleId: ResultsObjectDefinition[] =
      rawModuleJSON.resultsObjects.map((ro) => ({
        ...ro,
        moduleId: rawModuleJSON.id,
      }));

    const translatedMetrics = translateMetrics(rawModuleJSON.metrics, tc, language);

    const translatedModule: ModuleDefinition = {
      id: rawModuleJSON.id,
      label: resolveTS(rawModuleJSON.label, language),
      prerequisites: rawModuleJSON.prerequisites,
      lastScriptUpdate: rawModuleJSON.lastScriptUpdate,
      commitSha: rawModuleJSON.commitSha,
      scriptSource: rawModuleJSON.scriptSource,
      dataSources: rawModuleJSON.dataSources,
      configRequirements: rawModuleJSON.configRequirements,
      script,
      assetsToImport: rawModuleJSON.assetsToImport,
      resultsObjects: translateResultsObjects(resultsObjectsWithModuleId, tc),
      defaultPresentationObjects: deriveDefaultPresentationObjects(
        translatedMetrics,
        rawModuleJSON.id,
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

function translateResultsObjects(
  resultsObjects: ResultsObjectDefinition[],
  tc: (v: string) => string
): ResultsObjectDefinition[] {
  return resultsObjects.map((ro) => ({
    ...ro,
    description: tc(ro.description),
  }));
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

