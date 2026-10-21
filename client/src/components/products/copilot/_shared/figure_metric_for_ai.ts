import type { FigureMetricResolution } from "lib";

// What the model is told about a stored figure whose metric is not the
// package's own (lib/retired_metrics.ts): the read tools print it above the
// figure's config, and the write tools refuse with it.

export function figureMetricAbsenceForAI(
  absence: Extract<FigureMetricResolution, { kind: "absent" }>,
): string {
  if (absence.retired === undefined) {
    return `Metric "${absence.metricId}" is not in this product's results package.`;
  }
  const { metric, successor } = absence.retired;
  const named =
    `Metric "${absence.metricId}" (${metric.label.en}) belongs to the retired module ${metric.moduleId}`;
  return successor === undefined
    ? `${named} and has no replacement: the figure must be replaced.`
    : `${named}; its replacement, ${successor.metricId} (module ${successor.moduleId}), is not in this product's results package.`;
}

export function figureMetricNoteForAI(
  resolution: Exclude<FigureMetricResolution, { kind: "absent" }>,
): string | undefined {
  if (resolution.kind === "current") return undefined;
  return `Metric "${resolution.retired.id}" (${resolution.retired.label.en}) was retired with module ${resolution.retired.moduleId}; in this package the figure reads as ${resolution.metric.id} (${resolution.metric.label}), and an edit stores it so.`;
}
