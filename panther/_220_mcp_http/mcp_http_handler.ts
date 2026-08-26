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
  //
  // Accepts a function because one deployment may serve many hostnames, and
  // RFC 9728 ties the metadata document to the resource identifier the CLIENT
  // used — so the pointer and the document it points at have to be derived the
  // same way, from the same request. Returning undefined falls back to a bare
  // "Bearer" for that request.
  resourceMetadataUrl?: string | ((req: Request) => string | undefined);
  // Core-cache key AND the principal's identity in the per-request log line
  // (`principal=<key>`), so it must be secret-free (wb-fastr: the email).
  // Default: JSON identity of the principal for the cache, and `-` in the log
  // (a JSON-dumped principal routinely carries the bearer token).
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

type WireEra = "legacy" | "modern";

type CoreEntry<TPrincipal> = {
  principal: TPrincipal;
  key: string;
  // What the log prints for this principal: the consumer's principalKey, or
  // `-` under the default (see CreateMCPHttpHandlerOptions.principalKey).
  logLabel: string;
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

// Wire-supplied slots in the log line (tool name, uri, client name/version,
// a presented session id) are unbounded and may carry newlines that would
// forge the next line's fields — same treatment as the core's inlineValue:
// collapse whitespace runs, cap.
const LOG_SLOT_CAP = 200;
function logSlot(value: string): string {
  const flat = value.replace(/\s+/g, " ").trim();
  return flat.length > LOG_SLOT_CAP ? `${flat.slice(0, LOG_SLOT_CAP)}…` : flat;
}

// One stderr line per handler round (unconditional, like the exposure line;
// MCP-level logging is deprecated by SEP-2577 in favour of stderr/OTel). A
// legacy approval call is ONE wire request but two rounds (the SDK shim
// re-enters the handler with the elicitation answer), so the resume round
// is marked. Era + method + session + client identity are what make a
// client's re-list behaviour across deploys observable from the server —
// the catalog is fixed per core and no listChanged is advertised, so this
// log is the only evidence of when a given client re-lists.
// getClientVersion() is deprecated in favour of ctx.mcpReq.envelope, but it
// is the deliberate choice here: legacy connections carry no envelope (the
// identity is initialize-scoped and this accessor is its only reader),
// oninitialized has no ctx, and the SDK backfills it per request on modern.
function logRequest(
  entry: CoreEntry<unknown>,
  era: WireEra,
  method: string,
  sessionId: string | undefined,
  server: Server | undefined,
): void {
  const client = server?.getClientVersion();
  console.error(
    `[panther mcp] ${entry.core.serverInfo.name}: ${era} ${method} principal=${entry.logLabel} session=${
      sessionId === undefined ? "-" : logSlot(sessionId)
    } client=${client ? logSlot(`${client.name}/${client.version}`) : "-"}`,
  );
}

function textResult(text: string, isError: boolean): CallToolResult {
  return { content: [{ type: "text", text }], isError };
}

// A complete outcome mapped whole: the text block always, plus the core's
// pre-wrapped structuredContent when the tool declares an output schema.
function completeResult(
  outcome: Extract<MCPCallOutcome, { type: "complete" }>,
): CallToolResult {
  return {
    content: [{ type: "text", text: outcome.text }],
    isError: outcome.isError,
    ...(outcome.structuredContent !== undefined
      ? { structuredContent: outcome.structuredContent }
      : {}),
  };
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
  const principalLogLabel = opts.principalKey !== undefined
    ? (key: string) => logSlot(key)
    : () => "-";

  // RFC 9728 §5.1: the challenge points the client at the metadata document.
  // Quotes are mandatory and the value is embedded verbatim, so a value
  // carrying a quote, backslash or newline would corrupt the header (or splice
  // in another challenge) rather than be encoded — it is refused outright. A
  // literal is checked at construction so it fails at wiring time; a function's
  // return is checked per call, where it is refused rather than thrown so one
  // bad derivation degrades to a bare "Bearer" instead of 500-ing the 401.
  const HEADER_UNSAFE = /["\\\r\n]/;
  const literalMetadataUrl = typeof opts.resourceMetadataUrl === "string"
    ? opts.resourceMetadataUrl
    : undefined;
  if (
    literalMetadataUrl !== undefined && HEADER_UNSAFE.test(literalMetadataUrl)
  ) {
    throw new Error(
      "resourceMetadataUrl must not contain quotes, backslashes or newlines",
    );
  }

  const challengeFor = (req: Request): string => {
    const url = typeof opts.resourceMetadataUrl === "function"
      ? opts.resourceMetadataUrl(req)
      : opts.resourceMetadataUrl;
    if (url === undefined || HEADER_UNSAFE.test(url)) {
      return "Bearer";
    }
    return `Bearer resource_metadata="${url}"`;
  };

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
      key,
      logLabel: principalLogLabel(key),
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
    return completeResult(outcome);
  };

  // One SDK Server wired to the principal's core. Built per legacy session
  // and per modern request — both thin shells over the same core, so the
  // eras cannot drift.
  const buildSdkServer = async (
    entry: CoreEntry<TPrincipal>,
    era: WireEra,
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

    const log = (ctx: ServerContext, detail?: string) =>
      logRequest(
        entry,
        era,
        [
          ctx.mcpReq.method,
          ...(detail === undefined ? [] : [logSlot(detail)]),
          ...(ctx.mcpReq.inputResponses === undefined ? [] : ["resume"]),
        ].join(" "),
        ctx.sessionId,
        server,
      );

    server.setRequestHandler("tools/list", (_request, ctx: ServerContext) => {
      log(ctx);
      return {
        // deno-lint-ignore no-explicit-any
        tools: core.listTools() as any,
      };
    });

    server.setRequestHandler("tools/call", (request, ctx: ServerContext) => {
      const name = String(request.params.name ?? "");
      const args = (request.params.arguments ?? {}) as Record<string, unknown>;
      log(ctx, name);
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
          return completeResult(outcome);
        } catch (error) {
          throw toProtocolError(error);
        }
      });
    });

    if (core.hasPrompts) {
      server.setRequestHandler(
        "prompts/list",
        (_request, ctx: ServerContext) => {
          log(ctx);
          return { prompts: core.listPrompts() };
        },
      );
      server.setRequestHandler(
        "prompts/get",
        async (request, ctx: ServerContext) => {
          const name = String(request.params.name ?? "");
          log(ctx, name);
          try {
            const prompt = await core.getPrompt(
              name,
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
        },
      );
    }

    if (core.hasResources) {
      server.setRequestHandler(
        "resources/list",
        (_request, ctx: ServerContext) => {
          log(ctx);
          return { resources: core.listResources() };
        },
      );
      server.setRequestHandler(
        "resources/templates/list",
        (_request, ctx: ServerContext) => {
          log(ctx);
          return { resourceTemplates: [] };
        },
      );
      server.setRequestHandler(
        "resources/read",
        async (request, ctx: ServerContext) => {
          const uri = String(request.params.uri ?? "");
          log(ctx, uri);
          try {
            const contents = await core.readResource(uri);
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
        },
      );
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
      return buildSdkServer(entry, ctx.era);
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
        // Logged: this is the moment a client's pre-deploy session reaches
        // the new process.
        logRequest(entry, "legacy", "session-miss", sessionId, undefined);
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
    const server = await buildSdkServer(entry, "legacy");
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
    // Fires on notifications/initialized — the handshake is complete and the
    // client's identity is known (legacy era only, by construction). A client
    // that skips the notification logs no line here; its identity still
    // rides every later line.
    server.oninitialized = () =>
      logRequest(entry, "legacy", "initialized", transport.sessionId, server);
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
        "WWW-Authenticate": challengeFor(req),
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
