import { Sql } from "postgres";
import { type APIResponseWithData } from "lib";
import { tryCatchDatabaseAsync } from "../utils.ts";
import { generateUniqueSlideId } from "../../utils/id_generation.ts";
import { reSequence } from "./slides.ts";

// The cross-deck reuse path — there is no figure library (D3), so copying
// slides between decks is how a figure gets reused. The slide configs (and so
// their FigureBundles) are copied VERBATIM: a copied figure keeps the
// (runId, adminArea2) pair it was resolved under, so it shows as stale under
// the target whenever the two products' pairs differ (D4). Copies land at the
// end of the target deck, in the order they were requested.
export async function copySlidesToDeck(
  mainDb: Sql,
  args: { slideIds: string[]; targetDeckId: string },
): Promise<
  APIResponseWithData<{ newSlideIds: string[]; lastUpdated: string }>
> {
  return await tryCatchDatabaseAsync(async () => {
    const sourceRows = await mainDb<{ id: string; config: string }[]>`
      SELECT id, config FROM slides WHERE id = ANY(${args.slideIds})
    `;
    const configById = new Map(sourceRows.map((r) => [r.id, r.config]));
    const missing = args.slideIds.filter((id) => !configById.has(id));
    if (missing.length > 0) {
      throw new Error(`Slides not found: ${missing.join(", ")}`);
    }

    const maxResult = (
      await mainDb<{ max_sort_order: number | null }[]>`
        SELECT max(sort_order) AS max_sort_order FROM slides
        WHERE slide_deck_id = ${args.targetDeckId}
      `
    ).at(0);
    const baseSortOrder = maxResult?.max_sort_order ?? 0;

    const lastUpdated = new Date().toISOString();
    // generateUniqueSlideId only checks LIVE rows — none of this batch is
    // inserted yet, so also dedupe within the batch itself.
    const newSlideIds: string[] = [];
    const taken = new Set<string>();
    while (newSlideIds.length < args.slideIds.length) {
      const id = await generateUniqueSlideId(mainDb);
      if (taken.has(id)) {
        continue;
      }
      taken.add(id);
      newSlideIds.push(id);
    }

    await mainDb.begin((sql) => [
      ...args.slideIds.map((id, i) =>
        sql`
          INSERT INTO slides (id, slide_deck_id, sort_order, config, last_updated)
          VALUES (
            ${newSlideIds[i]},
            ${args.targetDeckId},
            ${baseSortOrder + (i + 1) * 10},
            ${configById.get(id)!},
            ${lastUpdated}
          )
        `
      ),
      sql`
        UPDATE products SET last_updated = ${lastUpdated}
        WHERE id = ${args.targetDeckId}
      `,
      reSequence(sql, args.targetDeckId),
    ]);

    return { success: true, data: { newSlideIds, lastUpdated } };
  });
}
