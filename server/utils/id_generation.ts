import { customAlphabet } from "nanoid";
import type { Sql } from "postgres";

const alphabet = "23456789abcdefghjkmnpqrstuvwxyz";
const generateId = customAlphabet(alphabet, 3);

export async function generateUniqueDeckId(db: Sql): Promise<string> {
  const maxAttempts = 10;
  for (let i = 0; i < maxAttempts; i++) {
    const id = generateId();
    const existing = await db`SELECT 1 FROM slide_decks WHERE id = ${id}`;
    if (existing.length === 0) return id;
  }
  throw new Error("Failed to generate unique deck ID after 10 attempts");
}

export async function generateUniqueSlideId(db: Sql): Promise<string> {
  const maxAttempts = 10;
  for (let i = 0; i < maxAttempts; i++) {
    const id = generateId();
    const existing = await db`SELECT 1 FROM slides WHERE id = ${id}`;
    if (existing.length === 0) return id;
  }
  throw new Error("Failed to generate unique slide ID after 10 attempts");
}

export async function generateUniqueReportId(db: Sql): Promise<string> {
  const maxAttempts = 10;
  for (let i = 0; i < maxAttempts; i++) {
    const id = generateId();
    const existing = await db`SELECT 1 FROM reports WHERE id = ${id}`;
    if (existing.length === 0) return id;
  }
  throw new Error("Failed to generate unique report ID after 10 attempts");
}

export async function generateUniquePresentationObjectId(db: Sql): Promise<string> {
  const maxAttempts = 10;
  for (let i = 0; i < maxAttempts; i++) {
    const id = generateId();
    const existing = await db`SELECT 1 FROM presentation_objects WHERE id = ${id}`;
    if (existing.length === 0) return id;
  }
  throw new Error("Failed to generate unique presentation object ID after 10 attempts");
}

export async function generateUniqueDashboardId(db: Sql): Promise<string> {
  const maxAttempts = 10;
  for (let i = 0; i < maxAttempts; i++) {
    const id = generateId();
    const existing = await db`SELECT 1 FROM dashboards WHERE id = ${id}`;
    if (existing.length === 0) return id;
  }
  throw new Error("Failed to generate unique dashboard ID after 10 attempts");
}

export async function generateUniqueDashboardItemId(db: Sql): Promise<string> {
  const maxAttempts = 10;
  for (let i = 0; i < maxAttempts; i++) {
    const id = generateId();
    const existing = await db`SELECT 1 FROM dashboard_items WHERE id = ${id}`;
    if (existing.length === 0) return id;
  }
  throw new Error("Failed to generate unique dashboard item ID after 10 attempts");
}

export async function generateUniqueDashboardItemGroupId(
  db: Sql,
): Promise<string> {
  const maxAttempts = 10;
  for (let i = 0; i < maxAttempts; i++) {
    const id = generateId();
    const existing =
      await db`SELECT 1 FROM dashboard_item_groups WHERE id = ${id}`;
    if (existing.length === 0) return id;
  }
  throw new Error(
    "Failed to generate unique dashboard item group ID after 10 attempts",
  );
}
