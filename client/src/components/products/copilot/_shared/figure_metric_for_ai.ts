import {
  type FigureMetricResolution,
  type MetricWithStatus,
  type PresentationObjectConfig,
  resolveFigureMetric,
  type StoredFigure,
} from "lib";
import { AIToolFailure } from "panther";

// What the model is told about a stored figure whose metric is not the
// package's own (lib/retired_metrics.ts): a read prints it above the figure's
// config, an edit refuses with it or reports the move in its success message.

type FigureMetricForAI<M> = {
  lines: string[];
  metric: M;
  config: PresentationObjectConfig;
};

function absenceLine(
  absence: Extract<FigureMetricResolution, { kind: "absent" }>,
): string {
  if (absence.retired === undefined) {
    return `Metric "${absence.metricId}" is not in this product's results package.`;
  }
  const { metric, successor } = absence.retired;
  return `Metric "${absence.metricId}" (${metric.label.en}) belongs to the retired module ${metric.moduleId}; its replacement, ${successor.metricId} (module ${successor.moduleId}), is not in this product's results package.`;
}

function movedLine(
  succeeded: Extract<FigureMetricResolution, { kind: "succeeded" }>,
  tail: string,
): string {
  const { retired, metric } = succeeded;
  return `Metric "${retired.id}" (${retired.label.en}) was retired with module ${retired.moduleId}; ${tail} ${metric.id} (${metric.label})`;
}

export function readFigureMetricForAI(
  metrics: readonly MetricWithStatus[],
  figure: StoredFigure,
): FigureMetricForAI<MetricWithStatus | undefined> {
  const r = resolveFigureMetric(metrics, figure);
  if (r.kind === "absent") {
    return {
      lines: [absenceLine(r)],
      metric: undefined,
      config: figure.config,
    };
  }
  return {
    lines: r.kind === "current" ? [] : [
      movedLine(r, "in this package the figure reads as") +
      ", and an edit stores it so.",
    ],
    metric: r.metric,
    config: r.config,
  };
}

export function editFigureMetricForAI(
  metrics: readonly MetricWithStatus[],
  figure: StoredFigure,
): FigureMetricForAI<MetricWithStatus> {
  const r = resolveFigureMetric(metrics, figure);
  if (r.kind === "absent") throw new AIToolFailure(absenceLine(r));
  return {
    lines: r.kind === "current"
      ? []
      : [movedLine(r, "this edit stored the figure as") + "."],
    metric: r.metric,
    config: r.config,
  };
}
