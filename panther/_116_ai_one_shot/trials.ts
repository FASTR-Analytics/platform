// Copyright 2023-2026, Tim Roberton. MIT license.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type { AnyAITool, ContentBlock, MessageParam, Usage } from "./deps.ts";
import { AIToolFailure, getHeadlessCapability } from "./deps.ts";
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

export async function runAITrials(
  config: CallAIConfig,
  questions: readonly string[],
  options: AITrialsOptions,
): Promise<AITrial[][]> {
  const { runs, ...callOptions } = options;
  if (!Number.isInteger(runs) || runs < 1) {
    throw new Error(
      `runAITrials: runs must be a whole number of at least 1, got ${runs}`,
    );
  }
  const trialConfig: CallAIConfig = {
    ...config,
    tools: config.tools?.map(withoutUserApproval),
  };
  const trials: AITrial[][] = [];
  for (const question of questions) {
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
                trialConfig,
                [{ role: "user", content: question }],
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
      run: () =>
        Promise.reject(
          new AIToolFailure(
            `Tool "${sdkTool.name}" needs a user's approval before it runs, and a trial has no user to give it. Nothing was done.`,
          ),
        ),
    },
  };
}
