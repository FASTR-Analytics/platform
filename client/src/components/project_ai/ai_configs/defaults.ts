import { DEFAULT_ANTHROPIC_MODEL } from "lib";
import Anthropic from "@anthropic-ai/sdk";
import { _SERVER_HOST } from "~/server_actions";

export const DEFAULT_MODEL_CONFIG = {
  model: DEFAULT_ANTHROPIC_MODEL,
  max_tokens: 4096,
};

export const DEFAULT_BUILTIN_TOOLS = { webSearch: true };

const ISO_RE = /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z/;

export function createProjectSDKClient(projectId: string) {
  const baseURL = _SERVER_HOST
    ? `${_SERVER_HOST}/ai`
    : `${window.location.origin}/ai`;
  return new Anthropic({
    apiKey: "not-needed",
    baseURL,
    defaultHeaders: { "Project-Id": projectId },
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
