// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type {
  AnthropicResponse,
  APIConfig,
  MessageParam,
  MessagePayload,
  ToolDefinition,
} from "./types.ts";

export async function callAIAPI(
  config: APIConfig,
  messages: MessageParam[],
  tools: ToolDefinition[] | undefined,
  conversationId: string | undefined,
  additionalPayload: Record<string, unknown>,
): Promise<AnthropicResponse> {
  const endpoint = typeof config.endpoint === "function"
    ? config.endpoint(conversationId)
    : config.endpoint;

  const payload: MessagePayload = {
    ...additionalPayload,
    messages,
    stream: false,
    ...(tools && tools.length > 0 ? { tools } : {}),
    ...(conversationId ? { conversationId } : {}),
  } as MessagePayload;

  let requestInit: RequestInit;

  if (config.transformRequest) {
    requestInit = await config.transformRequest(payload);
  } else {
    requestInit = {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    };
  }

  const response = await fetch(endpoint, requestInit);

  if (!response.ok) {
    const errorText = await response.text().catch(() => "Unknown error");
    throw new Error(
      `API request failed: ${response.status} ${response.statusText} - ${errorText}`,
    );
  }

  if (config.transformResponse) {
    return await config.transformResponse(response);
  }

  const data = await response.json();
  return data as AnthropicResponse;
}
