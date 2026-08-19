import {
  formatReplicantLabelForDisplay,
  getDisaggregationLabel,
  getFetchConfigFromPresentationObjectConfig,
  getReplicateByProp,
  inferPeriodFormatFromValue,
  type MetricWithStatus,
  type PeriodBounds,
  type PresentationObjectConfig,
  VIZ_TYPE_CONFIG,
} from "lib";
import type { ClientAIToolEnv } from "../../client_env";

// Renders a figure's stored config + the options needed to edit it, so the AI
// can read back exactly what a figure shows (incl. the active replicant and the
// per-dimension display slots) and patch it via update_figure. Reads the
// injected dimension-label config for display labels — not pure, but
// slide-agnostic (reusable for reports).
// `shownDateRange` is the FigureBundle's dateRange — the period range of the
// items the figure actually displays, frozen at the last resolve. Callers hold
// the bundle; pass bundle.dateRange (undefined when unresolved).
export async function formatFigureConfigForAI(
  env: ClientAIToolEnv,
  metric: MetricWithStatus | undefined,
  config: PresentationObjectConfig,
  shownDateRange: PeriodBounds | undefined,
): Promise<string> {
  const lines: string[] = [];
  lines.push(`Metric: ${metric?.id ?? "(unknown)"} · Type: ${config.d.type}`);

  const replicateBy = getReplicateByProp(config);

  if (config.d.disaggregateBy.length > 0) {
    lines.push("Disaggregations:");
    for (const dis of config.d.disaggregateBy) {
      const isRep = replicateBy === dis.disOpt;
      lines.push(
        `  - ${dis.disOpt} → ${dis.disDisplayOpt}${
          isRep ? " (REPLICANT)" : ""
        }`,
      );
    }
  }

  if (config.d.filterBy.length > 0) {
    lines.push("Filters:");
    for (const f of config.d.filterBy) {
      lines.push(`  - ${f.disOpt}: ${f.values.join(", ")}`);
    }
  }

  if (replicateBy) {
    lines.push(`Replicate by: ${replicateBy}`);
    lines.push(
      `Selected replicant: ${
        config.d.selectedReplicantValue ?? "(none — INVALID, must set)"
      }`,
    );
    if (metric) {
      const resOpts = getFetchConfigFromPresentationObjectConfig(
        metric,
        config,
        {
          excludeReplicantFilter: true,
        },
      );
      if (resOpts.success) {
        const optRes = await env.getReplicantOptions(
          metric.id,
          replicateBy,
          resOpts.data,
        );
        if (optRes.success && optRes.data.status === "ok") {
          lines.push(
            `Available replicant values: ${
              optRes.data.possibleValues.map((v) =>
                `${v.id} (${
                  formatReplicantLabelForDisplay(
                    v.label,
                    replicateBy,
                    undefined,
                  )
                })`
              ).join(", ")
            }`,
          );
        } else if (optRes.success) {
          lines.push(`Available replicant values: (${optRes.data.status})`);
        }
      }
    }
  }

  if (config.d.valuesFilter && config.d.valuesFilter.length > 0) {
    lines.push(`Values filter: ${config.d.valuesFilter.join(", ")}`);
  } else {
    lines.push("Values filter: (showing all)");
  }
  if (metric) {
    lines.push(`Available value properties: ${metric.valueProps.join(", ")}`);
  }

  // The value dimension occupies a display slot only when >1 value prop is shown;
  // surface it so the AI doesn't collide a disaggregation with it unknowingly.
  if (metric) {
    const shownValueProps = config.d.valuesFilter?.length
      ? config.d.valuesFilter
      : metric.valueProps;
    if (shownValueProps.length > 1) {
      lines.push(`Values display slot: ${config.d.valuesDisDisplayOpt}`);
    }
  }

  if (config.d.periodFilter) {
    const pf = config.d.periodFilter;
    if (pf.filterType === "custom") {
      lines.push(
        `Period filter: ${
          inferPeriodFormatFromValue(pf.min) ?? "unknown"
        } from ${pf.min} to ${pf.max}`,
      );
    } else {
      // Non-custom filters resolve against LIVE data at query time —
      // from_month discards its stored max ("to present"), relative types
      // re-anchor. A figure's items are frozen at the last resolve, so print
      // both truths: the filter's meaning and the range actually shown.
      if (pf.filterType === "from_month") {
        lines.push(
          `Period filter: from ${pf.min} to present (the upper bound extends automatically as new data lands; the stored max is ignored)`,
        );
      } else {
        lines.push(`Period filter: ${pf.filterType}`);
      }
      if (shownDateRange) {
        lines.push(
          `  Data currently shown: ${shownDateRange.min} to ${shownDateRange.max} (frozen at the figure's last refresh; re-anchors on the next edit)`,
        );
      }
    }
  }

  lines.push(`Caption: ${config.t.caption || "(empty)"}`);
  lines.push(`Sub-caption: ${config.t.subCaption || "(empty)"}`);
  lines.push(`Footnote: ${config.t.footnote || "(empty)"}`);

  if (metric) {
    lines.push("Available dimensions:");
    for (const opt of metric.disaggregationOptions) {
      const label = getDisaggregationLabel(
        opt.value,
        env.getDimensionLabelConfig(metric.datasetFamily),
      ).en;
      lines.push(
        `  - ${opt.value}: ${label}${opt.isRequired ? " (required)" : ""}`,
      );
    }
  }
  const validSlots =
    VIZ_TYPE_CONFIG[config.d.type].disaggregationDisplayOptions;
  lines.push(
    `Valid display slots for ${config.d.type}: ${validSlots.join(", ")}`,
  );

  return lines.join("\n");
}
