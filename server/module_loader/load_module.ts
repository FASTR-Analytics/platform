import {
  DEFAULT_S_CONFIG,
  DEFAULT_T_CONFIG,
  type APIResponseWithData,
  type BuiltModuleDefinitionJSON,
  type DefaultPresentationObject,
  type InstanceLanguage,
  type MetricDefinition,
  type ModuleDefinition,
  type ModuleId,
  type PartialDefaultPresentationObject,
  type PartialDefaultPresentationObjectJSON,
  type PresentationObjectConfig,
  type ResultsObjectDefinition,
} from "lib";
import { getTranslateFunc } from "./translation_utils.ts";

function mergePartialPresentationObject(
  partial: PartialDefaultPresentationObject
): DefaultPresentationObject {
  return {
    ...partial,
    config: {
      d: partial.config.d,
      s: { ...DEFAULT_S_CONFIG, ...partial.config.s },
      t: { ...DEFAULT_T_CONFIG, ...partial.config.t },
    },
  };
}

function mergePartialPresentationObjects(
  partials: PartialDefaultPresentationObject[]
): DefaultPresentationObject[] {
  return partials.map(mergePartialPresentationObject);
}

function validatePresentationObjectMetricIds(
  presentationObjects: PartialDefaultPresentationObjectJSON[],
  metrics: MetricDefinition[]
): void {
  const metricIds = new Set(metrics.map((m) => m.id));
  for (const po of presentationObjects) {
    if (!metricIds.has(po.metricId)) {
      throw new Error(
        `Presentation object "${po.id}" references unknown metricId: ${po.metricId}`
      );
    }
  }
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

    // Validate presentation objects reference valid metrics
    validatePresentationObjectMetricIds(
      rawModuleJSON.defaultPresentationObjects,
      rawModuleJSON.metrics
    );

    // Add moduleId to presentation objects (derived from parent)
    const presentationObjectsWithModuleId: PartialDefaultPresentationObject[] =
      rawModuleJSON.defaultPresentationObjects.map((po) => ({
        ...po,
        moduleId: rawModuleJSON.id,
      }));

    // Merge partial presentation objects
    const fullPresentationObjects = mergePartialPresentationObjects(
      presentationObjectsWithModuleId
    );

    // Add moduleId to resultsObjects (derived from parent)
    const resultsObjectsWithModuleId: ResultsObjectDefinition[] =
      rawModuleJSON.resultsObjects.map((ro) => ({
        ...ro,
        moduleId: rawModuleJSON.id,
      }));

    const translatedModule: ModuleDefinition = {
      id: rawModuleJSON.id,
      label: tc(rawModuleJSON.label),
      prerequisites: rawModuleJSON.prerequisites,
      lastScriptUpdate: rawModuleJSON.lastScriptUpdate,
      commitSha: rawModuleJSON.commitSha,
      scriptSource: rawModuleJSON.scriptSource,
      dataSources: rawModuleJSON.dataSources,
      configRequirements: rawModuleJSON.configRequirements,
      script,
      assetsToImport: rawModuleJSON.assetsToImport,
      resultsObjects: translateResultsObjects(resultsObjectsWithModuleId, tc),
      defaultPresentationObjects: translateDefaultPresentationObjects(
        fullPresentationObjects,
        tc
      ),
      metrics: translateMetrics(rawModuleJSON.metrics, tc),
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
  metrics: MetricDefinition[],
  tc: (v: string) => string
): MetricDefinition[] {
  return metrics.map((m) => ({
    ...m,
    label: tc(m.label),
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

function translateDefaultPresentationObjects(
  presentationObjects: DefaultPresentationObject[],
  tc: (v: string) => string
): DefaultPresentationObject[] {
  return presentationObjects.map((po) => {
    const translatedConfig: PresentationObjectConfig = {
      d: po.config.d,
      s: po.config.s,
      t: {
        caption: tc(po.config.t.caption),
        captionRelFontSize: po.config.t.captionRelFontSize,
        subCaption: tc(po.config.t.subCaption),
        subCaptionRelFontSize: po.config.t.subCaptionRelFontSize,
        footnote: tc(po.config.t.footnote),
        footnoteRelFontSize: po.config.t.footnoteRelFontSize,
      },
    };

    return {
      id: po.id,
      label: tc(po.label),
      moduleId: po.moduleId,
      metricId: po.metricId,
      config: translatedConfig,
    };
  });
}
