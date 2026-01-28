import type { InstalledModuleSummary, MetricWithStatus } from "lib";

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

  for (const module of modules) {
    lines.push(`ID: ${module.id}`);
    lines.push(`Name: ${module.label}`);
    lines.push(`Config Type: ${module.configType}`);
    lines.push(`Installed: ${module.dateInstalled}`);
    lines.push(`Last Run: ${module.lastRun}`);

    const statusText = module.dirty === "ready"
      ? "Up to date"
      : module.dirty === "queued"
        ? "Queued"
        : module.dirty === "running"
          ? "Running"
          : module.dirty === "error"
            ? "Error"
            : "Needs update";
    lines.push(`Status: ${statusText}`);

    const metricCount = metricCountByModule.get(module.id) ?? 0;
    lines.push(`Metrics: ${metricCount}`);

    lines.push("-".repeat(80));
    lines.push("");
  }

  return lines.join("\n");
}
