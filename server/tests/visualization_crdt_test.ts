// The visualization doc (lib/collab/visualization_crdt.ts): a seeded doc
// materializes back to its bundle, a config edit reaches the bundle, a data
// push that differs only in `snapshotAt` writes nothing, and the report figure
// registry still round-trips through the shared figure-entry helpers. Then the
// room (server/collab/visualization_rooms.ts): an editor's edit relays to a
// peer and checkpoints, a viewer's is refused, and the checkpoint policy
// drops mid-edit transients instead of wedging.
//
//   deno test -A --env-file server/tests/visualization_crdt_test.ts

import { assert, assertEquals, assertThrows } from "@std/assert";
import * as Y from "yjs";
import {
  base64ToBytes,
  bytesToBase64,
  COLLAB_NO_EDIT_PERMISSION,
  type CollabServerMessage,
  DEFAULT_S_CONFIG,
  DEFAULT_T_CONFIG,
  type FigureBundle,
  findVisualizationConfigMap,
  materializeReport,
  materializeVisualization,
  presentationObjectConfigSchema,
  seedReportDoc,
  seedVisualizationDoc,
  syncFigureConfigField,
  syncVisualizationFigData,
  syncVisualizationToDoc,
  type VisualizationDocContent,
} from "lib";
import type { RoomConn } from "../collab/doc_rooms.ts";
import {
  applyVisualizationUpdate,
  flushVisualizationRoom,
  prepareVisualizationCheckpoint,
  subscribeVisualization,
  unsubscribeVisualization,
} from "../collab/visualization_rooms.ts";

const CONFIG = presentationObjectConfigSchema.parse({
  d: {
    type: "table",
    valuesDisDisplayOpt: "col",
    disaggregateBy: [{ disOpt: "admin_area_2", disDisplayOpt: "row" }],
    filterBy: [],
    periodFilter: { filterType: "last_n_months", nMonths: 12 },
  },
  s: DEFAULT_S_CONFIG,
  t: DEFAULT_T_CONFIG,
});

const BUNDLE: FigureBundle = {
  config: CONFIG,
  items: [{ admin_area_2: "Kano", value: 0.5 }],
  resultsValue: { formatAs: "percent", valueProps: ["value"] },
  indicatorMetadata: [],
  localization: {
    language: "en",
    calendar: "gregorian",
    countryIso3: "NGA",
    fiscalYear: "none",
  },
  metricId: "m1-01-01",
  scope: { definitionHash: "h", adminArea2: null },
  snapshotAt: "2026-10-21T00:00:00.000Z",
  provenance: { runId: "00000000-0000-4000-8000-000000000000" },
};

function seeded(): Y.Doc {
  const doc = new Y.Doc();
  seedVisualizationDoc(doc, { bundle: BUNDLE });
  return doc;
}

Deno.test("visualization doc: seed then materialize returns the bundle", () => {
  assertEquals(materializeVisualization(seeded()).bundle, BUNDLE);
});

Deno.test("visualization doc: an empty doc does not materialize", () => {
  assertThrows(() => materializeVisualization(new Y.Doc()));
});

Deno.test("visualization doc: a config edit in figConfig reaches the bundle", () => {
  const doc = seeded();
  const cfg = findVisualizationConfigMap(doc);
  if (cfg === undefined) throw new Error("no figConfig map");
  syncFigureConfigField(cfg, "d", "type", "chart");
  assertEquals(materializeVisualization(doc).bundle.config.d.type, "chart");
});

Deno.test("visualization doc: a data push differing only in snapshotAt writes nothing", () => {
  const doc = seeded();
  let updates = 0;
  doc.on("update", () => updates++);
  syncVisualizationFigData(doc, {
    ...BUNDLE,
    snapshotAt: "2026-10-22T00:00:00.000Z",
  });
  assertEquals(updates, 0);
  syncVisualizationFigData(doc, {
    ...BUNDLE,
    items: [{ admin_area_2: "Kano", value: 0.7 }],
    snapshotAt: "2026-10-22T00:00:00.000Z",
  });
  assertEquals(updates, 1);
  assertEquals(materializeVisualization(doc).bundle.items, [
    { admin_area_2: "Kano", value: 0.7 },
  ]);
});

Deno.test("visualization doc: a data push leaves the co-edited config alone", () => {
  const doc = seeded();
  const cfg = findVisualizationConfigMap(doc);
  if (cfg === undefined) throw new Error("no figConfig map");
  syncFigureConfigField(cfg, "d", "type", "chart");
  // A bundle resolved from the pre-edit config must not revert the edit.
  syncVisualizationFigData(doc, {
    ...BUNDLE,
    items: [{ admin_area_2: "Kano", value: 0.9 }],
  });
  assertEquals(materializeVisualization(doc).bundle.config.d.type, "chart");
});

Deno.test("visualization doc: a full sync is idempotent", () => {
  const doc = seeded();
  let updates = 0;
  doc.on("update", () => updates++);
  syncVisualizationToDoc(doc, { bundle: BUNDLE });
  syncVisualizationToDoc(doc, { bundle: structuredClone(BUNDLE) });
  syncVisualizationToDoc(doc, {
    bundle: { ...BUNDLE, snapshotAt: "2026-10-23T00:00:00.000Z" },
  });
  assertEquals(updates, 0);
  syncVisualizationToDoc(doc, {
    bundle: {
      ...BUNDLE,
      config: { ...BUNDLE.config, d: { ...BUNDLE.config.d, type: "chart" } },
    },
  });
  assertEquals(updates, 1);
  assertEquals(materializeVisualization(doc).bundle.config.d.type, "chart");
});

Deno.test("report doc: figures still round-trip through the shared entry helpers", () => {
  const doc = new Y.Doc();
  seedReportDoc(doc, {
    body: "x",
    figures: { f1: { type: "figure", bundle: BUNDLE }, f2: { type: "figure" } },
    images: {},
  });
  assertEquals(materializeReport(doc).figures, {
    f1: { type: "figure", bundle: BUNDLE },
    f2: { type: "figure" },
  });
});

Deno.test("checkpoint policy: valid is trusted, a mid-edit empty filter is dropped and untrusted, a corrupt bundle is permanent", () => {
  const ok = prepareVisualizationCheckpoint(BUNDLE);
  assert(!("permanent" in ok));
  assertEquals(ok.trusted, true);
  assertEquals(ok.stored, BUNDLE);

  const midEdit: FigureBundle = {
    ...BUNDLE,
    config: {
      ...CONFIG,
      d: {
        ...CONFIG.d,
        filterBy: [{ disOpt: "admin_area_2", values: [] }],
      },
    },
  };
  const dropped = prepareVisualizationCheckpoint(midEdit);
  assert(!("permanent" in dropped));
  assertEquals(dropped.trusted, false);
  assertEquals(dropped.stored.config.d.filterBy, []);

  const corrupt = prepareVisualizationCheckpoint({
    ...BUNDLE,
    items: "nope",
  } as unknown as FigureBundle);
  assert("permanent" in corrupt);
});

function conn(
  id: string,
  inbox: CollabServerMessage[],
  canEdit: boolean,
): RoomConn {
  return {
    connectionId: id,
    canEdit: () => canEdit,
    identity: { email: `${id}@example.org`, name: id },
    send: (m) => inbox.push(m),
    isLive: () => true,
  };
}

// A client doc as the browser holds it: empty, then the room's sync applied.
function clientDocFrom(inbox: CollabServerMessage[]): Y.Doc {
  const sync = inbox.find((m) => m.type === "visualization_sync");
  if (!sync || sync.type !== "visualization_sync") throw new Error("no sync");
  const doc = new Y.Doc();
  Y.applyUpdate(doc, base64ToBytes(sync.data.update));
  return doc;
}

// The update a client edit produces, as the session ships it.
function editAndEncode(doc: Y.Doc, edit: (doc: Y.Doc) => void): string {
  const before = Y.encodeStateVector(doc);
  edit(doc);
  return bytesToBase64(Y.encodeStateAsUpdate(doc, before));
}

Deno.test("visualization room: an editor's edit relays and checkpoints; a viewer's is refused", async () => {
  const saved: VisualizationDocContent[] = [];
  const deps = {
    load: () =>
      Promise.resolve({ content: { bundle: BUNDLE }, crdtState: null }),
    save: (content: VisualizationDocContent) => {
      saved.push(content);
      return Promise.resolve({
        ok: true as const,
        lastUpdated: new Date().toISOString(),
      });
    },
  };
  const id = `v-${crypto.randomUUID()}`;
  const inboxA: CollabServerMessage[] = [];
  const inboxB: CollabServerMessage[] = [];
  const inboxV: CollabServerMessage[] = [];
  const a = conn("a", inboxA, true);
  const b = conn("b", inboxB, true);
  const viewer = conn("viewer", inboxV, false);
  await subscribeVisualization(id, id, a, "", deps);
  await subscribeVisualization(id, id, b, "", deps);
  await subscribeVisualization(id, id, viewer, "", deps);

  // The editor changes the chart type: the peer gets the update, and the
  // checkpoint stores the bundle with the new config and the same data.
  const docA = clientDocFrom(inboxA);
  const update = editAndEncode(docA, (d) => {
    const cfg = findVisualizationConfigMap(d);
    if (cfg === undefined) throw new Error("no figConfig map");
    syncFigureConfigField(cfg, "d", "type", "chart");
  });
  const relayedBefore = inboxB.filter((m) => m.type === "visualization_update")
    .length;
  applyVisualizationUpdate(id, id, a, update);
  assertEquals(
    inboxB.filter((m) => m.type === "visualization_update").length,
    relayedBefore + 1,
  );
  assert(await flushVisualizationRoom(id, id));
  const last = saved.at(-1);
  assertEquals(last?.bundle.config.d.type, "chart");
  assertEquals(last?.bundle.items, BUNDLE.items);

  // The viewer's edit is refused with the shared non-fatal message and
  // reaches nobody.
  const docV = clientDocFrom(inboxV);
  const viewerUpdate = editAndEncode(docV, (d) => {
    const cfg = findVisualizationConfigMap(d);
    if (cfg === undefined) throw new Error("no figConfig map");
    syncFigureConfigField(cfg, "d", "type", "map");
  });
  const relayedAfter = inboxB.filter((m) => m.type === "visualization_update")
    .length;
  applyVisualizationUpdate(id, id, viewer, viewerUpdate);
  assertEquals(
    inboxB.filter((m) => m.type === "visualization_update").length,
    relayedAfter,
  );
  const refusal = inboxV.find((m) => m.type === "visualization_error");
  assert(
    refusal?.type === "visualization_error" &&
      refusal.data.message === COLLAB_NO_EDIT_PERMISSION &&
      !refusal.data.fatal,
    JSON.stringify(refusal),
  );

  // A data push that only restamps snapshotAt writes nothing to ship, so
  // the room stays clean.
  let docUpdates = 0;
  docA.on("update", () => docUpdates++);
  syncVisualizationFigData(docA, {
    ...BUNDLE,
    snapshotAt: "2026-10-30T00:00:00.000Z",
  });
  assertEquals(docUpdates, 0);
  const savesBefore = saved.length;
  assert(await flushVisualizationRoom(id, id));
  assertEquals(saved.length, savesBefore);

  for (const c of [a, b, viewer]) unsubscribeVisualization(id, id, c);
  for (let i = 0; i < 50; i++) await new Promise((r) => setTimeout(r, 20));
});
