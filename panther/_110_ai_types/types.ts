// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

////////////////////////////////////////////////////////////////////////////////
// MESSAGE TYPES
////////////////////////////////////////////////////////////////////////////////

export type MessageRole = "user" | "assistant";

export type CacheControl = {
  type: "ephemeral";
};

////////////////////////////////////////////////////////////////////////////////
// EXTENDED THINKING TYPES
////////////////////////////////////////////////////////////////////////////////

export type ThinkingConfig =
  | { type: "enabled"; budget_tokens: number }
  | { type: "disabled" };

export type ThinkingBlock = {
  type: "thinking";
  thinking: string;
  signature: string;
};

export type RedactedThinkingBlock = {
  type: "redacted_thinking";
  data: string;
};

////////////////////////////////////////////////////////////////////////////////
// DOCUMENT TYPES (Files API)
////////////////////////////////////////////////////////////////////////////////

export type DocumentSource = {
  type: "file";
  file_id: string;
};

export type DocumentContentBlock = {
  type: "document";
  source: DocumentSource;
  title?: string;
  context?: string;
  citations?: { enabled: boolean };
  cache_control?: CacheControl;
};

////////////////////////////////////////////////////////////////////////////////
// CONTENT BLOCKS
////////////////////////////////////////////////////////////////////////////////

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
  }
  | ThinkingBlock
  | RedactedThinkingBlock
  | DocumentContentBlock;

export type MessageParam = {
  role: MessageRole;
  content: string | ContentBlock[];
  cache_control?: CacheControl;
};

export type Usage = {
  input_tokens: number;
  output_tokens: number;
  cache_creation_input_tokens?: number | null;
  cache_read_input_tokens?: number | null;
};

////////////////////////////////////////////////////////////////////////////////
// TOOL TYPES
////////////////////////////////////////////////////////////////////////////////

export type ToolDefinition = {
  name: string;
  description: string;
  input_schema: {
    type: "object";
    properties?: Record<string, unknown>;
    required?: string[];
    additionalProperties: false;
    [key: string]: unknown;
  };
};

////////////////////////////////////////////////////////////////////////////////
// MODEL TYPES
////////////////////////////////////////////////////////////////////////////////

export type AnthropicModel =
  // Claude 4.6 family (latest)
  | "claude-opus-4-6"
  // Claude 4.5 family
  | "claude-opus-4-5-20251101"
  | "claude-haiku-4-5-20251001"
  | "claude-sonnet-4-5-20250929"
  // Claude 4 family
  | "claude-opus-4-1-20250805"
  | "claude-opus-4-20250514"
  | "claude-sonnet-4-20250514"
  // Claude 3.7
  | "claude-3-7-sonnet-20250219"
  // Claude 3.5 (legacy)
  | "claude-3-5-haiku-20241022"
  // Claude 3 (legacy)
  | "claude-3-haiku-20240307"
  | string;

export type AnthropicModelConfig = {
  model: AnthropicModel;
  max_tokens: number;
  temperature?: number;
  top_p?: number;
  top_k?: number;
  stop_sequences?: string[];
  thinking?: ThinkingConfig;
  context1M?: boolean;
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

////////////////////////////////////////////////////////////////////////////////
// RESPONSE TYPES
////////////////////////////////////////////////////////////////////////////////

export type AnthropicResponse = {
  content: ContentBlock[];
  stop_reason: "end_turn" | "max_tokens" | "stop_sequence" | "tool_use";
  id?: string;
  model?: string;
  usage?: Usage;
};

export type StreamDelta =
  | { type: "text_delta"; text: string }
  | { type: "input_json_delta"; partial_json: string }
  | { type: "thinking_delta"; thinking: string }
  | { type: "signature_delta"; signature: string };

export type StreamEvent =
  | {
    type: "message_start";
    message: { id: string; model: string; role: "assistant"; usage: Usage };
  }
  | { type: "content_block_start"; index: number; content_block: ContentBlock }
  | {
    type: "content_block_delta";
    index: number;
    delta: StreamDelta;
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
