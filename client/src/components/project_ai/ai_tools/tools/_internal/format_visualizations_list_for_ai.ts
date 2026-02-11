import type { PresentationObjectSummary } from "lib";

export function formatVisualizationsListForAI(
  visualizations: PresentationObjectSummary[],
): string {
  const lines: string[] = [
    "AVAILABLE VISUALIZATIONS",
    "=".repeat(80),
    "",
  ];

  if (visualizations.length === 0) {
    lines.push("No visualizations available.");
    lines.push(
      "Visualizations become available after their modules have successfully run.",
    );
    return lines.join("\n");
  }

  lines.push(
    "Use get_visualization_data with a visualization ID to get the underlying data.",
  );
  lines.push("");

  for (const viz of visualizations) {
    lines.push(`ID: ${viz.id}`);
    lines.push(`Name: ${viz.label}`);
    lines.push(`Metric ID: ${viz.metricId}`);
    if (viz.replicateBy) {
      lines.push(`Replicate by: ${viz.replicateBy}`);
    }
    if (viz.isFiltered) {
      lines.push(`Filtered: yes`);
    }
    lines.push(
      `Status: ${viz.createdByAI ? "AI-created (editable)" : viz.isDefault ? "Default (read-only)" : "Custom (read-only)"}`,
    );
    lines.push("");
  }

  return lines.join("\n");
}
