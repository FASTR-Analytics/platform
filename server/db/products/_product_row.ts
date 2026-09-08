import { Sql } from "postgres";
import { type ProductType } from "lib";

/** LOAD-BEARING messages: version capture (NOT_FOUND_ERRORS in
 *  server/collab/version_capture.ts) matches them EXACTLY to tell "row is
 *  gone → drop the editing session" from "transient error → retry". Reword
 *  only in lockstep with that set. */
export const SLIDE_DECK_NOT_FOUND = "Slide deck not found";
export const REPORT_NOT_FOUND = "Report not found";

const NOT_FOUND_BY_TYPE: Record<ProductType, string> = {
  slide_deck: SLIDE_DECK_NOT_FOUND,
  report: REPORT_NOT_FOUND,
};

// The one registry write every detail mutation makes, first in its
// transaction: the stamp (and the label when the write carries one) lands
// only on a row of the writer's type, and a miss throws that type's
// not-found so the transaction rolls back with nothing visible. This is what
// turns a missing id, or a report id sent to a deck route, into a plain 404.
export async function touchProduct(
  sql: Sql,
  productId: string,
  type: ProductType,
  lastUpdated: string,
  label?: string,
): Promise<void> {
  const set = label === undefined
    ? { last_updated: lastUpdated }
    : { last_updated: lastUpdated, label };
  const rows = await sql`
    UPDATE products SET ${sql(set)}
    WHERE id = ${productId} AND type = ${type}
    RETURNING id
  `;
  if (rows.length === 0) {
    throw new Error(NOT_FOUND_BY_TYPE[type]);
  }
}
