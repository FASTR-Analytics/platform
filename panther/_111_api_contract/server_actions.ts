// Copyright 2023-2026, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import {
  type APIResponseWithData,
  getApiResponseFromGenerator,
  type QueryState,
} from "./api_response.ts";
import {
  type AnyApiRoute,
  type ApiRegistry,
  getPathParamNames,
  type RouteArgsOf,
  type RouteResponseOf,
} from "./route.ts";

export type OnProgress = (msg: string) => void;

export type ServerActionsConfig = {
  baseUrl: string;
  fetch?: (url: string, init: RequestInit) => Promise<Response>;
  getHeaders?: (
    routeKey: string,
    args: Record<string, unknown>,
  ) => HeadersInit | Promise<HeadersInit>;
  onBeforeRequest?: (routeKey: string) => void | Promise<void>;
  onResponse?: (res: Response, routeKey: string) => void | Promise<void>;
};

export type ServerActionsType<TRegistry extends ApiRegistry> = {
  [K in keyof TRegistry]: (
    ...params: RouteActionParams<TRegistry[K]>
  ) => Promise<RouteResponseOf<TRegistry[K]>>;
};

export function createServerActions<TRegistry extends ApiRegistry>(
  registry: TRegistry,
  config: ServerActionsConfig,
): ServerActionsType<TRegistry> {
  const actions: Record<
    string,
    (...callParams: unknown[]) => Promise<unknown>
  > = {};
  for (const [routeKey, routeDef] of Object.entries(registry)) {
    actions[routeKey] = (...callParams: unknown[]) =>
      runAction(routeDef, routeKey, config, callParams);
  }
  return actions as ServerActionsType<TRegistry>;
}

type RouteArgsParam<R extends AnyApiRoute> = keyof RouteArgsOf<R> extends never
  ? []
  : [args: RouteArgsOf<R>];

type RouteActionParams<R extends AnyApiRoute> = R["isStreaming"] extends true
  ? [...RouteArgsParam<R>, onProgress?: OnProgress]
  : RouteArgsParam<R>;

async function runAction(
  routeDef: AnyApiRoute,
  routeKey: string,
  config: ServerActionsConfig,
  callParams: unknown[],
): Promise<APIResponseWithData<unknown>> {
  try {
    const { args, onProgress } = splitCallParams(routeDef, callParams);
    await config.onBeforeRequest?.(routeKey);
    const { url, bodyJson } = buildRequestParts(routeDef, config.baseUrl, args);
    const headers = new Headers();
    if (bodyJson !== undefined) {
      headers.set("content-type", "application/json");
    }
    if (config.getHeaders) {
      const extra = new Headers(await config.getHeaders(routeKey, args));
      extra.forEach((value, key) => headers.set(key, value));
    }
    const init: RequestInit = {
      method: routeDef.method,
      headers,
      body: bodyJson,
      signal: routeDef.timeoutMs !== undefined
        ? AbortSignal.timeout(routeDef.timeoutMs)
        : undefined,
    };
    const fetchFn = config.fetch ?? defaultFetch;
    const res = await fetchFn(url, init);
    await config.onResponse?.(res, routeKey);
    if (routeDef.isStreaming) {
      return await parseStreamingResponse(res, onProgress);
    }
    return await parseEnvelopeResponse(res);
  } catch (err) {
    return {
      success: false,
      err: err instanceof Error ? err.message : String(err),
    };
  }
}

function splitCallParams(
  routeDef: AnyApiRoute,
  callParams: unknown[],
): { args: Record<string, unknown>; onProgress: OnProgress | undefined } {
  const first = callParams[0];
  const args = typeof first === "object" && first !== null
    ? first as Record<string, unknown>
    : {};
  if (!routeDef.isStreaming) {
    return { args, onProgress: undefined };
  }
  const last = callParams[callParams.length - 1];
  const onProgress = typeof last === "function"
    ? last as OnProgress
    : undefined;
  return { args, onProgress };
}

function buildRequestParts(
  routeDef: AnyApiRoute,
  baseUrl: string,
  args: Record<string, unknown>,
): { url: string; bodyJson: string | undefined } {
  const pathParamNames = getPathParamNames(routeDef.path);
  let path = routeDef.path;
  for (const name of pathParamNames) {
    const value = args[name];
    if (value === undefined || value === null) {
      throw new Error(
        `Missing path param "${name}" for route path "${routeDef.path}"`,
      );
    }
    path = path.replace(`:${name}`, encodeURIComponent(String(value)));
  }
  const remaining = Object.entries(args).filter(
    ([key, value]) => !pathParamNames.includes(key) && value !== undefined,
  );
  if (routeDef.method === "GET") {
    const search = new URLSearchParams();
    for (const [key, value] of remaining) {
      search.append(key, String(value));
    }
    const queryString = search.toString();
    return {
      url: `${baseUrl}${path}${queryString === "" ? "" : `?${queryString}`}`,
      bodyJson: undefined,
    };
  }
  if (remaining.length === 0) {
    return { url: `${baseUrl}${path}`, bodyJson: undefined };
  }
  return {
    url: `${baseUrl}${path}`,
    bodyJson: JSON.stringify(Object.fromEntries(remaining)),
  };
}

async function parseEnvelopeResponse(
  res: Response,
): Promise<APIResponseWithData<unknown>> {
  const text = await res.text();
  const envelope = tryParseEnvelope(text);
  if (envelope !== undefined) {
    return envelope;
  }
  if (!res.ok) {
    return {
      success: false,
      err: `HTTP ${res.status} ${res.statusText}`.trim(),
    };
  }
  return { success: false, err: "Response is not a valid API envelope" };
}

function tryParseEnvelope(
  text: string,
): APIResponseWithData<unknown> | undefined {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return undefined;
  }
  if (
    typeof json !== "object" || json === null ||
    typeof (json as { success?: unknown }).success !== "boolean"
  ) {
    return undefined;
  }
  const envelope = json as { success: boolean; err?: unknown };
  if (envelope.success === false && typeof envelope.err !== "string") {
    return { success: false, err: "Unknown error" };
  }
  return envelope as APIResponseWithData<unknown>;
}

async function parseStreamingResponse(
  res: Response,
  onProgress: OnProgress | undefined,
): Promise<APIResponseWithData<unknown>> {
  if (!res.ok || res.body === null) {
    return await parseEnvelopeResponse(res);
  }
  return await getApiResponseFromGenerator(
    readQueryStateFrames(res.body, onProgress),
  );
}

async function* readQueryStateFrames(
  body: ReadableStream<Uint8Array>,
  onProgress: OnProgress | undefined,
): AsyncGenerator<QueryState<unknown>> {
  const decoder = new TextDecoder();
  const reader = body.getReader();
  let buffer = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        const frame = parseQueryStateFrame(line);
        if (frame !== undefined) {
          reportProgress(frame, onProgress);
          yield frame;
        }
      }
    }
    buffer += decoder.decode();
    const finalFrame = parseQueryStateFrame(buffer);
    if (finalFrame !== undefined) {
      reportProgress(finalFrame, onProgress);
      yield finalFrame;
    }
  } finally {
    reader.releaseLock();
  }
}

function parseQueryStateFrame(line: string): QueryState<unknown> | undefined {
  const trimmed = line.trim();
  if (trimmed === "") {
    return undefined;
  }
  const json = JSON.parse(trimmed) as { status?: unknown };
  if (
    typeof json === "object" && json !== null &&
    (json.status === "loading" || json.status === "ready" ||
      json.status === "error")
  ) {
    return json as QueryState<unknown>;
  }
  throw new Error(`Invalid stream frame: ${trimmed.slice(0, 100)}`);
}

function reportProgress(
  frame: QueryState<unknown>,
  onProgress: OnProgress | undefined,
): void {
  if (frame.status === "loading" && frame.msg !== undefined && onProgress) {
    onProgress(frame.msg);
  }
}

function defaultFetch(url: string, init: RequestInit): Promise<Response> {
  return globalThis.fetch(url, init);
}
