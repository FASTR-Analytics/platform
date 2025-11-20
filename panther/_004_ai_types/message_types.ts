// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

export type MessageRole = "user" | "assistant";

export type CacheControl = {
  type: "ephemeral";
};

/**
 * Content blocks that can appear in messages
 * Updated to match Anthropic SDK types
 */
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

/**
 * Token usage information
 * Updated to match Anthropic SDK - uses `null` instead of `undefined` for cache fields
 */
export type Usage = {
  input_tokens: number;
  output_tokens: number;
  cache_creation_input_tokens?: number | null;
  cache_read_input_tokens?: number | null;
};
