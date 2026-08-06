// Copyright 2023-2026, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

// createMCPHttpHandler (PLAN_112, D2/D3): serve a _112 MCPServerCore over
// streamable HTTP on the official MCP SDK v2 wire layer. The SDK owns the
// wire (era classification, sessions, SSE, keepalive, the legacy
// input-required shim); panther owns the semantics (headless filter, approval
// driver, staged-proposal security, serialized dispatch) via the core seam.
//
// Wiring facts, live-proven against Claude Code 2.1.219 (2026-08-06):
// - Legacy (2025-era) serving MUST be sessionful for elicitation: the
//   client's elicitation answer arrives as a separate POST correlated only by
//   Mcp-Session-Id, and the SDK's stateless legacy fallback fails such tools
//   closed ("per-request legacy serving cannot receive server-to-client
//   requests"). So legacy traffic routes to one SDK transport per session.
// - Both eras share ONE tool-handler code path: an approval outcome returns
//   inputRequired(...); on a legacy connection the SDK shim runs the real
//   elicitation/create round trip and re-enters the handler with
//   inputResponses, on a modern one the client retries with them. The
//   re-entry maps 1:1 onto the core's resumeToolCall.
//
// Isolation (D3): one core per authenticated principal, cached with idle TTL
// + LRU cap. Staged proposal ids never leave the principal's core, so
// cross-principal resume is structurally impossible; core eviction clears
// staging. Sessions are principal-bound: a session id presented with a
// different principal's credentials is answered 404, never routed.

import {
  buildMCPServerCore,
  createMcpHandler,
  inputRequired,
  isLegacyRequest,
  MCPRequestError,
  originValidationResponse,
  ProtocolError,
  Server,
  WebStandardStreamableHTTPServerTransport,
} from "./deps.ts";
import type {
  AuthInfo,
  CallToolResult,
  CreateMCPServerConfig,
  MCPCallOutcome,
  MCPElicitDecision,
  MCPServerCore,
  ServerContext,
} from "./deps.ts";

const DEFAULT_CORE_IDLE_TTL_MS = 30 * 60 * 1000;
const DEFAULT_MAX_CORES = 50;
const DEFAULT_MAX_SESSIONS_PER_PRINCIPAL = 20;

// The single input-request key both eras use for the approval confirm form.
// The core's requestState (the staged-proposal handle) rides alongside.
const CONFIRM_KEY = "confirm";

// The shim needs exactly two rounds (propose → resume); the margin covers a
// client that answers with something unusable once before the handler
// completes the flow with a clean outcome.
const INPUT_REQUIRED_MAX_ROUNDS = 4;

export type CreateMCPHttpHandlerOptions<TPrincipal> = {
  // Runs on EVERY request before the SDK sees it. null → 401 (with
  // WWW-Authenticate: Bearer); a throw → 503 (auth backend unavailable —
  // distinct from "bad credentials" so clients don't discard tokens).
  authenticate: (
    req: Request,
  ) => Promise<TPrincipal | null> | TPrincipal | null;
  // Absolute URL of this server's RFC 9728 protected-resource metadata
  // document. When set, the 401 carries
  //   WWW-Authenticate: Bearer resource_metadata="<url>"
  // which is how an OAuth-capable MCP client discovers WHICH authorization
  // server to send the user to. Without it a client that hits the 401 has no
  // way to start an OAuth flow — it only learns that it needs *some* bearer
  // token. Servers that authenticate with pre-shared tokens only (e.g. PATs in
  // a header) can leave it unset; the header then stays a bare "Bearer".
  resourceMetadataUrl?: string;
  // Core-cache key. Default: JSON identity of the principal.
  principalKey?: (principal: TPrincipal) => string;
  // Idle eviction for principal cores (staging dies with the core; the next
  // request transparently rebuilds). Defaults per PLAN_112 D8.
  coreIdleTtlMs?: number;
  maxCores?: number;
  // Legacy wire sessions per principal (resource bounding — PAT auth is the
  // security boundary).
  maxSessionsPerPrincipal?: number;
  // When set, requests whose Origin fails validation are rejected before
  // auth (the SDK's own Origin-validation helper).
  allowedOrigins?: string[];
  // SSE comment-frame keepalive interval for legacy wire sessions,
  // SDK-owned. Default: the SDK's 15s. 0 disables.
  keepAliveMs?: number;
};

type SessionEntry = {
  transport: WebStandardStreamableHTTPServerTransport;
  lastUsed: number;
};

type CoreEntry<TPrincipal> = {
  principal: TPrincipal;
  core: MCPServerCore;
  // Serialized tools/call execution per principal core: handlers were
  // written against a sequential loop and clients parallel-dispatch
  // readOnlyHint tools. Each handler ROUND is one queue unit — the SDK
  // shim's human-decision wait happens between rounds, off the queue, so
  // reads proceed during a pending confirm and the resume re-enters as a
  // fresh unit (the stdio rule, preserved).
  queue: Promise<void>;
  sessions: Map<string, SessionEntry>;
  lastUsed: number;
};

let exposureLogged = false;

function textResult(text: string, isError: boolean): CallToolResult {
  return { content: [{ type: "text", text }], isError };
}

// Same funnel shape as the stdio adapter: MCPRequestError crosses the wire
// as a JSON-RPC error with its code; everything else is left to the SDK's
// own internal-error handling.
function toProtocolError(error: unknown): unknown {
  return error instanceof MCPRequestError
    ? new ProtocolError(error.code, error.message)
    : error;
}

// Decision mapping mirrors the stdio adapter's handleServerRequestResponse:
// accept carries content, decline is decline, anything unrecognized —
// including a missing or malformed entry — resolves as cancel (commit never
// runs on an unreadable answer).
function mapDecision(raw: unknown): MCPElicitDecision {
  if (raw !== null && typeof raw === "object") {
    const entry = raw as { action?: unknown; content?: unknown };
    if (entry.action === "accept") {
      return {
        action: "accept",
        content: (entry.content ?? undefined) as
          | Record<string, unknown>
          | undefined,
      };
    }
    if (entry.action === "decline") {
      return { action: "decline" };
    }
  }
  return { action: "cancel" };
}

function jsonResponse(
  status: number,
  body: Record<string, unknown>,
  headers?: Record<string, string>,
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });
}

export function createMCPHttpHandler<TPrincipal>(
  config: CreateMCPServerConfig<TPrincipal>,
  opts: CreateMCPHttpHandlerOptions<TPrincipal>,
): (req: Request) => Promise<Response> {
  const coreIdleTtlMs = opts.coreIdleTtlMs ?? DEFAULT_CORE_IDLE_TTL_MS;
  const maxCores = opts.maxCores ?? DEFAULT_MAX_CORES;
  const maxSessionsPerPrincipal = opts.maxSessionsPerPrincipal ??
    DEFAULT_MAX_SESSIONS_PER_PRINCIPAL;
  const principalKey = opts.principalKey ??
    ((principal: TPrincipal) => JSON.stringify(principal) ?? "");

  // RFC 9728 §5.1: the challenge points the client at the metadata document.
  // Quotes are mandatory, and the value is embedded verbatim — a URL is the
  // only legal content, so a stray quote would corrupt the header rather than
  // inject a new parameter. Guarded at construction so a bad value fails at
  // wiring time, not on the first unauthenticated request.
  if (opts.resourceMetadataUrl !== undefined) {
    if (/["\\\r\n]/.test(opts.resourceMetadataUrl)) {
      throw new Error(
        "resourceMetadataUrl must not contain quotes, backslashes or newlines",
      );
    }
  }
  const wwwAuthenticate = opts.resourceMetadataUrl === undefined
    ? "Bearer"
    : `Bearer resource_metadata="${opts.resourceMetadataUrl}"`;

  const cores = new Map<string, CoreEntry<TPrincipal>>();
  // sessionId → owning principal key: the routing index that makes
  // cross-principal session use structurally impossible.
  const sessionOwner = new Map<string, string>();

  const closeSession = (entry: CoreEntry<TPrincipal>, sessionId: string) => {
    const session = entry.sessions.get(sessionId);
    entry.sessions.delete(sessionId);
    sessionOwner.delete(sessionId);
    session?.transport.close().catch(() => {});
  };

  const evictCore = (key: string) => {
    const entry = cores.get(key);
    if (!entry) return;
    cores.delete(key);
    for (const sessionId of [...entry.sessions.keys()]) {
      closeSession(entry, sessionId);
    }
  };

  // Lazy sweep on every request — no background timer, so the handler is
  // inert when idle and trivially testable.
  const sweep = (now: number) => {
    for (const [key, entry] of cores) {
      if (now - entry.lastUsed > coreIdleTtlMs) {
        evictCore(key);
        continue;
      }
      for (const [sessionId, session] of entry.sessions) {
        if (now - session.lastUsed > coreIdleTtlMs) {
          closeSession(entry, sessionId);
        }
      }
    }
    while (cores.size > maxCores) {
      let oldestKey: string | null = null;
      let oldestUsed = Infinity;
      for (const [key, entry] of cores) {
        if (entry.lastUsed < oldestUsed) {
          oldestUsed = entry.lastUsed;
          oldestKey = key;
        }
      }
      if (oldestKey === null) break;
      evictCore(oldestKey);
    }
  };

  const resolveCoreEntry = (
    principal: TPrincipal,
    key: string,
    now: number,
  ): CoreEntry<TPrincipal> => {
    const existing = cores.get(key);
    if (existing) {
      existing.lastUsed = now;
      return existing;
    }
    // Thunk-form tools resolve here, once per principal core (D3). A
    // construction throw surfaces as a clean per-request error.
    const core = buildMCPServerCore(
      config as CreateMCPServerConfig,
      { principal },
    );
    if (!exposureLogged) {
      exposureLogged = true;
      for (const line of core.reportExposure()) {
        console.error(line);
      }
    }
    const entry: CoreEntry<TPrincipal> = {
      principal,
      core,
      queue: Promise.resolve(),
      sessions: new Map(),
      lastUsed: now,
    };
    cores.set(key, entry);
    return entry;
  };

  const enqueue = <T>(
    entry: CoreEntry<TPrincipal>,
    work: () => Promise<T>,
  ): Promise<T> => {
    const result = entry.queue.then(work);
    entry.queue = result.then(
      () => {},
      () => {},
    );
    return result;
  };

  const outcomeToCallResult = (
    outcome: MCPCallOutcome,
  ): CallToolResult | ReturnType<typeof inputRequired> => {
    if (outcome.type === "input_required") {
      return inputRequired({
        inputRequests: {
          [CONFIRM_KEY]: inputRequired.elicit({
            message: outcome.elicitation.message,
            // deno-lint-ignore no-explicit-any
            requestedSchema: outcome.elicitation.requestedSchema as any,
          }),
        },
        requestState: outcome.requestState,
      });
    }
    return textResult(outcome.text, outcome.isError);
  };

  // One SDK Server wired to the principal's core. Built per legacy session
  // and per modern request — both thin shells over the same core, so the
  // eras cannot drift.
  const buildSdkServer = async (
    entry: CoreEntry<TPrincipal>,
  ): Promise<Server> => {
    const core = entry.core;
    const instructions = await core.instructions();
    const server = new Server(
      { name: core.serverInfo.name, version: core.serverInfo.version },
      {
        capabilities: {
          tools: {},
          ...(core.hasPrompts ? { prompts: {} } : {}),
          ...(core.hasResources ? { resources: {} } : {}),
        },
        ...(instructions !== undefined ? { instructions } : {}),
        inputRequired: {
          // The elicit window shares the staged-proposal TTL so the two
          // lifetimes cannot drift apart under configuration (stdio parity).
          roundTimeoutMs: core.approvalTtlMs,
          maxRounds: INPUT_REQUIRED_MAX_ROUNDS,
        },
      },
    );

    server.setRequestHandler("tools/list", () => ({
      // deno-lint-ignore no-explicit-any
      tools: core.listTools() as any,
    }));

    server.setRequestHandler("tools/call", (request, ctx: ServerContext) => {
      const name = String(request.params.name ?? "");
      const args = (request.params.arguments ?? {}) as Record<string, unknown>;
      return enqueue(entry, async () => {
        // A cancellation that raced the queue wait must win — commit/handler
        // never runs for a cancelled request (stdio rule).
        if (ctx.mcpReq.signal.aborted) {
          throw new ProtocolError(-32603, "Request cancelled");
        }
        try {
          if (ctx.mcpReq.inputResponses === undefined) {
            // getClientCapabilities is initialize-scoped on legacy
            // connections and per-request-envelope-backfilled on modern
            // ones — the honest fail-closed signal on both.
            const clientCanElicit =
              server.getClientCapabilities()?.elicitation !== undefined;
            const outcome = await core.callTool(name, args, {
              clientCanElicit,
            });
            return outcomeToCallResult(outcome);
          }
          // Resume round: the elicitation answer (or the client's retry)
          // re-entered the handler. requestState is the staged-proposal
          // handle — on the legacy path it never left the process (the SDK
          // shim held it); on the modern path it round-tripped through the
          // client, which is exactly what the staged proposal's single-use
          // + TTL + args binding were built for.
          const decision = mapDecision(
            ctx.mcpReq.inputResponses[CONFIRM_KEY],
          );
          const requestState = ctx.mcpReq.requestState<string>();
          if (typeof requestState !== "string" || requestState.length === 0) {
            return textResult(
              "Approval retry carried no request state. No changes were made. Re-issue the tool call to request approval again.",
              true,
            );
          }
          const outcome = await core.resumeToolCall(
            name,
            args,
            decision,
            requestState,
          );
          if (outcome.type === "input_required") {
            // resume never re-requests input; surface the bug honestly
            // rather than looping (stdio parity).
            throw new ProtocolError(
              -32603,
              "Unexpected second input_required outcome",
            );
          }
          return textResult(outcome.text, outcome.isError);
        } catch (error) {
          throw toProtocolError(error);
        }
      });
    });

    if (core.hasPrompts) {
      server.setRequestHandler("prompts/list", () => ({
        prompts: core.listPrompts(),
      }));
      server.setRequestHandler("prompts/get", async (request) => {
        try {
          const prompt = await core.getPrompt(
            String(request.params.name ?? ""),
            (request.params.arguments ?? {}) as Record<string, string>,
          );
          return {
            ...(prompt.description !== undefined
              ? { description: prompt.description }
              : {}),
            messages: [
              {
                role: "user" as const,
                content: { type: "text" as const, text: prompt.text },
              },
            ],
          };
        } catch (error) {
          throw toProtocolError(error);
        }
      });
    }

    if (core.hasResources) {
      server.setRequestHandler("resources/list", () => ({
        resources: core.listResources(),
      }));
      server.setRequestHandler("resources/templates/list", () => ({
        resourceTemplates: [],
      }));
      server.setRequestHandler("resources/read", async (request) => {
        try {
          const contents = await core.readResource(
            String(request.params.uri ?? ""),
          );
          return {
            contents: [
              {
                uri: contents.uri,
                ...(contents.mimeType !== undefined
                  ? { mimeType: contents.mimeType }
                  : {}),
                text: contents.text,
              },
            ],
          };
        } catch (error) {
          throw toProtocolError(error);
        }
      });
    }

    return server;
  };

  // Modern (2026-07-28) leg: stateless per-request instances over the
  // principal's core, era classification and envelope validation SDK-owned.
  // The principal's entry rides authInfo (strictly pass-through by the SDK's
  // contract).
  const modernHandler = createMcpHandler(
    (ctx) => {
      const entry = (ctx.authInfo?.extra as
        | { pantherCoreEntry?: CoreEntry<TPrincipal> }
        | undefined)?.pantherCoreEntry;
      if (!entry) {
        throw new Error(
          "createMCPHttpHandler: modern request reached the factory without a principal entry",
        );
      }
      return buildSdkServer(entry);
    },
    { legacy: "reject" },
  );

  const handleLegacy = async (
    entry: CoreEntry<TPrincipal>,
    key: string,
    req: Request,
    now: number,
  ): Promise<Response> => {
    const sessionId = req.headers.get("mcp-session-id");
    if (sessionId !== null) {
      const owner = sessionOwner.get(sessionId);
      if (owner === undefined || owner !== key) {
        // Unknown session, or a session owned by a DIFFERENT principal:
        // both answer 404 (per the streamable-HTTP spec the client
        // re-initializes; existence is never leaked across principals).
        return jsonResponse(404, {
          jsonrpc: "2.0",
          error: { code: -32001, message: "Session not found" },
          id: null,
        });
      }
      const session = entry.sessions.get(sessionId)!;
      session.lastUsed = now;
      return session.transport.handleRequest(req);
    }
    // No session id: a fresh initialize (or a stray sessionless frame the
    // SDK transport answers with its own 400).
    while (entry.sessions.size >= maxSessionsPerPrincipal) {
      let oldestId: string | null = null;
      let oldestUsed = Infinity;
      for (const [id, session] of entry.sessions) {
        if (session.lastUsed < oldestUsed) {
          oldestUsed = session.lastUsed;
          oldestId = id;
        }
      }
      if (oldestId === null) break;
      closeSession(entry, oldestId);
    }
    const server = await buildSdkServer(entry);
    const transport = new WebStandardStreamableHTTPServerTransport({
      sessionIdGenerator: () => crypto.randomUUID(),
      ...(opts.keepAliveMs !== undefined
        ? { keepAliveMs: opts.keepAliveMs }
        : {}),
      onsessioninitialized: (id) => {
        entry.sessions.set(id, { transport, lastUsed: now });
        sessionOwner.set(id, key);
      },
      onsessionclosed: (id) => {
        entry.sessions.delete(id);
        sessionOwner.delete(id);
      },
    });
    await server.connect(transport);
    const response = await transport.handleRequest(req);
    if (transport.sessionId === undefined) {
      // The request never initialized a session (the transport answered it
      // with an error) — close the orphan so nothing lingers.
      transport.close().catch(() => {});
    }
    return response;
  };

  return async (req: Request): Promise<Response> => {
    if (opts.allowedOrigins) {
      const rejected = originValidationResponse(req, opts.allowedOrigins);
      if (rejected) return rejected;
    }
    // Auth runs before the SDK sees anything. null → 401; a throw → 503
    // (auth backend unavailable, credentials NOT judged).
    let principal: TPrincipal | null;
    try {
      principal = await Promise.resolve(opts.authenticate(req));
    } catch {
      return jsonResponse(503, { error: "authentication unavailable" });
    }
    if (principal === null) {
      return jsonResponse(401, { error: "unauthorized" }, {
        "WWW-Authenticate": wwwAuthenticate,
      });
    }
    const key = principalKey(principal);
    const now = Date.now();
    sweep(now);
    let entry: CoreEntry<TPrincipal>;
    try {
      entry = resolveCoreEntry(principal, key, now);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return jsonResponse(500, { error: message });
    }
    if (await isLegacyRequest(req)) {
      return handleLegacy(entry, key, req, now);
    }
    const authInfo: AuthInfo = {
      token: "",
      clientId: key,
      scopes: [],
      extra: { pantherCoreEntry: entry },
    };
    return modernHandler.fetch(req, { authInfo });
  };
}
