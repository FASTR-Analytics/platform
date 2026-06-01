import { Sql } from "postgres";
import {
  APIResponseNoData,
  APIResponseWithData,
  Dashboard,
  DashboardCreate,
  DashboardDetail,
  DashboardItem,
  DashboardItemGroup,
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
import {
  DBDashboard,
  DBDashboardItem,
  DBDashboardItemGroup,
} from "./_project_database_types.ts";
import { tryCatchDatabaseAsync } from "../utils.ts";
import {
  generateUniqueDashboardId,
  generateUniqueDashboardItemId,
  generateUniqueDashboardItemGroupId,
} from "../../utils/id_generation.ts";

type GroupMemberInput = {
  replicantValue: string;
  label: string;
  figureBlock: FigureBlock;
};

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
    replicantGroupId: raw.replicant_group_id ?? undefined,
    replicantValue: raw.replicant_value ?? undefined,
  };
}

function mapDashboardItemGroup(raw: DBDashboardItemGroup): DashboardItemGroup {
  return {
    id: raw.id,
    dashboardId: raw.dashboard_id,
    label: raw.label,
    replicateBy: raw.replicate_by,
    defaultReplicantValue: raw.default_replicant_value ?? undefined,
    replicants: parseJsonOrThrow(raw.replicants) as {
      value: string;
      label: string;
    }[],
    geoData: raw.geo_data ? parseJsonOrThrow(raw.geo_data) : undefined,
    lastUpdated: raw.last_updated,
  };
}

async function loadDashboardItemGroups(
  projectDb: Sql,
  dashboardId: string,
): Promise<DashboardItemGroup[]> {
  const rows = await projectDb<DBDashboardItemGroup[]>`
    SELECT * FROM dashboard_item_groups WHERE dashboard_id = ${dashboardId}
  `;
  return rows.map(mapDashboardItemGroup);
}

export async function getAllDashboards(
  projectDb: Sql,
): Promise<APIResponseWithData<DashboardSummary[]>> {
  return await tryCatchDatabaseAsync(async () => {
    const rows = await projectDb<(DBDashboard & { item_count: number })[]>`
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
      groups: await loadDashboardItemGroups(projectDb, dashboardId),
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
      groups: await loadDashboardItemGroups(projectDb, row.id),
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
      return {
        success: false,
        err: "A dashboard with this slug already exists",
      };
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
        ${true},
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
        return {
          success: false,
          err: "A dashboard with this slug already exists",
        };
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

    const validatedFigureBlock = dashboardFigureBlockSchema.parse(
      item.figureBlock,
    );
    const geoData =
      item.geoData !== undefined ? JSON.stringify(item.geoData) : null;

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
  update: { label?: string; figureBlock?: FigureBlock; geoData?: unknown },
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
    const nextFigureBlock =
      update.figureBlock !== undefined
        ? JSON.stringify(dashboardFigureBlockSchema.parse(update.figureBlock))
        : current.figure_block;
    const nextGeoData =
      update.figureBlock !== undefined
        ? update.geoData !== undefined
          ? JSON.stringify(update.geoData)
          : null
        : current.geo_data;

    await projectDb.begin((sql) => [
      sql`
        UPDATE dashboard_items
        SET label = ${nextLabel},
            figure_block = ${nextFigureBlock},
            geo_data = ${nextGeoData},
            last_updated = ${now}
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

// ── Replicant groups ────────────────────────────────────────────────────────

// Add a replicated viz as ONE group: a group row + N member rows, contiguous
// sort_order, in a single transaction. Members store figure_block per replicant;
// the shared geojson lives once on the group (members' geo_data = NULL).
export async function addDashboardItemGroup(
  projectDb: Sql,
  dashboardId: string,
  input: {
    label: string;
    replicateBy: string;
    defaultReplicantValue?: string;
    replicants: { value: string; label: string }[];
    geoData?: unknown;
    members: GroupMemberInput[];
  },
): Promise<APIResponseWithData<{ groupId: string; lastUpdated: string }>> {
  return await tryCatchDatabaseAsync(async () => {
    const groupId = await generateUniqueDashboardItemGroupId(projectDb);
    const now = new Date().toISOString();

    const maxResult = (
      await projectDb<{ max_sort_order: number | null }[]>`
        SELECT max(sort_order) AS max_sort_order FROM dashboard_items
        WHERE dashboard_id = ${dashboardId}
      `
    ).at(0);
    const baseSort = maxResult?.max_sort_order ?? 0;

    const members = input.members.map((m) => ({
      replicantValue: m.replicantValue,
      label: m.label,
      figureBlockJson: JSON.stringify(
        dashboardFigureBlockSchema.parse(m.figureBlock),
      ),
    }));
    const memberIds: string[] = [];
    for (let i = 0; i < members.length; i++) {
      memberIds.push(await generateUniqueDashboardItemId(projectDb));
    }

    const groupGeoData =
      input.geoData !== undefined ? JSON.stringify(input.geoData) : null;
    const replicantsJson = JSON.stringify(input.replicants);

    await projectDb.begin(async (sql) => {
      await sql`
        INSERT INTO dashboard_item_groups (
          id, dashboard_id, label, replicate_by, default_replicant_value,
          replicants, geo_data, last_updated
        ) VALUES (
          ${groupId}, ${dashboardId}, ${input.label}, ${input.replicateBy},
          ${input.defaultReplicantValue ?? null}, ${replicantsJson},
          ${groupGeoData}, ${now}
        )
      `;
      for (let i = 0; i < members.length; i++) {
        await sql`
          INSERT INTO dashboard_items (
            id, dashboard_id, label, sort_order, figure_block, geo_data,
            last_updated, replicant_group_id, replicant_value
          ) VALUES (
            ${memberIds[i]}, ${dashboardId}, ${members[i].label},
            ${baseSort + 10 * (i + 1)}, ${members[i].figureBlockJson}, ${null},
            ${now}, ${groupId}, ${members[i].replicantValue}
          )
        `;
      }
      await sql`
        UPDATE dashboards SET updated_at = ${now}, last_updated = ${now}
        WHERE id = ${dashboardId}
      `;
      await reSequence(sql, dashboardId);
    });

    return { success: true, data: { groupId, lastUpdated: now } };
  });
}

// Delete a whole group: removing the group row cascades to its member items
// (FK ON DELETE CASCADE), then the remaining items are re-sequenced.
export async function deleteDashboardItemGroup(
  projectDb: Sql,
  dashboardId: string,
  groupId: string,
): Promise<APIResponseWithData<{ lastUpdated: string }>> {
  return await tryCatchDatabaseAsync(async () => {
    const now = new Date().toISOString();
    await projectDb.begin((sql) => [
      sql`
        DELETE FROM dashboard_item_groups
        WHERE id = ${groupId} AND dashboard_id = ${dashboardId}
      `,
      sql`
        UPDATE dashboards SET updated_at = ${now}, last_updated = ${now}
        WHERE id = ${dashboardId}
      `,
      reSequence(sql, dashboardId),
    ]);
    return { success: true, data: { lastUpdated: now } };
  });
}

// Update a group: rename, and/or re-resolve members (Switch/Edit). Member
// figure_blocks are updated in place matched by replicant_value (the replicant
// SET is assumed stable — v1 supports same-dimension switch/edit), so ids and
// ordering are untouched. The shared geojson is replaced when provided.
export async function updateDashboardItemGroup(
  projectDb: Sql,
  dashboardId: string,
  groupId: string,
  update: {
    label?: string;
    defaultReplicantValue?: string;
    replicants?: { value: string; label: string }[];
    geoData?: unknown;
    members?: { replicantValue: string; figureBlock: FigureBlock }[];
  },
): Promise<APIResponseWithData<{ lastUpdated: string }>> {
  return await tryCatchDatabaseAsync(async () => {
    const now = new Date().toISOString();
    const current = (
      await projectDb<DBDashboardItemGroup[]>`
        SELECT * FROM dashboard_item_groups
        WHERE id = ${groupId} AND dashboard_id = ${dashboardId}
      `
    ).at(0);
    if (!current) {
      throw new Error("Dashboard item group not found");
    }

    const nextLabel = update.label ?? current.label;
    const nextDefault =
      update.defaultReplicantValue !== undefined
        ? update.defaultReplicantValue
        : current.default_replicant_value;
    const nextReplicants =
      update.replicants !== undefined
        ? JSON.stringify(update.replicants)
        : current.replicants;
    const nextGeoData =
      update.geoData !== undefined
        ? JSON.stringify(update.geoData)
        : current.geo_data;

    const members =
      update.members?.map((m) => ({
        replicantValue: m.replicantValue,
        figureBlockJson: JSON.stringify(
          dashboardFigureBlockSchema.parse(m.figureBlock),
        ),
      })) ?? [];

    await projectDb.begin(async (sql) => {
      await sql`
        UPDATE dashboard_item_groups
        SET label = ${nextLabel},
            default_replicant_value = ${nextDefault},
            replicants = ${nextReplicants},
            geo_data = ${nextGeoData},
            last_updated = ${now}
        WHERE id = ${groupId}
      `;
      for (const m of members) {
        await sql`
          UPDATE dashboard_items
          SET figure_block = ${m.figureBlockJson}, last_updated = ${now}
          WHERE replicant_group_id = ${groupId}
            AND replicant_value = ${m.replicantValue}
        `;
      }
      await sql`
        UPDATE dashboards SET updated_at = ${now}, last_updated = ${now}
        WHERE id = ${dashboardId}
      `;
    });

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
