// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type { ContentBlock, Usage } from "./message_types.ts";

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
