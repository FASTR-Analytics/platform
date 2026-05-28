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
    // 1. Indicator metadata (for hfa_indicator disaggregation)
    const hfaIndicators = await projectDb<{
      var_name: string;
      short_label: string;
      definition: string;
      type: string;
      aggregation: string;
      sort_order: number;
    }[]>`
      SELECT var_name, short_label, definition, type, aggregation, sort_order
      FROM hfa_indicators_snapshot
      ORDER BY sort_order, var_name
    `;
    for (const row of hfaIndicators) {
      const format_as = row.type === "binary" && row.aggregation === "avg" ? "percent" : "number";
      metadata.push({
        id: row.var_name,
        label: row.short_label || row.definition,
        format_as,
        sort_order: row.sort_order,
      });
    }

    // 2. Category metadata (for hfa_category disaggregation labels)
    const hfaCategories = await projectDb<{ id: string; label: string; sort_order: number }[]>`
      SELECT id, label, sort_order FROM hfa_indicator_categories_snapshot ORDER BY sort_order, label
    `;
    for (const cat of hfaCategories) {
      metadata.push({
        id: cat.id,
        label: cat.label,
        sort_order: cat.sort_order,
      });
    }

    // 3. Sub-category metadata (for hfa_sub_category disaggregation labels)
    const hfaSubCategories = await projectDb<{ id: string; label: string; sort_order: number }[]>`
      SELECT id, label, sort_order FROM hfa_indicator_sub_categories_snapshot ORDER BY sort_order, label
    `;
    for (const subCat of hfaSubCategories) {
      metadata.push({
        id: subCat.id,
        label: subCat.label,
        sort_order: subCat.sort_order,
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