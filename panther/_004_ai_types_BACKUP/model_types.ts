// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type { CacheControl, MessageParam } from "./message_types.ts";
import type { ToolDefinition } from "./tool_types.ts";

export type AnthropicModel =
  | "claude-sonnet-4.5-20250929"
  | "claude-sonnet-4-20250522"
  | "claude-opus-4.1-20250522"
  | "claude-opus-4-20250522"
  | "claude-3.7-sonnet-20250224"
  | "claude-haiku-4.5-20250122"
  | "claude-3-5-sonnet-20241022"
  | "claude-3-5-sonnet-20240620"
  | "claude-3-5-haiku-20241022"
  | "claude-3-opus-20240229"
  | "claude-3-sonnet-20240229"
  | "claude-3-haiku-20240307"
  | string;

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
