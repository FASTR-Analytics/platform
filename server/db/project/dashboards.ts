import { Sql } from "postgres";
import {
  APIResponseNoData,
  APIResponseWithData,
  Dashboard,
  DashboardCreate,
  DashboardDetail,
  DashboardItem,
  DashboardLayout,
  DashboardSummary,
  DashboardUpdate,
  FigureBlock,
  dashboardFigureBlockSchema,
  dashboardLayoutSchema,
  getStartingLayoutForDashboard,
  isValidDashboardSlug,
  parseJsonOrThrow,
} from "lib";
import { DBDashboard, DBDashboardItem } from "./_project_database_types.ts";
import { tryCatchDatabaseAsync } from "../utils.ts";
import {
  generateUniqueDashboardId,
  generateUniqueDashboardItemId,
} from "../../utils/id_generation.ts";

function parseLayout(raw: string | null | undefined): DashboardLayout {
  if (!raw) return getStartingLayoutForDashboard();
  return dashboardLayoutSchema.parse(parseJsonOrThrow(raw));
}

function parseFigureBlock(raw: string): FigureBlock {
  return dashboardFigureBlockSchema.parse(parseJsonOrThrow(raw)) as FigureBlock;
}

function mapDashboardItem(raw: DBDashboardItem): DashboardItem {
  return {
    id: raw.id,
    dashboardId: raw.dashboard_id,
    label: raw.label,
    sortOrder: raw.sort_order,
    figureBlock: parseFigureBlock(raw.figure_block),
    geoData: raw.geo_data ? parseJsonOrThrow(raw.geo_data) : undefined,
    lastUpdated: raw.last_updated,
  };
}

export async function getAllDashboards(
  projectDb: Sql,
): Promise<APIResponseWithData<DashboardSummary[]>> {
  return await tryCatchDatabaseAsync(async () => {
    const rows = await projectDb<
      (DBDashboard & { item_count: number })[]
    >`
      SELECT d.*,
        (SELECT count(*) FROM dashboard_items WHERE dashboard_id = d.id)::int AS item_count
      FROM dashboards d
      ORDER BY d.updated_at DESC
    `;
    return {
      success: true,
      data: rows.map<DashboardSummary>((d) => ({
        id: d.id,
        slug: d.slug,
        title: d.title,
        isPublic: d.is_public,
        itemCount: d.item_count,
        createdAt: d.created_at,
        updatedAt: d.updated_at,
      })),
    };
  });
}

export async function getDashboardDetail(
  projectDb: Sql,
  dashboardId: string,
): Promise<APIResponseWithData<DashboardDetail>> {
  return await tryCatchDatabaseAsync(async () => {
    const row = (
      await projectDb<DBDashboard[]>`
        SELECT * FROM dashboards WHERE id = ${dashboardId}
      `
    ).at(0);

    if (!row) {
      throw new Error("Dashboard not found");
    }

    const itemRows = await projectDb<DBDashboardItem[]>`
      SELECT * FROM dashboard_items
      WHERE dashboard_id = ${dashboardId}
      ORDER BY sort_order
    `;

    const data: Dashboard = {
      id: row.id,
      slug: row.slug,
      title: row.title,
      isPublic: row.is_public,
      layout: parseLayout(row.layout),
      items: itemRows.map(mapDashboardItem),
      createdByEmail: row.created_by_email,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };

    return { success: true, data };
  });
}

export async function getDashboardBySlug(
  projectDb: Sql,
  slug: string,
): Promise<APIResponseWithData<DashboardDetail | null>> {
  return await tryCatchDatabaseAsync(async () => {
    const row = (
      await projectDb<DBDashboard[]>`
        SELECT * FROM dashboards WHERE slug = ${slug}
      `
    ).at(0);

    if (!row) {
      return { success: true, data: null };
    }

    const itemRows = await projectDb<DBDashboardItem[]>`
      SELECT * FROM dashboard_items
      WHERE dashboard_id = ${row.id}
      ORDER BY sort_order
    `;

    const data: Dashboard = {
      id: row.id,
      slug: row.slug,
      title: row.title,
      isPublic: row.is_public,
      layout: parseLayout(row.layout),
      items: itemRows.map(mapDashboardItem),
      createdByEmail: row.created_by_email,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };

    return { success: true, data };
  });
}

export async function createDashboard(
  projectDb: Sql,
  create: DashboardCreate,
  createdByEmail: string,
): Promise<APIResponseWithData<{ dashboardId: string; lastUpdated: string }>> {
  return await tryCatchDatabaseAsync(async () => {
    if (!isValidDashboardSlug(create.slug)) {
      return { success: false, err: "Invalid slug format" };
    }
    const existing = await projectDb<{ id: string }[]>`
      SELECT id FROM dashboards WHERE slug = ${create.slug}
    `;
    if (existing.length > 0) {
      return { success: false, err: "A dashboard with this slug already exists" };
    }

    const dashboardId = await generateUniqueDashboardId(projectDb);
    const now = new Date().toISOString();
    const layout = create.layout ?? getStartingLayoutForDashboard();

    await projectDb`
      INSERT INTO dashboards (
        id, slug, title, is_public, layout,
        created_by_email, created_at, updated_at, last_updated
      ) VALUES (
        ${dashboardId},
        ${create.slug},
        ${create.title},
        ${false},
        ${JSON.stringify(dashboardLayoutSchema.parse(layout))},
        ${createdByEmail},
        ${now},
        ${now},
        ${now}
      )
    `;

    return { success: true, data: { dashboardId, lastUpdated: now } };
  });
}

export async function updateDashboard(
  projectDb: Sql,
  dashboardId: string,
  update: DashboardUpdate,
): Promise<APIResponseWithData<{ lastUpdated: string }>> {
  return await tryCatchDatabaseAsync(async () => {
    if (update.slug !== undefined && !isValidDashboardSlug(update.slug)) {
      return { success: false, err: "Invalid slug format" };
    }
    if (update.slug !== undefined) {
      const existing = await projectDb<{ id: string }[]>`
        SELECT id FROM dashboards WHERE slug = ${update.slug} AND id <> ${dashboardId}
      `;
      if (existing.length > 0) {
        return { success: false, err: "A dashboard with this slug already exists" };
      }
    }

    const now = new Date().toISOString();
    const current = (
      await projectDb<DBDashboard[]>`
        SELECT * FROM dashboards WHERE id = ${dashboardId}
      `
    ).at(0);
    if (!current) {
      throw new Error("Dashboard not found");
    }

    const nextTitle = update.title ?? current.title;
    const nextSlug = update.slug ?? current.slug;
    const nextIsPublic = update.isPublic ?? current.is_public;
    const nextLayout = update.layout
      ? JSON.stringify(dashboardLayoutSchema.parse(update.layout))
      : current.layout;

    await projectDb`
      UPDATE dashboards
      SET title = ${nextTitle},
          slug = ${nextSlug},
          is_public = ${nextIsPublic},
          layout = ${nextLayout},
          updated_at = ${now},
          last_updated = ${now}
      WHERE id = ${dashboardId}
    `;

    return { success: true, data: { lastUpdated: now } };
  });
}

export async function deleteDashboard(
  projectDb: Sql,
  dashboardId: string,
): Promise<APIResponseNoData> {
  return await tryCatchDatabaseAsync(async () => {
    await projectDb`DELETE FROM dashboards WHERE id = ${dashboardId}`;
    return { success: true };
  });
}

export async function addDashboardItem(
  projectDb: Sql,
  dashboardId: string,
  item: { label: string; figureBlock: FigureBlock; geoData?: unknown },
): Promise<APIResponseWithData<{ itemId: string; lastUpdated: string }>> {
  return await tryCatchDatabaseAsync(async () => {
    const itemId = await generateUniqueDashboardItemId(projectDb);
    const now = new Date().toISOString();

    const maxResult = (
      await projectDb<{ max_sort_order: number | null }[]>`
        SELECT max(sort_order) AS max_sort_order FROM dashboard_items
        WHERE dashboard_id = ${dashboardId}
      `
    ).at(0);
    const newSortOrder = (maxResult?.max_sort_order ?? 0) + 10;

    const validatedFigureBlock = dashboardFigureBlockSchema.parse(item.figureBlock);
    const geoData = item.geoData !== undefined ? JSON.stringify(item.geoData) : null;

    await projectDb.begin((sql) => [
      sql`
        INSERT INTO dashboard_items (
          id, dashboard_id, label, sort_order, figure_block, geo_data, last_updated
        ) VALUES (
          ${itemId},
          ${dashboardId},
          ${item.label},
          ${newSortOrder},
          ${JSON.stringify(validatedFigureBlock)},
          ${geoData},
          ${now}
        )
      `,
      sql`
        UPDATE dashboards
        SET updated_at = ${now}, last_updated = ${now}
        WHERE id = ${dashboardId}
      `,
    ]);

    return { success: true, data: { itemId, lastUpdated: now } };
  });
}

export async function updateDashboardItem(
  projectDb: Sql,
  dashboardId: string,
  itemId: string,
  update: { label?: string },
): Promise<APIResponseWithData<{ lastUpdated: string }>> {
  return await tryCatchDatabaseAsync(async () => {
    const now = new Date().toISOString();

    const current = (
      await projectDb<DBDashboardItem[]>`
        SELECT * FROM dashboard_items WHERE id = ${itemId} AND dashboard_id = ${dashboardId}
      `
    ).at(0);
    if (!current) {
      throw new Error("Dashboard item not found");
    }

    const nextLabel = update.label ?? current.label;

    await projectDb.begin((sql) => [
      sql`
        UPDATE dashboard_items
        SET label = ${nextLabel}, last_updated = ${now}
        WHERE id = ${itemId}
      `,
      sql`
        UPDATE dashboards
        SET updated_at = ${now}, last_updated = ${now}
        WHERE id = ${dashboardId}
      `,
    ]);

    return { success: true, data: { lastUpdated: now } };
  });
}

export async function deleteDashboardItem(
  projectDb: Sql,
  dashboardId: string,
  itemId: string,
): Promise<APIResponseWithData<{ lastUpdated: string }>> {
  return await tryCatchDatabaseAsync(async () => {
    const now = new Date().toISOString();

    await projectDb.begin((sql) => [
      sql`
        DELETE FROM dashboard_items
        WHERE id = ${itemId} AND dashboard_id = ${dashboardId}
      `,
      sql`
        UPDATE dashboards
        SET updated_at = ${now}, last_updated = ${now}
        WHERE id = ${dashboardId}
      `,
      reSequence(sql, dashboardId),
    ]);

    return { success: true, data: { lastUpdated: now } };
  });
}

export type DashboardItemPosition =
  | { after: string }
  | { before: string }
  | { toStart: true }
  | { toEnd: true };

export async function moveDashboardItems(
  projectDb: Sql,
  dashboardId: string,
  itemIds: string[],
  position: DashboardItemPosition,
): Promise<APIResponseWithData<{ lastUpdated: string }>> {
  return await tryCatchDatabaseAsync(async () => {
    const now = new Date().toISOString();

    let anchorSortOrder: number;

    if ("toEnd" in position) {
      const maxResult = (
        await projectDb<{ max_sort_order: number | null }[]>`
          SELECT max(sort_order) AS max_sort_order FROM dashboard_items
          WHERE dashboard_id = ${dashboardId} AND id <> ALL(${itemIds})
        `
      ).at(0);
      anchorSortOrder = (maxResult?.max_sort_order ?? 0) + 10;
    } else if ("toStart" in position) {
      const minResult = (
        await projectDb<{ min_sort_order: number | null }[]>`
          SELECT min(sort_order) AS min_sort_order FROM dashboard_items
          WHERE dashboard_id = ${dashboardId} AND id <> ALL(${itemIds})
        `
      ).at(0);
      anchorSortOrder = (minResult?.min_sort_order ?? 10) - 100;
    } else if ("after" in position) {
      const afterItem = (
        await projectDb<{ sort_order: number }[]>`
          SELECT sort_order FROM dashboard_items
          WHERE id = ${position.after} AND dashboard_id = ${dashboardId}
        `
      ).at(0);
      if (!afterItem) {
        throw new Error(`Target item not found: ${position.after}`);
      }
      anchorSortOrder = afterItem.sort_order + 1;
    } else {
      const beforeItem = (
        await projectDb<{ sort_order: number }[]>`
          SELECT sort_order FROM dashboard_items
          WHERE id = ${position.before} AND dashboard_id = ${dashboardId}
        `
      ).at(0);
      if (!beforeItem) {
        throw new Error(`Target item not found: ${position.before}`);
      }
      anchorSortOrder = beforeItem.sort_order - itemIds.length;
    }

    await projectDb.begin(async (sql) => {
      for (let i = 0; i < itemIds.length; i++) {
        await sql`
          UPDATE dashboard_items
          SET sort_order = ${anchorSortOrder + i}, last_updated = ${now}
          WHERE id = ${itemIds[i]} AND dashboard_id = ${dashboardId}
        `;
      }
      await sql`
        UPDATE dashboards
        SET updated_at = ${now}, last_updated = ${now}
        WHERE id = ${dashboardId}
      `;
      await reSequence(sql, dashboardId);
    });

    return { success: true, data: { lastUpdated: now } };
  });
}

function reSequence(sql: Sql, dashboardId: string) {
  return sql`
    WITH tmp as (
      SELECT id, ROW_NUMBER() OVER (ORDER BY sort_order) as rn FROM dashboard_items
      WHERE dashboard_id = ${dashboardId}
    )
    UPDATE dashboard_items SET sort_order = (
      SELECT ((rn) * 10) from tmp
      WHERE dashboard_items.id = tmp.id
    )
    WHERE dashboard_id = ${dashboardId}
  `;
}
