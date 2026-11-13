// Copyright 2023-2026, Tim Roberton. MIT license.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type {
  AnthropicModel,
  AnthropicModelConfig,
  EffortLevel,
} from "./types.ts";

////////////////////////////////////////////////////////////////////////////////
// BETA HEADERS
////////////////////////////////////////////////////////////////////////////////

// Only betas actually sent by the request paths. WEB_FETCH is needed only
// for the basic web_fetch_20250910 variant on pre-4.6 models; the _20260209
// web tools, plain tool use and documents by file_id (the Files API is GA)
// need no beta header.
export const BETA_HEADERS = {
  WEB_FETCH: "web-fetch-2025-09-10",
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
// MODEL OPTIONS (for UI dropdowns)
////////////////////////////////////////////////////////////////////////////////

// Model IDs retired from the API (requests return 404). A blocklist, not an
// allowlist: an allowlist would wrongly drop active models kept out of the UI
// dropdown and custom model names used with proxy backends (the AnthropicModel
// union is deliberately open).
export const RETIRED_MODEL_IDS: string[] = [
  "claude-opus-4-1-20250805",
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
  { value: "claude-fable-5-1", label: "Claude Fable 5.1" },
  { value: "claude-fable-5", label: "Claude Fable 5" },
  { value: "claude-opus-5-5", label: "Claude Opus 5.5" },
  { value: "claude-opus-5", label: "Claude Opus 5" },
  { value: "claude-opus-4-8", label: "Claude Opus 4.8" },
  { value: "claude-sonnet-5-5", label: "Claude Sonnet 5.5" },
  { value: "claude-sonnet-5", label: "Claude Sonnet 5" },
  { value: "claude-opus-4-7", label: "Claude Opus 4.7" },
  { value: "claude-opus-4-6", label: "Claude Opus 4.6" },
  { value: "claude-sonnet-4-6", label: "Claude Sonnet 4.6" },
  { value: "claude-haiku-5-5", label: "Claude Haiku 5.5" },
  { value: "claude-haiku-4-5", label: "Claude Haiku 4.5" },
  { value: "claude-opus-4-5-20251101", label: "Claude Opus 4.5" },
  { value: "claude-sonnet-4-5-20250929", label: "Claude Sonnet 4.5" },
];

////////////////////////////////////////////////////////////////////////////////
// DEFAULT MODEL CONFIG
////////////////////////////////////////////////////////////////////////////////
//
// THE single place model defaults are decided. Consumer apps never name a
// model: they omit modelConfig entirely (or pass a partial override for a
// genuinely app-specific need, e.g. a max_tokens cap) and pick up changes
// here on their next sync. Update this block — together with MODEL_OPTIONS
// and the capability lists — on every model bump.

export const DEFAULT_MODEL_CONFIG: AnthropicModelConfig = {
  model: "claude-sonnet-5-5",
  max_tokens: 32_000,
  output_config: { effort: "high" },
};

export function resolveModelConfig(
  partial: Partial<AnthropicModelConfig> | undefined,
): AnthropicModelConfig {
  return {
    ...DEFAULT_MODEL_CONFIG,
    // Fresh nested object so per-instance state never aliases the shared
    // default (callers mutate their resolved copy via updateConfig).
    output_config: { ...DEFAULT_MODEL_CONFIG.output_config },
    ...partial,
  };
}

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

// A request whose max_tokens is above the model's cap is refused.
export function clampMaxOutputTokens(
  maxTokens: number,
  model: AnthropicModel,
): number {
  return Math.min(
    Math.max(Math.round(maxTokens), MAX_OUTPUT_TOKENS.MIN),
    getMaxOutputTokens(model),
  );
}

////////////////////////////////////////////////////////////////////////////////
// IMAGE LIMITS
////////////////////////////////////////////////////////////////////////////////

// What the API takes of images. An image stays in its conversation and rides
// every later request, so one past a limit would fail every send from then
// on.
export const IMAGE_LIMITS = {
  // The base64 of one image.
  MAX_BASE64_CHARS: 10_000_000,
  // Either side of an image: the API holds every image of a request to this
  // once the request carries more than 20.
  MAX_SIDE_PX: 3000,
  // The images of one request on a model with a 200K-token context window,
  // the lowest limit of any model in MODEL_OPTIONS: a conversation can switch
  // to one.
  MAX_PER_REQUEST: 100,
  // The base64 of every image of one request: the API's 128 MB request
  // limit, less room for the rest of the request.
  MAX_BASE64_CHARS_PER_REQUEST: 100_000_000,
} as const;

////////////////////////////////////////////////////////////////////////////////
// MODEL CAPABILITY CHECKS
////////////////////////////////////////////////////////////////////////////////

// Models from Opus 4.7 onward reject manual extended thinking
// (thinking: {type: "enabled", budget_tokens}) with a 400 error. They use
// adaptive thinking and the output_config.effort parameter instead.
// Matched by prefix so dated snapshot IDs are covered.
// (claude-mythos-5 is the Project Glasswing sibling of claude-fable-5 with
// identical API behavior — verified against the Anthropic migration guide,
// 2026-07.) Prefix matching is deliberate: "claude-opus-5" also covers
// claude-opus-5-5 and "claude-fable-5" covers claude-fable-5-1, which share
// these rules; "claude-haiku-5" covers Haiku 5.5, which takes adaptive
// thinking and every effort level and rejects manual thinking.
const ADAPTIVE_ONLY_MODEL_PREFIXES = [
  "claude-opus-4-7",
  "claude-opus-4-8",
  "claude-opus-5",
  "claude-sonnet-5",
  "claude-fable-5",
  "claude-mythos-5",
  "claude-haiku-5",
];

// Fable 5 / Mythos 5 (and their 5.1 successors) and Opus 5.5 have always-on
// thinking: an explicit thinking: {type: "disabled"} is also rejected with a
// 400 at every effort level — the parameter must be omitted entirely. All
// other models accept explicit disabled. Opus 5.5 must be listed explicitly:
// it shares the "claude-opus-5" prefix with Opus 5, which accepts disabled.
const ALWAYS_ON_THINKING_MODEL_PREFIXES = [
  "claude-fable-5",
  "claude-mythos-5",
  "claude-opus-5-5",
];

export function supportsManualThinking(model: AnthropicModel): boolean {
  return !ADAPTIVE_ONLY_MODEL_PREFIXES.some((p) => model.startsWith(p));
}

// Sonnet 5.5 rejects an explicit thinking: {type: "disabled"} at every
// effort; it turns thinking off with {type: "between_tools"} (no thinking
// before the first tool call), which no other model accepts. Listed
// explicitly: it shares the "claude-sonnet-5" prefix with Sonnet 5, which
// takes disabled.
const BETWEEN_TOOLS_THINKING_MODEL_PREFIXES = ["claude-sonnet-5-5"];

export function turnsThinkingOffWithBetweenTools(
  model: AnthropicModel,
): boolean {
  return BETWEEN_TOOLS_THINKING_MODEL_PREFIXES.some((p) => model.startsWith(p));
}

export function supportsDisabledThinking(model: AnthropicModel): boolean {
  return !ALWAYS_ON_THINKING_MODEL_PREFIXES.some((p) => model.startsWith(p));
}

// Opus 5 and Haiku 5.5 accept thinking: {type: "disabled"} only at effort
// "high" or below — pairing it with "xhigh" or "max" is rejected with a 400,
// validated per request. (Fable 5 / Mythos 5 / Opus 5.5 reject disabled
// entirely, see above, so the prefix match on Opus 5.5 never applies;
// earlier adaptive-only models accept disabled at any effort.)
const DISABLED_THINKING_EFFORT_CAPPED_MODEL_PREFIXES = [
  "claude-opus-5",
  "claude-haiku-5",
];

export function capsEffortWhenThinkingDisabled(model: AnthropicModel): boolean {
  return DISABLED_THINKING_EFFORT_CAPPED_MODEL_PREFIXES.some((p) =>
    model.startsWith(p)
  );
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
// (Opus 4.7/4.8, Opus 5, Sonnet 5, Haiku 5.5, Fable 5 / Mythos 5) adds
// xhigh. Sonnet 4.5, Haiku 4.5, and older models reject the parameter
// entirely.

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
