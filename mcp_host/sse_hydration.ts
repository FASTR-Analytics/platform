import type { InstanceSseMessage, ProjectSseMessage } from "lib";
import { parseJsonOrThrow } from "lib";
import {
  applyInstanceMessage,
  applyProjectMessage,
  instanceSnapshot,
  projectSnapshot,
} from "./snapshot.ts";

// Fetch-based SSE readers for the headless MCP host. EventSource cannot carry
// an Authorization header, so the streams are read manually with the personal
// access token. They hydrate the plain snapshots in ./snapshot.ts (the shared
// tool factories alias those snapshots), then stay subscribed for the process
// lifetime so tool reads track live server state.
//
// Failure doctrine:
// - BEFORE first hydration: connect failures are bounded (MAX_CONNECT_ATTEMPTS
//   consecutive) so a bad URL/token fails fast with the real error — including
//   a server-sent `error` frame's message, which counts as a failed attempt
//   (it must NOT reset the attempt count: a server erroring on every connect
//   would otherwise loop forever and only ever surface a generic timeout).
// - AFTER hydration latches: reconnects are unbounded with capped backoff, so
//   an ordinary redeploy self-heals instead of freezing the snapshot forever.
// - A retry of hydrateHeadlessState (the panther `ready()` contract re-runs it
//   after a failure) aborts the previous attempt's streams first — no leaked
//   subscription pairs.

const MAX_CONNECT_ATTEMPTS = 3;
const RETRY_DELAY_MS = 2000;
const MAX_RETRY_DELAY_MS = 30_000;

type HydrationOpts = {
  baseUrl: string;
  token: string;
  projectId: string;
};

async function readSseStream(
  url: string,
  token: string,
  signal: AbortSignal,
  onData: (data: string) => void,
): Promise<void> {
  const response = await fetch(url, {
    signal,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "text/event-stream",
    },
  });
  if (!response.ok || !response.body) {
    throw new Error(
      `SSE connect failed (${response.status}) for ${url}: ${
        (await response.text().catch(() => "")).slice(0, 300)
      }`,
    );
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      throw new Error(`SSE stream ended for ${url}`);
    }
    buffer += decoder.decode(value, { stream: true });
    let sep: number;
    while ((sep = buffer.indexOf("\n\n")) !== -1) {
      const frame = buffer.slice(0, sep);
      buffer = buffer.slice(sep + 2);
      const data = frame
        .split("\n")
        .filter((line) => line.startsWith("data:"))
        .map((line) => line.slice(5).trimStart())
        .join("\n");
      if (data.length > 0) {
        onData(data);
      }
    }
  }
}

// Runs the stream under the failure doctrine above. Resolves (cleanly) only
// when aborted; otherwise loops for the process lifetime and rejects only
// pre-hydration after MAX_CONNECT_ATTEMPTS consecutive failures.
async function runStream(
  url: string,
  token: string,
  signal: AbortSignal,
  established: () => boolean,
  onData: (data: string) => void,
): Promise<void> {
  let attempts = 0;
  while (true) {
    try {
      await readSseStream(url, token, signal, (data) => {
        // onData FIRST: a server `error` frame throws from the handler and
        // must count as a failure, not reset the count.
        onData(data);
        attempts = 0;
      });
    } catch (error) {
      if (signal.aborted) {
        return;
      }
      attempts++;
      if (!established() && attempts >= MAX_CONNECT_ATTEMPTS) {
        throw error;
      }
      const delay = Math.min(RETRY_DELAY_MS * attempts, MAX_RETRY_DELAY_MS);
      console.error(
        `SSE stream error (attempt ${attempts}${
          established() ? "" : `/${MAX_CONNECT_ATTEMPTS}`
        }, retry in ${delay}ms): ${error}`,
      );
      await new Promise((res) => setTimeout(res, delay));
      if (signal.aborted) {
        return;
      }
    }
  }
}

async function waitFor(
  label: string,
  ready: () => boolean,
  failed: Promise<unknown>,
  timeoutMs: number,
): Promise<void> {
  const start = Date.now();
  while (!ready()) {
    if (Date.now() - start > timeoutMs) {
      throw new Error(`Timed out waiting for ${label} hydration`);
    }
    await Promise.race([
      new Promise((res) => setTimeout(res, 100)),
      failed,
    ]);
  }
}

function rejectServerErrorFrames<T extends { type: string }>(
  streamLabel: string,
  msg: T,
): T {
  if (msg.type === "error") {
    const message =
      (msg as unknown as { data?: { message?: string } }).data?.message ??
        "unknown server error";
    throw new Error(`${streamLabel} SSE server error: ${message}`);
  }
  return msg;
}

let activeController: AbortController | null = null;
let established = false;

// Connects both SSE streams and resolves once both snapshots are hydrated
// (their `starting` payloads applied). The streams keep running after this
// resolves; post-hydration drops reconnect forever with capped backoff (a
// redeploy self-heals). A re-invocation (the ready() retry path) aborts the
// prior attempt's streams before subscribing fresh.
export async function hydrateHeadlessState(
  opts: HydrationOpts,
  timeoutMs = 30_000,
): Promise<void> {
  activeController?.abort();
  const controller = new AbortController();
  activeController = controller;

  const instanceStream = runStream(
    `${opts.baseUrl}/instance_updates`,
    opts.token,
    controller.signal,
    () => established,
    (data) => {
      applyInstanceMessage(
        rejectServerErrorFrames(
          "instance",
          parseJsonOrThrow<InstanceSseMessage>(data),
        ),
      );
    },
  );
  const projectStream = runStream(
    `${opts.baseUrl}/project_sse_v2/${opts.projectId}`,
    opts.token,
    controller.signal,
    () => established,
    (data) => {
      applyProjectMessage(
        rejectServerErrorFrames(
          "project",
          parseJsonOrThrow<ProjectSseMessage>(data),
        ),
      );
    },
  );
  const anyFailure = Promise.race([instanceStream, projectStream]);
  // Attach the handler immediately: a permanent stream failure after
  // hydration must be reported, not become an unhandled rejection (during
  // hydration the same failure also surfaces through waitFor's race).
  anyFailure.catch((error) => {
    console.error(`SSE subscription lost: ${error}`);
  });

  try {
    await waitFor(
      "instance + project state",
      () => instanceSnapshot.isReady && projectSnapshot.isReady,
      anyFailure,
      timeoutMs,
    );
  } catch (error) {
    // Failed hydration tears its streams down — the ready() retry re-enters
    // here and must not stack subscription pairs.
    controller.abort();
    throw error;
  }
  established = true;
}
