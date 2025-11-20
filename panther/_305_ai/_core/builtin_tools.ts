// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

////////////////////////////////////////////////////////////////////////////////
// BUILT-IN TOOLS
////////////////////////////////////////////////////////////////////////////////
//
// Anthropic provides several built-in tools that can be used directly in API calls:
// - web_search_20250305: Real-time internet access with citations
// - bash_20250124: Execute shell commands in persistent session
// - text_editor_20250124: File viewing and editing capabilities
//
// These tools are different from custom tools created with createAITool():
// - They don't have custom handlers
// - They're configured via API parameters
// - The API executes them and returns results
//
// See: https://docs.claude.com/en/docs/agents-and-tools/tool-use/web-search-tool

////////////////////////////////////////////////////////////////////////////////
// WEB SEARCH TOOL
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

export interface WebSearchTool {
  type: "web_search_20250305";
  name: "web_search";
  max_uses?: number;
  allowed_domains?: string[];
  blocked_domains?: string[];
  user_location?: WebSearchUserLocation;
}

export function createWebSearchTool(
  config: WebSearchToolConfig = {},
): WebSearchTool {
  return {
    type: "web_search_20250305",
    name: "web_search",
    ...config,
  };
}

////////////////////////////////////////////////////////////////////////////////
// BASH TOOL
////////////////////////////////////////////////////////////////////////////////

export interface BashTool {
  type: "bash_20250124";
  name: "bash";
}

export function createBashTool(): BashTool {
  return {
    type: "bash_20250124",
    name: "bash",
  };
}

////////////////////////////////////////////////////////////////////////////////
// TEXT EDITOR TOOL
////////////////////////////////////////////////////////////////////////////////

export interface TextEditorTool {
  type: "text_editor_20250124";
  name: "str_replace_editor";
}

export function createTextEditorTool(): TextEditorTool {
  return {
    type: "text_editor_20250124",
    name: "str_replace_editor",
  };
}

////////////////////////////////////////////////////////////////////////////////
// UNION TYPE
////////////////////////////////////////////////////////////////////////////////

export type BuiltInTool = WebSearchTool | BashTool | TextEditorTool;
