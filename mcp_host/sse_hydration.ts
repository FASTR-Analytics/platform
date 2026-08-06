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

const MAX_CONNECT_ATTEMPTS = 3;
const RETRY_DELAY_MS = 2000;

type HydrationOpts = {
  baseUrl: string;
  token: string;
  projectId: string;
};

async function readSseStream(
  url: string,
  token: string,
  onData: (data: string) => void,
): Promise<void> {
  const response = await fetch(url, {
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

// Runs the stream with bounded reconnects; only rejects once connecting has
// failed MAX_CONNECT_ATTEMPTS times in a row (any successful frame resets the
// count). Never resolves — the subscription is for the process lifetime.
async function runStreamForever(
  url: string,
  token: string,
  onData: (data: string) => void,
): Promise<never> {
  let attempts = 0;
  while (true) {
    try {
      await readSseStream(url, token, (data) => {
        attempts = 0;
        onData(data);
      });
    } catch (error) {
      attempts++;
      if (attempts >= MAX_CONNECT_ATTEMPTS) {
        throw error;
      }
      console.error(
        `SSE stream error (attempt ${attempts}/${MAX_CONNECT_ATTEMPTS}), retrying: ${error}`,
      );
      await new Promise((res) => setTimeout(res, RETRY_DELAY_MS * attempts));
    }
  }
}

async function waitFor(
  label: string,
  ready: () => boolean,
  failed: Promise<never>,
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

// Connects both SSE streams and resolves once both snapshots are hydrated
// (their `starting` payloads applied). The streams keep running after this
// resolves; a stream that dies permanently after hydration is reported to
// stderr but does not kill the process — tool calls then serve from the last
// snapshot plus direct server actions.
export async function hydrateHeadlessState(
  opts: HydrationOpts,
  timeoutMs = 30_000,
): Promise<void> {
  const instanceStream = runStreamForever(
    `${opts.baseUrl}/instance_updates`,
    opts.token,
    (data) => {
      applyInstanceMessage(parseJsonOrThrow<InstanceSseMessage>(data));
    },
  );
  const projectStream = runStreamForever(
    `${opts.baseUrl}/project_sse_v2/${opts.projectId}`,
    opts.token,
    (data) => {
      applyProjectMessage(parseJsonOrThrow<ProjectSseMessage>(data));
    },
  );
  const anyFailure = Promise.race([instanceStream, projectStream]);
  // Attach the handler immediately: a permanent stream failure after
  // hydration must be reported, not become an unhandled rejection (during
  // hydration the same failure also surfaces through waitFor's race).
  anyFailure.catch((error) => {
    console.error(`SSE subscription lost: ${error}`);
  });

  await waitFor(
    "instance + project state",
    () => instanceSnapshot.isReady && projectSnapshot.isReady,
    anyFailure,
    timeoutMs,
  );
}
