// Migration 225 on a throwaway database built from _main_database.sql on the
// dev postgres (the .env the test task loads), dropped afterwards: a
// mixed-case user moves to the normalised address with everything that names
// it, a user whose normalised address already exists is logged and left, and
// a second run changes nothing.
//
//   deno test -A --env-file server/tests/lowercase_user_emails_migration_test.ts

import { assert, assertEquals } from "@std/assert";
import type { Sql } from "postgres";
import { lowercaseUserEmails } from "../db/migrations/instance/225_lowercase_user_emails.ts";
import {
  createPersonalAccessToken,
  resolvePersonalAccessTokenEmail,
} from "../db/instance/personal_access_tokens.ts";
import { withSchemaDb } from "./_harness/route_app.ts";

const DB_PREFIX = "lowercase_user_emails_test_";

const ALICE = "Alice@Example.org";
const BOB_MIXED = "Bob@X.org";
const BOB = "bob@x.org";
const SCOPE = "00000000-0000-4000-8000-000000000001";

async function migrate(db: Sql): Promise<string[]> {
  const warnings: string[] = [];
  const warn = console.warn;
  console.warn = (...args: unknown[]) => warnings.push(args.join(" "));
  try {
    await db.begin((tx) => lowercaseUserEmails(tx));
  } finally {
    console.warn = warn;
  }
  return warnings;
}

// Every row of every foreign-key child of users, as (table, email).
async function fkChildRows(db: Sql): Promise<[string, string][]> {
  const children = await db<{ table: string; column: string }[]>`
    SELECT cl.relname AS table, a.attname AS column
    FROM pg_constraint c
    JOIN pg_class cl ON cl.oid = c.conrelid
    JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY(c.conkey)
    WHERE c.contype = 'f' AND c.confrelid = 'users'::regclass
  `;
  const rows: [string, string][] = [];
  for (const { table, column } of children) {
    for (
      const row of await db<{ email: string }[]>`
        SELECT ${db(column)} AS email FROM ${db(table)}
      `
    ) {
      rows.push([table, row.email]);
    }
  }
  return rows.sort();
}

Deno.test("225 lowercases a user with everything that names them, and leaves a twin", async () => {
  await withSchemaDb(DB_PREFIX, async (db) => {
    await db`
      INSERT INTO users (email, is_admin, all_scopes)
      VALUES (${ALICE}, FALSE, FALSE), (${BOB_MIXED}, FALSE, TRUE),
        (${BOB}, FALSE, TRUE)
    `;
    await db`
      INSERT INTO scopes (id, label, definition, created_at, last_updated)
      VALUES (${SCOPE}, 'S', '{}', 't', 't')
    `;
    await db`INSERT INTO user_scopes (email, scope_id) VALUES (${ALICE}, ${SCOPE})`;
    await db`
      INSERT INTO user_logs (user_email, endpoint, endpoint_result)
      VALUES (${ALICE}, 'x', '200'), (${BOB_MIXED}, 'x', '200')
    `;
    const pat = await createPersonalAccessToken(db, ALICE, "t");
    if (!pat.success) throw new Error(pat.err);
    await db`
      INSERT INTO runs (id, label, provenance) VALUES ('run', 'Run', '{}')
    `;
    await db`
      INSERT INTO folders (id, label, created_by, last_updated)
      VALUES ('f1', 'F', ${ALICE}, 't')
    `;
    await db`
      INSERT INTO products (id, type, label, run_id, last_updated, scope_id, owner)
      VALUES ('p1', 'report', 'Owned', 'run', 't', ${SCOPE}, ${ALICE}),
        ('p2', 'report', 'Shared', 'run', 't', ${SCOPE}, ${BOB})
    `;
    await db`
      INSERT INTO product_access (product_id, email, level)
      VALUES ('p2', ${ALICE}, 'edit'), ('p1', ${BOB_MIXED}, 'view')
    `;

    const warnings = await migrate(db);

    const alice = ALICE.toLowerCase();
    assertEquals(
      (await db<{ email: string; all_scopes: boolean }[]>`
        SELECT email, all_scopes FROM users
      `).map((r) => [r.email, r.all_scopes]).sort(),
      [[BOB_MIXED, true], [alice, false], [BOB, true]].sort(),
    );
    const children = await fkChildRows(db);
    assertEquals(
      children,
      [
        ["personal_access_tokens", alice],
        ["user_logs", BOB_MIXED],
        ["user_logs", alice],
        ["user_scopes", alice],
      ].sort() as [string, string][],
    );
    assertEquals(
      (await db<{ owner: string }[]>`
        SELECT owner FROM products WHERE id = 'p1'
      `)[0].owner,
      alice,
    );
    assertEquals(
      (await db<{ product_id: string; email: string }[]>`
        SELECT product_id, email FROM product_access ORDER BY product_id
      `).map((r) => [r.product_id, r.email]),
      [["p1", BOB_MIXED], ["p2", alice]],
    );
    assertEquals(
      (await db<{ created_by: string }[]>`SELECT created_by FROM folders`)[0]
        .created_by,
      alice,
    );
    assertEquals(
      await resolvePersonalAccessTokenEmail(db, pat.data.token),
      alice,
    );
    assertEquals(warnings.length, 1);
    assert(warnings[0].includes(BOB_MIXED), warnings[0]);

    const snapshot = async () => ({
      users: await db`SELECT email FROM users ORDER BY email`,
      children: await fkChildRows(db),
      access: await db`SELECT * FROM product_access ORDER BY product_id`,
    });
    const before = await snapshot();
    await migrate(db);
    assertEquals(await snapshot(), before);
  });
});
