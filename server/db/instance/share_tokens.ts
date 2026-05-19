import { Sql } from "postgres";
import type { ShareTokenInfo } from "lib";

async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt, iterations: 100_000, hash: "SHA-256" },
    keyMaterial,
    256,
  );
  const saltB64 = btoa(String.fromCharCode(...salt));
  const hashB64 = btoa(String.fromCharCode(...new Uint8Array(bits)));
  return `${saltB64}:${hashB64}`;
}

async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [saltB64, hashB64] = stored.split(":");
  const salt = Uint8Array.from(atob(saltB64), (c) => c.charCodeAt(0));
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt, iterations: 100_000, hash: "SHA-256" },
    keyMaterial,
    256,
  );
  const hashB64_2 = btoa(String.fromCharCode(...new Uint8Array(bits)));
  return hashB64 === hashB64_2;
}

export async function createShareToken(
  mainDb: Sql,
  resourceType: string,
  resourceId: string,
  data: unknown,
  createdByEmail: string,
  slug: string | null,
  password: string | null,
): Promise<string> {
  const id = crypto.randomUUID();
  const token = crypto.randomUUID();
  const passwordHash = password ? await hashPassword(password) : null;
  await mainDb`
    INSERT INTO share_tokens (id, token, slug, password_hash, resource_type, resource_id, data, created_by_email)
    VALUES (${id}, ${token}, ${slug}, ${passwordHash}, ${resourceType}, ${resourceId}, ${JSON.stringify(data)}, ${createdByEmail})
  `;
  return token;
}

type ShareTokenResult =
  | { data: unknown }
  | { requiresPassword: true }
  | { wrongPassword: true }
  | null;

export async function getShareTokenData(
  mainDb: Sql,
  tokenOrSlug: string,
  password?: string,
): Promise<ShareTokenResult> {
  const rows = await mainDb<{ data: string; password_hash: string | null }[]>`
    SELECT data, password_hash FROM share_tokens
    WHERE token = ${tokenOrSlug} OR slug = ${tokenOrSlug}
  `;
  if (rows.length === 0) return null;

  const { data, password_hash } = rows[0];

  if (password_hash !== null) {
    if (!password) return { requiresPassword: true };
    const valid = await verifyPassword(password, password_hash);
    if (!valid) return { wrongPassword: true };
  }

  await mainDb`
    UPDATE share_tokens SET view_count = view_count + 1
    WHERE token = ${tokenOrSlug} OR slug = ${tokenOrSlug}
  `;

  return { data: JSON.parse(data) };
}

export async function listShareTokensForResource(
  mainDb: Sql,
  resourceType: string,
  resourceId: string,
): Promise<ShareTokenInfo[]> {
  const rows = await mainDb<{ token: string; slug: string | null; password_hash: string | null; created_at: string; view_count: number }[]>`
    SELECT token, slug, password_hash, created_at, view_count
    FROM share_tokens
    WHERE resource_type = ${resourceType} AND resource_id = ${resourceId}
    ORDER BY created_at DESC
  `;
  return rows.map((r) => ({
    token: r.token,
    slug: r.slug,
    hasPassword: r.password_hash !== null,
    createdAt: r.created_at,
    viewCount: r.view_count,
  }));
}

export async function listShareTokensForResources(
  mainDb: Sql,
  resourceType: string,
  resourceIds: string[],
): Promise<(ShareTokenInfo & { resourceId: string })[]> {
  if (resourceIds.length === 0) return [];
  const rows = await mainDb<{ resource_id: string; token: string; slug: string | null; password_hash: string | null; created_at: string; view_count: number }[]>`
    SELECT resource_id, token, slug, password_hash, created_at, view_count
    FROM share_tokens
    WHERE resource_type = ${resourceType} AND resource_id = ANY(${resourceIds})
    ORDER BY resource_id, created_at DESC
  `;
  return rows.map((r) => ({
    resourceId: r.resource_id,
    token: r.token,
    slug: r.slug,
    hasPassword: r.password_hash !== null,
    createdAt: r.created_at,
    viewCount: r.view_count,
  }));
}

export async function deleteShareToken(
  mainDb: Sql,
  token: string,
  createdByEmail: string,
): Promise<boolean> {
  const result = await mainDb`
    DELETE FROM share_tokens
    WHERE token = ${token} AND created_by_email = ${createdByEmail}
  `;
  return result.count > 0;
}
