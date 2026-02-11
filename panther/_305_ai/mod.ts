// Copyright 2023-2025, Tim Roberton, All rights reserved.
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

export { createAITool } from "./_core/tool_helpers.ts";
export { createSDKClient } from "./_core/sdk_client.ts";
export { callAI } from "./_core/one_shot.ts";
export { BETA_HEADERS, getBetaHeaders } from "./_core/beta_headers.ts";

////////////////////////////////////////////////////////////////////////////////
// TYPES
////////////////////////////////////////////////////////////////////////////////

export type { AIChatConfig } from "./_core/types.ts";
export type {
  AIChatSettingsField,
  AIChatSettingsPanelProps,
  AIChatSettingsValues,
} from "./_components/ai_chat_settings_panel.tsx";
export type { AIChatSystemPromptPanelProps } from "./_components/ai_chat_system_prompt_panel.tsx";
export type { ConversationMetadata } from "./_core/conversations_persistence.ts";
export type { ConversationsContextValue } from "./_components/use_conversations.ts";

export type { CallAIConfig, CallAIResult } from "./_core/one_shot.ts";
export type {
  BuiltInToolsConfig,
  WebFetchToolConfig,
  WebSearchToolConfig,
} from "./_core/builtin_tools.ts";

// Re-export commonly used types from _110_ai_types for consumer convenience
export type {
  AnthropicModel,
  AnthropicModelConfig,
  ContentBlock,
  DocumentContentBlock,
  MessageParam,
  Usage,
} from "../_110_ai_types/mod.ts";
