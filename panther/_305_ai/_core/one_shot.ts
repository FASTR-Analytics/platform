// Copyright 2023-2026, Tim Roberton, All rights reserved.
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
import type { zType } from "../deps.ts";
import {
  betaZodOutputFormat,
  buildCancelledToolResults,
  lastMessageHasUnresolvedToolUse,
  renderOutgoingMessages,
  resolveModelConfig,
  resolveOutputConfig,
  resolveThinkingConfig,
  supportsDynamicWebTools,
} from "../deps.ts";
import { type AnyAITool, getHeadlessCapability } from "../deps.ts";
import {
  type BuiltInToolsConfig,
  resolveBuiltInTools,
} from "./builtin_tools.ts";
import { getBetaHeaders, hasWebFetchTool } from "./beta_headers.ts";
import { aggregateUsage } from "./cost_utils.ts";

// Safety cap on the SDK tool runner's requests so a pathological tool loop
// can't run unbounded. Every request counts: a client tool round and a
// pause_turn the runner resumes alike. When hit, the runner stops with tools
// still requested; the pending tool_use blocks are resolved with synthetic
// error results so the returned history stays API-valid.
const MAX_TOOL_RUNNER_REQUESTS = 24;

// `beta.messages.parse` sends this beta with every structured request; the
// streaming request that stands in for it has to send it too.
const STRUCTURED_OUTPUTS_BETA = "structured-outputs-2025-12-15";

////////////////////////////////////////////////////////////////////////////////
// TYPES
////////////////////////////////////////////////////////////////////////////////

export type CallAIConfig = {
  sdkClient: Anthropic;
  // Model defaults live in panther (DEFAULT_MODEL_CONFIG) — omit entirely to
  // track them; pass a partial only for a genuinely call-specific override.
  modelConfig?: Partial<AnthropicModelConfig>;
  system?: () =>
    | string
    | Array<{ type: "text"; text: string; cache_control?: CacheControl }>;
  tools?: AnyAITool[];
  builtInTools?: BuiltInToolsConfig;
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
  config: Omit<CallAIConfig, "tools" | "builtInTools">,
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
    messages: [...wire, { role: "assistant", content }],
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

////////////////////////////////////////////////////////////////////////////////
// ONE-SHOT FUNCTION
////////////////////////////////////////////////////////////////////////////////

export async function callAI(
  config: CallAIConfig,
  messages: MessageParam[],
  options?: CallAIOptions,
): Promise<CallAIResult> {
  // Structural eligibility via the shared headless helper (one concept with
  // the MCP surface, so the rules can never drift). callAI's mapping: every
  // view-bound tool is rejected (no viewController — the availableIn gate
  // would be silently skipped, and a view-typed handler would read undefined
  // from the SDK runner's run(input)); ALL approval tools are rejected (no
  // user to ask — the tool's run() would throw mid-call, so fail loud at
  // entry). This is where callAI diverges from createMCPServer, which accepts
  // plain-shape approval tools under an approval mode. "nav" passes, as it
  // always has here. Whether callAI should also require the `headless: true`
  // declaration is deferred — until consumer repos are grepped, the
  // declaration gates MCP only and callAI stays structural.
  for (const tool of config.tools ?? []) {
    const capability = getHeadlessCapability(tool.metadata);
    switch (capability.kind) {
      case "view-bound":
        throw new Error(
          capability.via === "availableIn"
            ? `callAI: tool "${tool.sdkTool.name}" declares availableIn — view-gated tools are chat-only (callAI has no viewController to gate against). Use a plain createAITool tool here.`
            : `callAI: tool "${tool.sdkTool.name}" declares a views registry — its handler expects the live view state the chat engine injects, which callAI has no controller to supply. Use a plain createAITool tool here.`,
        );
      case "approval-plain":
        throw new Error(
          `callAI: tool "${tool.sdkTool.name}" declares approval — confirm-before-apply tools are chat-only (callAI has no user to ask). Use a plain handler tool here.`,
        );
      case "nav":
      case "ok":
        break;
      default: {
        // Exhaustiveness backstop: a future capability variant must be
        // explicitly mapped here, never silently accepted.
        const unhandled: never = capability;
        throw new Error(
          `callAI: unhandled tool capability ${JSON.stringify(unhandled)}`,
        );
      }
    }
  }
  const modelConfig = resolveModelConfig(config.modelConfig);
  const { model, max_tokens } = modelConfig;
  const resolvedBuiltInTools = resolveBuiltInTools(config.builtInTools, model);
  const hasTools = config.tools?.length || resolvedBuiltInTools.length;

  // Build beta headers based on features used. The web-fetch beta header is
  // only needed for the basic web_fetch variant used on pre-4.6 models.
  const betaHeaders = getBetaHeaders({
    hasBasicWebFetch: hasWebFetchTool(config.builtInTools) &&
      !supportsDynamicWebTools(model),
  });
  const betas = betaHeaders ? [betaHeaders["anthropic-beta"]] : undefined;

  // Thinking config is resolved per model: manual budgets are dropped on
  // adaptive-only models, but an explicit {type: "disabled"} is kept wherever
  // the model accepts it (on Opus 5 and Sonnet 5, omitting the field would
  // silently enable adaptive thinking).
  const thinking = resolveThinkingConfig(model, modelConfig.thinking);
  const output_config = resolveOutputConfig(
    model,
    modelConfig.output_config,
    thinking,
  );

  const allTools = hasTools
    ? [
      ...(config.tools?.map((t) => t.sdkTool) || []),
      ...resolvedBuiltInTools,
    ]
    : undefined;
  const wire = renderOutgoingMessages(messages);
  const requestOptions = { signal: options?.signal };

  if (!allTools) {
    // Without server tools a reply cannot stop on pause_turn, so one request
    // is the whole call. It streams because the SDK refuses a non-streaming
    // request with panther's default max_tokens before it is sent (its
    // ten-minute rule).
    const res = await config.sdkClient.beta.messages.stream({
      model,
      max_tokens,
      thinking,
      output_config,
      messages: wire,
      system: config.system?.(),
      betas,
    }, requestOptions).finalMessage();
    const content = res.content as ContentBlock[];
    return {
      content,
      stopReason: res.stop_reason,
      usage: res.usage as Usage,
      messages: [...wire, { role: "assistant", content }],
      model: res.model,
    };
  }

  const runner = config.sdkClient.beta.messages.toolRunner({
    model,
    max_tokens,
    thinking,
    output_config,
    messages: wire,
    tools: allTools,
    system: config.system?.(),
    betas,
    max_iterations: MAX_TOOL_RUNNER_REQUESTS,
    // The whole history rides every request, as on every other panther
    // request, instead of a conversation the server holds.
    thread: false,
    // Each request streams for the same reason the tool-less request does:
    // the SDK refuses a non-streaming request at panther's default
    // max_tokens.
    stream: true,
  }, requestOptions);

  // Each yielded stream is one request's reply, and every reply is billed.
  // The runner resumes a pause_turn itself, so a paused reply is part of the
  // answer; a reply that stopped on tool_use is an intermediate tool round.
  const usages: Usage[] = [];
  const content: ContentBlock[] = [];
  let stopReason: string | null = null;
  let responseModel = model;
  for await (const stream of runner) {
    const reply = await stream.finalMessage();
    usages.push(reply.usage as Usage);
    if (reply.stop_reason !== "tool_use") {
      content.push(...(reply.content as ContentBlock[]));
    }
    stopReason = reply.stop_reason;
    responseModel = reply.model;
  }

  // The runner holds the full conversation: the tool_use turns, the tool
  // results and the final reply.
  const history = [...runner.params.messages] as MessageParam[];
  // If the request cap stopped the runner while tools were still being
  // requested, the history ends with unresolved tool_use blocks — resolve
  // them with synthetic error results so the returned messages stay
  // API-valid for any later send.
  const lastMsg = history[history.length - 1];
  const messagesOut = lastMessageHasUnresolvedToolUse(history)
    ? [
      ...history,
      {
        role: "user" as const,
        content: buildCancelledToolResults(
          lastMsg.content as ContentBlock[],
          "Tool execution stopped: too many tool calls in one call",
        ),
      },
    ]
    : history;

  return {
    content,
    stopReason,
    usage: aggregateUsage(usages),
    messages: messagesOut,
    model: responseModel,
  };
}
