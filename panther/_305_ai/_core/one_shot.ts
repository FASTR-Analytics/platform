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

export type CallAIResult = {
  content: ContentBlock[];
  stopReason: string | null;
  usage: Usage;
  messages: MessageParam[];
};

export type CallAIStructuredResult<T> = CallAIResult & {
  // null when the model refused or the output failed schema validation —
  // check stopReason ("refusal", "max_tokens") before retrying.
  data: T | null;
};

////////////////////////////////////////////////////////////////////////////////
// STRUCTURED ONE-SHOT
////////////////////////////////////////////////////////////////////////////////

// Schema-constrained one-shot call (structured outputs via
// output_config.format). The response is validated against the Zod schema
// by the SDK and returned as typed data. Tools are not supported on this
// path — use callAI for tool loops.
export async function callAIStructured<T>(
  config: Omit<CallAIConfig, "tools" | "builtInTools">,
  messages: MessageParam[],
  schema: zType.ZodType<T>,
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

  const res = await config.sdkClient.beta.messages.parse({
    model,
    max_tokens,
    thinking,
    output_config: {
      ...effortConfig,
      format: betaZodOutputFormat(schema),
    },
    messages: wire,
    system: config.system?.(),
  });

  return {
    data: (res.parsed_output ?? null) as T | null,
    content: res.content as ContentBlock[],
    stopReason: res.stop_reason,
    usage: res.usage as Usage,
    messages: [
      ...wire,
      { role: "assistant", content: res.content as ContentBlock[] },
    ],
  };
}

////////////////////////////////////////////////////////////////////////////////
// ONE-SHOT FUNCTION
////////////////////////////////////////////////////////////////////////////////

export async function callAI(
  config: CallAIConfig,
  messages: MessageParam[],
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

  if (!allTools) {
    // Without server tools a reply cannot stop on pause_turn, so one
    // request is the whole call.
    const res = await config.sdkClient.beta.messages.create({
      model,
      max_tokens,
      thinking,
      output_config,
      messages: wire,
      system: config.system?.(),
      betas,
    });
    const content = res.content as ContentBlock[];
    return {
      content,
      stopReason: res.stop_reason,
      usage: res.usage as Usage,
      messages: [...wire, { role: "assistant", content }],
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
  });

  // Each yielded message is one request's reply, and every reply is billed.
  // The runner resumes a pause_turn itself, so a paused reply is part of the
  // answer; a reply that stopped on tool_use is an intermediate tool round.
  const usages: Usage[] = [];
  const content: ContentBlock[] = [];
  let stopReason: string | null = null;
  for await (const reply of runner) {
    usages.push(reply.usage as Usage);
    if (reply.stop_reason !== "tool_use") {
      content.push(...(reply.content as ContentBlock[]));
    }
    stopReason = reply.stop_reason;
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
  };
}
