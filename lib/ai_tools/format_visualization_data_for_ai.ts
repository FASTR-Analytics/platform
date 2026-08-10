import type { MetricWithStatus } from "../types/mod.ts";
import { AIToolFailure } from "@timroberton/panther";
import { getDataFromConfig } from "./format_metric_data_for_ai.ts";
import type { AIToolEnv } from "./env.ts";

export async function getVisualizationDataAsCSV(
  env: AIToolEnv,
  projectId: string,
  presentationObjectId: string,
  metrics: MetricWithStatus[],
): Promise<string> {
  const resPoDetail = await env.getPODetail(projectId, presentationObjectId);
  if (!resPoDetail.success) throw new AIToolFailure(resPoDetail.err);

  const poDetail = resPoDetail.data;
  const config = poDetail.config;
  const metric = metrics.find((m) => m.id === poDetail.resultsValue.id);

  const dataOutput = await getDataFromConfig(
    env,
    projectId,
    poDetail.resultsValue.id,
    metrics,
    config,
    metric?.aiDescription,
  );

  const contextLines = [
    "# VISUALIZATION DATA",
    "=".repeat(80),
    "",
    `**Name:** ${poDetail.label}`,
    `**Type:** ${config.d.type}`,
  ];

  if (config.t.caption) {
    contextLines.push(`**Caption:** ${config.t.caption}`);
  }

  contextLines.push("");
  contextLines.push("---");
  contextLines.push("");

  return contextLines.join("\n") + dataOutput;
}
