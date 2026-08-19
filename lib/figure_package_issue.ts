import { getReplicateByProp } from "./get_disaggregator_display_prop.ts";
import type { DisaggregationOption } from "./types/disaggregation_options.ts";
import type { PresentationObjectConfig } from "./types/_presentation_object_config.ts";
import type { MetricWithStatus } from "./types/modules.ts";
import type { FigurePackageIssue } from "./types/run_generation.ts";
import type { RunManifest } from "./types/run_manifest.ts";

// Why one figure will not resolve under a package (D4). Manifest lookups
// only, no data queries — every fact needed is stamped at finalize (§2.2),
// which is what lets this run on the client against a cached manifest
// projection as easily as on the server.
//
// Reattach never blocks (D5: a product points at one package and the user
// updates figures one by one or all), so this is a per-figure REASON shown on
// the figure, never a pre-flight report over a whole authored set.

// Every dimension a stored config asks the package for: grouping, filtering
// and replication all resolve against the same per-results-object option list
// the read path uses.
export function requestedDisaggregationOptions(
  config: PresentationObjectConfig,
): DisaggregationOption[] {
  const replicateBy = getReplicateByProp(config);
  return [
    ...new Set([
      ...config.d.disaggregateBy.map((d) => d.disOpt),
      ...config.d.filterBy.map((f) => f.disOpt),
      ...(replicateBy === undefined ? [] : [replicateBy]),
    ]),
  ];
}

// Resolution order — a missing metric makes its availability stamp and its
// dimensions unanswerable, so the first thing that fails is what gets
// reported. null = the figure resolves.
export function figurePackageIssueFor(
  metricId: string,
  config: PresentationObjectConfig,
  manifest: RunManifest,
): FigurePackageIssue | null {
  const metric = manifest.metrics.find((m) => m.id === metricId);
  if (metric === undefined) {
    return { kind: "metric_not_in_package", metricId };
  }

  const availability = manifest.metricAvailability.find(
    (a) => a.metricId === metricId,
  );
  if (availability !== undefined && availability.status === "unavailable") {
    return {
      kind: "metric_unavailable",
      metricId,
      reason: availability.reason,
    };
  }

  // A metric whose results object carries no query parquet offers no
  // dimensions at all, which is exactly what an empty option list says — the
  // same conclusion the read path reaches, so no special case here.
  const ro = manifest.resultsObjects.find(
    (r) => r.id === metric.results_object_id,
  );
  const available = new Set<string>(ro?.availableDisaggregationOptions ?? []);
  const missing = requestedDisaggregationOptions(config).filter(
    (disOpt) => !available.has(disOpt),
  );
  if (missing.length > 0) {
    return {
      kind: "dimensions_not_in_package",
      disaggregationOptions: missing,
      datasetFamily: metric.datasetFamily ?? undefined,
    };
  }

  return null;
}

// The same three answers from the AUTHORING CONTEXT instead of the manifest —
// what the client actually holds. `getRunAuthoringContext` is a projection of
// the manifest, and `MetricWithStatus` already carries the availability stamp
// and the results object's disaggregation options, so the two agree by
// construction rather than by a second implementation of the rule.
//
// `metrics` is the target package's context, so a metric absent from the array
// is a metric absent from the package. Same resolution order as above.
export function figurePackageIssueForMetrics(
  metricId: string,
  config: PresentationObjectConfig,
  metrics: MetricWithStatus[],
): FigurePackageIssue | null {
  const metric = metrics.find((m) => m.id === metricId);
  if (metric === undefined) {
    return { kind: "metric_not_in_package", metricId };
  }

  if (metric.status === "unavailable") {
    return {
      kind: "metric_unavailable",
      metricId,
      reason: metric.statusReason ?? null,
    };
  }

  const available = new Set<string>(
    metric.disaggregationOptions.map((d) => d.value),
  );
  const missing = requestedDisaggregationOptions(config).filter(
    (disOpt) => !available.has(disOpt),
  );
  if (missing.length > 0) {
    return {
      kind: "dimensions_not_in_package",
      disaggregationOptions: missing,
      datasetFamily: metric.datasetFamily ?? undefined,
    };
  }

  return null;
}
