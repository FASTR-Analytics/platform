import {
  getDisaggregationLabel,
  getFetchConfigFromPresentationObjectConfig,
  getReplicateByProp,
  inferPeriodFormatFromValue,
  periodFilterHasBounds,
  type MetricWithStatus,
  type PresentationObjectConfig,
} from "lib";
import { VALID_DIS_DISPLAY } from "~/generate_visualization/mod";
import { getReplicantOptionsFromCacheOrFetch } from "~/state/project/t2_replicant_options";
import { instanceState } from "~/state/instance/t1_store";

// Renders a figure's stored config + the options needed to edit it, so the AI
// can read back exactly what a figure shows (incl. the active replicant and the
// per-dimension display slots) and patch it via update_figure. Reads instance
// state for dimension labels — not pure, but slide-agnostic (reusable for
// reports).
export async function formatFigureConfigForAI(
  projectId: string,
  metric: MetricWithStatus | undefined,
  config: PresentationObjectConfig,
): Promise<string> {
  const lines: string[] = [];
  lines.push(`Metric: ${metric?.id ?? "(unknown)"} · Type: ${config.d.type}`);

  const replicateBy = getReplicateByProp(config);

  if (config.d.disaggregateBy.length > 0) {
    lines.push("Disaggregations:");
    for (const dis of config.d.disaggregateBy) {
      const isRep = replicateBy === dis.disOpt;
      lines.push(`  - ${dis.disOpt} → ${dis.disDisplayOpt}${isRep ? " (REPLICANT)" : ""}`);
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
      `Selected replicant: ${config.d.selectedReplicantValue ?? "(none — INVALID, must set)"}`,
    );
    if (metric) {
      const resOpts = getFetchConfigFromPresentationObjectConfig(metric, config, {
        excludeReplicantFilter: true,
      });
      if (resOpts.success) {
        const optRes = await getReplicantOptionsFromCacheOrFetch(
          projectId,
          metric.resultsObjectId,
          replicateBy,
          resOpts.data,
        );
        if (optRes.success && optRes.data.status === "ok") {
          lines.push(
            `Available replicant values: ${optRes.data.possibleValues.map((v) => `${v.id} (${v.label})`).join(", ")}`,
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
    if (periodFilterHasBounds(pf)) {
      lines.push(
        `Period filter: ${inferPeriodFormatFromValue(pf.min) ?? "unknown"} from ${pf.min} to ${pf.max}`,
      );
    } else {
      lines.push(`Period filter: ${pf.filterType}`);
    }
  }

  lines.push(`Caption: ${config.t.caption || "(empty)"}`);
  lines.push(`Sub-caption: ${config.t.subCaption || "(empty)"}`);
  lines.push(`Footnote: ${config.t.footnote || "(empty)"}`);

  if (metric) {
    lines.push("Available dimensions:");
    for (const opt of metric.disaggregationOptions) {
      const label = getDisaggregationLabel(opt.value, {
        adminAreaLabels: instanceState.adminAreaLabels,
        facilityColumns: instanceState.facilityColumns,
      }).en;
      lines.push(`  - ${opt.value}: ${label}${opt.isRequired ? " (required)" : ""}`);
    }
  }
  const validSlots = VALID_DIS_DISPLAY[config.d.type];
  if (validSlots) {
    lines.push(`Valid display slots for ${config.d.type}: ${validSlots.join(", ")}`);
  }

  return lines.join("\n");
}
