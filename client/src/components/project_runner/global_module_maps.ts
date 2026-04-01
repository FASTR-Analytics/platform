let _metricToModule: Record<string, string> = {};
let _resultsObjectToModule: Record<string, string> = {};
let _metricToFormatAs: Record<string, "percent" | "number"> = {};

export function setGlobalModuleMaps(
  metricToModule: Record<string, string>,
  resultsObjectToModule: Record<string, string>,
  metricToFormatAs: Record<string, "percent" | "number">,
): void {
  _metricToModule = metricToModule;
  _resultsObjectToModule = resultsObjectToModule;
  _metricToFormatAs = metricToFormatAs;
}

export function getModuleIdForMetric(metricId: string): string {
  return _metricToModule[metricId] ?? "unknown";
}

export function getModuleIdForResultsObject(resultsObjectId: string): string {
  return _resultsObjectToModule[resultsObjectId] ?? "unknown";
}

export function getFormatAsForMetric(metricId: string): "percent" | "number" {
  return _metricToFormatAs[metricId] ?? "number";
}
