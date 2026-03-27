let _metricToModule: Record<string, string> = {};
let _resultsObjectToModule: Record<string, string> = {};

export function setGlobalModuleMaps(
  metricToModule: Record<string, string>,
  resultsObjectToModule: Record<string, string>,
): void {
  _metricToModule = metricToModule;
  _resultsObjectToModule = resultsObjectToModule;
}

export function getModuleIdForMetric(metricId: string): string {
  return _metricToModule[metricId] ?? "unknown";
}

export function getModuleIdForResultsObject(resultsObjectId: string): string {
  return _resultsObjectToModule[resultsObjectId] ?? "unknown";
}
