// Copyright 2023-2026, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

// The notify seam's server half (panterra Phase 5): the change-event hub
// the kernel emits into, and the guarded SSE door subscribers connect to.
// Events are pokes ({ type: "op", name, scope? }), never payloads — the
// guarded read path stays the only data and authorization channel, so the
// door has nothing to serialize and nothing to leak beyond "something in
// your scope changed", and even that is gated by the subscription guard.
// Framework-free like the RPC door: web-standard Request → Response, one
// mount line in the app.

import { authorize } from "./deps.ts";
import type { Guard, IdentityProvider } from "./deps.ts";
import type { OpChangeEvent } from "./types.ts";

const DEFAULT_HEARTBEAT_MS = 30_000;

export type OpEventSubscriber = {
  // A value hears that scope's events plus unscoped (global) events;
  // undefined hears everything — the widest read, held only by whoever the
  // door's guard admits.
  scope?: string;
  deliver: (event: OpChangeEvent) => void;
};

export type OpEventHub = {
  emit: (event: OpChangeEvent) => void;
  subscribe: (subscriber: OpEventSubscriber) => () => void;
};

// The other half of the kernel's emit seam: pass hub.emit as the kernel's
// `emit`, mount createOpEventsHandler over the same hub.
export function createOpEventHub(): OpEventHub {
  const subscribers = new Set<OpEventSubscriber>();
  return {
    emit: (event) => {
      for (const subscriber of subscribers) {
        if (
          subscriber.scope === undefined || event.scope === undefined ||
          event.scope === subscriber.scope
        ) {
          subscriber.deliver(event);
        }
      }
    },
    subscribe: (subscriber) => {
      subscribers.add(subscriber);
      return () => {
        subscribers.delete(subscriber);
      };
    },
  };
}

export type OpEventsHandlerConfig<TIdentity> = {
  hub: OpEventHub;
  provider: IdentityProvider<TIdentity>;
  // The subscription guard (panterra D4): judged at connect through _113's
  // one evaluation order (null → 401, deny → 403 with the readable reason,
  // throw → 503), then re-run per delivery so a mid-connection revocation
  // stops events without waiting for a reconnect. Per-scope ACLs ride this
  // same seam — a guard closing over the request's scope.
  guard: Guard<TIdentity>;
  heartbeatMs?: number;
};

export function createOpEventsHandler<TIdentity>(
  config: OpEventsHandlerConfig<TIdentity>,
): (request: Request) => Promise<Response> {
  const heartbeatMs = config.heartbeatMs ?? DEFAULT_HEARTBEAT_MS;
  return async (request) => {
    if (request.method !== "GET") {
      return Response.json(
        { success: false, err: "Events are subscribed with GET" },
        { status: 405 },
      );
    }
    const outcome = await authorize(config.provider, request, config.guard);
    if (!outcome.ok) {
      if (outcome.cause !== undefined) {
        console.error("Auth backend failure:", outcome.cause);
      }
      return Response.json(
        { success: false, err: outcome.err },
        { status: outcome.status },
      );
    }
    const identity = outcome.identity;
    const scopeParam = new URL(request.url).searchParams.get("scope");
    const scope = scopeParam === null || scopeParam === ""
      ? undefined
      : scopeParam;

    const encoder = new TextEncoder();
    let cleanup = () => {};
    const stream = new ReadableStream<Uint8Array>({
      start: (controller) => {
        let open = true;
        const send = (text: string) => {
          if (!open) {
            return;
          }
          try {
            controller.enqueue(encoder.encode(text));
          } catch {
            open = false;
          }
        };
        const unsubscribe = config.hub.subscribe({
          scope,
          deliver: (event) => {
            // Guard re-check per delivery: a deny stops the poke; a throw
            // is "cannot judge" — fail closed and skip this delivery (the
            // client's next reconnect re-authorizes in full).
            void (async () => {
              try {
                const decision = await config.guard(identity);
                if (!decision.allow) {
                  return;
                }
              } catch {
                return;
              }
              send(`data: ${JSON.stringify(event)}\n\n`);
            })();
          },
        });
        const heartbeat = setInterval(
          () => send("event: ping\ndata:\n\n"),
          heartbeatMs,
        );
        cleanup = () => {
          open = false;
          clearInterval(heartbeat);
          unsubscribe();
        };
        request.signal.addEventListener("abort", () => {
          cleanup();
          try {
            controller.close();
          } catch {
            // Already closed.
          }
        });
        send("event: ready\ndata:\n\n");
      },
      cancel: () => {
        cleanup();
      },
    });
    return new Response(stream, {
      status: 200,
      headers: {
        "content-type": "text/event-stream",
        "cache-control": "no-cache",
      },
    });
  };
}
