import type { MetricWithStatus } from "lib";
import { getMetricStaticData } from "lib";

export function formatMetricsListForAI(metrics: MetricWithStatus[]): string {
  const lines: string[] = [
    "AVAILABLE METRICS",
    "=".repeat(80),
    "",
    "Query with get_metric_data for data and detailed context.",
    "Visualize with from_metric blocks using vizPresetId.",
    "Required disaggregations are auto-included.",
    "Period formats: period_id (YYYYMM), year (YYYY), month (1-12 for seasonal).",
    "",
  ];

  const readyMetrics = metrics.filter(m => m.status === "ready");

  if (readyMetrics.length === 0) {
    lines.push("No metrics available.");
    return lines.join("\n");
  }

  const sorted = [...readyMetrics].sort((a, b) => a.id.localeCompare(b.id));

  for (const metric of sorted) {
    const staticData = getMetricStaticData(metric.id);
    const label = metric.variantLabel
      ? `${metric.label} [${metric.variantLabel}]`
      : metric.label;

    lines.push(`${metric.id}: ${label} [${metric.formatAs}]`);

    if (metric.aiDescription?.summary) {
      lines.push(`  ${getAIStr(metric.aiDescription.summary)}`);
    }

    if (staticData.importantNotes) {
      lines.push(`  NOTE: ${staticData.importantNotes}`);
    }

    if (metric.valueProps.length > 0) {
      const propStrs = metric.valueProps.map(prop => {
        const propLabel = metric.valueLabelReplacements?.[prop] || prop;
        return propLabel !== prop ? `${prop} (${propLabel})` : prop;
      });
      lines.push(`  Values: ${propStrs.join(", ")}`);
    }

    const required = metric.disaggregationOptions.filter(opt => opt.isRequired && opt.value !== "quarter_id");
    const optional = metric.disaggregationOptions.filter(opt => !opt.isRequired && opt.value !== "quarter_id");

    if (required.length > 0) {
      lines.push(`  Auto-disaggregated by: ${required.map(opt => opt.value).join(", ")}`);
    }

    if (optional.length > 0) {
      lines.push(`  Optional disaggregations: ${optional.map(opt => opt.value).join(", ")}`);
    }

    if (staticData.vizPresets && staticData.vizPresets.length > 0) {
      lines.push(`  Visualization presets:`);
      for (const preset of staticData.vizPresets) {
        const dateFormat = preset.config.d.periodOpt === "year" ? "YYYY" : "YYYYMM";
        const filterNote = preset.allowedFilters && preset.allowedFilters.length > 0
          ? ` — filters: ${preset.allowedFilters.join(", ")}`
          : "";
        const replicantNote = preset.needsReplicant ? " ** REQUIRES selectedReplicant **" : "";
        lines.push(`    - ${preset.id}: ${preset.label.en} (${dateFormat})${filterNote}${replicantNote}`);
        if (preset.importantNotes) {
          lines.push(`      NOTE: ${getAIStr(preset.importantNotes)}`);
        }
      }
    }

    lines.push("");
  }

  return lines.join("\n");
}

function getAIStr(val: string | { en: string; fr?: string }): string {
  if (typeof val === "string") return val;
  return val.en;
}
