import { customAlphabet } from "nanoid";
import type { Sql } from "postgres";

const alphabet = "23456789abcdefghjkmnpqrstuvwxyz";
const generateId = customAlphabet(alphabet, 3);

type IdTable =
  | "slide_decks"
  | "slides"
  | "reports"
  | "presentation_objects"
  | "dashboards"
  | "dashboard_items"
  | "dashboard_item_groups";

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

export function generateUniqueDeckId(db: Sql): Promise<string> {
  return generateUniqueIdForTable(db, "slide_decks");
}

export function generateUniqueSlideId(db: Sql): Promise<string> {
  return generateUniqueIdForTable(db, "slides");
}

export function generateUniqueReportId(db: Sql): Promise<string> {
  return generateUniqueIdForTable(db, "reports");
}

export function generateUniquePresentationObjectId(db: Sql): Promise<string> {
  return generateUniqueIdForTable(db, "presentation_objects");
}

export function generateUniqueDashboardId(db: Sql): Promise<string> {
  return generateUniqueIdForTable(db, "dashboards");
}

export function generateUniqueDashboardItemId(db: Sql): Promise<string> {
  return generateUniqueIdForTable(db, "dashboard_items");
}

export function generateUniqueDashboardItemGroupId(db: Sql): Promise<string> {
  return generateUniqueIdForTable(db, "dashboard_item_groups");
}
