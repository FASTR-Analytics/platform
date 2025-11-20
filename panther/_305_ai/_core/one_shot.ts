// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type { Anthropic } from "../deps.ts";
import type { AIToolWithMetadata } from "./tool_helpers.ts";
import type { BuiltInTool } from "./builtin_tools.ts";
import type {
  AnthropicModelConfig,
  CacheControl,
  ContentBlock,
  MessageParam,
  Usage,
} from "./types.ts";

////////////////////////////////////////////////////////////////////////////////
// TYPES
////////////////////////////////////////////////////////////////////////////////

export interface CallAIConfig {
  sdkClient: Anthropic;
  modelConfig: AnthropicModelConfig;
  system?:
    | string
    | Array<{ type: "text"; text: string; cache_control?: CacheControl }>;
  // deno-lint-ignore no-explicit-any
  tools?: AIToolWithMetadata<any>[];
  builtInTools?: BuiltInTool[];
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
  const hasTools = config.tools?.length || config.builtInTools?.length;

  if (hasTools) {
    const allTools = [
      ...(config.tools?.map((t) => t.sdkTool) || []),
      ...(config.builtInTools || []),
    ];

    const result = await config.sdkClient.beta.messages.toolRunner({
      model: config.modelConfig.model,
      max_tokens: config.modelConfig.max_tokens,
      temperature: config.modelConfig.temperature,
      messages,
      tools: allTools,
      system: config.system,
    });

    return {
      content: result.content as ContentBlock[],
      stopReason: result.stop_reason,
      usage: result.usage as Usage,
      messages: [
        ...messages,
        {
          role: "assistant",
          content: result.content as ContentBlock[],
        },
      ],
    };
  } else {
    const response = await config.sdkClient.messages.create({
      model: config.modelConfig.model,
      max_tokens: config.modelConfig.max_tokens,
      temperature: config.modelConfig.temperature,
      messages,
      system: config.system,
    });

    return {
      content: response.content as ContentBlock[],
      stopReason: response.stop_reason,
      usage: response.usage as Usage,
      messages: [
        ...messages,
        {
          role: "assistant",
          content: response.content as ContentBlock[],
        },
      ],
    };
  }
}
