import { Sql } from "postgres";
import type { CustomPrompt } from "lib";

type DBCustomPrompt = {
  id: string;
  name: string;
  content: string;
  category: string;
  scope: string;
  created_by: string;
  created_at: Date;
};

function fromDb(row: DBCustomPrompt): CustomPrompt {
  return {
    id: row.id,
    name: row.name,
    content: row.content,
    category: row.category,
    scope: row.scope as "user" | "country",
    createdBy: row.created_by,
    createdAt: row.created_at.toISOString(),
  };
}

export async function getCustomPromptsForUser(
  mainDb: Sql,
  userEmail: string,
): Promise<CustomPrompt[]> {
  const rows = await mainDb<DBCustomPrompt[]>`
    SELECT * FROM custom_prompts
    WHERE scope = 'country' OR (scope = 'user' AND created_by = ${userEmail})
    ORDER BY created_at DESC
  `;
  return rows.map(fromDb);
}

export async function createCustomPrompt(
  mainDb: Sql,
  data: {
    id: string;
    name: string;
    content: string;
    category: string;
    scope: "user" | "country";
    createdBy: string;
  },
): Promise<CustomPrompt> {
  const rows = await mainDb<DBCustomPrompt[]>`
    INSERT INTO custom_prompts (id, name, content, category, scope, created_by)
    VALUES (${data.id}, ${data.name}, ${data.content}, ${data.category}, ${data.scope}, ${data.createdBy})
    RETURNING *
  `;
  return fromDb(rows[0]);
}

export async function updateCustomPrompt(
  mainDb: Sql,
  id: string,
  userEmail: string,
  isAdmin: boolean,
  data: {
    name: string;
    content: string;
    category: string;
    scope: "user" | "country";
  },
): Promise<CustomPrompt | null> {
  const rows = await mainDb<DBCustomPrompt[]>`
    UPDATE custom_prompts
    SET name = ${data.name}, content = ${data.content}, category = ${data.category}, scope = ${data.scope}
    WHERE id = ${id}
      AND (created_by = ${userEmail} OR ${isAdmin})
    RETURNING *
  `;
  return rows[0] ? fromDb(rows[0]) : null;
}

export async function deleteCustomPrompt(
  mainDb: Sql,
  id: string,
  userEmail: string,
  isAdmin: boolean,
): Promise<boolean> {
  const rows = await mainDb<{ id: string }[]>`
    DELETE FROM custom_prompts
    WHERE id = ${id}
      AND (created_by = ${userEmail} OR ${isAdmin})
    RETURNING id
  `;
  return rows.length > 0;
}
