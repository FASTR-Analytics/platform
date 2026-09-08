import { dirname, join } from "@std/path";
import { Sql } from "postgres";
import { _INSTANCE_LANGUAGE } from "../../exposed_env_vars.ts";

// A TypeScript migration runs inside the migration transaction and throws on
// failure, never Deno.exit, so this runner stays the single rollback and
// fail-stop funnel. Every statement it issues, and every helper it calls,
// goes through `tx`. Rules: PROTOCOL_APP_MIGRATIONS "TypeScript Migrations".
export type TsMigration = (tx: Sql) => Promise<void>;

// Literal-keyed so `deno check main.ts` covers every migration module. The
// key is the migration id (filename minus extension) and sorts with the .sql
// filenames. Empty until the consolidation migration leaves
// consolidation/staged/ (PLAN_PRODUCTS_RESTRUCTURE step 9b).
const TS_MIGRATIONS: Record<string, TsMigration> = {};

type MigrationType = "instance" | "project";

interface MigrationFile {
  id: string;
  filename: string;
  filepath: string;
  run: TsMigration | null; // null = read filepath as SQL
}

export class MigrationFailure extends Error {
  constructor(readonly filename: string, cause: unknown) {
    super(cause instanceof Error ? cause.message : String(cause), { cause });
  }
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
  try {
    await runMigrationsInDir(
      sql,
      join(MIGRATIONS_BASE_DIR, type),
      TS_MIGRATIONS,
      type
    );
  } catch (error) {
    const filename = error instanceof MigrationFailure ? error.filename : "?";
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`\n[sql-migration] FAILED: ${filename}`);
    console.error(`Error: ${errorMessage}`);
    console.error(`\n[sql-migration] FAILED — Server will not start. Fix the migration and redeploy.\n`);
    Deno.exit(1);
  }
}

// Applies every pending migration in `dir` in filename order, .sql and .ts
// together. Throws MigrationFailure at the first failure, with the earlier
// migrations left applied. Exported so ./validate_consolidation_replay can
// drive it over a throwaway directory that includes the staged migrations.
export async function runMigrationsInDir(
  sql: Sql,
  dir: string,
  tsMigrations: Record<string, TsMigration>,
  label: string
): Promise<void> {
  await ensureMigrationsTableExists(sql);

  const migrationFiles = await getMigrationFiles(dir, tsMigrations);
  const appliedMigrations = await getAppliedMigrations(sql);

  const pendingMigrations = migrationFiles.filter(
    (m) => !appliedMigrations.has(m.id)
  );

  if (pendingMigrations.length === 0) {
    return;
  }

  console.log(
    `Running ${pendingMigrations.length} ${label} migration(s)...`
  );

  for (const migration of pendingMigrations) {
    try {
      await applyMigration(sql, migration);
    } catch (error) {
      throw new MigrationFailure(migration.filename, error);
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

async function getMigrationFiles(
  dir: string,
  tsMigrations: Record<string, TsMigration>
): Promise<MigrationFile[]> {
  try {
    const entries: MigrationFile[] = [];
    for await (const entry of Deno.readDir(dir)) {
      if (!entry.isFile) {
        continue;
      }
      const isSql = entry.name.endsWith(".sql");
      const isTs = entry.name.endsWith(".ts");
      if (!isSql && !isTs) {
        continue;
      }
      const id = entry.name.replace(/\.(sql|ts)$/, "");
      const run = isTs ? tsMigrations[id] : undefined;
      if (isTs && run === undefined) {
        throw new Error(
          `Migration ${entry.name} has no entry in TS_MIGRATIONS (server/db/migrations/runner.ts). Register it, or it would be silently skipped.`
        );
      }
      entries.push({
        id,
        filename: entry.name,
        filepath: join(dir, entry.name),
        run: run ?? null,
      });
    }

    return entries.sort((a, b) => a.filename.localeCompare(b.filename));
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

  const migrationSQL =
    migration.run === null ? await Deno.readTextFile(migration.filepath) : null;

  await sql.begin(async (tx) => {
    // Transaction-local, so a migration that seeds user-facing text (079's
    // bucket labels) can read the instance language with
    // current_setting('fastr.instance_language', true). ./validate_migrations
    // runs files through psql without it, so every reader defaults to 'en'.
    await tx.unsafe(
      "SELECT set_config('fastr.instance_language', $1, true)",
      [_INSTANCE_LANGUAGE],
    );
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
