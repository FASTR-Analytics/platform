// =============================================================================
// CARRY PROJECT REGIONS INTO USER SCOPES
// =============================================================================
//
// The body of migration 217_legacy_user_scopes. It applies what
// 201_project_access_snapshot recorded (access.ts) once scopes (204) and
// user_scopes (205) exist. A non-admin whose every project with data was held
// to one admin area 2 becomes restricted (users.all_scopes = FALSE) and holds
// one scope per zone they had; anyone on a national project is left
// unrestricted. A zone reuses the scope that already filters exactly that
// zone and nothing else (204 seeds one per area), and a zone with none gets
// one, created once and labelled "<zone> (migrated)", so no two scopes filter
// the same way and admins can tell the created ones apart. The products of a
// zone-held project with a restricted member move off 'all-data' onto that
// zone's scope, as setProductScope would move them, so the restricted members
// still see them. The staging tables are dropped at the end.
//
// =============================================================================

import {
  geographyOnlyScopeDefinition,
  parseScopeDefinition,
  scopeDefinitionHash,
  scopeDefinitionSchema,
} from "lib";
import type { Sql } from "postgres";

// The geography-only scope for each zone, keyed by upper-cased zone, earliest
// first. A definition that no longer parses is not a candidate.
async function zoneScopes(tx: Sql): Promise<Map<string, string>> {
  const rows = await tx<{ id: string; definition: string }[]>`
    SELECT id, definition FROM scopes ORDER BY created_at, id
  `;
  const byZone = new Map<string, string>();
  for (const row of rows) {
    let definition;
    try {
      definition = parseScopeDefinition(row.definition);
    } catch {
      continue;
    }
    const zone = definition.hmis.include ? definition.hmis.adminArea2 : null;
    if (
      zone !== null &&
      !byZone.has(zone.toUpperCase()) &&
      scopeDefinitionHash(definition) ===
        scopeDefinitionHash(geographyOnlyScopeDefinition(zone))
    ) {
      byZone.set(zone.toUpperCase(), row.id);
    }
  }
  return byZone;
}

// "<zone> (migrated)", numbered when a scope already carries that label
// (labels are unique case-insensitively).
async function createZoneScope(tx: Sql, zone: string): Promise<string> {
  const taken = new Set(
    (await tx<{ label: string }[]>`SELECT label FROM scopes`).map((r) =>
      r.label.toLowerCase()
    ),
  );
  let label = `${zone} (migrated)`;
  for (let n = 2; taken.has(label.toLowerCase()); n++) {
    label = `${zone} (migrated ${n})`;
  }
  const id = crypto.randomUUID();
  const stamp = new Date().toISOString();
  const definition = JSON.stringify(
    scopeDefinitionSchema.parse(geographyOnlyScopeDefinition(zone)),
  );
  await tx`
    INSERT INTO scopes (id, label, definition, created_by, created_at, last_updated)
    VALUES (${id}, ${label}, ${definition}, NULL, ${stamp}, ${stamp})
  `;
  return id;
}

export async function applyLegacyUserScopes(tx: Sql): Promise<void> {
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

  const rows = await tx<
    { email: string; project_id: string; zone: string | null }[]
  >`
    SELECT z.email, z.project_id, z.zone
    FROM legacy_user_project_zones z JOIN users u ON u.email = z.email
    WHERE NOT u.is_admin
  `;
  const byUser = new Map<string, { national: boolean; zones: Set<string> }>();
  for (const row of rows) {
    const user = byUser.get(row.email) ??
      { national: false, zones: new Set<string>() };
    if (row.zone === null) user.national = true;
    else user.zones.add(row.zone);
    byUser.set(row.email, user);
  }
  const restricted = [...byUser].filter(([, user]) =>
    !user.national && user.zones.size > 0
  );

  if (restricted.length > 0) {
    const scopeByZone = await zoneScopes(tx);
    const created: string[] = [];
    for (const [, user] of restricted) {
      for (const zone of user.zones) {
        if (!scopeByZone.has(zone.toUpperCase())) {
          scopeByZone.set(zone.toUpperCase(), await createZoneScope(tx, zone));
          created.push(zone);
        }
      }
    }
    const scopeOf = (zone: string) => scopeByZone.get(zone.toUpperCase())!;

    const emails = restricted.map(([email]) => email);
    await tx`UPDATE users SET all_scopes = FALSE WHERE email = ANY(${emails})`;
    const grants = restricted.flatMap(([email, user]) =>
      [...user.zones].map((zone) => ({ email, scopeId: scopeOf(zone) }))
    );
    await tx`
      INSERT INTO user_scopes (email, scope_id)
      SELECT * FROM unnest(
        ${grants.map((g) => g.email)}::text[],
        ${grants.map((g) => g.scopeId)}::text[]
      )
      ON CONFLICT DO NOTHING
    `;

    const moves = await tx<{ product_id: string; zone: string }[]>`
      SELECT p.product_id, p.zone FROM legacy_project_zone_products p
      WHERE p.project_id IN (
        SELECT project_id FROM legacy_user_project_zones
        WHERE email = ANY(${emails})
      )
    `;
    const stamp = new Date().toISOString();
    const moved = moves.length === 0 ? [] : await tx<{ id: string }[]>`
      UPDATE products SET scope_id = m.scope_id, last_updated = ${stamp}
      FROM unnest(
        ${moves.map((m) => m.product_id)}::text[],
        ${moves.map((m) => scopeOf(m.zone))}::text[]
      ) AS m(id, scope_id)
      WHERE products.id = m.id AND products.scope_id = 'all-data'
      RETURNING products.id
    `;

    console.log(
      `[migration] 217 user scopes: ${restricted.length} user(s) restricted to ` +
        `${new Set(grants.map((g) => g.scopeId)).size} zone scope(s), ` +
        `${created.length} created (${created.join(", ") || "none"}); ` +
        `${moved.length} product(s) moved onto their zone's scope`,
    );
  }

  await tx`
    DROP TABLE IF EXISTS legacy_user_project_zones, legacy_project_zone_products
  `;
}
