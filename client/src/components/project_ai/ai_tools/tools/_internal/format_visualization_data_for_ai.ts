import { AIToolFailure } from "panther";
import { getDataFromConfig, type MetricWithStatus } from "lib";
import type { ClientAIToolEnv } from "../../client_env";

export async function getVisualizationDataAsCSV(
  env: ClientAIToolEnv,
  presentationObjectId: string,
  metrics: MetricWithStatus[],
): Promise<string> {
  const resPoDetail = await env.getPODetail(presentationObjectId);
  if (!resPoDetail.success) throw new AIToolFailure(resPoDetail.err);

  const poDetail = resPoDetail.data;
  const config = poDetail.config;
  const metric = metrics.find((m) => m.id === poDetail.resultsValue.id);

  const dataOutput = await getDataFromConfig(
    env,
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
