// The runs_summary transform's families block on a throwaway database built
// from _main_database.sql on the dev postgres (the .env the test task loads),
// dropped afterwards: a run with a manifest takes its datasets' families in
// family order whatever its status, a failed run without one takes null, a
// ready run without one is left unstamped (its project keys still stripped),
// a stamped run is left, and a second pass changes nothing.
//
//   deno task test:files server/tests/runs_summary_families_test.ts

import { assert, assertEquals } from "@std/assert";
import type { Sql } from "postgres";
import { migrateRunsSummaries } from "../db/migrations/data_transforms/runs_summary.ts";
import { runDirPath, runManifestPath } from "../runs/run_paths.ts";
import { withSchemaDb } from "./_harness/route_app.ts";

const DB_PREFIX = "runs_summary_families_test_";

const READY_WITH_MANIFEST = crypto.randomUUID();
const FAILED_WITH_MANIFEST = crypto.randomUUID();
const FAILED_WITHOUT_MANIFEST = crypto.randomUUID();
const READY_WITHOUT_MANIFEST = crypto.randomUUID();
const READY_WITHOUT_MANIFEST_PROJECT_KEYS = crypto.randomUUID();
const STAMPED = crypto.randomUUID();

const BASE = {
  manifestSchemaVersion: 13,
  provenance: "wizard",
  moduleIds: ["m001"],
  metricCount: 7,
  totalRowCount: 100,
  diskSizeBytes: 1000,
};
const UNSTAMPED_SUMMARY = JSON.stringify(BASE);
const PROJECT_KEYS_SUMMARY = JSON.stringify({
  ...BASE,
  backfillSourceProjectId: "p1",
  attachTargetProjectIds: ["p2"],
});
const STAMPED_SUMMARY = JSON.stringify({ ...BASE, families: ["hfa"] });

async function writeManifest(
  runId: string,
  datasetTypes: string[],
): Promise<string> {
  const dir = runDirPath(runId);
  await Deno.mkdir(dir, { recursive: true });
  await Deno.writeTextFile(
    runManifestPath(dir),
    JSON.stringify({
      datasets: datasetTypes.map((datasetType) => ({
        datasetType,
        lastUpdated: "t",
        info: {},
      })),
    }),
  );
  return dir;
}

async function summaryOf(
  db: Sql,
  runId: string,
): Promise<Record<string, unknown>> {
  const [row] = await db<{ summary: string }[]>`
    SELECT summary FROM runs WHERE id = ${runId}
  `;
  return JSON.parse(row.summary);
}

Deno.test("runs_summary stamps families from the manifest, by status without one", async () => {
  const dirs = [
    await writeManifest(READY_WITH_MANIFEST, ["iceh", "hmis"]),
    await writeManifest(FAILED_WITH_MANIFEST, ["hfa"]),
  ];
  try {
    await withSchemaDb(DB_PREFIX, async (db) => {
      await db`
        INSERT INTO runs (id, label, status, provenance, summary)
        VALUES
          (${READY_WITH_MANIFEST}, 'a', 'ready', 'wizard', ${UNSTAMPED_SUMMARY}),
          (${FAILED_WITH_MANIFEST}, 'b', 'failed', 'wizard', ${UNSTAMPED_SUMMARY}),
          (${FAILED_WITHOUT_MANIFEST}, 'c', 'failed', 'wizard', ${UNSTAMPED_SUMMARY}),
          (${READY_WITHOUT_MANIFEST}, 'd', 'ready', 'wizard', ${UNSTAMPED_SUMMARY}),
          (${READY_WITHOUT_MANIFEST_PROJECT_KEYS}, 'e', 'ready', 'wizard', ${PROJECT_KEYS_SUMMARY}),
          (${STAMPED}, 'f', 'ready', 'wizard', ${STAMPED_SUMMARY})
      `;

      const first = await db.begin((tx) => migrateRunsSummaries(tx));
      assertEquals(first, { rowsChecked: 6, rowsTransformed: 4 });
      assertEquals(
        (await summaryOf(db, READY_WITH_MANIFEST)).families,
        ["hmis", "iceh"],
      );
      assertEquals((await summaryOf(db, FAILED_WITH_MANIFEST)).families, [
        "hfa",
      ]);
      assertEquals(
        (await summaryOf(db, FAILED_WITHOUT_MANIFEST)).families,
        null,
      );
      assertEquals(await summaryOf(db, READY_WITHOUT_MANIFEST), BASE);
      const stripped = await summaryOf(db, READY_WITHOUT_MANIFEST_PROJECT_KEYS);
      assertEquals(stripped, BASE);
      assert(!("families" in stripped));
      assertEquals(await summaryOf(db, STAMPED), JSON.parse(STAMPED_SUMMARY));

      const second = await db.begin((tx) => migrateRunsSummaries(tx));
      assertEquals(second, { rowsChecked: 6, rowsTransformed: 0 });
    });
  } finally {
    for (const dir of dirs) {
      await Deno.remove(dir, { recursive: true });
    }
  }
});
