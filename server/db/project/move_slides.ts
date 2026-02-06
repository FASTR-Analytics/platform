import { Sql } from "postgres";
import { APIResponseWithData, SlideWithMeta } from "lib";
import { DBSlide } from "./_project_database_types.ts";
import { tryCatchDatabaseAsync } from "../utils.ts";
import { getSlides } from "./slides.ts";

type MovePosition =
  | { after: string }
  | { before: string }
  | { toStart: true }
  | { toEnd: true };

export async function moveSlides(
  projectDb: Sql,
  deckId: string,
  slideIds: string[],
  position: MovePosition
): Promise<APIResponseWithData<{ slides: SlideWithMeta[]; lastUpdated: string }>> {
  return await tryCatchDatabaseAsync(async () => {
    const lastUpdated = new Date().toISOString();

    // Get all current slides
    const allSlidesRes = await getSlides(projectDb, deckId);
    if (!allSlidesRes.success) throw new Error("Failed to get slides");

    const allSlides = allSlidesRes.data;

    // Validate all slideIds exist
    const idsSet = new Set(slideIds);
    const missing = slideIds.filter(id => !allSlides.find(s => s.id === id));
    if (missing.length > 0) {
      throw new Error(`Slides not found: ${missing.join(', ')}`);
    }

    // Extract slides to move (in order they appear in slideIds)
    const slidesToMove = slideIds.map(id => allSlides.find(s => s.id === id)!);

    // Remove slides to move from list
    const remaining = allSlides.filter(s => !idsSet.has(s.id));

    // Find insertion index
    let insertIndex: number;

    if ("toStart" in position) {
      insertIndex = 0;
    } else if ("toEnd" in position) {
      insertIndex = remaining.length;
    } else if ("after" in position) {
      const targetIndex = remaining.findIndex(s => s.id === position.after);
      if (targetIndex === -1) throw new Error(`Target slide not found: ${position.after}`);
      insertIndex = targetIndex + 1;
    } else {
      // before
      const targetIndex = remaining.findIndex(s => s.id === position.before);
      if (targetIndex === -1) throw new Error(`Target slide not found: ${position.before}`);
      insertIndex = targetIndex;
    }

    // Insert slides at target position
    const reordered = [
      ...remaining.slice(0, insertIndex),
      ...slidesToMove,
      ...remaining.slice(insertIndex),
    ];

    // Update sort_order in DB
    await projectDb.begin(async (sql) => {
      for (let i = 0; i < reordered.length; i++) {
        await sql`
          UPDATE slides SET sort_order = ${(i + 1) * 10}
          WHERE id = ${reordered[i].id} AND slide_deck_id = ${deckId}
        `;
      }

      await sql`
        UPDATE slide_decks SET last_updated = ${lastUpdated}
        WHERE id = ${deckId}
      `;
    });

    // Return new order
    const result = await getSlides(projectDb, deckId);
    if (!result.success) {
      throw new Error("Failed to fetch reordered slides");
    }

    return { success: true, data: { slides: result.data, lastUpdated } };
  });
}
