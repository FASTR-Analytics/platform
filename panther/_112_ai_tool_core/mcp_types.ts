// Copyright 2023-2026, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

// MCP server capability (PLAN_305_MCP_SERVER.md). Protocol era: 2025-11-25,
// selected by the Phase 0 wire spike against Claude Code 2.1.219 — the client
// speaks the legacy initialize handshake (it never probes server/discover)
// and answers server-initiated elicitation/create on stdio. The core is
// era-agnostic and RESUME-FIRST: a tool call that needs approval returns an
// input_required outcome with an opaque requestState, and the decision comes
// back through one resume entry point. The legacy adapter drives the elicit
// round trip inline (send elicitation/create, await, resume); a future
// 2026-07-28 adapter would reach the same resume entry via MRTR
// (InputRequiredResult / client re-issue with inputResponses). CacheableResult
// fields (ttlMs/cacheScope) belong to that future adapter, not this era.

import type { AIToolWithMetadata, ApprovalPolicy } from "./tool_helpers.ts";

export type MCPApprovalMode = "elicit" | "delegate";

export type MCPPromptConfig = {
  name: string;
  description?: string;
  arguments?: { name: string; description?: string; required?: boolean }[];
  // Returns the prompt text; delivered as a single user message.
  get: (args: Record<string, string>) => string | Promise<string>;
};

export type MCPResourceConfig = {
  uri: string;
  name: string;
  description?: string;
  mimeType?: string;
  read: () => string | Promise<string>;
};

export type CreateMCPServerConfig = {
  name: string;
  version: string;
  // ≤2KB pointer text riding the initialize result — critical rules first,
  // ending with "read the orientation before working". The thunk is resolved
  // per initialize and must be CHEAP (it answers inside the client's startup
  // timeout, before ready() has run) — live ids belong in groundingResource.
  instructions?: string | (() => string | Promise<string>);
  // Long-form grounding. Exposed BOTH as an MCP resource and as a
  // get_orientation read tool — resources are user-attached, never
  // model-fetched on their own, so the tool is what the model can actually
  // call. The thunk is re-resolved per call, after ready(), so orientation
  // tracks the app's live state (which projects/decks/reports exist NOW).
  groundingResource?: string | (() => string | Promise<string>);
  // The same AIToolWithMetadata[] createAIChat takes. Only tools declaring
  // headless: true are exposed; the rest are dropped with a per-tool reason
  // reported to stderr on connect.
  // deno-lint-ignore no-explicit-any
  tools: AIToolWithMetadata<any>[];
  // Required for plain-shape approval tools to be exposed at all; absent =
  // approval tools are dropped (reported). "elicit" presents the computed
  // preview to the user via elicitation/create and commits only on an
  // accepted decision. "delegate" runs propose → stillValid → commit as one
  // step — the human consented to ARGUMENTS (the client's permission prompt),
  // not to the computed diff; acceptable for allowlisted low-stakes writes
  // only.
  approvalMode?: MCPApprovalMode;
  // Same shape and same guarantee as AIChatConfig.approvalPolicy, enforced
  // over the EXPOSED (headless) subset at construction: a kind "write" tool
  // without approval or an exempt entry fails boot, never a live call.
  approvalPolicy?: ApprovalPolicy;
  // Gates the first tools/call: the transport comes up immediately (the
  // client enforces a startup timeout) and initialize/tools/list answer at
  // once, while tool execution awaits ready(). A rejected ready() maps the
  // awaiting call(s) to isError results naming the failure and CLEARS the
  // memo, so the next call re-runs ready() instead of wedging forever behind
  // one transient failure.
  ready?: () => Promise<void>;
  // User-invoked extras (slash commands) — generic pass-through, not a
  // grounding channel.
  prompts?: MCPPromptConfig[];
  resources?: MCPResourceConfig[];
  // Staged-approval TTL. Real wall-clock time passes between propose and the
  // user's decision; an expired handle resolves as a recoverable isError
  // telling the model to re-issue the call. Default 5 minutes.
  approvalTtlMs?: number;
};

////////////////////////////////////////////////////////////////////////////////
// CORE SEAM (ProtocolAdapter boundary)
////////////////////////////////////////////////////////////////////////////////

export type MCPToolDef = {
  name: string;
  description: string;
  // camelCase per the MCP spec (panther's input_schema is the Anthropic SDK
  // spelling).
  inputSchema: Record<string, unknown>;
  // Spec-designated untrusted hints. kind "read" → readOnlyHint: true; kind
  // "write" is NOT mapped to destructiveHint (mutating ≠ destroying, and the
  // hint already defaults appropriately for non-read-only tools). What
  // readOnlyHint actually does in Claude Code is RAISE parallel dispatch of
  // read tools — which is why the adapter serializes tools/call execution.
  annotations?: { readOnlyHint?: boolean };
};

export type MCPElicitDecision =
  | { action: "accept"; content?: Record<string, unknown> }
  | { action: "decline" }
  | { action: "cancel" };

export type MCPCallOutcome =
  | { type: "complete"; text: string; isError: boolean }
  | {
    // Approval needed: the adapter delivers this elicitation in its era's
    // shape, then resumes with the decision and the opaque requestState.
    type: "input_required";
    elicitation: {
      message: string;
      requestedSchema: Record<string, unknown>;
    };
    requestState: string;
  };

// Protocol-shaped failures the adapter maps to JSON-RPC errors (unknown
// tool/prompt/resource, malformed params) — distinct from tool-execution
// failures, which are isError RESULTS so the model can read and recover.
export class MCPRequestError extends Error {
  readonly code: number;
  constructor(code: number, message: string) {
    super(message);
    this.code = code;
  }
}

export type MCPServerCore = {
  serverInfo: { name: string; version: string };
  hasPrompts: boolean;
  hasResources: boolean;
  // Resolved staged-approval TTL. The adapter's elicitation timeout uses the
  // same window so the two lifetimes cannot drift apart under configuration.
  approvalTtlMs: number;
  instructions(): Promise<string | undefined>;
  listTools(): MCPToolDef[];
  // reportExposure returns the startup lines the adapter logs to stderr on
  // connect (exposed N / dropped M with per-tool reasons — no silent caps).
  reportExposure(): string[];
  callTool(
    name: string,
    args: Record<string, unknown>,
    opts: { clientCanElicit: boolean },
  ): Promise<MCPCallOutcome>;
  resumeToolCall(
    name: string,
    args: Record<string, unknown>,
    decision: MCPElicitDecision,
    requestState: string,
  ): Promise<MCPCallOutcome>;
  listPrompts(): Omit<MCPPromptConfig, "get">[];
  getPrompt(
    name: string,
    args: Record<string, string>,
  ): Promise<{ description?: string; text: string }>;
  listResources(): Omit<MCPResourceConfig, "read">[];
  readResource(
    uri: string,
  ): Promise<{ uri: string; mimeType?: string; text: string }>;
};

export type MCPTransport = {
  // One JSON-RPC frame, already serialized, no trailing newline.
  send(line: string): void;
};

export type MCPConnection = {
  handleLine(line: string): void;
  // Resolves when every accepted request has settled (test rigs; stdio
  // ignores it and exits on EOF).
  idle(): Promise<void>;
};

export type MCPServer = {
  connect(transport: MCPTransport): MCPConnection;
  serveStdio(): Promise<void>;
};
