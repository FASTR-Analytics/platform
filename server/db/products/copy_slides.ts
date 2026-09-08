import { Sql } from "postgres";
import { type APIResponseWithData } from "lib";
import { tryCatchDatabaseAsync } from "../utils.ts";
import { touchProduct } from "./_product_row.ts";
import { mintSlideIds, reSequence } from "./slides.ts";

// The cross-deck reuse path: there is no figure library (D3), so copying
// slides between decks is how a figure gets reused. Slide configs, and so
// their FigureBundles, are copied VERBATIM: a copied figure keeps the
// (runId, adminArea2) pair it was resolved under and shows stale under the
// target whenever the two products' pairs differ (D4). Copies land at the end
// of the target deck, in the order requested. The source ids are scoped by
// the source product, so a slide id from a third deck is not found.
export async function copySlidesToSlideDeck(
  mainDb: Sql,
  args: { sourceProductId: string; slideIds: string[]; targetProductId: string },
): Promise<
  APIResponseWithData<{ newSlideIds: string[]; lastUpdated: string }>
> {
  return await tryCatchDatabaseAsync(async () => {
    const sourceRows = await mainDb<{ id: string; config: string }[]>`
      SELECT id, config FROM slides
      WHERE id = ANY(${args.slideIds}) AND slide_deck_id = ${args.sourceProductId}
    `;
    const configById = new Map(sourceRows.map((r) => [r.id, r.config]));
    const missing = args.slideIds.filter((id) => !configById.has(id));
    if (missing.length > 0) {
      throw new Error(`Slides not found: ${missing.join(", ")}`);
    }

    const maxResult = (
      await mainDb<{ max_sort_order: number | null }[]>`
        SELECT max(sort_order) AS max_sort_order FROM slides
        WHERE slide_deck_id = ${args.targetProductId}
      `
    ).at(0);
    const baseSortOrder = maxResult?.max_sort_order ?? 0;

    const lastUpdated = new Date().toISOString();
    const newSlideIds = await mintSlideIds(mainDb, args.slideIds.length);

    await mainDb.begin(async (sql) => {
      await touchProduct(sql, args.targetProductId, "slide_deck", lastUpdated);
      for (const [i, id] of args.slideIds.entries()) {
        await sql`
          INSERT INTO slides (id, slide_deck_id, sort_order, config, last_updated)
          VALUES (
            ${newSlideIds[i]},
            ${args.targetProductId},
            ${baseSortOrder + (i + 1) * 10},
            ${configById.get(id)!},
            ${lastUpdated}
          )
        `;
      }
      await reSequence(sql, args.targetProductId);
    });

    return { success: true, data: { newSlideIds, lastUpdated } };
  });
}
