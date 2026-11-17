// Copyright 2023-2026, Tim Roberton. MIT license.
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
  zType,
} from "./deps.ts";
import {
  betaZodOutputFormat,
  fillEmptyReplies,
  renderOutgoingMessages,
  resolveModelConfig,
  resolveOutputConfig,
  resolveThinkingConfig,
} from "./deps.ts";

// `beta.messages.parse` sends this beta with every structured request; the
// streaming request that stands in for it has to send it too.
const STRUCTURED_OUTPUTS_BETA = "structured-outputs-2025-12-15";

////////////////////////////////////////////////////////////////////////////////
// TYPES
////////////////////////////////////////////////////////////////////////////////

export type CallAIStructuredConfig = {
  sdkClient: Anthropic;
  // Model defaults live in panther (DEFAULT_MODEL_CONFIG) — omit entirely to
  // track them; pass a partial only for a genuinely call-specific override.
  modelConfig?: Partial<AnthropicModelConfig>;
  system?: () =>
    | string
    | Array<{ type: "text"; text: string; cache_control?: CacheControl }>;
};

export type CallAIOptions = {
  // Reaches every SDK request of the call, the tool runner's included.
  signal?: AbortSignal;
};

export type CallAIResult = {
  content: ContentBlock[];
  stopReason: string | null;
  usage: Usage;
  messages: MessageParam[];
  // The model the response names, which a server-side fallback can make a
  // different one from the model requested.
  model: string;
};

export type CallAIStructuredResult<T> = CallAIResult & {
  // null when the model refused, when max_tokens cut the output, or when the
  // text fails the schema — check stopReason before retrying.
  data: T | null;
};

////////////////////////////////////////////////////////////////////////////////
// STRUCTURED ONE-SHOT
////////////////////////////////////////////////////////////////////////////////

// Schema-constrained one-shot call (structured outputs via
// output_config.format). Tools are not supported on this path — use callAI
// for tool loops.
export async function callAIStructured<T>(
  config: CallAIStructuredConfig,
  messages: MessageParam[],
  schema: zType.ZodType<T>,
  options?: CallAIOptions,
): Promise<CallAIStructuredResult<T>> {
  const modelConfig = resolveModelConfig(config.modelConfig);
  const { model, max_tokens } = modelConfig;
  const thinking = resolveThinkingConfig(model, modelConfig.thinking);
  const effortConfig = resolveOutputConfig(
    model,
    modelConfig.output_config,
    thinking,
  );
  const wire = renderOutgoingMessages(messages);
  // The SDK's parser on the format throws on a schema miss and fails the
  // stream with it; sent without the parser, the final text is validated
  // here and a miss is a null.
  const { parse: _parse, ...format } = betaZodOutputFormat(schema);

  // A non-streaming request with panther's default max_tokens is refused by
  // the SDK before it is sent (its ten-minute rule), so the one request
  // streams and settles on its final message.
  const res = await config.sdkClient.beta.messages.stream({
    model,
    max_tokens,
    thinking,
    output_config: { ...effortConfig, format },
    messages: wire,
    system: config.system?.(),
    betas: [STRUCTURED_OUTPUTS_BETA],
  }, { signal: options?.signal }).finalMessage();

  const content = res.content as ContentBlock[];
  return {
    data: parseStructuredText(schema, content),
    content,
    stopReason: res.stop_reason,
    usage: res.usage as Usage,
    messages: fillEmptyReplies([...wire, { role: "assistant", content }]),
    model: res.model,
  };
}

function parseStructuredText<T>(
  schema: zType.ZodType<T>,
  content: ContentBlock[],
): T | null {
  const text = content.find(isTextBlock)?.text;
  if (text === undefined) return null;
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return null;
  }
  const parsed = schema.safeParse(json);
  return parsed.success ? parsed.data : null;
}

function isTextBlock(
  block: ContentBlock,
): block is Extract<ContentBlock, { type: "text" }> {
  return block.type === "text";
}
