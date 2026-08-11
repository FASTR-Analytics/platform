// The figure-config formatter lives in lib/ai_tools (shared with the headless
// MCP host). This shim binds the SPA's cache-backed environment so existing
// call sites keep their historical signature.
import type { MetricWithStatus, PeriodBounds, PresentationObjectConfig } from "lib";
import { formatFigureConfigForAI as formatFigureConfigForAIShared } from "lib";
import { clientAIToolEnv } from "../../client_env";

export async function formatFigureConfigForAI(
  projectId: string,
  metric: MetricWithStatus | undefined,
  config: PresentationObjectConfig,
  shownDateRange: PeriodBounds | undefined,
): Promise<string> {
  return formatFigureConfigForAIShared(
    clientAIToolEnv,
    projectId,
    metric,
    config,
    shownDateRange,
  );
}
