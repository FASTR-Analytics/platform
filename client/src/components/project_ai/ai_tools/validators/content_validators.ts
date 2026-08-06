// The validators live in lib/ai_tools (shared with the headless MCP host).
// This shim binds the SPA's cache-backed environment so existing call sites
// keep their historical signatures.
import type { DisaggregationOption } from "lib";
import { validateMetricInputs as validateMetricInputsShared } from "lib";
import { clientAIToolEnv } from "../client_env";

export {
  validateAiMetricQuery,
  validateMaxContentBlocks,
  validateNoMarkdownTables,
  validatePresetOverrides,
  validateSlideTotalWordCount,
} from "lib";

export async function validateMetricInputs(
  projectId: string,
  metricId: string,
  filters?: { disOpt: DisaggregationOption; values: (string | number)[] }[],
  periodFilter?: { min: number; max: number },
): Promise<void> {
  return validateMetricInputsShared(
    clientAIToolEnv,
    projectId,
    metricId,
    filters,
    periodFilter,
  );
}
