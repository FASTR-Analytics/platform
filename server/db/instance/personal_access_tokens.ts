import { Sql } from "postgres";
import {
  APIResponseNoData,
  APIResponseWithData,
  PersonalAccessTokenSummary,
} from "lib";
import { tryCatchDatabaseAsync } from "./../utils.ts";

export const PAT_PREFIX = "fastr_pat_";

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

async function hashToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(token),
  );
  return toHex(new Uint8Array(digest));
}

type DBPersonalAccessToken = {
  id: number;
  user_email: string;
  label: string;
  created_at: Date;
  last_used_at: Date | null;
};

export async function createPersonalAccessToken(
  mainDb: Sql,
  userEmail: string,
  label: string,
): Promise<
  APIResponseWithData<{ token: string; pat: PersonalAccessTokenSummary }>
> {
  return await tryCatchDatabaseAsync(async () => {
    const bytes = new Uint8Array(24);
    crypto.getRandomValues(bytes);
    const token = `${PAT_PREFIX}${toHex(bytes)}`;
    const tokenHash = await hashToken(token);
    const row = (
      await mainDb<DBPersonalAccessToken[]>`
        INSERT INTO personal_access_tokens (user_email, label, token_hash)
        VALUES (${userEmail}, ${label}, ${tokenHash})
        RETURNING id, user_email, label, created_at, last_used_at
      `
    ).at(0);
    if (!row) {
      throw new Error("Failed to create personal access token");
    }
    return {
      success: true,
      data: {
        token,
        pat: {
          id: row.id,
          label: row.label,
          createdAt: row.created_at.toISOString(),
          lastUsedAt: null,
        },
      },
    };
  });
}

export async function listPersonalAccessTokens(
  mainDb: Sql,
  userEmail: string,
): Promise<APIResponseWithData<PersonalAccessTokenSummary[]>> {
  return await tryCatchDatabaseAsync(async () => {
    const rows = await mainDb<DBPersonalAccessToken[]>`
      SELECT id, user_email, label, created_at, last_used_at
      FROM personal_access_tokens
      WHERE user_email = ${userEmail}
      ORDER BY created_at DESC
    `;
    return {
      success: true,
      data: rows.map((row) => ({
        id: row.id,
        label: row.label,
        createdAt: row.created_at.toISOString(),
        lastUsedAt: row.last_used_at?.toISOString() ?? null,
      })),
    };
  });
}

export async function revokePersonalAccessToken(
  mainDb: Sql,
  userEmail: string,
  id: number,
): Promise<APIResponseNoData> {
  return await tryCatchDatabaseAsync(async () => {
    const rows = await mainDb`
      DELETE FROM personal_access_tokens
      WHERE id = ${id} AND user_email = ${userEmail}
      RETURNING id
    `;
    if (rows.length === 0) {
      throw new Error("No matching personal access token");
    }
    return { success: true };
  });
}

// Auth-path resolution: one round trip that both verifies the token and
// records its use. Returns null for an unknown/revoked token.
export async function resolvePersonalAccessTokenEmail(
  mainDb: Sql,
  token: string,
): Promise<string | null> {
  const tokenHash = await hashToken(token);
  const rows = await mainDb<{ user_email: string }[]>`
    UPDATE personal_access_tokens
    SET last_used_at = now()
    WHERE token_hash = ${tokenHash}
    RETURNING user_email
  `;
  return rows.at(0)?.user_email ?? null;
}
