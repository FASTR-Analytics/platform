import type {
  DatasetType,
  InstalledModuleSummary,
  MetricWithStatus,
  ModuleTier,
} from "./types/mod.ts";
import { t3 } from "./translate/mod.ts";

// The one module order: family (HMIS, HFA, ICEH), then the family's primary
// module before its supporting analyses, then the declared sort order, then
// id. Every listing of modules sorts through this and nothing sorts modules
// by id or label.
export const MODULE_FAMILY_ORDER: readonly DatasetType[] = [
  "hmis",
  "hfa",
  "iceh",
];
const FAMILY_ORDER: Record<DatasetType, number> = { hmis: 0, hfa: 1, iceh: 2 };

// The family's name wherever modules are listed under it.
export function getModuleFamilyLabel(family: DatasetType): string {
  switch (family) {
    case "hmis":
      return t3({ en: "HMIS", fr: "HMIS", pt: "HMIS" });
    case "hfa":
      return t3({ en: "HFA", fr: "FOSA", pt: "HFA" });
    case "iceh":
      return t3({ en: "ICEH", fr: "ICEH", pt: "ICEH" });
  }
}
const TIER_ORDER: Record<ModuleTier, number> = { primary: 0, secondary: 1 };

export type ModulePresentation = {
  id: string;
  family: DatasetType;
  tier: ModuleTier;
  sortOrder: number;
};

export function compareModules(
  a: ModulePresentation,
  b: ModulePresentation,
): number {
  return (
    FAMILY_ORDER[a.family] - FAMILY_ORDER[b.family] ||
    TIER_ORDER[a.tier] - TIER_ORDER[b.tier] ||
    a.sortOrder - b.sortOrder ||
    a.id.localeCompare(b.id)
  );
}

export type MetricGroup = {
  label: string;
  variants: MetricWithStatus[];
};

export type MetricsByModule = {
  // Read-plane module identity: a plain string from the package's manifest
  // (PLAN_1a §0 clause 3).
  moduleId: string;
  moduleLabel: string;
  family: DatasetType;
  tier: ModuleTier;
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

  const moduleMap = new Map<string, MetricWithStatus[]>();
  for (const metric of filtered) {
    if (!moduleMap.has(metric.moduleId)) {
      moduleMap.set(metric.moduleId, []);
    }
    moduleMap.get(metric.moduleId)!.push(metric);
  }

  const result: MetricsByModule[] = [];
  for (const mod of modules.toSorted(compareModules)) {
    const moduleMetrics = moduleMap.get(mod.id);
    if (moduleMetrics && moduleMetrics.length > 0) {
      result.push({
        moduleId: mod.id,
        moduleLabel: mod.label,
        family: mod.family,
        tier: mod.tier,
        metricGroups: groupMetricsByLabel(moduleMetrics),
      });
    }
  }

  return result;
}
