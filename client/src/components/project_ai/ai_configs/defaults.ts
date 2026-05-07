import { DEFAULT_ANTHROPIC_MODEL } from "lib";
import Anthropic from "@anthropic-ai/sdk";
import { openAlert } from "panther";
import { _SERVER_HOST } from "~/server_actions";

export const DEFAULT_MODEL_CONFIG = {
  model: DEFAULT_ANTHROPIC_MODEL,
  max_tokens: 4096,
};

export const DEFAULT_BUILTIN_TOOLS = { webSearch: true };

let limitAlertPending = false;

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
        const body = await response.clone().json().catch(() => ({}));
        const error = body?.error;
        if (error?.type === "daily_token_limit_exceeded" && !limitAlertPending) {
          limitAlertPending = true;
          const resetAt = error.resetAt ? new Date(error.resetAt) : null;
          const resetTimeStr = resetAt
            ? resetAt.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })
            : "midnight UTC";
          openAlert({
            title: "Daily AI limit reached",
            text: `You have reached your daily AI token limit. Your limit will reset at ${resetTimeStr}.`,
            intent: "danger",
          }).finally(() => {
            limitAlertPending = false;
          });
        }
      }
      return response;
    },
  });
}
