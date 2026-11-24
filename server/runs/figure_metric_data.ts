import {
  type FigureBundle,
  inferPeriodFormatFromValue,
  isRollupEligibleResultsValue,
  type ResultsValue,
  type RunManifest,
} from "lib";
import { enrichMetricFromManifest } from "../run_query/mod.ts";
import { getRunManifestCached } from "./manifest_cache.ts";

// What the conversion of a stored figure's config needs of its metric, and
// where it came from: the figure's own package, another package of the
// instance that holds the metric, or, where none does, the figure's bundle.
export type FigureConversionMetric = {
  valueProps: readonly string[];
  canRollUp: boolean;
  yearly: boolean;
  source: "ownPackage" | "otherPackage" | "bundle";
};

// One package's metrics whose results object has data, as the app reads them.
// A metric row the app cannot read is left out with the rest.
export type PackageMetrics = {
  runId: string;
  createdAt: string;
  metrics: ReadonlyMap<string, ResultsValue>;
};

export function packageMetricsOf(
  manifest: Pick<
    RunManifest,
    "runId" | "createdAt" | "metrics" | "resultsObjects"
  >,
): PackageMetrics {
  const objects = new Map(manifest.resultsObjects.map((r) => [r.id, r]));
  const metrics = new Map<string, ResultsValue>();
  for (const metric of manifest.metrics) {
    const ro = objects.get(metric.results_object_id);
    if (ro === undefined || !ro.hasParquet) continue;
    try {
      metrics.set(metric.id, enrichMetricFromManifest(metric, ro));
    } catch {
      continue;
    }
  }
  return { runId: manifest.runId, createdAt: manifest.createdAt, metrics };
}

// The metric data of a stored figure, from the instance's packages: its own
// package's metric, else the newest other package that holds the metric, else
// the bundle's value props, yearly when its date range is in years, and a
// roll-up kept, since without the metric nothing says it cannot be totalled.
export function figureConversionMetric(
  packages: readonly PackageMetrics[],
  bundle: Pick<
    FigureBundle,
    "provenance" | "metricId" | "resultsValue" | "dateRange"
  >,
): FigureConversionMetric {
  const of = (
    metric: ResultsValue,
    source: FigureConversionMetric["source"],
  ) => ({
    valueProps: metric.valueProps,
    canRollUp: isRollupEligibleResultsValue(metric),
    yearly: metric.mostGranularTimePeriodColumnInResultsFile === "year",
    source,
  });
  const own = packages.find((p) => p.runId === bundle.provenance.runId)
    ?.metrics.get(bundle.metricId);
  if (own !== undefined) return of(own, "ownPackage");
  const other = packages
    .filter((p) =>
      p.runId !== bundle.provenance.runId && p.metrics.has(bundle.metricId)
    )
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0]
    ?.metrics.get(bundle.metricId);
  if (other !== undefined) return of(other, "otherPackage");
  return {
    valueProps: bundle.resultsValue.valueProps,
    canRollUp: true,
    yearly: bundle.dateRange !== undefined &&
      inferPeriodFormatFromValue(bundle.dateRange.max) === "year",
    source: "bundle",
  };
}

// Every readable package of the instance, each manifest read once. A package
// whose manifest cannot be read is left out, so its figures take another
// package's metric or their bundle's.
export async function loadPackageMetrics(
  runIds: readonly string[],
): Promise<PackageMetrics[]> {
  const out: PackageMetrics[] = [];
  for (const runId of runIds) {
    let manifest: RunManifest;
    try {
      manifest = await getRunManifestCached(runId);
    } catch {
      continue;
    }
    out.push(packageMetricsOf(manifest));
  }
  return out;
}
