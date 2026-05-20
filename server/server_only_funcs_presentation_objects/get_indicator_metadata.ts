import { Sql } from "postgres";
import { type DBHfaIndicator, type DBIndicator_IN_PROJECT, getAllCalculatedIndicatorsFromSnapshot } from "../db/mod.ts";
import { IndicatorMetadata } from "lib";

export async function getIndicatorMetadata(
  mainDb: Sql,
  projectDb: Sql,
  moduleId: string,
): Promise<IndicatorMetadata[]> {
  const metadata: IndicatorMetadata[] = [];

  const moduleRow = await projectDb<{ module_definition: string }[]>`
    SELECT module_definition FROM modules WHERE id = ${moduleId}
  `.then(rows => rows.at(0));

  const isHfaModule = moduleRow
    ? JSON.parse(moduleRow.module_definition).scriptGenerationType === "hfa"
    : false;

  if (isHfaModule) {
    const hfaRows = await mainDb<DBHfaIndicator[]>`SELECT * FROM hfa_indicators`;
    for (const row of hfaRows) {
      const format_as = row.type === "binary" && row.aggregation === "avg" ? "percent" : "number";
      metadata.push({
        id: row.var_name,
        label: row.definition,
        format_as,
        group_label: row.category,
        sort_order: row.sort_order,
      });
    }
  } else {
    const rawIndicators = await projectDb<DBIndicator_IN_PROJECT[]>`SELECT * FROM indicators`;
    for (const ind of rawIndicators) {
      if (ind.indicator_common_id && ind.indicator_common_label) {
        metadata.push({ id: ind.indicator_common_id, label: ind.indicator_common_label });
      }
    }

    const snapshot = await getAllCalculatedIndicatorsFromSnapshot(projectDb);
    const metadataById = new Map(metadata.map(m => [m.id, m]));
    for (const ci of snapshot) {
      metadataById.set(ci.calculated_indicator_id, {
        id: ci.calculated_indicator_id,
        label: ci.label,
        format_as: ci.format_as,
        decimal_places: ci.decimal_places,
        threshold_direction: ci.threshold_direction,
        threshold_green: ci.threshold_green,
        threshold_yellow: ci.threshold_yellow,
        group_label: ci.group_label,
        sort_order: ci.sort_order,
      });
    }
    return Array.from(metadataById.values());
  }

  return metadata;
}