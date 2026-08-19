import { Sql } from "postgres";
import {
  APIResponseWithData,
  parseJsonOrThrow,
  Slide,
  SlidePosition,
  SlideWithMeta,
  slideConfigSchema,
} from "lib";
import { tryCatchDatabaseAsync } from "../utils.ts";
import { generateUniqueSlideId } from "../../utils/id_generation.ts";

type DBSlide = {
  id: string;
  slide_deck_id: string;
  sort_order: number;
  config: string;
  last_updated: string;
};

// Get all slides for a deck (ordered)
export async function getSlides(
  mainDb: Sql,
  deckId: string
): Promise<APIResponseWithData<SlideWithMeta[]>> {
  return await tryCatchDatabaseAsync(async () => {
    const rawSlides = await mainDb<DBSlide[]>`
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
  mainDb: Sql,
  slideId: string
): Promise<APIResponseWithData<SlideWithMeta>> {
  return await tryCatchDatabaseAsync(async () => {
    const rawSlide = (
      await mainDb<DBSlide[]>`
        SELECT * FROM slides WHERE id = ${slideId}
      `
    ).at(0);

    if (!rawSlide) {
      throw new Error("No slide with this id");
    }

    // Get index by counting slides before this one
    const indexResult = (
      await mainDb<{ idx: number }[]>`
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
  mainDb: Sql,
  deckId: string,
  position: SlidePosition,
  slide: Slide
): Promise<APIResponseWithData<{ slideId: string; lastUpdated: string }>> {
  return await tryCatchDatabaseAsync(async () => {
    const slideId = await generateUniqueSlideId(mainDb);
    const lastUpdated = new Date().toISOString();

    let newSortOrder: number;

    if ("toEnd" in position) {
      const maxResult = (
        await mainDb<{ max_sort_order: number | null }[]>`
          SELECT max(sort_order) AS max_sort_order FROM slides
          WHERE slide_deck_id = ${deckId}
        `
      ).at(0);
      newSortOrder = (maxResult?.max_sort_order ?? 0) + 10;
    } else if ("toStart" in position) {
      const minResult = (
        await mainDb<{ min_sort_order: number | null }[]>`
          SELECT min(sort_order) AS min_sort_order FROM slides
          WHERE slide_deck_id = ${deckId}
        `
      ).at(0);
      newSortOrder = (minResult?.min_sort_order ?? 10) - 5;
    } else if ("after" in position) {
      const afterSlide = (
        await mainDb<{ sort_order: number }[]>`
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
        await mainDb<{ sort_order: number }[]>`
          SELECT sort_order FROM slides
          WHERE id = ${position.before} AND slide_deck_id = ${deckId}
        `
      ).at(0);
      if (!beforeSlide) {
        throw new Error(`Target slide not found: ${position.before}`);
      }
      newSortOrder = beforeSlide.sort_order - 5;
    }

    await mainDb.begin((sql) => [
      sql`
        INSERT INTO slides (id, slide_deck_id, sort_order, config, last_updated)
        VALUES (
          ${slideId},
          ${deckId},
          ${newSortOrder},
          ${JSON.stringify(slideConfigSchema.parse(slide))},
          ${lastUpdated}
        )
      `,
      sql`
        UPDATE products SET last_updated = ${lastUpdated}
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

// Update slide (also returns the deck id so callers can attribute the edit to
// the deck's version history without a second lookup)
export async function updateSlide(
  mainDb: Sql,
  slideId: string,
  slide: Slide,
  expectedLastUpdated: string | undefined,
  overwrite: boolean | undefined
): Promise<APIResponseWithData<{ lastUpdated: string; deckId: string }>> {
  return await tryCatchDatabaseAsync(async () => {
    // Get slide_deck_id and last_updated for conflict check
    const existingSlide = (
      await mainDb<{ slide_deck_id: string; last_updated: string }[]>`
        SELECT slide_deck_id, last_updated FROM slides WHERE id = ${slideId}
      `
    ).at(0);

    if (!existingSlide) {
      throw new Error("Slide not found");
    }

    // Check for conflict (unless user explicitly chose to overwrite)
    if (expectedLastUpdated && !overwrite && existingSlide.last_updated !== expectedLastUpdated) {
      return {
        success: false,
        err: "CONFLICT",
        data: {
          message: "This slide was modified by another user.",
          currentLastUpdated: existingSlide.last_updated,
        },
      };
    }

    const lastUpdated = new Date().toISOString();

    await mainDb.begin((sql) => [
      sql`
        UPDATE slides
        SET config = ${JSON.stringify(slideConfigSchema.parse(slide))}, last_updated = ${lastUpdated}
        WHERE id = ${slideId}
      `,
      sql`
        UPDATE products SET last_updated = ${lastUpdated}
        WHERE id = ${existingSlide.slide_deck_id}
      `,
    ]);

    return {
      success: true,
      data: { lastUpdated, deckId: existingSlide.slide_deck_id },
    };
  });
}

// Read the persisted Yjs CRDT state for a slide (collab rooms). Returns the
// base64 state only if it is CURRENT — i.e. crdt_state_last_updated matches the
// slide's last_updated; otherwise the slide was edited outside collab since the
// state was saved, so the room must re-seed from config instead.
export async function getSlideCrdtState(
  mainDb: Sql,
  slideId: string
): Promise<APIResponseWithData<{ state: string | null }>> {
  return await tryCatchDatabaseAsync(async () => {
    const row = (
      await mainDb<
        {
          crdt_state: string | null;
          crdt_state_last_updated: string | null;
          last_updated: string;
        }[]
      >`
        SELECT crdt_state, crdt_state_last_updated, last_updated
        FROM slides WHERE id = ${slideId}
      `
    ).at(0);

    if (!row) {
      throw new Error("No slide with this id");
    }

    const isCurrent = row.crdt_state !== null &&
      row.crdt_state_last_updated === row.last_updated;

    return { success: true, data: { state: isCurrent ? row.crdt_state : null } };
  });
}

// Collab checkpoint: persist the materialized slide config AND the Yjs CRDT
// state atomically (collab is authoritative, so this always overwrites — no
// conflict check). crdt_state_last_updated is stamped equal to the SLIDE's
// last_updated (the slide is the collab document; the deck product's stamp is
// bumped in the same transaction for the products list) so the state reads
// back as current until a non-collab edit bumps last_updated.
// Plain write — POLICY LIVES IN THE CALLER (the slide room's save closure in
// routes/instance/collab.ts): `slide` must already be schema-parsed,
// and `crdtTrusted` says whether the doc materializes to exactly `slide`.
// Untrusted → crdt_state_last_updated stamped NULL, so the next room open
// re-seeds from config instead of restoring a doc that disagrees with the row.
export async function saveSlideCheckpoint(
  mainDb: Sql,
  slideId: string,
  slide: Slide,
  crdtState: string,
  crdtTrusted: boolean,
): Promise<APIResponseWithData<{ lastUpdated: string }>> {
  return await tryCatchDatabaseAsync(async () => {
    const existing = (
      await mainDb<{ slide_deck_id: string }[]>`
        SELECT slide_deck_id FROM slides WHERE id = ${slideId}
      `
    ).at(0);

    if (!existing) {
      throw new Error("Slide not found");
    }

    const lastUpdated = new Date().toISOString();

    await mainDb.begin((sql) => [
      sql`
        UPDATE slides
        SET config = ${JSON.stringify(slide)},
            crdt_state = ${crdtState},
            crdt_state_last_updated = ${crdtTrusted ? lastUpdated : null},
            last_updated = ${lastUpdated}
        WHERE id = ${slideId}
      `,
      sql`
        UPDATE products SET last_updated = ${lastUpdated}
        WHERE id = ${existing.slide_deck_id}
      `,
    ]);

    return { success: true, data: { lastUpdated } };
  });
}

// Delete slides. Returns the ids ACTUALLY deleted — the delete is scoped to
// this deck, so a requested id that belongs to another deck (short nanoid ids
// get reused) is a no-op here and must not have its room closed or its removal
// attributed.
export async function deleteSlides(
  mainDb: Sql,
  deckId: string,
  slideIds: string[]
): Promise<APIResponseWithData<{ deletedIds: string[]; deletedCount: number }>> {
  return await tryCatchDatabaseAsync(async () => {
    const lastUpdated = new Date().toISOString();

    const deletedIds = await mainDb.begin(async (sql) => {
      const deleted = await sql<{ id: string }[]>`
        DELETE FROM slides
        WHERE slide_deck_id = ${deckId} AND id = ANY(${slideIds})
        RETURNING id
      `;
      await sql`
        UPDATE products SET last_updated = ${lastUpdated}
        WHERE id = ${deckId}
      `;
      await reSequence(sql, deckId);
      return deleted.map((r) => r.id);
    });

    return {
      success: true,
      data: { deletedIds, deletedCount: deletedIds.length },
    };
  });
}

// Duplicate slides
export async function duplicateSlides(
  mainDb: Sql,
  deckId: string,
  slideIds: string[]
): Promise<APIResponseWithData<{ newSlideIds: string[]; lastUpdated: string }>> {
  return await tryCatchDatabaseAsync(async () => {
    const lastUpdated = new Date().toISOString();
    const newSlideIds: string[] = [];

    // Fetch original slides
    const originalSlides = await mainDb<{ id: string; config: string; sort_order: number }[]>`
      SELECT id, config, sort_order FROM slides
      WHERE slide_deck_id = ${deckId} AND id = ANY(${slideIds})
      ORDER BY sort_order
    `;

    // Find the max sort_order among originals - all duplicates go after the last original
    const maxOriginalSortOrder = Math.max(...originalSlides.map(s => s.sort_order));

    // Shift all slides after the last original to make room for duplicates
    const numDuplicates = originalSlides.length;
    await mainDb`
      UPDATE slides
      SET sort_order = sort_order + ${numDuplicates * 10}
      WHERE slide_deck_id = ${deckId} AND sort_order > ${maxOriginalSortOrder}
    `;

    // Insert duplicates right after the last original
    for (let i = 0; i < originalSlides.length; i++) {
      const original = originalSlides[i];
      const newSlideId = await generateUniqueSlideId(mainDb);
      const newSortOrder = maxOriginalSortOrder + 1 + i;

      await mainDb`
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
    await mainDb.begin((sql) => [
      sql`
        UPDATE products SET last_updated = ${lastUpdated}
        WHERE id = ${deckId}
      `,
      reSequence(sql, deckId),
    ]);

    return { success: true, data: { newSlideIds, lastUpdated } };
  });
}

// Helper: resequence sort_order to avoid gaps
export function reSequence(sql: Sql, deckId: string) {
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
