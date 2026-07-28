import postgres, { type Sql } from "postgres";

const HOST = Deno.env.get("PG_HOST")!;
const PORT = Number(Deno.env.get("PG_PORT")!);
const PASSWORD = Deno.env.get("PG_PASSWORD")!;

// The wrapper script points these at a throwaway container and never sources
// the real .env, so the rig cannot reach a live database even by accident.
export function connect(database: string): Sql {
  return postgres({
    host: HOST,
    port: PORT,
    username: "postgres",
    password: PASSWORD,
    database,
    max: 4,
    onnotice: () => {},
    transform: { undefined: null },
  });
}

export async function createDatabase(name: string): Promise<Sql> {
  const admin = connect("postgres");
  try {
    await admin.unsafe(`DROP DATABASE IF EXISTS "${name}"`);
    await admin.unsafe(`CREATE DATABASE "${name}"`);
  } finally {
    await admin.end();
  }
  return connect(name);
}

// The rig runs the REAL base schema files rather than hand-written DDL, so its
// tables cannot drift from production. Migrations are deliberately not replayed
// — validate_migrations already proves base schema ≡ base + migrations.
export async function loadSchemaFile(sql: Sql, path: string): Promise<void> {
  const text = await Deno.readTextFile(path);
  await sql.unsafe(text);
}

export type Failure = { case: string; detail: string };

// Rows come back in whatever order the planner chose — the queries carry no
// ORDER BY — so equality is multiset equality, not sequence equality.
export function canonicalise(rows: Record<string, unknown>[]): string {
  return JSON.stringify(
    rows
      .map((r) =>
        Object.keys(r)
          .sort()
          .map((k) => [k, r[k]])
      )
      .map((pairs) => JSON.stringify(pairs))
      .sort()
  );
}

export function rowsMatch(
  actual: Record<string, unknown>[],
  expected: Record<string, unknown>[]
): boolean {
  return canonicalise(actual) === canonicalise(expected);
}
