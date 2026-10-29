import Anthropic from "@anthropic-ai/sdk";
import { _SERVER_HOST } from "~/server_actions";
import { AI_DEBUG } from "~/state/t4_ui";

// Web search alone: web fetch would carry anything the conversation holds
// (a tool result, an error quoting its input) to any host the model names.
export const DEFAULT_BUILTIN_TOOLS = { webSearch: true };

const ISO_RE = /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z/;

// One request the chat sent to the proxy, as the model receives it: the body
// is the JSON the SDK serialised (system, messages, tools, model, sampling),
// which the proxy forwards unchanged, and the beta header is the one it
// filters. Recorded only under AI_DEBUG, bounded, newest last.
export type CopilotRequestRecord = {
  at: string;
  status: number | null;
  betaHeader: string | null;
  body: unknown;
};

const MAX_RECORDED_REQUESTS = 100;
const recorded: CopilotRequestRecord[] = [];

export function copilotRequests(): CopilotRequestRecord[] {
  return [...recorded];
}

function headerValue(
  headers: HeadersInit | undefined,
  name: string,
): string | null {
  if (headers === undefined) return null;
  return new Headers(headers).get(name);
}

function parseBody(body: BodyInit | null | undefined): unknown {
  if (typeof body !== "string") return body ?? null;
  try {
    return JSON.parse(body);
  } catch {
    return body;
  }
}

function record(init: RequestInit | undefined): CopilotRequestRecord {
  const entry: CopilotRequestRecord = {
    at: new Date().toISOString(),
    status: null,
    betaHeader: headerValue(init?.headers, "anthropic-beta"),
    body: parseBody(init?.body),
  };
  recorded.push(entry);
  if (recorded.length > MAX_RECORDED_REQUESTS) recorded.shift();
  return entry;
}

// One SDK client for the whole copilot: /ai is the instance-level copilot
// proxy (routes/instance/copilot_ai_proxy.ts), guarded by requireApprovedUser.
// It sends no credential: the guard reads the Clerk session cookie, and Clerk
// judges any Authorization header first, so a placeholder bearer would 401.
export function createCopilotSDKClient() {
  const baseURL = _SERVER_HOST
    ? `${_SERVER_HOST}/ai`
    : `${window.location.origin}/ai`;
  return new Anthropic({
    apiKey: null,
    authToken: null,
    defaultHeaders: { Authorization: null },
    baseURL,
    dangerouslyAllowBrowser: true,
    fetch: async (url: RequestInfo | URL, init?: RequestInit) => {
      const entry = AI_DEBUG && init?.method?.toUpperCase() === "POST"
        ? record(init)
        : undefined;
      const response = await globalThis.fetch(url, init);
      if (entry !== undefined) entry.status = response.status;
      if (response.status === 429) {
        const body = await response.clone().json().catch(() => null);
        const msg: string = body?.error?.message ?? "";
        const isoMatch = msg.match(ISO_RE);
        if (isoMatch) {
          const localTime = new Date(isoMatch[0]).toLocaleString(undefined, {
            dateStyle: "full",
            timeStyle: "short",
          });
          const newMsg = msg.replace(isoMatch[0], localTime);
          return new Response(
            JSON.stringify({
              ...body,
              error: { ...body.error, message: newMsg },
            }),
            { status: 429, headers: { "Content-Type": "application/json" } },
          );
        }
      }
      return response;
    },
  });
}
