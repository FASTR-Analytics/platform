// Copyright 2023-2026, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

// createMCPServer — expose a _305_ai tool registry over MCP
// (PLAN_305_MCP_SERVER.md). Panther owns everything MCP-shaped: the headless
// filter, tool→MCP conversion, the resumable approval driver and its
// staged-proposal lifecycle, the readiness gate, the error funnel. A consumer
// entry is ~50 lines of composition with zero protocol code.

import type {
  AIToolWithMetadata,
  ErasedApprovalConfig,
  ProposalPreview,
  ProposalResult,
  ToolUIMetadata,
} from "./tool_helpers.ts";
import { getHeadlessCapability } from "./tool_helpers.ts";
import { toolThrowToResultParts } from "./tool_failure.ts";
import {
  type CreateMCPServerConfig,
  type MCPCallOutcome,
  type MCPConnection,
  MCPRequestError,
  type MCPResourceConfig,
  type MCPServer,
  type MCPServerCore,
  type MCPToolDef,
  type MCPTransport,
} from "./mcp_types.ts";
import { createMCPConnection, serveCoreOnStdio } from "./mcp_protocol.ts";

const ORIENTATION_TOOL_NAME = "get_orientation";
const ORIENTATION_RESOURCE_URI = "panther://orientation";
const ORIENTATION_TOOL_DESCRIPTION =
  "Read the orientation document: what exists in the app right now (live ids), the rules for operating it, and how to use the other tools. Call this before doing other work.";

// Spec: tool names SHOULD be 1–128 chars from [A-Za-z0-9_.-]. Panther's
// snake_case names comply; this catches a consumer inventing one with a
// space in it.
const TOOL_NAME_PATTERN = /^[A-Za-z0-9_.-]{1,128}$/;

const DEFAULT_APPROVAL_TTL_MS = 5 * 60 * 1000;
const INSTRUCTIONS_POINTER_BYTES = 2048;

// deno-lint-ignore no-explicit-any
type AnyTool = AIToolWithMetadata<any>;

type DroppedTool = { name: string; reason: string };

// NOTE for the future MRTR adapter: the plan's staged-entry spec also lists a
// `principal` binding. Today requestState never crosses the wire inbound (the
// legacy adapter resumes its own round trip in-process) and one connection
// owns one core, so there is no principal to bind. The moment a client can
// supply requestState (MRTR) or two connections share a core, add the
// principal field and reject cross-principal resumes.
type StagedProposal = {
  toolName: string;
  argsKey: string;
  preview: ProposalPreview;
  commit: () => Promise<unknown> | unknown;
  stillValid?: () => boolean;
  expiresAt: number;
};

// Reason strings for tools dropped because they never declared headless; the
// declared-but-structurally-impossible combinations THROW in the filter
// instead (they are contract violations, not opt-outs).
function droppedReason(metadata: ToolUIMetadata): string {
  const capability = getHeadlessCapability(metadata);
  switch (capability.kind) {
    case "view-bound":
      return capability.via === "availableIn"
        ? "view-gated (availableIn) — cannot be headless"
        : "view-typed, not declared headless";
    case "nav":
      return 'kind "nav" — cannot be headless';
    case "approval-plain":
      return "approval tool not declared headless";
    case "ok":
      return "not declared headless: true (chat-only by default)";
  }
}

// JSON.stringify(undefined) is the VALUE undefined, not a string — a commit
// that mutates and returns nothing (an ordinary spelling) must still produce
// a valid text content block.
function stringifyToolOutput(output: unknown): string {
  return typeof output === "string" ? output : (JSON.stringify(output) ?? "");
}

function completeText(text: string): MCPCallOutcome {
  return { type: "complete", text, isError: false };
}

function completeError(text: string): MCPCallOutcome {
  return { type: "complete", text, isError: true };
}

// Same funnel as the chat loop: AIToolFailure (and any throw) reaches the
// model as an isError result with a clean message — the model reads it and
// recovers; a JSON-RPC error would not reach the model at all.
function completeFromThrow(error: unknown): MCPCallOutcome {
  return completeError(toolThrowToResultParts(error).content);
}

// Preview values routinely embed MODEL-SUPPLIED text (a report label, a body
// diff). Rendered verbatim into the elicitation message, injected newlines
// could fabricate server-authored framing ("\n\nThis is read-only, nothing is
// written."). So: single-line slots collapse all whitespace runs (newline
// injection dead), multi-line diff bodies are quoted line-by-line under an
// explicit as-supplied marker, and everything is capped.
const PREVIEW_VALUE_CAP = 2_000;
const PREVIEW_MESSAGE_CAP = 10_000;

function truncateValue(value: string, cap: number): string {
  return value.length <= cap
    ? value
    : `${value.slice(0, cap)} … [truncated ${value.length - cap} chars]`;
}

function inlineValue(value: string): string {
  return truncateValue(value.replace(/\s+/g, " ").trim(), PREVIEW_VALUE_CAP);
}

function quoteBlock(value: string): string {
  return truncateValue(value, PREVIEW_VALUE_CAP)
    .split("\n")
    .map((line) => `> ${line}`)
    .join("\n");
}

function renderPreviewMessage(preview: ProposalPreview): string {
  const lines: string[] = [inlineValue(preview.title)];
  if (preview.description) {
    lines.push(inlineValue(preview.description));
  }
  for (const change of preview.changes ?? []) {
    lines.push(
      `${inlineValue(change.label)}: ${inlineValue(change.before ?? "—")} → ${
        inlineValue(change.after ?? "—")
      }`,
    );
  }
  if (preview.diff) {
    lines.push(
      "--- before (quoted verbatim) ---",
      quoteBlock(preview.diff.before),
      "--- after (quoted verbatim) ---",
      quoteBlock(preview.diff.after),
    );
  }
  return truncateValue(lines.join("\n"), PREVIEW_MESSAGE_CAP);
}

function renderAuditHeader(preview: ProposalPreview): string {
  const changes = (preview.changes ?? [])
    .map((c) =>
      `${inlineValue(c.label)}: ${inlineValue(c.before ?? "—")} → ${
        inlineValue(c.after ?? "—")
      }`
    )
    .join("\n");
  return `Applied: ${inlineValue(preview.title)}${
    changes ? `\n${changes}` : ""
  }\n\n`;
}

function buildElicitForm(
  preview: ProposalPreview,
): { message: string; requestedSchema: Record<string, unknown> } {
  return {
    message: renderPreviewMessage(preview),
    requestedSchema: {
      type: "object",
      properties: {
        confirm: {
          type: "boolean",
          description: preview.confirmLabel ?? "Accept",
        },
      },
      required: ["confirm"],
    },
  };
}

function declinedText(preview: ProposalPreview): string {
  return `The user declined the proposed action "${preview.title}". No changes were made.`;
}

function staleText(preview: ProposalPreview): string {
  return `The proposed action "${preview.title}" is no longer valid — the underlying data changed since the proposal was computed. No changes were made. Re-issue the tool call to propose against current data.`;
}

// The runtime half of the headless contract (the construction invariants are
// the other half): a handler that reads live view state despite declaring
// headless gets a self-describing throw instead of
// `Cannot read properties of undefined`. Property reads, `in` checks, and
// enumeration (Object.keys, spread, for…in) all trip it — a silent empty
// result would send plausible handler code down the wrong branch instead.
function poisonView(toolName: string): () => unknown {
  const fail = (operation: string): never => {
    throw new Error(
      `Tool "${toolName}" declares headless: true but read live view state (${operation}). Headless tools take explicit ids as input.`,
    );
  };
  return () =>
    new Proxy({}, {
      get: (_target, prop) => fail(`view.${String(prop)}`),
      has: (_target, prop) => fail(`"${String(prop)}" in view`),
      ownKeys: () => fail("enumerating view keys"),
      getOwnPropertyDescriptor: (_target, prop) =>
        fail(`view.${String(prop)} descriptor`),
    });
}

export function buildMCPServerCore(
  config: CreateMCPServerConfig,
): MCPServerCore {
  if (!config.name || !config.version) {
    throw new Error(
      "createMCPServer: name and version are required (they identify the server to clients).",
    );
  }

  // ---- Filter: headless declaration via the shared eligibility helper ----
  const exposed = new Map<string, AnyTool>();
  const dropped: DroppedTool[] = [];
  for (const tool of config.tools) {
    const name = tool.sdkTool.name;
    const metadata = tool.metadata;
    if (metadata.headless !== true) {
      dropped.push({ name, reason: droppedReason(metadata) });
      continue;
    }
    // Structural re-check of the construction invariants. buildAITool throws
    // on these combinations, but metadata is a mutable public surface and
    // AIToolWithMetadata can be hand-assembled — the filter must not trust
    // the declaration alone, or a view-gated tool slips through with its
    // gate silently skipped. Same contradictions, same boot-time failure.
    const capability = getHeadlessCapability(metadata);
    if (capability.kind === "view-bound" && capability.via === "availableIn") {
      throw new Error(
        `createMCPServer: tool "${name}" declares headless: true but is view-gated (availableIn) — a view gate can never be satisfied with no view. Take explicit ids as input instead of gating on a view, or drop headless.`,
      );
    }
    if (capability.kind === "nav") {
      throw new Error(
        `createMCPServer: tool "${name}" declares headless: true but is kind "nav" — navigation is meaningless with no surface.`,
      );
    }
    if (metadata.approval && metadata._viewRegistry !== undefined) {
      throw new Error(
        `createMCPServer: tool "${name}" declares headless: true but has view-typed approval — its propose expects the live view state no headless surface can supply.`,
      );
    }
    if (metadata.approval && config.approvalMode === undefined) {
      dropped.push({
        name,
        reason: "approval tool, but the server configures no approvalMode",
      });
      continue;
    }
    // parse() is the "input validation is the backstop" promise for
    // model-supplied ids. createAITool always provides it; a hand-constructed
    // tool without it would hand propose/commit unvalidated input.
    if (typeof tool.sdkTool.parse !== "function") {
      throw new Error(
        `createMCPServer: tool "${name}" has no parse() — every exposed tool must validate its input (build tools with createAITool, or provide parse).`,
      );
    }
    if (!TOOL_NAME_PATTERN.test(name)) {
      throw new Error(
        `createMCPServer: tool name "${name}" is not a valid MCP tool name (1–128 chars from [A-Za-z0-9_.-]).`,
      );
    }
    if (exposed.has(name)) {
      throw new Error(
        `createMCPServer: duplicate tool name "${name}" — a second exposure would make dispatch ambiguous.`,
      );
    }
    exposed.set(name, tool);
  }
  if (
    config.groundingResource !== undefined && exposed.has(ORIENTATION_TOOL_NAME)
  ) {
    throw new Error(
      `createMCPServer: tool name "${ORIENTATION_TOOL_NAME}" collides with the built-in orientation tool (added because groundingResource is configured).`,
    );
  }

  // ---- approvalPolicy parity over the exposed subset (mirror of the chat
  // engine's registration check — same guarantee, same failure point) ----
  const policy = config.approvalPolicy;
  if (policy) {
    for (const [name, tool] of exposed) {
      const meta = tool.metadata;
      if (policy.requireKind && meta.kind === undefined) {
        throw new Error(
          `createMCPServer: tool "${name}": approvalPolicy.requireKind is set but the tool declares no kind. Every exposed tool must declare kind ("read" | "write" | "nav") so write tools cannot bypass the approval policy by omission.`,
        );
      }
      if (
        meta.kind === policy.requireForKind &&
        meta.approval === undefined &&
        !(policy.exempt ?? []).includes(name)
      ) {
        throw new Error(
          `createMCPServer: tool "${name}" is kind "${meta.kind}" but declares no approval and is not in approvalPolicy.exempt — the approval policy requires every exposed write tool to carry the approval lifecycle (elicit confirms pre-commit; delegate records the preview as an audit trail).`,
        );
      }
    }
  }

  // ---- prompts/resources sanity ----
  const promptNames = new Set<string>();
  for (const prompt of config.prompts ?? []) {
    if (!TOOL_NAME_PATTERN.test(prompt.name)) {
      throw new Error(
        `createMCPServer: prompt name "${prompt.name}" is not a valid MCP name (1–128 chars from [A-Za-z0-9_.-]).`,
      );
    }
    if (promptNames.has(prompt.name)) {
      throw new Error(
        `createMCPServer: duplicate prompt name "${prompt.name}".`,
      );
    }
    promptNames.add(prompt.name);
  }
  const resourceUris = new Set<string>();
  for (const resource of config.resources ?? []) {
    if (resourceUris.has(resource.uri)) {
      throw new Error(
        `createMCPServer: duplicate resource uri "${resource.uri}".`,
      );
    }
    resourceUris.add(resource.uri);
  }
  if (
    config.groundingResource !== undefined &&
    resourceUris.has(ORIENTATION_RESOURCE_URI)
  ) {
    throw new Error(
      `createMCPServer: resource uri "${ORIENTATION_RESOURCE_URI}" collides with the built-in orientation resource.`,
    );
  }

  // ---- grounding thunks ----
  const resolveInstructions = async (): Promise<string | undefined> => {
    const source = config.instructions;
    if (source === undefined) return undefined;
    const text = typeof source === "function" ? await source() : source;
    const bytes = new TextEncoder().encode(text).length;
    if (bytes > INSTRUCTIONS_POINTER_BYTES) {
      console.error(
        `[panther mcp] instructions are ${bytes} bytes — keep them a ≤${INSTRUCTIONS_POINTER_BYTES}-byte pointer (clients may truncate); long-form grounding belongs in groundingResource.`,
      );
    }
    return text;
  };
  const resolveGrounding = async (): Promise<string> => {
    const source = config.groundingResource;
    if (source === undefined) {
      throw new MCPRequestError(-32002, "No orientation resource configured");
    }
    return typeof source === "function" ? await source() : source;
  };

  // ---- readiness gate ----
  let readyMemo: Promise<void> | null = null;
  const awaitReady = async (): Promise<string | null> => {
    if (!config.ready) return null;
    if (!readyMemo) {
      readyMemo = Promise.resolve().then(config.ready);
    }
    try {
      await readyMemo;
      return null;
    } catch (error) {
      // Clear the memo so the NEXT call re-runs ready() — a memoized
      // once-promise would wedge every future call behind one transient
      // failure (auth expiry, network blip).
      readyMemo = null;
      const message = error instanceof Error ? error.message : String(error);
      return `Server not ready: ${message}. The failure may be transient — retrying the call re-runs initialization.`;
    }
  };

  // ---- staged proposals (the spec's requestState security requirements,
  // applied to panther-owned in-process state: single-use, TTL, bound to the
  // originating request) ----
  const staged = new Map<string, StagedProposal>();
  let nextStagedId = 1;
  const approvalTtlMs = config.approvalTtlMs ?? DEFAULT_APPROVAL_TTL_MS;
  if (!Number.isFinite(approvalTtlMs) || approvalTtlMs <= 0) {
    throw new Error(
      `createMCPServer: approvalTtlMs must be a positive number of milliseconds (got ${approvalTtlMs}) — a non-positive TTL would expire every staged approval before it could be decided.`,
    );
  }
  const evictExpired = () => {
    const now = Date.now();
    for (const [id, entry] of staged) {
      if (entry.expiresAt <= now) staged.delete(id);
    }
  };
  const stageProposal = (
    toolName: string,
    argsKey: string,
    proposal: {
      preview: ProposalPreview;
      commit: () => Promise<unknown> | unknown;
      stillValid?: () => boolean;
    },
  ): string => {
    evictExpired();
    const id = `approval-${nextStagedId++}`;
    staged.set(id, {
      toolName,
      argsKey,
      preview: proposal.preview,
      commit: proposal.commit,
      stillValid: proposal.stillValid,
      expiresAt: Date.now() + approvalTtlMs,
    });
    return id;
  };
  // Single-use: the entry is REMOVED before commit runs; a replayed id finds
  // nothing.
  const takeStaged = (id: string): StagedProposal | null => {
    evictExpired();
    const entry = staged.get(id) ?? null;
    if (entry) staged.delete(id);
    return entry;
  };

  // ---- tool defs (registry order — deterministic so clients and LLM prompt
  // caches can rely on it) ----
  const toolDefs: MCPToolDef[] = [];
  if (config.groundingResource !== undefined) {
    toolDefs.push({
      name: ORIENTATION_TOOL_NAME,
      description: ORIENTATION_TOOL_DESCRIPTION,
      inputSchema: { type: "object", properties: {} },
      annotations: { readOnlyHint: true },
    });
  }
  for (const [name, tool] of exposed) {
    toolDefs.push({
      name,
      description: tool.sdkTool.description,
      inputSchema: tool.sdkTool.input_schema as unknown as Record<
        string,
        unknown
      >,
      annotations: tool.metadata.kind === "read"
        ? { readOnlyHint: true }
        : undefined,
    });
  }

  const commitProposal = async (
    preview: ProposalPreview,
    commit: () => Promise<unknown> | unknown,
    stillValid: (() => boolean) | undefined,
    withAuditHeader: boolean,
  ): Promise<MCPCallOutcome> => {
    // stillValid is load-bearing here, not a nicety: real wall-clock time
    // passes between propose and commit, which is never true in the chat. A
    // THROWING staleness probe is treated as stale — commit must not run on
    // an unverifiable proposal (chat-engine precedent).
    let valid = true;
    if (stillValid) {
      try {
        valid = stillValid();
      } catch {
        valid = false;
      }
    }
    if (!valid) {
      return completeText(staleText(preview));
    }
    try {
      const output = await Promise.resolve(commit());
      const text = stringifyToolOutput(output);
      return completeText(
        withAuditHeader ? renderAuditHeader(preview) + text : text,
      );
    } catch (error) {
      return completeFromThrow(error);
    }
  };

  const runApproval = async (
    name: string,
    approval: ErasedApprovalConfig,
    input: unknown,
    clientCanElicit: boolean,
  ): Promise<MCPCallOutcome> => {
    let proposal: ProposalResult<unknown>;
    try {
      // The view slot is undefined by construction: a view-typed approval
      // cannot declare headless, and the plain-shape erased wrapper drops
      // the slot. No in-flight cancellation is expressible over this
      // transport, so the signal never aborts.
      proposal = await Promise.resolve(
        approval.propose(input, undefined, {
          signal: new AbortController().signal,
        }),
      );
    } catch (error) {
      return completeFromThrow(error);
    }
    // Malformed ProposalResults (a propose that forgot its return, a missing
    // preview/commit) must land in the isError funnel like every other tool
    // failure — the model can read a result; it never sees a JSON-RPC error.
    // The chat engine guards the same shapes (its malformed-prep case).
    if (proposal === null || typeof proposal !== "object") {
      return completeError(
        `Tool "${name}": propose returned ${
          proposal === null ? "null" : typeof proposal
        } instead of a ProposalResult (skip / invalid / preview+commit). No changes were made.`,
      );
    }
    if ("skip" in proposal) {
      return completeText(proposal.skip ?? "");
    }
    if ("invalid" in proposal) {
      return completeError(proposal.invalid ?? "");
    }
    if (
      typeof proposal.commit !== "function" ||
      proposal.preview === null || typeof proposal.preview !== "object" ||
      typeof proposal.preview.title !== "string"
    ) {
      return completeError(
        `Tool "${name}": propose returned a malformed ProposalResult (missing preview.title or commit). No changes were made.`,
      );
    }
    if (config.approvalMode === "elicit" && clientCanElicit) {
      // Unstringifiable parsed input (BigInt, circular) fails here, before
      // anything is staged — funnel it like any other expected failure.
      let argsKey: string;
      try {
        argsKey = JSON.stringify(input) ?? "";
      } catch (error) {
        return completeFromThrow(error);
      }
      const requestState = stageProposal(name, argsKey, proposal);
      return {
        type: "input_required",
        elicitation: buildElicitForm(proposal.preview),
        requestState,
      };
    }
    if (config.approvalMode === "delegate") {
      // Stated honestly: the human consented to the RAW ARGUMENTS (the
      // client's permission prompt), not the computed diff — the preview
      // lands in the result AFTER commit, as the audit record.
      return commitProposal(
        proposal.preview,
        proposal.commit,
        proposal.stillValid,
        true,
      );
    }
    return completeError(
      `Tool "${name}" requires user approval, but the connected client does not support elicitation, so the approval request cannot be presented. No changes were made.`,
    );
  };

  const core: MCPServerCore = {
    serverInfo: { name: config.name, version: config.version },
    hasPrompts: (config.prompts ?? []).length > 0,
    hasResources: (config.resources ?? []).length > 0 ||
      config.groundingResource !== undefined,
    approvalTtlMs,

    instructions: resolveInstructions,

    listTools: () => toolDefs,

    reportExposure: () => {
      const lines = [
        `[panther mcp] ${config.name}: exposing ${toolDefs.length} tool(s): ${
          toolDefs.map((t) => t.name).join(", ") || "(none)"
        }`,
      ];
      for (const d of dropped) {
        lines.push(`[panther mcp] dropped "${d.name}": ${d.reason}`);
      }
      return lines;
    },

    callTool: async (name, args, opts) => {
      const readyError = await awaitReady();
      if (readyError) return completeError(readyError);
      if (
        name === ORIENTATION_TOOL_NAME && config.groundingResource !== undefined
      ) {
        try {
          return completeText(await resolveGrounding());
        } catch (error) {
          return completeFromThrow(error);
        }
      }
      const tool = exposed.get(name);
      if (!tool) {
        throw new MCPRequestError(-32602, `Unknown tool: ${name}`);
      }
      // Parse BEFORE anything else — the chat loop parses before propose and
      // this driver mirrors it. This is the "input validation is the
      // backstop" promise for model-supplied ids: a parse failure is an
      // isError result (AIToolFailure mapping), and propose/handler never
      // see unvalidated input.
      let input: unknown;
      try {
        input = tool.sdkTool.parse ? tool.sdkTool.parse(args) : args;
      } catch (error) {
        return completeFromThrow(error);
      }
      const approval = tool.metadata.approval;
      if (approval) {
        return runApproval(name, approval, input, opts.clientCanElicit);
      }
      try {
        const text = tool.sdkTool.runWithView
          ? await tool.sdkTool.runWithView(input, poisonView(name))
          : await tool.sdkTool.run(input);
        return completeText(text);
      } catch (error) {
        return completeFromThrow(error);
      }
    },

    resumeToolCall: async (name, args, decision, requestState) => {
      const readyError = await awaitReady();
      if (readyError) return completeError(readyError);
      const tool = exposed.get(name);
      if (!tool) {
        throw new MCPRequestError(-32602, `Unknown tool: ${name}`);
      }
      // Parse on the resume leg too — requestState and args are
      // client-supplied input on this leg, exactly like the first.
      let input: unknown;
      try {
        input = tool.sdkTool.parse ? tool.sdkTool.parse(args) : args;
      } catch (error) {
        return completeFromThrow(error);
      }
      const accepted = decision.action === "accept" &&
        decision.content?.confirm === true;
      const entry = takeStaged(requestState);
      if (!entry) {
        // Only an ACCEPT needs the staged closure. A decline/cancel/timeout
        // whose handle already expired (the elicit window shares the TTL, so
        // a timeout lands exactly at expiry) is still a valid declined
        // OUTCOME — an error here would make the model retry.
        return accepted
          ? completeError(
            `Approval handle unknown, already used, or expired. No changes were made. Re-issue the tool call to request approval again.`,
          )
          : completeText(
            "The approval request was declined, cancelled, or timed out before a decision. No changes were made.",
          );
      }
      let resumeArgsKey: string;
      try {
        resumeArgsKey = JSON.stringify(input) ?? "";
      } catch (error) {
        return completeFromThrow(error);
      }
      if (entry.toolName !== name || entry.argsKey !== resumeArgsKey) {
        return completeError(
          `Approval handle does not match this tool call (different tool or arguments). No changes were made. Re-issue the tool call to request approval again.`,
        );
      }
      if (!accepted) {
        // Declining is a valid OUTCOME, not an error — is_error would make
        // the model retry (the chat's outcome doctrine).
        return completeText(declinedText(entry.preview));
      }
      return commitProposal(
        entry.preview,
        entry.commit,
        entry.stillValid,
        false,
      );
    },

    listPrompts: () =>
      (config.prompts ?? []).map(({ name, description, arguments: args }) => ({
        name,
        description,
        arguments: args,
      })),

    getPrompt: async (name, args) => {
      const prompt = (config.prompts ?? []).find((p) => p.name === name);
      if (!prompt) {
        throw new MCPRequestError(-32602, `Unknown prompt: ${name}`);
      }
      return {
        description: prompt.description,
        text: await Promise.resolve(prompt.get(args)),
      };
    },

    listResources: () => {
      const list: Omit<MCPResourceConfig, "read">[] = [];
      if (config.groundingResource !== undefined) {
        list.push({
          uri: ORIENTATION_RESOURCE_URI,
          name: "orientation",
          description:
            "Orientation for operating this app: live ids, rules, tool usage.",
          mimeType: "text/markdown",
        });
      }
      for (
        const { uri, name, description, mimeType } of config.resources ?? []
      ) {
        list.push({ uri, name, description, mimeType });
      }
      return list;
    },

    readResource: async (uri) => {
      if (
        uri === ORIENTATION_RESOURCE_URI &&
        config.groundingResource !== undefined
      ) {
        // The orientation thunk reads live app state, so it waits for
        // hydration like a tool call does.
        const readyError = await awaitReady();
        if (readyError) {
          // -32002 means resource-NOT-FOUND in this era; the resource exists
          // and the server isn't ready — internal error is the honest code.
          throw new MCPRequestError(-32603, readyError);
        }
        return {
          uri,
          mimeType: "text/markdown",
          text: await resolveGrounding(),
        };
      }
      const resource = (config.resources ?? []).find((r) => r.uri === uri);
      if (!resource) {
        throw new MCPRequestError(-32002, `Resource not found: ${uri}`);
      }
      return {
        uri,
        mimeType: resource.mimeType,
        text: await Promise.resolve(resource.read()),
      };
    },
  };

  return core;
}

// Runs every construction check without serving — mirror of
// validateAIChatConfig. Browser-safe (no Deno reach), so a consumer's SPA
// smoke test catches headless-contract violations without the Deno graph.
export function validateMCPServerConfig(config: CreateMCPServerConfig): void {
  buildMCPServerCore(config);
}

export function createMCPServer(config: CreateMCPServerConfig): MCPServer {
  const core = buildMCPServerCore(config);
  return {
    connect: (transport: MCPTransport): MCPConnection =>
      createMCPConnection(core, transport),
    serveStdio: (): Promise<void> => serveCoreOnStdio(core),
  };
}
