import { Sql } from "postgres";
import { type DBIndicator_IN_PROJECT } from "../db/mod.ts";

// ============================================================================
// Period Bounds and Date Ranges
// ============================================================================

// ============================================================================
// Indicator Label Replacements
// ============================================================================

export async function getIndicatorLabelReplacements(
  projectDb: Sql,
  moduleId: string
): Promise<Record<string, string>> {
  const indicatorLabelReplacements: Record<string, string> = {};

  // Quick optimization - only m006 is HFA currently
  if (moduleId.toLowerCase().startsWith("hfa")) {
    // NEED TO FIX THIS!!!!
    const rawModule = (
      await projectDb<{ module_definition: string }[]>`
        SELECT module_definition FROM modules WHERE id = ${moduleId}
      `
    ).at(0);

    if (rawModule) {
      const moduleDefinition = JSON.parse(rawModule.module_definition);
      if (
        moduleDefinition.configRequirements?.configType === "hfa" &&
        moduleDefinition.configRequirements.indicators
      ) {
        for (const indicator of moduleDefinition.configRequirements
          .indicators) {
          indicatorLabelReplacements[indicator.varName] = indicator.definition;
        }
      }
    }
  } else {
    // Existing behavior for non-HFA modules
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
