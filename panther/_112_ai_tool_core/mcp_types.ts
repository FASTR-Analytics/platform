// Copyright 2023-2026, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

// MCP server capability (PLAN_305_MCP_SERVER.md; remote HTTP added by
// PLAN_112). The core is era-agnostic and RESUME-FIRST: a tool call that
// needs approval returns an input_required outcome with an opaque
// requestState, and the decision comes back through one resume entry point.
// Two adapters drive it: the stdio adapter here (2025-11-25, hand-rolled,
// grandfathered — see mcp_protocol.ts) runs the elicit round trip inline;
// the HTTP adapter (_220_mcp_http, official SDK v2 wire) serves BOTH eras —
// on 2025-era connections the SDK's legacy shim runs the real elicitation
// and re-enters the handler, on 2026-07-28 the client itself retries with
// inputResponses + requestState (MRTR). Both legs land in resumeToolCall;
// the staged proposal (single-use, TTL, args-bound, principal-scoped core)
// is the security boundary.

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

// The thunk form's construction context: the authenticated principal an HTTP
// adapter resolved for the request (D3, PLAN_112). Typed loosely here so the
// config type stays non-generic for the stdio path; the HTTP adapter's
// createMCPHttpHandler<TPrincipal> narrows it at its own boundary.
export type MCPToolsContext<TPrincipal = unknown> = {
  principal: TPrincipal;
};

export type CreateMCPServerConfig<TPrincipal = unknown> = {
  name: string;
  version: string;
  // ≤2KB pointer text riding the initialize result — critical rules first,
  // ending with "read the overview before working". The thunk is resolved
  // per initialize and must be CHEAP (it answers inside the client's startup
  // timeout, before ready() has run) — live ids belong in groundingResource.
  instructions?: string | (() => string | Promise<string>);
  // Long-form grounding. Exposed BOTH as an MCP resource and as a
  // get_overview read tool — resources are user-attached, never
  // model-fetched on their own, so the tool is what the model can actually
  // call. The thunk is re-resolved per call, after ready(), so the overview
  // tracks the app's live state (which projects/decks/reports exist NOW).
  groundingResource?: string | (() => string | Promise<string>);
  // The same AIToolWithMetadata[] createAIChat takes. Only tools declaring
  // headless: true are exposed; the rest are dropped with a per-tool reason
  // reported to stderr on connect. The thunk form binds the tool set to an
  // authenticated principal (one call per principal core, HTTP adapter only);
  // the array form is validated eagerly and behaves exactly as before. stdio
  // serving has no principal, so a thunk-form config is rejected there at
  // construction.
  tools:
    // deno-lint-ignore no-explicit-any
    | AIToolWithMetadata<any>[]
    // deno-lint-ignore no-explicit-any
    | ((ctx: MCPToolsContext<TPrincipal>) => AIToolWithMetadata<any>[]);
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
  // Serialized schema for the tool's structuredContent, already wrapped by
  // the uniform { result: … } rule (see mcp_server). Present exactly when
  // the tool declares an outputSchema — the spec (2025-06-18) makes a
  // declared output schema oblige conforming structured results, so the two
  // are populated together or not at all.
  outputSchema?: Record<string, unknown>;
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
  | {
    type: "complete";
    text: string;
    isError: boolean;
    // The structured twin of text, already wrapped { result: … } — adapters
    // serialize it as the result's structuredContent verbatim.
    structuredContent?: Record<string, unknown>;
  }
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
