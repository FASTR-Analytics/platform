import { customAlphabet } from "nanoid";
import type { Sql } from "postgres";

// ONE generator length for every short id in the app (D14). 4 chars over this
// 31-char alphabet is 923,521 combinations, against a namespace of every row
// on the instance (3 chars would be 29,791).
// Existing 3-char ids are kept as they are — ids are never length-validated,
// and registry params stay z.string(), never z.uuid().
const alphabet = "23456789abcdefghjkmnpqrstuvwxyz";
const generateId = customAlphabet(alphabet, 4);

type IdTable = "products" | "slides";

// Table name is interpolated from the closed IdTable union (compile-time
// literals only), per the SYSTEM_02 SQL-safety rule; the id rides as a
// parameter.
async function generateUniqueIdForTable(
  db: Sql,
  table: IdTable,
): Promise<string> {
  const maxAttempts = 10;
  for (let i = 0; i < maxAttempts; i++) {
    const id = generateId();
    const existing = await db.unsafe(
      `SELECT 1 FROM ${table} WHERE id = $1`,
      [id],
    );
    if (existing.length === 0) return id;
  }
  throw new Error(
    `Failed to generate unique ${table} id after ${maxAttempts} attempts`,
  );
}

// Decks and reports share one id namespace — they are both rows in `products`.
export function generateUniqueProductId(db: Sql): Promise<string> {
  return generateUniqueIdForTable(db, "products");
}

export function generateUniqueSlideId(db: Sql): Promise<string> {
  return generateUniqueIdForTable(db, "slides");
}
