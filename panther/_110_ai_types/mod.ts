// Copyright 2023-2026, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

export type {
  AnthropicModel,
  AnthropicModelConfig,
  CacheControl,
  ContentBlock,
  DocumentContentBlock,
  DocumentSource,
  EffortLevel,
  EphemeralSection,
  MessageParam,
  MessagePayload,
  MessageRole,
  OutputConfig,
  RedactedThinkingBlock,
  ThinkingBlock,
  ThinkingConfig,
  ToolDefinition,
  Usage,
} from "./types.ts";

export {
  BETA_HEADERS,
  BUILTIN_TOOL_TYPES,
  DEFAULT_PRICING,
  getMaxOutputTokens,
  getSupportedEffortLevels,
  MAX_OUTPUT_TOKENS,
  MODEL_MAX_OUTPUT_TOKENS,
  MODEL_OPTIONS,
  MODEL_PRICING,
  RETIRED_MODEL_IDS,
  SERVER_TOOL_LABELS,
  supportsAdaptiveThinking,
  supportsDisabledThinking,
  supportsDynamicWebTools,
  supportsManualThinking,
  supportsSamplingParams,
} from "./anthropic_consts.ts";

export {
  countPayloadBreakpoints,
  resolveOutputConfig,
  resolveThinkingConfig,
  sanitizePersistedSettings,
  shapeCachedPayload,
} from "./request_shaping.ts";

export type { PersistedModelSettings, SystemParam } from "./request_shaping.ts";

export {
  buildCancelledToolResults,
  buildToolResultUserMessage,
  classifyTurnContinuation,
  demoteStaleCarriers,
  getUserFacingAIErrorMessage,
  lastMessageHasUnresolvedToolUse,
  legacyStripEphemeralMarkers,
  renderOutgoingMessages,
  trimDanglingServerToolUse,
} from "./turn_logic.ts";

export type {
  AIErrorInfo,
  SystemNoticeType,
  ToolResultBlock,
  TurnContinuation,
} from "./turn_logic.ts";

export {
  assembleTurnSections,
  buildAvailabilityHint,
  buildInteractionDigest,
  buildNavigationDigestLine,
  buildViewGateMessage,
  buildViewLabelSectionText,
  dropSuppressedEchoes,
  INTERACTION_DIGEST_PREFIX,
  NAVIGATION_INTERACTION_ID,
} from "./view_logic.ts";

export type {
  AIInteractionDefLike,
  EchoMarks,
  InteractionQueueEntry,
  InteractionViewStateLike,
  NavigationEventPayload,
  TurnSectionParts,
} from "./view_logic.ts";

export type { ModelPricing } from "./anthropic_consts.ts";
