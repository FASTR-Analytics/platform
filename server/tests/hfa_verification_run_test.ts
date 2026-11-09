// Pins the HFA indicator verification run on the server: the queue a start
// and a second start build, the refusal while stopping, and run.ts driven by
// a stub SDK fetch, each call through the client built for its queuer, each
// answer saved as it arrives, an indicator queued again mid-call checked
// twice, an indicator queued before the end checked, the first call after
// every snapshot read alone, a 429 and a stop each ending the run with the
// answers in flight saved, a deleted indicator's queue row, and the startup
// sweep. On a throwaway database built from _main_database.sql on the dev
// postgres (the .env the test task loads), dropped afterwards.
//
//   deno task test:files server/tests/hfa_verification_run_test.ts

import Anthropic from "@anthropic-ai/sdk";
import { assert, assertEquals } from "@std/assert";
import type { HfaVerificationNewFinding } from "lib";
import { getPgConnection } from "../db/postgres/connection_manager.ts";
import {
  endHfaVerificationRun,
  getHfaVerification,
  getHfaVerificationRunState,
  markStaleHfaVerificationRuns,
  queueHfaVerificationIndicators,
  startHfaVerificationRun,
  stopHfaVerificationRun,
} from "../db/instance/hfa_verification.ts";
import { runHfaVerification } from "../worker_routines/hfa_verification/run.ts";

const SCHEMA_PATH =
  new URL("../db/instance/_main_database.sql", import.meta.url).pathname;
const DB_PREFIX = "hfa_verification_run_test_";
const A = "a@x.y";
const B = "b@x.y";
const IDS = Array.from(
  { length: 10 },
  (_, i) => `ind${String(i + 1).padStart(3, "0")}`,
);

const admin = getPgConnection("postgres", { max: 1 });
for (
  const { datname } of await admin<{ datname: string }[]>`
    SELECT datname FROM pg_database WHERE datname LIKE ${DB_PREFIX + "%"}
  `
) {
  await admin.unsafe(`DROP DATABASE IF EXISTS ${datname} WITH (FORCE)`);
}
const dbName = `${DB_PREFIX}${Date.now()}`;
await admin.unsafe(`CREATE DATABASE ${dbName}`);
const db = getPgConnection(dbName, { max: 4 });
await db.file(SCHEMA_PATH);
await db`
  INSERT INTO hfa_time_points (label, period_id, sort_order)
  VALUES ('R1', '202401', 0)
`;
await db`
  INSERT INTO hfa_indicators ${
  db(
    [...IDS, "gone"].map((id, i) => ({
      indicator_id: id,
      type: "binary",
      aggregation: "avg",
      sort_order: i,
    })),
    "indicator_id",
    "type",
    "aggregation",
    "sort_order",
  )
}
`;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function until(condition: () => boolean): Promise<void> {
  while (!condition()) await sleep(2);
}

async function reset(): Promise<void> {
  await db`DELETE FROM hfa_verification_queue`;
  await db`DELETE FROM hfa_verification_runs`;
  await db`DELETE FROM hfa_verification_findings`;
  await db`DELETE FROM hfa_indicator_verifications`;
}

async function queue(ids: string[], by: string): Promise<string> {
  const queued = await queueHfaVerificationIndicators(db, ids, by);
  assert(queued.kind === "created", queued.kind);
  return queued.runId;
}

async function queueRows(): Promise<[string, string][]> {
  return (await db<{ indicator_id: string; queued_by: string }[]>`
    SELECT indicator_id, queued_by FROM hfa_verification_queue
    ORDER BY indicator_id
  `).map((r) => [r.indicator_id, r.queued_by]);
}

async function verifiedBy(): Promise<[string, string][]> {
  const rows = await getHfaVerification(db);
  assert(rows.success);
  return rows.data.verifications.map((v) => [v.indicatorId, v.verifiedBy]);
}

async function runState() {
  const state = await getHfaVerificationRunState(db);
  assert(state !== undefined);
  return state;
}

function streamed(text: string, stopReason: string): Response {
  const event = (type: string, data: object) =>
    `event: ${type}\ndata: ${JSON.stringify({ type, ...data })}\n\n`;
  return new Response(
    event("message_start", {
      message: {
        id: "msg",
        type: "message",
        role: "assistant",
        model: "stub-model",
        content: [],
        stop_reason: null,
        stop_sequence: null,
        usage: { input_tokens: 1, output_tokens: 0 },
      },
    }) +
      event("content_block_start", {
        index: 0,
        content_block: { type: "text", text: "" },
      }) +
      event("content_block_delta", {
        index: 0,
        delta: { type: "text_delta", text },
      }) +
      event("content_block_stop", { index: 0 }) +
      event("message_delta", {
        delta: { stop_reason: stopReason, stop_sequence: null },
        usage: { output_tokens: 1 },
      }) +
      event("message_stop", {}),
    { headers: { "Content-Type": "text/event-stream" } },
  );
}

type Reply =
  | { findings: HfaVerificationNewFinding[] }
  | { refusal: true }
  | { rateLimit: string };

// A model per queuer, behind the SDK's own client: each call records who it
// was made for, which indicator it checks and how many calls were in flight
// as it began, waits `before`, then answers `reply` after `delayMs`.
function stubModel(options: {
  reply?: (indicatorId: string) => Reply;
  before?: (indicatorId: string, callIndex: number) => Promise<void>;
  delayMs?: (indicatorId: string) => number;
}) {
  const calls: { queuedBy: string; indicatorId: string; inFlight: number }[] =
    [];
  const built: string[] = [];
  let active = 0;
  const clientFor = (queuedBy: string) => {
    built.push(queuedBy);
    return Promise.resolve(
      new Anthropic({
        apiKey: "stub",
        fetch: async (_url: string | URL | Request, init?: RequestInit) => {
          const body = JSON.stringify(JSON.parse(String(init?.body)).messages);
          const indicatorId = body.match(/ind\d{3}|gone/)![0];
          active++;
          const callIndex = calls.length;
          calls.push({ queuedBy, indicatorId, inFlight: active });
          try {
            await options.before?.(indicatorId, callIndex);
            await sleep(options.delayMs?.(indicatorId) ?? 0);
            const reply = options.reply?.(indicatorId) ?? { findings: [] };
            if ("rateLimit" in reply) {
              return Response.json(
                {
                  type: "error",
                  error: { type: "rate_limit_error", message: reply.rateLimit },
                },
                { status: 429, headers: { "x-should-retry": "false" } },
              );
            }
            return "refusal" in reply
              ? streamed("", "refusal")
              : streamed(JSON.stringify(reply), "end_turn");
          } finally {
            active--;
          }
        },
      }),
    );
  };
  return { calls, built, clientFor, active: () => active };
}

function run(model: ReturnType<typeof stubModel>, runId: string) {
  return runHfaVerification(
    { mainDb: db, clientFor: model.clientFor, now: () => 0 },
    runId,
  );
}

Deno.test("start: the ids queue under their caller; a second start by another user adds to the live run under that user, an unclaimed row keeping its queuer", async () => {
  await reset();
  await queue(["ind001", "ind002"], A);
  assertEquals(
    await queueHfaVerificationIndicators(db, ["ind003", "ind002", "nope"], B),
    { kind: "queued" },
  );
  assertEquals(await queueRows(), [
    ["ind001", A],
    ["ind002", A],
    ["ind003", B],
  ]);
  const state = await runState();
  assertEquals(state.status, "running");
  assertEquals(state.startedBy, A);
  assertEquals(state.pending, ["ind001", "ind002", "ind003"]);
});

Deno.test("start: refused while the run is stopping, which has dropped its unclaimed indicators", async () => {
  await reset();
  await queue(["ind001"], A);
  await stopHfaVerificationRun(db);
  const res = await startHfaVerificationRun(db, ["ind002"], B, async () => {});
  assert(!res.success);
  assertEquals(await queueRows(), []);
  assertEquals((await runState()).status, "stopping");
});

Deno.test("run: each call through the client built for its queuer, each answer saved under its queuer with its queue row gone and done moved, a null answer listed as not checked", async () => {
  await reset();
  const runId = await queue(["ind001", "ind002"], A);
  await queueHfaVerificationIndicators(db, ["ind003"], B);
  const model = stubModel({
    reply: (id) =>
      id === "ind003" ? { refusal: true } : {
        findings: [{
          rule: "category_fits",
          timePoint: null,
          message: `About ${id}.`,
          suggestion: null,
        }],
      },
  });
  await run(model, runId);
  assertEquals(model.built.sort(), [A, B]);
  assertEquals(
    model.calls.map((c) => [c.indicatorId, c.queuedBy]).sort(),
    [["ind001", A], ["ind002", A], ["ind003", B]],
  );
  assertEquals(await verifiedBy(), [["ind001", A], ["ind002", A]]);
  const rows = await getHfaVerification(db);
  assert(rows.success);
  assertEquals(
    rows.data.findings.map((f) => [f.indicatorId, f.message]).sort(),
    [["ind001", "About ind001."], ["ind002", "About ind002."]],
  );
  const state = await runState();
  assertEquals(state.status, "completed");
  assertEquals(state.done, 3);
  assertEquals(state.pending, []);
  assertEquals(state.notChecked, [
    { indicatorId: "ind003", stopReason: "refusal" },
  ]);
  assert(state.endedAt !== null);
});

Deno.test("run: an indicator queued again while its call is in flight is checked again after its answer, as its new queuer's", async () => {
  await reset();
  const runId = await queue(["ind001"], A);
  const model = stubModel({
    before: async (_id, callIndex) => {
      if (callIndex === 0) {
        assertEquals(
          await queueHfaVerificationIndicators(db, ["ind001"], B),
          { kind: "queued" },
        );
      }
    },
  });
  await run(model, runId);
  assertEquals(
    model.calls.map((c) => [c.indicatorId, c.queuedBy]),
    [["ind001", A], ["ind001", B]],
  );
  assertEquals(await verifiedBy(), [["ind001", B]]);
  const state = await runState();
  assertEquals(state.status, "completed");
  assertEquals(state.done, 2);
});

Deno.test("end: an indicator queued since the last claim keeps the run running, and the run then checks it", async () => {
  await reset();
  const runId = await queue(["ind001"], A);
  assertEquals(await endHfaVerificationRun(db, runId, undefined), false);
  const before = await runState();
  assertEquals(before.status, "running");
  assertEquals(before.pending, ["ind001"]);
  await run(stubModel({}), runId);
  const after = await runState();
  assertEquals(after.status, "completed");
  assertEquals(after.done, 1);
});

Deno.test("run: the first call goes alone, then four are in flight; after the stamp moves, one call goes alone before four resume", async () => {
  await reset();
  const runId = await queue(IDS, A);
  const model = stubModel({
    delayMs: () => 150,
    before: async (_id, callIndex) => {
      if (callIndex === 1) {
        await sleep(75);
        await db`
          UPDATE hfa_indicators SET updated_at = now()
          WHERE indicator_id = 'ind010'
        `;
      }
    },
  });
  await run(model, runId);
  assertEquals(
    model.calls.map((c) => c.inFlight),
    [1, 1, 2, 3, 4, 1, 1, 2, 3, 4],
  );
  assertEquals((await runState()).done, 10);
});

Deno.test("run: a 429 ends the run as an error with the response body's message; the answers in flight are saved and the queue emptied", async () => {
  await reset();
  const runId = await queue(IDS.slice(0, 6), A);
  const model = stubModel({
    before: async (id) => {
      if (id === "ind003") await until(() => model.active() === 4);
    },
    delayMs: (id) => id === "ind003" ? 0 : 100,
    reply: (id) =>
      id === "ind003"
        ? { rateLimit: "Rate limit: You have reached your daily limit." }
        : { findings: [] },
  });
  await run(model, runId);
  const state = await runState();
  assertEquals(state.status, "error");
  assertEquals(state.error, "Rate limit: You have reached your daily limit.");
  assertEquals(state.pending, []);
  assertEquals(state.done, 4);
  assertEquals(
    (await verifiedBy()).map(([id]) => id),
    ["ind001", "ind002", "ind004", "ind005"],
  );
});

Deno.test("run: a stop ends the run as stopped once the answers in flight are saved; nothing more is claimed", async () => {
  await reset();
  const runId = await queue(IDS.slice(0, 6), A);
  const model = stubModel({
    before: async (id) => {
      if (id === "ind003") {
        await until(() => model.active() === 4);
        await stopHfaVerificationRun(db);
      }
    },
    delayMs: () => 100,
  });
  await run(model, runId);
  const state = await runState();
  assertEquals(state.status, "stopped");
  assertEquals(state.pending, []);
  assertEquals(state.done, 5);
  assertEquals(model.calls.length, 5);
  assertEquals((await verifiedBy()).length, 5);
});

Deno.test("queue: a deleted indicator takes its queue row with it", async () => {
  await reset();
  await queue(["ind001", "gone"], A);
  await db`DELETE FROM hfa_indicators WHERE indicator_id = 'gone'`;
  assertEquals(await queueRows(), [["ind001", A]]);
});

Deno.test("startup: the stale marker ends a live run as an error and empties its queue", async () => {
  await reset();
  await queue(["ind001"], A);
  assertEquals(await markStaleHfaVerificationRuns(db), 1);
  const state = await runState();
  assertEquals(state.status, "error");
  assert(state.error !== null);
  assertEquals(state.pending, []);
  assertEquals(await markStaleHfaVerificationRuns(db), 0);
});

Deno.test("cleanup: drop the throwaway database", async () => {
  await db.end();
  await admin.unsafe(`DROP DATABASE IF EXISTS ${dbName} WITH (FORCE)`);
  await admin.end();
});
