import type { MetricWithStatus } from "lib";
import { getPODetailFromCacheorFetch } from "~/state/po_cache";
import { getDataFromConfig } from "./format_metric_data_for_ai";

export async function getVisualizationDataAsCSV(
  projectId: string,
  presentationObjectId: string,
  metrics: MetricWithStatus[],
): Promise<string> {
  const resPoDetail = await getPODetailFromCacheorFetch(
    projectId,
    presentationObjectId,
  );
  if (!resPoDetail.success) throw new Error(resPoDetail.err);

  const poDetail = resPoDetail.data;
  const config = poDetail.config;
  const metric = metrics.find(m => m.id === poDetail.resultsValue.id);

  const dataOutput = await getDataFromConfig(
    projectId,
    poDetail.resultsValue.id,
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
