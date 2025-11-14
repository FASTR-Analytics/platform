// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

////////////////////////////////////////////////////////////////////////////////
// RE-EXPORT CORE AI TYPES (from _004_ai_types via deps)
////////////////////////////////////////////////////////////////////////////////

export type {
  AnthropicModel,
  AnthropicModelConfig,
  AnthropicResponse,
  CacheControl,
  ContentBlock,
  MessageParam,
  MessagePayload,
  MessageRole,
  StreamEvent,
  ToolDefinition,
  Usage,
} from "../deps.ts";

import type {
  AnthropicModel,
  AnthropicModelConfig,
  AnthropicResponse,
  CacheControl,
  Component,
  ContentBlock,
  JSX,
  MessageParam,
  MessagePayload,
  MessageRole,
  StreamEvent,
  ToolDefinition,
  Usage,
} from "../deps.ts";

////////////////////////////////////////////////////////////////////////////////
// TOOL TYPES (UI-SPECIFIC)
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
// API CONFIGURATION TYPES (UI-SPECIFIC)
////////////////////////////////////////////////////////////////////////////////

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
  renderMarkdown?: boolean;
  userMessageClass?: string;
  assistantMessageClass?: string;
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
