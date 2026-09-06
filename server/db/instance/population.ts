import { Sql } from "postgres";
import {
  type APIResponseNoData,
  type APIResponseWithData,
  collectIdentifiers,
  describeNewIndicatorIdIssue,
  getNewIndicatorIdIssue,
  type InstancePopulationSummary,
  parseIndicatorExpression,
  parsePopulationLevel,
  type PopulationAnchor,
  POPULATION_CSV_REQUIRED_COLUMNS,
  POPULATION_PREVIEW_MISSING_AREAS_CAP,
  populationAreaKey,
  populationCompleteness,
  populationCoverage,
  type PopulationCoverage,
  populationDisplayPath,
  type PopulationGridArea,
  type PopulationImportPreview,
  type PopulationImportPreviewType,
  type PopulationImportResult,
  populationIngredientId,
  type PopulationLevel,
  type PopulationTypeInfo,
  type PopulationTypeStore,
} from "lib";
import { getCsvStreamComponents } from "../../server_only_funcs_csvs/get_csv_components_streaming_fast.ts";
import { tryCatchDatabaseAsync } from "../utils.ts";
import { resolveAssetFilePath } from "./assets.ts";
import { getStructureSchema } from "./config.ts";

// The population store: annual population counts per admin area × year × population
// type at ONE admin level (the population level, SYSTEM_05 "Population
// store"), validated against the HMIS structure at import, plus the
// user-extensible type vocabulary. Every write stamps
// `population_last_updated` in instance_config, the one version key the SSE
// summary and the client type-store cache read.

const POPULATION_LAST_UPDATED_KEY = "population_last_updated";

// Keep batches well under Postgres's 65,534-parameter limit (8 params/row)
const INSERT_BATCH_SIZE = 4000;

const ADMIN_AREA_COLUMNS = [
  "admin_area_1",
  "admin_area_2",
  "admin_area_3",
  "admin_area_4",
] as const;

// Level-derived identifiers are interpolated as text; `level` is the closed
// union, so nothing user-controlled reaches the SQL.
function structureTable(level: PopulationLevel): string {
  return `admin_areas_hmis_${level}`;
}

function structureJoinCondition(level: PopulationLevel): string {
  return ADMIN_AREA_COLUMNS.slice(0, level)
    .map((c) => `a.${c} = p.${c}`)
    .join(" AND ");
}

// ── Types ─────────────────────────────────────────────────────────────────────

export async function getPopulationTypes(
  mainDb: Sql,
): Promise<PopulationTypeInfo[]> {
  return await mainDb<PopulationTypeInfo[]>`
    SELECT id, label FROM population_types ORDER BY LOWER(label)
  `;
}

export async function createPopulationType(
  mainDb: Sql,
  id: string,
  label: string,
): Promise<APIResponseNoData> {
  return await tryCatchDatabaseAsync(async () => {
    // Same charset rule as an indicator id: the id is written into m012's
    // ingredient literal and the person-years CSV, and a ':' is what
    // separates it from the `population:` prefix.
    const issue = getNewIndicatorIdIssue(id);
    if (issue !== undefined) {
      return {
        success: false,
        err: `Population type id ${describeNewIndicatorIdIssue(issue)}`,
      };
    }
    if (label.trim() === "") {
      return { success: false, err: "Label must not be empty" };
    }
    const existing = await mainDb<{ id: string }[]>`
      SELECT id FROM population_types WHERE id = ${id}
    `;
    if (existing.length > 0) {
      return { success: false, err: `Population type "${id}" already exists` };
    }
    await mainDb.begin(async (sql) => {
      await sql`
        INSERT INTO population_types (id, label, updated_at)
        VALUES (${id}, ${label.trim()}, CURRENT_TIMESTAMP)
      `;
      await stampPopulationLastUpdated(sql);
    });
    return { success: true };
  });
}

export async function updatePopulationTypeLabel(
  mainDb: Sql,
  id: string,
  label: string,
): Promise<APIResponseNoData> {
  return await tryCatchDatabaseAsync(async () => {
    if (label.trim() === "") {
      return { success: false, err: "Label must not be empty" };
    }
    const updated = await mainDb.begin(async (sql) => {
      const rows = await sql`
        UPDATE population_types
        SET label = ${label.trim()}, updated_at = CURRENT_TIMESTAMP
        WHERE id = ${id}
        RETURNING id
      `;
      if (rows.length > 0) await stampPopulationLastUpdated(sql);
      return rows.length;
    });
    if (updated === 0) {
      return { success: false, err: `Population type "${id}" does not exist` };
    }
    return { success: true };
  });
}

// Refuses while any stored expression names the type as `[population:<id>]`,
// the same re-parse the common-indicator delete guard performs; the type's
// population rows go with it (ON DELETE CASCADE), and the client's confirm
// dialog says so.
export async function deletePopulationType(
  mainDb: Sql,
  id: string,
): Promise<APIResponseNoData> {
  return await tryCatchDatabaseAsync(async () => {
    const derived = await mainDb<
      { indicator_common_id: string; expression: string }[]
    >`
      SELECT indicator_common_id, expression FROM indicators
      WHERE definition_type = 'derived'
      ORDER BY indicator_common_id
    `;
    const ingredientId = populationIngredientId(id);
    const users = derived
      .filter((r) =>
        collectIdentifiers(parseIndicatorExpression(r.expression)).includes(
          ingredientId,
        )
      )
      .map((r) => r.indicator_common_id);
    if (users.length > 0) {
      return {
        success: false,
        err: `Population type "${id}" is used in the formula of ${
          users.join(", ")
        }. Change those indicators first`,
      };
    }
    const deleted = await mainDb.begin(async (sql) => {
      const rows = await sql`
        DELETE FROM population_types WHERE id = ${id} RETURNING id
      `;
      if (rows.length > 0) await stampPopulationLastUpdated(sql);
      return rows.length;
    });
    if (deleted === 0) {
      return { success: false, err: `Population type "${id}" does not exist` };
    }
    return { success: true };
  });
}

// ── Level ─────────────────────────────────────────────────────────────────────

// The level of the stored rows; null for an empty store. The import is the
// only writer of new rows and refuses a second level, so more than one is an
// invariant break worth a loud failure.
export async function getPopulationLevel(
  sql: Sql,
): Promise<PopulationLevel | null> {
  const rows = await sql<{ admin_area_level: number }[]>`
    SELECT DISTINCT admin_area_level FROM population
  `;
  if (rows.length === 0) return null;
  if (rows.length > 1) {
    throw new Error(
      `The population store holds rows at more than one admin area level (${
        rows.map((r) => r.admin_area_level).join(", ")
      })`,
    );
  }
  return parsePopulationLevel(rows[0].admin_area_level);
}

// ── Summary (T1) ──────────────────────────────────────────────────────────────

export async function getInstancePopulationSummary(
  mainDb: Sql,
): Promise<InstancePopulationSummary> {
  const populationTypes = await getPopulationTypes(mainDb);
  const populationLevel = await getPopulationLevel(mainDb);
  const populationCoverage = populationLevel === null
    ? []
    : await computePopulationCoverage(mainDb, populationLevel);
  const stampRow = (
    await mainDb<{ config_json_value: string }[]>`
      SELECT config_json_value FROM instance_config
      WHERE config_key = ${POPULATION_LAST_UPDATED_KEY}
    `
  ).at(0);
  return {
    populationLevel,
    populationTypes,
    populationCoverage,
    populationLastUpdated: stampRow
      ? (JSON.parse(stampRow.config_json_value) as string)
      : undefined,
  };
}

// Per type: years and stale rows counted in SQL against the structure at the
// population level, completeness decided by the shared rule.
async function computePopulationCoverage(
  mainDb: Sql,
  level: PopulationLevel,
): Promise<PopulationCoverage[]> {
  const [{ n: structureAreaCount }] = await mainDb<{ n: number }[]>`
    SELECT COUNT(*)::int AS n FROM ${mainDb(structureTable(level))}
  `;
  type PerYearRow = {
    population_type: string;
    year: number;
    in_structure: number;
    stale: number;
  };
  const perYear = await mainDb.unsafe<PerYearRow[]>(
    `SELECT p.population_type, p.year,
            COUNT(a.admin_area_2)::int AS in_structure,
            (COUNT(*) - COUNT(a.admin_area_2))::int AS stale
     FROM population p
     LEFT JOIN ${structureTable(level)} a ON ${structureJoinCondition(level)}
     WHERE p.admin_area_level = $1
     GROUP BY p.population_type, p.year
     ORDER BY p.population_type, p.year`,
    [level],
  );
  const perType = await mainDb.unsafe<
    { population_type: string; area_count: number }[]
  >(
    `SELECT p.population_type,
            COUNT(DISTINCT (p.admin_area_1, p.admin_area_2, p.admin_area_3, p.admin_area_4))::int AS area_count
     FROM population p
     JOIN ${structureTable(level)} a ON ${structureJoinCondition(level)}
     WHERE p.admin_area_level = $1
     GROUP BY p.population_type`,
    [level],
  );
  const areaCountByType = new Map(
    perType.map((r) => [r.population_type, r.area_count]),
  );
  const rowsByType = new Map<string, PerYearRow[]>();
  for (const row of perYear) {
    const rows = rowsByType.get(row.population_type) ?? [];
    rows.push(row);
    rowsByType.set(row.population_type, rows);
  }
  return [...rowsByType.entries()].map(([populationType, rows]) => {
    const years = rows
      .filter((r) => r.in_structure > 0)
      .map((r) => ({ year: r.year, areasWithData: r.in_structure }));
    const { incompleteYears, complete } = populationCompleteness(
      years,
      structureAreaCount,
    );
    return {
      populationType,
      firstYear: years.at(0)?.year ?? null,
      lastYear: years.at(-1)?.year ?? null,
      yearCount: years.length,
      areaCount: areaCountByType.get(populationType) ?? 0,
      structureAreaCount,
      staleRowCount: rows.reduce((sum, r) => sum + r.stale, 0),
      incompleteYears,
      complete,
    };
  });
}

async function stampPopulationLastUpdated(sql: Sql): Promise<void> {
  await sql`
    INSERT INTO instance_config (config_key, config_json_value)
    VALUES (${POPULATION_LAST_UPDATED_KEY}, ${
    JSON.stringify(new Date().toISOString())
  })
    ON CONFLICT (config_key)
    DO UPDATE SET config_json_value = EXCLUDED.config_json_value
  `;
}

// ── Rows ──────────────────────────────────────────────────────────────────────

type PopulationAreaRow = {
  admin_area_1: string;
  admin_area_2: string;
  admin_area_3: string;
  admin_area_4: string;
};

function areaNames(row: PopulationAreaRow): string[] {
  return [
    row.admin_area_1,
    row.admin_area_2,
    row.admin_area_3,
    row.admin_area_4,
  ];
}

// One type's values as the grid shows them: every structure area at the
// population level in structure order, then stale areas by path.
export async function getPopulationTypeStore(
  mainDb: Sql,
  populationType: string,
): Promise<PopulationTypeStore> {
  const level = await getPopulationLevel(mainDb);
  if (level === null) return { populationLevel: null, years: [], areas: [] };
  const structureAreas = await listHmisStructureAreas(mainDb, level);
  const rows = await mainDb<(PopulationAreaRow & { year: number; count: number })[]>`
    SELECT admin_area_1, admin_area_2, admin_area_3, admin_area_4, year, count
    FROM population
    WHERE population_type = ${populationType} AND admin_area_level = ${level}
  `;
  const cellsByKey = new Map<string, Record<string, number>>();
  const namesByKey = new Map<string, string[]>();
  const years = new Set<number>();
  for (const r of rows) {
    const names = areaNames(r);
    const key = populationAreaKey(names);
    const cells = cellsByKey.get(key) ?? {};
    cells[String(r.year)] = Number(r.count);
    cellsByKey.set(key, cells);
    namesByKey.set(key, names);
    years.add(r.year);
  }
  const structureKeys = new Set<string>();
  const areas: PopulationGridArea[] = structureAreas.map((a) => {
    const names = areaNames(a);
    const key = populationAreaKey(names);
    structureKeys.add(key);
    return {
      key,
      path: populationDisplayPath(names, level),
      stale: false,
      cells: cellsByKey.get(key) ?? {},
    };
  });
  const stale: PopulationGridArea[] = [...cellsByKey.keys()]
    .filter((key) => !structureKeys.has(key))
    .map((key) => ({
      key,
      path: populationDisplayPath(namesByKey.get(key)!, level),
      stale: true,
      cells: cellsByKey.get(key)!,
    }))
    .sort((a, b) => a.path.localeCompare(b.path));
  return {
    populationLevel: level,
    years: [...years].sort((a, b) => a - b),
    areas: [...areas, ...stale],
  };
}

export type PopulationExportRow = PopulationAreaRow & {
  population_type: string;
  year: number;
  count: number;
};

// Every stored row in import order, with the level that decides how many
// area columns the CSV carries.
export async function getPopulationExportRows(
  mainDb: Sql,
): Promise<{ level: PopulationLevel | null; rows: PopulationExportRow[] }> {
  const level = await getPopulationLevel(mainDb);
  const rows = await mainDb<PopulationExportRow[]>`
    SELECT population_type, admin_area_1, admin_area_2, admin_area_3,
           admin_area_4, year, count
    FROM population
    ORDER BY population_type, admin_area_1, admin_area_2, admin_area_3,
             admin_area_4, year
  `;
  return { level, rows: rows.map((r) => ({ ...r, count: Number(r.count) })) };
}

// The values generation reads: one population type at the population level,
// as anchors per area keyed by `populationAreaKey`, so the expansion can look
// a structure area up directly.
export async function getPopulationAnchors(
  mainDb: Sql,
  populationType: string,
  level: PopulationLevel,
): Promise<Map<string, PopulationAnchor[]>> {
  const rows = await mainDb<(PopulationAreaRow & { year: number; count: number })[]>`
    SELECT admin_area_1, admin_area_2, admin_area_3, admin_area_4, year, count
    FROM population
    WHERE population_type = ${populationType}
      AND admin_area_level = ${level}
  `;
  const byArea = new Map<string, PopulationAnchor[]>();
  for (const r of rows) {
    const key = populationAreaKey(areaNames(r));
    const anchors = byArea.get(key) ?? [];
    anchors.push({ year: r.year, count: Number(r.count) });
    byArea.set(key, anchors);
  }
  return byArea;
}

export type StructureAreaPath = PopulationAreaRow;

// Every HMIS structure area at `level`, full name path, finer columns ''.
export async function listHmisStructureAreas(
  mainDb: Sql,
  level: PopulationLevel,
): Promise<StructureAreaPath[]> {
  const columns = ADMIN_AREA_COLUMNS.slice(0, level);
  const rows = await mainDb.unsafe<Record<string, string>[]>(
    `SELECT ${columns.join(", ")} FROM ${structureTable(level)}
     ORDER BY ${columns.join(", ")}`,
  );
  return rows.map((r) => ({
    admin_area_1: r.admin_area_1,
    admin_area_2: r.admin_area_2,
    admin_area_3: r.admin_area_3 ?? "",
    admin_area_4: r.admin_area_4 ?? "",
  }));
}

// ── Import ────────────────────────────────────────────────────────────────────

type PopulationStoreRow = PopulationAreaRow & {
  population_type: string;
  admin_area_level: PopulationLevel;
  year: number;
  count: number;
};

type ParsedPopulationCsv = { level: PopulationLevel; rows: PopulationStoreRow[] };

function levelMismatchMessage(
  fileLevel: PopulationLevel,
  storedLevel: PopulationLevel,
): string {
  return `The file is at admin area level ${fileLevel}, but the stored population data is at level ${storedLevel}. The store holds one level at a time: delete all population data first to change it.`;
}

// Fixed-column CSV (lib/types/population.ts POPULATION_CSV_REQUIRED_COLUMNS):
// admin_area_2 [admin_area_3 [admin_area_4]], year, population_type, count,
// optional admin_area_1. The level is the deepest admin column present and
// must be the stored level while any row exists. Every row's area path must
// exist in the HMIS structure at that level, every type must exist in the
// vocabulary, and the file must not repeat a key.
export async function parsePopulationCsv(
  mainDb: Sql,
  assetFileName: string,
): Promise<APIResponseWithData<ParsedPopulationCsv>> {
  return await tryCatchDatabaseAsync(async () => {
    const resSchema = await getStructureSchema(mainDb, "hmis");
    if (resSchema.success === false) return resSchema;
    const adminDepth = resSchema.data.adminDepth;

    const resCsv = await getCsvStreamComponents(
      resolveAssetFilePath(assetFileName),
    );
    if (!resCsv.success) return resCsv;
    const { headers, processRows } = resCsv.data;
    const columnIndex = new Map(headers.map((h, i) => [h.trim(), i]));

    const missingRequired = POPULATION_CSV_REQUIRED_COLUMNS.filter((c) =>
      !columnIndex.has(c)
    );
    if (missingRequired.length > 0) {
      return {
        success: false,
        err: `Missing column(s): ${missingRequired.join(", ")}. Expected: ${
          POPULATION_CSV_REQUIRED_COLUMNS.join(", ")
        } (plus admin_area_3 / admin_area_4 for finer levels)`,
      };
    }
    const level: PopulationLevel = columnIndex.has("admin_area_4")
      ? 4
      : columnIndex.has("admin_area_3")
      ? 3
      : 2;
    if (level === 4 && !columnIndex.has("admin_area_3")) {
      return {
        success: false,
        err: "admin_area_4 is present but admin_area_3 is missing",
      };
    }
    if (level > adminDepth) {
      return {
        success: false,
        err: `The file is at admin area level ${level}, but the HMIS structure only goes to level ${adminDepth}`,
      };
    }
    const storedLevel = await getPopulationLevel(mainDb);
    if (storedLevel !== null && storedLevel !== level) {
      return { success: false, err: levelMismatchMessage(level, storedLevel) };
    }

    const knownTypes = new Set(
      (await getPopulationTypes(mainDb)).map((t) => t.id),
    );
    const structureAreas = await listHmisStructureAreas(mainDb, level);
    // Path below level 1 → the level-1 name, so a file without admin_area_1
    // resolves it (and one with it is checked against it).
    const level1ByPath = new Map<string, string>();
    for (const a of structureAreas) {
      level1ByPath.set(
        populationAreaKey(["", a.admin_area_2, a.admin_area_3, a.admin_area_4]),
        a.admin_area_1,
      );
    }
    const idx = (c: string) => columnIndex.get(c);
    const iA1 = idx("admin_area_1");
    const iA2 = idx("admin_area_2")!;
    const iA3 = idx("admin_area_3");
    const iA4 = idx("admin_area_4");
    const iYear = idx("year")!;
    const iType = idx("population_type")!;
    const iCount = idx("count")!;

    const rows: PopulationStoreRow[] = [];
    const problems: string[] = [];
    const seen = new Set<string>();
    const cell = (row: string[], i: number | undefined) =>
      i === undefined ? "" : (row[i] ?? "").trim();

    await processRows((row, rowIndex) => {
      const line = rowIndex + 2;
      const a2 = cell(row, iA2);
      const a3 = level >= 3 ? cell(row, iA3) : "";
      const a4 = level >= 4 ? cell(row, iA4) : "";
      const typeId = cell(row, iType);
      const yearRaw = cell(row, iYear);
      const countRaw = cell(row, iCount);
      if (a2 === "" && a3 === "" && a4 === "" && typeId === "" && yearRaw === "" && countRaw === "") {
        return;
      }
      if (problems.length >= 20) return;
      if (a2 === "" || (level >= 3 && a3 === "") || (level >= 4 && a4 === "")) {
        problems.push(`line ${line}: blank admin area name`);
        return;
      }
      const level1 = level1ByPath.get(populationAreaKey(["", a2, a3, a4]));
      if (level1 === undefined) {
        problems.push(
          `line ${line}: area "${[a2, a3, a4].filter((s) => s !== "").join(" > ")}" is not in the HMIS structure at level ${level}`,
        );
        return;
      }
      const a1 = cell(row, iA1);
      if (a1 !== "" && a1 !== level1) {
        problems.push(
          `line ${line}: admin_area_1 "${a1}" does not match the structure ("${level1}")`,
        );
        return;
      }
      if (!knownTypes.has(typeId)) {
        problems.push(
          `line ${line}: unknown population type "${typeId}" (add it on the Population page first)`,
        );
        return;
      }
      const year = Number(yearRaw);
      if (!/^\d{4}$/.test(yearRaw) || year < 1900 || year > 2200) {
        problems.push(`line ${line}: year "${yearRaw}" is not a 4-digit year`);
        return;
      }
      const count = Number(countRaw);
      if (countRaw === "" || !Number.isFinite(count) || count < 0) {
        problems.push(
          `line ${line}: count "${countRaw}" is not a non-negative number`,
        );
        return;
      }
      const key = `${typeId}|${populationAreaKey([level1, a2, a3, a4])}|${year}`;
      if (seen.has(key)) {
        problems.push(`line ${line}: duplicate of an earlier row (same type, area and year)`);
        return;
      }
      seen.add(key);
      rows.push({
        population_type: typeId,
        admin_area_level: level,
        admin_area_1: level1,
        admin_area_2: a2,
        admin_area_3: a3,
        admin_area_4: a4,
        year,
        count,
      });
    });

    if (problems.length > 0) {
      return {
        success: false,
        err: `The file was not imported. ${
          problems.length >= 20 ? "First 20 problems" : "Problems"
        }:\n${problems.join("\n")}`,
      };
    }
    if (rows.length === 0) {
      return { success: false, err: "CSV contains no data rows" };
    }
    return { success: true, data: { level, rows } };
  });
}

// Read-only: the store after the file is upserted (store ∪ file by key, file
// wins), coverage per touched type.
export async function previewPopulationImport(
  mainDb: Sql,
  parsed: ParsedPopulationCsv,
): Promise<PopulationImportPreview> {
  const { level, rows } = parsed;
  const structureAreas = new Map(
    (await listHmisStructureAreas(mainDb, level)).map((a) => {
      const names = areaNames(a);
      return [populationAreaKey(names), populationDisplayPath(names, level)];
    }),
  );
  const populationTypes = [...new Set(rows.map((r) => r.population_type))]
    .sort();
  let rowsNew = 0;
  let rowsReplaced = 0;
  const types: PopulationImportPreviewType[] = [];
  for (const populationType of populationTypes) {
    const stored = await mainDb<(PopulationAreaRow & { year: number })[]>`
      SELECT admin_area_1, admin_area_2, admin_area_3, admin_area_4, year
      FROM population
      WHERE population_type = ${populationType} AND admin_area_level = ${level}
    `;
    const storedRows = stored.map((r) => ({
      areaKey: populationAreaKey(areaNames(r)),
      year: r.year,
    }));
    const storedKeys = new Set(
      storedRows.map((r) => `${r.areaKey}|${r.year}`),
    );
    const fileRows = rows
      .filter((r) => r.population_type === populationType)
      .map((r) => ({ areaKey: populationAreaKey(areaNames(r)), year: r.year }));
    for (const r of fileRows) {
      if (storedKeys.has(`${r.areaKey}|${r.year}`)) rowsReplaced++;
      else rowsNew++;
    }
    const coverage = populationCoverage({
      structureAreas,
      rows: [...storedRows, ...fileRows],
      missingAreasCap: POPULATION_PREVIEW_MISSING_AREAS_CAP,
    });
    types.push({
      populationType,
      structureAreaCount: structureAreas.size,
      years: coverage.years,
      staleRowCount: coverage.staleRowCount,
      complete: coverage.complete,
    });
  }
  let firstYear = Infinity;
  let lastYear = -Infinity;
  for (const r of rows) {
    if (r.year < firstYear) firstYear = r.year;
    if (r.year > lastYear) lastYear = r.year;
  }
  return {
    populationLevel: level,
    populationTypes,
    firstYear,
    lastYear,
    rowsInFile: rows.length,
    rowsNew,
    rowsReplaced,
    types,
    complete: types.every((t) => t.complete),
  };
}

export async function previewPopulationCsv(
  mainDb: Sql,
  assetFileName: string,
): Promise<APIResponseWithData<PopulationImportPreview>> {
  return await tryCatchDatabaseAsync(async () => {
    const parsed = await parsePopulationCsv(mainDb, assetFileName);
    if (!parsed.success) return parsed;
    return {
      success: true,
      data: await previewPopulationImport(mainDb, parsed.data),
    };
  });
}

// Rows are UPSERTED by (type, level, area, year), so a later file adds years
// or corrects values without re-supplying everything. Refused, unless
// confirmed, when a touched type would be left incomplete.
export async function importPopulationCsv(
  mainDb: Sql,
  assetFileName: string,
  confirmIncomplete: boolean,
): Promise<APIResponseWithData<PopulationImportResult>> {
  return await tryCatchDatabaseAsync(async () => {
    const parsed = await parsePopulationCsv(mainDb, assetFileName);
    if (!parsed.success) return parsed;
    const preview = await previewPopulationImport(mainDb, parsed.data);
    if (!preview.complete && !confirmIncomplete) {
      const incomplete = preview.types
        .filter((t) => !t.complete)
        .map((t) => t.populationType);
      return {
        success: false,
        err: `The import would leave incomplete population data for ${
          incomplete.join(", ")
        }. Check the file and confirm to import anyway.`,
      };
    }
    const { level, rows } = parsed.data;
    const conflictingLevel = await mainDb.begin(async (sql) => {
      // Two first imports at different levels must not both see an empty
      // store: the lock serialises writers, and the level is re-read under
      // it.
      await sql`LOCK TABLE population IN SHARE ROW EXCLUSIVE MODE`;
      const storedLevel = await getPopulationLevel(sql);
      if (storedLevel !== null && storedLevel !== level) return storedLevel;
      for (let i = 0; i < rows.length; i += INSERT_BATCH_SIZE) {
        const batch = rows.slice(i, i + INSERT_BATCH_SIZE);
        await sql`
          INSERT INTO population ${
          sql(
            batch,
            "population_type",
            "admin_area_level",
            "admin_area_1",
            "admin_area_2",
            "admin_area_3",
            "admin_area_4",
            "year",
            "count",
          )
        }
          ON CONFLICT (population_type, admin_area_level, admin_area_1, admin_area_2, admin_area_3, admin_area_4, year)
          DO UPDATE SET count = EXCLUDED.count
        `;
      }
      await stampPopulationLastUpdated(sql);
      return null;
    });
    if (conflictingLevel !== null) {
      return {
        success: false,
        err: levelMismatchMessage(level, conflictingLevel),
      };
    }
    return {
      success: true,
      data: {
        rowsImported: rows.length,
        populationLevel: level,
        populationTypes: preview.populationTypes,
        firstYear: preview.firstYear,
        lastYear: preview.lastYear,
      },
    };
  });
}

export async function deletePopulationTypeData(
  mainDb: Sql,
  populationType: string,
): Promise<APIResponseNoData> {
  return await tryCatchDatabaseAsync(async () => {
    await mainDb.begin(async (sql) => {
      await sql`
        DELETE FROM population WHERE population_type = ${populationType}
      `;
      await stampPopulationLastUpdated(sql);
    });
    return { success: true };
  });
}

export async function deleteAllPopulation(
  mainDb: Sql,
): Promise<APIResponseNoData> {
  return await tryCatchDatabaseAsync(async () => {
    await mainDb.begin(async (sql) => {
      await sql`DELETE FROM population`;
      await stampPopulationLastUpdated(sql);
    });
    return { success: true };
  });
}
