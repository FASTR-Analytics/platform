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
// It also records each project's data window as a scope definition, and who
// was on it, for 217_legacy_user_scopes (projectWindow below says what
// counts). Three more staging tables: legacy_project_windows (one row per
// migrated project with data, definition NULL for an unlimited one),
// legacy_user_projects (its non-admin members) and
// legacy_project_window_products (the products of a limited project whose
// folder was matched).
//
// TRANSACTION: `tx` is the migration transaction. Source project pools are
// opened fresh per project, read only, and ended in a `finally`.
//
// =============================================================================

import type { ScopeDefinition } from "lib";
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

// A project's data window, as the scope that holds the same data, for the
// scope carry-over. `none` is a project that never had data added, which
// neither restricts nor frees a user; `national` limited nothing a scope can
// hold. Otherwise the definition carries, on HMIS: the zone (the project's
// admin_area_2, or a window whose zone or state list resolves to one zone; a
// state entry is "state|||zone"; several zones are not one scope's area), the
// common-indicator list, and the start year when the window starts after the
// instance's first year of data (end 9999: a window's end was only its import
// date). HFA takes the project's admin_area_2, or the HMIS zone when the
// project had no HFA dataset to see whole; ICEH is whole. Facility filters and
// raw-indicator lists have no scope dimension and are ignored.
export type ProjectWindow =
  | { kind: "none" }
  | { kind: "national" }
  | { kind: "limited"; definition: ScopeDefinition };

export type DatasetWindowing = { datasetType: string; windowing: unknown };

function stringList(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((v): v is string => typeof v === "string" && v !== "")
    : [];
}

function windowZone(w: Record<string, unknown>): string | null {
  const states = stringList(w.adminArea3sToInclude);
  const zones = w.takeAllAdminArea3s === false && states.length > 0
    ? states.map((s) => s.slice(s.lastIndexOf("|||") + 3))
    : w.takeAllAdminArea2s === false
    ? stringList(w.adminArea2sToInclude)
    : [];
  const distinct = new Map(zones.map((z) => [z.toUpperCase(), z]));
  return distinct.size === 1 ? [...distinct.values()][0] : null;
}

export function projectWindow(
  adminArea2: string | null,
  datasets: DatasetWindowing[],
  firstDataYear: number | null,
): ProjectWindow {
  const area = adminArea2 === "" ? null : adminArea2;
  if (area === null && datasets.length === 0) return { kind: "none" };
  const raw = datasets.find((d) => d.datasetType === "hmis")?.windowing;
  const w = raw !== null && typeof raw === "object"
    ? raw as Record<string, unknown>
    : null;
  const hmisZone = area ?? (w === null ? null : windowZone(w));
  const indicators = w !== null && w.takeAllIndicators === false &&
      (w.indicatorType ?? "common") === "common"
    ? [...new Set(stringList(w.commonIndicatorsToInclude))].toSorted()
    : [];
  const start = w === null ? NaN : Number(String(w.start ?? "").slice(0, 4));
  const years = Number.isInteger(start) && start >= 1000 && start <= 9999 &&
      firstDataYear !== null && start > firstDataYear
    ? { start, end: 9999 }
    : null;
  const hasHfa = datasets.some((d) => d.datasetType === "hfa");
  const hfaZone = area ?? (hasHfa ? null : hmisZone);
  if (
    hmisZone === null && indicators.length === 0 && years === null &&
    hfaZone === null
  ) {
    return { kind: "national" };
  }
  return {
    kind: "limited",
    definition: {
      hmis: {
        include: true,
        modules: null,
        indicators: indicators.length > 0 ? indicators : null,
        adminArea2: hmisZone,
        years,
      },
      hfa: {
        include: true,
        modules: null,
        indicators: null,
        adminArea2: hfaZone,
        timePoints: null,
        categories: null,
        serviceCategories: null,
      },
      iceh: { include: true, modules: null, indicators: null, years: null },
    },
  };
}

// The first year of HMIS data on the instance, which a window starting in it
// does not limit.
export async function readFirstDataYear(db: Sql): Promise<number | null> {
  if (!(await tableExists(db, "dataset_hmis"))) return null;
  const rows = await db<{ first: number | null }[]>`
    SELECT MIN(period_id)::int AS first FROM dataset_hmis
  `;
  const first = rows[0]?.first;
  return first === null || first === undefined ? null : Math.floor(first / 100);
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

// The staging 217_legacy_user_scopes reads and drops; it creates them too,
// so a database that never ran the snapshot passes through.
export async function createWindowStaging(tx: Sql): Promise<void> {
  await tx`
    CREATE TABLE IF NOT EXISTS legacy_project_windows (
      project_id text PRIMARY KEY NOT NULL,
      label text NOT NULL,
      definition text
    )
  `;
  await tx`
    CREATE TABLE IF NOT EXISTS legacy_user_projects (
      email text NOT NULL,
      project_id text NOT NULL,
      PRIMARY KEY (email, project_id)
    )
  `;
  await tx`
    CREATE TABLE IF NOT EXISTS legacy_project_window_products (
      product_id text PRIMARY KEY NOT NULL,
      project_id text NOT NULL
    )
  `;
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
  await createWindowStaging(tx);
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
  const windowByProject = new Map<string, ProjectWindow>();
  const firstDataYear = await readFirstDataYear(tx);
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
      windowByProject.set(
        project.id,
        projectWindow(
          project.admin_area_2,
          await readDatasetWindowings(projectDb),
          firstDataYear,
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
    const window = windowByProject.get(project.id) ?? { kind: "none" };
    if (window.kind !== "none" && !project.is_central_reporting) {
      const definition = window.kind === "limited"
        ? JSON.stringify(window.definition)
        : null;
      await tx`
        INSERT INTO legacy_project_windows (project_id, label, definition)
        VALUES (${project.id}, ${project.label}, ${definition})
        ON CONFLICT DO NOTHING
      `;
      await tx`
        INSERT INTO legacy_user_projects (email, project_id)
        SELECT r.email, r.project_id
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
    if (window.kind === "limited" && !project.is_central_reporting) {
      await tx`
        INSERT INTO legacy_project_window_products (product_id, project_id)
        SELECT unnest(${products.map((p) => p.id)}::text[]), ${project.id}
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
