import type { ModuleDefinitionGithub, DefinitionChanges, Metric } from "lib";
import type { ModuleDefinitionInstalled } from "lib";

/**
 * Compare an incoming GitHub definition against an installed definition.
 * Returns which fields have changed.
 *
 * This is the SINGLE SOURCE OF TRUTH for comparison logic.
 * Used by the preview endpoint to report facts to the client.
 *
 * Note: storedMetrics must be queried separately from the metrics table,
 * as ModuleDefinitionInstalled doesn't include metrics (they're stored in DB).
 */
export function compareDefinitions(
  incomingDef: ModuleDefinitionGithub,
  incomingScript: string,
  storedDef: ModuleDefinitionInstalled,
  storedMetrics: Metric[],
): DefinitionChanges {
  const scriptChanged = incomingScript !== storedDef.script;

  const configReqChanged =
    JSON.stringify(incomingDef.configRequirements) !==
    JSON.stringify(storedDef.configRequirements);

  // Strip moduleId from stored resultsObjects for fair comparison
  // (incoming doesn't have moduleId, stored does)
  const storedResultsObjsComparable = storedDef.resultsObjects.map(
    ({ moduleId: _, ...rest }) => rest,
  );
  const resultsObjChanged =
    JSON.stringify(incomingDef.resultsObjects) !==
    JSON.stringify(storedResultsObjsComparable);

  // Metrics: compare structure (excluding translated fields and vizPresets)
  // We compare: id, valueFunc, formatAs, valueProps, resultsObjectId, hide
  // We skip: label, variantLabel, importantNotes (translated), vizPresets (separate)
  const incomingMetricsComparable = incomingDef.metrics.map((m) => ({
    id: m.id,
    valueFunc: m.valueFunc,
    formatAs: m.formatAs,
    valueProps: m.valueProps,
    resultsObjectId: m.resultsObjectId,
    hide: m.hide,
    requiredDisaggregationOptions: m.requiredDisaggregationOptions,
  }));
  const storedMetricsComparable = storedMetrics.map((m) => ({
    id: m.id,
    valueFunc: m.valueFunc,
    formatAs: m.formatAs,
    valueProps: m.valueProps,
    resultsObjectId: m.resultsObjectId,
    hide: m.hide,
    requiredDisaggregationOptions: m.requiredDisaggregationOptions,
  }));
  const metricsChanged =
    JSON.stringify(incomingMetricsComparable) !==
    JSON.stringify(storedMetricsComparable);

  // VizPresets: compare full content per metric
  const incomingVizPresets = incomingDef.metrics.map((m) => ({
    metricId: m.id,
    presets: m.vizPresets ?? [],
  }));
  const storedVizPresets = storedMetrics.map((m) => ({
    metricId: m.id,
    presets: m.vizPresets ?? [],
  }));
  const vizPresetsChanged =
    JSON.stringify(incomingVizPresets) !== JSON.stringify(storedVizPresets);

  // Label: incoming is { en, fr }, stored is plain string
  // Check if stored matches either translation
  const labelChanged =
    storedDef.label !== incomingDef.label.en &&
    storedDef.label !== incomingDef.label.fr;

  const dataSourcesChanged =
    JSON.stringify(incomingDef.dataSources) !==
    JSON.stringify(storedDef.dataSources);

  const assetsChanged =
    JSON.stringify(incomingDef.assetsToImport) !==
    JSON.stringify(storedDef.assetsToImport);

  return {
    script: scriptChanged,
    configRequirements: configReqChanged,
    resultsObjects: resultsObjChanged,
    metrics: metricsChanged,
    vizPresets: vizPresetsChanged,
    label: labelChanged,
    dataSources: dataSourcesChanged,
    assetsToImport: assetsChanged,
  };
}

/**
 * Returns true if any compute-affecting field changed.
 * Compute-affecting = would produce different R script output.
 */
export function recommendsRerun(changes: DefinitionChanges): boolean {
  return changes.script || changes.configRequirements || changes.resultsObjects;
}

/**
 * Check if compute-affecting fields changed (without needing metrics).
 * Use this when you only need to know if a rerun is needed.
 */
export function hasComputeAffectingChanges(
  incomingScript: string,
  incomingConfigRequirements: unknown,
  incomingResultsObjects: { id: string; description: string }[],
  storedDef: ModuleDefinitionInstalled,
): boolean {
  if (incomingScript !== storedDef.script) return true;

  if (
    JSON.stringify(incomingConfigRequirements) !==
    JSON.stringify(storedDef.configRequirements)
  ) return true;

  const storedResultsObjsComparable = storedDef.resultsObjects.map(
    ({ moduleId: _, ...rest }) => rest,
  );
  if (
    JSON.stringify(incomingResultsObjects) !==
    JSON.stringify(storedResultsObjsComparable)
  ) return true;

  return false;
}
