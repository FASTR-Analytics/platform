import {
  compareModules,
  type InstalledModuleSummary,
  type MetricWithStatus,
} from "lib";

// Modules in module order (compareModules), each with its family and tier,
// so the model meets each family's primary result first.
export function formatModulesListForAI(
  modules: InstalledModuleSummary[],
  metrics: MetricWithStatus[],
): string {
  // Build metric count per module
  const metricCountByModule = new Map<string, number>();
  for (const metric of metrics) {
    const count = metricCountByModule.get(metric.moduleId) ?? 0;
    metricCountByModule.set(metric.moduleId, count + 1);
  }

  const lines = ["AVAILABLE MODULES", "=".repeat(80), ""];

  if (modules.length === 0) {
    lines.push("No modules installed.");
    return lines.join("\n");
  }

  for (const module of modules.toSorted(compareModules)) {
    lines.push(`ID: ${module.id}`);
    lines.push(`Name: ${module.label}`);
    lines.push(`Family: ${module.family}`);
    lines.push(
      `Tier: ${
        module.tier === "primary" ? "primary result" : "supporting analysis"
      }`,
    );
    lines.push(`Has Parameters: ${module.hasParameters}`);
    lines.push(`Last Run: ${module.lastRunAt ?? "never"}`);

    const metricCount = metricCountByModule.get(module.id) ?? 0;
    lines.push(`Metrics: ${metricCount}`);

    lines.push("-".repeat(80));
    lines.push("");
  }

  return lines.join("\n");
}
