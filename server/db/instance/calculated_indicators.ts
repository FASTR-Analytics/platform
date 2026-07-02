import { Sql } from "postgres";
import {
  APIResponseNoData,
  APIResponseWithData,
  type CalculatedIndicator,
  type PopulationType,
} from "lib";
import { tryCatchDatabaseAsync } from "./../utils.ts";

export type DBCalculatedIndicator = {
  calculated_indicator_id: string;
  label: string;
  group_label: string;
  sort_order: number;
  num_indicator_id: string;
  denom_kind: "none" | "indicator" | "population";
  denom_indicator_id: string | null;
  denom_population_type: PopulationType | null;
  denom_population_multiplier: number | null;
  format_as: "percent" | "number" | "rate_per_10k";
  threshold_direction: "higher_is_better" | "lower_is_better";
  threshold_green: number;
  threshold_yellow: number;
  updated_at: string;
};

export function dbRowToCalculatedIndicator(
  row: DBCalculatedIndicator,
): CalculatedIndicator {
  let denom: CalculatedIndicator["denom"];
  if (row.denom_kind === "none") {
    denom = { kind: "none" };
  } else if (row.denom_kind === "indicator") {
    denom = { kind: "indicator", indicator_id: row.denom_indicator_id! };
  } else {
    denom = {
      kind: "population",
      population_type: row.denom_population_type!,
      multiplier: row.denom_population_multiplier!,
    };
  }
  return {
    calculated_indicator_id: row.calculated_indicator_id,
    label: row.label,
    group_label: row.group_label,
    sort_order: row.sort_order,
    num_indicator_id: row.num_indicator_id,
    denom,
    format_as: row.format_as,
    threshold_direction: row.threshold_direction,
    threshold_green: row.threshold_green,
    threshold_yellow: row.threshold_yellow,
  };
}

type DenomFields = {
  denom_kind: "none" | "indicator" | "population";
  denom_indicator_id: string | null;
  denom_population_type: PopulationType | null;
  denom_population_multiplier: number | null;
};

function denomFieldsFromCalculatedIndicator(
  indicator: CalculatedIndicator,
): DenomFields {
  if (indicator.denom.kind === "none") {
    return {
      denom_kind: "none",
      denom_indicator_id: null,
      denom_population_type: null,
      denom_population_multiplier: null,
    };
  }
  if (indicator.denom.kind === "indicator") {
    return {
      denom_kind: "indicator",
      denom_indicator_id: indicator.denom.indicator_id,
      denom_population_type: null,
      denom_population_multiplier: null,
    };
  }
  return {
    denom_kind: "population",
    denom_indicator_id: null,
    denom_population_type: indicator.denom.population_type,
    denom_population_multiplier: indicator.denom.multiplier,
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

function uniqueViolationError(e: unknown): string | undefined {
  if (!(e instanceof Error)) {
    return undefined;
  }
  const pgError = e as Error & { code?: unknown; constraint_name?: unknown };
  if (pgError.code !== "23505") {
    return undefined;
  }
  const constraintName = typeof pgError.constraint_name === "string"
    ? pgError.constraint_name
    : "";
  if (constraintName.includes("label")) {
    return "Another calculated indicator already uses this label.";
  }
  if (constraintName.includes("pkey")) {
    return "A calculated indicator with this ID already exists.";
  }
  return undefined;
}

export async function createCalculatedIndicator(
  mainDb: Sql,
  indicator: CalculatedIndicator,
): Promise<APIResponseNoData> {
  return await tryCatchDatabaseAsync(async () => {
    const d = denomFieldsFromCalculatedIndicator(indicator);
    try {
      await mainDb`
        INSERT INTO calculated_indicators (
          calculated_indicator_id,
          label,
          group_label,
          sort_order,
          num_indicator_id,
          denom_kind,
          denom_indicator_id,
          denom_population_type,
          denom_population_multiplier,
          format_as,
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
          ${d.denom_population_type},
          ${d.denom_population_multiplier},
          ${indicator.format_as},
          ${indicator.threshold_direction},
          ${indicator.threshold_green},
          ${indicator.threshold_yellow},
          CURRENT_TIMESTAMP
        )
      `;
    } catch (e) {
      const friendlyErr = uniqueViolationError(e);
      if (friendlyErr) {
        return { success: false, err: friendlyErr };
      }
      throw e;
    }
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
    try {
      await mainDb`
        UPDATE calculated_indicators
        SET calculated_indicator_id       = ${indicator.calculated_indicator_id},
            label                        = ${indicator.label},
            group_label                  = ${indicator.group_label},
            sort_order                   = ${indicator.sort_order},
            num_indicator_id             = ${indicator.num_indicator_id},
            denom_kind                   = ${d.denom_kind},
            denom_indicator_id           = ${d.denom_indicator_id},
            denom_population_type        = ${d.denom_population_type},
            denom_population_multiplier  = ${d.denom_population_multiplier},
            format_as                    = ${indicator.format_as},
            threshold_direction          = ${indicator.threshold_direction},
            threshold_green              = ${indicator.threshold_green},
            threshold_yellow             = ${indicator.threshold_yellow},
            updated_at                   = CURRENT_TIMESTAMP
        WHERE calculated_indicator_id = ${oldCalculatedIndicatorId}
      `;
    } catch (e) {
      const friendlyErr = uniqueViolationError(e);
      if (friendlyErr) {
        return { success: false, err: friendlyErr };
      }
      throw e;
    }
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

export async function reorderCalculatedIndicators(
  mainDb: Sql,
  order: string[],
): Promise<APIResponseNoData> {
  return await tryCatchDatabaseAsync(async () => {
    for (let i = 0; i < order.length; i++) {
      await mainDb`
        UPDATE calculated_indicators
        SET sort_order = ${i + 1},
            updated_at = CURRENT_TIMESTAMP
        WHERE calculated_indicator_id = ${order[i]}
      `;
    }
    return { success: true };
  });
}
