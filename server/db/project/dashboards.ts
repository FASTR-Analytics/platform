import { Sql } from "postgres";
import {
  APIResponseNoData,
  APIResponseWithData,
  Dashboard,
  DashboardConfig,
  DashboardCreate,
  DashboardDetail,
  DashboardItem,
  DashboardItemGroup,
  DashboardLayout,
  DashboardSummary,
  DashboardUpdate,
  FigureBlock,
  dashboardConfigSchema,
  dashboardFigureBlockSchema,
  dashboardLayoutSchema,
  getStartingDashboardConfig,
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
import {
  deleteDashboardSlug,
  getDashboardSlug,
  getDashboardSlugsForProject,
  insertDashboardSlug,
  isDashboardSlugTaken,
  updateDashboardSlug,
} from "../instance/dashboard_slugs.ts";

type GroupMemberInput = {
  replicantValue: string;
  label: string;
  figureBlock: FigureBlock;
};

function parseLayout(raw: string | null | undefined): DashboardLayout {
  if (!raw) return getStartingLayoutForDashboard();
  return dashboardLayoutSchema.parse(parseJsonOrThrow(raw));
}

function parseDashboardConfig(raw: string | null | undefined): DashboardConfig {
  if (!raw) return getStartingDashboardConfig();
  return dashboardConfigSchema.parse(parseJsonOrThrow(raw));
}

const STARTING_CONFIG_JSON = JSON.stringify(getStartingDashboardConfig());

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
  mainDb: Sql,
  projectId: string,
): Promise<APIResponseWithData<DashboardSummary[]>> {
  return await tryCatchDatabaseAsync(async () => {
    const rows = await projectDb<(DBDashboard & { item_count: number })[]>`
      SELECT d.*,
        (SELECT count(*) FROM dashboard_items WHERE dashboard_id = d.id)::int AS item_count
      FROM dashboards d
      ORDER BY d.updated_at DESC
    `;
    const slugs = await getDashboardSlugsForProject(mainDb, projectId);
    return {
      success: true,
      data: rows.map<DashboardSummary>((d) => ({
        id: d.id,
        slug: slugs.get(d.id) ?? "",
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
  mainDb: Sql,
  projectId: string,
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
      slug: (await getDashboardSlug(mainDb, projectId, dashboardId)) ?? "",
      title: row.title,
      isPublic: row.is_public,
      layout: parseLayout(row.layout),
      config: parseDashboardConfig(row.config),
      items: itemRows.map(mapDashboardItem),
      groups: await loadDashboardItemGroups(projectDb, dashboardId),
      createdByEmail: row.created_by_email,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };

    return { success: true, data };
  });
}

export async function createDashboard(
  projectDb: Sql,
  mainDb: Sql,
  projectId: string,
  create: DashboardCreate,
  createdByEmail: string,
): Promise<APIResponseWithData<{ dashboardId: string; lastUpdated: string }>> {
  return await tryCatchDatabaseAsync(async () => {
    if (!isValidDashboardSlug(create.slug)) {
      return { success: false, err: "Invalid slug format" };
    }
    if (await isDashboardSlugTaken(mainDb, create.slug)) {
      return {
        success: false,
        err: "A dashboard with this slug already exists",
      };
    }

    const dashboardId = await generateUniqueDashboardId(projectDb);
    const now = new Date().toISOString();
    const layout = create.layout ?? getStartingLayoutForDashboard();

    // Reserve the global slug first; if the project-side insert then fails,
    // release it so a slug never dangles without a dashboard.
    await insertDashboardSlug(mainDb, create.slug, projectId, dashboardId);
    try {
      await projectDb`
        INSERT INTO dashboards (
          id, title, is_public, layout, config,
          created_by_email, created_at, updated_at, last_updated
        ) VALUES (
          ${dashboardId},
          ${create.title},
          ${true},
          ${JSON.stringify(dashboardLayoutSchema.parse(layout))},
          ${STARTING_CONFIG_JSON},
          ${createdByEmail},
          ${now},
          ${now},
          ${now}
        )
      `;
    } catch (e) {
      await deleteDashboardSlug(mainDb, projectId, dashboardId);
      throw e;
    }

    return { success: true, data: { dashboardId, lastUpdated: now } };
  });
}

export async function updateDashboard(
  projectDb: Sql,
  mainDb: Sql,
  projectId: string,
  dashboardId: string,
  update: DashboardUpdate,
): Promise<APIResponseWithData<{ lastUpdated: string }>> {
  return await tryCatchDatabaseAsync(async () => {
    if (update.slug !== undefined && !isValidDashboardSlug(update.slug)) {
      return { success: false, err: "Invalid slug format" };
    }
    if (update.slug !== undefined) {
      const taken = await isDashboardSlugTaken(mainDb, update.slug, {
        projectId,
        dashboardId,
      });
      if (taken) {
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
    const nextIsPublic = update.isPublic ?? current.is_public;
    const nextLayout = update.layout
      ? JSON.stringify(dashboardLayoutSchema.parse(update.layout))
      : current.layout;
    const nextConfig = update.config
      ? JSON.stringify(dashboardConfigSchema.parse(update.config))
      : current.config;

    if (update.slug !== undefined) {
      await updateDashboardSlug(mainDb, projectId, dashboardId, update.slug);
    }

    await projectDb`
      UPDATE dashboards
      SET title = ${nextTitle},
          is_public = ${nextIsPublic},
          layout = ${nextLayout},
          config = ${nextConfig},
          updated_at = ${now},
          last_updated = ${now}
      WHERE id = ${dashboardId}
    `;

    return { success: true, data: { lastUpdated: now } };
  });
}

export async function deleteDashboard(
  projectDb: Sql,
  mainDb: Sql,
  projectId: string,
  dashboardId: string,
): Promise<APIResponseNoData> {
  return await tryCatchDatabaseAsync(async () => {
    await projectDb`DELETE FROM dashboards WHERE id = ${dashboardId}`;
    await deleteDashboardSlug(mainDb, projectId, dashboardId);
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

type ReplaceEntryOld =
  | { kind: "item"; itemId: string }
  | { kind: "group"; groupId: string };

type ReplaceEntryNew =
  | { kind: "item"; label: string; figureBlock: FigureBlock; geoData?: unknown }
  | {
      kind: "group";
      label: string;
      replicateBy: string;
      defaultReplicantValue?: string;
      replicants: { value: string; label: string }[];
      geoData?: unknown;
      members: GroupMemberInput[];
    };

// Replace one entry (item OR group) in place with a new entry of EITHER kind,
// preserving its sort position — the single primitive behind every structural
// reshape (item↔group, group→group with a changed dimension/set). Members are
// re-resolved upstream, so this swaps rows wholesale rather than diffing them.
// The insert is tie-free via the duplicateSlides hole-clear idiom (shift trailing
// rows by newCount*10 before inserting), because reSequence cannot break
// sort_order ties when the entry's row count changes (e.g. item→group is 1→N).
export async function replaceDashboardEntry(
  projectDb: Sql,
  dashboardId: string,
  input: { oldEntry: ReplaceEntryOld; newEntry: ReplaceEntryNew },
): Promise<APIResponseWithData<{ entryId: string; lastUpdated: string }>> {
  return await tryCatchDatabaseAsync(async () => {
    const now = new Date().toISOString();
    const { oldEntry, newEntry } = input;

    // Defensive: a group must have at least one member. Unreachable from the UI,
    // but an empty group would leave an orphan group row with nothing to render.
    if (newEntry.kind === "group" && newEntry.members.length === 0) {
      return { success: false, err: "Cannot create a group with no members" };
    }

    // 1. Prepare the new rows (ids + validated figure blocks) before the txn.
    const newCount = newEntry.kind === "item" ? 1 : newEntry.members.length;

    let entryId: string;
    let newItem:
      | { id: string; label: string; figureBlockJson: string; geoData: string | null }
      | undefined;
    let newGroup:
      | {
          groupId: string;
          label: string;
          replicateBy: string;
          defaultReplicantValue: string | null;
          replicantsJson: string;
          geoData: string | null;
          members: {
            id: string;
            replicantValue: string;
            label: string;
            figureBlockJson: string;
          }[];
        }
      | undefined;

    if (newEntry.kind === "item") {
      const itemId = await generateUniqueDashboardItemId(projectDb);
      entryId = itemId;
      newItem = {
        id: itemId,
        label: newEntry.label,
        figureBlockJson: JSON.stringify(
          dashboardFigureBlockSchema.parse(newEntry.figureBlock),
        ),
        geoData:
          newEntry.geoData !== undefined
            ? JSON.stringify(newEntry.geoData)
            : null,
      };
    } else {
      const groupId = await generateUniqueDashboardItemGroupId(projectDb);
      entryId = groupId;
      const members: {
        id: string;
        replicantValue: string;
        label: string;
        figureBlockJson: string;
      }[] = [];
      for (const m of newEntry.members) {
        members.push({
          id: await generateUniqueDashboardItemId(projectDb),
          replicantValue: m.replicantValue,
          label: m.label,
          figureBlockJson: JSON.stringify(
            dashboardFigureBlockSchema.parse(m.figureBlock),
          ),
        });
      }
      newGroup = {
        groupId,
        label: newEntry.label,
        replicateBy: newEntry.replicateBy,
        defaultReplicantValue: newEntry.defaultReplicantValue ?? null,
        replicantsJson: JSON.stringify(newEntry.replicants),
        geoData:
          newEntry.geoData !== undefined
            ? JSON.stringify(newEntry.geoData)
            : null,
        members,
      };
    }

    // 2. One transaction: read position + delete old → clear a hole at baseSort →
    //    insert new → reSequence → bump dashboard. The position read lives inside
    //    the txn (and the DELETE row-count is checked) so a concurrent move/delete
    //    can't make us insert at a stale position or resurrect a vanished entry.
    await projectDb.begin(async (sql) => {
      let baseSort: number;
      if (oldEntry.kind === "item") {
        const row = (
          await sql<{ sort_order: number }[]>`
            SELECT sort_order FROM dashboard_items
            WHERE id = ${oldEntry.itemId} AND dashboard_id = ${dashboardId}
          `
        ).at(0);
        if (!row) throw new Error("Dashboard item not found");
        baseSort = row.sort_order;
        const del = await sql`
          DELETE FROM dashboard_items
          WHERE id = ${oldEntry.itemId} AND dashboard_id = ${dashboardId}
        `;
        if (del.count === 0) throw new Error("Dashboard item not found");
      } else {
        const row = (
          await sql<{ min_sort: number | null }[]>`
            SELECT min(sort_order) AS min_sort FROM dashboard_items
            WHERE replicant_group_id = ${oldEntry.groupId}
              AND dashboard_id = ${dashboardId}
          `
        ).at(0);
        if (row?.min_sort == null) {
          throw new Error("Dashboard item group not found");
        }
        baseSort = row.min_sort;
        // Group row delete cascades to its member items (FK ON DELETE CASCADE).
        const del = await sql`
          DELETE FROM dashboard_item_groups
          WHERE id = ${oldEntry.groupId} AND dashboard_id = ${dashboardId}
        `;
        if (del.count === 0) {
          throw new Error("Dashboard item group not found");
        }
      }

      // Open a newCount*10-wide hole at baseSort so the inserts below cannot tie
      // with any trailing row (reSequence can't break sort_order ties).
      await sql`
        UPDATE dashboard_items
        SET sort_order = sort_order + ${newCount * 10}
        WHERE dashboard_id = ${dashboardId} AND sort_order >= ${baseSort}
      `;

      if (newItem) {
        await sql`
          INSERT INTO dashboard_items (
            id, dashboard_id, label, sort_order, figure_block, geo_data, last_updated
          ) VALUES (
            ${newItem.id}, ${dashboardId}, ${newItem.label}, ${baseSort},
            ${newItem.figureBlockJson}, ${newItem.geoData}, ${now}
          )
        `;
      } else if (newGroup) {
        await sql`
          INSERT INTO dashboard_item_groups (
            id, dashboard_id, label, replicate_by, default_replicant_value,
            replicants, geo_data, last_updated
          ) VALUES (
            ${newGroup.groupId}, ${dashboardId}, ${newGroup.label},
            ${newGroup.replicateBy}, ${newGroup.defaultReplicantValue},
            ${newGroup.replicantsJson}, ${newGroup.geoData}, ${now}
          )
        `;
        for (let i = 0; i < newGroup.members.length; i++) {
          const m = newGroup.members[i];
          await sql`
            INSERT INTO dashboard_items (
              id, dashboard_id, label, sort_order, figure_block, geo_data,
              last_updated, replicant_group_id, replicant_value
            ) VALUES (
              ${m.id}, ${dashboardId}, ${m.label}, ${baseSort + 10 * i},
              ${m.figureBlockJson}, ${null}, ${now}, ${newGroup.groupId},
              ${m.replicantValue}
            )
          `;
        }
      }

      await sql`
        UPDATE dashboards SET updated_at = ${now}, last_updated = ${now}
        WHERE id = ${dashboardId}
      `;
      await reSequence(sql, dashboardId);
    });

    return { success: true, data: { entryId, lastUpdated: now } };
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

    // Full-order rewrite (mirrors moveSlides): splice the moved block into the
    // current order, then renumber every row to (i+1)*10. Tie-free by
    // construction — the older anchor+offset+reSequence approach collided when a
    // moved block (a replicant group's N members) was wider than the 10-unit gap
    // to its neighbour, and reSequence cannot break sort_order ties.
    const allRows = await projectDb<{ id: string }[]>`
      SELECT id FROM dashboard_items
      WHERE dashboard_id = ${dashboardId}
      ORDER BY sort_order
    `;
    const allIds = allRows.map((r) => r.id);
    const allIdsSet = new Set(allIds);

    const missing = itemIds.filter((id) => !allIdsSet.has(id));
    if (missing.length > 0) {
      throw new Error(`Dashboard items not found: ${missing.join(", ")}`);
    }

    const idsSet = new Set(itemIds);
    const remaining = allIds.filter((id) => !idsSet.has(id));

    let insertIndex: number;
    if ("toStart" in position) {
      insertIndex = 0;
    } else if ("toEnd" in position) {
      insertIndex = remaining.length;
    } else if ("after" in position) {
      const targetIndex = remaining.indexOf(position.after);
      if (targetIndex === -1) {
        throw new Error(`Target item not found: ${position.after}`);
      }
      insertIndex = targetIndex + 1;
    } else {
      const targetIndex = remaining.indexOf(position.before);
      if (targetIndex === -1) {
        throw new Error(`Target item not found: ${position.before}`);
      }
      insertIndex = targetIndex;
    }

    const reordered = [
      ...remaining.slice(0, insertIndex),
      ...itemIds,
      ...remaining.slice(insertIndex),
    ];

    await projectDb.begin(async (sql) => {
      for (let i = 0; i < reordered.length; i++) {
        await sql`
          UPDATE dashboard_items
          SET sort_order = ${(i + 1) * 10}, last_updated = ${now}
          WHERE id = ${reordered[i]} AND dashboard_id = ${dashboardId}
        `;
      }
      await sql`
        UPDATE dashboards
        SET updated_at = ${now}, last_updated = ${now}
        WHERE id = ${dashboardId}
      `;
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
