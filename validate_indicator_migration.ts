// Applies the pending instance migrations to each restored dump and asserts
// PLAN_A5 §5 gate 5 over the result. Run through ./validate_indicator_migration,
// which supplies the container, the restored databases and the env. Each
// argument is `label=dbname`.

import { join } from "@std/path";
import postgres, { type Sql } from "postgres";
import {
  analysedIndicatorIds,
  generateIndicatorId,
  type HmisIndicator,
  type HmisIndicatorType,
  isDhis2ShapedId,
  isSpecialIndicatorId,
  POPULATION_TYPE_IDS,
  RESERVED_WORDS,
} from "lib";

// 087 keys every Uploaded row that 086 left without a data id.
const isGeneratedDataKey = (key: string | null): boolean => key !== null && key.startsWith("u_");

const MIGRATIONS_DIR = new URL("./server/db/migrations/instance/", import.meta.url)
  .pathname;

// The keys 086 retires from every stored JSON shape.
const RETIRED_KEYS = [
  "rawIndicatorIds",
  "indicatorRawId",
  "indicatorId",
  "dhis2Id",
  "elements",
  "route",
  "computedIndicators",
  "raw_indicator_id",
  "indicator_raw_id",
  "indicator_id",
  "mappings",
  "sourceType",
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
  dataChecksum: string;
  ledgerRows: number;
  ledgerChecksum: string;
  runRows: number;
  versionRows: number;
  scheduleRows: number;
};

// One checksum over every data row (facility, key, period, count) and one
// over every ledger row (key, period, records, sum): the proof that the
// migration touched no row. `keyColumn` is the key's name before or after.
async function dataChecksum(sql: Sql, keyColumn: string): Promise<string> {
  const rows = await sql.unsafe<{ md5: string | null }[]>(`
    SELECT md5(string_agg(facility_id || '|' || ${keyColumn} || '|' || period_id || '|' || count, ','
      ORDER BY facility_id, ${keyColumn}, period_id)) AS md5
    FROM dataset_hmis
  `);
  return rows[0].md5 ?? "empty";
}

async function ledgerChecksum(sql: Sql, keyColumn: string): Promise<string> {
  const rows = await sql.unsafe<{ md5: string | null }[]>(`
    SELECT md5(string_agg(${keyColumn} || '|' || period_id || '|' || n_records || '|' || sum_count, ','
      ORDER BY ${keyColumn}, period_id)) AS md5
    FROM dataset_hmis_import_ledger
  `);
  return rows[0].md5 ?? "empty";
}

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
    dataChecksum: await dataChecksum(sql, "indicator_raw_id"),
    ledgerRows: await count("dataset_hmis_import_ledger"),
    ledgerChecksum: await ledgerChecksum(sql, "indicator_raw_id"),
    runRows: await count("dataset_hmis_import_runs"),
    versionRows: await count("dataset_hmis_versions"),
    scheduleRows: await count("dataset_hmis_scheduled_imports"),
  };
}

// lib getNewIndicatorIdIssue's charset rule, as 086 restates it for a raw
// keeping its own id.
function charsetOk(id: string): boolean {
  return id !== "" && id.trim() === id && !/[,;:[\]]/.test(id) && id.length <= 128;
}

type Expected = {
  // raw id → the indicator that holds it as its data id, and whether it
  // folded into an existing common.
  rawTarget: Map<string, { id: string; folded: boolean }>;
  generatedIds: string[];
  // pre common id → sum members (the commons that become sums).
  sums: Map<string, string[]>;
  // derived special id → its new id.
  renamedSpecials: Map<string, string>;
};

// Ruling 8 restated over the pre-state, with lib's own generator, so the
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
      (mappingsByCommon.get(commons[0]) ?? []).length === 1
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
  type: HmisIndicatorType;
  expression: string | null;
  data_id: string | null;
  dhis2_label: string | null;
  members: string[];
  include_in_analysis: boolean;
};

async function assertMigrated(sql: Sql, pre: PreState, lines: string[]): Promise<boolean> {
  const problems: string[] = [];

  // Tables, columns and constraints.
  if (await tableExists(sql, "indicators_raw")) problems.push("indicators_raw still exists");
  if (await tableExists(sql, "indicator_mappings")) problems.push("indicator_mappings still exists");
  if (await tableExists(sql, "indicator_sources")) problems.push("indicator_sources exists");
  if (!(await tableExists(sql, "indicator_sum_members"))) problems.push("indicator_sum_members missing");
  if (!(await columnExists(sql, "dataset_hmis", "data_id"))) problems.push("dataset_hmis.data_id missing");
  if (!(await columnExists(sql, "dataset_hmis_import_ledger", "data_id"))) problems.push("ledger.data_id missing");
  if (await columnExists(sql, "indicators", "is_default")) problems.push("indicators.is_default still exists");
  for (const column of ["data_id", "include_in_analysis", "has_rows", "is_count"]) {
    if (!(await columnExists(sql, "indicators", column))) problems.push(`indicators.${column} missing`);
  }
  for (
    const name of [
      "dataset_hmis_data_id_fkey",
      "dataset_hmis_import_ledger_data_id_fkey",
      "indicators_data_id_key",
      "indicators_fields_check",
      "indicators_element_shape_check",
      "indicators_count_format_check",
      "indicators_count_thresholds_check",
      "dataset_hmis_import_runs_route_check",
      "dataset_hmis_import_ledger_route_check",
    ]
  ) {
    if (!(await constraintExists(sql, name))) problems.push(`${name} missing`);
  }
  if (problems.length > 0) {
    lines.push(...problems.map((p) => `  ${p}`));
    return false;
  }

  const expected = expectedOutcome(pre);
  const post = await sql<PostIndicator[]>`
    SELECT i.indicator_common_id AS id, i.indicator_common_label AS label,
      i.definition_type AS type, i.expression, i.data_id, i.dhis2_label,
      (SELECT COALESCE(array_agg(m.member_id ORDER BY m.member_id), ARRAY[]::text[])
         FROM indicator_sum_members m WHERE m.sum_id = i.indicator_common_id) AS members,
      i.include_in_analysis
    FROM indicators i
  `;
  const postById = new Map(post.map((i) => [i.id, i]));
  const preIds = new Set(pre.commons.map((c) => c.id));

  // Every raw became exactly one indicator's data id, folded or new; the
  // type is dhis2_element exactly where the data id is DHIS2-shaped, and a
  // DHIS2 element carries the raw label as its dhis2_label.
  for (const raw of pre.raws) {
    const target = expected.rawTarget.get(raw.indicator_raw_id)!;
    const i = postById.get(target.id);
    if (!i) {
      problems.push(`raw ${raw.indicator_raw_id}: expected indicator ${target.id} missing`);
      continue;
    }
    if (i.data_id !== raw.indicator_raw_id) {
      problems.push(`raw ${raw.indicator_raw_id}: ${target.id} carries data id ${i.data_id}`);
    }
    const expectedType = isDhis2ShapedId(raw.indicator_raw_id) ? "dhis2_element" : "uploaded";
    if (i.type !== expectedType) {
      problems.push(`raw ${raw.indicator_raw_id}: ${target.id} is ${i.type}, expected ${expectedType}`);
    }
    const expectedDhis2Label = expectedType === "dhis2_element" ? raw.indicator_raw_label : null;
    if (i.dhis2_label !== expectedDhis2Label) {
      problems.push(`raw ${raw.indicator_raw_id}: ${target.id} carries dhis2_label ${JSON.stringify(i.dhis2_label)}, expected ${JSON.stringify(expectedDhis2Label)}`);
    }
    if (!target.folded) {
      if (i.label !== raw.indicator_raw_label) problems.push(`new indicator ${target.id} label differs from raw label`);
      if (preIds.has(target.id)) problems.push(`new indicator ${target.id} existed before`);
      if (i.include_in_analysis) problems.push(`new indicator ${target.id} is in the analysis`);
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
  for (const i of post) {
    if (i.type === "dhis2_element" && (i.data_id === null || !isDhis2ShapedId(i.data_id))) {
      problems.push(`DHIS2 element ${i.id} has data id ${i.data_id}`);
    }
    if (i.type === "uploaded" && i.data_id !== null && isDhis2ShapedId(i.data_id)) {
      problems.push(`Uploaded ${i.id} has a DHIS2-shaped data id ${i.data_id}`);
    }
    if (i.type !== "calculated" && i.type !== "sum" && i.data_id === null) {
      problems.push(`${i.type} ${i.id} has no data id after 087`);
    }
  }

  // Every common with mappings is a DHIS2 element, an Uploaded indicator or
  // a sum over what its raws became; a common without mappings is Uploaded
  // under a key 087 generated; a derived stays derived.
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
      else if (JSON.stringify([...i.members].sort()) !== JSON.stringify(members)) {
        problems.push(`sum ${c.id}: members ${JSON.stringify(i.members)}, expected ${JSON.stringify(members)}`);
      }
    } else if (c.type === "base") {
      const folded = [...expected.rawTarget.entries()].find(([, t]) => t.folded && t.id === c.id);
      if (folded === undefined && (i.type !== "uploaded" || !isGeneratedDataKey(i.data_id))) {
        problems.push(`common ${c.id} should be Uploaded under a generated key, is ${i.type} with ${i.data_id}`);
      }
    } else if (i.type !== "calculated") {
      problems.push(`derived ${c.id} should be calculated, is ${i.type}`);
    }
  }
  for (const [oldId, newId] of expected.renamedSpecials) {
    const empty = postById.get(oldId);
    if (!empty || empty.type !== "uploaded" || !isGeneratedDataKey(empty.data_id) || !empty.include_in_analysis) {
      problems.push(`special ${oldId}: no Uploaded indicator under a generated key in the analysis after the derived was renamed`);
    }
    if (!postById.has(newId)) problems.push(`renamed derived ${newId} missing`);
    for (const i of post) {
      if (i.type === "calculated" && i.expression !== null && new RegExp(`(?<![a-zA-Z0-9_])${oldId}(?![a-zA-Z0-9_])`).test(i.expression)) {
        problems.push(`derived ${i.id} still names ${oldId}: ${i.expression}`);
      }
    }
  }
  for (const i of post) {
    if (i.type === "calculated" && isSpecialIndicatorId(i.id)) problems.push(`derived under special id ${i.id}`);
  }

  // The analysed set after equals the set of commons before (the renamed
  // derived under its new id, plus the Uploaded indicator under the special
  // id). The set is ruling 3's, as the extract computes it (a checkbox on,
  // a special, or reached by a checked derived), never the checkbox alone:
  // a raw kept under a special id lands with its checkbox off and is
  // analysed regardless.
  const expectedAnalysed = new Set([
    ...pre.commons.map((c) => expected.renamedSpecials.get(c.id) ?? c.id),
    ...expected.renamedSpecials.keys(),
  ]);
  const postCommons = post.map<HmisIndicator>((i) => ({
    indicator_common_id: i.id,
    indicator_common_label: i.label,
    definition: i.type === "uploaded"
      ? { type: "uploaded", data_id: i.data_id ?? "" }
      : i.type === "dhis2_element"
      ? { type: "dhis2_element", data_id: i.data_id ?? "", dhis2_label: i.dhis2_label }
      : i.type === "sum"
      ? { type: "sum", members: i.members }
      : { type: "calculated", expression: i.expression ?? "" },
    include_in_analysis: i.include_in_analysis,
    format_as: "number",
    thresholds: null,
    direction: "higher-is-better",
    target: null,
    expected_low_counts: false,
    sort_order: 0,
  }));
  const analysedAfter = new Set([
    ...analysedIndicatorIds(postCommons, POPULATION_TYPE_IDS),
    ...post.filter((i) => i.type === "calculated" && i.include_in_analysis).map((i) => i.id),
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
        SELECT i.indicator_common_id AS id, SUM(d.count) AS sum
        FROM indicators i
        JOIN dataset_hmis d ON d.data_id = i.data_id
        WHERE i.has_rows
        GROUP BY i.indicator_common_id
        UNION ALL
        SELECT m.sum_id AS id, SUM(d.count) AS sum
        FROM indicator_sum_members m
        JOIN indicators mi ON mi.indicator_common_id = m.member_id
        JOIN dataset_hmis d ON d.data_id = mi.data_id
        GROUP BY m.sum_id
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

  // No data or ledger row changed: the same count and the same checksum
  // over every row, before and after, and every key some indicator's data
  // id.
  const count = async (table: string) =>
    Number((await sql.unsafe<{ n: string }[]>(`SELECT COUNT(*)::text AS n FROM ${table}`))[0].n);
  if ((await count("dataset_hmis")) !== pre.dataRows) problems.push("dataset_hmis row count changed");
  if ((await count("dataset_hmis_import_ledger")) !== pre.ledgerRows) problems.push("ledger row count changed");
  if ((await dataChecksum(sql, "data_id")) !== pre.dataChecksum) problems.push("dataset_hmis rows changed (checksum)");
  if ((await ledgerChecksum(sql, "data_id")) !== pre.ledgerChecksum) problems.push("ledger rows changed (checksum)");
  const orphans = await sql<{ n: string }[]>`
    SELECT COUNT(*)::text AS n FROM (
      SELECT data_id FROM dataset_hmis
      UNION ALL SELECT data_id FROM dataset_hmis_import_ledger
    ) r WHERE NOT EXISTS (SELECT 1 FROM indicators i WHERE i.data_id = r.data_id)
  `;
  if (Number(orphans[0].n) !== 0) problems.push(`${orphans[0].n} data or ledger rows carry no indicator's data id`);

  // Stored JSON.
  const isRecord = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === "object";
  const isPair = (p: unknown) =>
    isRecord(p) && typeof p.dataId === "string" && typeof p.periodId === "number";
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
      const out = ["indicatorIds", "dataIds", "populationTermsDropped", "uploadedIndicatorsDropped"]
        .filter((k) => !Array.isArray(v[k])).map((k) => `window selection lacks ${k}`);
      if (Array.isArray(v.dataIds) && !v.dataIds.every((d) => typeof d === "string")) {
        out.push("a data id is not a string");
      }
      return out;
    }
    if (v.kind === "pairs") {
      return Array.isArray(v.pairs) && v.pairs.every(isPair) ? [] : ["pairs lack dataId or periodId"];
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
        if (!isRecord(s) || typeof s.dataId !== "string" || typeof s.skippedValues !== "number") {
          out.push("a pair stat lacks dataId or skippedValues");
          break;
        }
      }
    }
    if (isRecord(v.csvStagingResult)) {
      if (v.csvStagingResult.kind !== "csv") out.push("CSV staging result lacks kind");
      if (isRecord(v.csvStagingResult.validation) && !isRecord(v.csvStagingResult.validation.skippedByMapping)) {
        out.push("CSV staging result lacks skippedByMapping");
      }
    }
    return out;
  });
  await scan("dataset_hmis_import_runs", "progress", pre.runRows, (v) =>
    isRecord(v) && Array.isArray(v.activePairs) && !v.activePairs.every(isPair) ? ["activePairs lack dataId"] : []);
  await scan("dataset_hmis_import_runs", "csv_config", pre.runRows, (v) =>
    isRecord(v) && (!isRecord(v.columns) || typeof v.columns.data_id !== "string") ? ["columns lack data_id"] : []);
  await scan("dataset_hmis_versions", "staging_result", pre.versionRows, (v) => {
    if (!isRecord(v)) return ["not an object"];
    const out: string[] = [];
    if (typeof v.kind !== "string") out.push("staging result lacks kind");
    if (v.kind === "deletion" && isRecord(v.windowing) && !Array.isArray(v.windowing.indicatorsToInclude)) {
      out.push("deletion windowing lacks indicatorsToInclude");
    }
    if (Array.isArray(v.failedFetches) && !v.failedFetches.every((f) => isRecord(f) && typeof f.dataId === "string")) {
      out.push("failedFetches lack dataId");
    }
    if (Array.isArray(v.periodIndicatorStats) && !v.periodIndicatorStats.every((s) => isRecord(s) && typeof s.dataId === "string")) {
      out.push("periodIndicatorStats lack dataId");
    }
    return out;
  });
  await scan("dataset_hmis_scheduled_imports", "selection", pre.scheduleRows, (v) =>
    isRecord(v) && !Array.isArray(v.indicatorIds) ? ["schedule selection lacks indicatorIds"] : []);

  // A second run does nothing.
  const pending = await pendingMigrations(sql);
  if (pending.length > 0) problems.push(`${pending.length} migrations still pending after the run`);

  const folded = [...expected.rawTarget.values()].filter((t) => t.folded).length;
  lines.push(`  ${pre.raws.length} raws: ${folded} folded, ${pre.raws.length - folded} new indicators (${expected.generatedIds.length} generated ids), ${expected.sums.size} sums, ${expected.renamedSpecials.size} derived specials renamed`);
  lines.push(`  ${pre.sumsByCommon.size} commons with data compared, ${pre.dataRows} data rows and ${pre.ledgerRows} ledger rows unchanged by checksum, ${pre.runRows} run rows, ${pre.versionRows} version rows, ${pre.scheduleRows} schedules parsed`);
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
