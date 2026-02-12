import type { InstalledModuleWithConfigSelections } from "lib";

export function formatModuleSettingsForAI(
  module: InstalledModuleWithConfigSelections,
): string {
  const lines = [
    `MODULE SETTINGS: ${module.id}`,
    "=".repeat(80),
    "",
    `Name: ${module.label}`,
    `Config Type: ${module.configSelections.configType}`,
    "",
    "CURRENT SETTINGS",
    "-".repeat(80),
  ];

  const { configSelections } = module;

  // Handle different config types
  if (configSelections.configType === "parameters") {
    lines.push("");
    if (Object.keys(configSelections.parameterSelections).length === 0) {
      lines.push("No parameters configured");
    } else {
      lines.push("Parameters:");
      for (const [key, value] of Object.entries(configSelections.parameterSelections)) {
        // Find parameter definition to get description
        const paramDef = configSelections.parameterDefinitions.find(
          (p) => p.replacementString === key
        );
        const desc = paramDef?.description || key;
        lines.push(`  ${desc}: ${value}`);
      }
    }
  } else if (configSelections.configType === "hfa") {
    lines.push("");
    if (configSelections.indicators.length === 0) {
      lines.push("HFA Indicators: None selected");
    } else {
      lines.push(`HFA Indicators (${configSelections.indicators.length} selected):`);
      for (const indicator of configSelections.indicators) {
        lines.push(`  - ${indicator.varName}`);
      }
    }
    lines.push(`Use sample weights: ${configSelections.useSampleWeights}`);
  } else if (configSelections.configType === "none") {
    lines.push("");
    lines.push("No configuration required for this module");
  }

  lines.push("");
  lines.push("=".repeat(80));

  return lines.join("\n");
}
