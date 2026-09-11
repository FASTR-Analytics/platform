// Applies the pending instance migrations to each restored dump and asserts
// PLAN_A3 §5 gate 6 over the result. Run through ./validate_indicator_sources,
// which supplies the container, the restored databases and the env. Each
// argument is `label=dbname`.

import { join } from "@std/path";
import postgres, { type Sql } from "postgres";
import {
  generateIndicatorId,
  isSpecialIndicatorId,
  RESERVED_WORDS,
} from "lib";

const MIGRATIONS_DIR = new URL("./server/db/migrations/instance/", import.meta.url)
  .pathname;

// The keys ruling 4 retires from every stored JSON shape.
const RETIRED_KEYS = [
  "rawIndicatorIds",
  "indicatorRawId",
  "route",
  "computedIndicators",
  "raw_indicator_id",
  "indicator_raw_id",
  "rawIndicatorsToInclude",
  "commonIndicatorsToInclude",
  "indicatorType",
  "unmappedIndicators",
  "indicatorCommonId",
];

type Outcome = { label: string; ok: boolean; lines: string[] };

function connect(dbname: string): Sql {
  return postgres({
    host: Deno.env.get("PG_HOST") ?? "127.0.0.1",
    port: Number(Deno.env.get("PG_PORT") ?? "5432"),
    user: "postgres",
    password: Deno.env.get("PG_PASSWORD") ?? "",
    database: dbname,
    max: 2,
    onnotice: () => {},
  });
}

async function tableExists(sql: Sql, name: string): Promise<boolean> {
  const rows = await sql<{ exists: boolean }[]>`
    SELECT EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = ${name}
    ) AS exists
  `;
  return rows[0].exists;
}

async function columnExists(sql: Sql, table: string, column: string): Promise<boolean> {
  const rows = await sql<{ exists: boolean }[]>`
    SELECT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = ${table} AND column_name = ${column}
    ) AS exists
  `;
  return rows[0].exists;
}

async function constraintExists(sql: Sql, name: string): Promise<boolean> {
  const rows = await sql<{ exists: boolean }[]>`
    SELECT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = ${name}) AS exists
  `;
  return rows[0].exists;
}

async function migrationFiles(): Promise<{ id: string; path: string }[]> {
  const entries: { id: string; path: string }[] = [];
  for await (const entry of Deno.readDir(MIGRATIONS_DIR)) {
    if (entry.isFile && entry.name.endsWith(".sql") && !entry.name.startsWith("_")) {
      entries.push({
        id: entry.name.replace(/\.sql$/, ""),
        path: join(MIGRATIONS_DIR, entry.name),
      });
    }
  }
  return entries.sort((a, b) => a.id.localeCompare(b.id));
}

async function pendingMigrations(sql: Sql): Promise<{ id: string; path: string }[]> {
  await sql`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      migration_id text PRIMARY KEY NOT NULL,
      applied_at timestamptz NOT NULL DEFAULT NOW()
    )
  `;
  const applied = new Set(
    (await sql<{ migration_id: string }[]>`SELECT migration_id FROM schema_migrations`)
      .map((r) => r.migration_id),
  );
  return (await migrationFiles()).filter((m) => !applied.has(m.id));
}

// One transaction per file, recorded only on success: what the runner does.
async function applyMigration(sql: Sql, m: { id: string; path: string }): Promise<void> {
  const text = await Deno.readTextFile(m.path);
  await sql.begin(async (tx) => {
    await tx.unsafe("SELECT set_config('fastr.instance_language', 'en', true)");
    await tx.unsafe(text);
    await tx`INSERT INTO schema_migrations (migration_id) VALUES (${m.id})`;
  });
}

function retiredKeysIn(value: unknown, path = "$"): string[] {
  if (Array.isArray(value)) {
    return value.flatMap((v, i) => retiredKeysIn(v, `${path}[${i}]`));
  }
  if (value !== null && typeof value === "object") {
    const found: string[] = [];
    for (const [key, v] of Object.entries(value as Record<string, unknown>)) {
      if (RETIRED_KEYS.includes(key)) found.push(`${path}.${key}`);
      found.push(...retiredKeysIn(v, `${path}.${key}`));
    }
    return found;
  }
  return [];
}

type PreState = {
  indicatorIds: string[];
  mappings: { indicator_raw_id: string; indicator_common_id: string }[];
  raws: { indicator_raw_id: string; indicator_raw_label: string }[];
  sumsByCommon: Map<string, number>;
  sumsByRaw: Map<string, number>;
  runRows: number;
  versionRows: number;
  scheduleRows: number;
};

async function readPreState(sql: Sql): Promise<PreState> {
  const indicatorIds = (
    await sql<{ indicator_common_id: string }[]>`SELECT indicator_common_id FROM indicators`
  ).map((r) => r.indicator_common_id);
  const mappings = await sql<{ indicator_raw_id: string; indicator_common_id: string }[]>`
    SELECT indicator_raw_id, indicator_common_id FROM indicator_mappings
  `;
  const raws = await sql<{ indicator_raw_id: string; indicator_raw_label: string }[]>`
    SELECT indicator_raw_id, indicator_raw_label FROM indicators_raw ORDER BY indicator_raw_id
  `;
  const sumsByCommon = new Map(
    (await sql<{ id: string; sum: string }[]>`
      SELECT im.indicator_common_id AS id, COALESCE(SUM(d.count), 0)::text AS sum
      FROM dataset_hmis d
      JOIN indicator_mappings im ON im.indicator_raw_id = d.indicator_raw_id
      JOIN indicators i ON i.indicator_common_id = im.indicator_common_id AND i.definition_type = 'base'
      GROUP BY im.indicator_common_id
    `).map((r) => [r.id, Number(r.sum)]),
  );
  const sumsByRaw = new Map(
    (await sql<{ id: string; sum: string }[]>`
      SELECT indicator_raw_id AS id, COALESCE(SUM(count), 0)::text AS sum
      FROM dataset_hmis GROUP BY indicator_raw_id
    `).map((r) => [r.id, Number(r.sum)]),
  );
  const count = async (table: string) =>
    Number((await sql.unsafe<{ n: string }[]>(`SELECT COUNT(*)::text AS n FROM ${table}`))[0].n);
  return {
    indicatorIds,
    mappings,
    raws,
    sumsByCommon,
    sumsByRaw,
    runRows: await count("dataset_hmis_import_runs"),
    versionRows: await count("dataset_hmis_versions"),
    scheduleRows: await count("dataset_hmis_scheduled_imports"),
  };
}

async function assertBlockedLeftEverythingIntact(sql: Sql, lines: string[]): Promise<boolean> {
  let ok = true;
  const check = async (name: string, expected: boolean, actual: Promise<boolean>) => {
    const value = await actual;
    if (value !== expected) {
      ok = false;
      lines.push(`  after the fail-stop, ${name} should be ${expected} but is ${value}`);
    }
  };
  await check("indicators_raw exists", true, tableExists(sql, "indicators_raw"));
  await check("indicator_mappings exists", true, tableExists(sql, "indicator_mappings"));
  await check("indicator_sources exists", false, tableExists(sql, "indicator_sources"));
  await check("dataset_hmis.indicator_raw_id exists", true, columnExists(sql, "dataset_hmis", "indicator_raw_id"));
  await check("indicators.is_default exists", true, columnExists(sql, "indicators", "is_default"));
  const recorded = await sql<{ n: string }[]>`
    SELECT COUNT(*)::text AS n FROM schema_migrations WHERE migration_id = '086_indicator_sources'
  `;
  if (Number(recorded[0].n) !== 0) {
    ok = false;
    lines.push("  after the fail-stop, 086 is recorded in schema_migrations");
  }
  return ok;
}

async function assertMigrated(sql: Sql, pre: PreState, lines: string[]): Promise<boolean> {
  const problems: string[] = [];

  // Tables and columns.
  if (await tableExists(sql, "indicators_raw")) problems.push("indicators_raw still exists");
  if (await tableExists(sql, "indicator_mappings")) problems.push("indicator_mappings still exists");
  if (!(await tableExists(sql, "indicator_sources"))) problems.push("indicator_sources missing");
  if (!(await columnExists(sql, "dataset_hmis", "source_id"))) problems.push("dataset_hmis.source_id missing");
  if (!(await columnExists(sql, "dataset_hmis_import_ledger", "source_id"))) problems.push("ledger.source_id missing");
  if (await columnExists(sql, "indicators", "is_default")) problems.push("indicators.is_default still exists");
  if (!(await constraintExists(sql, "dataset_hmis_source_id_fkey"))) problems.push("dataset_hmis_source_id_fkey missing");
  if (!(await constraintExists(sql, "dataset_hmis_import_ledger_source_id_fkey"))) problems.push("dataset_hmis_import_ledger_source_id_fkey missing");
  if (problems.length > 0) {
    lines.push(...problems.map((p) => `  ${p}`));
    return false;
  }

  // Sources = mapped raws; new bases = unmapped raws with the lib's ids.
  const sources = await sql<{ source_id: string; indicator_id: string; source_label: string }[]>`
    SELECT source_id, indicator_id, source_label FROM indicator_sources ORDER BY source_id
  `;
  const indicators = await sql<{ id: string; label: string; type: string }[]>`
    SELECT indicator_common_id AS id, indicator_common_label AS label, definition_type AS type FROM indicators
  `;
  const preIds = new Set(pre.indicatorIds);
  const sourceById = new Map(sources.map((s) => [s.source_id, s]));
  const mappedRawIds = new Set(pre.mappings.map((m) => m.indicator_raw_id));
  for (const m of pre.mappings) {
    const s = sourceById.get(m.indicator_raw_id);
    if (!s || s.indicator_id !== m.indicator_common_id) {
      problems.push(`mapped raw ${m.indicator_raw_id} -> ${m.indicator_common_id} is not its source`);
    }
  }
  const taken = new Set<string>([...pre.indicatorIds, ...RESERVED_WORDS]);
  const newBaseIds: string[] = [];
  for (const raw of pre.raws) {
    if (mappedRawIds.has(raw.indicator_raw_id)) continue;
    const expectedId = generateIndicatorId({
      label: raw.indicator_raw_label,
      sourceId: raw.indicator_raw_id,
      existingIds: taken,
    });
    taken.add(expectedId);
    newBaseIds.push(expectedId);
    const s = sourceById.get(raw.indicator_raw_id);
    if (!s) {
      problems.push(`unmapped raw ${raw.indicator_raw_id} has no source row`);
      continue;
    }
    if (s.indicator_id !== expectedId) {
      problems.push(`unmapped raw ${raw.indicator_raw_id}: base id ${s.indicator_id}, lib generates ${expectedId}`);
    }
    const base = indicators.find((i) => i.id === s.indicator_id);
    if (!base) {
      problems.push(`unmapped raw ${raw.indicator_raw_id}: base ${s.indicator_id} missing`);
    } else {
      if (base.type !== "base") problems.push(`new base ${base.id} is ${base.type}`);
      if (base.label !== raw.indicator_raw_label) problems.push(`new base ${base.id} label differs from raw label`);
      if (preIds.has(base.id)) problems.push(`new base ${base.id} existed before`);
    }
    if (!/^[a-z][a-z0-9_]*$/.test(s.indicator_id)) problems.push(`new base ${s.indicator_id} is not bare`);
    if (RESERVED_WORDS.includes(s.indicator_id)) problems.push(`new base ${s.indicator_id} is a reserved word`);
    if (isSpecialIndicatorId(s.indicator_id)) problems.push(`new base ${s.indicator_id} is a special id`);
  }
  if (new Set(newBaseIds).size !== newBaseIds.length) problems.push("generated ids are not unique");
  if (sources.length !== pre.raws.length) {
    problems.push(`${sources.length} sources for ${pre.raws.length} raws`);
  }

  // Extract sums per base, before and after.
  const sumsAfter = new Map(
    (await sql<{ id: string; sum: string }[]>`
      SELECT s.indicator_id AS id, COALESCE(SUM(d.count), 0)::text AS sum
      FROM dataset_hmis d
      JOIN indicator_sources s ON s.source_id = d.source_id
      JOIN indicators i ON i.indicator_common_id = s.indicator_id AND i.definition_type = 'base'
      GROUP BY s.indicator_id
    `).map((r) => [r.id, Number(r.sum)]),
  );
  for (const [id, sum] of pre.sumsByCommon) {
    if (sumsAfter.get(id) !== sum) problems.push(`sum for ${id}: ${sum} before, ${sumsAfter.get(id)} after`);
  }
  for (const raw of pre.raws) {
    if (mappedRawIds.has(raw.indicator_raw_id)) continue;
    const s = sourceById.get(raw.indicator_raw_id);
    const before = pre.sumsByRaw.get(raw.indicator_raw_id) ?? 0;
    const after = s ? (sumsAfter.get(s.indicator_id) ?? 0) : undefined;
    if (before !== after) problems.push(`sum for new base of ${raw.indicator_raw_id}: ${before} before, ${after} after`);
  }
  const expectedBases = new Set([...pre.sumsByCommon.keys(), ...newBaseIds.filter((id) => sumsAfter.has(id))]);
  for (const id of sumsAfter.keys()) {
    if (!expectedBases.has(id)) problems.push(`unexpected base with data after: ${id}`);
  }

  // Stored JSON.
  const scan = async (table: string, column: string, expected: number, check: (v: unknown) => string[]) => {
    const rows = await sql.unsafe<{ id: number; value: string | null }[]>(
      `SELECT id, ${column} AS value FROM ${table} ORDER BY id`,
    );
    if (rows.length !== expected) problems.push(`${table}: ${rows.length} rows, ${expected} before`);
    for (const row of rows) {
      if (row.value === null) continue;
      let parsed: unknown;
      try {
        parsed = JSON.parse(row.value);
      } catch {
        problems.push(`${table}.${column} row ${row.id} does not parse`);
        continue;
      }
      for (const found of retiredKeysIn(parsed)) problems.push(`${table}.${column} row ${row.id} carries ${found}`);
      for (const p of check(parsed)) problems.push(`${table}.${column} row ${row.id}: ${p}`);
    }
  };
  const isRecord = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === "object";
  await scan("dataset_hmis_import_runs", "selection", pre.runRows, (v) => {
    if (!isRecord(v)) return ["not an object"];
    if (v.kind === "window") {
      return ["indicatorIds", "sourceIds", "populationTermsDropped", "nonDhis2SourcesDropped"]
        .filter((k) => !Array.isArray(v[k])).map((k) => `window selection lacks ${k}`);
    }
    if (v.kind === "pairs") {
      return Array.isArray(v.pairs) && v.pairs.every((p) => isRecord(p) && typeof p.sourceId === "string")
        ? [] : ["pairs lack sourceId"];
    }
    return [`unknown kind ${String(v.kind)}`];
  });
  await scan("dataset_hmis_import_runs", "run_stats", pre.runRows, (v) => {
    if (!isRecord(v)) return ["not an object"];
    const out: string[] = [];
    if (isRecord(v.classification)) {
      if (!Array.isArray(v.classification.dhis2IndicatorIds)) out.push("classification lacks dhis2IndicatorIds");
    }
    if (Array.isArray(v.pairFetchStats)) {
      for (const s of v.pairFetchStats) {
        if (!isRecord(s) || typeof s.sourceId !== "string" || typeof s.skippedValues !== "number") {
          out.push("a pair stat lacks sourceId or skippedValues");
          break;
        }
      }
    }
    return out;
  });
  await scan("dataset_hmis_import_runs", "progress", pre.runRows, () => []);
  await scan("dataset_hmis_import_runs", "csv_config", pre.runRows, (v) =>
    isRecord(v) && isRecord(v.mappings) && typeof v.mappings.source_id !== "string" ? ["mappings lack source_id"] : []);
  await scan("dataset_hmis_versions", "staging_result", pre.versionRows, () => []);
  await scan("dataset_hmis_scheduled_imports", "selection", pre.scheduleRows, (v) =>
    isRecord(v) && !Array.isArray(v.indicatorIds) ? ["schedule selection lacks indicatorIds"] : []);

  // A second run does nothing.
  const pending = await pendingMigrations(sql);
  if (pending.length > 0) problems.push(`${pending.length} migrations still pending after the run`);

  // The id table 086 raises as NOTICEs (which the app's migration runner
  // suppresses): what each unmapped raw became.
  for (const raw of pre.raws) {
    if (mappedRawIds.has(raw.indicator_raw_id)) continue;
    const s = sourceById.get(raw.indicator_raw_id);
    lines.push(`    new base ${s?.indicator_id ?? "?"} <- ${raw.indicator_raw_id} (${raw.indicator_raw_label})`);
  }
  lines.push(`  ${pre.mappings.length} sources from mappings, ${newBaseIds.length} new bases from unmapped raws`);
  lines.push(`  ${pre.sumsByCommon.size} bases with data compared, ${pre.runRows} run rows, ${pre.versionRows} version rows, ${pre.scheduleRows} schedules parsed`);
  if (problems.length > 0) {
    lines.push(...problems.map((p) => `  ${p}`));
    return false;
  }
  return true;
}

async function validateDump(label: string, dbname: string): Promise<Outcome> {
  const sql = connect(dbname);
  const lines: string[] = [];
  try {
    if (!(await tableExists(sql, "indicators_raw"))) {
      const pending = await pendingMigrations(sql);
      lines.push("  already migrated (no indicators_raw): only the second-run check applies");
      if (pending.length > 0) {
        lines.push(`  ${pending.length} migrations pending: ${pending.map((m) => m.id).join(", ")}`);
        return { label, ok: false, lines };
      }
      return { label, ok: true, lines };
    }
    const pre = await readPreState(sql);
    const pending = await pendingMigrations(sql);
    lines.push(`  applying ${pending.length} pending migration(s): ${pending.map((m) => m.id).join(", ")}`);
    for (const m of pending) {
      try {
        await applyMigration(sql, m);
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        if (m.id !== "086_indicator_sources") {
          lines.push(`  ${m.id} failed: ${message}`);
          return { label, ok: false, lines };
        }
        lines.push(`  086 fail-stopped: ${message}`);
        const intact = await assertBlockedLeftEverythingIntact(sql, lines);
        lines.push(intact ? "  nothing else changed (old tables, columns and the migration record intact)" : "  the fail-stop left changes behind");
        return { label, ok: false, lines };
      }
    }
    const ok = await assertMigrated(sql, pre, lines);
    return { label, ok, lines };
  } finally {
    await sql.end();
  }
}

const targets = Deno.args.map((arg) => {
  const i = arg.lastIndexOf("=");
  return { label: arg.slice(0, i), dbname: arg.slice(i + 1) };
});
let allOk = true;
for (const t of targets) {
  const outcome = await validateDump(t.label, t.dbname);
  console.log(`${outcome.ok ? "PASS" : "FAIL"} ${outcome.label}`);
  for (const line of outcome.lines) console.log(line);
  allOk &&= outcome.ok;
}
Deno.exit(allOk ? 0 : 1);
