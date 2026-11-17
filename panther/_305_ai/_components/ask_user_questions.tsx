// Copyright 2023-2026, Tim Roberton. MIT license.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import { t3 } from "../deps.ts";
import { AIToolFailure, createAITool } from "../deps.ts";
import type { AIToolWithMetadata } from "../deps.ts";
import {
  type AskUserQuestionsAnswer,
  type AskUserQuestionsInput,
  askUserQuestionsInputSchema,
} from "../_core/ask_user_questions_types.ts";
import { AskUserQuestionsRenderer } from "./_renderers/ask_user_questions_renderer.tsx";

export function createAskUserQuestionsTool(): AIToolWithMetadata<
  AskUserQuestionsInput
> {
  // One pending question per call, keyed by its tool_use id, so chats that
  // share this tool instance each answer their own.
  const pending = new Map<string, PendingQuestion>();

  const tool = createAITool({
    name: "ask_user_questions",
    description:
      "Present a multiple-choice question to the user inline in the chat. Use this when you need the user to make a decision, clarify preferences, or choose between approaches. Input: { question: string, options: [{ label: string, description?: string }] (2-6 options), allowMultiple?: boolean }. Single-select by default; set allowMultiple to true for multi-select. Only add description to an option if the label alone is ambiguous — omit it when the label is self-explanatory. Only call this tool once per response — do not combine it with other tool calls in the same response. Ask one question at a time. The card always ends with a row where the user can write their own answer instead of choosing (or, with allowMultiple, as well as choosing), so never add an option such as 'Other', 'Something else' or 'Let me explain'. The tool result is '<question>: <the chosen labels>', with 'none of your options' when the user chose none, followed by a line 'The user's own answer: <text>' when they wrote one.",
    inputSchema: askUserQuestionsInputSchema,
    kind: "read",
    handler: async (input, ctx): Promise<string> => {
      let onAbort = () => {};
      try {
        const answer = await new Promise<AskUserQuestionsAnswer>(
          (resolve, reject) => {
            const cancel = (reason: string) =>
              reject(new AIToolFailure(reason));
            if (ctx.signal.aborted) {
              cancel(STOPPED);
              return;
            }
            pending.set(ctx.toolUseId, { answer: resolve, cancel });
            onAbort = () => cancel(STOPPED);
            ctx.signal.addEventListener("abort", onAbort, { once: true });
          },
        );
        return formatAnswerForAI(input, answer);
      } finally {
        pending.delete(ctx.toolUseId);
        ctx.signal.removeEventListener("abort", onAbort);
      }
    },
    inProgressComponent: (
      p: { input: AskUserQuestionsInput; toolUseId: string },
    ) => (
      <AskUserQuestionsRenderer
        input={p.input}
        onSubmit={(answer) => pending.get(p.toolUseId)?.answer(answer)}
        onCancel={() =>
          pending.get(p.toolUseId)?.cancel("User cancelled the question")}
      />
    ),
    inProgressLabel: t3({
      en: "Waiting for your response...",
      fr: "En attente de votre réponse...",
      pt: "A aguardar a sua resposta...",
      th: "กำลังรอคำตอบของคุณ...",
    }),
    successMessage: t3({
      en: "User responded to question",
      fr: "L'utilisateur a répondu à la question",
      pt: "O utilizador respondeu à pergunta",
      th: "ผู้ใช้ตอบคำถามแล้ว",
    }),
  });
  // Engine-managed card: excluded from the upfront in-progress batch and
  // created when its block starts executing. Pane unmount does not cancel the
  // question (a hidden pane leaves it pending and recoverable); the Cancel
  // button and Stop do.
  tool.metadata.awaitsUserAction = true;
  return tool;
}

type PendingQuestion = {
  answer: (answer: AskUserQuestionsAnswer) => void;
  cancel: (reason: string) => void;
};

const STOPPED = "Question cancelled: generation was stopped";
const NONE_CHOSEN = "none of your options";
const OWN_ANSWER_LABEL = "The user's own answer: ";

function formatAnswerForAI(
  input: AskUserQuestionsInput,
  answer: AskUserQuestionsAnswer,
): string {
  const chosen = answer.selected.length > 0
    ? answer.selected.join(", ")
    : NONE_CHOSEN;
  const line = `${input.question}: ${chosen}`;
  return answer.ownAnswer === undefined
    ? line
    : `${line}\n${OWN_ANSWER_LABEL}${answer.ownAnswer}`;
}
