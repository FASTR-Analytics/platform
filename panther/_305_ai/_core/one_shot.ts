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
  resolveModelConfig,
  resolveOutputConfig,
  resolveThinkingConfig,
  supportsDynamicWebTools,
  supportsSamplingParams,
} from "../deps.ts";
import {
  type AIToolWithMetadata,
  getHeadlessCapability,
} from "./tool_helpers.ts";
import {
  type BuiltInToolsConfig,
  resolveBuiltInTools,
} from "./builtin_tools.ts";
import { getBetaHeaders, hasWebFetchTool } from "./beta_headers.ts";
import { aggregateUsage } from "./cost_utils.ts";

// Server-side tools (web search, web fetch) can return
// stop_reason: "pause_turn" when the server's iteration limit is reached.
// Re-sending the conversation with the assistant turn appended resumes it.
const MAX_PAUSE_TURN_CONTINUATIONS = 5;

// Safety cap on the SDK tool runner's client-tool loop so a pathological
// tool loop can't run unbounded. When hit, the runner stops with tools still
// requested; the pending tool_use blocks are resolved with synthetic error
// results so the returned history stays API-valid.
const MAX_CLIENT_TOOL_ITERATIONS = 24;

////////////////////////////////////////////////////////////////////////////////
// TYPES
////////////////////////////////////////////////////////////////////////////////

export interface CallAIConfig {
  sdkClient: Anthropic;
  // Model defaults live in panther (DEFAULT_MODEL_CONFIG) — omit entirely to
  // track them; pass a partial only for a genuinely call-specific override.
  modelConfig?: Partial<AnthropicModelConfig>;
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

export interface CallAIStructuredResult<T> extends CallAIResult {
  // null when the model refused or the output failed schema validation —
  // check stopReason ("refusal", "max_tokens") before retrying.
  data: T | null;
}

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
  const temperature = supportsSamplingParams(model)
    ? modelConfig.temperature
    : undefined;
  const thinking = resolveThinkingConfig(model, modelConfig.thinking);
  const effortConfig = resolveOutputConfig(
    model,
    modelConfig.output_config,
    thinking,
  );

  const res = await config.sdkClient.beta.messages.parse({
    model,
    max_tokens,
    temperature,
    thinking,
    output_config: {
      ...effortConfig,
      // Cast around zod-version skew: a consumer app may resolve a different
      // zod copy than the SDK's bundled peer, making the ZodType structurally
      // incompatible at the type level even though it validates fine at
      // runtime. parse() still enforces the schema; T is restored on `data`.
      // deno-lint-ignore no-explicit-any
      format: betaZodOutputFormat(schema as any),
    },
    // deno-lint-ignore no-explicit-any
    messages: messages as any,
    system: config.system?.(),
  });

  return {
    data: (res.parsed_output ?? null) as T | null,
    content: res.content as ContentBlock[],
    stopReason: res.stop_reason,
    usage: res.usage as Usage,
    messages: [
      ...messages,
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

  // Models from Opus 4.7 onward reject non-default sampling params with a
  // 400 — omit temperature there. Thinking config is resolved per model:
  // manual budgets are dropped on adaptive-only models, but an explicit
  // {type: "disabled"} is kept wherever the model accepts it (on Opus 5 and
  // Sonnet 5, omitting the field would silently enable adaptive thinking).
  const temperature = supportsSamplingParams(model)
    ? modelConfig.temperature
    : undefined;
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

  let currentMessages = messages;
  let continuations = 0;
  // Across pause_turn continuations, accumulate usage and content so the
  // result reflects the whole call, not just the final round. (Usage from
  // the tool runner's internal iterations is not exposed by the SDK and is
  // not included.)
  const roundUsages: Usage[] = [];
  let combinedContent: ContentBlock[] = [];

  while (true) {
    let res;
    if (allTools) {
      const runner = config.sdkClient.beta.messages.toolRunner({
        model,
        max_tokens,
        temperature,
        thinking,
        output_config,
        messages: currentMessages,
        tools: allTools,
        system: config.system?.(),
        betas,
        max_iterations: MAX_CLIENT_TOOL_ITERATIONS,
      });
      res = await runner.runUntilDone();
      // The runner accumulates the full conversation internally (assistant
      // tool_use turns + tool_result turns + the final assistant message).
      // Use that as the history — appending only the final message would
      // drop the intermediate tool turns, corrupting the returned messages
      // and any pause_turn resumption.
      currentMessages = [...runner.params.messages] as MessageParam[];
      // If the iteration cap stopped the runner while tools were still being
      // requested, the history ends with unresolved tool_use blocks — resolve
      // them with synthetic error results so the returned messages stay
      // API-valid for any later send.
      if (lastMessageHasUnresolvedToolUse(currentMessages)) {
        const lastMsg = currentMessages[currentMessages.length - 1];
        currentMessages = [
          ...currentMessages,
          {
            role: "user",
            content: buildCancelledToolResults(
              lastMsg.content as ContentBlock[],
              "Tool execution stopped: too many tool calls in one call",
            ),
          },
        ];
      }
    } else {
      res = await config.sdkClient.beta.messages.create({
        model,
        max_tokens,
        temperature,
        thinking,
        output_config,
        messages: currentMessages,
        system: config.system?.(),
        betas,
      });
      currentMessages = [
        ...currentMessages,
        {
          role: "assistant",
          content: res.content as ContentBlock[],
        },
      ];
    }

    roundUsages.push(res.usage as Usage);
    combinedContent = [...combinedContent, ...(res.content as ContentBlock[])];

    if (
      res.stop_reason === "pause_turn" &&
      continuations < MAX_PAUSE_TURN_CONTINUATIONS
    ) {
      continuations++;
      continue;
    }

    return {
      content: combinedContent,
      stopReason: res.stop_reason,
      usage: aggregateUsage(roundUsages),
      messages: currentMessages,
    };
  }
}
