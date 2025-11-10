import { dirname, join } from "@std/path";
import { Sql } from "postgres";

type MigrationType = "instance" | "project";

interface MigrationFile {
  id: string;
  filename: string;
  filepath: string;
}

// Get the directory of this file, which is server/db/migrations/
const MIGRATIONS_BASE_DIR = dirname(new URL(import.meta.url).pathname);

export async function runInstanceMigrations(sql: Sql): Promise<void> {
  await runMigrationsForDatabase(sql, "instance");
}

export async function runProjectMigrations(sql: Sql): Promise<void> {
  await runMigrationsForDatabase(sql, "project");
}

async function runMigrationsForDatabase(
  sql: Sql,
  type: MigrationType
): Promise<void> {
  await ensureMigrationsTableExists(sql);

  const migrationFiles = await getMigrationFiles(type);
  const appliedMigrations = await getAppliedMigrations(sql);

  const pendingMigrations = migrationFiles.filter(
    (m) => !appliedMigrations.has(m.id)
  );

  if (pendingMigrations.length === 0) {
    return;
  }

  console.log(
    `Running ${pendingMigrations.length} ${type} migration(s)...`
  );

  for (const migration of pendingMigrations) {
    try {
      await applyMigration(sql, migration);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`\n❌ MIGRATION FAILED: ${migration.filename}`);
      console.error(`Error: ${errorMessage}`);
      console.error(`\nServer startup aborted. Fix the migration and restart.\n`);
      throw new Error(
        `Migration failed: ${migration.filename}. ${errorMessage}`
      );
    }
  }

  // Verify all migrations were applied successfully
  const finalAppliedMigrations = await getAppliedMigrations(sql);
  const failedMigrations = pendingMigrations.filter(
    (m) => !finalAppliedMigrations.has(m.id)
  );

  if (failedMigrations.length > 0) {
    const failedNames = failedMigrations.map((m) => m.filename).join(", ");
    throw new Error(
      `Migrations did not apply successfully: ${failedNames}`
    );
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

async function getMigrationFiles(type: MigrationType): Promise<MigrationFile[]> {
  // Use relative path from this file's location
  const migrationDir = join(MIGRATIONS_BASE_DIR, type);

  try {
    const entries = [];
    for await (const entry of Deno.readDir(migrationDir)) {
      if (entry.isFile && entry.name.endsWith(".sql")) {
        entries.push(entry);
      }
    }

    return entries
      .map((entry) => ({
        id: entry.name.replace(/\.sql$/, ""),
        filename: entry.name,
        filepath: join(migrationDir, entry.name),
      }))
      .sort((a, b) => a.filename.localeCompare(b.filename));
  } catch (e) {
    if (e instanceof Deno.errors.NotFound) {
      return [];
    }
    throw e;
  }
}

async function getAppliedMigrations(sql: Sql): Promise<Set<string>> {
  const rows = await sql<{ migration_id: string }[]>`
    SELECT migration_id FROM schema_migrations
  `;
  return new Set(rows.map((r) => r.migration_id));
}

async function applyMigration(sql: Sql, migration: MigrationFile): Promise<void> {
  console.log(`  Applying migration: ${migration.filename}`);

  const migrationSQL = await Deno.readTextFile(migration.filepath);

  await sql.begin(async (tx) => {
    await tx.unsafe(migrationSQL);
    await tx`
      INSERT INTO schema_migrations (migration_id)
      VALUES (${migration.id})
    `;
  });

  console.log(`  ✓ ${migration.filename}`);
}
