import { Sql } from "postgres";
import {
  type DBHfaIndicator,
  type DBIndicator_IN_PROJECT,
  getAllCalculatedIndicatorsFromSnapshot,
  getAllIcehIndicatorsFromSnapshot,
} from "../db/mod.ts";
import { ICEH_STRAT_INFO, IndicatorMetadata } from "lib";

type ModuleDataSource = {
  sourceType: string;
  datasetType?: string;
};

function getDatasetTypes(moduleDefinition: string): string[] {
  try {
    const parsed = JSON.parse(moduleDefinition);
    const dataSources = (parsed.dataSources ?? []) as ModuleDataSource[];
    return dataSources
      .filter((ds) => ds.sourceType === "dataset" && ds.datasetType)
      .map((ds) => ds.datasetType!);
  } catch {
    return [];
  }
}

export async function getIndicatorMetadata(
  mainDb: Sql,
  projectDb: Sql,
  moduleId: string,
): Promise<IndicatorMetadata[]> {
  const metadata: IndicatorMetadata[] = [];

  const moduleRow = await projectDb<{ module_definition: string }[]>`
    SELECT module_definition FROM modules WHERE id = ${moduleId}
  `.then((rows) => rows.at(0));

  if (!moduleRow) return metadata;

  const moduleDef = moduleRow.module_definition;
  const datasetTypes = getDatasetTypes(moduleDef);
  const isHfaModule = JSON.parse(moduleDef).scriptGenerationType === "hfa";
  const isIcehModule = datasetTypes.includes("iceh");

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
    return metadata;
  }

  if (isIcehModule) {
    const icehIndicators = await getAllIcehIndicatorsFromSnapshot(projectDb);
    for (const ind of icehIndicators) {
      metadata.push({
        id: ind.indicatorCode,
        label: ind.indicatorName,
        format_as: "percent",
        group_label: ind.category,
        sort_order: ind.sortOrder,
      });
    }
    for (const [stratCode, info] of Object.entries(ICEH_STRAT_INFO)) {
      metadata.push({
        id: stratCode,
        label: info.label,
        sort_order: info.sortOrder,
      });
      if (info.levels) {
        for (const [levelCode, levelLabel] of Object.entries(info.levels)) {
          metadata.push({
            id: levelCode,
            label: levelLabel,
          });
        }
      }
    }
    return metadata;
  }

  const rawIndicators = await projectDb<DBIndicator_IN_PROJECT[]>`SELECT * FROM indicators`;
  for (const ind of rawIndicators) {
    if (ind.indicator_common_id && ind.indicator_common_label) {
      metadata.push({ id: ind.indicator_common_id, label: ind.indicator_common_label });
    }
  }

  const snapshot = await getAllCalculatedIndicatorsFromSnapshot(projectDb);
  const metadataById = new Map(metadata.map((m) => [m.id, m]));
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