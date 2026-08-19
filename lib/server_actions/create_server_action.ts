import type {
  APIResponseNoData,
  APIResponseWithData,
  ProgressCallback,
} from "../types/mod.ts";
import type { ServerActionsType } from "../api-routes/server-action-types.ts";
import { routeRegistry } from "../api-routes/combined.ts";
import type { ServerActionTransport } from "./transport.ts";
import { getServerActionTransport } from "./transport.ts";
import { tryCatchServer } from "./try_catch_server.ts";

// The optional explicit transport (PLAN_112 D4) binds this action set to one
// caller's credentials — the /mcp endpoint builds one per PAT. Omitted = the
// process-global singleton, resolved per call exactly as before (the SPA
// registers it at boot, after this module initializes).
export function createAllServerActions(
  transport?: ServerActionTransport,
): ServerActionsType {
  const actions: any = {};
  for (const [functionName, route] of Object.entries(routeRegistry)) {
    actions[functionName] = createServerAction(
      route.path as any,
      route.method as any,
      (route as any).isStreaming,
      (route as any).timeoutMs,
      transport,
    );
  }
  return actions as ServerActionsType;
}

function createServerAction(
  path: string,
  method: string,
  isStreaming?: boolean,
  timeoutMs?: number,
  explicitTransport?: ServerActionTransport,
) {
  return async (args: any, onProgress?: ProgressCallback): Promise<any> => {
    const transport = explicitTransport ?? getServerActionTransport();
    const { url, hasBody, bodyData } = buildRequestParams(path, args);
    const methodUpper = method.toUpperCase();
    const canHaveBody = methodUpper !== "GET" && methodUpper !== "HEAD";
    const mergedHeaders = transport.getHeaders();
    const init: RequestInit = {
      method,
      body: hasBody && canHaveBody ? JSON.stringify(bodyData) : undefined,
      credentials: transport.credentials,
      headers: Object.keys(mergedHeaders).length > 0
        ? mergedHeaders
        : undefined,
    };
    if (!isStreaming) {
      return await tryCatchServer(
        `${transport.baseUrl}${url}`,
        init,
        timeoutMs,
        transport,
      );
    }
    // Session refresh before long-running stream — no timeout/retry: an AbortController
    // timeout would kill legitimately long streams, and replaying a non-idempotent
    // streaming POST is wrong.
    await transport.refreshSession();
    const doFetch = transport.fetchImpl ??
      ((input: string, i: RequestInit) => fetch(input, i));
    const response = await doFetch(`${transport.baseUrl}${url}`, init);
    return await consumeStream(response, onProgress);
  };
}

function buildRequestParams(path: string, args: any) {
  let url = path;

  const paramMatches = url.match(/:(\w+)/g);
  const paramNames = new Set(paramMatches?.map((p) => p.substring(1)) || []);

  if (paramMatches) {
    paramMatches.forEach((param) => {
      const paramName = param.substring(1);
      if (args && paramName in args) {
        url = url.replace(param, encodeURIComponent(args[paramName]));
      }
    });
  }

  const bodyData = {} as any;
  let hasBody = false;
  if (args && typeof args === "object") {
    for (const key in args) {
      if (!paramNames.has(key)) {
        bodyData[key] = args[key];
        hasBody = true;
      }
    }
  }

  return { url, hasBody, bodyData };
}

async function consumeStream<T = void>(
  response: Response,
  onProgress?: ProgressCallback,
): Promise<T extends void ? APIResponseNoData : APIResponseWithData<T>> {
  if (!response.ok) {
    const errorText = await response.text();
    try {
      const parsed = JSON.parse(errorText);
      if (
        parsed && parsed.success === false && typeof parsed.err === "string"
      ) {
        return parsed as any;
      }
    } catch {
      // not a JSON envelope — fall through to raw text
    }
    return {
      success: false,
      err: errorText || `HTTP ${response.status}`,
    } as any;
  }

  const contentType = response.headers.get("content-type");
  if (contentType?.includes("application/json")) {
    const result = await response.json();
    return result as any;
  }

  if (!response.body) {
    return { success: false, err: "Response has no body" } as any;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        if (line.trim() === "") continue;
        try {
          const message: any = JSON.parse(line);
          if (message.progress === -1) {
            onProgress?.(0, message.message);
            return message.result || { success: false, err: message.message };
          } else if (message.progress === 1) {
            onProgress?.(message.progress, message.message);
            return message.result || { success: true };
          } else {
            onProgress?.(message.progress, message.message);
          }
        } catch {
          console.warn("Failed to parse streaming message:", line);
        }
      }
    }
    // Process any remaining data in the buffer (stream ended without trailing newline)
    if (buffer.trim()) {
      try {
        const message: any = JSON.parse(buffer);
        if (message.progress === -1) {
          onProgress?.(0, message.message);
          return message.result || { success: false, err: message.message };
        } else if (message.progress === 1) {
          onProgress?.(message.progress, message.message);
          return message.result || { success: true };
        }
      } catch {
        console.warn("Failed to parse trailing streaming message:", buffer);
      }
    }
    return { success: false, err: "Stream ended unexpectedly" } as any;
  } finally {
    reader.releaseLock();
  }
}
