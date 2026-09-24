// The lineage epoch (crdt_util.ts) and the room path that carries it: a
// re-seeded room names a NEW lineage, a restored room keeps its own, and a
// client that merged the two would hold the body twice.
import { assert, assertEquals, assertNotEquals } from "@std/assert";
import * as Y from "yjs";
import {
  type CollabServerMessage,
  ensureDocEpoch,
  readDocEpoch,
  type ReportDocContent,
  seedReportDoc,
} from "../../lib/mod.ts";
import { subscribeReport, unsubscribeReport } from "../collab/report_rooms.ts";
import type { RoomConn } from "../collab/doc_rooms.ts";

Deno.test("ensureDocEpoch: assigned once, then stable, and carried by the doc's state", () => {
  const doc = new Y.Doc();
  assertEquals(readDocEpoch(doc), undefined);
  const first = ensureDocEpoch(doc);
  assert(first.assigned);
  assertEquals(first.epoch.length > 0, true);
  const again = ensureDocEpoch(doc);
  assertEquals(again, { epoch: first.epoch, assigned: false });
  const restored = new Y.Doc();
  Y.applyUpdate(restored, Y.encodeStateAsUpdate(doc));
  assertEquals(readDocEpoch(restored), first.epoch);
});

Deno.test("two seedings of the same body are two lineages: merged they double, adopted they do not", () => {
  const content: ReportDocContent = { body: "# Title\n\nOne body.", figures: {}, images: {} };
  const clientDoc = new Y.Doc();
  seedReportDoc(clientDoc, content);
  const reseededRoom = new Y.Doc();
  seedReportDoc(reseededRoom, content);
  assertNotEquals(ensureDocEpoch(clientDoc).epoch, ensureDocEpoch(reseededRoom).epoch);
  // What the old client code did on reconnect: merge the sync into its doc.
  const merged = new Y.Doc();
  Y.applyUpdate(merged, Y.encodeStateAsUpdate(clientDoc));
  Y.applyUpdate(merged, Y.encodeStateAsUpdate(reseededRoom));
  assertEquals(merged.getText("body").toString().length, content.body.length * 2);
  // What it does now: a fresh doc with the server's sync applied.
  const adopted = new Y.Doc();
  Y.applyUpdate(adopted, Y.encodeStateAsUpdate(reseededRoom));
  assertEquals(adopted.getText("body").toString(), content.body);
});

function conn(id: string, inbox: CollabServerMessage[]): RoomConn {
  return {
    connectionId: id,
    canEdit: true,
    identity: { email: `${id}@example.org`, name: id },
    send: (m) => inbox.push(m),
    isLive: () => true,
  };
}

function syncEpoch(inbox: CollabServerMessage[]): string | undefined {
  const m = inbox.find((x) => x.type === "report_sync");
  return m && m.type === "report_sync" ? m.data.epoch : undefined;
}

Deno.test("report room: a restored room keeps its epoch, a re-seeded room names a new one", async () => {
  const content: ReportDocContent = { body: "Body text.", figures: {}, images: {} };
  let stored: string | null = null;
  const deps = (crdtState: () => string | null) => ({
    load: () => Promise.resolve({ content, crdtState: crdtState() }),
    save: (_c: ReportDocContent, state: string) => {
      stored = state;
      return Promise.resolve({ ok: true as const, lastUpdated: new Date().toISOString() });
    },
  });
  const reportId = `r-${crypto.randomUUID()}`;
  // First open: no stored state, the room seeds and assigns an epoch.
  const inboxA: CollabServerMessage[] = [];
  const a = conn("a", inboxA);
  await subscribeReport(reportId, reportId, a, "", deps(() => null));
  const epoch1 = syncEpoch(inboxA);
  assert(epoch1 !== undefined);
  // Leaving finalizes: the seeded doc (epoch included) is checkpointed.
  unsubscribeReport(reportId, reportId, a);
  for (let i = 0; i < 50 && stored === null; i++) {
    await new Promise((r) => setTimeout(r, 20));
  }
  assert(stored !== null, "final checkpoint persisted the seeded doc");
  // Restore from that state: the same lineage.
  const inboxB: CollabServerMessage[] = [];
  const b = conn("b", inboxB);
  await subscribeReport(reportId, reportId, b, "", deps(() => stored));
  assertEquals(syncEpoch(inboxB), epoch1);
  unsubscribeReport(reportId, reportId, b);
  for (let i = 0; i < 50; i++) await new Promise((r) => setTimeout(r, 20));
  // A stale stored state (a non-collab write bumped the product): re-seed,
  // and the sync says so with a different epoch.
  const inboxC: CollabServerMessage[] = [];
  const c = conn("c", inboxC);
  await subscribeReport(reportId, reportId, c, "", deps(() => null));
  const epoch3 = syncEpoch(inboxC);
  assert(epoch3 !== undefined);
  assertNotEquals(epoch3, epoch1);
  unsubscribeReport(reportId, reportId, c);
  for (let i = 0; i < 50; i++) await new Promise((r) => setTimeout(r, 20));
});
