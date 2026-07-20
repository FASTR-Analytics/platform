// Copyright 2023-2026, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type { AnthropicModel, EffortLevel } from "./types.ts";

////////////////////////////////////////////////////////////////////////////////
// BETA HEADERS
////////////////////////////////////////////////////////////////////////////////

// Only betas actually sent by the request paths. WEB_FETCH is needed only
// for the basic web_fetch_20250910 variant on pre-4.6 models; the _20260209
// web tools and plain tool use need no beta header.
export const BETA_HEADERS = {
  WEB_FETCH: "web-fetch-2025-09-10",
  FILES_API: "files-api-2025-04-14",
} as const;

////////////////////////////////////////////////////////////////////////////////
// BUILT-IN TOOL TYPE IDS
////////////////////////////////////////////////////////////////////////////////

// The _20260209 web tools (dynamic filtering, GA — no beta header) require
// the 4.6 family or later; the basic variants remain for older models
// (web_fetch_20250910 still needs the WEB_FETCH beta header).
export const BUILTIN_TOOL_TYPES = {
  WEB_SEARCH: "web_search_20260209",
  WEB_FETCH: "web_fetch_20260209",
  WEB_SEARCH_BASIC: "web_search_20250305",
  WEB_FETCH_BASIC: "web_fetch_20250910",
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
  "claude-fable-5": {
    inputPer1M: 10.00,
    outputPer1M: 50.00,
    cacheWritePer1M: 12.50,
    cacheReadPer1M: 1.00,
  },
  // Sonnet 5 is at introductory pricing ($2 / $10) through 2026-08-31.
  // Standard pricing is recorded here so displayed costs are a conservative
  // overestimate during the intro window rather than silently wrong after it.
  "claude-sonnet-5": {
    inputPer1M: 3.00,
    outputPer1M: 15.00,
    cacheWritePer1M: 3.75,
    cacheReadPer1M: 0.30,
  },
  "claude-opus-4-8": {
    inputPer1M: 5.00,
    outputPer1M: 25.00,
    cacheWritePer1M: 6.25,
    cacheReadPer1M: 0.50,
  },
  "claude-opus-4-7": {
    inputPer1M: 5.00,
    outputPer1M: 25.00,
    cacheWritePer1M: 6.25,
    cacheReadPer1M: 0.50,
  },
  "claude-haiku-4-5": {
    inputPer1M: 1.00,
    outputPer1M: 5.00,
    cacheWritePer1M: 1.25,
    cacheReadPer1M: 0.10,
  },
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

// Model IDs retired from the API (requests return 404). Used as a blocklist
// when sanitizing persisted settings — an allowlist would wrongly drop
// active models kept out of the UI dropdown and custom model names used
// with proxy backends (the AnthropicModel union is deliberately open).
export const RETIRED_MODEL_IDS: string[] = [
  "claude-sonnet-4-20250514",
  "claude-opus-4-20250514",
  "claude-3-7-sonnet-20250219",
  "claude-3-5-haiku-20241022",
  "claude-3-5-sonnet-20241022",
  "claude-3-5-sonnet-20240620",
  "claude-3-opus-20240229",
  "claude-3-sonnet-20240229",
  "claude-3-haiku-20240307",
  "claude-2.1",
  "claude-2.0",
];

export const MODEL_OPTIONS: { value: AnthropicModel; label: string }[] = [
  { value: "claude-fable-5", label: "Claude Fable 5" },
  { value: "claude-opus-4-8", label: "Claude Opus 4.8" },
  { value: "claude-sonnet-5", label: "Claude Sonnet 5" },
  { value: "claude-opus-4-7", label: "Claude Opus 4.7" },
  { value: "claude-opus-4-6", label: "Claude Opus 4.6" },
  { value: "claude-sonnet-4-6", label: "Claude Sonnet 4.6" },
  { value: "claude-haiku-4-5", label: "Claude Haiku 4.5" },
  { value: "claude-opus-4-5-20251101", label: "Claude Opus 4.5" },
  { value: "claude-sonnet-4-5-20250929", label: "Claude Sonnet 4.5" },
];

////////////////////////////////////////////////////////////////////////////////
// OUTPUT TOKEN LIMITS
////////////////////////////////////////////////////////////////////////////////

export const MAX_OUTPUT_TOKENS = {
  MIN: 256,
  MAX: 128_000,
  STEP: 256,
} as const;

// Per-model output caps where they differ from the 128K default.
// Keys are ID prefixes so dated snapshots and undated aliases both match
// (e.g. "claude-haiku-4-5" covers "claude-haiku-4-5-20251001").
export const MODEL_MAX_OUTPUT_TOKENS: Record<string, number> = {
  "claude-haiku-4-5": 64_000,
  "claude-opus-4-5": 64_000,
  "claude-sonnet-4-5": 64_000,
  "claude-opus-4-1": 32_000,
};

export function getMaxOutputTokens(model: AnthropicModel): number {
  for (const [prefix, cap] of Object.entries(MODEL_MAX_OUTPUT_TOKENS)) {
    if (model.startsWith(prefix)) return cap;
  }
  return MAX_OUTPUT_TOKENS.MAX;
}

////////////////////////////////////////////////////////////////////////////////
// MODEL CAPABILITY CHECKS
////////////////////////////////////////////////////////////////////////////////

// Models from Opus 4.7 onward reject non-default sampling parameters
// (temperature, top_p, top_k) and manual extended thinking
// (thinking: {type: "enabled", budget_tokens}) with a 400 error. They use
// adaptive thinking and the output_config.effort parameter instead.
// Matched by prefix so dated snapshot IDs are covered.
// (claude-mythos-5 is the Project Glasswing sibling of claude-fable-5 with
// identical API behavior — verified against the Anthropic migration guide,
// 2026-07.)
const ADAPTIVE_ONLY_MODEL_PREFIXES = [
  "claude-opus-4-7",
  "claude-opus-4-8",
  "claude-sonnet-5",
  "claude-fable-5",
  "claude-mythos-5",
];

// Fable 5 / Mythos 5 have always-on thinking: an explicit
// thinking: {type: "disabled"} is also rejected with a 400 — the parameter
// must be omitted entirely. All other models accept explicit disabled.
const ALWAYS_ON_THINKING_MODEL_PREFIXES = [
  "claude-fable-5",
  "claude-mythos-5",
];

function isAdaptiveOnlyModel(model: AnthropicModel): boolean {
  return ADAPTIVE_ONLY_MODEL_PREFIXES.some((p) => model.startsWith(p));
}

export function supportsSamplingParams(model: AnthropicModel): boolean {
  return !isAdaptiveOnlyModel(model);
}

export function supportsManualThinking(model: AnthropicModel): boolean {
  return !isAdaptiveOnlyModel(model);
}

export function supportsDisabledThinking(model: AnthropicModel): boolean {
  return !ALWAYS_ON_THINKING_MODEL_PREFIXES.some((p) => model.startsWith(p));
}

// Adaptive thinking ({type: "adaptive"}) launched with the 4.6 family and is
// the only thinking mode on 4.7+; pre-4.6 models reject it.
const ADAPTIVE_CAPABLE_MODEL_PREFIXES = [
  "claude-opus-4-6",
  "claude-sonnet-4-6",
  ...ADAPTIVE_ONLY_MODEL_PREFIXES,
];

export function supportsAdaptiveThinking(model: AnthropicModel): boolean {
  return ADAPTIVE_CAPABLE_MODEL_PREFIXES.some((p) => model.startsWith(p));
}

// The _20260209 web tools (dynamic filtering) launched for the 4.6 family
// and later — the same model set that gained adaptive thinking. Older
// models keep the basic variants.
export function supportsDynamicWebTools(model: AnthropicModel): boolean {
  return ADAPTIVE_CAPABLE_MODEL_PREFIXES.some((p) => model.startsWith(p));
}

////////////////////////////////////////////////////////////////////////////////
// EFFORT SUPPORT
////////////////////////////////////////////////////////////////////////////////
//
// output_config.effort support varies per model (unsupported models return a
// 400): Opus 4.5 accepts low/medium/high; the 4.6 family adds max; 4.7+
// (Opus 4.7/4.8, Sonnet 5, Fable 5 / Mythos 5) adds xhigh. Sonnet 4.5,
// Haiku 4.5, and older models reject the parameter entirely.

const EFFORT_BASE: EffortLevel[] = ["low", "medium", "high"];
const EFFORT_WITH_MAX: EffortLevel[] = [...EFFORT_BASE, "max"];
const EFFORT_ALL: EffortLevel[] = ["low", "medium", "high", "xhigh", "max"];

const XHIGH_EFFORT_MODEL_PREFIXES = ADAPTIVE_ONLY_MODEL_PREFIXES;
const MAX_EFFORT_MODEL_PREFIXES = [
  "claude-opus-4-6",
  "claude-sonnet-4-6",
];
const BASE_EFFORT_MODEL_PREFIXES = [
  "claude-opus-4-5",
];

export function getSupportedEffortLevels(model: AnthropicModel): EffortLevel[] {
  if (XHIGH_EFFORT_MODEL_PREFIXES.some((p) => model.startsWith(p))) {
    return EFFORT_ALL;
  }
  if (MAX_EFFORT_MODEL_PREFIXES.some((p) => model.startsWith(p))) {
    return EFFORT_WITH_MAX;
  }
  if (BASE_EFFORT_MODEL_PREFIXES.some((p) => model.startsWith(p))) {
    return EFFORT_BASE;
  }
  return [];
}

////////////////////////////////////////////////////////////////////////////////
// SERVER TOOL LABELS (display strings for built-in tools)
////////////////////////////////////////////////////////////////////////////////

export const SERVER_TOOL_LABELS: Record<string, string> = {
  web_search: "Searching the web...",
  web_fetch: "Fetching web page...",
  str_replace_based_edit_tool: "Editing document...",
};
