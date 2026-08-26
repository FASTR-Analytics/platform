// Copyright 2023-2026, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

// The RPC door: web-standard Request → Response over the kernel (panterra
// decision 15: every server op is POST /api/op/<name>). Framework-free —
// the app mounts it in one line (Hono: `app.post("/api/op/:name", (c) =>
// door(c.req.raw))`). This projection is deliberately small: if it ever
// needs the kernel changed to accommodate it, that is a coupling finding,
// not a patch site (panterra E1).
//
// The door owns exactly the transport concerns the kernel must never see:
// method discipline, tri-state credential resolution (_113: identity | null
// → 401 | throw → 503), body parsing, the reserved __proposal field, the
// X-Op-Surface attribution header, and outcome → envelope/status mapping
// (PROTOCOL_DENO_API rule 2: { success, data | err }).

import type { IdentityProvider, QueryState } from "./deps.ts";
import type { OpKernel } from "./kernel.ts";
import type { OpSurface } from "./types.ts";

export type OpHttpHandlerConfig<TIdentity> = {
  kernel: Pick<OpKernel<TIdentity>, "dispatch">;
  provider: IdentityProvider<TIdentity>;
  // Must match where the app mounts the handler. Default "/api/op/".
  pathPrefix?: string;
};

export function createOpHttpHandler<TIdentity>(
  config: OpHttpHandlerConfig<TIdentity>,
): (request: Request) => Promise<Response> {
  const prefix = config.pathPrefix ?? "/api/op/";
  return async (request) => {
    const pathname = new URL(request.url).pathname;
    if (!pathname.startsWith(prefix)) {
      return errJson(404, "Unknown path");
    }
    const name = pathname.slice(prefix.length);
    if (name === "" || name.includes("/")) {
      return errJson(404, "Unknown operation");
    }
    if (request.method !== "POST") {
      return errJson(405, "Operations are called with POST");
    }

    let identity: TIdentity | null;
    try {
      identity = await config.provider.resolve(request);
    } catch (cause) {
      console.error("Auth backend failure:", cause);
      return errJson(503, "Authentication service unavailable");
    }
    if (identity === null) {
      return errJson(401, "Invalid or missing credentials");
    }

    // Client-declared, provenance-only (never policy): anything but "ai"
    // reads as the human UI.
    const surface: OpSurface = request.headers.get("x-op-surface") === "ai"
      ? "ai"
      : "ui";

    const bodyText = await request.text();
    let rawArgs: unknown;
    if (bodyText.trim() === "") {
      rawArgs = undefined;
    } else {
      try {
        rawArgs = JSON.parse(bodyText);
      } catch {
        return errJson(400, "Body must be JSON");
      }
    }

    // The approval commit key travels as a reserved body field so op input
    // schemas stay pure; the door strips it before validation ever sees it.
    let proposalKey: string | undefined;
    if (
      typeof rawArgs === "object" && rawArgs !== null &&
      !Array.isArray(rawArgs) && "__proposal" in rawArgs
    ) {
      const { __proposal, ...rest } = rawArgs as Record<string, unknown>;
      if (typeof __proposal === "string") {
        proposalKey = __proposal;
      }
      rawArgs = rest;
    }

    const outcome = await config.kernel.dispatch(
      name,
      rawArgs,
      identity,
      surface,
      { proposalKey },
    );

    switch (outcome.kind) {
      case "ok":
        return okJson(outcome.data);
      case "pending":
        return okJson({
          status: "pending",
          preview: outcome.preview,
          proposalKey: outcome.proposalKey,
        });
      case "stream":
        return ndjsonResponse(outcome.frames);
      case "notfound":
        return errJson(404, outcome.err);
      case "invalid":
        return errJson(400, outcome.err);
      case "denied":
        return errJson(403, outcome.err);
      case "unavailable":
        return errJson(503, outcome.err);
      case "failed":
        return errJson(500, outcome.err);
    }
  };
}

function okJson(data: unknown): Response {
  return Response.json({ success: true, data }, { status: 200 });
}

function errJson(status: number, err: string): Response {
  return Response.json({ success: false, err }, { status });
}

function ndjsonResponse(frames: AsyncIterable<QueryState<unknown>>): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for await (const frame of frames) {
          controller.enqueue(encoder.encode(JSON.stringify(frame) + "\n"));
        }
      } catch (cause) {
        // A mid-stream throw becomes a terminal error FRAME — the 200 status
        // is already on the wire, so the frame protocol is the error channel.
        console.error("Op stream failed:", cause);
        controller.enqueue(encoder.encode(
          JSON.stringify(
            { status: "error", err: "Stream failed" } satisfies QueryState<
              never
            >,
          ) + "\n",
        ));
      }
      controller.close();
    },
  });
  return new Response(stream, {
    status: 200,
    headers: { "content-type": "application/x-ndjson" },
  });
}
