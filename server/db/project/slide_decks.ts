import { Sql } from "postgres";
import { type APIResponseNoData, APIResponseWithData, SlideDeckSummary, SlideDeckDetail } from "lib";
import { DBSlideDeck } from "./_project_database_types.ts";
import { tryCatchDatabaseAsync } from "../utils.ts";
import { generateUniqueDeckId } from "../../utils/id_generation.ts";

export async function getAllSlideDecks(
  projectDb: Sql,
): Promise<APIResponseWithData<SlideDeckSummary[]>> {
  return await tryCatchDatabaseAsync(async () => {
    const decks = await projectDb<DBSlideDeck[]>`
      SELECT * FROM slide_decks ORDER BY last_updated DESC
    `;

    return {
      success: true,
      data: decks.map((d) => ({
        id: d.id,
        label: d.label,
      })),
    };
  });
}

export async function getSlideDeckDetail(
  projectDb: Sql,
  deckId: string,
): Promise<APIResponseWithData<SlideDeckDetail>> {
  return await tryCatchDatabaseAsync(async () => {
    const deck = (
      await projectDb<DBSlideDeck[]>`
        SELECT * FROM slide_decks WHERE id = ${deckId}
      `
    ).at(0);

    if (!deck) {
      throw new Error("Slide deck not found");
    }

    const slideIds = (
      await projectDb<{ id: string }[]>`
        SELECT id FROM slides WHERE slide_deck_id = ${deckId} ORDER BY sort_order
      `
    ).map((row) => row.id);

    return {
      success: true,
      data: {
        id: deck.id,
        label: deck.label,
        plan: deck.plan ?? "",
        slideIds,
        lastUpdated: deck.last_updated,
      },
    };
  });
}

export async function createSlideDeck(
  projectDb: Sql,
  label: string,
): Promise<APIResponseWithData<{ deckId: string; lastUpdated: string }>> {
  return await tryCatchDatabaseAsync(async () => {
    const deckId = await generateUniqueDeckId(projectDb);
    const lastUpdated = new Date().toISOString();

    await projectDb`
      INSERT INTO slide_decks (id, label, plan, last_updated)
      VALUES (${deckId}, ${label}, '', ${lastUpdated})
    `;

    return { success: true, data: { deckId, lastUpdated } };
  });
}

export async function updateSlideDeckLabel(
  projectDb: Sql,
  deckId: string,
  label: string,
): Promise<APIResponseWithData<{ lastUpdated: string }>> {
  return await tryCatchDatabaseAsync(async () => {
    const lastUpdated = new Date().toISOString();

    await projectDb`
      UPDATE slide_decks
      SET label = ${label}, last_updated = ${lastUpdated}
      WHERE id = ${deckId}
    `;

    return { success: true, data: { lastUpdated } };
  });
}

export async function updateSlideDeckPlan(
  projectDb: Sql,
  deckId: string,
  plan: string,
): Promise<APIResponseWithData<{ lastUpdated: string }>> {
  return await tryCatchDatabaseAsync(async () => {
    const lastUpdated = new Date().toISOString();

    await projectDb`
      UPDATE slide_decks
      SET plan = ${plan}, last_updated = ${lastUpdated}
      WHERE id = ${deckId}
    `;

    return { success: true, data: { lastUpdated } };
  });
}

export async function deleteSlideDeck(
  projectDb: Sql,
  deckId: string,
): Promise<APIResponseNoData> {
  return await tryCatchDatabaseAsync(async () => {
    await projectDb`
      DELETE FROM slide_decks WHERE id = ${deckId}
    `;

    return { success: true };
  });
}
