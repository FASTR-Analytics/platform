import {
  getDisaggregationLabel,
  periodFilterHasBounds,
  type PresentationObjectConfig,
  type ResultsValue,
} from "lib";
import { instanceState } from "~/state/instance/t1_store";

export function formatVizEditorForAI(
  config: PresentationObjectConfig,
  resultsValue: ResultsValue,
  vizId: string | undefined,
  dataOutput: string,
): string {
  const lines: string[] = [];

  lines.push("# VISUALIZATION");
  lines.push("=".repeat(80));
  lines.push("");
  if (vizId) {
    lines.push(`**ID:** ${vizId}`);
  }
  if (config.t.caption) {
    lines.push(`**Caption:** ${config.t.caption}`);
  }
  lines.push("");

  lines.push("## CURRENT CONFIGURATION");
  lines.push("=".repeat(50));
  lines.push("");
  lines.push(`Presentation type: ${config.d.type}`);
  if (config.d.timeseriesGrouping) {
    lines.push(`Timeseries grouping: ${config.d.timeseriesGrouping}`);
  }
  lines.push("");

  if (config.d.disaggregateBy.length > 0) {
    lines.push("Disaggregations:");
    for (const dis of config.d.disaggregateBy) {
      lines.push(`  - ${dis.disOpt} displayed as: ${dis.disDisplayOpt}`);
    }
    lines.push("");
  }

  if (config.d.filterBy.length > 0) {
    lines.push("Filters:");
    for (const filter of config.d.filterBy) {
      lines.push(`  - ${filter.disOpt}: ${filter.values.join(", ")}`);
    }
    lines.push("");
  }

  if (config.d.periodFilter) {
    const pf = config.d.periodFilter;
    if (periodFilterHasBounds(pf)) {
      lines.push(`Period filter: ${pf.periodOption} from ${pf.min} to ${pf.max}`);
    } else {
      const nPart =
        pf.filterType === "last_n_months" ? `${pf.nMonths} months` :
        pf.filterType === "last_n_calendar_quarters" ? `${pf.nQuarters} quarters` :
        pf.filterType === "last_n_calendar_years" ? `${pf.nYears} years` : "";
      lines.push(`Period filter: ${pf.filterType}${nPart ? " (" + nPart + ")" : ""}`);
    }
    lines.push("");
  }

  if (config.d.valuesFilter && config.d.valuesFilter.length > 0) {
    lines.push(`Values filter: ${config.d.valuesFilter.join(", ")}`);
    lines.push("");
  } else {
    lines.push("Values filter: (showing all values)");
    lines.push("");
  }

  if (config.d.valuesDisDisplayOpt) {
    lines.push(`Values display: ${config.d.valuesDisDisplayOpt}`);
    lines.push("");
  }

  lines.push(`Include national data: ${config.d.includeNationalForAdminArea2 ? "yes" : "no"}`);
  lines.push("");

  lines.push("Captions:");
  lines.push(`  Caption: ${config.t.caption || "(empty)"}`);
  lines.push(`  Sub-caption: ${config.t.subCaption || "(empty)"}`);
  lines.push(`  Footnote: ${config.t.footnote || "(empty)"}`);
  lines.push("");

  lines.push("## AVAILABLE OPTIONS");
  lines.push("=".repeat(50));
  lines.push("");

  lines.push("Value properties:");
  lines.push(`  ${resultsValue.valueProps.join(", ")}`);
  lines.push("");

  lines.push("Disaggregation dimensions:");
  for (const opt of resultsValue.disaggregationOptions) {
    const label = getDisaggregationLabel(opt.value, {
      adminAreaLabels: instanceState.adminAreaLabels,
      facilityColumns: instanceState.facilityColumns,
    }).en;
    const required = opt.isRequired ? " (required)" : "";
    lines.push(`  - ${opt.value}: ${label}${required}`);
  }
  lines.push("");

  lines.push("Period options:");
  lines.push(`  ${resultsValue.mostGranularTimePeriodColumnInResultsFile ?? "none"}`);
  lines.push("");

  lines.push("Valid display options for disaggregations:");
  if (config.d.type === "timeseries") {
    lines.push(`  For timeseries: series, cell, row, col, replicant`);
  } else if (config.d.type === "table") {
    lines.push(`  For table: row, col, rowGroup, colGroup, replicant`);
  } else if (config.d.type === "chart") {
    lines.push(`  For chart: indicator, series, cell, row, col, replicant`);
  }
  lines.push("");

  lines.push("Valid display options for values:");
  if (config.d.type === "timeseries") {
    lines.push(`  For timeseries: series, cell, row, col`);
  } else if (config.d.type === "table") {
    lines.push(`  For table: row, col, rowGroup, colGroup`);
  } else if (config.d.type === "chart") {
    lines.push(`  For chart: indicator, series, cell, row, col`);
  }
  lines.push("");

  lines.push("=".repeat(80));
  lines.push(dataOutput);

  return lines.join("\n");
}