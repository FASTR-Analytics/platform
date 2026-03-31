import type { InstalledModuleWithConfigSelections } from "lib";

export function formatModuleSettingsForAI(
  module: InstalledModuleWithConfigSelections,
): string {
  const lines = [
    `MODULE SETTINGS: ${module.id}`,
    "=".repeat(80),
    "",
    `Name: ${module.label}`,
    "",
    "CURRENT SETTINGS",
    "-".repeat(80),
  ];

  const { configSelections } = module;

  if (Object.keys(configSelections.parameterSelections).length === 0) {
    lines.push("");
    lines.push("No parameters configured");
  } else {
    lines.push("");
    lines.push("Parameters:");
    for (const [key, value] of Object.entries(configSelections.parameterSelections)) {
      const paramDef = configSelections.parameterDefinitions.find(
        (p) => p.replacementString === key
      );
      const desc = paramDef?.description || key;
      lines.push(`  ${desc}: ${value}`);
    }
  }

  lines.push("");
  lines.push("=".repeat(80));

  return lines.join("\n");
}
