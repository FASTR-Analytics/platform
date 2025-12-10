// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

////////////////////////////////////////////////////////////////////////////////
// BUILT-IN TOOLS
////////////////////////////////////////////////////////////////////////////////
//
// Anthropic provides several built-in tools that can be used directly in API calls:
// - web_search: Real-time internet access with citations
// - web_fetch: Fetch specific URLs
// - bash: Execute shell commands in persistent session
// - text_editor: File viewing and editing capabilities
//
// Usage in AIChatConfig:
//   builtInTools: {
//     webSearch: true,  // or { max_uses: 5, allowed_domains: ["example.com"] }
//     webFetch: true,
//     bash: true,
//     textEditor: true,
//   }
//
// See: https://docs.claude.com/en/docs/agents-and-tools/tool-use/web-search-tool

////////////////////////////////////////////////////////////////////////////////
// WEB SEARCH CONFIG
////////////////////////////////////////////////////////////////////////////////

export interface WebSearchUserLocation {
  type: "approximate";
  city?: string;
  region?: string;
  country?: string;
  timezone?: string;
}

export interface WebSearchToolConfig {
  max_uses?: number;
  allowed_domains?: string[];
  blocked_domains?: string[];
  user_location?: WebSearchUserLocation;
}

////////////////////////////////////////////////////////////////////////////////
// WEB FETCH CONFIG
////////////////////////////////////////////////////////////////////////////////

export interface WebFetchToolConfig {
  max_uses?: number;
  allowed_domains?: string[];
  blocked_domains?: string[];
  citations?: { enabled: boolean };
  max_content_tokens?: number;
}

////////////////////////////////////////////////////////////////////////////////
// BUILT-IN TOOLS CONFIG (USER-FACING)
////////////////////////////////////////////////////////////////////////////////

export interface BuiltInToolsConfig {
  webSearch?: boolean | WebSearchToolConfig;
  webFetch?: boolean | WebFetchToolConfig;
  bash?: boolean;
  textEditor?: boolean;
}

////////////////////////////////////////////////////////////////////////////////
// SDK TOOL TYPES (INTERNAL)
////////////////////////////////////////////////////////////////////////////////

interface WebSearchToolSDK {
  type: "web_search_20250305";
  name: "web_search";
  max_uses?: number;
  allowed_domains?: string[];
  blocked_domains?: string[];
  user_location?: WebSearchUserLocation;
}

interface WebFetchToolSDK {
  type: "web_fetch_20250910";
  name: "web_fetch";
  max_uses?: number;
  allowed_domains?: string[];
  blocked_domains?: string[];
  citations?: { enabled: boolean };
  max_content_tokens?: number;
}

interface BashToolSDK {
  type: "bash_20250124";
  name: "bash";
}

interface TextEditorToolSDK {
  type: "text_editor_20250728";
  name: "str_replace_based_edit_tool";
}

type BuiltInToolSDK =
  | WebSearchToolSDK
  | WebFetchToolSDK
  | BashToolSDK
  | TextEditorToolSDK;

////////////////////////////////////////////////////////////////////////////////
// CONVERT CONFIG TO SDK TOOLS
////////////////////////////////////////////////////////////////////////////////

export function resolveBuiltInTools(
  config: BuiltInToolsConfig | undefined,
): BuiltInToolSDK[] {
  if (!config) return [];

  const tools: BuiltInToolSDK[] = [];

  if (config.webSearch) {
    const webSearchConfig =
      typeof config.webSearch === "object" ? config.webSearch : {};
    tools.push({
      type: "web_search_20250305",
      name: "web_search",
      ...webSearchConfig,
    });
  }

  if (config.webFetch) {
    const webFetchConfig =
      typeof config.webFetch === "object" ? config.webFetch : {};
    tools.push({
      type: "web_fetch_20250910",
      name: "web_fetch",
      ...webFetchConfig,
    });
  }

  if (config.bash) {
    tools.push({
      type: "bash_20250124",
      name: "bash",
    });
  }

  if (config.textEditor) {
    tools.push({
      type: "text_editor_20250728",
      name: "str_replace_based_edit_tool",
    });
  }

  return tools;
}
