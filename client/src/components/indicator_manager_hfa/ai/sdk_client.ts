import Anthropic from "@anthropic-ai/sdk";
import { _SERVER_HOST } from "~/server_actions";

const ISO_RE = /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z/;

// Instance-level SDK client for the HFA Indicator Manager assistant. Mirrors
// the copilot client (copilot/ai_configs/defaults.ts) but targets the HFA
// indicator proxy (/ai-instance) rather than the copilot's /ai.
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
