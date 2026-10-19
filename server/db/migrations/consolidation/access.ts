// =============================================================================
// CARRY PROJECT ACCESS INTO THE CONSOLIDATED PRODUCTS
// =============================================================================
//
// The body of migration 201_project_access_snapshot, which sorts after 201 and
// before 202 drops project_user_roles. A moved product keeps its project's
// audience: it becomes private (general access 'none') and each member is
// granted per product type from the flags the project layer enforced:
// can_configure_reports / can_configure_slide_decks is edit, can_view_reports
// / can_view_slide_decks is view. Global admins get no grant (they hold every
// product), and a central-reporting project, which only admins could open,
// gets none. products.default_access and product_access only exist from 210,
// so this writes the outcome to two staging tables that
// 216_legacy_product_access applies and then drops.
//
// 201 records no link from a project to its folder, so the link is derived.
// The root folder 201 made for a project carries the project's label. Projects
// sharing a label are told apart by the legacy product ids 201 kept, replaying
// its first-claimer-keeps rule (projects by id, decks before reports). A
// project still ambiguous is logged and its products keep general access
// 'view'.
//
// It also records each project's region and who was on it, for
// 217_legacy_user_scopes: a user whose every project with data was held to
// one admin area 2 becomes restricted to that area's scope
// (projectRegion below says what counts). Two more staging tables:
// legacy_user_project_zones (one row per member and project, zone NULL for a
// national project) and legacy_project_zone_products (the products of a
// zone-held project whose folder was matched).
//
// TRANSACTION: `tx` is the migration transaction. Source project pools are
// opened fresh per project, read only, and ended in a `finally`.
//
// =============================================================================

import type { Sql } from "postgres";
import { getPgConnection } from "../../postgres/connection_manager.ts";
import { projectDatabaseExists, readProjects } from "./execute.ts";
import { type LegacyProjectRow, tableExists } from "./plan.ts";

type ProductType = "slide_deck" | "report";
type Level = "view" | "edit";

export type AccessProject = {
  id: string;
  label: string;
  legacyProductCount: number;
  // Root folders the project's kept legacy ids landed in.
  keptRootIds: Set<string>;
};

// A project's geography for the scope carry-over. `none` is a project that
// never had data added, which neither restricts nor frees a user. A project
// is held to a zone when its admin_area_2 is set, or when every HMIS window
// limits geography and all of them resolve to the same single zone (a state
// entry is "state|||zone"). Anything wider, including a several-zone list,
// which no one scope can hold, is national. Indicator, year and facility
// windows are analysis setup and are ignored.
export type ProjectRegion =
  | { kind: "none" }
  | { kind: "national" }
  | { kind: "zone"; zone: string };

export type DatasetWindowing = { datasetType: string; windowing: unknown };

function stringList(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((v): v is string => typeof v === "string" && v !== "")
    : [];
}

function windowZones(windowing: unknown): string[] | null {
  if (windowing === null || typeof windowing !== "object") return null;
  const w = windowing as Record<string, unknown>;
  const states = stringList(w.adminArea3sToInclude);
  if (w.takeAllAdminArea3s === false && states.length > 0) {
    return states.map((s) => s.slice(s.lastIndexOf("|||") + 3));
  }
  const zones = stringList(w.adminArea2sToInclude);
  if (w.takeAllAdminArea2s === false && zones.length > 0) return zones;
  return null;
}

export function projectRegion(
  adminArea2: string | null,
  datasets: DatasetWindowing[],
): ProjectRegion {
  if (adminArea2 !== null && adminArea2 !== "") {
    return { kind: "zone", zone: adminArea2 };
  }
  if (datasets.length === 0) return { kind: "none" };
  const zones = new Map<string, string>();
  for (const dataset of datasets) {
    const listed = dataset.datasetType === "hmis"
      ? windowZones(dataset.windowing)
      : null;
    if (listed === null) return { kind: "national" };
    for (const zone of listed) zones.set(zone.toUpperCase(), zone);
  }
  return zones.size === 1
    ? { kind: "zone", zone: [...zones.values()][0] }
    : { kind: "national" };
}

// The windowing each dataset of a legacy project database was built with.
export async function readDatasetWindowings(
  projectDb: Sql,
): Promise<DatasetWindowing[]> {
  if (!(await tableExists(projectDb, "datasets"))) return [];
  const rows = await projectDb<{ dataset_type: string; info: string | null }[]>`
    SELECT dataset_type, info FROM datasets
  `;
  return rows.map((row) => {
    let windowing: unknown = null;
    try {
      const info: unknown = JSON.parse(row.info ?? "null");
      if (info !== null && typeof info === "object") {
        windowing = (info as Record<string, unknown>).windowing ?? null;
      }
    } catch {
      // An unreadable info blob limits nothing.
    }
    return { datasetType: row.dataset_type, windowing };
  });
}

type RoleRow = {
  email: string;
  can_view_reports: boolean;
  can_configure_reports: boolean;
  can_view_slide_decks: boolean;
  can_configure_slide_decks: boolean;
};

// Pairs each project with the root folder 201 made for it. `projects` are in
// 201's order. Within one label: a project whose kept ids point at exactly
// one unclaimed root takes it; then, if exactly one project with products and
// one root are left, they pair. Anything else stays unmatched.
export function matchProjectRoots(
  projects: AccessProject[],
  roots: { id: string; label: string }[],
): Map<string, string> {
  const matched = new Map<string, string>();
  const labels = new Set(projects.map((p) => p.label));
  for (const label of labels) {
    const group = projects.filter(
      (p) => p.label === label && p.legacyProductCount > 0,
    );
    const free = new Set(
      roots.filter((r) => r.label === label).map((r) => r.id),
    );
    for (const project of group) {
      const candidates = [...project.keptRootIds].filter((id) => free.has(id));
      if (candidates.length === 1) {
        matched.set(project.id, candidates[0]);
        free.delete(candidates[0]);
      }
    }
    const left = group.filter((p) => !matched.has(p.id));
    if (left.length === 1 && free.size === 1) {
      matched.set(left[0].id, [...free][0]);
    }
  }
  return matched;
}

function levelFor(role: RoleRow, type: ProductType): Level | null {
  if (type === "report") {
    return role.can_configure_reports
      ? "edit"
      : role.can_view_reports
      ? "view"
      : null;
  }
  return role.can_configure_slide_decks
    ? "edit"
    : role.can_view_slide_decks
    ? "view"
    : null;
}

export async function snapshotProjectAccess(tx: Sql): Promise<void> {
  await tx`
    CREATE TABLE IF NOT EXISTS legacy_project_products (
      product_id text PRIMARY KEY NOT NULL
    )
  `;
  await tx`
    CREATE TABLE IF NOT EXISTS legacy_product_grants (
      product_id text NOT NULL,
      email text NOT NULL,
      level text NOT NULL CHECK (level IN ('view', 'edit')),
      PRIMARY KEY (product_id, email)
    )
  `;
  await tx`
    CREATE TABLE IF NOT EXISTS legacy_user_project_zones (
      email text NOT NULL,
      project_id text NOT NULL,
      zone text,
      PRIMARY KEY (email, project_id)
    )
  `;
  await tx`
    CREATE TABLE IF NOT EXISTS legacy_project_zone_products (
      product_id text PRIMARY KEY NOT NULL,
      project_id text NOT NULL,
      zone text NOT NULL
    )
  `;
  if (!(await tableExists(tx, "project_user_roles"))) {
    return;
  }

  const projects: LegacyProjectRow[] = [];
  for (const project of await readProjects(tx)) {
    if (
      project.status === "ready" &&
      (await projectDatabaseExists(tx, project.id))
    ) {
      projects.push(project);
    }
  }
  if (projects.length === 0) {
    return;
  }

  // Replay 201's id claims: the first project to hold a legacy id kept it.
  const claimed = new Set<string>();
  const keptIdsByProject = new Map<string, string[]>();
  const legacyCountByProject = new Map<string, number>();
  const regionByProject = new Map<string, ProjectRegion>();
  for (const project of projects) {
    const projectDb = getPgConnection(project.id, { max: 2 });
    try {
      const decks = await projectDb<{ id: string }[]>`
        SELECT id FROM slide_decks ORDER BY id
      `;
      const reports = await projectDb<{ id: string }[]>`
        SELECT id FROM reports ORDER BY id
      `;
      const kept: string[] = [];
      for (const { id } of [...decks, ...reports]) {
        if (!claimed.has(id)) {
          claimed.add(id);
          kept.push(id);
        }
      }
      keptIdsByProject.set(project.id, kept);
      legacyCountByProject.set(project.id, decks.length + reports.length);
      regionByProject.set(
        project.id,
        projectRegion(
          project.admin_area_2,
          await readDatasetWindowings(projectDb),
        ),
      );
    } finally {
      await projectDb.end();
    }
  }

  const roots = await tx<{ id: string; label: string }[]>`
    SELECT id, label FROM folders
    WHERE parent_id IS NULL AND created_by IS NULL
  `;
  const allKept = [...keptIdsByProject.values()].flat();
  const rootOfProduct = new Map(
    (await tx<{ product_id: string; root_id: string }[]>`
      WITH RECURSIVE up AS (
        SELECT p.id AS product_id, f.id, f.parent_id
        FROM products p JOIN folders f ON f.id = p.folder_id
        WHERE p.id = ANY(${allKept}::text[]) AND p.created_by IS NULL
        UNION ALL
        SELECT up.product_id, f.id, f.parent_id
        FROM up JOIN folders f ON f.id = up.parent_id
      )
      SELECT product_id, id AS root_id FROM up WHERE parent_id IS NULL
    `).map((row) => [row.product_id, row.root_id]),
  );

  const matched = matchProjectRoots(
    projects.map((project) => ({
      id: project.id,
      label: project.label,
      legacyProductCount: legacyCountByProject.get(project.id) ?? 0,
      keptRootIds: new Set(
        (keptIdsByProject.get(project.id) ?? []).flatMap((id) => {
          const root = rootOfProduct.get(id);
          return root === undefined ? [] : [root];
        }),
      ),
    })),
    roots,
  );

  for (const project of projects) {
    const tag = `project ${project.id} ("${project.label}")`;
    const region = regionByProject.get(project.id) ?? { kind: "none" };
    if (region.kind !== "none" && !project.is_central_reporting) {
      const zone = region.kind === "zone" ? region.zone : null;
      await tx`
        INSERT INTO legacy_user_project_zones (email, project_id, zone)
        SELECT r.email, r.project_id, ${zone}
        FROM project_user_roles r JOIN users u ON u.email = r.email
        WHERE r.project_id = ${project.id} AND NOT u.is_admin
          -- the old rule for being on a project: any permission flag
          AND (r.can_configure_settings OR r.can_create_backups
            OR r.can_restore_backups OR r.can_configure_modules
            OR r.can_run_modules OR r.can_configure_users
            OR r.can_configure_visualizations OR r.can_view_visualizations
            OR r.can_configure_reports OR r.can_view_reports
            OR r.can_configure_slide_decks OR r.can_view_slide_decks
            OR r.can_configure_data OR r.can_view_data OR r.can_view_metrics
            OR r.can_view_logs OR r.can_view_script_code)
        ON CONFLICT DO NOTHING
      `;
    }
    if ((legacyCountByProject.get(project.id) ?? 0) === 0) {
      continue;
    }
    const rootId = matched.get(project.id);
    if (rootId === undefined) {
      console.log(
        `[migration] 201 access: SKIP ${tag}: its folder cannot be told apart from another project's; its products stay visible to everyone`,
      );
      continue;
    }

    const products = await tx<{ id: string; type: ProductType }[]>`
      WITH RECURSIVE subtree AS (
        SELECT id FROM folders WHERE id = ${rootId}
        UNION ALL
        SELECT f.id FROM folders f JOIN subtree s ON f.parent_id = s.id
      )
      SELECT id, type FROM products
      WHERE folder_id IN (SELECT id FROM subtree)
    `;
    if (products.length === 0) {
      continue;
    }
    await tx`
      INSERT INTO legacy_project_products (product_id)
      SELECT unnest(${products.map((p) => p.id)}::text[])
      ON CONFLICT DO NOTHING
    `;
    if (region.kind === "zone") {
      await tx`
        INSERT INTO legacy_project_zone_products (product_id, project_id, zone)
        SELECT unnest(${products.map((p) => p.id)}::text[]), ${project.id},
               ${region.zone}
        ON CONFLICT DO NOTHING
      `;
    }

    const roles = project.is_central_reporting ? [] : await tx<RoleRow[]>`
      SELECT r.email, r.can_view_reports, r.can_configure_reports,
             r.can_view_slide_decks, r.can_configure_slide_decks
      FROM project_user_roles r JOIN users u ON u.email = r.email
      WHERE r.project_id = ${project.id} AND NOT u.is_admin
    `;
    const grants: { productId: string; email: string; level: Level }[] = [];
    for (const role of roles) {
      for (const product of products) {
        const level = levelFor(role, product.type);
        if (level !== null) {
          grants.push({ productId: product.id, email: role.email, level });
        }
      }
    }
    if (grants.length > 0) {
      await tx`
        INSERT INTO legacy_product_grants (product_id, email, level)
        SELECT * FROM unnest(
          ${grants.map((g) => g.productId)}::text[],
          ${grants.map((g) => g.email)}::text[],
          ${grants.map((g) => g.level)}::text[]
        )
        ON CONFLICT DO NOTHING
      `;
    }
    const edits = grants.filter((g) => g.level === "edit").length;
    console.log(
      `[migration] 201 access: ${tag}: ${products.length} product(s) private, ` +
        `${edits} edit + ${grants.length - edits} view grant(s)`,
    );
  }
}
