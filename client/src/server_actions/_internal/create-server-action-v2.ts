import { ProgressCallback } from "lib";
import { _SERVER_HOST } from "../config";
import { consumeStream } from "./consume_stream";
import { tryCatchServer } from "./try_catch_server";

// Shared request building logic (extracted from v1 createServerAction)
function buildRequestParams(
  path: string,
  args: any,
  requiresProject?: boolean,
) {
  let url = path;
  let projectId: string | undefined;

  // Parse URL to find param placeholders
  const paramMatches = url.match(/:(\w+)/g);
  const paramNames = new Set(paramMatches?.map((p) => p.substring(1)) || []);

  // Build URL with params
  if (paramMatches) {
    paramMatches.forEach((param) => {
      const paramName = param.substring(1);
      if (args && paramName in args) {
        url = url.replace(param, args[paramName]);
      }
    });
  }

  // Extract projectId if route requires it
  if (requiresProject) {
    if (!args || !args.projectId) {
      throw new Error(`Route ${path} requires projectId but none was provided`);
    }
    projectId = args.projectId;
  }

  // Everything not used in URL goes to body (except projectId)
  const bodyData = {} as any;
  let hasBody = false;

  if (args && typeof args === "object") {
    for (const key in args) {
      if (!paramNames.has(key) && (key !== "projectId" || !requiresProject)) {
        bodyData[key] = args[key];
        hasBody = true;
      }
    }
  }

  const headers: any = {};
  if (projectId && requiresProject) {
    headers["Project-Id"] = projectId;
  }

  return {
    url,
    hasBody,
    bodyData,
    headers,
  };
}

// Replicated v1 createServerAction for completeness
function createServerAction(
  path: string,
  method: string,
  requiresProject?: boolean,
) {
  return async (args: any): Promise<any> => {
    const { url, hasBody, bodyData, headers } = buildRequestParams(
      path,
      args,
      requiresProject,
    );

    return await tryCatchServer(`${_SERVER_HOST}${url}`, {
      method: method,
      body: hasBody ? JSON.stringify(bodyData) : undefined,
      credentials: "include",
      headers: Object.keys(headers).length > 0 ? headers : undefined,
    });
  };
}

// Enhanced server action creator that supports both regular and streaming routes
export function createServerActionV2(
  path: string,
  method: string,
  requiresProject?: boolean,
  isStreaming?: boolean,
) {
  // For non-streaming routes, delegate to existing v1 implementation
  if (!isStreaming) {
    return createServerAction(path, method, requiresProject);
  }

  // For streaming routes, return the streaming function directly
  return async (args: any, onProgress?: ProgressCallback): Promise<any> => {
    const { url, hasBody, bodyData, headers } = buildRequestParams(
      path,
      args,
      requiresProject,
    );

    // Use fetch directly for streaming
    const response = await fetch(`${_SERVER_HOST}${url}`, {
      method: method,
      body: hasBody ? JSON.stringify(bodyData) : undefined,
      credentials: "include",
      headers: Object.keys(headers).length > 0 ? headers : undefined,
    });

    return await consumeStream(response, onProgress);
  };
}
