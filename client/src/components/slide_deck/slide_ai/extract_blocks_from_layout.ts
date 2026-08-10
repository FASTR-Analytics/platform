// The block-extraction and slide-simplification logic lives in lib/ai_tools
// (shared with the headless MCP host). This shim binds the SPA's cache-backed
// environment so existing call sites keep their historical signatures.
import type { MetricWithStatus, Slide, SimplifiedSlide } from "lib";
import { simplifySlideForAI as simplifySlideForAIShared } from "lib";
import { clientAIToolEnv } from "~/components/project_ai/ai_tools/client_env";

export {
  type BlockWithId,
  extractBlocksFromLayout,
  type SimplifiedSlide,
} from "lib";

export async function simplifySlideForAI(
  projectId: string,
  slide: Slide,
  metrics?: MetricWithStatus[],
): Promise<SimplifiedSlide> {
  return simplifySlideForAIShared(clientAIToolEnv, projectId, slide, metrics);
}
