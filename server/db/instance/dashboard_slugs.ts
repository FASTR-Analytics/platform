import { Sql } from "postgres";

export type DashboardSlugLocation = {
  projectId: string;
  dashboardId: string;
};

// Resolve a public slug to the project + dashboard it points at (the only thing
// the bare /d/:slug public route has to go on).
export async function resolveDashboardSlug(
  mainDb: Sql,
  slug: string,
): Promise<DashboardSlugLocation | null> {
  const row = (
    await mainDb<{ project_id: string; dashboard_id: string }[]>`
      SELECT project_id, dashboard_id FROM dashboard_slugs WHERE slug = ${slug}
    `
  ).at(0);
  if (!row) return null;
  return { projectId: row.project_id, dashboardId: row.dashboard_id };
}

// dashboard_id → slug for every dashboard in a project (slug is no longer stored
// in the project DB, so the list/detail views enrich from here).
export async function getDashboardSlugsForProject(
  mainDb: Sql,
  projectId: string,
): Promise<Map<string, string>> {
  const rows = await mainDb<{ dashboard_id: string; slug: string }[]>`
    SELECT dashboard_id, slug FROM dashboard_slugs WHERE project_id = ${projectId}
  `;
  return new Map(rows.map((r) => [r.dashboard_id, r.slug]));
}

export async function getDashboardSlug(
  mainDb: Sql,
  projectId: string,
  dashboardId: string,
): Promise<string | null> {
  const row = (
    await mainDb<{ slug: string }[]>`
      SELECT slug FROM dashboard_slugs
      WHERE project_id = ${projectId} AND dashboard_id = ${dashboardId}
    `
  ).at(0);
  return row?.slug ?? null;
}

// Globally unique check, optionally ignoring the dashboard that owns the slug
// (so a no-op rename of an existing dashboard doesn't collide with itself).
export async function isDashboardSlugTaken(
  mainDb: Sql,
  slug: string,
  exclude?: DashboardSlugLocation,
): Promise<boolean> {
  const row = (
    await mainDb<{ project_id: string; dashboard_id: string }[]>`
      SELECT project_id, dashboard_id FROM dashboard_slugs WHERE slug = ${slug}
    `
  ).at(0);
  if (!row) return false;
  if (
    exclude &&
    row.project_id === exclude.projectId &&
    row.dashboard_id === exclude.dashboardId
  ) {
    return false;
  }
  return true;
}

export async function insertDashboardSlug(
  mainDb: Sql,
  slug: string,
  projectId: string,
  dashboardId: string,
): Promise<void> {
  await mainDb`
    INSERT INTO dashboard_slugs (slug, project_id, dashboard_id)
    VALUES (${slug}, ${projectId}, ${dashboardId})
  `;
}

export async function updateDashboardSlug(
  mainDb: Sql,
  projectId: string,
  dashboardId: string,
  slug: string,
): Promise<void> {
  await mainDb`
    UPDATE dashboard_slugs SET slug = ${slug}
    WHERE project_id = ${projectId} AND dashboard_id = ${dashboardId}
  `;
}

export async function deleteDashboardSlug(
  mainDb: Sql,
  projectId: string,
  dashboardId: string,
): Promise<void> {
  await mainDb`
    DELETE FROM dashboard_slugs
    WHERE project_id = ${projectId} AND dashboard_id = ${dashboardId}
  `;
}
