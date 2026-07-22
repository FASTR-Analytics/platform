// Copyright 2023-2026, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

////////////////////////////////////////////////////////////////////////////////
// COMPONENTS
////////////////////////////////////////////////////////////////////////////////

export { AIChat } from "./_components/ai_chat.tsx";
export { AIChatConversationSelector } from "./_components/ai_chat_conversation_selector.tsx";
export { AIChatSettingsPanel } from "./_components/ai_chat_settings_panel.tsx";
export { AIChatSystemPromptPanel } from "./_components/ai_chat_system_prompt_panel.tsx";
export { AIChatProvider } from "./context.tsx";

////////////////////////////////////////////////////////////////////////////////
// SIGNALS & HOOKS
////////////////////////////////////////////////////////////////////////////////

export { createAIChat } from "./_components/_create_ai_chat.ts";
export { useConversations } from "./_components/use_conversations.ts";

////////////////////////////////////////////////////////////////////////////////
// CORE FUNCTIONS
////////////////////////////////////////////////////////////////////////////////

export { AIToolFailure, createAITool } from "./_core/tool_helpers.ts";
export { createAIViewController, defineAIViews, view } from "./_core/views.ts";
export { defineAIInteractions, interaction } from "./_core/interactions.ts";
export { buildToolCatalog } from "./_core/tool_catalog.ts";
export { validateAIChatConfig } from "./_core/validate_config.ts";
export { createAskUserQuestionsTool } from "./_components/ask_user_questions.tsx";
export { createSDKClient } from "./_core/sdk_client.ts";
export { callAI, callAIStructured } from "./_core/one_shot.ts";
export { getBetaHeaders } from "./_core/beta_headers.ts";

////////////////////////////////////////////////////////////////////////////////
// TYPES
////////////////////////////////////////////////////////////////////////////////

export type { AIChatConfig } from "./_core/types.ts";
export type {
  AIToolApprovalConfig,
  AIToolKind,
  AIToolWithMetadata,
  ApprovalPolicy,
  CreateAIToolConfig,
  CreateAIToolConfigCommon,
  ProposalPreview,
  ProposalResult,
  ToolUIMetadata,
} from "./_core/tool_helpers.ts";
export type {
  AIView,
  AIViewContext,
  AIViewController,
  AIViewDefinition,
  AIViewParams,
  AIViewRegistry,
  AIViewState,
  AIViewStateFor,
  AIViewVoidKeys,
  AnyAIView,
  CreateViewAIToolConfig,
  SetViewArgs,
  ViewAIToolApprovalConfig,
} from "./_core/views.ts";
export type {
  AIInteraction,
  AIInteractionDef,
  AIInteractionPayload,
  AIInteractionRegistry,
  AnyAIInteraction,
  NotifyArgs,
} from "./_core/interactions.ts";
export type {
  AINavigationTarget,
  AINavigationToolInput,
  CreateAINavigationToolConfig,
} from "./_core/navigation_tool.ts";
export type {
  AIChatSettingsField,
  AIChatSettingsPanelProps,
  AIChatSettingsValues,
} from "./_components/ai_chat_settings_panel.tsx";
export type { AIChatSystemPromptPanelProps } from "./_components/ai_chat_system_prompt_panel.tsx";
export type { ConversationMetadata } from "./_core/conversations_persistence.ts";
export type { ConversationsContextValue } from "./_components/use_conversations.ts";

export type {
  AskUserQuestionsAnswer,
  AskUserQuestionsInput,
  AskUserQuestionsOption,
} from "./_core/ask_user_questions_types.ts";
export type {
  CallAIConfig,
  CallAIResult,
  CallAIStructuredResult,
} from "./_core/one_shot.ts";
export type {
  BuiltInToolsConfig,
  WebFetchToolConfig,
  WebSearchToolConfig,
} from "./_core/builtin_tools.ts";

// Re-export commonly used types and consts from _110_ai_types
export type {
  AnthropicModel,
  AnthropicModelConfig,
  ContentBlock,
  DocumentContentBlock,
  MessageParam,
  ModelPricing,
  Usage,
} from "../_110_ai_types/mod.ts";

export {
  BETA_HEADERS,
  BUILTIN_TOOL_TYPES,
  DEFAULT_PRICING,
  getMaxOutputTokens,
  MAX_OUTPUT_TOKENS,
  MODEL_OPTIONS,
  MODEL_PRICING,
  SERVER_TOOL_LABELS,
  supportsManualThinking,
  supportsSamplingParams,
} from "../_110_ai_types/mod.ts";
