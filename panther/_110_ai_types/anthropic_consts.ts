// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type { AnthropicModel } from "./types.ts";

////////////////////////////////////////////////////////////////////////////////
// BETA HEADERS
////////////////////////////////////////////////////////////////////////////////

export const BETA_HEADERS = {
  STRUCTURED_OUTPUTS: "structured-outputs-2025-11-13",
  WEB_FETCH: "web-fetch-2025-09-10",
  INTERLEAVED_THINKING: "interleaved-thinking-2025-05-14",
  FILES_API: "files-api-2025-04-14",
  CONTEXT_1M: "context-1m-2025-08-07",
  COMPUTER_USE: "computer-use-2025-11-24",
  COMPUTER_USE_LEGACY: "computer-use-2025-01-24",
  FAST_MODE: "fast-mode-2026-02-01",
  OUTPUT_300K: "output-300k-2026-03-24",
} as const;

////////////////////////////////////////////////////////////////////////////////
// BUILT-IN TOOL TYPE IDS
////////////////////////////////////////////////////////////////////////////////

export const BUILTIN_TOOL_TYPES = {
  WEB_SEARCH: "web_search_20250305",
  WEB_FETCH: "web_fetch_20250910",
  BASH: "bash_20250124",
  TEXT_EDITOR: "text_editor_20250728",
} as const;

////////////////////////////////////////////////////////////////////////////////
// MODEL PRICING (USD per 1M tokens)
////////////////////////////////////////////////////////////////////////////////

export type ModelPricing = {
  inputPer1M: number;
  outputPer1M: number;
  cacheWritePer1M: number;
  cacheReadPer1M: number;
};

export const MODEL_PRICING: Record<string, ModelPricing> = {
  "claude-opus-4-6": {
    inputPer1M: 5.00,
    outputPer1M: 25.00,
    cacheWritePer1M: 6.25,
    cacheReadPer1M: 0.50,
  },
  "claude-sonnet-4-6": {
    inputPer1M: 3.00,
    outputPer1M: 15.00,
    cacheWritePer1M: 3.75,
    cacheReadPer1M: 0.30,
  },
  "claude-opus-4-5-20251101": {
    inputPer1M: 5.00,
    outputPer1M: 25.00,
    cacheWritePer1M: 6.25,
    cacheReadPer1M: 0.50,
  },
  "claude-sonnet-4-5-20250929": {
    inputPer1M: 3.00,
    outputPer1M: 15.00,
    cacheWritePer1M: 3.75,
    cacheReadPer1M: 0.30,
  },
  "claude-haiku-4-5-20251001": {
    inputPer1M: 1.00,
    outputPer1M: 5.00,
    cacheWritePer1M: 1.25,
    cacheReadPer1M: 0.10,
  },
  "claude-opus-4-1-20250805": {
    inputPer1M: 15.00,
    outputPer1M: 75.00,
    cacheWritePer1M: 18.75,
    cacheReadPer1M: 1.50,
  },
  "claude-opus-4-20250514": {
    inputPer1M: 15.00,
    outputPer1M: 75.00,
    cacheWritePer1M: 18.75,
    cacheReadPer1M: 1.50,
  },
  "claude-sonnet-4-20250514": {
    inputPer1M: 3.00,
    outputPer1M: 15.00,
    cacheWritePer1M: 3.75,
    cacheReadPer1M: 0.30,
  },
  "claude-3-7-sonnet-20250219": {
    inputPer1M: 3.00,
    outputPer1M: 15.00,
    cacheWritePer1M: 3.75,
    cacheReadPer1M: 0.30,
  },
  "claude-3-5-sonnet-20241022": {
    inputPer1M: 3.00,
    outputPer1M: 15.00,
    cacheWritePer1M: 3.75,
    cacheReadPer1M: 0.30,
  },
  "claude-3-5-sonnet-20240620": {
    inputPer1M: 3.00,
    outputPer1M: 15.00,
    cacheWritePer1M: 3.75,
    cacheReadPer1M: 0.30,
  },
  "claude-3-5-haiku-20241022": {
    inputPer1M: 0.80,
    outputPer1M: 4.00,
    cacheWritePer1M: 1.00,
    cacheReadPer1M: 0.08,
  },
  "claude-3-opus-20240229": {
    inputPer1M: 15.00,
    outputPer1M: 75.00,
    cacheWritePer1M: 18.75,
    cacheReadPer1M: 1.50,
  },
  "claude-3-sonnet-20240229": {
    inputPer1M: 3.00,
    outputPer1M: 15.00,
    cacheWritePer1M: 3.75,
    cacheReadPer1M: 0.30,
  },
  "claude-3-haiku-20240307": {
    inputPer1M: 0.25,
    outputPer1M: 1.25,
    cacheWritePer1M: 0.31,
    cacheReadPer1M: 0.03,
  },
};

export const DEFAULT_PRICING: ModelPricing = {
  inputPer1M: 3.00,
  outputPer1M: 15.00,
  cacheWritePer1M: 3.75,
  cacheReadPer1M: 0.30,
};

////////////////////////////////////////////////////////////////////////////////
// MODEL OPTIONS (for UI dropdowns)
////////////////////////////////////////////////////////////////////////////////

export const MODEL_OPTIONS: { value: AnthropicModel; label: string }[] = [
  { value: "claude-opus-4-6", label: "Claude Opus 4.6" },
  { value: "claude-sonnet-4-6", label: "Claude Sonnet 4.6" },
  { value: "claude-opus-4-5-20251101", label: "Claude Opus 4.5" },
  { value: "claude-sonnet-4-5-20250929", label: "Claude Sonnet 4.5" },
  { value: "claude-haiku-4-5-20251001", label: "Claude Haiku 4.5" },
  { value: "claude-opus-4-1-20250805", label: "Claude Opus 4.1" },
  { value: "claude-opus-4-20250514", label: "Claude Opus 4" },
  { value: "claude-sonnet-4-20250514", label: "Claude Sonnet 4" },
  { value: "claude-3-7-sonnet-20250219", label: "Claude 3.7 Sonnet" },
];

////////////////////////////////////////////////////////////////////////////////
// OUTPUT TOKEN LIMITS
////////////////////////////////////////////////////////////////////////////////

export const MAX_OUTPUT_TOKENS = {
  MIN: 256,
  MAX: 128_000,
  STEP: 256,
} as const;

////////////////////////////////////////////////////////////////////////////////
// SERVER TOOL LABELS (display strings for built-in tools)
////////////////////////////////////////////////////////////////////////////////

export const SERVER_TOOL_LABELS: Record<string, string> = {
  web_search: "Searching the web...",
  str_replace_based_edit_tool: "Editing document...",
};
