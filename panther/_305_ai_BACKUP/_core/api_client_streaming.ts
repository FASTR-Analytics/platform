// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type {
  AnthropicResponse,
  APIConfig,
  ContentBlock,
  MessageParam,
  MessagePayload,
  StreamEvent,
  ToolDefinition,
  Usage,
} from "./types.ts";

////////////////////////////////////////////////////////////////////////////////
// STREAMING CLIENT
////////////////////////////////////////////////////////////////////////////////

export async function callAIAPIStreaming(
  config: APIConfig,
  messages: MessageParam[],
  tools: ToolDefinition[] | undefined,
  conversationId: string | undefined,
  additionalPayload: Record<string, unknown>,
  onEvent: (event: StreamEvent) => void,
  onComplete: (response: AnthropicResponse) => Promise<void>,
  onError: (error: Error) => void,
): Promise<void> {
  const endpoint = typeof config.endpoint === "function"
    ? config.endpoint(conversationId)
    : config.endpoint;

  const payload: MessagePayload = {
    ...additionalPayload,
    messages,
    stream: true,
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

  try {
    const response = await fetch(endpoint, requestInit);

    if (!response.ok) {
      const errorText = await response.text().catch(() => "Unknown error");
      throw new Error(
        `API request failed: ${response.status} ${response.statusText} - ${errorText}`,
      );
    }

    const stream = config.transformStreamResponse
      ? config.transformStreamResponse(response)
      : parseSSEStream(response);

    await processStreamEvents(stream, onEvent, onComplete, onError);
  } catch (error) {
    onError(
      error instanceof Error ? error : new Error(String(error)),
    );
  }
}

////////////////////////////////////////////////////////////////////////////////
// STREAM PARSING
////////////////////////////////////////////////////////////////////////////////

function parseSSEStream(response: Response): ReadableStream<StreamEvent> {
  if (!response.body) {
    throw new Error("Response body is null");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  return new ReadableStream<StreamEvent>({
    async start(controller) {
      try {
        while (true) {
          const { done, value } = await reader.read();

          if (done) {
            controller.close();
            break;
          }

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";

          for (const line of lines) {
            if (line.startsWith("data: ")) {
              const data = line.slice(6);

              if (data === "[DONE]") {
                controller.close();
                return;
              }

              try {
                const event = JSON.parse(data) as StreamEvent;
                controller.enqueue(event);
              } catch (error) {
                console.error("Failed to parse SSE event:", error, data);
              }
            }
          }
        }
      } catch (error) {
        controller.error(error);
      }
    },
  });
}

////////////////////////////////////////////////////////////////////////////////
// STREAM PROCESSING
////////////////////////////////////////////////////////////////////////////////

async function processStreamEvents(
  stream: ReadableStream<StreamEvent>,
  onEvent: (event: StreamEvent) => void,
  onComplete: (response: AnthropicResponse) => void,
  onError: (error: Error) => void,
): Promise<void> {
  const reader = stream.getReader();
  const contentBlocks: ContentBlock[] = [];
  let stopReason: AnthropicResponse["stop_reason"] = "end_turn";
  let finalUsage: Usage | undefined;
  let messageId: string | undefined;
  let model: string | undefined;

  try {
    while (true) {
      const { done, value } = await reader.read();

      if (done) break;

      onEvent(value);

      switch (value.type) {
        case "message_start":
          messageId = value.message.id;
          model = value.message.model;
          finalUsage = value.message.usage;
          break;

        case "content_block_start":
          contentBlocks[value.index] = value.content_block;
          break;

        case "content_block_delta":
          if (value.delta.type === "text_delta") {
            const block = contentBlocks[value.index];
            if (block && block.type === "text") {
              block.text = (block.text ?? "") + value.delta.text;
            }
          } else if (value.delta.type === "input_json_delta") {
            const block = contentBlocks[value.index];
            if (block && block.type === "tool_use") {
              // Accumulate the partial JSON
              const currentJson = (block as any)._partialJson || "";
              (block as any)._partialJson = currentJson +
                value.delta.partial_json;

              // Try to parse the accumulated JSON
              try {
                block.input = JSON.parse((block as any)._partialJson);
              } catch (e) {
                // JSON not complete yet, keep accumulating
              }
            }
          }
          break;

        case "message_delta":
          stopReason = value.delta.stop_reason;
          if (value.usage) {
            finalUsage = value.usage;
          }
          break;

        case "error":
          onError(new Error(value.error.message));
          return;
      }
    }

    // Clean up temporary properties before completing
    contentBlocks.forEach((block) => {
      if (block && block.type === "tool_use") {
        delete (block as any)._partialJson;
      }
    });

    await onComplete({
      content: contentBlocks,
      stop_reason: stopReason,
      id: messageId,
      model,
      usage: finalUsage,
    });
  } catch (error) {
    onError(
      error instanceof Error ? error : new Error(String(error)),
    );
  }
}
