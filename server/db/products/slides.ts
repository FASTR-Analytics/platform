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
import { type DBSlide } from "../instance/_main_database_types.ts";
import { generateUniqueSlideId } from "../../utils/id_generation.ts";
import { touchProduct } from "./_product_row.ts";

// Every slide read and write is scoped by the owning product as well as the
// slide id, so a slide id from another deck is not found here (§3.3).
export const SLIDE_NOT_FOUND = "Slide not found";

function rowToSlide(raw: DBSlide, index: number): SlideWithMeta {
  return {
    id: raw.id,
    deckId: raw.slide_deck_id,
    index,
    slide: parseJsonOrThrow<Slide>(raw.config),
    lastUpdated: raw.last_updated,
  };
}

export async function getSlides(
  mainDb: Sql,
  productId: string,
): Promise<APIResponseWithData<SlideWithMeta[]>> {
  return await tryCatchDatabaseAsync(async () => {
    const rawSlides = await mainDb<DBSlide[]>`
      SELECT * FROM slides
      WHERE slide_deck_id = ${productId}
      ORDER BY sort_order
    `;
    return { success: true, data: rawSlides.map(rowToSlide) };
  });
}

// The instance-wide slide id to last_updated index for the SSE `starting`
// payload's `lastUpdated.slides`. Products need no equivalent: a product's
// stamp rides its own products_upserted summary, so the list IS the index.
export async function listSlideLastUpdated(
  mainDb: Sql,
): Promise<APIResponseWithData<Record<string, string>>> {
  return await tryCatchDatabaseAsync(async () => {
    const rows = await mainDb<{ id: string; last_updated: string }[]>`
      SELECT id, last_updated FROM slides
    `;
    const index: Record<string, string> = {};
    for (const row of rows) {
      index[row.id] = row.last_updated;
    }
    return { success: true, data: index };
  });
}

export async function getSlide(
  mainDb: Sql,
  productId: string,
  slideId: string,
): Promise<APIResponseWithData<SlideWithMeta>> {
  return await tryCatchDatabaseAsync(async () => {
    const rawSlide = (
      await mainDb<DBSlide[]>`
        SELECT * FROM slides
        WHERE id = ${slideId} AND slide_deck_id = ${productId}
      `
    ).at(0);
    if (!rawSlide) {
      throw new Error(SLIDE_NOT_FOUND);
    }
    const indexResult = (
      await mainDb<{ idx: number }[]>`
        SELECT COUNT(*)::int AS idx
        FROM slides
        WHERE slide_deck_id = ${productId} AND sort_order < ${rawSlide.sort_order}
      `
    ).at(0);
    return { success: true, data: rowToSlide(rawSlide, indexResult?.idx ?? 0) };
  });
}

export async function createSlide(
  mainDb: Sql,
  productId: string,
  position: SlidePosition,
  slide: Slide,
): Promise<APIResponseWithData<{ slideId: string; lastUpdated: string }>> {
  return await tryCatchDatabaseAsync(async () => {
    const slideId = await generateUniqueSlideId(mainDb);
    const lastUpdated = new Date().toISOString();

    let newSortOrder: number;
    if ("toEnd" in position) {
      const maxResult = (
        await mainDb<{ max_sort_order: number | null }[]>`
          SELECT max(sort_order) AS max_sort_order FROM slides
          WHERE slide_deck_id = ${productId}
        `
      ).at(0);
      newSortOrder = (maxResult?.max_sort_order ?? 0) + 10;
    } else if ("toStart" in position) {
      const minResult = (
        await mainDb<{ min_sort_order: number | null }[]>`
          SELECT min(sort_order) AS min_sort_order FROM slides
          WHERE slide_deck_id = ${productId}
        `
      ).at(0);
      newSortOrder = (minResult?.min_sort_order ?? 10) - 5;
    } else {
      const anchorId = "after" in position ? position.after : position.before;
      const anchor = (
        await mainDb<{ sort_order: number }[]>`
          SELECT sort_order FROM slides
          WHERE id = ${anchorId} AND slide_deck_id = ${productId}
        `
      ).at(0);
      if (!anchor) {
        throw new Error(`Target slide not found: ${anchorId}`);
      }
      newSortOrder = "after" in position
        ? anchor.sort_order + 5
        : anchor.sort_order - 5;
    }

    await mainDb.begin(async (sql) => {
      await touchProduct(sql, productId, "slide_deck", lastUpdated);
      await sql`
        INSERT INTO slides (id, slide_deck_id, sort_order, config, last_updated)
        VALUES (
          ${slideId},
          ${productId},
          ${newSortOrder},
          ${JSON.stringify(slideConfigSchema.parse(slide))},
          ${lastUpdated}
        )
      `;
      await reSequence(sql, productId);
    });

    return { success: true, data: { slideId, lastUpdated } };
  });
}

export async function updateSlide(
  mainDb: Sql,
  productId: string,
  slideId: string,
  slide: Slide,
  expectedLastUpdated: string | undefined,
  overwrite: boolean | undefined,
): Promise<APIResponseWithData<{ lastUpdated: string }>> {
  return await tryCatchDatabaseAsync(async () => {
    const existing = (
      await mainDb<{ last_updated: string }[]>`
        SELECT last_updated FROM slides
        WHERE id = ${slideId} AND slide_deck_id = ${productId}
      `
    ).at(0);
    if (!existing) {
      throw new Error(SLIDE_NOT_FOUND);
    }

    if (
      expectedLastUpdated && !overwrite &&
      existing.last_updated !== expectedLastUpdated
    ) {
      return {
        success: false,
        err: "CONFLICT",
        data: {
          message: "This slide was modified by another user.",
          currentLastUpdated: existing.last_updated,
        },
      };
    }

    const lastUpdated = new Date().toISOString();
    await mainDb.begin(async (sql) => {
      await touchProduct(sql, productId, "slide_deck", lastUpdated);
      await sql`
        UPDATE slides
        SET config = ${JSON.stringify(slideConfigSchema.parse(slide))}, last_updated = ${lastUpdated}
        WHERE id = ${slideId} AND slide_deck_id = ${productId}
      `;
    });

    return { success: true, data: { lastUpdated } };
  });
}

// The persisted Yjs CRDT state for a slide (collab rooms), current only while
// crdt_state_last_updated matches the slide's last_updated; otherwise the
// slide was edited outside collab since the state was saved, so the room
// must re-seed from config.
export async function getSlideCrdtState(
  mainDb: Sql,
  productId: string,
  slideId: string,
): Promise<APIResponseWithData<{ state: string | null }>> {
  return await tryCatchDatabaseAsync(async () => {
    const row = (
      await mainDb<
        Pick<DBSlide, "crdt_state" | "crdt_state_last_updated" | "last_updated">[]
      >`
        SELECT crdt_state, crdt_state_last_updated, last_updated
        FROM slides WHERE id = ${slideId} AND slide_deck_id = ${productId}
      `
    ).at(0);
    if (!row) {
      throw new Error(SLIDE_NOT_FOUND);
    }
    const isCurrent = row.crdt_state !== null &&
      row.crdt_state_last_updated === row.last_updated;
    return { success: true, data: { state: isCurrent ? row.crdt_state : null } };
  });
}

// Collab checkpoint: the materialized slide config AND the Yjs state in one
// transaction, always overwriting (collab is authoritative). The CRDT stamp
// equals the slide's last_updated, and the deck product's stamp is bumped in
// the same transaction for the products list. Policy lives in the caller
// (the slide room's save closure): `slide` is already schema-parsed, and
// `crdtTrusted` false stamps NULL so the next room open re-seeds from config.
export async function saveSlideCheckpoint(
  mainDb: Sql,
  productId: string,
  slideId: string,
  slide: Slide,
  crdtState: string,
  crdtTrusted: boolean,
): Promise<APIResponseWithData<{ lastUpdated: string }>> {
  return await tryCatchDatabaseAsync(async () => {
    const lastUpdated = new Date().toISOString();
    const updated = await mainDb.begin(async (sql) => {
      await touchProduct(sql, productId, "slide_deck", lastUpdated);
      const rows = await sql`
        UPDATE slides
        SET config = ${JSON.stringify(slide)},
            crdt_state = ${crdtState},
            crdt_state_last_updated = ${crdtTrusted ? lastUpdated : null},
            last_updated = ${lastUpdated}
        WHERE id = ${slideId} AND slide_deck_id = ${productId}
        RETURNING id
      `;
      return rows.length > 0;
    });
    if (!updated) {
      throw new Error(SLIDE_NOT_FOUND);
    }
    return { success: true, data: { lastUpdated } };
  });
}

// Returns the ids ACTUALLY deleted: the delete is scoped to this deck, so a
// requested id that belongs to another deck is a no-op here and must not
// have its room closed or its removal attributed.
export async function deleteSlides(
  mainDb: Sql,
  productId: string,
  slideIds: string[],
): Promise<
  APIResponseWithData<{ deletedIds: string[]; lastUpdated: string }>
> {
  return await tryCatchDatabaseAsync(async () => {
    const lastUpdated = new Date().toISOString();
    const deletedIds = await mainDb.begin(async (sql) => {
      await touchProduct(sql, productId, "slide_deck", lastUpdated);
      const deleted = await sql<{ id: string }[]>`
        DELETE FROM slides
        WHERE slide_deck_id = ${productId} AND id = ANY(${slideIds})
        RETURNING id
      `;
      await reSequence(sql, productId);
      return deleted.map((r) => r.id);
    });
    return { success: true, data: { deletedIds, lastUpdated } };
  });
}

// Copies land right after the last original, in one transaction.
export async function duplicateSlides(
  mainDb: Sql,
  productId: string,
  slideIds: string[],
): Promise<
  APIResponseWithData<{ newSlideIds: string[]; lastUpdated: string }>
> {
  return await tryCatchDatabaseAsync(async () => {
    const originals = await mainDb<
      { id: string; config: string; sort_order: number }[]
    >`
      SELECT id, config, sort_order FROM slides
      WHERE slide_deck_id = ${productId} AND id = ANY(${slideIds})
      ORDER BY sort_order
    `;
    if (originals.length === 0) {
      throw new Error(SLIDE_NOT_FOUND);
    }
    const lastUpdated = new Date().toISOString();
    const newSlideIds = await mintSlideIds(mainDb, originals.length);
    const maxOriginalSortOrder = Math.max(...originals.map((s) => s.sort_order));

    await mainDb.begin(async (sql) => {
      await touchProduct(sql, productId, "slide_deck", lastUpdated);
      await sql`
        UPDATE slides
        SET sort_order = sort_order + ${originals.length * 10}
        WHERE slide_deck_id = ${productId} AND sort_order > ${maxOriginalSortOrder}
      `;
      for (const [i, original] of originals.entries()) {
        await sql`
          INSERT INTO slides (id, slide_deck_id, sort_order, config, last_updated)
          VALUES (
            ${newSlideIds[i]},
            ${productId},
            ${maxOriginalSortOrder + 1 + i},
            ${original.config},
            ${lastUpdated}
          )
        `;
      }
      await reSequence(sql, productId);
    });

    return { success: true, data: { newSlideIds, lastUpdated } };
  });
}

// generateUniqueSlideId only checks LIVE rows, so a batch minted before its
// insert must also be deduped against itself.
export async function mintSlideIds(db: Sql, count: number): Promise<string[]> {
  const ids: string[] = [];
  const taken = new Set<string>();
  while (ids.length < count) {
    const id = await generateUniqueSlideId(db);
    if (taken.has(id)) {
      continue;
    }
    taken.add(id);
    ids.push(id);
  }
  return ids;
}

export function reSequence(sql: Sql, productId: string) {
  return sql`
    WITH tmp AS (
      SELECT id, ROW_NUMBER() OVER (ORDER BY sort_order) AS rn FROM slides
      WHERE slide_deck_id = ${productId}
    )
    UPDATE slides SET sort_order = (
      SELECT rn * 10 FROM tmp WHERE slides.id = tmp.id
    )
    WHERE slide_deck_id = ${productId}
  `;
}
