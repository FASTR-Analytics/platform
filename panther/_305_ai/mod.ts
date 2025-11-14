// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

////////////////////////////////////////////////////////////////////////////////
// COMPONENTS
////////////////////////////////////////////////////////////////////////////////

export { AIChat } from "./_components/ai_chat.tsx";
export { MessageInput } from "./_components/message_input.tsx";
export { MessageList } from "./_components/message_list.tsx";
export { UsageDisplay } from "./_components/usage_display.tsx";

export { DefaultRenderer } from "./_components/_renderers/default_renderer.tsx";
export { StreamingTextRenderer } from "./_components/_renderers/streaming_text_renderer.tsx";
export { TextRenderer } from "./_components/_renderers/text_renderer.tsx";
export { ToolErrorRenderer } from "./_components/_renderers/tool_error_renderer.tsx";
export { ToolLoadingRenderer } from "./_components/_renderers/tool_loading_renderer.tsx";

////////////////////////////////////////////////////////////////////////////////
// CONTEXT & PROVIDER
////////////////////////////////////////////////////////////////////////////////

export { AIChatProvider } from "./context.tsx";

////////////////////////////////////////////////////////////////////////////////
// HOOKS
////////////////////////////////////////////////////////////////////////////////

export { useAIChat } from "./_hooks/use_ai_chat.ts";
export { createToolRegistry, useAITools } from "./_hooks/use_ai_tools.ts";
export { useScrollManager } from "./_hooks/use_scroll_manager.ts";

////////////////////////////////////////////////////////////////////////////////
// UTILITIES
////////////////////////////////////////////////////////////////////////////////

export { callAIAPI } from "./_core/api_client.ts";
export { callAIAPIStreaming } from "./_core/api_client_streaming.ts";
export {
  aggregateUsage,
  calculateCost,
  formatCost,
  formatTokenCount,
} from "./_core/cost_utils.ts";
export {
  clearConversationStore,
  deleteConversationStore,
  getConversationState,
  getOrCreateConversationStore,
} from "./_core/conversation_store.ts";
export { getDisplayItemsFromMessage } from "./_core/display_items.ts";
export {
  getInProgressItems,
  processToolUses,
  ToolRegistry,
} from "./_core/tool_engine.ts";

////////////////////////////////////////////////////////////////////////////////
// TYPES
////////////////////////////////////////////////////////////////////////////////

export type {
  AIChatConfig,
  AITool,
  AIToolHandler,
  AnthropicModel,
  AnthropicModelConfig,
  AnthropicResponse,
  APIConfig,
  CacheControl,
  ChatState,
  ContentBlock,
  CostEstimate,
  DisplayItem,
  DisplayItemRenderer,
  DisplayRegistry,
  MessageBackgroundColor,
  MessageParam,
  MessagePayload,
  MessageRole,
  MessageStyle,
  MessageStyles,
  MessageTextColor,
  StreamEvent,
  ToolDefinition,
  Usage,
} from "./_core/types.ts";

export type { ConversationStore } from "./_core/conversation_store.ts";
export type { ScrollManagerOptions } from "./_hooks/use_scroll_manager.ts";
export type { ToolResult } from "./_core/tool_engine.ts";
