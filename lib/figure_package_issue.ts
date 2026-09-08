import { getReplicateByProp } from "./get_disaggregator_display_prop.ts";
import type { DisaggregationOption } from "./types/disaggregation_options.ts";
import type { PresentationObjectConfig } from "./types/_presentation_object_config.ts";
import type { DatasetType } from "./types/datasets.ts";
import type { MetricWithStatus } from "./types/modules.ts";
import type { RunManifest } from "./types/run_manifest.ts";

// Why one figure will not resolve under a package (PLAN_PRODUCTS_RESTRUCTURE
// D4). Manifest lookups only, no data queries: every fact needed is stamped
// at finalize, which is what lets the same rule run on the client against
// the authoring context (a manifest projection) as on the server against the
// manifest itself. Resolution order: a missing metric makes its availability
// stamp and its dimensions unanswerable, so the first thing that fails is
// what gets reported. null = the figure resolves.

export type FigurePackageIssue =
  | { kind: "metric_not_in_package"; metricId: string }
  | { kind: "metric_unavailable"; metricId: string; reason: string | null }
  | {
    kind: "dimensions_not_in_package";
    disaggregationOptions: DisaggregationOption[];
    // Labels the missing dimensions with the owning family's column labels.
    datasetFamily?: DatasetType;
  };

// Every dimension a stored config asks the package for: grouping, filtering
// and replication all resolve against the same per-results-object option
// list the read path uses.
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

export function figurePackageIssueForDimensions(
  metricId: string,
  requested: DisaggregationOption[],
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
    return { kind: "metric_unavailable", metricId, reason: availability.reason };
  }

  // A metric whose results object carries no query parquet offers no
  // dimensions at all, which is exactly what an empty option list says: the
  // same conclusion the read path reaches, so no special case here.
  const ro = manifest.resultsObjects.find(
    (r) => r.id === metric.results_object_id,
  );
  return missingDimensions(
    requested,
    ro?.availableDisaggregationOptions ?? [],
    metric.datasetFamily ?? undefined,
  );
}

export function figurePackageIssueFor(
  metricId: string,
  config: PresentationObjectConfig,
  manifest: RunManifest,
): FigurePackageIssue | null {
  return figurePackageIssueForDimensions(
    metricId,
    requestedDisaggregationOptions(config),
    manifest,
  );
}

// The same answer from the authoring context instead of the manifest, which
// is what the client holds. `MetricWithStatus` carries the availability
// stamp and the results object's option list, so the two entry points agree
// by construction. A metric absent from `metrics` is absent from the package.
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
  return missingDimensions(
    requestedDisaggregationOptions(config),
    metric.disaggregationOptions.map((d) => d.value),
    metric.datasetFamily,
  );
}

function missingDimensions(
  requested: DisaggregationOption[],
  available: readonly string[],
  datasetFamily: DatasetType | undefined,
): FigurePackageIssue | null {
  const availableSet = new Set<string>(available);
  const missing = requested.filter((disOpt) => !availableSet.has(disOpt));
  if (missing.length === 0) return null;
  return { kind: "dimensions_not_in_package", disaggregationOptions: missing, datasetFamily };
}
