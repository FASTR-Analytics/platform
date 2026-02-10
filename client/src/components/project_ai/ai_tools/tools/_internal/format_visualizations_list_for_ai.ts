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
    "Use from_visualization blocks with a visualization ID to include in slides.",
  );
  lines.push(
    "Use get_visualization_data to see the underlying data.",
  );
  lines.push("");

  for (const viz of visualizations) {
    const status = viz.createdByAI ? "AI-created, editable" : viz.isDefault ? "default, read-only" : "custom, read-only";
    const replicateNote = viz.replicateBy ? `, replicate by: ${viz.replicateBy}` : "";
    lines.push(`${viz.id}: ${viz.label} (${viz.type}, metric: ${viz.metricId}${replicateNote}) [${status}]`);

    if (viz.disaggregateBy && viz.disaggregateBy.length > 0) {
      lines.push(`  Disaggregated by: ${viz.disaggregateBy.join(", ")}`);
    }

    if (viz.filterBy && viz.filterBy.length > 0) {
      const filterStrs = viz.filterBy.map(f => `${f.col} = ${f.vals.join(", ")}`);
      lines.push(`  Filtered by: ${filterStrs.join("; ")}`);
    }

    lines.push("");
  }

  return lines.join("\n");
}
