import { Sql } from "postgres";
import { parseJsonOrThrow, type ModuleConfigSelectionsHfa } from "lib";
import { type DBIndicator_IN_PROJECT } from "../db/mod.ts";

export async function getIndicatorLabelReplacements(
  projectDb: Sql,
  moduleId: string,
): Promise<Record<string, string>> {
  const indicatorLabelReplacements: Record<string, string> = {};

  if (moduleId.toLowerCase().startsWith("hfa")) {
    const rawModule = (
      await projectDb<{ config_selections: string }[]>`
        SELECT config_selections FROM modules WHERE id = ${moduleId}
      `
    ).at(0);

    if (rawModule) {
      const configSelections = parseJsonOrThrow<ModuleConfigSelectionsHfa>(
        rawModule.config_selections,
      );
      if (configSelections.configType === "hfa") {
        for (const indicator of configSelections.indicators) {
          indicatorLabelReplacements[indicator.varName] = indicator.definition;
        }
      }
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
