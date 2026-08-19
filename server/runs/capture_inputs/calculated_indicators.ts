import type { CalculatedIndicator } from "lib";

// The calculated_indicators_snapshot row shape (denormalized denom) — the
// shape the HMIS capture writes into the run's input JSON.
export function calculatedIndicatorToSnapshotRow(ci: CalculatedIndicator): {
  calculated_indicator_id: string;
  label: string;
  group_label: string;
  sort_order: number;
  num_indicator_id: string;
  denom_kind: string;
  denom_indicator_id: string | null;
  denom_population_type: string | null;
  denom_population_multiplier: number | null;
  format_as: string;
  threshold_direction: string;
  threshold_green: number;
  threshold_yellow: number;
} {
  return {
    calculated_indicator_id: ci.calculated_indicator_id,
    label: ci.label,
    group_label: ci.group_label,
    sort_order: ci.sort_order,
    num_indicator_id: ci.num_indicator_id,
    denom_kind: ci.denom.kind,
    denom_indicator_id: ci.denom.kind === "indicator" ? ci.denom.indicator_id : null,
    denom_population_type:
      ci.denom.kind === "population" ? ci.denom.population_type : null,
    denom_population_multiplier:
      ci.denom.kind === "population" ? ci.denom.multiplier : null,
    format_as: ci.format_as,
    threshold_direction: ci.threshold_direction,
    threshold_green: ci.threshold_green,
    threshold_yellow: ci.threshold_yellow,
  };
}
