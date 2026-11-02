// Copyright 2023-2026, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

export { t3 } from "../_000_utils/mod.ts";
export type { CustomMarkdownStyleOptions } from "../_004_markdown_style/mod.ts";
export { createMarkdownIt } from "../_105_markdown/mod.ts";
export {
  admitInteraction,
  APPROVAL_DECLINED_MESSAGE,
  APPROVAL_STALE_MESSAGE,
  assembleTurnSections,
  BETA_HEADERS,
  buildApprovalViewExitMessage,
  buildCancelledToolResults,
  buildInteractionDigest,
  buildNavigationDoneMessage,
  buildNavigationPendingMessage,
  buildToolResultUserMessage,
  BUILTIN_TOOL_TYPES,
  classifyTurnContinuation,
  createInteractionLog,
  decideViewGate,
  DEFAULT_PRICING,
  demoteStaleCarriers,
  getMaxOutputTokens,
  getSupportedEffortLevels,
  getUserFacingAIErrorMessage,
  hashRequestPrefix,
  lastMessageHasUnresolvedToolUse,
  legacyStripEphemeralMarkers,
  MAX_OUTPUT_TOKENS,
  MODEL_OPTIONS,
  MODEL_PRICING,
  reconcileRequestPrefix,
  releaseUnansweredCarriers,
  renderOutgoingMessages,
  resolveModelConfig,
  resolveOutputConfig,
  resolveThinkingConfig,
  sanitizePersistedSettings,
  selectTurnSections,
  SERVER_TOOL_LABELS,
  shapeCachedPayload,
  supportsDynamicWebTools,
  trimDanglingServerToolUse,
} from "../_110_ai_types/mod.ts";
export type {
  AIInteractionDefLike,
  AnthropicModel,
  AnthropicModelConfig,
  CacheControl,
  ContentBlock,
  DocumentContentBlock,
  EffortLevel,
  EphemeralSection,
  GateView,
  InteractionViewStateLike,
  MessageParam,
  SystemNoticeType,
  SystemParam,
  Usage,
  UserMessageParam,
} from "../_110_ai_types/mod.ts";
export {
  AIToolFailure,
  buildAITool,
  createAITool,
  getHeadlessCapability,
  resolveViewLabel,
  toolThrowToResultParts,
} from "../_112_ai_tool_core/mod.ts";
export type {
  AIToolKind,
  AIToolWithMetadata,
  AIViewDefinition,
  AIViewIdentity,
  AIViewParams,
  AIViewRegistry,
  AIViewSnapshot,
  AIViewState,
  AIViewVoidKeys,
  AnyAITool,
  AnyAIView,
  ApprovalPolicy,
  ProposalPreview,
  ProposalResult,
  SetViewArgs,
  ToolUIMetadata,
} from "../_112_ai_tool_core/mod.ts";
export {
  Button,
  createTableConfig,
  deriveMarkdownCssVars,
  Icon,
  markdownClasses,
  ModalContainer,
  openConfirm,
  Select,
  Slider,
  StableWeightText,
  Table,
  TextArea,
} from "../_303_components/mod.ts";
export type {
  AlertComponentProps,
  BulkAction,
  TableColumn,
} from "../_303_components/mod.ts";
export { default as Anthropic } from "@anthropic-ai/sdk";
export { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
export { del, get, set } from "idb-keyval";
export { default as MarkdownIt } from "markdown-it";
export {
  createContext,
  createEffect,
  createMemo,
  createSignal,
  For,
  Match,
  onCleanup,
  onMount,
  Show,
  Switch,
  untrack,
  useContext,
} from "solid-js";
export type { Component, JSX } from "solid-js";
export { z } from "zod";
export type { z as zType } from "zod";
