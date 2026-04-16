import { Sql } from "postgres";
import {
  APIResponseNoData,
  APIResponseWithData,
  type CalculatedIndicator,
} from "lib";
import { tryCatchDatabaseAsync } from "./../utils.ts";

export type DBCalculatedIndicator = {
  calculated_indicator_id: string;
  label: string;
  group_label: string;
  sort_order: number;
  num_indicator_id: string;
  denom_kind: "indicator" | "population";
  denom_indicator_id: string | null;
  denom_population_fraction: number | null;
  format_as: "percent" | "number" | "rate_per_10k";
  decimal_places: number;
  threshold_direction: "higher_is_better" | "lower_is_better";
  threshold_green: number;
  threshold_yellow: number;
  updated_at: string;
};

export function dbRowToCalculatedIndicator(
  row: DBCalculatedIndicator,
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
            population_fraction: row.denom_population_fraction!,
          },
    format_as: row.format_as,
    decimal_places: row.decimal_places,
    threshold_direction: row.threshold_direction,
    threshold_green: row.threshold_green,
    threshold_yellow: row.threshold_yellow,
  };
}

type DenomFields = {
  denom_kind: "indicator" | "population";
  denom_indicator_id: string | null;
  denom_population_fraction: number | null;
};

function denomFieldsFromCalculatedIndicator(
  indicator: CalculatedIndicator,
): DenomFields {
  if (indicator.denom.kind === "indicator") {
    return {
      denom_kind: "indicator",
      denom_indicator_id: indicator.denom.indicator_id,
      denom_population_fraction: null,
    };
  }
  return {
    denom_kind: "population",
    denom_indicator_id: null,
    denom_population_fraction: indicator.denom.population_fraction,
  };
}

export async function getCalculatedIndicators(
  mainDb: Sql,
): Promise<APIResponseWithData<CalculatedIndicator[]>> {
  return await tryCatchDatabaseAsync(async () => {
    const rows = await mainDb<DBCalculatedIndicator[]>`
      SELECT * FROM calculated_indicators ORDER BY sort_order, calculated_indicator_id
    `;
    return { success: true, data: rows.map(dbRowToCalculatedIndicator) };
  });
}

export async function createCalculatedIndicator(
  mainDb: Sql,
  indicator: CalculatedIndicator,
): Promise<APIResponseNoData> {
  return await tryCatchDatabaseAsync(async () => {
    const d = denomFieldsFromCalculatedIndicator(indicator);
    await mainDb`
      INSERT INTO calculated_indicators (
        calculated_indicator_id,
        label,
        group_label,
        sort_order,
        num_indicator_id,
        denom_kind,
        denom_indicator_id,
        denom_population_fraction,
        format_as,
        decimal_places,
        threshold_direction,
        threshold_green,
        threshold_yellow,
        updated_at
      )
      VALUES (
        ${indicator.calculated_indicator_id},
        ${indicator.label},
        ${indicator.group_label},
        ${indicator.sort_order},
        ${indicator.num_indicator_id},
        ${d.denom_kind},
        ${d.denom_indicator_id},
        ${d.denom_population_fraction},
        ${indicator.format_as},
        ${indicator.decimal_places},
        ${indicator.threshold_direction},
        ${indicator.threshold_green},
        ${indicator.threshold_yellow},
        CURRENT_TIMESTAMP
      )
    `;
    return { success: true };
  });
}

export async function updateCalculatedIndicator(
  mainDb: Sql,
  oldCalculatedIndicatorId: string,
  indicator: CalculatedIndicator,
): Promise<APIResponseNoData> {
  return await tryCatchDatabaseAsync(async () => {
    const d = denomFieldsFromCalculatedIndicator(indicator);
    await mainDb`
      UPDATE calculated_indicators
      SET calculated_indicator_id    = ${indicator.calculated_indicator_id},
          label                     = ${indicator.label},
          group_label               = ${indicator.group_label},
          sort_order                = ${indicator.sort_order},
          num_indicator_id          = ${indicator.num_indicator_id},
          denom_kind                = ${d.denom_kind},
          denom_indicator_id        = ${d.denom_indicator_id},
          denom_population_fraction = ${d.denom_population_fraction},
          format_as                 = ${indicator.format_as},
          decimal_places            = ${indicator.decimal_places},
          threshold_direction       = ${indicator.threshold_direction},
          threshold_green           = ${indicator.threshold_green},
          threshold_yellow          = ${indicator.threshold_yellow},
          updated_at                = CURRENT_TIMESTAMP
      WHERE calculated_indicator_id = ${oldCalculatedIndicatorId}
    `;
    return { success: true };
  });
}

export async function deleteCalculatedIndicators(
  mainDb: Sql,
  calculatedIndicatorIds: string[],
): Promise<APIResponseNoData> {
  return await tryCatchDatabaseAsync(async () => {
    if (calculatedIndicatorIds.length === 0) {
      return { success: true };
    }
    await mainDb`
      DELETE FROM calculated_indicators
      WHERE calculated_indicator_id = ANY(${calculatedIndicatorIds})
    `;
    return { success: true };
  });
}
