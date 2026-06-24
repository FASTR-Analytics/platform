import type { FigureBundle, MetricWithStatus, PresentationObjectConfig } from "lib";
import { getFetchConfigFromPresentationObjectConfig, getReplicateByProp } from "lib";
import { getReplicantOptionsFromCacheOrFetch } from "~/state/project/t2_replicant_options";
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

  const replicateBy = getReplicateByProp(config);
  if (replicateBy) {
    // Options query needs the auto-pin EXCLUDED so it returns all in-scope
    // values to validate against; the items fetch keeps the pinned config.
    const resOptions = getFetchConfigFromPresentationObjectConfig(metric, config, {
      excludeReplicantFilter: true,
    });
    if (!resOptions.success) {
      throw new Error(resOptions.err);
    }
    const optRes = await getReplicantOptionsFromCacheOrFetch(
      projectId,
      metric.resultsObjectId,
      replicateBy,
      resOptions.data,
    );
    if (optRes.success && optRes.data.status === "ok") {
      const valid = optRes.data.possibleValues;
      const selected = config.d.selectedReplicantValue;
      if (!selected) {
        throw new Error(
          `This figure replicates by "${replicateBy}" and needs a selectedReplicantValue. `
          + `Valid values: ${valid.map((v) => v.label).join(", ")}`,
        );
      }
      if (!valid.some((v) => v.id === selected)) {
        throw new Error(
          `Invalid replicant value "${selected}" for metric "${metric.id}". `
          + `Valid values: ${valid.map((v) => v.label).join(", ")}`,
        );
      }
    }
  }

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
