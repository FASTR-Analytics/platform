// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type { Component, JSX } from "solid-js";

////////////////////////////////////////////////////////////////////////////////
// MESSAGE TYPES
////////////////////////////////////////////////////////////////////////////////

export type MessageRole = "user" | "assistant";

export type CacheControl = {
  type: "ephemeral";
};

export type ContentBlock =
  | { type: "text"; text: string; cache_control?: CacheControl }
  | {
    type: "tool_use";
    id: string;
    name: string;
    input: unknown;
    cache_control?: CacheControl;
  }
  | {
    type: "tool_result";
    tool_use_id: string;
    content: string;
    is_error?: boolean;
    cache_control?: CacheControl;
  };

export type MessageParam = {
  role: MessageRole;
  content: string | ContentBlock[];
  cache_control?: CacheControl;
};

export type Usage = {
  input_tokens: number;
  output_tokens: number;
  cache_creation_input_tokens?: number;
  cache_read_input_tokens?: number;
};

export type AnthropicResponse = {
  content: ContentBlock[];
  stop_reason: "end_turn" | "max_tokens" | "stop_sequence" | "tool_use";
  id?: string;
  model?: string;
  usage?: Usage;
};

export type StreamEvent =
  | {
    type: "message_start";
    message: { id: string; model: string; role: "assistant"; usage: Usage };
  }
  | { type: "content_block_start"; index: number; content_block: ContentBlock }
  | {
    type: "content_block_delta";
    index: number;
    delta: { type: "text_delta"; text: string } | {
      type: "input_json_delta";
      partial_json: string;
    };
  }
  | { type: "content_block_stop"; index: number }
  | {
    type: "message_delta";
    delta: {
      stop_reason: AnthropicResponse["stop_reason"];
      stop_sequence?: string;
    };
    usage: Usage;
  }
  | { type: "message_stop" }
  | { type: "ping" }
  | { type: "error"; error: { type: string; message: string } };

////////////////////////////////////////////////////////////////////////////////
// TOOL TYPES
////////////////////////////////////////////////////////////////////////////////

export type AIToolHandler<TInput = unknown, TOutput = string> = (
  input: TInput,
) => Promise<TOutput>;

export type AITool<TInput = unknown, TOutput = string> = {
  name: string;
  description: string;
  input_schema: {
    type: "object";
    properties?: Record<string, unknown>;
    required?: string[];
    [key: string]: unknown;
  };
  handler: AIToolHandler<TInput, TOutput>;
  displayComponent?: Component<{ input: TInput }>;
  inProgressLabel?: string | ((input: TInput) => string);
};

export type ToolDefinition = {
  name: string;
  description: string;
  input_schema: AITool["input_schema"];
};

////////////////////////////////////////////////////////////////////////////////
// DISPLAY ITEM TYPES
////////////////////////////////////////////////////////////////////////////////

export type DisplayItem =
  | {
    type: "text";
    role: MessageRole;
    text: string;
  }
  | {
    type: "tool_in_progress";
    toolName: string;
    toolInput: unknown;
    label?: string;
  }
  | {
    type: "tool_error";
    toolName: string;
    errorMessage: string;
    toolInput?: unknown;
  }
  | {
    type: "tool_display";
    toolName: string;
    input: unknown;
  };

////////////////////////////////////////////////////////////////////////////////
// RENDERER TYPES
////////////////////////////////////////////////////////////////////////////////

export type DisplayItemRenderer<T = unknown> = Component<{ item: T }>;

export type DisplayRegistry = {
  text?: DisplayItemRenderer<Extract<DisplayItem, { type: "text" }>>;
  toolLoading?: DisplayItemRenderer<
    Extract<DisplayItem, { type: "tool_in_progress" }>
  >;
  toolError?: DisplayItemRenderer<
    Extract<DisplayItem, { type: "tool_error" }>
  >;
  default?: DisplayItemRenderer<DisplayItem>;
};

////////////////////////////////////////////////////////////////////////////////
// API CONFIGURATION TYPES
////////////////////////////////////////////////////////////////////////////////

export type AnthropicModel =
  | "claude-sonnet-4.5-20250929" // Latest (Sep 2025)
  | "claude-sonnet-4-20250522" // May 2025
  | "claude-opus-4.1-20250522" // May 2025
  | "claude-opus-4-20250522" // May 2025
  | "claude-3.7-sonnet-20250224" // Reasoning model (Feb 2025)
  | "claude-haiku-4.5-20250122" // Jan 2025
  | "claude-3-5-sonnet-20241022" // Oct 2024 (upgraded)
  | "claude-3-5-sonnet-20240620" // Jun 2024
  | "claude-3-5-haiku-20241022" // Oct 2024
  | "claude-3-opus-20240229" // Feb 2024
  | "claude-3-sonnet-20240229" // Feb 2024
  | "claude-3-haiku-20240307" // Mar 2024
  | string; // Allow future models

export type AnthropicModelConfig = {
  model: AnthropicModel;
  max_tokens: number;
  temperature?: number;
  top_p?: number;
  top_k?: number;
  stop_sequences?: string[];
  metadata?: {
    user_id?: string;
    [key: string]: unknown;
  };
};

export type MessagePayload = AnthropicModelConfig & {
  messages: MessageParam[];
  system?:
    | string
    | Array<{ type: "text"; text: string; cache_control?: CacheControl }>;
  tools?: ToolDefinition[];
  stream?: boolean;
  conversationId?: string;
  [key: string]: unknown;
};

export type APIConfig = {
  endpoint: string | ((conversationId?: string) => string);
  transformRequest?: (payload: MessagePayload) => Promise<RequestInit>;
  transformResponse?: (response: Response) => Promise<AnthropicResponse>;
  transformStreamResponse?: (response: Response) => ReadableStream<StreamEvent>;
};

////////////////////////////////////////////////////////////////////////////////
// CHAT CONFIGURATION TYPES
////////////////////////////////////////////////////////////////////////////////

export type AIChatConfig = {
  apiConfig: APIConfig;
  conversationId?: string;
  tools?: AITool[];
  modelConfig: AnthropicModelConfig;
  system?:
    | string
    | Array<{ type: "text"; text: string; cache_control?: CacheControl }>;
  enableStreaming?: boolean;
};

////////////////////////////////////////////////////////////////////////////////
// CHAT STATE TYPES
////////////////////////////////////////////////////////////////////////////////

export type ChatState = {
  messages: MessageParam[];
  displayItems: DisplayItem[];
  isLoading: boolean;
  isStreaming: boolean;
  error: string | null;
  usage: Usage | null;
  currentStreamingText: string | null;
};

////////////////////////////////////////////////////////////////////////////////
// COST ESTIMATION TYPES
////////////////////////////////////////////////////////////////////////////////

export type CostEstimate = {
  inputCost: number;
  outputCost: number;
  cacheCost: number;
  cacheReadCost: number;
  totalCost: number;
  currency: "USD";
};
