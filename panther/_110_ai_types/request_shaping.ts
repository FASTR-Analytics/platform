// Copyright 2023-2026, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type {
  AnthropicModel,
  CacheControl,
  ContentBlock,
  EffortLevel,
  MessageParam,
  OutputConfig,
  ThinkingConfig,
} from "./types.ts";
import {
  getMaxOutputTokens,
  getSupportedEffortLevels,
  MAX_OUTPUT_TOKENS,
  RETIRED_MODEL_IDS,
  supportsAdaptiveThinking,
  supportsDisabledThinking,
  supportsManualThinking,
  supportsSamplingParams,
} from "./anthropic_consts.ts";

////////////////////////////////////////////////////////////////////////////////
// PROMPT CACHE BREAKPOINT SHAPING
////////////////////////////////////////////////////////////////////////////////
//
// The API allows at most 4 cache_control breakpoints per request; exceeding
// that returns a 400. Conversations persisted by older versions of this
// library carry cache_control markers inside their message history, so the
// only safe strategy is: strip every breakpoint from the history, then place
// a bounded, deterministic set on the outgoing payload — at most one on the
// system prompt (unless the consumer placed their own) and one on the tail
// of the latest user message. These functions are pure and never mutate
// their inputs; stored conversation state must never carry breakpoints.

const EPHEMERAL: CacheControl = { type: "ephemeral" };

export type SystemParam =
  | string
  | Array<{ type: "text"; text: string; cache_control?: CacheControl }>;

function stripMessagesCacheControl(messages: MessageParam[]): MessageParam[] {
  return messages.map((msg) => {
    let content = msg.content;
    if (Array.isArray(content)) {
      content = content.map((block) => {
        if ("cache_control" in block && block.cache_control) {
          const { cache_control: _removed, ...rest } = block;
          return rest as ContentBlock;
        }
        return block;
      });
    }
    if (msg.cache_control) {
      const { cache_control: _removed, ...rest } = msg;
      return { ...rest, content };
    }
    return content === msg.content ? msg : { ...msg, content };
  });
}

function countSystemBreakpoints(system: SystemParam): number {
  if (typeof system === "string") return 0;
  return system.filter((block) => block.cache_control).length;
}

function systemWithBreakpoint(system: SystemParam): SystemParam {
  if (typeof system === "string") {
    if (!system) return system;
    return [{ type: "text", text: system, cache_control: EPHEMERAL }];
  }
  if (system.length === 0 || system.some((block) => block.cache_control)) {
    return system;
  }
  return [
    ...system.slice(0, -1),
    { ...system[system.length - 1], cache_control: EPHEMERAL },
  ];
}

function withTailBreakpoint(messages: MessageParam[]): MessageParam[] {
  // Place the breakpoint on the most recent USER message. Usually that is
  // the strict tail; on a pause_turn resend the tail is an assistant
  // message whose trailing blocks (e.g. server_tool_use) are not cacheable
  // targets — marking the last user message instead lets the resend read
  // the prefix cached by the previous request.
  let userIndex = -1;
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === "user") {
      userIndex = i;
      break;
    }
  }
  if (userIndex === -1) return messages;
  const target = messages[userIndex];

  const replaceAt = (updated: MessageParam): MessageParam[] => [
    ...messages.slice(0, userIndex),
    updated,
    ...messages.slice(userIndex + 1),
  ];

  if (typeof target.content === "string") {
    if (!target.content) return messages;
    return replaceAt({
      ...target,
      content: [{
        type: "text" as const,
        text: target.content,
        cache_control: EPHEMERAL,
      }],
    });
  }

  const lastBlock = target.content[target.content.length - 1];
  if (!lastBlock) return messages;
  if (
    lastBlock.type === "thinking" || lastBlock.type === "redacted_thinking"
  ) {
    return messages;
  }
  return replaceAt({
    ...target,
    content: [
      ...target.content.slice(0, -1),
      { ...lastBlock, cache_control: EPHEMERAL },
    ],
  });
}

export function shapeCachedPayload(
  system: SystemParam,
  messages: MessageParam[],
): { system: SystemParam; messages: MessageParam[] } {
  const strippedMessages = stripMessagesCacheControl(messages);
  const shapedSystem = systemWithBreakpoint(system);
  const systemBreakpoints = countSystemBreakpoints(shapedSystem);
  // Budget: system breakpoints + at most 1 tail must stay ≤ 4.
  const shapedMessages = systemBreakpoints < 4
    ? withTailBreakpoint(strippedMessages)
    : strippedMessages;
  return { system: shapedSystem, messages: shapedMessages };
}

export function countPayloadBreakpoints(
  system: SystemParam,
  messages: MessageParam[],
): number {
  let count = countSystemBreakpoints(system);
  for (const msg of messages) {
    if (msg.cache_control) count++;
    if (Array.isArray(msg.content)) {
      for (const block of msg.content) {
        if ("cache_control" in block && block.cache_control) count++;
      }
    }
  }
  return count;
}

////////////////////////////////////////////////////////////////////////////////
// THINKING CONFIG RESOLUTION
////////////////////////////////////////////////////////////////////////////////
//
// - Adaptive ({type: "adaptive", display?}) is accepted on the 4.6 family
//   and everything after (including Fable 5 / Mythos 5, where thinking is
//   always on and an explicit adaptive is a no-op); pre-4.6 models reject
//   it with a 400: drop the config there.
// - Manual thinking ({enabled, budget_tokens}) passes through on pre-4.7
//   models; adaptive-only models (Opus 4.7+, Sonnet 5, Fable 5, Mythos 5)
//   reject it with a 400: drop the config.
// - An explicit {type: "disabled"} must be KEPT where accepted — on Sonnet 5
//   omitting the field silently enables adaptive thinking, which the caller
//   explicitly asked to avoid. Only Fable 5 / Mythos 5 (always-on thinking)
//   reject explicit disabled, so it is dropped there.

export function resolveThinkingConfig(
  model: AnthropicModel,
  thinking: ThinkingConfig | undefined,
): ThinkingConfig | undefined {
  if (!thinking) return undefined;
  if (thinking.type === "adaptive") {
    return supportsAdaptiveThinking(model) ? thinking : undefined;
  }
  if (supportsManualThinking(model)) return thinking;
  if (thinking.type === "disabled" && supportsDisabledThinking(model)) {
    return thinking;
  }
  return undefined;
}

////////////////////////////////////////////////////////////////////////////////
// OUTPUT CONFIG RESOLUTION
////////////////////////////////////////////////////////////////////////////////
//
// output_config.effort support varies per model (see
// getSupportedEffortLevels); unsupported values return a 400. A level the
// model doesn't offer is clamped DOWN to "high" (the highest level every
// effort-capable model accepts) rather than up to "max" — never spend more
// than the caller asked for.

export function resolveOutputConfig(
  model: AnthropicModel,
  outputConfig: OutputConfig | undefined,
): OutputConfig | undefined {
  const effort = outputConfig?.effort;
  if (!effort) return undefined;
  const supported = getSupportedEffortLevels(model);
  if (supported.length === 0) return undefined;
  const resolved: EffortLevel = supported.includes(effort) ? effort : "high";
  return { effort: resolved };
}

////////////////////////////////////////////////////////////////////////////////
// PERSISTED SETTINGS SANITIZATION
////////////////////////////////////////////////////////////////////////////////
//
// Settings persisted by older library versions can carry retired model IDs
// (404 on every send), max_tokens above the current model's cap (400 on
// every send), or a temperature that adaptive-only models reject (400).
// Sanitize before applying to the live config.

export type PersistedModelSettings = {
  model?: AnthropicModel;
  max_tokens?: number;
  temperature?: number;
  output_config?: OutputConfig;
};

export function sanitizePersistedSettings(
  persisted: PersistedModelSettings,
  fallbackModel: AnthropicModel,
): PersistedModelSettings {
  const out: PersistedModelSettings = {};

  // Blocklist, not allowlist: only known-retired IDs are dropped. Active
  // models absent from the UI dropdown and custom model names (proxy
  // backends) must survive a reload — silently switching a consumer's model
  // is worse than passing through an unknown ID.
  const model = persisted.model !== undefined &&
      !RETIRED_MODEL_IDS.includes(persisted.model)
    ? persisted.model
    : undefined;
  if (model !== undefined) {
    out.model = model;
  }
  const effectiveModel = model ?? fallbackModel;

  if (
    typeof persisted.max_tokens === "number" &&
    Number.isFinite(persisted.max_tokens)
  ) {
    out.max_tokens = Math.min(
      Math.max(Math.round(persisted.max_tokens), MAX_OUTPUT_TOKENS.MIN),
      getMaxOutputTokens(effectiveModel),
    );
  }

  if (
    typeof persisted.temperature === "number" &&
    Number.isFinite(persisted.temperature) &&
    supportsSamplingParams(effectiveModel)
  ) {
    out.temperature = Math.min(Math.max(persisted.temperature, 0), 1);
  }

  // Persisted effort can predate a model switch — re-resolve against the
  // effective model (dropped where unsupported, clamped where the level
  // doesn't exist).
  const outputConfig = resolveOutputConfig(
    effectiveModel,
    persisted.output_config,
  );
  if (outputConfig !== undefined) {
    out.output_config = outputConfig;
  }

  return out;
}
