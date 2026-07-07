// Copyright 2023-2026, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type { AnthropicModel, ContentBlock, MessageParam } from "./types.ts";
import { supportsMidConversationSystem } from "./anthropic_consts.ts";

////////////////////////////////////////////////////////////////////////////////
// EPHEMERAL CONTEXT MARKERS
////////////////////////////////////////////////////////////////////////////////
//
// Ephemeral context (e.g. "what the user is currently looking at") is spliced
// into the user's message inside <<<[...]>>> markers, then stripped from all
// but the LAST user message at send time so stale context never reaches the
// model. Wrap and strip live together here so their formats cannot drift
// apart — a mismatch silently leaks stale markers to the model. Phase 3
// item 11 replaces this mechanism with mid-conversation system messages.

const EPHEMERAL_CONTEXT_OPEN = "<<<[";
const EPHEMERAL_CONTEXT_CLOSE = "]>>>";
const EPHEMERAL_CONTEXT_REGEX = /<<<\[[\s\S]*?\]>>>\n?\n?/g;

export function wrapWithEphemeralContext(
  userMessage: string,
  ephemeralContext: string | null | undefined,
): string {
  if (!ephemeralContext) return userMessage;
  return `${EPHEMERAL_CONTEXT_OPEN}${ephemeralContext}${EPHEMERAL_CONTEXT_CLOSE}\n\n${userMessage}`;
}

export function stripEphemeralContext(
  messages: MessageParam[],
): MessageParam[] {
  const lastUserIndex = findLastUserMessageIndex(messages);
  return messages.map((msg, i) => {
    if (msg.role !== "user" || i === lastUserIndex) return msg;
    if (typeof msg.content === "string") {
      const stripped = msg.content.replace(EPHEMERAL_CONTEXT_REGEX, "");
      return stripped === msg.content ? msg : { ...msg, content: stripped };
    }
    const newContent = msg.content.map((block) => {
      if (block.type !== "text") return block;
      const stripped = block.text.replace(EPHEMERAL_CONTEXT_REGEX, "");
      return stripped === block.text ? block : { ...block, text: stripped };
    });
    return { ...msg, content: newContent };
  });
}

function findLastUserMessageIndex(messages: MessageParam[]): number {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === "user") return i;
  }
  return -1;
}

// On Opus 4.8, ephemeral context is stored as a {role: "system"} message
// right after the user turn instead of being spliced into the user text —
// the context then survives tool-loop recursion (the marker approach loses
// it on the second request of the same turn) and never wastes a tail
// cache-write. This shapes the outgoing payload for whichever model is
// active NOW: stale ephemeral system messages are pruned (only the most
// recent is live context), and on models that reject the system role
// entirely (everything except Opus 4.8) all of them are dropped — a history
// can contain them after a mid-conversation model switch.
export function shapeEphemeralSystemMessages(
  messages: MessageParam[],
  model: AnthropicModel,
): MessageParam[] {
  if (!supportsMidConversationSystem(model)) {
    return messages.filter((msg) => msg.role !== "system");
  }
  let lastSystemIndex = -1;
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === "system") {
      lastSystemIndex = i;
      break;
    }
  }
  // The API requires a system message to be the last entry or be followed
  // by an assistant turn. An aborted/errored turn can leave one stranded
  // before a later user message — drop it there (its context belonged to
  // the failed turn anyway).
  const keptIsValid = lastSystemIndex === messages.length - 1 ||
    (lastSystemIndex >= 0 &&
      messages[lastSystemIndex + 1].role === "assistant");
  return messages.filter(
    (msg, i) => msg.role !== "system" || (i === lastSystemIndex && keptIsValid),
  );
}

////////////////////////////////////////////////////////////////////////////////
// TOOL-USE RESOLUTION
////////////////////////////////////////////////////////////////////////////////
//
// The API rejects any request whose history contains an assistant tool_use
// block without a matching tool_result in the next user message — a persisted
// conversation stranded in that state is bricked (every subsequent send
// 400s). Whenever the tool loop stops early (continuation cap, user abort),
// every pending tool_use id must be resolved with a synthetic error result.

export type ToolResultBlock = Extract<ContentBlock, { type: "tool_result" }>;

export function buildCancelledToolResults(
  blocks: ContentBlock[],
  reason: string,
): ToolResultBlock[] {
  return blocks
    .filter(
      (block): block is Extract<ContentBlock, { type: "tool_use" }> =>
        block.type === "tool_use",
    )
    .map((block) => ({
      type: "tool_result" as const,
      tool_use_id: block.id,
      content: reason,
      is_error: true,
    }));
}

// tool_result blocks must precede any other content in a user message —
// queued user texts are appended after the results.
export function buildToolResultUserMessage(
  results: ToolResultBlock[],
  queuedTexts: string[],
): MessageParam {
  const content: ContentBlock[] = queuedTexts.length > 0
    ? [
      ...results,
      ...queuedTexts.map((text) => ({ type: "text" as const, text })),
    ]
    : results;
  return { role: "user", content };
}

// Server-side tools (web search, web fetch) put server_tool_use blocks and
// their paired *_tool_result blocks inside the SAME assistant message. If a
// turn is cut off at the pause_turn continuation cap, the persisted assistant
// message can end with a server_tool_use block whose result never arrived —
// the API's tolerance of that on a later send is unconfirmed, so trim the
// unpaired blocks before persisting. Blocks are matched by id ↔ tool_use_id;
// the block shapes come from the wire (outside our ContentBlock union), so
// this reads them structurally.
export function trimDanglingServerToolUse(
  blocks: ContentBlock[],
): ContentBlock[] {
  const resultIds = new Set<string>();
  for (const block of blocks) {
    const b = block as { type?: string; tool_use_id?: string };
    if (
      typeof b.type === "string" && b.type.endsWith("_tool_result") &&
      typeof b.tool_use_id === "string"
    ) {
      resultIds.add(b.tool_use_id);
    }
  }
  return blocks.filter((block) => {
    const b = block as { type?: string; id?: string };
    if (b.type !== "server_tool_use") return true;
    return typeof b.id === "string" && resultIds.has(b.id);
  });
}

// One home for "the last message is an assistant turn with tool_use blocks
// still awaiting results" — used to gate queueing and turn-completion.
export function lastMessageHasUnresolvedToolUse(msgs: MessageParam[]): boolean {
  const lastMsg = msgs[msgs.length - 1];
  return msgs.length > 0 &&
    lastMsg?.role === "assistant" &&
    Array.isArray(lastMsg.content) &&
    lastMsg.content.some((block) => block.type === "tool_use");
}

////////////////////////////////////////////////////////////////////////////////
// TURN CONTINUATION
////////////////////////////////////////////////////////////////////////////////
//
// Maps a response's stop_reason (plus the current continuation depth) to the
// next action in the chat turn loop. "halt" surfaces a system notice and
// stops; "cap-tools" additionally requires resolving the pending tool_use
// blocks with buildCancelledToolResults before stopping; "cap-pause"
// additionally requires trimming dangling server_tool_use blocks from the
// persisted assistant message (trimDanglingServerToolUse) before stopping.
// noticeType is the stable machine-readable key consumers can dispatch on;
// message/details are default English display copy.

export type SystemNoticeType =
  | "refusal"
  | "truncation"
  | "context_exceeded"
  | "turn_limit";

export type TurnContinuation =
  | { kind: "done" }
  | {
    kind: "halt";
    noticeType: SystemNoticeType;
    message: string;
    details: string;
  }
  | { kind: "resume-pause-turn" }
  | { kind: "run-tools" }
  | {
    kind: "cap-tools";
    noticeType: SystemNoticeType;
    message: string;
    details: string;
  }
  | {
    kind: "cap-pause";
    noticeType: SystemNoticeType;
    message: string;
    details: string;
  };

export function classifyTurnContinuation(
  stopReason: string | null | undefined,
  depth: number,
  maxContinuations: number,
): TurnContinuation {
  if (stopReason === "refusal") {
    return {
      kind: "halt",
      noticeType: "refusal",
      message: "Request declined",
      details: "Claude's safety system declined to respond to this request.",
    };
  }
  if (stopReason === "max_tokens") {
    return {
      kind: "halt",
      noticeType: "truncation",
      message: "Response truncated — max tokens reached",
      details:
        "The response hit the configured max_tokens limit before finishing. Increase max tokens in the AI settings to allow longer responses.",
    };
  }
  if (stopReason === "model_context_window_exceeded") {
    return {
      kind: "halt",
      noticeType: "context_exceeded",
      message: "Conversation too long — context window exceeded",
      details:
        "This conversation no longer fits in the model's context window. Start a new conversation to continue.",
    };
  }
  if (stopReason === "pause_turn") {
    if (depth >= maxContinuations) {
      return {
        kind: "cap-pause",
        noticeType: "turn_limit",
        message: "Stopped: too many turn continuations",
        details:
          `The model paused and resumed more than ${maxContinuations} times in one turn.`,
      };
    }
    return { kind: "resume-pause-turn" };
  }
  if (stopReason === "tool_use") {
    if (depth >= maxContinuations) {
      return {
        kind: "cap-tools",
        noticeType: "turn_limit",
        message: "Stopped: too many tool calls in one turn",
        details:
          `The model requested tools more than ${maxContinuations} times in one turn.`,
      };
    }
    return { kind: "run-tools" };
  }
  return { kind: "done" };
}

////////////////////////////////////////////////////////////////////////////////
// ERROR CLASSIFICATION
////////////////////////////////////////////////////////////////////////////////
//
// Maps a normalized error shape to a user-facing message. The caller extracts
// the shape from the SDK error classes (a thin instanceof adapter); all
// decision logic is here, structural (type/status/message), so it also covers
// mid-stream errors (status undefined, type populated) and consumer apps that
// bundle a second SDK copy (instanceof fails; string fallback matches).

export type AIErrorInfo = {
  isConnectionError: boolean;
  isApiError: boolean;
  type?: string | null;
  status?: number;
  message: string;
};

export function getUserFacingAIErrorMessage(info: AIErrorInfo): string {
  if (info.isConnectionError) {
    return "Network error — check your connection";
  }
  if (info.isApiError) {
    if (info.type === "authentication_error" || info.status === 401) {
      return "Authentication failed — check your API key";
    }
    if (info.type === "permission_error" || info.status === 403) {
      return "Permission denied — check your API key and billing";
    }
    if (info.type === "rate_limit_error" || info.status === 429) {
      return "Rate limit reached — try again in a moment";
    }
    if (info.type === "billing_error") {
      return "Insufficient credits — check your Anthropic billing";
    }
    if (info.type === "overloaded_error" || info.status === 529) {
      return "Anthropic API is overloaded — try again in a moment";
    }
    if (
      info.type === "api_error" ||
      (info.status !== undefined && info.status >= 500)
    ) {
      return "Anthropic API error — try again in a moment";
    }
    if (info.type === "invalid_request_error" || info.status === 400) {
      const lower = info.message.toLowerCase();
      if (lower.includes("context") && lower.includes("exceed")) {
        return "Conversation too long — context window exceeded";
      }
      if (lower.includes("credit")) {
        return "Insufficient credits — check your Anthropic billing";
      }
      return "Invalid request";
    }
  }
  const lower = info.message.toLowerCase();
  if (lower.includes("overloaded")) {
    return "Anthropic API is overloaded — try again in a moment";
  }
  if (lower.includes("rate_limit") || lower.includes("rate limit")) {
    return "Rate limit reached — try again in a moment";
  }
  if (lower.includes("authentication") || lower.includes("unauthorized")) {
    return "Authentication failed — check your API key";
  }
  if (lower.includes("context") && lower.includes("exceed")) {
    return "Conversation too long — context window exceeded";
  }
  if (lower.includes("insufficient") && lower.includes("credit")) {
    return "Insufficient credits — check your Anthropic billing";
  }
  return "System error";
}
