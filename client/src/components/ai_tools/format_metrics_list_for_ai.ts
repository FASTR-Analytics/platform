import type { MetricWithStatus } from "lib";

export function formatMetricsListForAI(metrics: MetricWithStatus[]): string {
  const lines: string[] = [
    "AVAILABLE METRICS",
    "=".repeat(80),
    "",
    "Each metric can be queried using get_metric_data with metricId.",
    "Required disaggregations are automatically included. Optional ones can be added for more detail.",
    "",
    "PERIOD OPTIONS (for disaggregation and filtering):",
    "  - period_id (YYYYMM): By specific month. Examples: 202301 (Jan 2023), 202412 (Dec 2024)",
    "  - quarter_id (YYYYQ): By specific quarter. Examples: 20231 (Q1 2023), 20244 (Q4 2024)",
    "  - year (YYYY): By year. Examples: 2023, 2024",
    "  - month (1-12): By month-of-year for seasonal patterns. Examples: 1 (all Januaries), 12 (all Decembers)",
    "",
  ];

  // Filter to only ready metrics
  const readyMetrics = metrics.filter(m => m.status === "ready");

  if (readyMetrics.length === 0) {
    lines.push("No metrics available.");
    return lines.join("\n");
  }

  // Group metrics by moduleId
  const metricsByModule = new Map<string, MetricWithStatus[]>();
  for (const metric of readyMetrics) {
    const existing = metricsByModule.get(metric.moduleId) ?? [];
    existing.push(metric);
    metricsByModule.set(metric.moduleId, existing);
  }

  for (const [moduleId, moduleMetrics] of metricsByModule) {
    lines.push(`MODULE: ${moduleId}`);
    lines.push("-".repeat(60));

    // Group by label within module
    const metricGroups = new Map<string, MetricWithStatus[]>();
    for (const metric of moduleMetrics) {
      const existing = metricGroups.get(metric.label) ?? [];
      existing.push(metric);
      metricGroups.set(metric.label, existing);
    }

    for (const [label, variants] of metricGroups) {
      const firstVariant = variants[0];

      if (variants.length === 1 && !firstVariant.variantLabel) {
        // Single metric without variants
        lines.push(`  METRIC: ${label}`);
        lines.push(`    ID: ${firstVariant.id}`);
        lines.push(`    Format: ${firstVariant.formatAs}`);

        if (firstVariant.valueProps.length > 0) {
          lines.push(`    Value properties:`);
          for (const prop of firstVariant.valueProps) {
            const propLabel = firstVariant.valueLabelReplacements?.[prop] || prop;
            lines.push(`      - ${prop}: ${propLabel}`);
          }
        }

        if (firstVariant.aiDescription?.summary) {
          lines.push(`    Summary: ${getAIStr(firstVariant.aiDescription.summary)}`);
        }
        if (firstVariant.aiDescription?.methodology) {
          lines.push(`    Methodology: ${getAIStr(firstVariant.aiDescription.methodology)}`);
        }
        if (firstVariant.aiDescription?.interpretation) {
          lines.push(`    Interpretation: ${getAIStr(firstVariant.aiDescription.interpretation)}`);
        }
        if (firstVariant.aiDescription?.typicalRange) {
          lines.push(`    Typical range: ${getAIStr(firstVariant.aiDescription.typicalRange)}`);
        }
        if (firstVariant.aiDescription?.caveats) {
          lines.push(`    Caveats: ${getAIStr(firstVariant.aiDescription.caveats)}`);
        }
        if (firstVariant.aiDescription?.disaggregationGuidance) {
          lines.push(`    Disaggregation guidance: ${getAIStr(firstVariant.aiDescription.disaggregationGuidance)}`);
        }

        const required = firstVariant.disaggregationOptions.filter(opt => opt.isRequired);
        const optional = firstVariant.disaggregationOptions.filter(opt => !opt.isRequired);

        if (required.length > 0) {
          lines.push(`    Automatically disaggregated by: ${required.map(opt => opt.value).join(", ")}`);
        }

        if (optional.length > 0) {
          lines.push(`    Optional additional disaggregations:`);
          for (const opt of optional) {
            lines.push(`      - ${opt.value} (${getAIStr(opt.label)})`);
          }
        }

        lines.push(`    Period options: ${firstVariant.periodOptions.join(", ")}`);
        lines.push("");
      } else {
        // Multiple variants or has variantLabel - use grouped format
        lines.push(`  METRIC: ${label}`);
        lines.push(`    Format: ${firstVariant.formatAs}`);

        if (firstVariant.valueProps.length > 0) {
          lines.push(`    Value properties:`);
          for (const prop of firstVariant.valueProps) {
            const propLabel = firstVariant.valueLabelReplacements?.[prop] || prop;
            lines.push(`      - ${prop}: ${propLabel}`);
          }
        }

        if (firstVariant.aiDescription?.summary) {
          lines.push(`    Summary: ${getAIStr(firstVariant.aiDescription.summary)}`);
        }
        if (firstVariant.aiDescription?.methodology) {
          lines.push(`    Methodology: ${getAIStr(firstVariant.aiDescription.methodology)}`);
        }
        if (firstVariant.aiDescription?.interpretation) {
          lines.push(`    Interpretation: ${getAIStr(firstVariant.aiDescription.interpretation)}`);
        }
        if (firstVariant.aiDescription?.typicalRange) {
          lines.push(`    Typical range: ${getAIStr(firstVariant.aiDescription.typicalRange)}`);
        }
        if (firstVariant.aiDescription?.caveats) {
          lines.push(`    Caveats: ${getAIStr(firstVariant.aiDescription.caveats)}`);
        }
        if (firstVariant.aiDescription?.disaggregationGuidance) {
          lines.push(`    Disaggregation guidance: ${getAIStr(firstVariant.aiDescription.disaggregationGuidance)}`);
        }

        lines.push(`    Period options: ${firstVariant.periodOptions.join(", ")}`);
        lines.push("");
        lines.push(`    Available at:`);

        for (const variant of variants) {
          const variantName = variant.variantLabel || "Default";
          lines.push(`      - ${variantName} (ID: ${variant.id})`);

          const required = variant.disaggregationOptions.filter(opt => opt.isRequired);
          const optional = variant.disaggregationOptions.filter(opt => !opt.isRequired);

          if (required.length > 0) {
            lines.push(`        Automatically disaggregated by: ${required.map(opt => opt.value).join(", ")}`);
          }

          if (optional.length > 0) {
            lines.push(`        Optional: ${optional.map(opt => opt.value).join(", ")}`);
          }

          lines.push("");
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
