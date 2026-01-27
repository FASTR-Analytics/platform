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

export async function generateUniquePresentationObjectId(db: Sql): Promise<string> {
  const maxAttempts = 10;
  for (let i = 0; i < maxAttempts; i++) {
    const id = generateId();
    const existing = await db`SELECT 1 FROM presentation_objects WHERE id = ${id}`;
    if (existing.length === 0) return id;
  }
  throw new Error("Failed to generate unique presentation object ID after 10 attempts");
}
