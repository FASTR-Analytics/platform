// Copyright 2023-2026, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

// The notify seam's client half: a fetch-based SSE subscriber. EventSource
// cannot carry an Authorization header, and the credential seam is
// getHeaders (dev header or Bearer JWT — the caller never knows which), so
// the wire stays standard SSE but the transport is fetch plus a minimal
// frame parser (panterra Q1). One connection per scope context; views
// attach listeners. Reconnects retry forever with capped backoff, re-read
// getHeaders each attempt (refreshed tokens ride along), and announce
// every successful (re)connect — refetching on that signal closes both the
// initial subscribe-vs-first-fetch race and the missed-pokes window while
// disconnected (there is no replay buffer, deliberately).

import type { OpChangeEvent } from "./types.ts";

const BASE_RETRY_MS = 1_000;
const MAX_RETRY_MS = 30_000;

export type OpEventsListener = {
  onEvent?: (event: OpChangeEvent) => void;
  // Fires on EVERY successful (re)connect — refetch here.
  onConnect?: () => void;
  onDisconnect?: () => void;
};

export type OpEventsConnection = {
  listen: (listener: OpEventsListener) => () => void;
  close: () => void;
};

export type OpEventsConnectionConfig = {
  // The events door (e.g. "/api/events").
  url: string;
  scope?: string;
  // The same credential seam every other call uses.
  getHeaders?: () => Record<string, string> | Promise<Record<string, string>>;
  // Injectable for tests.
  fetchFn?: typeof fetch;
};

export function connectOpEvents(
  config: OpEventsConnectionConfig,
): OpEventsConnection {
  const fetchFn = config.fetchFn ?? fetch;
  const listeners = new Set<OpEventsListener>();
  const aborter = new AbortController();
  let closed = false;
  let attempt = 0;

  const url = config.scope === undefined
    ? config.url
    : `${config.url}?scope=${encodeURIComponent(config.scope)}`;

  async function run(): Promise<void> {
    while (!closed) {
      let connected = false;
      try {
        const headers = {
          accept: "text/event-stream",
          ...(config.getHeaders !== undefined ? await config.getHeaders() : {}),
        };
        const res = await fetchFn(url, { headers, signal: aborter.signal });
        if (!res.ok || res.body === null) {
          throw new Error(`Events connection refused (${res.status})`);
        }
        attempt = 0;
        connected = true;
        for (const listener of listeners) {
          listener.onConnect?.();
        }
        await readSseData(res.body, (data) => {
          const event = parseChangeEvent(data);
          if (event !== undefined) {
            for (const listener of listeners) {
              listener.onEvent?.(event);
            }
          }
        });
        // Stream ended (server restart, network drop) — reconnect below.
      } catch {
        // Refused, unreachable, or aborted by close() — the loop decides.
      }
      if (connected) {
        for (const listener of listeners) {
          listener.onDisconnect?.();
        }
      }
      if (closed) {
        return;
      }
      attempt++;
      const delay = Math.min(BASE_RETRY_MS * 2 ** (attempt - 1), MAX_RETRY_MS);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
  void run();

  return {
    listen: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    close: () => {
      closed = true;
      aborter.abort();
    },
  };
}

////////////////////////////////////////////////////////////////////////////////
// HELPERS
////////////////////////////////////////////////////////////////////////////////

async function readSseData(
  body: ReadableStream<Uint8Array>,
  onData: (data: string) => void,
): Promise<void> {
  const decoder = new TextDecoder();
  const reader = body.getReader();
  let buffer = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        return;
      }
      buffer += decoder.decode(value, { stream: true });
      let sep: number;
      while ((sep = buffer.indexOf("\n\n")) !== -1) {
        const frame = buffer.slice(0, sep);
        buffer = buffer.slice(sep + 2);
        handleFrame(frame, onData);
      }
    }
  } finally {
    reader.releaseLock();
  }
}

function handleFrame(frame: string, onData: (data: string) => void): void {
  let eventType = "message";
  const dataLines: string[] = [];
  for (const rawLine of frame.split("\n")) {
    const line = rawLine.endsWith("\r") ? rawLine.slice(0, -1) : rawLine;
    if (line.startsWith(":")) {
      continue;
    }
    if (line.startsWith("event:")) {
      eventType = line.slice("event:".length).trim();
    } else if (line.startsWith("data:")) {
      dataLines.push(line.slice("data:".length).trimStart());
    }
  }
  if (eventType !== "message") {
    // ready/ping are transport frames, not change events.
    return;
  }
  const data = dataLines.join("\n");
  if (data !== "") {
    onData(data);
  }
}

function parseChangeEvent(data: string): OpChangeEvent | undefined {
  try {
    const parsed: unknown = JSON.parse(data);
    if (
      typeof parsed === "object" && parsed !== null &&
      (parsed as { type?: unknown }).type === "op" &&
      typeof (parsed as { name?: unknown }).name === "string"
    ) {
      return parsed as OpChangeEvent;
    }
  } catch {
    // Malformed frames are dropped — events are pokes; the next poke (or
    // the reconnect refetch) covers anything missed.
  }
  return undefined;
}
