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
  capsEffortWhenThinkingDisabled,
  DEFAULT_MODEL_CONFIG,
  DEFAULT_PRICING,
  getMaxOutputTokens,
  getSupportedEffortLevels,
  MAX_OUTPUT_TOKENS,
  MODEL_MAX_OUTPUT_TOKENS,
  MODEL_OPTIONS,
  MODEL_PRICING,
  resolveModelConfig,
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
  fnv1a32,
  getUserFacingAIErrorMessage,
  hashRequestPrefix,
  lastMessageHasUnresolvedToolUse,
  legacyStripEphemeralMarkers,
  reconcileRequestPrefix,
  releaseUnansweredCarriers,
  renderOutgoingMessages,
  selectTurnSections,
  STRIPPED_THINKING_PLACEHOLDER,
  stripThinkingBlocks,
  trimDanglingServerToolUse,
} from "./turn_logic.ts";

export type {
  AIErrorInfo,
  SystemNoticeType,
  ToolDefinitionLike,
  ToolResultBlock,
  TurnContinuation,
} from "./turn_logic.ts";

export {
  admitInteraction,
  APPROVAL_DECLINED_MESSAGE,
  APPROVAL_STALE_MESSAGE,
  assembleTurnSections,
  buildApprovalViewExitMessage,
  buildAvailabilityHint,
  buildInteractionDigest,
  buildNavigationDigestLine,
  buildNavigationDoneMessage,
  buildNavigationPendingMessage,
  buildViewGateMessage,
  buildViewLabelSectionText,
  buildViewMovedMessage,
  decideViewGate,
  dropSuppressedEchoes,
  INTERACTION_DIGEST_PREFIX,
  NAVIGATION_INTERACTION_ID,
  viewIdentityKey,
} from "./view_logic.ts";

export type {
  AIInteractionDefLike,
  EchoMarks,
  GateView,
  InteractionQueueEntry,
  InteractionViewStateLike,
  NavigationEventPayload,
  TurnSectionParts,
  ViewGateDecision,
  ViewIdentityLike,
} from "./view_logic.ts";

export {
  createInteractionLog,
  DEFAULT_NAV_ATTRIBUTION_MS,
  MAX_LOG_RECORDS,
} from "./interaction_log.ts";

export type { InteractionLog } from "./interaction_log.ts";

export type { ModelPricing } from "./anthropic_consts.ts";
