// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import { createAITool } from "../_core/tool_helpers.ts";
import type { AIToolWithMetadata } from "../_core/tool_helpers.ts";
import {
  type AskUserQuestionsAnswer,
  type AskUserQuestionsInput,
  askUserQuestionsInputSchema,
} from "../_core/ask_user_questions_types.ts";
import { AskUserQuestionsRenderer } from "./_renderers/ask_user_questions_renderer.tsx";

export function createAskUserQuestionsTool(): AIToolWithMetadata<
  AskUserQuestionsInput
> {
  // Closure variables shared between handler and inProgressComponent.
  // IMPORTANT: This pattern relies on _create_ai_chat.ts passing one tool
  // block at a time to processToolUses(). If that ever changes to batch
  // multiple blocks, multiple ask_user_questions calls would race for
  // these variables. Keep this single-block assumption.
  let resolveAnswer:
    | ((answer: AskUserQuestionsAnswer) => void)
    | null = null;
  let rejectAnswer: ((reason: Error) => void) | null = null;

  return createAITool({
    name: "ask_user_questions",
    description:
      "Present a multiple-choice question to the user inline in the chat. Use this when you need the user to make a decision, clarify preferences, or choose between approaches. Input: { question: string, options: [{ label: string, description?: string }] (2-6 options), allowMultiple?: boolean }. Single-select by default; set allowMultiple to true for multi-select. Only add description to an option if the label alone is ambiguous — omit it when the label is self-explanatory. Only call this tool once per response — do not combine it with other tool calls in the same response. Ask one question at a time. The user's selection will be returned as the tool result.",
    inputSchema: askUserQuestionsInputSchema,
    handler: async (input: AskUserQuestionsInput): Promise<string> => {
      if (resolveAnswer !== null) {
        throw new Error(
          "ask_user_questions can only be called once per response. Wait for the user to answer before asking another question.",
        );
      }
      const answer = await new Promise<AskUserQuestionsAnswer>(
        (resolve, reject) => {
          resolveAnswer = resolve;
          rejectAnswer = reject;
        },
      );
      resolveAnswer = null;
      rejectAnswer = null;
      return formatAnswerForAI(input, answer);
    },
    inProgressComponent: (props: { input: AskUserQuestionsInput }) => (
      <AskUserQuestionsRenderer
        input={props.input}
        onSubmit={(answer) => resolveAnswer?.(answer)}
        onCancel={() =>
          rejectAnswer?.(new Error("User cancelled the question"))}
      />
    ),
    inProgressLabel: "Waiting for your response...",
    successMessage: "User responded to question",
  });
}

function formatAnswerForAI(
  input: AskUserQuestionsInput,
  answer: AskUserQuestionsAnswer,
): string {
  if (Array.isArray(answer)) {
    return `${input.question}: ${answer.join(", ")}`;
  }
  return `${input.question}: ${answer}`;
}
