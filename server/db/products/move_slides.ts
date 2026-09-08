import { Sql } from "postgres";
import { APIResponseWithData, SlidePosition, SlideWithMeta } from "lib";
import { tryCatchDatabaseAsync } from "../utils.ts";
import { touchProduct } from "./_product_row.ts";
import { getSlides } from "./slides.ts";

// Within-deck reorder only: the cross-deck path is copySlidesToSlideDeck.
export async function moveSlides(
  mainDb: Sql,
  productId: string,
  slideIds: string[],
  position: SlidePosition,
): Promise<
  APIResponseWithData<{ slides: SlideWithMeta[]; lastUpdated: string }>
> {
  return await tryCatchDatabaseAsync(async () => {
    const lastUpdated = new Date().toISOString();
    const allSlidesRes = await getSlides(mainDb, productId);
    if (!allSlidesRes.success) throw new Error(allSlidesRes.err);
    const allSlides = allSlidesRes.data;

    const byId = new Map(allSlides.map((s) => [s.id, s]));
    const missing = slideIds.filter((id) => !byId.has(id));
    if (missing.length > 0) {
      throw new Error(`Slides not found: ${missing.join(", ")}`);
    }
    const moving = new Set(slideIds);
    const remaining = allSlides.filter((s) => !moving.has(s.id));

    let insertIndex: number;
    if ("toStart" in position) {
      insertIndex = 0;
    } else if ("toEnd" in position) {
      insertIndex = remaining.length;
    } else {
      const anchorId = "after" in position ? position.after : position.before;
      const anchorIndex = remaining.findIndex((s) => s.id === anchorId);
      if (anchorIndex === -1) {
        throw new Error(`Target slide not found: ${anchorId}`);
      }
      insertIndex = "after" in position ? anchorIndex + 1 : anchorIndex;
    }

    const reordered = [
      ...remaining.slice(0, insertIndex),
      ...slideIds.map((id) => byId.get(id)!),
      ...remaining.slice(insertIndex),
    ];

    await mainDb.begin(async (sql) => {
      await touchProduct(sql, productId, "slide_deck", lastUpdated);
      for (const [i, s] of reordered.entries()) {
        await sql`
          UPDATE slides SET sort_order = ${(i + 1) * 10}
          WHERE id = ${s.id} AND slide_deck_id = ${productId}
        `;
      }
    });

    const result = await getSlides(mainDb, productId);
    if (!result.success) throw new Error(result.err);
    return { success: true, data: { slides: result.data, lastUpdated } };
  });
}
