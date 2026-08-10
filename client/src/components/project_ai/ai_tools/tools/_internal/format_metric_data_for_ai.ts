// The metric-data shaping lives in lib/ai_tools (shared with the headless MCP
// host). This shim binds the SPA's cache-backed environment so existing call
// sites keep their historical signatures.
import type {
  AiMetricQuery,
  GenericLongFormFetchConfig,
  MetricAIDescription,
  MetricWithStatus,
  PresentationObjectConfig,
} from "lib";
import {
  getDataFromConfig as getDataFromConfigShared,
  getMetricDataForAI as getMetricDataForAIShared,
} from "lib";
import { clientAIToolEnv } from "../../client_env";

export { inferPeriodFilter } from "lib";

export async function getMetricDataForAI(
  projectId: string,
  query: AiMetricQuery,
  metrics: MetricWithStatus[],
  valuesFilter?: string[],
  aiDescription?: MetricAIDescription,
  periodFilterOverride?: GenericLongFormFetchConfig["periodFilter"],
): Promise<string> {
  return getMetricDataForAIShared(
    clientAIToolEnv,
    projectId,
    query,
    metrics,
    valuesFilter,
    aiDescription,
    periodFilterOverride,
  );
}

export async function getDataFromConfig(
  projectId: string,
  metricId: string,
  metrics: MetricWithStatus[],
  config: PresentationObjectConfig,
  aiDescription?: MetricAIDescription,
): Promise<string> {
  return getDataFromConfigShared(
    clientAIToolEnv,
    projectId,
    metricId,
    metrics,
    config,
    aiDescription,
  );
}
