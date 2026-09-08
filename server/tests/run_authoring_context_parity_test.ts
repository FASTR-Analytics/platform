// Parity pin for PLAN_PRODUCTS_RESTRUCTURE step 3: the run authoring context
// (the run-keyed replacement for the project's manifest projection) must
// equal what getProjectDetail builds for a project attached to the same run,
// modulo the HFA time points (instance T1, deliberately absent from the
// context) and key order.
//
// Runs against the dev database: it needs a pinned package and a ready
// project attached to it. Run alone with:
//   deno test -A --env-file server/tests/run_authoring_context_parity_test.ts

import { assertEquals } from "@std/assert";
import { getPgConnectionFromCacheOrNew } from "../db/mod.ts";
import { getPinnedRunId } from "../db/instance/run_generation.ts";
import { closeAllConnections } from "../db/postgres/connection_manager.ts";
import { getProjectDetail } from "../db/project/projects.ts";
import { buildRunAuthoringContext } from "../run_query/authoring_context.ts";
import { getRunManifestCached } from "../runs/manifest_cache.ts";

Deno.test("run authoring context equals getProjectDetail's manifest projection", async () => {
  const mainDb = getPgConnectionFromCacheOrNew("main", "READ_AND_WRITE");
  try {
    const pinRes = await getPinnedRunId(mainDb);
    if (!pinRes.success) throw new Error(pinRes.err);
    const runId = pinRes.data;
    if (runId === null) {
      throw new Error("The dev instance has no pinned package; pin one first.");
    }
    const project = (
      await mainDb<{ id: string }[]>`
SELECT id FROM projects
WHERE run_id = ${runId} AND status = 'ready' AND admin_area_2 IS NULL
ORDER BY label LIMIT 1
`
    ).at(0);
    if (project === undefined) {
      throw new Error("No ready national project is attached to the pin.");
    }
    const projectDb = getPgConnectionFromCacheOrNew(project.id, "READ_ONLY");
    const detailRes = await getProjectDetail(
      undefined,
      mainDb,
      projectDb,
      project.id,
    );
    if (!detailRes.success) throw new Error(detailRes.err);
    const detail = detailRes.data;
    const context = await buildRunAuthoringContext(
      await getRunManifestCached(runId),
    );
    const { timePoints: _timePoints, ...taxonomy } = detail.hfaTaxonomy;

    assertEquals(context.runId, runId);
    assertEquals(context.modules, detail.projectModules);
    assertEquals(context.metrics, detail.metrics);
    assertEquals(context.datasets, detail.projectDatasets);
    assertEquals(context.commonIndicators, detail.commonIndicators);
    assertEquals(context.icehIndicators, detail.icehIndicators);
    assertEquals(context.hfaTaxonomy, taxonomy);
  } finally {
    await closeAllConnections();
  }
});
