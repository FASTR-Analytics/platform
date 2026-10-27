// Migration 222: fill visualizations.resolved_run_id and
// resolved_definition_hash (added by 221) for the visualizations that exist,
// by parsing each stored bundle. Read in batches, since a bundle carries its
// query rows and can be large.

import type { Sql } from "postgres";

const BATCH_SIZE = 50;

export async function backfillVisualizationResolvedPair(
  tx: Sql,
): Promise<void> {
  const pending = await tx<{ id: string }[]>`
    SELECT id FROM visualizations
    WHERE resolved_run_id IS NULL OR resolved_definition_hash IS NULL
    ORDER BY id
  `;
  for (let start = 0; start < pending.length; start += BATCH_SIZE) {
    const ids = pending.slice(start, start + BATCH_SIZE).map((row) => row.id);
    const rows = await tx<{ id: string; bundle: string }[]>`
      SELECT id, bundle FROM visualizations WHERE id = ANY(${ids})
    `;
    const pairs = rows.map((row) => {
      const bundle = JSON.parse(row.bundle) as {
        provenance?: { runId?: unknown };
        scope?: { definitionHash?: unknown };
      };
      const runId = bundle.provenance?.runId;
      const hash = bundle.scope?.definitionHash;
      if (typeof runId !== "string" || typeof hash !== "string") {
        throw new Error(
          `visualizations ${row.id}: stored bundle has no provenance.runId or scope.definitionHash`,
        );
      }
      return { id: row.id, runId, hash };
    });
    await tx`
      UPDATE visualizations AS v
      SET resolved_run_id = c.run_id,
          resolved_definition_hash = c.definition_hash
      FROM unnest(
        ${pairs.map((p) => p.id)}::text[],
        ${pairs.map((p) => p.runId)}::text[],
        ${pairs.map((p) => p.hash)}::text[]
      ) AS c(id, run_id, definition_hash)
      WHERE v.id = c.id
    `;
  }
}
