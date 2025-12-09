// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

////////////////////////////////////////////////////////////////////////////////
// COMPONENTS
////////////////////////////////////////////////////////////////////////////////

export { AIChat } from "./_components/ai_chat.tsx";
export { AIChatProvider } from "./context.tsx";

////////////////////////////////////////////////////////////////////////////////
// SIGNALS
////////////////////////////////////////////////////////////////////////////////

export { createAIChat } from "./_components/_create_ai_chat.ts";

////////////////////////////////////////////////////////////////////////////////
// CORE FUNCTIONS
////////////////////////////////////////////////////////////////////////////////

export { createAITool } from "./_core/tool_helpers.ts";
export { createSDKClient } from "./_core/sdk_client.ts";
export {
  createBashTool,
  createTextEditorTool,
  createWebFetchTool,
  createWebSearchTool,
} from "./_core/builtin_tools.ts";
export { callAI } from "./_core/one_shot.ts";
export { BETA_HEADERS, getBetaHeaders } from "./_core/beta_headers.ts";

////////////////////////////////////////////////////////////////////////////////
// TYPES
////////////////////////////////////////////////////////////////////////////////

export type {
  AIChatConfig,
  AnthropicModelConfig,
  ThinkingConfig,
} from "./_core/types.ts";

export type { CallAIConfig, CallAIResult } from "./_core/one_shot.ts";
export type {
  WebFetchToolConfig,
  WebSearchToolConfig,
} from "./_core/builtin_tools.ts";
