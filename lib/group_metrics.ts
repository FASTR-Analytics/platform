import type { MetricWithStatus } from "./types/mod.ts";

export type MetricGroup = {
  label: string;
  variants: MetricWithStatus[];
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
