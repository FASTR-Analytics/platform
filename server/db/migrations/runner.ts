import { dirname, join } from "@std/path";
import { Sql } from "postgres";
import { consolidateProjects } from "./instance/080_consolidate_projects.ts";

// A TypeScript migration. It runs inside the migration transaction and must
// THROW on any failure (never Deno.exit): the runner below is the single
// rollback + fail-stop funnel, exactly as it is for a .sql file. Every main-DB
// statement it issues — and every helper it calls — must go through `tx`.
export type TsMigration = (tx: Sql) => Promise<void>;

// Literal-keyed so `deno check main.ts` covers every migration module. The key
// is the migration id (filename minus extension); it sorts alongside the .sql
// filenames.
const TS_MIGRATIONS: Record<string, TsMigration> = {
  "080_consolidate_projects": consolidateProjects,
};

interface MigrationFile {
  id: string;
  filename: string;
  filepath: string;
  run: TsMigration | null; // null = read filepath as SQL
}

// Get the directory of this file, which is server/db/migrations/
const MIGRATIONS_BASE_DIR = dirname(new URL(import.meta.url).pathname);
const INSTANCE_MIGRATIONS_DIR = join(MIGRATIONS_BASE_DIR, "instance");

export async function runInstanceMigrations(sql: Sql): Promise<void> {
  await ensureMigrationsTableExists(sql);

  const migrationFiles = await getMigrationFiles();
  const appliedMigrations = await getAppliedMigrations(sql);

  const pendingMigrations = migrationFiles.filter(
    (m) => !appliedMigrations.has(m.id)
  );

  if (pendingMigrations.length === 0) {
    return;
  }

  console.log(`Running ${pendingMigrations.length} migration(s)...`);

  for (const migration of pendingMigrations) {
    try {
      await applyMigration(sql, migration);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`\n[sql-migration] FAILED: ${migration.filename}`);
      console.error(`Error: ${errorMessage}`);
      console.error(`\n[sql-migration] FAILED — Server will not start. Fix the migration and redeploy.\n`);
      Deno.exit(1);
    }
  }
}

async function ensureMigrationsTableExists(sql: Sql): Promise<void> {
  await sql`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      migration_id text PRIMARY KEY NOT NULL,
      applied_at timestamptz NOT NULL DEFAULT NOW()
    )
  `;
}

async function getMigrationFiles(): Promise<MigrationFile[]> {
  const entries: MigrationFile[] = [];
  for await (const entry of Deno.readDir(INSTANCE_MIGRATIONS_DIR)) {
    if (!entry.isFile) {
      continue;
    }
    const isSql = entry.name.endsWith(".sql");
    const isTs = entry.name.endsWith(".ts");
    if (!isSql && !isTs) {
      continue;
    }
    const id = entry.name.replace(/\.(sql|ts)$/, "");
    if (isTs && TS_MIGRATIONS[id] === undefined) {
      throw new Error(
        `Migration ${entry.name} has no entry in TS_MIGRATIONS (server/db/migrations/runner.ts). Add it or the migration would be silently skipped.`,
      );
    }
    entries.push({
      id,
      filename: entry.name,
      filepath: join(INSTANCE_MIGRATIONS_DIR, entry.name),
      run: isTs ? TS_MIGRATIONS[id] : null,
    });
  }

  return entries.sort((a, b) => a.filename.localeCompare(b.filename));
}

async function getAppliedMigrations(sql: Sql): Promise<Set<string>> {
  const rows = await sql<{ migration_id: string }[]>`
    SELECT migration_id FROM schema_migrations
  `;
  return new Set(rows.map((r) => r.migration_id));
}

async function applyMigration(sql: Sql, migration: MigrationFile): Promise<void> {
  console.log(`  Applying migration: ${migration.filename}`);

  const migrationSQL =
    migration.run === null ? await Deno.readTextFile(migration.filepath) : null;

  await sql.begin(async (tx) => {
    if (migration.run !== null) {
      await migration.run(tx);
    } else {
      await tx.unsafe(migrationSQL!);
    }
    await tx`
      INSERT INTO schema_migrations (migration_id)
      VALUES (${migration.id})
    `;
  });

  console.log(`  ✓ ${migration.filename}`);
}
