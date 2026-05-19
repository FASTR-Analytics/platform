import { Sql } from "postgres";
import type { ShareTokenInfo } from "lib";

export async function createShareToken(
  mainDb: Sql,
  resourceType: string,
  resourceId: string,
  data: unknown,
  createdByEmail: string,
  slug: string | null,
): Promise<string> {
  const id = crypto.randomUUID();
  const token = crypto.randomUUID();
  await mainDb`
    INSERT INTO share_tokens (id, token, slug, resource_type, resource_id, data, created_by_email)
    VALUES (${id}, ${token}, ${slug}, ${resourceType}, ${resourceId}, ${JSON.stringify(data)}, ${createdByEmail})
  `;
  return token;
}

export async function getShareTokenData(
  mainDb: Sql,
  tokenOrSlug: string,
): Promise<unknown | null> {
  const rows = await mainDb<{ data: string }[]>`
    UPDATE share_tokens
    SET view_count = view_count + 1
    WHERE token = ${tokenOrSlug} OR slug = ${tokenOrSlug}
    RETURNING data
  `;
  return rows.length > 0 ? JSON.parse(rows[0].data) : null;
}

export async function listShareTokensForResource(
  mainDb: Sql,
  resourceType: string,
  resourceId: string,
): Promise<ShareTokenInfo[]> {
  const rows = await mainDb<{ token: string; slug: string | null; created_at: string; view_count: number }[]>`
    SELECT token, slug, created_at, view_count
    FROM share_tokens
    WHERE resource_type = ${resourceType} AND resource_id = ${resourceId}
    ORDER BY created_at DESC
  `;
  return rows.map(r => ({
    token: r.token,
    slug: r.slug,
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
  const rows = await mainDb<{ resource_id: string; token: string; slug: string | null; created_at: string; view_count: number }[]>`
    SELECT resource_id, token, slug, created_at, view_count
    FROM share_tokens
    WHERE resource_type = ${resourceType} AND resource_id = ANY(${resourceIds})
    ORDER BY resource_id, created_at DESC
  `;
  return rows.map(r => ({
    resourceId: r.resource_id,
    token: r.token,
    slug: r.slug,
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
