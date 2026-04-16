import { Sql } from "postgres";
import {
  APIResponseNoData,
  APIResponseWithData,
  type ScorecardIndicator,
} from "lib";
import { tryCatchDatabaseAsync } from "./../utils.ts";

export type DBScorecardIndicator = {
  scorecard_indicator_id: string;
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

export function dbRowToScorecardIndicator(
  row: DBScorecardIndicator,
): ScorecardIndicator {
  return {
    scorecard_indicator_id: row.scorecard_indicator_id,
    label: row.label,
    group_label: row.group_label,
    sort_order: row.sort_order,
    num_indicator_id: row.num_indicator_id,
    denom: row.denom_kind === "indicator"
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

function denomFieldsFromScorecardIndicator(
  indicator: ScorecardIndicator,
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

export async function getScorecardIndicators(
  mainDb: Sql,
): Promise<APIResponseWithData<ScorecardIndicator[]>> {
  return await tryCatchDatabaseAsync(async () => {
    const rows = await mainDb<DBScorecardIndicator[]>`
      SELECT * FROM scorecard_indicators ORDER BY sort_order, scorecard_indicator_id
    `;
    return { success: true, data: rows.map(dbRowToScorecardIndicator) };
  });
}

export async function createScorecardIndicator(
  mainDb: Sql,
  indicator: ScorecardIndicator,
): Promise<APIResponseNoData> {
  return await tryCatchDatabaseAsync(async () => {
    const d = denomFieldsFromScorecardIndicator(indicator);
    await mainDb`
      INSERT INTO scorecard_indicators (
        scorecard_indicator_id,
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
        ${indicator.scorecard_indicator_id},
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

export async function updateScorecardIndicator(
  mainDb: Sql,
  oldScorecardIndicatorId: string,
  indicator: ScorecardIndicator,
): Promise<APIResponseNoData> {
  return await tryCatchDatabaseAsync(async () => {
    const d = denomFieldsFromScorecardIndicator(indicator);
    await mainDb`
      UPDATE scorecard_indicators
      SET scorecard_indicator_id    = ${indicator.scorecard_indicator_id},
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
      WHERE scorecard_indicator_id = ${oldScorecardIndicatorId}
    `;
    return { success: true };
  });
}

export async function deleteScorecardIndicators(
  mainDb: Sql,
  scorecardIndicatorIds: string[],
): Promise<APIResponseNoData> {
  return await tryCatchDatabaseAsync(async () => {
    if (scorecardIndicatorIds.length === 0) {
      return { success: true };
    }
    await mainDb`
      DELETE FROM scorecard_indicators
      WHERE scorecard_indicator_id = ANY(${scorecardIndicatorIds})
    `;
    return { success: true };
  });
}
