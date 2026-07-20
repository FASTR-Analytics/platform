// Copyright 2023-2026, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type { ContentBlock, MessageParam } from "./types.ts";

////////////////////////////////////////////////////////////////////////////////
// EPHEMERAL SECTIONS — WRITE-ONLY WIRE RENDERING
////////////////////////////////////////////////////////////////////////////////
//
// Ephemeral context (e.g. "what the user is currently looking at") is typed
// DATA on the stored turn: user entries may carry ephemeralSections, attached
// at turn creation. The wire format is derived here at request time and never
// parsed back — nothing strips markers out of display or storage, so the
// marker syntax is a write-only wire convention, not a correctness surface.
//
// Render rule (ONE wire format for every model): sections render for the
// LATEST carrier only — every earlier carrier renders bare (load-bearing: a
// failed turn's carrier has no assistant after it, so the follows-condition
// alone would double-render on the retry) — and only while NO ASSISTANT
// MESSAGE FOLLOWS the carrier in the outgoing history. This covers: first
// request of a turn (renders), tool-loop recursion (assistant follows →
// bare), multi-message batches (only user messages follow the batch's first
// message → still renders), and a failed turn's carrier once a retry sends
// (no longer latest → bare).

const EPHEMERAL_CONTEXT_OPEN = "<<<[";
const EPHEMERAL_CONTEXT_CLOSE = "]>>>";

// Model-facing hygiene, not a security boundary: nothing parses the markers
// back out, so a literal marker inside section text can only confuse the
// model, never corrupt state. Collapse runs to a FIXPOINT: a single pass can
// reconstitute a marker at the junction of untouched prefix and replacement
// ("<<<<[[" → "<" + "<<[" + "[" = a live open marker).
function collapseLiteralMarkers(text: string): string {
  let out = text;
  while (
    out.includes(EPHEMERAL_CONTEXT_OPEN) ||
    out.includes(EPHEMERAL_CONTEXT_CLOSE)
  ) {
    out = out.replaceAll(EPHEMERAL_CONTEXT_OPEN, "<<[").replaceAll(
      EPHEMERAL_CONTEXT_CLOSE,
      "]>>",
    );
  }
  return out;
}

export function renderOutgoingMessages(
  messages: MessageParam[],
): MessageParam[] {
  // System-role entries are never emitted — the live engine no longer
  // constructs them, and the v1 persistence migration strips stored ones;
  // this filter covers any stray entry in between.
  const wireMessages = messages.some((msg) => msg.role === "system")
    ? messages.filter((msg) => msg.role !== "system")
    : messages;

  let carrierIndex = -1;
  for (let i = wireMessages.length - 1; i >= 0; i--) {
    const msg = wireMessages[i];
    if (
      msg.role === "user" && msg.ephemeralSections &&
      msg.ephemeralSections.length > 0
    ) {
      carrierIndex = i;
      break;
    }
  }
  const renderCarrier = carrierIndex >= 0 &&
    !wireMessages.slice(carrierIndex + 1).some(
      (msg) => msg.role === "assistant",
    );

  return wireMessages.map((msg, i) => {
    // Entries without the storage-only field pass through by reference
    // (byte- and identity-parity for no-adoption histories).
    if (!msg.ephemeralSections) return msg;
    const { ephemeralSections, ...rest } = msg;
    if (i !== carrierIndex || !renderCarrier) return rest;

    const block = `${EPHEMERAL_CONTEXT_OPEN}${
      ephemeralSections.map((s) => collapseLiteralMarkers(s.text)).join("\n\n")
    }${EPHEMERAL_CONTEXT_CLOSE}\n\n`;

    if (typeof rest.content === "string") {
      return { ...rest, content: block + rest.content };
    }
    // Block-form content (documents + text): the sections prefix the first
    // text block — the same position the pre-0B wrap produced.
    let spliced = false;
    const content = rest.content.map((b) => {
      if (!spliced && b.type === "text") {
        spliced = true;
        return { ...b, text: block + b.text };
      }
      return b;
    });
    if (!spliced) {
      content.push({ type: "text", text: block.trimEnd() });
    }
    return { ...rest, content };
  });
}

// Storage normalization run by the engine at TURN CREATION, before the new
// turn's messages are appended: a FAILED prior turn's carrier (user entry
// with sections and no assistant after it — the error path appends nothing)
// must never re-render on a later turn's wire. The render rule alone cannot
// distinguish that history from a multi-message batch (both are a trailing
// user run with the carrier first), so the stale carrier is demoted here
// instead. Completed turns' carriers keep their sections (inspectable; the
// no-assistant-follows rule already renders them bare). Reference-identical
// when nothing demotes.
export function demoteStaleCarriers(messages: MessageParam[]): MessageParam[] {
  let changed = false;
  let assistantSeen = false;
  const out: MessageParam[] = new Array(messages.length);
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    if (msg.role === "assistant") {
      assistantSeen = true;
    }
    if (
      !assistantSeen && msg.role === "user" && msg.ephemeralSections &&
      msg.ephemeralSections.length > 0
    ) {
      const { ephemeralSections: _dropped, ...rest } = msg;
      out[i] = rest;
      changed = true;
    } else {
      out[i] = msg;
    }
  }
  return changed ? out : messages;
}

// The pre-formatVersion-2 marker regex survives ONLY for the v1 persistence
// migration (records whose user text carries spliced markers).
const LEGACY_EPHEMERAL_MARKER_REGEX = /<<<\[[\s\S]*?\]>>>\n?\n?/g;

export function legacyStripEphemeralMarkers(text: string): string {
  return text.replace(LEGACY_EPHEMERAL_MARKER_REGEX, "");
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
