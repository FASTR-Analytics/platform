import type { FigureBundle, MetricWithStatus, PresentationObjectConfig } from "lib";
import { getFetchConfigFromPresentationObjectConfig } from "lib";
import { assertReplicantValid } from "./assert_replicant_valid";
import { resolveFigureBundleFromMetric } from "./resolve_figure_from_metric";

// Unified figure resolver: given a metric + a full config, validate the
// replicant (strict — throw with the valid-value list, matching the from_metric
// policy), then re-query items and build a FigureBundle. Slide-agnostic — used by
// the from_metric create path and the update_figure edit path. Re-resolution
// keys off the metric (the bundle stores `metricId`), never the source viz.
export async function resolveBundleFromMetricAndConfig(
  projectId: string,
  metric: MetricWithStatus,
  config: PresentationObjectConfig,
): Promise<FigureBundle> {
  if (metric.status !== "ready") {
    throw new Error(`Metric "${metric.id}" is not ready (status: ${metric.status})`);
  }

  const resFetch = getFetchConfigFromPresentationObjectConfig(metric, config);
  if (!resFetch.success) {
    throw new Error(resFetch.err);
  }

  // Strict replicant validation (shared with the from_visualization AI path).
  await assertReplicantValid(projectId, metric, config);

  return resolveFigureBundleFromMetric(
    projectId,
    {
      metricId: metric.id,
      resultsObjectId: metric.resultsObjectId,
      mostGranularTimePeriodColumnInResultsFile: metric.mostGranularTimePeriodColumnInResultsFile,
      moduleLastRun: "", // matches the current from_metric adapter; provenance is informational
      resultsValueForViz: {
        formatAs: metric.formatAs,
        valueProps: metric.valueProps,
        valueLabelReplacements: metric.valueLabelReplacements,
      },
      fetchConfig: resFetch.data,
    },
    config,
  );
}
