// Copyright 2023-2026, Tim Roberton. MIT license.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

export type {
  AnthropicModel,
  AnthropicModelConfig,
  AssistantMessageParam,
  CacheControl,
  ContentBlock,
  DocumentContentBlock,
  DocumentSource,
  EffortLevel,
  EphemeralSection,
  ImageContentBlock,
  ImageMediaType,
  MessageParam,
  MessagePayload,
  OutputConfig,
  RedactedThinkingBlock,
  ThinkingBlock,
  ThinkingConfig,
  ThinkingParam,
  ToolDefinition,
  ToolResultContent,
  Usage,
  UserMessageParam,
} from "./types.ts";

export {
  BETA_HEADERS,
  BUILTIN_TOOL_TYPES,
  capsEffortWhenThinkingDisabled,
  clampMaxOutputTokens,
  DEFAULT_MODEL_CONFIG,
  getMaxOutputTokens,
  getSupportedEffortLevels,
  IMAGE_LIMITS,
  MAX_OUTPUT_TOKENS,
  MODEL_MAX_OUTPUT_TOKENS,
  MODEL_OPTIONS,
  resolveModelConfig,
  RETIRED_MODEL_IDS,
  SERVER_TOOL_LABELS,
  supportsAdaptiveThinking,
  supportsDisabledThinking,
  supportsDynamicWebTools,
  supportsManualThinking,
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
  EMPTY_REPLY_PLACEHOLDER,
  fillEmptyReplies,
  fnv1a32,
  getUserFacingAIErrorMessage,
  hashRequestPrefix,
  IMAGES_REMOVED_DETAILS,
  isRequestRefusal,
  legacyStripEphemeralMarkers,
  limitToolResultImages,
  reconcileRequestPrefix,
  releaseUnansweredCarriers,
  removeUnacceptedImages,
  renderOutgoingMessages,
  repairStrandedToolUse,
  selectTurnSections,
  STOPPED_REPLY_PLACEHOLDER,
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

export {
  getBetaHeaders,
  resolveBetas,
  resolveBuiltInTools,
} from "./builtin_tools.ts";

export type {
  BuiltInToolsConfig,
  WebFetchToolConfig,
  WebSearchToolConfig,
} from "./builtin_tools.ts";
