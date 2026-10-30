import { z } from "zod";
import type { RouteGuard } from "../permissions/mod.ts";
import type { APIResponseNoData, APIResponseWithData } from "../types/mod.ts";

// Defines one registry entry. `guard` is mandatory: the server installs the
// middleware from it and the client reads it. `orStatusKey` also admits a
// fleet machine call carrying the status key; `headless` opens the route to
// the headless app. `params` and `body` are real Zod schemas, validated per
// request; `response` stays a compile-time phantom (`{} as T`).
export function route<
  TPath extends string,
  TMethod extends "GET" | "POST" | "PUT" | "DELETE" | "PATCH",
  TParams extends z.ZodType | undefined = undefined,
  TBody extends z.ZodType | undefined = undefined,
  TResponse = never,
  TIsStreaming extends boolean = false,
  THeadless extends boolean = false,
>(config: {
  path: TPath;
  method: TMethod;
  guard: RouteGuard;
  orStatusKey?: true;
  headless?: THeadless;
  params?: TParams;
  body?: TBody;
  response?: TResponse;
  isStreaming?: TIsStreaming;
  timeoutMs?: number;
}) {
  const result: Record<string, unknown> = {
    path: config.path,
    method: config.method,
    guard: config.guard,
    orStatusKey: config.orStatusKey === true,
    headless: config.headless === true,
    response: config.response,
  };

  if (config.params !== undefined) result.params = config.params;
  if (config.body !== undefined) result.body = config.body;
  if (config.isStreaming !== undefined) result.isStreaming = config.isStreaming;
  if (config.timeoutMs !== undefined) result.timeoutMs = config.timeoutMs;

  // Use non-distributive form to avoid the distributive-conditional pitfall
  type InferredResponse = [TResponse] extends [never] ? APIResponseNoData
    : APIResponseWithData<TResponse>;

  return result as {
    path: TPath;
    method: TMethod;
    guard: RouteGuard;
    orStatusKey: boolean;
    headless: THeadless;
    params: TParams extends z.ZodType ? z.infer<TParams> : never;
    body: TBody extends z.ZodType ? z.infer<TBody> : never;
    response: InferredResponse;
    isStreaming: TIsStreaming;
    timeoutMs: number | undefined;
  };
}
