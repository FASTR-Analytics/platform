// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

////////////////////////////////////////////////////////////////////////////////
// RE-EXPORT CORE AI TYPES
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
  RedactedThinkingBlock,
  StreamDelta,
  StreamEvent,
  ThinkingBlock,
  ThinkingConfig,
  ToolDefinition,
  Usage,
} from "./ai_types.ts";

import type { Anthropic, Component } from "../deps.ts";
import type {
  AnthropicModelConfig,
  AnthropicResponse,
  CacheControl,
  MessageParam,
  MessagePayload,
  MessageRole,
  StreamEvent,
  Usage,
} from "./ai_types.ts";
import type { BuiltInTool } from "./builtin_tools.ts";
import type { AIToolWithMetadata } from "./tool_helpers.ts";

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
    additionalProperties: false;
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
    type: "thinking";
    thinking: string;
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
  thinking?: DisplayItemRenderer<Extract<DisplayItem, { type: "thinking" }>>;
  toolLoading?: DisplayItemRenderer<
    Extract<DisplayItem, { type: "tool_in_progress" }>
  >;
  toolError?: DisplayItemRenderer<Extract<DisplayItem, { type: "tool_error" }>>;
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
// MESSAGE STYLE TYPES
////////////////////////////////////////////////////////////////////////////////

export type MessageBackgroundColor =
  | "bg-primary/10"
  | "bg-base-200"
  | "bg-success/20";

export type MessageTextColor =
  | "text-primary"
  | "text-base-content"
  | "text-success";

export type MessageStyle = {
  background?: MessageBackgroundColor;
  text?: MessageTextColor;
};

export type MessageStyles = {
  user?: MessageStyle;
  assistant?: MessageStyle;
};

////////////////////////////////////////////////////////////////////////////////
// CHAT CONFIGURATION TYPES
////////////////////////////////////////////////////////////////////////////////

export type AIChatConfig = {
  sdkClient: Anthropic;

  conversationId?: string;

  tools?: AIToolWithMetadata[];

  builtInTools?: BuiltInTool[];

  modelConfig: AnthropicModelConfig;

  system?:
    | string
    | Array<{ type: "text"; text: string; cache_control?: CacheControl }>;

  enableStreaming?: boolean;

  apiConfig?: APIConfig;

  messageStyles?: MessageStyles;
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
  currentStreamingText: string | undefined;
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
