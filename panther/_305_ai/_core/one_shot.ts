// Copyright 2023-2026, Tim Roberton. MIT license.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type {
  BuiltInToolsConfig,
  CallAIOptions,
  CallAIResult,
  CallAIStructuredConfig,
  ContentBlock,
  MessageParam,
  Usage,
} from "../deps.ts";
import {
  fillEmptyReplies,
  renderOutgoingMessages,
  repairStrandedToolUse,
  resolveBetas,
  resolveBuiltInTools,
  resolveModelConfig,
  resolveOutputConfig,
  resolveThinkingConfig,
} from "../deps.ts";
import { type AnyAITool, getHeadlessCapability } from "../deps.ts";

// Safety cap on the SDK tool runner's requests so a pathological tool loop
// can't run unbounded. Every request counts: a client tool round and a
// pause_turn the runner resumes alike. When hit, the runner stops with tools
// still requested; the pending tool_use blocks are resolved with synthetic
// error results so the returned history stays API-valid.
const MAX_TOOL_RUNNER_REQUESTS = 24;

////////////////////////////////////////////////////////////////////////////////
// TYPES
////////////////////////////////////////////////////////////////////////////////

export type CallAIConfig = CallAIStructuredConfig & {
  tools?: AnyAITool[];
  builtInTools?: BuiltInToolsConfig;
};

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

  const betas = resolveBetas(config.builtInTools, model);

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
      messages: fillEmptyReplies([...wire, { role: "assistant", content }]),
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
  // results and the final reply. If the request cap stopped the runner while
  // tools were still being requested, the history ends stranded; the
  // returned messages must stay sendable.
  const messagesOut = fillEmptyReplies(repairStrandedToolUse(
    [...runner.params.messages] as MessageParam[],
    "Tool execution stopped: too many tool calls in one call",
  ));

  return {
    content,
    stopReason,
    usage: aggregateUsage(usages),
    messages: messagesOut,
    model: responseModel,
  };
}

function aggregateUsage(usages: Usage[]): Usage {
  return usages.reduce(
    (acc, usage) => ({
      input_tokens: acc.input_tokens + usage.input_tokens,
      output_tokens: acc.output_tokens + usage.output_tokens,
      cache_creation_input_tokens: (acc.cache_creation_input_tokens ?? 0) +
        (usage.cache_creation_input_tokens ?? 0),
      cache_read_input_tokens: (acc.cache_read_input_tokens ?? 0) +
        (usage.cache_read_input_tokens ?? 0),
    }),
    {
      input_tokens: 0,
      output_tokens: 0,
      cache_creation_input_tokens: 0,
      cache_read_input_tokens: 0,
    },
  );
}
