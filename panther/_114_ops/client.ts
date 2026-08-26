// Copyright 2023-2026, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

// The browser-side projections of the registry: a generated typed caller
// (every entry is POST /api/op/<name> — panterra R14: no hand-written fetch
// wrappers), and the runner — the ONE entry point human UI controls and AI
// tools share, so there is no privileged AI path. Both are derived from the
// same contract objects the server boots, so a divergence is unwritable.

import type { APIResponseWithData, QueryState } from "./deps.ts";
import type {
  NavOpNameOf,
  OpApprovalCallData,
  OpArgsOf,
  OpContract,
  OpOutputOf,
  OpRegistry,
  OpSurface,
  ServerOpNameOf,
} from "./types.ts";

export type OpClientConfig = {
  // Prepended to the path (e.g. "http://localhost:8010" in dev). Default "".
  baseUrl?: string;
  // Must match the server mount. Default "/api/op/".
  pathPrefix?: string;
  // Credential injection (e.g. the dev identity header, a bearer token).
  getHeaders?: () =>
    | Record<string, string>
    | Promise<Record<string, string>>;
  // Injectable for tests.
  fetchFn?: typeof fetch;
};

export type OpCallOpts = {
  // Stamped as X-Op-Surface. Provenance attribution only — never policy.
  // Matches RunOpFn's surface so the runner satisfies the projection
  // contract; the browser client only ever stamps "ai" (the door reads
  // anything else as "ui"), and "mcp" is stamped server-side by the MCP
  // mount's own runner.
  surface?: OpSurface;
  // Approval commit: the key from a pending call's preview response.
  proposalKey?: string;
  // Streaming ops: called once per NDJSON frame.
  onProgress?: (frame: QueryState<unknown>) => void;
};

// Per-op call signatures, derived from the contract: streaming ops take an
// onProgress and resolve with the final frame's data; approval ops resolve
// with the pending/committed union; plain ops resolve with their output.
export type OpClientMethod<C extends OpContract> = C["streaming"] extends true
  ? (
    args: OpArgsOf<C>,
    onProgress?: (frame: QueryState<OpOutputOf<C>>) => void,
  ) => Promise<APIResponseWithData<OpOutputOf<C>>>
  : C["approval"] extends true ? (
      args: OpArgsOf<C>,
      opts?: { proposalKey?: string },
    ) => Promise<APIResponseWithData<OpApprovalCallData<OpOutputOf<C>>>>
  : (args: OpArgsOf<C>) => Promise<APIResponseWithData<OpOutputOf<C>>>;

export type OpClient<TReg extends OpRegistry> = {
  // The typed per-op callers (surface "ui").
  ops: { [K in ServerOpNameOf<TReg>]: OpClientMethod<TReg[K]> };
  // The untyped entry for programmatic surfaces (the runner, AI tools) —
  // same wire, explicit opts.
  call: (
    name: string,
    args: unknown,
    opts?: OpCallOpts,
  ) => Promise<APIResponseWithData<unknown>>;
};

export function createOpClient<TReg extends OpRegistry>(
  registry: TReg,
  config: OpClientConfig = {},
): OpClient<TReg> {
  const baseUrl = config.baseUrl ?? "";
  const prefix = config.pathPrefix ?? "/api/op/";
  const fetchFn = config.fetchFn ?? fetch;
  const ops = registry as Record<string, OpContract>;

  async function call(
    name: string,
    args: unknown,
    opts?: OpCallOpts,
  ): Promise<APIResponseWithData<unknown>> {
    const op = ops[name];
    const headers: Record<string, string> = {
      "content-type": "application/json",
      ...(config.getHeaders !== undefined ? await config.getHeaders() : {}),
    };
    if (opts?.surface === "ai") {
      headers["x-op-surface"] = "ai";
    }
    const body = opts?.proposalKey !== undefined
      ? JSON.stringify({
        ...(args as Record<string, unknown> | undefined ?? {}),
        __proposal: opts.proposalKey,
      })
      : JSON.stringify(args ?? {});
    let res: Response;
    try {
      res = await fetchFn(`${baseUrl}${prefix}${name}`, {
        method: "POST",
        headers,
        body,
      });
    } catch (cause) {
      console.error(`Op call "${name}" failed to reach the server:`, cause);
      return { success: false, err: "Network error" };
    }
    if (op?.streaming === true && res.ok && res.body !== null) {
      let last: QueryState<unknown> | undefined;
      for await (const frame of readNdjsonFrames(res.body)) {
        last = frame;
        opts?.onProgress?.(frame);
      }
      if (last === undefined || last.status === "loading") {
        return { success: false, err: "Stream ended without a result" };
      }
      return last.status === "ready"
        ? { success: true, data: last.data }
        : { success: false, err: last.err };
    }
    const json = await res.json().catch(() => undefined);
    if (
      typeof json === "object" && json !== null && "success" in json
    ) {
      return json as APIResponseWithData<unknown>;
    }
    return { success: false, err: `Unexpected response (${res.status})` };
  }

  const typed = Object.fromEntries(
    Object.entries(ops)
      .filter(([, op]) => op.kind !== "nav")
      .map(([name, op]) => {
        if (op.streaming === true) {
          return [
            name,
            (args: unknown, onProgress?: (f: QueryState<unknown>) => void) =>
              call(name, args, { onProgress }),
          ];
        }
        if (op.approval === true) {
          return [
            name,
            (args: unknown, opts?: { proposalKey?: string }) =>
              call(name, args, opts),
          ];
        }
        return [name, (args: unknown) => call(name, args)];
      }),
  ) as OpClient<TReg>["ops"];

  return { ops: typed, call };
}

////////////////////////////////////////////////////////////////////////////////
// THE RUNNER (one entry for every surface the browser hosts)
////////////////////////////////////////////////////////////////////////////////

// Client-side impls for nav ops — the same both-ways exhaustiveness as the
// server impl map: a missing nav impl or a server op listed here is a type
// error.
export type NavOpImpls<TReg extends OpRegistry> = {
  [K in NavOpNameOf<TReg>]: (
    args: OpArgsOf<TReg[K]>,
  ) => void | Promise<void>;
};

export type OpRunner = (
  name: string,
  args: unknown,
  opts?: OpCallOpts,
) => Promise<APIResponseWithData<unknown>>;

export function createOpRunner<TReg extends OpRegistry>(config: {
  ops: TReg;
  client: OpClient<TReg>;
  nav: NavOpImpls<TReg>;
}): OpRunner {
  const ops = config.ops as Record<string, OpContract>;
  const nav = config.nav as Record<
    string,
    (args: unknown) => void | Promise<void>
  >;
  return async (name, args, opts) => {
    const op = ops[name];
    if (op === undefined) {
      return { success: false, err: `Unknown operation "${name}"` };
    }
    if (op.kind === "nav") {
      // Nav never leaves the browser; validation here is the same honesty
      // check the server performs for its ops.
      const parsed = op.input.safeParse(args ?? {});
      if (!parsed.success) {
        return {
          success: false,
          err: `Invalid input: ${parsed.error.message}`,
        };
      }
      await nav[name](parsed.data);
      return { success: true, data: undefined };
    }
    return await config.client.call(name, args, opts);
  };
}

////////////////////////////////////////////////////////////////////////////////
// HELPERS
////////////////////////////////////////////////////////////////////////////////

async function* readNdjsonFrames(
  body: ReadableStream<Uint8Array>,
): AsyncGenerator<QueryState<unknown>> {
  const decoder = new TextDecoder();
  const reader = body.getReader();
  let buffer = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        const frame = parseFrame(line);
        if (frame !== undefined) {
          yield frame;
        }
      }
    }
    buffer += decoder.decode();
    const finalFrame = parseFrame(buffer);
    if (finalFrame !== undefined) {
      yield finalFrame;
    }
  } finally {
    reader.releaseLock();
  }
}

function parseFrame(line: string): QueryState<unknown> | undefined {
  const trimmed = line.trim();
  if (trimmed === "") {
    return undefined;
  }
  try {
    const parsed = JSON.parse(trimmed);
    if (
      typeof parsed === "object" && parsed !== null && "status" in parsed
    ) {
      return parsed as QueryState<unknown>;
    }
  } catch {
    // Malformed frames are dropped; the terminal-frame check catches a
    // stream that never produced a usable result.
  }
  return undefined;
}
