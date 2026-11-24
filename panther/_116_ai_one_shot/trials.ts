// Copyright 2023-2026, Tim Roberton. MIT license.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type {
  AIToolCallContext,
  AIToolRun,
  AIViewRegistry,
  AIViewState,
  AnyAITool,
  AnyAIView,
  ContentBlock,
  GateView,
  MessageParam,
  SDKToolRunContext,
  SetViewArgs,
  Usage,
  UserMessageParam,
} from "./deps.ts";
import {
  AIToolFailure,
  assembleTurnSections,
  buildToolResultContent,
  decideViewGate,
  getHeadlessCapability,
  parseViewState,
  resolveAIToolCallContext,
  resolveViewSectionParts,
  runAIToolWithView,
} from "./deps.ts";
import { callAI, type CallAIConfig } from "./one_shot.ts";
import {
  type CallAIOptions,
  type CallAIResult,
  isTextBlock,
} from "./one_shot_structured.ts";

////////////////////////////////////////////////////////////////////////////////
// TYPES
////////////////////////////////////////////////////////////////////////////////

export type AITrialToolCall = {
  name: string;
  input: unknown;
  isError: boolean;
};

export type AITrial = {
  toolCalls: AITrialToolCall[];
  answer: string;
  stopReason: string | null;
  usage: Usage;
};

export type AITrialsOptions = CallAIOptions & { runs: number };

// A question sent from a view: its view written as setView takes it, the id
// and then the view's params and context, so ["chat"] or ["figure", params].
export type AITrialQuestion<TDefs extends Record<string, AnyAIView>> = {
  text: string;
  view: {
    [K in keyof TDefs]: [id: K, ...args: SetViewArgs<TDefs, K>];
  }[keyof TDefs];
};

////////////////////////////////////////////////////////////////////////////////
// READ
////////////////////////////////////////////////////////////////////////////////

export function readAITrial(result: CallAIResult): AITrial {
  const isErrorById = new Map(
    result.messages
      .flatMap(blocksOf)
      .filter(isToolResult)
      .map((block) => [block.tool_use_id, block.is_error === true] as const),
  );
  return {
    toolCalls: result.messages
      .filter((message) => message.role === "assistant")
      .flatMap(blocksOf)
      .filter(isToolUse)
      .map((block) => ({
        name: block.name,
        input: block.input,
        isError: isErrorById.get(block.id) ?? true,
      })),
    answer: result.content
      .filter(isTextBlock)
      .map((block) => block.text)
      .join(""),
    stopReason: result.stopReason,
    usage: result.usage,
  };
}

function blocksOf(message: MessageParam): ContentBlock[] {
  return typeof message.content === "string" ? [] : message.content;
}

function isToolUse(
  block: ContentBlock,
): block is Extract<ContentBlock, { type: "tool_use" }> {
  return block.type === "tool_use";
}

function isToolResult(
  block: ContentBlock,
): block is Extract<ContentBlock, { type: "tool_result" }> {
  return block.type === "tool_result";
}

////////////////////////////////////////////////////////////////////////////////
// RUN
////////////////////////////////////////////////////////////////////////////////

type ErasedViews = Record<string, AnyAIView>;

// The view a question is sent from, resolved once: a trial's view never
// moves, so its gate view is both the live view and the reference of every
// call the question's runs make.
type TrialView = { state: AIViewState<ErasedViews>; gate: GateView };

type TrialQuestion = { message: UserMessageParam; tools?: AnyAITool[] };

export function runAITrials(
  config: CallAIConfig & { viewRegistry?: undefined },
  questions: readonly string[],
  options: AITrialsOptions,
): Promise<AITrial[][]>;
export function runAITrials<TDefs extends Record<string, AnyAIView>>(
  config: CallAIConfig & { viewRegistry: AIViewRegistry<TDefs> },
  questions: readonly AITrialQuestion<NoInfer<TDefs>>[],
  options: AITrialsOptions,
): Promise<AITrial[][]>;
export async function runAITrials(
  config: CallAIConfig & { viewRegistry?: AIViewRegistry<ErasedViews> },
  questions: readonly (string | AITrialQuestion<ErasedViews>)[],
  options: AITrialsOptions,
): Promise<AITrial[][]> {
  const { runs, ...callOptions } = options;
  if (!Number.isInteger(runs) || runs < 1) {
    throw new Error(
      `runAITrials: runs must be a whole number of at least 1, got ${runs}`,
    );
  }
  const { viewRegistry, ...callConfig } = config;
  // Every check runs before the first request, so a mistake in a late
  // question spends no model calls on the questions before it.
  checkTrialTools(callConfig.tools ?? [], viewRegistry);
  const trialQuestions = questions.map((question, i) =>
    buildTrialQuestion(callConfig.tools, viewRegistry, question, i)
  );
  const trials: AITrial[][] = [];
  for (const { message, tools } of trialQuestions) {
    const failed = new AbortController();
    const signal = callOptions.signal
      ? AbortSignal.any([callOptions.signal, failed.signal])
      : failed.signal;
    try {
      trials.push(
        await Promise.all(
          Array.from({ length: runs }, async () =>
            readAITrial(
              await callAI(
                { ...callConfig, tools },
                [message],
                { ...callOptions, signal },
              ),
            )),
        ),
      );
    } catch (e) {
      failed.abort(e);
      throw e;
    }
  }
  return trials;
}

// A view-bound tool runs only from a view of the registry it was typed
// against, as at the chat's registration.
function checkTrialTools(
  tools: readonly AnyAITool[],
  viewRegistry: AIViewRegistry<ErasedViews> | undefined,
): void {
  for (const tool of tools) {
    const capability = getHeadlessCapability(tool.metadata);
    if (capability.kind !== "view-bound") continue;
    const name = tool.sdkTool.name;
    if (viewRegistry === undefined) {
      throw new Error(
        `runAITrials: tool "${name}" ${
          capability.via === "availableIn"
            ? "declares availableIn"
            : "was typed against a view registry"
        }, so it runs only from a view: pass that registry as config.viewRegistry and send each question from a view.`,
      );
    }
    const source = tool.metadata._viewRegistry;
    if (source !== undefined && source !== viewRegistry) {
      throw new Error(
        `runAITrials: tool "${name}" was typed against a different view registry than config.viewRegistry. Pass the same defineAIViews registry to both.`,
      );
    }
    for (const id of tool.metadata.availableIn ?? []) {
      if (!Object.hasOwn(viewRegistry._defs, id)) {
        throw new Error(
          `runAITrials: tool "${name}": availableIn names view "${id}", which config.viewRegistry does not hold.`,
        );
      }
    }
  }
}

// A question from a view carries the view sections the chat's message from
// that view carries, resolved and assembled by the same functions.
function buildTrialQuestion(
  tools: AnyAITool[] | undefined,
  viewRegistry: AIViewRegistry<ErasedViews> | undefined,
  question: string | AITrialQuestion<ErasedViews>,
  i: number,
): TrialQuestion {
  if (viewRegistry === undefined) {
    if (typeof question !== "string") {
      throw new Error(
        `runAITrials: questions[${i}] names a view, and the config has no viewRegistry to send it from.`,
      );
    }
    return {
      message: { role: "user", content: question },
      tools: tools?.map(withoutUserApproval),
    };
  }
  if (typeof question === "string") {
    throw new Error(
      `runAITrials: questions[${i}] is a string, and with config.viewRegistry every question is { text, view }, sent from its view as the chat sends every message from one.`,
    );
  }
  let state: AIViewState<ErasedViews>;
  try {
    state = parseViewState(viewRegistry, ...question.view);
  } catch (e) {
    throw new Error(
      `runAITrials: questions[${i}]: ${e instanceof Error ? e.message : e}`,
      { cause: e },
    );
  }
  const parts = resolveViewSectionParts(viewRegistry, state);
  const view: TrialView = { state, gate: parts.view };
  return {
    message: {
      role: "user",
      content: question.text,
      ephemeralSections: assembleTurnSections(parts),
    },
    tools: tools?.map((tool) =>
      getHeadlessCapability(tool.metadata).kind === "view-bound"
        ? fromView(tool, view)
        : withoutUserApproval(tool)
    ),
  };
}

function needsApprovalFailure(name: string): AIToolFailure {
  return new AIToolFailure(
    `Tool "${name}" needs a user's approval before it runs, and a trial has no user to give it. Nothing was done.`,
  );
}

// The tools array is part of the prompt, so an approval tool is sent as it is
// defined; only its call is answered differently, since a trial has no user
// to approve it. Its parse still runs first, so a call whose input fails the
// schema is answered with that error, as in the chat.
function withoutUserApproval(tool: AnyAITool): AnyAITool {
  if (getHeadlessCapability(tool.metadata).kind !== "approval-plain") {
    return tool;
  }
  const { approval: _approval, awaitsUserAction: _awaits, ...metadata } =
    tool.metadata;
  const { runWithView: _runWithView, ...sdkTool } = tool.sdkTool;
  return {
    metadata,
    sdkTool: {
      ...sdkTool,
      run: () => Promise.reject(needsApprovalFailure(sdkTool.name)),
    },
  };
}

// A view-bound tool run as the chat runs it from the question's view: the
// gate first, before the input is parsed, then an approval tool answered as
// withoutUserApproval answers it, and any other tool handed the view state.
// Sent as defined, with the metadata callAI refuses dropped. Its parse is
// dropped too, since the SDK's runner parses before run() and the gate
// comes first. It runs with the call context it is given, so callAI hands
// it its earlier calls as it hands any tool.
function fromView(tool: AnyAITool, view: TrialView): AnyAITool {
  const {
    availableIn,
    approval,
    awaitsUserAction: _awaits,
    _viewRegistry: _registry,
    ...metadata
  } = tool.metadata;
  const { runWithView: _runWithView, parse, ...sdkTool } = tool.sdkTool;
  const runFromView = (
    input: unknown,
    ctx: AIToolCallContext,
  ): Promise<AIToolRun> => {
    const decision = decideViewGate({
      availableIn,
      live: view.gate,
      reference: view.gate,
    });
    if (decision.kind !== "admit") {
      throw new AIToolFailure(decision.message);
    }
    if (approval) {
      parse?.(input);
      throw needsApprovalFailure(sdkTool.name);
    }
    return runAIToolWithView(tool.sdkTool, input, () => view.state, ctx);
  };
  return {
    metadata,
    sdkTool: {
      ...sdkTool,
      run: async (input: unknown, context?: SDKToolRunContext) =>
        buildToolResultContent(
          (await runFromView(input, resolveAIToolCallContext(context))).output,
        ),
      runWithView: (input: unknown, _getView, ctx: AIToolCallContext) =>
        runFromView(input, ctx),
    },
  };
}
