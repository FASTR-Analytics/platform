import { Sql } from "postgres";
import type { CalculatedIndicator, PopulationType } from "lib";

type DBCalculatedIndicatorSnapshot = {
  calculated_indicator_id: string;
  label: string;
  group_label: string;
  sort_order: number;
  num_indicator_id: string;
  denom_kind: "indicator" | "population";
  denom_indicator_id: string | null;
  denom_population_type: PopulationType | null;
  denom_population_multiplier: number | null;
  format_as: "percent" | "number" | "rate_per_10k";
  decimal_places: number;
  threshold_direction: "higher_is_better" | "lower_is_better";
  threshold_green: number;
  threshold_yellow: number;
};

function dbRowToCalculatedIndicator(
  row: DBCalculatedIndicatorSnapshot,
): CalculatedIndicator {
  return {
    calculated_indicator_id: row.calculated_indicator_id,
    label: row.label,
    group_label: row.group_label,
    sort_order: row.sort_order,
    num_indicator_id: row.num_indicator_id,
    denom:
      row.denom_kind === "indicator"
        ? { kind: "indicator", indicator_id: row.denom_indicator_id! }
        : {
            kind: "population",
            population_type: row.denom_population_type!,
            multiplier: row.denom_population_multiplier!,
          },
    format_as: row.format_as,
    decimal_places: row.decimal_places,
    threshold_direction: row.threshold_direction,
    threshold_green: row.threshold_green,
    threshold_yellow: row.threshold_yellow,
  };
}

export async function getAllCalculatedIndicatorsFromSnapshot(
  projectDb: Sql,
): Promise<CalculatedIndicator[]> {
  const rows = await projectDb<DBCalculatedIndicatorSnapshot[]>`
    SELECT * FROM calculated_indicators_snapshot ORDER BY sort_order, calculated_indicator_id
  `;
  return rows.map(dbRowToCalculatedIndicator);
}
