// Copyright 2023-2026, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type { AnthropicModel } from "./types.ts";
import {
  BETA_HEADERS,
  BUILTIN_TOOL_TYPES,
  supportsDynamicWebTools,
} from "./anthropic_consts.ts";

////////////////////////////////////////////////////////////////////////////////
// WEB SEARCH CONFIG
////////////////////////////////////////////////////////////////////////////////

export type WebSearchUserLocation = {
  type: "approximate";
  city?: string;
  region?: string;
  country?: string;
  timezone?: string;
};

export type WebSearchToolConfig = {
  max_uses?: number;
  allowed_domains?: string[];
  blocked_domains?: string[];
  user_location?: WebSearchUserLocation;
};

////////////////////////////////////////////////////////////////////////////////
// WEB FETCH CONFIG
////////////////////////////////////////////////////////////////////////////////

export type WebFetchURLSource =
  | { type: "all" }
  | { type: "none" }
  | {
    type: "only" | "except";
    tools: Array<{ type: "tool_reference"; name: string }>;
  };

// A source left out keeps the API's default.
export type WebFetchURLSources = {
  user_input?: { type: "all" } | { type: "none" };
  client_tool_results?: WebFetchURLSource;
  server_tool_results?: WebFetchURLSource;
};

export type WebFetchToolConfig = {
  max_uses?: number;
  allowed_domains?: string[];
  blocked_domains?: string[];
  citations?: { enabled: boolean };
  max_content_tokens?: number;
  url_sources?: WebFetchURLSources;
};

////////////////////////////////////////////////////////////////////////////////
// BUILT-IN TOOLS CONFIG (USER-FACING)
////////////////////////////////////////////////////////////////////////////////

export type BuiltInToolsConfig = {
  webSearch?: boolean | WebSearchToolConfig;
  webFetch?: boolean | WebFetchToolConfig;
  bash?: boolean;
  textEditor?: boolean;
};

////////////////////////////////////////////////////////////////////////////////
// SDK TOOL TYPES (INTERNAL)
////////////////////////////////////////////////////////////////////////////////

type WebSearchToolSDK = {
  type:
    | typeof BUILTIN_TOOL_TYPES.WEB_SEARCH
    | typeof BUILTIN_TOOL_TYPES.WEB_SEARCH_BASIC;
  name: "web_search";
  max_uses?: number;
  allowed_domains?: string[];
  blocked_domains?: string[];
  user_location?: WebSearchUserLocation;
};

type WebFetchToolSDK = WebFetchToolConfig & {
  type:
    | typeof BUILTIN_TOOL_TYPES.WEB_FETCH
    | typeof BUILTIN_TOOL_TYPES.WEB_FETCH_BASIC;
  name: "web_fetch";
};

type BashToolSDK = {
  type: typeof BUILTIN_TOOL_TYPES.BASH;
  name: "bash";
};

type TextEditorToolSDK = {
  type: typeof BUILTIN_TOOL_TYPES.TEXT_EDITOR;
  name: "str_replace_based_edit_tool";
};

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
  model: AnthropicModel,
): BuiltInToolSDK[] {
  if (!config) return [];

  const dynamicWebTools = supportsDynamicWebTools(model);
  const tools: BuiltInToolSDK[] = [];

  if (config.webSearch) {
    const webSearchConfig = typeof config.webSearch === "object"
      ? config.webSearch
      : {};
    tools.push({
      type: dynamicWebTools
        ? BUILTIN_TOOL_TYPES.WEB_SEARCH
        : BUILTIN_TOOL_TYPES.WEB_SEARCH_BASIC,
      name: "web_search",
      ...webSearchConfig,
    });
  }

  if (config.webFetch) {
    const webFetchConfig = typeof config.webFetch === "object"
      ? config.webFetch
      : {};
    tools.push({
      type: dynamicWebTools
        ? BUILTIN_TOOL_TYPES.WEB_FETCH
        : BUILTIN_TOOL_TYPES.WEB_FETCH_BASIC,
      name: "web_fetch",
      ...webFetchConfig,
    });
  }

  if (config.bash) {
    tools.push({
      type: BUILTIN_TOOL_TYPES.BASH,
      name: "bash",
    });
  }

  if (config.textEditor) {
    tools.push({
      type: BUILTIN_TOOL_TYPES.TEXT_EDITOR,
      name: "str_replace_based_edit_tool",
    });
  }

  return tools;
}

////////////////////////////////////////////////////////////////////////////////
// BETA HEADER HELPERS
////////////////////////////////////////////////////////////////////////////////

type BetaHeaderConfig = {
  // True only when the request carries the basic web_fetch_20250910 tool
  // (pre-4.6 models); the _20260209 web tools are GA and need no beta.
  hasBasicWebFetch?: boolean;
};

const ANTHROPIC_BETA_HEADER = "anthropic-beta";

export function getBetaHeaders(
  config: BetaHeaderConfig,
): Record<typeof ANTHROPIC_BETA_HEADER, string> | undefined {
  return config.hasBasicWebFetch
    ? { [ANTHROPIC_BETA_HEADER]: BETA_HEADERS.WEB_FETCH }
    : undefined;
}

export function resolveBetas(
  builtInTools: BuiltInToolsConfig | undefined,
  model: AnthropicModel,
): string[] | undefined {
  const carriesBasicWebFetch = resolveBuiltInTools(builtInTools, model).some(
    (t) => t.type === BUILTIN_TOOL_TYPES.WEB_FETCH_BASIC,
  );
  return carriesBasicWebFetch ? [BETA_HEADERS.WEB_FETCH] : undefined;
}
