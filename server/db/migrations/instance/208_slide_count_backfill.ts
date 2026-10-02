// Migration 208: fill slide_deck_versions.slide_count (added by 207) for the
// versions that exist, by parsing each one's stored slides. Read in batches,
// since a version's slides text can be large.

import type { Sql } from "postgres";

const BATCH_SIZE = 50;

export async function backfillSlideCounts(tx: Sql): Promise<void> {
  const pending = await tx<{ id: string }[]>`
    SELECT id FROM slide_deck_versions WHERE slide_count IS NULL ORDER BY id
  `;
  for (let start = 0; start < pending.length; start += BATCH_SIZE) {
    const ids = pending.slice(start, start + BATCH_SIZE).map((row) => row.id);
    const rows = await tx<{ id: string; slides: string }[]>`
      SELECT id, slides FROM slide_deck_versions WHERE id = ANY(${ids})
    `;
    const counts = rows.map((row) => {
      const slides: unknown = JSON.parse(row.slides);
      if (!Array.isArray(slides)) {
        throw new Error(
          `slide_deck_versions ${row.id}: stored slides is not an array`,
        );
      }
      return slides.length;
    });
    await tx`
      UPDATE slide_deck_versions AS v
      SET slide_count = c.slide_count
      FROM unnest(
        ${rows.map((row) => row.id)}::text[],
        ${counts}::int[]
      ) AS c(id, slide_count)
      WHERE v.id = c.id
    `;
  }
}
