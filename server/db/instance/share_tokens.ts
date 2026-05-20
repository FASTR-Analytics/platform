import { Sql } from "postgres";
import type { ShareTokenInfo } from "lib";

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
  await mainDb`
    INSERT INTO share_tokens (id, token, slug, password, resource_type, resource_id, data, created_by_email)
    VALUES (${id}, ${token}, ${slug}, ${password}, ${resourceType}, ${resourceId}, ${JSON.stringify(data)}, ${createdByEmail})
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
  const rows = await mainDb<{ data: string; password: string | null }[]>`
    SELECT data, password FROM share_tokens
    WHERE token = ${tokenOrSlug} OR slug = ${tokenOrSlug}
  `;
  if (rows.length === 0) return null;

  const { data, password: storedPassword } = rows[0];

  if (storedPassword !== null) {
    if (!password) return { requiresPassword: true };
    if (password !== storedPassword) return { wrongPassword: true };
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
  const rows = await mainDb<{ token: string; slug: string | null; password: string | null; created_at: string; view_count: number }[]>`
    SELECT token, slug, password, created_at, view_count
    FROM share_tokens
    WHERE resource_type = ${resourceType} AND resource_id = ${resourceId}
    ORDER BY created_at DESC
  `;
  return rows.map((r) => ({
    token: r.token,
    slug: r.slug,
    password: r.password,
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
  const rows = await mainDb<{ resource_id: string; token: string; slug: string | null; password: string | null; created_at: string; view_count: number }[]>`
    SELECT resource_id, token, slug, password, created_at, view_count
    FROM share_tokens
    WHERE resource_type = ${resourceType} AND resource_id = ANY(${resourceIds})
    ORDER BY resource_id, created_at DESC
  `;
  return rows.map((r) => ({
    resourceId: r.resource_id,
    token: r.token,
    slug: r.slug,
    password: r.password,
    createdAt: r.created_at,
    viewCount: r.view_count,
  }));
}

export async function updateShareToken(
  mainDb: Sql,
  token: string,
  slug: string | null,
  password: string | null,
): Promise<boolean> {
  const result = await mainDb`
    UPDATE share_tokens SET slug = ${slug}, password = ${password}
    WHERE token = ${token}
  `;
  return result.count > 0;
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
