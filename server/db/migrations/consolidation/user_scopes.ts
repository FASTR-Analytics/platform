// =============================================================================
// CARRY PROJECT DATA WINDOWS INTO SCOPES
// =============================================================================
//
// The body of migration 217_legacy_user_scopes. It applies what
// 201_project_access_snapshot recorded (access.ts, projectWindow) once scopes
// (204) and user_scopes (205) exist.
//
// Each limited project's window is a scope definition. Every distinct
// definition that a project with products needs, or a project some member was
// on with no unlimited project beside it, gets one scope: the existing scope that filters the same way (same definition hash;
// 204 seeds one per area) or, failing that, a new one labelled "<zone>
// (migrated)" when it limits geography alone and "<project> (migrated)"
// otherwise, so admins can tell the created ones apart and no two scopes filter
// the same way. A limited project's products move onto its scope, as
// setProductScope would move them, so their figures keep the project's limits.
// No user is restricted: every user keeps all scopes ("All data"), and an
// admin may attach these scopes to users later. Every scope the update made (no
// creator: created here or seeded by 204) records the projects it came from in
// scopes.migrated_from, which the client shows as its "Migrated" badge. A
// scope 204 seeded that ends up with no product, no user and no project is
// deleted. The staging tables are dropped at the end.
//
// =============================================================================

import {
  parseScopeDefinition,
  type ScopeDefinition,
  scopeDefinitionHash,
  scopeDefinitionSchema,
} from "lib";
import type { Sql } from "postgres";
import { createWindowStaging } from "./access.ts";

type Window = { projectId: string; label: string; definition: ScopeDefinition };

// The zone a definition limits when geography is all it limits.
function zoneOnly(definition: ScopeDefinition): string | null {
  const { hmis, hfa } = definition;
  if (!hmis.include || !hfa.include) return null;
  return hmis.indicators === null && hmis.years === null &&
      hmis.adminArea2 !== null && hmis.adminArea2 === hfa.adminArea2
    ? hmis.adminArea2
    : null;
}

// Every scope by definition hash, earliest first. A definition that no longer
// parses is not a candidate.
async function scopesByHash(tx: Sql): Promise<Map<string, string>> {
  const rows = await tx<{ id: string; definition: string }[]>`
    SELECT id, definition FROM scopes ORDER BY created_at, id
  `;
  const byHash = new Map<string, string>();
  for (const row of rows) {
    try {
      const hash = scopeDefinitionHash(parseScopeDefinition(row.definition));
      if (!byHash.has(hash)) byHash.set(hash, row.id);
    } catch {
      continue;
    }
  }
  return byHash;
}

// Labels are unique case-insensitively, so a taken one is numbered.
async function createScope(
  tx: Sql,
  base: string,
  definition: ScopeDefinition,
): Promise<string> {
  const taken = new Set(
    (await tx<{ label: string }[]>`SELECT label FROM scopes`).map((r) =>
      r.label.toLowerCase()
    ),
  );
  let label = `${base} (migrated)`;
  for (let n = 2; taken.has(label.toLowerCase()); n++) {
    label = `${base} (migrated ${n})`;
  }
  const id = crypto.randomUUID();
  const stamp = new Date().toISOString();
  await tx`
    INSERT INTO scopes (id, label, definition, created_by, created_at, last_updated)
    VALUES (${id}, ${label}, ${
    JSON.stringify(scopeDefinitionSchema.parse(definition))
  }, NULL, ${stamp}, ${stamp})
  `;
  return id;
}

export async function applyLegacyUserScopes(tx: Sql): Promise<void> {
  await createWindowStaging(tx);
  const windowRows = await tx<
    { project_id: string; label: string; definition: string | null }[]
  >`SELECT project_id, label, definition FROM legacy_project_windows ORDER BY label, project_id`;

  if (windowRows.length > 0) {
    const limited = new Map<string, Window>();
    for (const row of windowRows) {
      if (row.definition !== null) {
        limited.set(row.project_id, {
          projectId: row.project_id,
          label: row.label,
          definition: parseScopeDefinition(row.definition),
        });
      }
    }

    // The projects of a member who was on limited projects only: their window
    // is what that member saw, so it gets a scope even with no products.
    const memberRows = await tx<{ email: string; project_id: string }[]>`
      SELECT m.email, m.project_id
      FROM legacy_user_projects m JOIN users u ON u.email = m.email
      WHERE NOT u.is_admin
    `;
    const projectsByUser = new Map<string, string[]>();
    for (const { email, project_id } of memberRows) {
      projectsByUser.set(email, [
        ...(projectsByUser.get(email) ?? []),
        project_id,
      ]);
    }
    const onlyLimited = [...projectsByUser.values()].filter((ids) =>
      ids.every((id) => limited.has(id))
    );

    const productRows = await tx<{ product_id: string; project_id: string }[]>`
      SELECT product_id, project_id FROM legacy_project_window_products
    `;

    // One scope per distinct definition those projects need.
    const needed = new Set([
      ...productRows.map((r) => r.project_id),
      ...onlyLimited.flat(),
    ]);
    const byHash = await scopesByHash(tx);
    const scopeOfProject = new Map<string, string>();
    const created: string[] = [];
    for (const window of limited.values()) {
      if (!needed.has(window.projectId)) continue;
      const hash = scopeDefinitionHash(window.definition);
      let scopeId = byHash.get(hash);
      if (scopeId === undefined) {
        const base = zoneOnly(window.definition) ?? window.label;
        scopeId = await createScope(tx, base, window.definition);
        byHash.set(hash, scopeId);
        created.push(base);
      }
      scopeOfProject.set(window.projectId, scopeId);
    }

    const projectsOfScope = new Map<string, string[]>();
    for (const [projectId, scopeId] of scopeOfProject) {
      projectsOfScope.set(scopeId, [
        ...(projectsOfScope.get(scopeId) ?? []),
        limited.get(projectId)!.label,
      ]);
    }
    for (const [scopeId, labels] of projectsOfScope) {
      await tx`
        UPDATE scopes SET migrated_from = ${JSON.stringify(labels.toSorted())}
        WHERE id = ${scopeId} AND created_by IS NULL
      `;
    }

    const stamp = new Date().toISOString();
    const moves = productRows.filter((r) => scopeOfProject.has(r.project_id));
    if (moves.length > 0) {
      await tx`
        UPDATE products SET scope_id = m.scope_id, last_updated = ${stamp}
        FROM unnest(
          ${moves.map((m) => m.product_id)}::text[],
          ${moves.map((m) => scopeOfProject.get(m.project_id)!)}::text[]
        ) AS m(id, scope_id)
        WHERE products.id = m.id
      `;
    }

    const inUse = [...new Set(scopeOfProject.values())];
    const removed = await tx<{ label: string }[]>`
      DELETE FROM scopes s
      WHERE s.id <> 'all-data' AND s.created_by IS NULL
        AND s.id <> ALL(${inUse}::text[])
        AND NOT EXISTS (SELECT 1 FROM products p WHERE p.scope_id = s.id)
        AND NOT EXISTS (SELECT 1 FROM user_scopes us WHERE us.scope_id = s.id)
      RETURNING s.label
    `;

    console.log(
      `[migration] 217 scopes: ${limited.size} limited project(s); ` +
        `${inUse.length} scope(s) in use, ` +
        `${created.length} created (${created.join(", ") || "none"}); ` +
        `${moves.length} product(s) moved; ` +
        `${removed.length} unused seeded scope(s) removed (${
          removed.map((r) => r.label).join(", ") || "none"
        })`,
    );
  }

  await tx`
    DROP TABLE IF EXISTS legacy_project_windows, legacy_user_projects,
      legacy_project_window_products
  `;
}
