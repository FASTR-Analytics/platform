// Applies the pending instance migrations to each restored dump and asserts
// PLAN_A4 §5 gate 5 over the result. Run through ./validate_indicator_migration,
// which supplies the container, the restored databases and the env. Each
// argument is `label=dbname`.

import { join } from "@std/path";
import postgres, { type Sql } from "postgres";
import {
  analysedIndicatorIds,
  type CommonIndicator,
  generateIndicatorId,
  isDhis2ShapedId,
  isSpecialIndicatorId,
  POPULATION_TYPE_IDS,
  RESERVED_WORDS,
} from "lib";

const MIGRATIONS_DIR = new URL("./server/db/migrations/instance/", import.meta.url)
  .pathname;

// The keys 086 retires from every stored JSON shape.
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
  "sourceId",
  "sourceIds",
  "source_id",
  "sourcesToInclude",
  "unknownSources",
  "nonDhis2SourcesDropped",
  "grain",
];

type Outcome = { label: string; ok: boolean; lines: string[] };

function connect(dbname: string, onnotice: (n: postgres.Notice) => void): Sql {
  return postgres({
    host: Deno.env.get("PG_HOST") ?? "127.0.0.1",
    port: Number(Deno.env.get("PG_PORT") ?? "5432"),
    user: "postgres",
    password: Deno.env.get("PG_PASSWORD") ?? "",
    database: dbname,
    max: 2,
    onnotice,
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

type PreCommon = {
  id: string;
  label: string;
  type: "base" | "derived";
  expression: string | null;
};

type PreState = {
  commons: PreCommon[];
  mappings: { indicator_raw_id: string; indicator_common_id: string }[];
  // In the database's own order, the order 086 walks them.
  raws: { indicator_raw_id: string; indicator_raw_label: string }[];
  sumsByCommon: Map<string, number>;
  sumsByRaw: Map<string, number>;
  dataRows: number;
  ledgerRows: number;
  runRows: number;
  versionRows: number;
  scheduleRows: number;
};

async function readPreState(sql: Sql): Promise<PreState> {
  const commons = await sql<PreCommon[]>`
    SELECT indicator_common_id AS id, indicator_common_label AS label,
      definition_type AS type, expression
    FROM indicators ORDER BY indicator_common_id
  `;
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
    commons,
    mappings,
    raws,
    sumsByCommon,
    sumsByRaw,
    dataRows: await count("dataset_hmis"),
    ledgerRows: await count("dataset_hmis_import_ledger"),
    runRows: await count("dataset_hmis_import_runs"),
    versionRows: await count("dataset_hmis_versions"),
    scheduleRows: await count("dataset_hmis_scheduled_imports"),
  };
}

// lib getNewIndicatorIdIssue's charset rule, as 086 restates it for a CSV
// raw keeping its own id.
function charsetOk(id: string): boolean {
  return id !== "" && id.trim() === id && !/[,;:[\]]/.test(id) && id.length <= 128;
}

type Expected = {
  // raw id → the indicator it becomes, and whether it folded.
  rawTarget: Map<string, { id: string; folded: boolean }>;
  generatedIds: string[];
  // pre common id → sum members (the commons that become sums).
  sums: Map<string, string[]>;
  // derived special id → its new id.
  renamedSpecials: Map<string, string>;
};

// Ruling 10 restated over the pre-state, with lib's own generator, so the
// migration's PL/pgSQL is checked against the TypeScript spelling.
function expectedOutcome(pre: PreState): Expected {
  const commonById = new Map(pre.commons.map((c) => [c.id, c]));
  const mappingsByRaw = new Map<string, string[]>();
  const mappingsByCommon = new Map<string, string[]>();
  for (const m of pre.mappings) {
    mappingsByRaw.set(m.indicator_raw_id, [
      ...(mappingsByRaw.get(m.indicator_raw_id) ?? []),
      m.indicator_common_id,
    ]);
    mappingsByCommon.set(m.indicator_common_id, [
      ...(mappingsByCommon.get(m.indicator_common_id) ?? []),
      m.indicator_raw_id,
    ]);
  }
  const rawTarget = new Map<string, { id: string; folded: boolean }>();
  const taken = new Set(pre.commons.map((c) => c.id));
  for (const raw of pre.raws) {
    const commons = mappingsByRaw.get(raw.indicator_raw_id) ?? [];
    if (
      commons.length === 1 &&
      commonById.get(commons[0])?.type === "base" &&
      (mappingsByCommon.get(commons[0]) ?? []).length === 1 &&
      isDhis2ShapedId(raw.indicator_raw_id)
    ) {
      rawTarget.set(raw.indicator_raw_id, { id: commons[0], folded: true });
    }
  }
  const generatedIds: string[] = [];
  for (const raw of pre.raws) {
    if (rawTarget.has(raw.indicator_raw_id)) continue;
    const id = raw.indicator_raw_id;
    let target: string;
    if (
      !isDhis2ShapedId(id) && charsetOk(id) && !taken.has(id) &&
      (!RESERVED_WORDS.includes(id) || isSpecialIndicatorId(id))
    ) {
      target = id;
    } else {
      target = generateIndicatorId({
        label: raw.indicator_raw_label,
        fallbackId: id,
        existingIds: taken,
      });
      generatedIds.push(target);
    }
    taken.add(target);
    rawTarget.set(id, { id: target, folded: false });
  }
  const sums = new Map<string, string[]>();
  for (const c of pre.commons) {
    if (c.type !== "base") continue;
    const raws = mappingsByCommon.get(c.id) ?? [];
    if (raws.length === 0) continue;
    if (raws.some((r) => rawTarget.get(r)?.folded)) continue;
    sums.set(c.id, [...new Set(raws.map((r) => rawTarget.get(r)!.id))].sort());
  }
  const renamedSpecials = new Map<string, string>();
  for (const c of pre.commons) {
    if (c.type !== "derived" || !isSpecialIndicatorId(c.id)) continue;
    let n = 2;
    while (taken.has(`${c.id}_${n}`) || RESERVED_WORDS.includes(`${c.id}_${n}`)) n++;
    renamedSpecials.set(c.id, `${c.id}_${n}`);
    taken.add(`${c.id}_${n}`);
  }
  return { rawTarget, generatedIds, sums, renamedSpecials };
}

type PostIndicator = {
  id: string;
  label: string;
  type: "base" | "sum" | "derived";
  expression: string | null;
  dhis2_id: string | null;
  members: string | null;
  include_in_analysis: boolean;
};

async function assertMigrated(sql: Sql, pre: PreState, lines: string[]): Promise<boolean> {
  const problems: string[] = [];

  // Tables, columns and constraints.
  if (await tableExists(sql, "indicators_raw")) problems.push("indicators_raw still exists");
  if (await tableExists(sql, "indicator_mappings")) problems.push("indicator_mappings still exists");
  if (await tableExists(sql, "indicator_sources")) problems.push("indicator_sources exists");
  if (!(await columnExists(sql, "dataset_hmis", "indicator_id"))) problems.push("dataset_hmis.indicator_id missing");
  if (!(await columnExists(sql, "dataset_hmis_import_ledger", "indicator_id"))) problems.push("ledger.indicator_id missing");
  if (await columnExists(sql, "indicators", "is_default")) problems.push("indicators.is_default still exists");
  for (const column of ["dhis2_id", "members", "include_in_analysis"]) {
    if (!(await columnExists(sql, "indicators", column))) problems.push(`indicators.${column} missing`);
  }
  for (const name of ["dataset_hmis_indicator_id_fkey", "dataset_hmis_import_ledger_indicator_id_fkey", "indicators_dhis2_id_key"]) {
    if (!(await constraintExists(sql, name))) problems.push(`${name} missing`);
  }
  if (problems.length > 0) {
    lines.push(...problems.map((p) => `  ${p}`));
    return false;
  }

  const expected = expectedOutcome(pre);
  const post = await sql<PostIndicator[]>`
    SELECT indicator_common_id AS id, indicator_common_label AS label,
      definition_type AS type, expression, dhis2_id, members, include_in_analysis
    FROM indicators
  `;
  const postById = new Map(post.map((i) => [i.id, i]));
  const preIds = new Set(pre.commons.map((c) => c.id));

  // Every raw became exactly one indicator or folded into exactly one common.
  for (const raw of pre.raws) {
    const target = expected.rawTarget.get(raw.indicator_raw_id)!;
    const i = postById.get(target.id);
    if (!i) {
      problems.push(`raw ${raw.indicator_raw_id}: expected indicator ${target.id} missing`);
      continue;
    }
    if (i.type !== "base") problems.push(`raw ${raw.indicator_raw_id}: ${target.id} is ${i.type}, not base`);
    const expectedDhis2Id = isDhis2ShapedId(raw.indicator_raw_id) ? raw.indicator_raw_id : null;
    if (i.dhis2_id !== expectedDhis2Id) {
      problems.push(`raw ${raw.indicator_raw_id}: ${target.id} carries dhis2_id ${i.dhis2_id}, expected ${expectedDhis2Id}`);
    }
    if (!target.folded) {
      if (i.label !== raw.indicator_raw_label) problems.push(`new base ${target.id} label differs from raw label`);
      if (preIds.has(target.id)) problems.push(`new base ${target.id} existed before`);
      if (i.include_in_analysis) problems.push(`new base ${target.id} is in the analysis`);
    } else if (!i.include_in_analysis) {
      problems.push(`folded common ${target.id} left the analysis`);
    }
  }
  const targets = [...expected.rawTarget.values()].map((t) => t.id);
  if (new Set(targets).size !== targets.length) problems.push("two raws became the same indicator");
  for (const id of expected.generatedIds) {
    if (!/^[a-z][a-z0-9_]*$/.test(id)) problems.push(`generated id ${id} is not bare`);
    if (RESERVED_WORDS.includes(id)) problems.push(`generated id ${id} is a reserved word`);
    if (isSpecialIndicatorId(id)) problems.push(`generated id ${id} is a special id`);
  }

  // Every common with mappings is a DHIS2 element or a sum over what its
  // raws became; a common without mappings stays as it was.
  for (const c of pre.commons) {
    const renamed = expected.renamedSpecials.get(c.id);
    const i = postById.get(renamed ?? c.id);
    if (!i) {
      problems.push(`common ${c.id} missing after`);
      continue;
    }
    if (!i.include_in_analysis) problems.push(`common ${c.id} left the analysis`);
    const members = expected.sums.get(c.id);
    if (members !== undefined) {
      if (i.type !== "sum") problems.push(`common ${c.id} should be a sum, is ${i.type}`);
      else if (JSON.stringify(JSON.parse(i.members ?? "[]").toSorted()) !== JSON.stringify(members)) {
        problems.push(`sum ${c.id}: members ${i.members}, expected ${JSON.stringify(members)}`);
      }
    } else if (c.type === "base") {
      if (i.type !== "base") problems.push(`common ${c.id} should stay a base, is ${i.type}`);
    } else if (i.type !== "derived") {
      problems.push(`derived ${c.id} should stay derived, is ${i.type}`);
    }
  }
  for (const [oldId, newId] of expected.renamedSpecials) {
    const emptyBase = postById.get(oldId);
    if (!emptyBase || emptyBase.type !== "base" || emptyBase.dhis2_id !== null || !emptyBase.include_in_analysis) {
      problems.push(`special ${oldId}: no empty base in the analysis after the derived was renamed`);
    }
    if (!postById.has(newId)) problems.push(`renamed derived ${newId} missing`);
    for (const i of post) {
      if (i.type === "derived" && i.expression !== null && new RegExp(`(?<![a-zA-Z0-9_])${oldId}(?![a-zA-Z0-9_])`).test(i.expression)) {
        problems.push(`derived ${i.id} still names ${oldId}: ${i.expression}`);
      }
    }
  }
  for (const i of post) {
    if (i.type === "derived" && isSpecialIndicatorId(i.id)) problems.push(`derived under special id ${i.id}`);
  }

  // The analysed set after equals the set of commons before (the renamed
  // derived under its new id, plus the empty base under the special id).
  // The set is ruling 3's, as the extract computes it (a checkbox on, a
  // special, or reached by a checked derived), never the checkbox alone: a
  // CSV raw kept under a special id lands with its checkbox off and is
  // analysed regardless.
  const expectedAnalysed = new Set([
    ...pre.commons.map((c) => expected.renamedSpecials.get(c.id) ?? c.id),
    ...expected.renamedSpecials.keys(),
  ]);
  const postCommons = post.map<CommonIndicator>((i) => ({
    indicator_common_id: i.id,
    indicator_common_label: i.label,
    definition: i.type === "base"
      ? { type: "base", dhis2_id: i.dhis2_id }
      : i.type === "sum"
      ? { type: "sum", members: JSON.parse(i.members ?? "[]") as string[] }
      : { type: "derived", expression: i.expression ?? "" },
    include_in_analysis: i.include_in_analysis,
    format_as: "number",
    thresholds: null,
    sort_order: 0,
  }));
  const analysedAfter = new Set([
    ...analysedIndicatorIds(postCommons, POPULATION_TYPE_IDS),
    ...post.filter((i) => i.type === "derived" && i.include_in_analysis).map((i) => i.id),
  ]);
  for (const id of expectedAnalysed) {
    if (!analysedAfter.has(id)) problems.push(`analysed set lost ${id}`);
  }
  for (const id of analysedAfter) {
    if (!expectedAnalysed.has(id)) problems.push(`analysed set gained ${id}`);
  }

  // The extract's per-indicator sums for that set, before and after.
  const sumsAfter = new Map(
    (await sql<{ id: string; sum: string }[]>`
      SELECT id, COALESCE(SUM(sum), 0)::text AS sum FROM (
        SELECT d.indicator_id AS id, SUM(d.count) AS sum
        FROM dataset_hmis d
        JOIN indicators i ON i.indicator_common_id = d.indicator_id AND i.definition_type = 'base'
        GROUP BY d.indicator_id
        UNION ALL
        SELECT i.indicator_common_id AS id, SUM(d.count) AS sum
        FROM indicators i
        CROSS JOIN LATERAL jsonb_array_elements_text(i.members::jsonb) AS m(member_id)
        JOIN dataset_hmis d ON d.indicator_id = m.member_id
        WHERE i.definition_type = 'sum'
        GROUP BY i.indicator_common_id
      ) t GROUP BY id
    `).map((r) => [r.id, Number(r.sum)]),
  );
  for (const [id, sum] of pre.sumsByCommon) {
    if (sumsAfter.get(id) !== sum) problems.push(`sum for ${id}: ${sum} before, ${sumsAfter.get(id)} after`);
  }
  for (const raw of pre.raws) {
    const target = expected.rawTarget.get(raw.indicator_raw_id)!;
    const before = pre.sumsByRaw.get(raw.indicator_raw_id) ?? 0;
    const after = sumsAfter.get(target.id) ?? 0;
    if (before !== after) problems.push(`sum for ${target.id} (raw ${raw.indicator_raw_id}): ${before} before, ${after} after`);
  }

  // Row counts and referential integrity.
  const count = async (table: string) =>
    Number((await sql.unsafe<{ n: string }[]>(`SELECT COUNT(*)::text AS n FROM ${table}`))[0].n);
  if ((await count("dataset_hmis")) !== pre.dataRows) problems.push("dataset_hmis row count changed");
  if ((await count("dataset_hmis_import_ledger")) !== pre.ledgerRows) problems.push("ledger row count changed");
  const orphans = await sql<{ n: string }[]>`
    SELECT COUNT(*)::text AS n FROM (
      SELECT indicator_id FROM dataset_hmis
      UNION ALL SELECT indicator_id FROM dataset_hmis_import_ledger
    ) r WHERE NOT EXISTS (SELECT 1 FROM indicators i WHERE i.indicator_common_id = r.indicator_id)
  `;
  if (Number(orphans[0].n) !== 0) problems.push(`${orphans[0].n} data or ledger rows point at no indicator`);

  // Stored JSON.
  const isRecord = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === "object";
  const isPair = (p: unknown) =>
    isRecord(p) && typeof p.indicatorId === "string" && typeof p.dhis2Id === "string" && typeof p.periodId === "number";
  const scan = async (table: string, column: string, expectedRows: number, check: (v: unknown) => string[]) => {
    const rows = await sql.unsafe<{ id: number; value: string | null }[]>(
      `SELECT id, ${column} AS value FROM ${table} ORDER BY id`,
    );
    if (rows.length !== expectedRows) problems.push(`${table}: ${rows.length} rows, ${expectedRows} before`);
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
  await scan("dataset_hmis_import_runs", "selection", pre.runRows, (v) => {
    if (!isRecord(v)) return ["not an object"];
    if (v.kind === "window") {
      const out = ["indicatorIds", "elements", "populationTermsDropped", "uploadedIndicatorsDropped"]
        .filter((k) => !Array.isArray(v[k])).map((k) => `window selection lacks ${k}`);
      if (Array.isArray(v.elements) && !v.elements.every((e) => isRecord(e) && typeof e.indicatorId === "string" && typeof e.dhis2Id === "string")) {
        out.push("an element lacks indicatorId or dhis2Id");
      }
      return out;
    }
    if (v.kind === "pairs") {
      return Array.isArray(v.pairs) && v.pairs.every(isPair) ? [] : ["pairs lack indicatorId, dhis2Id or periodId"];
    }
    return [`unknown kind ${String(v.kind)}`];
  });
  await scan("dataset_hmis_import_runs", "run_stats", pre.runRows, (v) => {
    if (!isRecord(v)) return ["not an object"];
    const out: string[] = [];
    if (isRecord(v.classification) && !Array.isArray(v.classification.dhis2IndicatorIds)) {
      out.push("classification lacks dhis2IndicatorIds");
    }
    if (Array.isArray(v.pairFetchStats)) {
      for (const s of v.pairFetchStats) {
        if (!isRecord(s) || typeof s.indicatorId !== "string" || typeof s.skippedValues !== "number") {
          out.push("a pair stat lacks indicatorId or skippedValues");
          break;
        }
      }
    }
    if (isRecord(v.csvStagingResult) && isRecord(v.csvStagingResult.validation) && !isRecord(v.csvStagingResult.validation.unknownIndicators)) {
      out.push("CSV staging result lacks unknownIndicators");
    }
    return out;
  });
  await scan("dataset_hmis_import_runs", "progress", pre.runRows, (v) =>
    isRecord(v) && Array.isArray(v.activePairs) && !v.activePairs.every(isPair) ? ["activePairs lack indicatorId"] : []);
  await scan("dataset_hmis_import_runs", "csv_config", pre.runRows, (v) =>
    isRecord(v) && isRecord(v.columns) && typeof v.columns.indicator_id !== "string" ? ["columns lack indicator_id"] : []);
  await scan("dataset_hmis_versions", "staging_result", pre.versionRows, (v) => {
    if (!isRecord(v)) return ["not an object"];
    const out: string[] = [];
    if (v.kind === "deletion" && isRecord(v.windowing) && !Array.isArray(v.windowing.indicatorsToInclude)) {
      out.push("deletion windowing lacks indicatorsToInclude");
    }
    if (Array.isArray(v.failedFetches) && !v.failedFetches.every((f) => isRecord(f) && typeof f.indicatorId === "string")) {
      out.push("failedFetches lack indicatorId");
    }
    if (Array.isArray(v.periodIndicatorStats) && !v.periodIndicatorStats.every((s) => isRecord(s) && typeof s.indicatorId === "string")) {
      out.push("periodIndicatorStats lack indicatorId");
    }
    return out;
  });
  await scan("dataset_hmis_scheduled_imports", "selection", pre.scheduleRows, (v) =>
    isRecord(v) && !Array.isArray(v.indicatorIds) ? ["schedule selection lacks indicatorIds"] : []);

  // A second run does nothing.
  const pending = await pendingMigrations(sql);
  if (pending.length > 0) problems.push(`${pending.length} migrations still pending after the run`);

  const folded = [...expected.rawTarget.values()].filter((t) => t.folded).length;
  lines.push(`  ${pre.raws.length} raws: ${folded} folded, ${pre.raws.length - folded} new bases (${expected.generatedIds.length} generated ids), ${expected.sums.size} sums, ${expected.renamedSpecials.size} derived specials renamed`);
  lines.push(`  ${pre.sumsByCommon.size} bases with data compared, ${pre.dataRows} data rows, ${pre.ledgerRows} ledger rows, ${pre.runRows} run rows, ${pre.versionRows} version rows, ${pre.scheduleRows} schedules parsed`);
  if (problems.length > 0) {
    lines.push(...problems.map((p) => `  ${p}`));
    return false;
  }
  return true;
}

async function validateDump(label: string, dbname: string): Promise<Outcome> {
  const lines: string[] = [];
  const notices: string[] = [];
  const sql = connect(dbname, (n) => {
    if (typeof n.message === "string" && n.message.startsWith("[086]")) notices.push(n.message);
  });
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
        lines.push(`  ${m.id} failed: ${e instanceof Error ? e.message : String(e)}`);
        return { label, ok: false, lines };
      }
    }
    // The id table, as 086 raised it.
    for (const n of notices) lines.push(`    ${n}`);
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
