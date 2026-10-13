// Copyright 2023-2026, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type { ContentBlock, EphemeralSection, MessageParam } from "./types.ts";
import type { SystemParam } from "./request_shaping.ts";

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
// Render rule (ONE wire format for every model): EVERY carrier renders, its
// sections spliced in front of its first text block (after the tool results
// on a tool-result message), so each request's messages are a prefix of the
// next request's. That is what the message cache and a preserved thinking
// block's prefix check need: a block of text put into an earlier message and
// later removed is an edit to the prefix. What each message carries is
// therefore decided at turn creation (selectTurnSections) and at the turn's
// end (releaseUnansweredCarriers), never at render time.

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

function isCarrier(msg: MessageParam): boolean {
  return msg.role === "user" && msg.ephemeralSections !== undefined &&
    msg.ephemeralSections.length > 0;
}

// The sections as one wire block, spliced in front of the message's first
// text block — the same position the pre-0B wrap produced; on a tool-result
// message that is after the results, which the API requires first. A
// message with no text block gets one at the end.
function spliceSections(
  msg: MessageParam,
  ephemeralSections: EphemeralSection[],
): MessageParam {
  const block = `${EPHEMERAL_CONTEXT_OPEN}${
    ephemeralSections.map((s) => collapseLiteralMarkers(s.text)).join("\n\n")
  }${EPHEMERAL_CONTEXT_CLOSE}\n\n`;

  if (typeof msg.content === "string") {
    return { ...msg, content: block + msg.content };
  }
  let spliced = false;
  const content = msg.content.map((b) => {
    if (!spliced && b.type === "text") {
      spliced = true;
      return { ...b, text: block + b.text };
    }
    return b;
  });
  if (!spliced) {
    content.push({ type: "text", text: block.trimEnd() });
  }
  return { ...msg, content };
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

  return wireMessages.map((msg) => {
    // Entries without the storage-only field pass through by reference
    // (byte- and identity-parity for no-adoption histories).
    if (!msg.ephemeralSections) return msg;
    const { ephemeralSections, ...rest } = msg;
    return ephemeralSections.length > 0
      ? spliceSections(rest, ephemeralSections)
      : rest;
  });
}

// Which sections a message carries. An ALWAYS kind states what is true of
// this message (where the user is, the view's live state, what they did
// since the last one) and rides every message. A ONCE kind holds until its
// text changes (a view's instructions, a consumer block): rendered
// permanently, a stored copy stays in the history for good, so it rides
// only when no stored message already carries its text.
// A released carrier has no sections, so what it carried never counts.
// "view-prompt" is the stored legacy tag for view-instructions.
const ONCE_KINDS: ReadonlySet<string> = new Set([
  "view-instructions",
  "view-prompt",
  "consumer",
]);

export function selectTurnSections(
  candidates: EphemeralSection[],
  history: MessageParam[],
): EphemeralSection[] {
  const carried = new Set<string>();
  for (const msg of history) {
    for (const section of msg.ephemeralSections ?? []) {
      if (ONCE_KINDS.has(section.kind)) carried.add(section.text);
    }
  }
  return candidates.filter((section) =>
    !ONCE_KINDS.has(section.kind) || !carried.has(section.text)
  );
}

// At a turn's end, a carrier the model never answered (the turn failed or
// was stopped after it) loses its sections: rendered permanently, they
// would ride every later request as context the model was never told, and
// the retry attaches fresh ones. fromIndex is the turn's first message;
// answeredThrough is the index of the turn's last model reply, fromIndex - 1
// when none. The released indexes come latest first, the order the engine
// restores their interaction drains in, so the cursor ends at the earliest
// drain's start. Input by reference when nothing is released.
export function releaseUnansweredCarriers(
  messages: MessageParam[],
  fromIndex: number,
  answeredThrough: number,
): { messages: MessageParam[]; released: number[] } {
  const released: number[] = [];
  const first = Math.max(fromIndex, answeredThrough + 1, 0);
  for (let i = messages.length - 1; i >= first; i--) {
    if (isCarrier(messages[i])) released.push(i);
  }
  if (released.length === 0) return { messages, released };
  const releasedSet = new Set(released);
  return {
    messages: messages.map((msg, i) => {
      if (!releasedSet.has(i)) return msg;
      const { ephemeralSections: _dropped, ...rest } = msg;
      return rest;
    }),
    released,
  };
}

// The text an assistant message keeps when the strip empties it: the API
// rejects an assistant message with no content.
export const STRIPPED_THINKING_PLACEHOLDER = "[Thinking omitted]";

// A preserved thinking block is bound to the system text and tools it was
// minted under, and an enforced account refuses a request that replays it
// under others. The one recovery without the binding beta is to remove
// every thinking and redacted_thinking block once and keep them out, which
// the check accepts (any contiguous run may go, all of them included).
// Input by reference when nothing is stripped.
export function stripThinkingBlocks(messages: MessageParam[]): MessageParam[] {
  let changed = false;
  const out = messages.map((msg) => {
    if (msg.role !== "assistant" || typeof msg.content === "string") {
      return msg;
    }
    const kept = msg.content.filter((block) =>
      block.type !== "thinking" && block.type !== "redacted_thinking"
    );
    if (kept.length === msg.content.length) return msg;
    changed = true;
    return {
      ...msg,
      content: kept.length > 0
        ? kept
        : [{ type: "text" as const, text: STRIPPED_THINKING_PLACEHOLDER }],
    };
  });
  return changed ? out : messages;
}

// FNV-1a, 32 bits, over the UTF-8 bytes; eight lower-case hex digits.
export function fnv1a32(text: string): string {
  let hash = 0x811c9dc5;
  for (const byte of new TextEncoder().encode(text)) {
    hash ^= byte;
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

export type ToolDefinitionLike = { name: string; cache_control?: unknown };

// The request prefix a thinking block is bound to: the system text blocks
// (text only: cache_control counts for neither the check nor the cache) and
// the tools sorted by name, since the check ignores tool order. The model is
// left out: a model switch is not a prefix edit; the API drops blocks the
// new model cannot read by itself.
export function hashRequestPrefix(
  system: SystemParam,
  tools: readonly ToolDefinitionLike[],
): string {
  const texts = typeof system === "string"
    ? [system]
    : system.map((block) => block.text);
  const sortedTools = tools
    .map(({ cache_control: _ignored, ...tool }) => tool)
    .sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0);
  return fnv1a32(JSON.stringify([texts, sortedTools]));
}

// At turn start. Unchanged prefix: the messages stand. Changed (a
// conversation with messages and no stored hash counts as
// changed: its blocks were minted under a prefix nothing recorded): the
// thinking blocks are stripped and the new hash stored. A tool_use awaiting
// a result keeps the strip waiting, since that reply's own thinking must
// return with its results: the messages and the stored hash stand and the
// next turn start reconciles again.
export function reconcileRequestPrefix(
  messages: MessageParam[],
  storedHash: string | undefined,
  currentHash: string,
): { messages: MessageParam[]; hash: string | undefined } {
  if (messages.length === 0 || storedHash === currentHash) {
    return { messages, hash: currentHash };
  }
  if (lastMessageHasUnresolvedToolUse(messages)) {
    return { messages, hash: storedHash };
  }
  return { messages: stripThinkingBlocks(messages), hash: currentHash };
}

// Storage normalization for a record saved before the release existed (no
// prefixHash): a FAILED last turn's carrier (user entry with sections and no
// assistant after it — the error path appended nothing) still holds its
// sections there, and rendered permanently it would ride every later
// request beside the retry's fresh digest, a double delivery. The engine
// runs this at hydration (persistence.ts); a record with a hash was saved
// after a release and holds no such carrier. Completed turns' carriers keep
// their sections. Reference-identical when nothing demotes.
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
