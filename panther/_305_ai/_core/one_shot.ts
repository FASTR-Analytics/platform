// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type {
  Anthropic,
  AnthropicModelConfig,
  CacheControl,
  ContentBlock,
  MessageParam,
  Usage,
} from "../deps.ts";
import type { AIToolWithMetadata } from "./tool_helpers.ts";
import {
  type BuiltInToolsConfig,
  resolveBuiltInTools,
} from "./builtin_tools.ts";
import { getBetaHeaders, hasWebFetchTool } from "./beta_headers.ts";

////////////////////////////////////////////////////////////////////////////////
// TYPES
////////////////////////////////////////////////////////////////////////////////

export interface CallAIConfig {
  sdkClient: Anthropic;
  modelConfig: AnthropicModelConfig;
  system?: () =>
    | string
    | Array<{ type: "text"; text: string; cache_control?: CacheControl }>;
  // deno-lint-ignore no-explicit-any
  tools?: AIToolWithMetadata<any>[];
  builtInTools?: BuiltInToolsConfig;
}

export interface CallAIResult {
  content: ContentBlock[];
  stopReason: string | null;
  usage: Usage;
  messages: MessageParam[];
}

////////////////////////////////////////////////////////////////////////////////
// ONE-SHOT FUNCTION
////////////////////////////////////////////////////////////////////////////////

export async function callAI(
  config: CallAIConfig,
  messages: MessageParam[],
): Promise<CallAIResult> {
  const resolvedBuiltInTools = resolveBuiltInTools(config.builtInTools);
  const hasTools = config.tools?.length || resolvedBuiltInTools.length;

  // Build beta headers based on features used
  const betaHeaders = getBetaHeaders({
    hasTools: Boolean(hasTools),
    hasWebFetch: hasWebFetchTool(config.builtInTools),
  });

  if (hasTools) {
    const allTools = [
      ...(config.tools?.map((t) => ({
        ...t.sdkTool,
        strict: true, // Always enable strict mode
      })) || []),
      ...resolvedBuiltInTools,
    ];

    const res = await config.sdkClient.beta.messages.toolRunner({
      model: config.modelConfig.model,
      max_tokens: config.modelConfig.max_tokens,
      temperature: config.modelConfig.temperature,
      thinking: config.modelConfig.thinking,
      messages,
      tools: allTools,
      system: config.system?.(),
      betas: betaHeaders ? [betaHeaders["anthropic-beta"]] : undefined,
    });

    return {
      content: res.content as ContentBlock[],
      stopReason: res.stop_reason,
      usage: res.usage as Usage,
      messages: [
        ...messages,
        {
          role: "assistant",
          content: res.content as ContentBlock[],
        },
      ],
    };
  } else {
    const res = await config.sdkClient.beta.messages.create({
      model: config.modelConfig.model,
      max_tokens: config.modelConfig.max_tokens,
      temperature: config.modelConfig.temperature,
      thinking: config.modelConfig.thinking,
      messages,
      system: config.system?.(),
      betas: betaHeaders ? [betaHeaders["anthropic-beta"]] : undefined,
    });

    return {
      content: res.content as ContentBlock[],
      stopReason: res.stop_reason,
      usage: res.usage as Usage,
      messages: [
        ...messages,
        {
          role: "assistant",
          content: res.content as ContentBlock[],
        },
      ],
    };
  }
}
