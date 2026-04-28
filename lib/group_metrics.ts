import type { MetricWithStatus, InstalledModuleSummary, ModuleId } from "./types/mod.ts";

export type MetricGroup = {
  label: string;
  variants: MetricWithStatus[];
};

export type MetricsByModule = {
  moduleId: ModuleId;
  moduleLabel: string;
  metricGroups: MetricGroup[];
};

type GroupMetricsOptions = {
  onlyReady?: boolean;
};

export function groupMetricsByLabel(
  metrics: MetricWithStatus[],
  options?: GroupMetricsOptions
): MetricGroup[] {
  const filtered = options?.onlyReady
    ? metrics.filter((m) => m.status === "ready")
    : metrics;

  const labelMap = new Map<string, MetricWithStatus[]>();

  for (const metric of filtered) {
    if (!labelMap.has(metric.label)) {
      labelMap.set(metric.label, []);
    }
    labelMap.get(metric.label)!.push(metric);
  }

  return Array.from(labelMap.entries())
    .map(([label, variants]) => ({
      label,
      variants: variants.sort((a, b) => a.id.localeCompare(b.id)),
    }))
    .sort((a, b) => a.variants[0].id.localeCompare(b.variants[0].id));
}

export function createMetricLookup(
  metrics: MetricWithStatus[]
): Map<string, MetricWithStatus> {
  return new Map(metrics.map((m) => [m.id, m]));
}

export function getMetricDisplayLabel(metric: MetricWithStatus): string {
  return metric.variantLabel
    ? `${metric.label} - ${metric.variantLabel}`
    : metric.label;
}

export function groupMetricsByModule(
  metrics: MetricWithStatus[],
  modules: InstalledModuleSummary[],
  options?: GroupMetricsOptions
): MetricsByModule[] {
  const filtered = options?.onlyReady
    ? metrics.filter((m) => m.status === "ready")
    : metrics;

  const moduleMap = new Map<ModuleId, MetricWithStatus[]>();
  for (const metric of filtered) {
    if (!moduleMap.has(metric.moduleId)) {
      moduleMap.set(metric.moduleId, []);
    }
    moduleMap.get(metric.moduleId)!.push(metric);
  }

  const result: MetricsByModule[] = [];
  for (const mod of modules) {
    const moduleMetrics = moduleMap.get(mod.id);
    if (moduleMetrics && moduleMetrics.length > 0) {
      result.push({
        moduleId: mod.id,
        moduleLabel: mod.label,
        metricGroups: groupMetricsByLabel(moduleMetrics),
      });
    }
  }

  return result;
}
