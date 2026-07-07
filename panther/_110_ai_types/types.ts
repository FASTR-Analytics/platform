// Copyright 2023-2026, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

////////////////////////////////////////////////////////////////////////////////
// MESSAGE TYPES
////////////////////////////////////////////////////////////////////////////////

// "system" is a mid-conversation operator message — accepted only by models
// where supportsMidConversationSystem is true; payload shaping drops such
// messages for other models.
export type MessageRole = "user" | "assistant" | "system";

export type CacheControl = {
  type: "ephemeral";
};

////////////////////////////////////////////////////////////////////////////////
// EXTENDED THINKING TYPES
////////////////////////////////////////////////////////////////////////////////

export type ThinkingConfig =
  | { type: "enabled"; budget_tokens: number }
  | { type: "disabled" }
  // Adaptive thinking (Claude 4.6+): the model decides when and how much to
  // think. display controls whether thinking summaries are returned —
  // "omitted" (the default on 4.7+) streams thinking blocks with empty text.
  | { type: "adaptive"; display?: "summarized" | "omitted" };

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
  // Claude 5 family (latest)
  | "claude-fable-5"
  | "claude-sonnet-5"
  // Claude 4.7 / 4.8
  | "claude-opus-4-8"
  | "claude-opus-4-7"
  // Claude 4.6 family
  | "claude-opus-4-6"
  | "claude-sonnet-4-6"
  // Claude 4.5 family
  | "claude-opus-4-5-20251101"
  | "claude-haiku-4-5"
  | "claude-haiku-4-5-20251001"
  | "claude-sonnet-4-5-20250929"
  // Claude 4.1 (deprecated, retires 2026-08-05)
  | "claude-opus-4-1-20250805"
  | string;

// Effort (GA, no beta header) controls thinking depth and overall token
// spend. Per-model support varies — see getSupportedEffortLevels.
export type EffortLevel = "low" | "medium" | "high" | "xhigh" | "max";

export type OutputConfig = {
  effort?: EffortLevel;
};

export type AnthropicModelConfig = {
  model: AnthropicModel;
  max_tokens: number;
  temperature?: number;
  stop_sequences?: string[];
  thinking?: ThinkingConfig;
  output_config?: OutputConfig;
  metadata?: {
    user_id?: string;
    [key: string]: unknown;
  };
};

// Request-body shape for proxy servers that validate/forward Messages API
// requests (used by consumer proxy code, e.g. ai-server). Response and
// stream-event types are NOT hand-rolled here — use the SDK's types for
// those; hand-rolled copies drift.
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
