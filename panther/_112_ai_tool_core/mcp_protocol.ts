// Copyright 2023-2026, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

// The 2025-11-25 protocol adapter + stdio transport for createMCPServer.
// ONE revision, selected by the Phase 0 wire spike (PLAN_305_MCP_SERVER.md):
// Claude Code speaks the legacy initialize handshake and answers
// server-initiated elicitation/create on stdio. The adapter owns everything
// wire-shaped — framing, negotiation, the elicit round trip, the serialized
// tools/call queue, cancellation — and drives the era-agnostic core through
// callTool/resumeToolCall. Tripwire resolution (2026-08-06, PLAN_112): the
// second adapter arrived (remote HTTP) and the flip to the official SDK
// HAPPENED — the HTTP adapter (_220_mcp_http/createMCPHttpHandler) is built
// on @modelcontextprotocol/server v2 and serves both protocol eras through
// the SDK's inbound ladder. THIS stdio adapter is grandfathered as-is:
// live-verified, zero-dep, browser-inert, and not worth churning until there
// is a concrete reason to consolidate it onto the SDK. Its dispatch
// semantics remain the reference behavior the HTTP adapter mirrors.

import {
  type MCPCallOutcome,
  type MCPConnection,
  type MCPElicitDecision,
  MCPRequestError,
  type MCPServerCore,
  type MCPTransport,
} from "./mcp_types.ts";

// Newest first; initialize echoes a supported requested version, else offers
// the newest. 2025-03-26 is deliberately NOT listed: that revision mandated
// JSON-RPC batching, which this adapter does not implement — advertising it
// would claim a contract we don't honor. A 2025-03-26 client is offered
// 2025-11-25 and may disconnect.
const SUPPORTED_VERSIONS = ["2025-11-25", "2025-06-18"];
const PREFERRED_VERSION = "2025-11-25";

// On stdin EOF, give in-flight work this long to drain before exiting — an
// exit mid-commit tears the write. Bounded so a wedged handler cannot block
// shutdown forever (the client escalates to SIGTERM anyway).
const EOF_DRAIN_TIMEOUT_MS = 10_000;

// Server-initiated request ids live in their own range so a log reader can
// tell the directions apart at a glance (ids only need per-sender uniqueness).
const SERVER_REQUEST_ID_BASE = 1_000_000;

type Frame = {
  jsonrpc?: string;
  id?: number | string | null;
  method?: string;
  params?: Record<string, unknown>;
  result?: unknown;
  error?: unknown;
};

export function createMCPConnection(
  core: MCPServerCore,
  transport: MCPTransport,
): MCPConnection {
  // Startup report: exposed/dropped with per-tool reasons. stderr is the
  // sanctioned log channel for a stdio server.
  for (const line of core.reportExposure()) {
    console.error(line);
  }

  let clientCanElicit = false;
  let nextServerRequestId = SERVER_REQUEST_ID_BASE;
  // Values are settle functions: idempotent, and they own ALL cleanup (both
  // maps + the timer), so every resolution path — client answer, timeout,
  // cancellation of the originating call — is a single call.
  const pendingServerRequests = new Map<
    number,
    (decision: MCPElicitDecision) => void
  >();
  // Client-request id → the elicitation we sent on its behalf, so a
  // notifications/cancelled for the call can withdraw the dialog.
  const pendingElicitsByCall = new Map<number | string, number>();
  // Ids are pruned when their suppressed/dropped response is consumed (each
  // request has exactly one terminal send site); only cancellations for
  // already-answered ids linger, which are rare and tiny.
  const cancelled = new Set<number | string>();

  // idle() bookkeeping for test rigs.
  let pendingCount = 0;
  let idleResolvers: (() => void)[] = [];
  const track = () => {
    pendingCount++;
  };
  const untrack = () => {
    pendingCount--;
    if (pendingCount === 0) {
      const resolvers = idleResolvers;
      idleResolvers = [];
      for (const resolve of resolvers) resolve();
    }
  };

  // A throwing transport (BrokenPipe on a torn-down client, a failing test
  // duplex) must never poison the serialized queue or escape into the read
  // loop — the frame is lost and logged; EOF/teardown surfaces the real
  // failure soon enough.
  const send = (frame: Record<string, unknown>) => {
    try {
      transport.send(JSON.stringify(frame));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[panther mcp] transport send failed: ${message}`);
    }
  };
  // A cancelled request MUST NOT receive any further messages — both result
  // and error replies are suppressed. Each request has exactly one terminal
  // send site, so consuming the cancellation entry here keeps the set from
  // growing for the process lifetime.
  const sendResult = (id: number | string, result: unknown) => {
    if (cancelled.has(id)) {
      cancelled.delete(id);
      return;
    }
    send({ jsonrpc: "2.0", id, result });
  };
  const sendError = (
    id: number | string | null,
    code: number,
    message: string,
  ) => {
    if (id !== null && cancelled.has(id)) {
      cancelled.delete(id);
      return;
    }
    send({ jsonrpc: "2.0", id, error: { code, message } });
  };

  // Async request handlers (initialize, prompts/get, resources/read) run
  // unserialized — they are reads. tools/call goes through the queue below.
  const runAsync = (id: number | string, work: () => Promise<void>) => {
    track();
    work()
      .catch((error) => {
        if (error instanceof MCPRequestError) {
          sendError(id, error.code, error.message);
        } else {
          const message = error instanceof Error
            ? error.message
            : String(error);
          sendError(id, -32603, message);
        }
      })
      .finally(untrack);
  };

  // Serialized execution: panther tool handlers were written against the chat
  // loop's sequential-block contract, and Claude Code demonstrably issues
  // concurrent calls for readOnlyHint tools — the queue is load-bearing from
  // day one.
  let queue: Promise<void> = Promise.resolve();
  const enqueueToolCall = (id: number | string, work: () => Promise<void>) => {
    track();
    queue = queue
      .then(async () => {
        // Cancelled while queued: drop the request entirely, no response.
        if (cancelled.has(id)) {
          cancelled.delete(id);
          return;
        }
        try {
          await work();
        } catch (error) {
          if (error instanceof MCPRequestError) {
            sendError(id, error.code, error.message);
          } else {
            const message = error instanceof Error
              ? error.message
              : String(error);
            sendError(id, -32603, message);
          }
        }
      })
      .finally(untrack);
  };

  // The timeout shares the staged-proposal TTL (core.approvalTtlMs) so the
  // elicitation window and the handle's lifetime cannot drift apart under
  // configuration. A client that never answers gets resolved as cancel when
  // it fires (a declined outcome, not an error). The serialized queue is NOT
  // held during this wait — see awaitDecisionOffQueue.
  const requestElicitation = (
    clientRequestId: number | string,
    elicitation: { message: string; requestedSchema: Record<string, unknown> },
  ): Promise<MCPElicitDecision> => {
    return new Promise((resolve) => {
      const id = nextServerRequestId++;
      const settle = (decision: MCPElicitDecision) => {
        if (!pendingServerRequests.has(id)) return;
        pendingServerRequests.delete(id);
        pendingElicitsByCall.delete(clientRequestId);
        clearTimeout(timer);
        resolve(decision);
      };
      const timer = setTimeout(
        () => settle({ action: "cancel" }),
        core.approvalTtlMs,
      );
      pendingServerRequests.set(id, settle);
      pendingElicitsByCall.set(clientRequestId, id);
      send({
        jsonrpc: "2.0",
        id,
        method: "elicitation/create",
        params: elicitation,
      });
    });
  };

  const sendCallOutcome = (id: number | string, outcome: MCPCallOutcome) => {
    if (outcome.type === "input_required") {
      // resume never re-requests input; treat a second round as a bug
      // surfaced honestly rather than looping.
      sendError(id, -32603, "Unexpected second input_required outcome");
      return;
    }
    sendResult(id, {
      content: [{ type: "text", text: outcome.text }],
      isError: outcome.isError,
      ...(outcome.structuredContent !== undefined
        ? { structuredContent: outcome.structuredContent }
        : {}),
    });
  };

  // The elicit-await tail of an approval call, run OFF the serialized queue
  // (tracked for idle()/EOF-drain, so a pending approval still holds the
  // bounded shutdown drain). When the decision arrives, the resume re-enters
  // the queue as a fresh unit — commit runs serialized with other handlers,
  // never concurrently.
  const awaitDecisionOffQueue = (
    id: number | string,
    name: string,
    args: Record<string, unknown>,
    outcome: Extract<MCPCallOutcome, { type: "input_required" }>,
  ) => {
    track();
    requestElicitation(id, outcome.elicitation)
      .then((decision) => {
        // A cancellation that raced the decision must WIN — commit never
        // runs for a cancelled request (the chat engine's Stop doctrine).
        // The staged proposal is abandoned and expires by TTL. (This is the
        // terminal site for a mid-elicit cancel, so the flag is consumed
        // here; a cancel arriving AFTER this check is consumed by the
        // enqueued unit's own cancelled-while-queued guard.)
        if (cancelled.has(id)) {
          cancelled.delete(id);
          return;
        }
        enqueueToolCall(id, async () => {
          sendCallOutcome(
            id,
            await core.resumeToolCall(
              name,
              args,
              decision,
              outcome.requestState,
            ),
          );
        });
      })
      .finally(untrack);
  };

  const handleServerRequestResponse = (frame: Frame) => {
    const rawId = frame.id;
    // JSON-RPC ids may legally be strings — a client echoing "1000000" must
    // not be silently dropped (that would wedge the queue until the timeout).
    const id = typeof rawId === "number"
      ? rawId
      : typeof rawId === "string" && /^[0-9]+$/.test(rawId)
      ? Number(rawId)
      : undefined;
    if (id === undefined) return;
    const settle = pendingServerRequests.get(id);
    if (!settle) return;
    if (frame.error !== undefined) {
      settle({ action: "cancel" });
      return;
    }
    const result = frame.result as
      | { action?: string; content?: Record<string, unknown> }
      | undefined;
    const action = result?.action;
    if (action === "accept" || action === "decline" || action === "cancel") {
      settle(
        action === "accept" ? { action, content: result?.content } : { action },
      );
    } else {
      settle({ action: "cancel" });
    }
  };

  const handleNotification = (frame: Frame) => {
    if (frame.method === "notifications/cancelled") {
      const requestId = (frame.params as { requestId?: number | string })
        ?.requestId;
      if (requestId !== undefined) {
        cancelled.add(requestId);
        // If the call is awaiting an elicitation, cancellation must release
        // it NOW, not at the timeout: withdraw the dialog (the client gets
        // notifications/cancelled for our own request) and settle the await
        // as cancel so the serialized queue frees immediately.
        const elicitId = pendingElicitsByCall.get(requestId);
        if (elicitId !== undefined) {
          send({
            jsonrpc: "2.0",
            method: "notifications/cancelled",
            params: {
              requestId: elicitId,
              reason: "The originating tools/call was cancelled",
            },
          });
          pendingServerRequests.get(elicitId)?.({ action: "cancel" });
        }
      }
    }
    // notifications/initialized and anything unknown: no-op by spec.
  };

  const handleRequest = (frame: Frame) => {
    const id = frame.id as number | string;
    const params = frame.params ?? {};
    switch (frame.method) {
      case "initialize": {
        const capabilities = params.capabilities as
          | { elicitation?: unknown }
          | undefined;
        clientCanElicit = capabilities?.elicitation !== undefined;
        const requested = params.protocolVersion;
        const negotiated = typeof requested === "string" &&
            SUPPORTED_VERSIONS.includes(requested)
          ? requested
          : PREFERRED_VERSION;
        runAsync(id, async () => {
          const instructions = await core.instructions();
          sendResult(id, {
            protocolVersion: negotiated,
            // No listChanged anywhere: delivering it is not supported, and
            // declaring a capability without honouring it is a lie to the
            // client. The tool set is fixed for the process lifetime.
            capabilities: {
              tools: {},
              ...(core.hasPrompts ? { prompts: {} } : {}),
              ...(core.hasResources ? { resources: {} } : {}),
            },
            serverInfo: core.serverInfo,
            ...(instructions !== undefined ? { instructions } : {}),
          });
        });
        return;
      }
      case "ping":
        sendResult(id, {});
        return;
      case "tools/list":
        // Pagination cursor accepted and ignored — the full list fits.
        sendResult(id, { tools: core.listTools() });
        return;
      case "tools/call": {
        const name = String(params.name ?? "");
        const args = (params.arguments ?? {}) as Record<string, unknown>;
        enqueueToolCall(id, async () => {
          const outcome: MCPCallOutcome = await core.callTool(name, args, {
            clientCanElicit,
          });
          if (outcome.type === "input_required") {
            // Release the serial slot for the human approval window: propose
            // is done and commit has not started, so NO handler runs while
            // the decision is pending — holding the queue would block every
            // parallel read for up to approvalTtlMs protecting nothing
            // (stillValid is the staleness guard). The decision re-enters
            // the queue below, so commit stays serialized with other
            // handlers; the staged proposal's single-use + TTL + args
            // binding make the resume single-flight.
            awaitDecisionOffQueue(id, name, args, outcome);
            return;
          }
          sendCallOutcome(id, outcome);
        });
        return;
      }
      case "prompts/list":
        if (!core.hasPrompts) break;
        sendResult(id, { prompts: core.listPrompts() });
        return;
      case "prompts/get": {
        if (!core.hasPrompts) break;
        const name = String(params.name ?? "");
        const args = (params.arguments ?? {}) as Record<string, string>;
        runAsync(id, async () => {
          const prompt = await core.getPrompt(name, args);
          sendResult(id, {
            ...(prompt.description !== undefined
              ? { description: prompt.description }
              : {}),
            messages: [
              {
                role: "user",
                content: { type: "text", text: prompt.text },
              },
            ],
          });
        });
        return;
      }
      case "resources/list":
        if (!core.hasResources) break;
        sendResult(id, { resources: core.listResources() });
        return;
      case "resources/templates/list":
        // Templates are out of scope, but a client that saw the resources
        // capability may probe — an empty list is the graceful answer.
        if (!core.hasResources) break;
        sendResult(id, { resourceTemplates: [] });
        return;
      case "resources/read": {
        if (!core.hasResources) break;
        const uri = String(params.uri ?? "");
        runAsync(id, async () => {
          const contents = await core.readResource(uri);
          sendResult(id, {
            contents: [
              {
                uri: contents.uri,
                ...(contents.mimeType !== undefined
                  ? { mimeType: contents.mimeType }
                  : {}),
                text: contents.text,
              },
            ],
          });
        });
        return;
      }
    }
    sendError(id, -32601, `Method not found: ${frame.method}`);
  };

  return {
    handleLine: (line: string) => {
      let parsed: unknown;
      try {
        parsed = JSON.parse(line);
      } catch {
        sendError(null, -32700, "Parse error");
        return;
      }
      // Valid JSON that is not a JSON-RPC object — `null`, primitives, and
      // batch arrays (not supported in the advertised revisions) — is an
      // Invalid Request, answered and SURVIVED: one junk line must never
      // take the server down.
      if (
        parsed === null || typeof parsed !== "object" || Array.isArray(parsed)
      ) {
        sendError(null, -32600, "Invalid Request");
        return;
      }
      const frame = parsed as Frame;
      try {
        if (typeof frame.method === "string") {
          if (frame.id === undefined || frame.id === null) {
            handleNotification(frame);
          } else {
            handleRequest(frame);
          }
          return;
        }
        // No method: a response to a server-initiated request (elicitation).
        handleServerRequestResponse(frame);
      } catch (error) {
        // Backstop: a dispatch throw must never escape into the transport
        // read loop (on stdio that would kill the process).
        const message = error instanceof Error ? error.message : String(error);
        console.error(`[panther mcp] request dispatch failed: ${message}`);
        if (typeof frame.id === "number" || typeof frame.id === "string") {
          sendError(frame.id, -32603, message);
        }
      }
    },
    idle: () => {
      if (pendingCount === 0) return Promise.resolve();
      return new Promise((resolve) => idleResolvers.push(resolve));
    },
  };
}

// The stdio transport. Reaches Deno only inside the function body so the UI
// barrel stays browser-safe.
export async function serveCoreOnStdio(core: MCPServerCore): Promise<void> {
  // deno-lint-ignore no-explicit-any
  const deno = (globalThis as any).Deno;
  if (!deno) {
    throw new Error(
      "serveStdio requires a Deno runtime (stdio transport). In the browser, use validateMCPServerConfig for boot-time checks instead.",
    );
  }
  const encoder = new TextEncoder();
  const writeStderr = (text: string) => {
    deno.stderr.writeSync(encoder.encode(text + "\n"));
  };
  // stdout purity is a spec MUST — the server may write NOTHING non-protocol
  // to stdout. Redirect the WHOLE console before anything else runs (Deno's
  // table/dir/group/count/time* family also writes to stdout — redirecting
  // only the log/error five leaves ordinary consumer logging able to corrupt
  // the frame stream). Formatting niceties are traded for purity: everything
  // becomes plain stderr lines.
  const toStderr = (...args: unknown[]) => {
    writeStderr(
      args.map((a) => (typeof a === "string" ? a : JSON.stringify(a))).join(
        " ",
      ),
    );
  };
  const noop = () => {};
  Object.assign(console, {
    log: toStderr,
    info: toStderr,
    warn: toStderr,
    debug: toStderr,
    error: toStderr,
    trace: toStderr,
    table: toStderr,
    dir: toStderr,
    dirxml: toStderr,
    group: toStderr,
    groupCollapsed: toStderr,
    groupEnd: noop,
    count: toStderr,
    countReset: noop,
    time: noop,
    timeEnd: toStderr,
    timeLog: toStderr,
    clear: noop,
    assert: (condition: unknown, ...rest: unknown[]) => {
      if (!condition) toStderr("Assertion failed:", ...rest);
    },
  });

  const connection = createMCPConnection(core, {
    send: (line: string) => {
      deno.stdout.writeSync(encoder.encode(line + "\n"));
    },
  });

  const decoder = new TextDecoder();
  let buffer = "";
  for await (const chunk of deno.stdin.readable) {
    buffer += decoder.decode(chunk, { stream: true });
    let newline: number;
    while ((newline = buffer.indexOf("\n")) !== -1) {
      const line = buffer.slice(0, newline);
      buffer = buffer.slice(newline + 1);
      if (line.trim()) {
        connection.handleLine(line);
      }
    }
  }
  // A complete final frame without a trailing newline would otherwise be
  // silently dropped (one-shot scripting clients: `printf ... | server`).
  if (buffer.trim()) {
    connection.handleLine(buffer);
  }
  // stdin EOF is the primary (and only portable) graceful-shutdown signal —
  // exit promptly, but drain in-flight work first (bounded): exiting
  // mid-handler tears a commit on every session end that races a call.
  await Promise.race([
    connection.idle(),
    new Promise((resolve) => setTimeout(resolve, EOF_DRAIN_TIMEOUT_MS)),
  ]);
  deno.exit(0);
}
