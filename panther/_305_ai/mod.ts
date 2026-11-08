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
export {
  AIChatApprovalDecision,
  AIChatApprovalPending,
  openProposalPreview,
  ProposalPreviewBody,
} from "./_components/_renderers/approval.tsx";
export { AIChatAssistantCompletedText } from "./_components/_renderers/assistant_completed_text.tsx";
export { AIChatAssistantStreamingText } from "./_components/_renderers/assistant_streaming_text.tsx";
export { AIChatDefaultItem } from "./_components/_renderers/default_item.tsx";
export { AIChatSystemNotice } from "./_components/_renderers/system_notice.tsx";
export { AIChatThinkingSummary } from "./_components/_renderers/thinking_summary.tsx";
export { AIChatToolError } from "./_components/_renderers/tool_error.tsx";
export { AIChatToolLoading } from "./_components/_renderers/tool_loading.tsx";
export { AIChatToolSuccess } from "./_components/_renderers/tool_success.tsx";
export { AIChatUserText } from "./_components/_renderers/user_text.tsx";

////////////////////////////////////////////////////////////////////////////////
// SIGNALS & HOOKS
////////////////////////////////////////////////////////////////////////////////

export { createAIChat } from "./_components/_create_ai_chat.ts";
export { useConversations } from "./_components/use_conversations.ts";

////////////////////////////////////////////////////////////////////////////////
// CORE FUNCTIONS
////////////////////////////////////////////////////////////////////////////////

// The tool-authoring/MCP core (createAITool, AIToolFailure, defineAIViews,
// view, buildToolCatalog, createMCPServer, validateMCPServerConfig + their
// types) moved to _112_ai_tool_core (2026-08-06 hoist) — the mod.ui.ts and
// mod.deno.ts barrels export it directly, so the barrel surface is unchanged.
export { createAIViewController } from "./_core/views.ts";
export { createNavigationTool } from "./_core/navigation_tool.ts";
export { defineAIInteractions, interaction } from "./_core/interactions.ts";
export { validateAIChatConfig } from "./_core/validate_config.ts";
export { createAskUserQuestionsTool } from "./_components/ask_user_questions.tsx";
export { createSDKClient } from "./_core/sdk_client.ts";
export { callAI } from "./_core/one_shot.ts";
export { callAIStructured } from "../_116_ai_one_shot/mod.ts";

////////////////////////////////////////////////////////////////////////////////
// TYPES
////////////////////////////////////////////////////////////////////////////////

export type { AIChatConfig, AIChatDisplayRegistry } from "./_core/types.ts";
export type { AIChatInstance } from "./_components/_create_ai_chat.ts";
export type { AIViewController } from "./_core/views.ts";
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
  AskUserQuestionsInput,
  AskUserQuestionsOption,
} from "./_core/ask_user_questions_types.ts";
export type { CallAIConfig } from "./_core/one_shot.ts";
export type {
  CallAIOptions,
  CallAIResult,
  CallAIStructuredConfig,
  CallAIStructuredResult,
} from "../_116_ai_one_shot/mod.ts";

// Re-export commonly used types and consts from _110_ai_types
export type {
  AnthropicModel,
  AnthropicModelConfig,
  BuiltInToolsConfig,
  ContentBlock,
  DocumentContentBlock,
  MessageParam,
  Usage,
  WebFetchToolConfig,
  WebSearchToolConfig,
} from "../_110_ai_types/mod.ts";

export {
  BETA_HEADERS,
  BUILTIN_TOOL_TYPES,
  getBetaHeaders,
  getMaxOutputTokens,
  MAX_OUTPUT_TOKENS,
  MODEL_OPTIONS,
  SERVER_TOOL_LABELS,
  supportsManualThinking,
} from "../_110_ai_types/mod.ts";
