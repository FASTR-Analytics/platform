import { Sql } from "postgres";
import {
  APIResponseWithData,
  parseJsonOrThrow,
  Slide,
  SlidePosition,
  SlideWithMeta,
} from "lib";
import { DBSlide } from "./_project_database_types.ts";
import { tryCatchDatabaseAsync } from "../utils.ts";
import { generateUniqueSlideId } from "../../utils/id_generation.ts";

// Get all slides for a deck (ordered)
export async function getSlides(
  projectDb: Sql,
  deckId: string
): Promise<APIResponseWithData<SlideWithMeta[]>> {
  return await tryCatchDatabaseAsync(async () => {
    const rawSlides = await projectDb<DBSlide[]>`
      SELECT * FROM slides
      WHERE slide_deck_id = ${deckId}
      ORDER BY sort_order
    `;

    const slides: SlideWithMeta[] = rawSlides.map((raw, index) => ({
      id: raw.id,
      deckId: raw.slide_deck_id,
      index,
      slide: parseJsonOrThrow<Slide>(raw.config),
      lastUpdated: raw.last_updated,
    }));

    return { success: true, data: slides };
  });
}

// Get single slide
export async function getSlide(
  projectDb: Sql,
  slideId: string
): Promise<APIResponseWithData<SlideWithMeta>> {
  return await tryCatchDatabaseAsync(async () => {
    const rawSlide = (
      await projectDb<DBSlide[]>`
        SELECT * FROM slides WHERE id = ${slideId}
      `
    ).at(0);

    if (!rawSlide) {
      throw new Error("No slide with this id");
    }

    // Get index by counting slides before this one
    const indexResult = (
      await projectDb<{ idx: number }[]>`
        SELECT COUNT(*) as idx
        FROM slides
        WHERE slide_deck_id = ${rawSlide.slide_deck_id} AND sort_order < ${rawSlide.sort_order}
      `
    ).at(0);

    const slide: SlideWithMeta = {
      id: rawSlide.id,
      deckId: rawSlide.slide_deck_id,
      index: indexResult?.idx ?? 0,
      slide: parseJsonOrThrow<Slide>(rawSlide.config),
      lastUpdated: rawSlide.last_updated,
    };

    return { success: true, data: slide };
  });
}

// Create slide
export async function createSlide(
  projectDb: Sql,
  deckId: string,
  position: SlidePosition,
  slide: Slide
): Promise<APIResponseWithData<{ slideId: string; lastUpdated: string }>> {
  return await tryCatchDatabaseAsync(async () => {
    const slideId = await generateUniqueSlideId(projectDb);
    const lastUpdated = new Date().toISOString();

    let newSortOrder: number;

    if ("toEnd" in position) {
      const maxResult = (
        await projectDb<{ max_sort_order: number | null }[]>`
          SELECT max(sort_order) AS max_sort_order FROM slides
          WHERE slide_deck_id = ${deckId}
        `
      ).at(0);
      newSortOrder = (maxResult?.max_sort_order ?? 0) + 10;
    } else if ("toStart" in position) {
      const minResult = (
        await projectDb<{ min_sort_order: number | null }[]>`
          SELECT min(sort_order) AS min_sort_order FROM slides
          WHERE slide_deck_id = ${deckId}
        `
      ).at(0);
      newSortOrder = (minResult?.min_sort_order ?? 10) - 5;
    } else if ("after" in position) {
      const afterSlide = (
        await projectDb<{ sort_order: number }[]>`
          SELECT sort_order FROM slides
          WHERE id = ${position.after} AND slide_deck_id = ${deckId}
        `
      ).at(0);
      if (!afterSlide) {
        throw new Error(`Target slide not found: ${position.after}`);
      }
      newSortOrder = afterSlide.sort_order + 5;
    } else {
      // before
      const beforeSlide = (
        await projectDb<{ sort_order: number }[]>`
          SELECT sort_order FROM slides
          WHERE id = ${position.before} AND slide_deck_id = ${deckId}
        `
      ).at(0);
      if (!beforeSlide) {
        throw new Error(`Target slide not found: ${position.before}`);
      }
      newSortOrder = beforeSlide.sort_order - 5;
    }

    await projectDb.begin((sql) => [
      sql`
        INSERT INTO slides (id, slide_deck_id, sort_order, config, last_updated)
        VALUES (
          ${slideId},
          ${deckId},
          ${newSortOrder},
          ${JSON.stringify(slide)},
          ${lastUpdated}
        )
      `,
      sql`
        UPDATE slide_decks SET last_updated = ${lastUpdated}
        WHERE id = ${deckId}
      `,
      reSequence(sql, deckId),
    ]);

    return {
      success: true,
      data: { slideId, lastUpdated },
    };
  });
}

// Update slide
export async function updateSlide(
  projectDb: Sql,
  slideId: string,
  slide: Slide
): Promise<APIResponseWithData<{ lastUpdated: string }>> {
  return await tryCatchDatabaseAsync(async () => {
    const lastUpdated = new Date().toISOString();

    // Get slide_deck_id for updating report timestamp
    const existingSlide = (
      await projectDb<{ slide_deck_id: string }[]>`
        SELECT slide_deck_id FROM slides WHERE id = ${slideId}
      `
    ).at(0);

    if (!existingSlide) {
      throw new Error("Slide not found");
    }

    await projectDb.begin((sql) => [
      sql`
        UPDATE slides
        SET config = ${JSON.stringify(slide)}, last_updated = ${lastUpdated}
        WHERE id = ${slideId}
      `,
      sql`
        UPDATE slide_decks SET last_updated = ${lastUpdated}
        WHERE id = ${existingSlide.slide_deck_id}
      `,
    ]);

    return { success: true, data: { lastUpdated } };
  });
}

// Delete slides
export async function deleteSlides(
  projectDb: Sql,
  deckId: string,
  slideIds: string[]
): Promise<APIResponseWithData<{ deletedCount: number }>> {
  return await tryCatchDatabaseAsync(async () => {
    const lastUpdated = new Date().toISOString();

    await projectDb.begin((sql) => [
      sql`
        DELETE FROM slides
        WHERE slide_deck_id = ${deckId} AND id = ANY(${slideIds})
      `,
      sql`
        UPDATE slide_decks SET last_updated = ${lastUpdated}
        WHERE id = ${deckId}
      `,
      reSequence(sql, deckId),
    ]);

    return { success: true, data: { deletedCount: slideIds.length } };
  });
}

// Duplicate slides
export async function duplicateSlides(
  projectDb: Sql,
  deckId: string,
  slideIds: string[]
): Promise<APIResponseWithData<{ newSlideIds: string[]; lastUpdated: string }>> {
  return await tryCatchDatabaseAsync(async () => {
    const lastUpdated = new Date().toISOString();
    const newSlideIds: string[] = [];

    // Fetch original slides
    const originalSlides = await projectDb<{ id: string; config: string; sort_order: number }[]>`
      SELECT id, config, sort_order FROM slides
      WHERE slide_deck_id = ${deckId} AND id = ANY(${slideIds})
      ORDER BY sort_order
    `;

    // Find the max sort_order among originals - all duplicates go after the last original
    const maxOriginalSortOrder = Math.max(...originalSlides.map(s => s.sort_order));

    // Shift all slides after the last original to make room for duplicates
    const numDuplicates = originalSlides.length;
    await projectDb`
      UPDATE slides
      SET sort_order = sort_order + ${numDuplicates * 10}
      WHERE slide_deck_id = ${deckId} AND sort_order > ${maxOriginalSortOrder}
    `;

    // Insert duplicates right after the last original
    for (let i = 0; i < originalSlides.length; i++) {
      const original = originalSlides[i];
      const newSlideId = await generateUniqueSlideId(projectDb);
      const newSortOrder = maxOriginalSortOrder + 1 + i;

      await projectDb`
        INSERT INTO slides (id, slide_deck_id, sort_order, config, last_updated)
        VALUES (
          ${newSlideId},
          ${deckId},
          ${newSortOrder},
          ${original.config},
          ${lastUpdated}
        )
      `;

      newSlideIds.push(newSlideId);
    }

    // Update deck and resequence
    await projectDb.begin((sql) => [
      sql`
        UPDATE slide_decks SET last_updated = ${lastUpdated}
        WHERE id = ${deckId}
      `,
      reSequence(sql, deckId),
    ]);

    return { success: true, data: { newSlideIds, lastUpdated } };
  });
}

// Helper: resequence sort_order to avoid gaps
function reSequence(sql: Sql, deckId: string) {
  return sql`
    WITH tmp as (
      SELECT id, ROW_NUMBER() OVER (ORDER BY sort_order) as rn FROM slides
      WHERE slide_deck_id = ${deckId}
    )
    UPDATE slides SET sort_order = (
      SELECT ((rn) * 10) from tmp
      WHERE slides.id = tmp.id
    )
    WHERE slide_deck_id = ${deckId}
  `;
}
