// Utility for creating type-safe route registries
import type { APIResponseNoData, APIResponseWithData } from "../types/mod.ts";

// Helper to define a route with type information
export function route<
  TPath extends string,
  TMethod extends "GET" | "POST" | "PUT" | "DELETE" | "PATCH",
  TParams = never,
  TBody = never,
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
}) {
  // Return only path and method for runtime, but preserve type information
  const result: any = {
    path: config.path,
    method: config.method,
  };

  // Add type information that TypeScript can see but won't exist at runtime
  if (config.params !== undefined) result.params = config.params;
  if (config.body !== undefined) result.body = config.body;
  if (config.requiresProject !== undefined)
    result.requiresProject = config.requiresProject;
  if (config.isStreaming !== undefined) result.isStreaming = config.isStreaming;

  // Always add response field to match the type
  result.response = config.response;

  // Infer the actual response type based on whether response is provided
  type InferredResponse = TResponse extends never
    ? APIResponseNoData
    : APIResponseWithData<TResponse>;

  return result as {
    path: TPath;
    method: TMethod;
    params: TParams;
    body: TBody;
    response: InferredResponse;
    requiresProject: TRequiresProject;
    isStreaming: TIsStreaming;
  };
}

// No longer need BuildAPIRoutes - type information is embedded in the registry
