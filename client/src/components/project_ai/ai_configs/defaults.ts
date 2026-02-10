import { DEFAULT_ANTHROPIC_MODEL } from "lib";
import { createSDKClient } from "panther";
import { _SERVER_HOST } from "~/server_actions/config";

export const DEFAULT_MODEL_CONFIG = {
  model: DEFAULT_ANTHROPIC_MODEL,
  max_tokens: 4096,
};

export const DEFAULT_BUILTIN_TOOLS = { webSearch: true };

export function createProjectSDKClient(projectId: string) {
  const baseURL = _SERVER_HOST
    ? `${_SERVER_HOST}/ai`
    : `${window.location.origin}/ai`;
  return createSDKClient({
    baseURL,
    defaultHeaders: { "Project-Id": projectId },
  });
}
