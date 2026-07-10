import type { DisaggregationOption, InstanceConfigFacilityColumns } from "lib";
import {
  getEnabledFacilityDisaggregationOptions,
  PHYSICAL_DISAGGREGATION_COLUMNS,
} from "../db/project/metric_enricher.ts";

// Pure twin of the enricher's probe loop (buildDisaggregationOptions in
// metric_enricher.ts): derives the available disaggregation options from a
// known column set instead of live probes. Shares the enricher's own column
// lists so the two paths cannot drift; the parity rig diffs their outputs
// end-to-end. Ordering matches the enricher exactly (UI list order).
export function deriveAvailableDisaggregationOptions(
  columnNames: Set<string>,
  facilityConfig: InstanceConfigFacilityColumns,
): DisaggregationOption[] {
  const out: DisaggregationOption[] = [];
  for (const disOpt of PHYSICAL_DISAGGREGATION_COLUMNS) {
    if (columnNames.has(disOpt)) {
      out.push(disOpt);
    }
  }
  if (columnNames.has("facility_id")) {
    out.push(...getEnabledFacilityDisaggregationOptions(facilityConfig));
  }
  if (columnNames.has("period_id")) {
    out.push("year", "month", "quarter_id", "period_id");
  } else if (columnNames.has("quarter_id")) {
    out.push("quarter_id", "year");
  } else if (columnNames.has("year")) {
    out.push("year");
  }
  return out;
}
