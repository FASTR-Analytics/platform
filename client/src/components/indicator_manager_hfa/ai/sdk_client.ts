import { DEFAULT_ANTHROPIC_MODEL } from "lib";
import Anthropic from "@anthropic-ai/sdk";
import { _SERVER_HOST } from "~/server_actions";

export const HFA_AI_MODEL_CONFIG = {
  model: DEFAULT_ANTHROPIC_MODEL,
  max_tokens: 4096,
  // Effort default, not user-adjustable — see project defaults.ts for rationale.
  output_config: { effort: "high" as const },
};

const ISO_RE = /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z/;

// Instance-level SDK client for the HFA Indicator Manager assistant. Mirrors the
// project client (project_ai/ai_configs/defaults.ts) but targets the instance
// proxy (/ai-instance) and carries no Project-Id — indicators are instance-level.
export function createHfaIndicatorAiSDKClient() {
  const baseURL = _SERVER_HOST
    ? `${_SERVER_HOST}/ai-instance`
    : `${window.location.origin}/ai-instance`;
  return new Anthropic({
    apiKey: "not-needed",
    baseURL,
    dangerouslyAllowBrowser: true,
    fetch: async (url: RequestInfo | URL, init?: RequestInit) => {
      const response = await globalThis.fetch(url, init);
      if (response.status === 429) {
        const body = await response.clone().json().catch(() => null);
        const msg: string = body?.error?.message ?? "";
        const isoMatch = msg.match(ISO_RE);
        if (isoMatch) {
          const localTime = new Date(isoMatch[0]).toLocaleString(undefined, { dateStyle: "full", timeStyle: "short" });
          const newMsg = msg.replace(isoMatch[0], localTime);
          return new Response(
            JSON.stringify({ ...body, error: { ...body.error, message: newMsg } }),
            { status: 429, headers: { "Content-Type": "application/json" } },
          );
        }
      }
      return response;
    },
  });
}
