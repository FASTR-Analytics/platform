// Utility for creating type-safe route registries
import { z } from "zod";
import type { APIResponseNoData, APIResponseWithData } from "../types/mod.ts";

// Helper to define a route with type information.
// params and body must be Zod schemas (z.ZodType) — phantom {} as T is no longer accepted.
// response remains a compile-time phantom ({} as T) by design.
export function route<
  TPath extends string,
  TMethod extends "GET" | "POST" | "PUT" | "DELETE" | "PATCH",
  TParams extends z.ZodType | undefined = undefined,
  TBody extends z.ZodType | undefined = undefined,
  TResponse = never,
  TRequiresProject extends boolean = false,
  TIsStreaming extends boolean = false
>(config: {
  path: TPath;
  method: TMethod;
  params?: TParams;
  body?: TBody;
  response?: TResponse;
  requiresProject?: TRequiresProject;
  isStreaming?: TIsStreaming;
  timeoutMs?: number;
}) {
  const result: any = {
    path: config.path,
    method: config.method,
  };

  if (config.params !== undefined) result.params = config.params;
  if (config.body !== undefined) result.body = config.body;
  if (config.requiresProject !== undefined)
    result.requiresProject = config.requiresProject;
  if (config.isStreaming !== undefined) result.isStreaming = config.isStreaming;
  if (config.timeoutMs !== undefined) result.timeoutMs = config.timeoutMs;

  // response stays a compile-time phantom
  result.response = config.response;

  // Use non-distributive form to avoid the distributive-conditional pitfall
  type InferredResponse = [TResponse] extends [never]
    ? APIResponseNoData
    : APIResponseWithData<TResponse>;

  return result as {
    path: TPath;
    method: TMethod;
    params: TParams extends z.ZodType ? z.infer<TParams> : never;
    body: TBody extends z.ZodType ? z.infer<TBody> : never;
    response: InferredResponse;
    requiresProject: TRequiresProject;
    isStreaming: TIsStreaming;
    timeoutMs: number | undefined;
  };
}
