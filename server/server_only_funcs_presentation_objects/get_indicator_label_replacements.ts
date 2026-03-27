import { Sql } from "postgres";
import { type DBHfaIndicator, type DBIndicator_IN_PROJECT } from "../db/mod.ts";

export async function getIndicatorLabelReplacements(
  mainDb: Sql,
  projectDb: Sql,
  moduleId: string,
): Promise<Record<string, string>> {
  const indicatorLabelReplacements: Record<string, string> = {};

  if (moduleId.toLowerCase().startsWith("hfa")) {
    const hfaRows = await mainDb<DBHfaIndicator[]>`
      SELECT * FROM hfa_indicators
    `;
    for (const row of hfaRows) {
      indicatorLabelReplacements[row.var_name] = row.definition;
    }
  } else {
    const rawIndicators = await projectDb<
      DBIndicator_IN_PROJECT[]
    >`SELECT * FROM indicators`;

    for (const rawIndicator of rawIndicators) {
      if (
        rawIndicator &&
        rawIndicator.indicator_common_id &&
        rawIndicator.indicator_common_label
      ) {
        indicatorLabelReplacements[rawIndicator.indicator_common_id] =
          rawIndicator.indicator_common_label;
      }
    }
  }

  return indicatorLabelReplacements;
}
