import type { DisaggregationOption, StructureColumns } from "lib";
import {
  getEnabledFacilityDisaggregationOptions,
  PHYSICAL_DISAGGREGATION_COLUMNS,
} from "../run_query/disaggregation_columns.ts";

// Derives the available disaggregation options for a results object from its
// known column set (the run manifest's declared columns). Ordering is the UI
// list order.
export function deriveAvailableDisaggregationOptions(
  columnNames: Set<string>,
  facilityConfig: StructureColumns | undefined,
): DisaggregationOption[] {
  const out: DisaggregationOption[] = [];
  for (const disOpt of PHYSICAL_DISAGGREGATION_COLUMNS) {
    if (columnNames.has(disOpt)) {
      out.push(disOpt);
    }
  }
  if (columnNames.has("facility_id") && facilityConfig) {
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
