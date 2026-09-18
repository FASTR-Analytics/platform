import { Sql } from "postgres";
import {
  ADMIN_AREA_COLUMNS,
  type APIResponseNoData,
  type APIResponseWithData,
  collectIdentifiers,
  type InstancePopulationSummary,
  parseAdminAreaLevel,
  POPULATION_TYPE_IDS,
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
  type AdminAreaLevel,
  type PopulationTypeStore,
} from "lib";
import { getCsvStreamComponents } from "../../server_only_funcs_csvs/get_csv_components_streaming_fast.ts";
import { tryCatchDatabaseAsync } from "../utils.ts";
import { resolveAssetFilePath } from "./assets.ts";
import { getStructureSchema } from "./config.ts";

// The population store (SYSTEM_05 "Population store"). Every write stamps
// `population_last_updated` in instance_config, the one version key the SSE
// summary and the client type-store cache read.

const POPULATION_LAST_UPDATED_KEY = "population_last_updated";

// Keep batches well under Postgres's 65,534-parameter limit (8 params/row)
const INSERT_BATCH_SIZE = 4000;

const POPULATION_LEVEL_KEY = "population_level";

// The population level setting (SYSTEM_05 "The population level").
export async function getPopulationLevel(
  sql: Sql,
): Promise<AdminAreaLevel | undefined> {
  const row = (
    await sql<{ config_json_value: string }[]>`
      SELECT config_json_value FROM instance_config
      WHERE config_key = ${POPULATION_LEVEL_KEY}
    `
  ).at(0);
  return row === undefined
    ? undefined
    : parseAdminAreaLevel(Number(JSON.parse(row.config_json_value)));
}

export async function getPopulationRowCount(sql: Sql): Promise<number> {
  const [{ n }] = await sql<{ n: number }[]>`
    SELECT COUNT(*)::int AS n FROM population
  `;
  return n;
}

// Refused while any row exists: the rows are at the current level.
export async function setPopulationLevel(
  mainDb: Sql,
  level: AdminAreaLevel,
): Promise<APIResponseNoData> {
  return await tryCatchDatabaseAsync(async () => {
    const resSchema = await getStructureSchema(mainDb, "hmis");
    if (!resSchema.success) return { success: false, err: resSchema.err };
    if (level > resSchema.data.adminDepth) {
      return {
        success: false,
        err: `The HMIS structure only goes to admin area level ${resSchema.data.adminDepth}`,
      };
    }
    const storedRows = await mainDb.begin(async (sql) => {
      await sql`LOCK TABLE population IN SHARE ROW EXCLUSIVE MODE`;
      const n = await getPopulationRowCount(sql);
      if (n > 0) return n;
      await sql`
        INSERT INTO instance_config (config_key, config_json_value)
        VALUES (${POPULATION_LEVEL_KEY}, ${JSON.stringify(level)})
        ON CONFLICT (config_key)
        DO UPDATE SET config_json_value = EXCLUDED.config_json_value
      `;
      await stampPopulationLastUpdated(sql);
      return 0;
    });
    if (storedRows > 0) {
      return {
        success: false,
        err: `Delete all population data first: ${storedRows} rows are stored at the current population level`,
      };
    }
    return { success: true };
  });
}

export async function getInstancePopulationSummary(
  mainDb: Sql,
): Promise<InstancePopulationSummary> {
  const populationLevel = await getPopulationLevel(mainDb);
  const populationRowCount = await getPopulationRowCount(mainDb);
  const populationCoverage = populationLevel === undefined || populationRowCount === 0
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
    populationRowCount,
    populationCoverage,
    populationLastUpdated: stampRow
      ? (JSON.parse(stampRow.config_json_value) as string)
      : undefined,
  };
}

async function computePopulationCoverage(
  mainDb: Sql,
  level: AdminAreaLevel,
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
      firstYear: years.at(0)?.year,
      lastYear: years.at(-1)?.year,
      yearCount: years.length,
      areaCount: areaCountByType.get(populationType) ?? 0,
      structureAreaCount,
      staleRowCount: rows.reduce((sum, r) => sum + r.stale, 0),
      incompleteYears,
      complete,
    };
  });
}

type PopulationAreaRow = {
  admin_area_1: string;
  admin_area_2: string;
  admin_area_3: string;
  admin_area_4: string;
};

// One type's values as the grid shows them: every structure area at the
// population level in structure order, then stale areas by name.
export async function getPopulationTypeStore(
  mainDb: Sql,
  populationType: string,
): Promise<APIResponseWithData<PopulationTypeStore>> {
  return await tryCatchDatabaseAsync(async () => {
    const level = await getPopulationLevel(mainDb);
    if (level === undefined) {
      return { success: true, data: { populationLevel: undefined, years: [], areas: [] } };
    }
    const structureAreas = await listHmisStructureAreas(mainDb, level);
    const rows = await mainDb<(PopulationAreaRow & { year: number; count: number })[]>`
      SELECT admin_area_1, admin_area_2, admin_area_3, admin_area_4, year, count
      FROM population
      WHERE population_type = ${populationType} AND admin_area_level = ${level}
    `;
    const byKey = new Map<string, { names: string[]; cells: Record<string, number> }>();
    const years = new Set<number>();
    for (const r of rows) {
      const names = areaNames(r);
      const key = populationAreaKey(names);
      const area = byKey.get(key) ?? { names, cells: {} };
      area.cells[String(r.year)] = Number(r.count);
      byKey.set(key, area);
      years.add(r.year);
    }
    const structureKeys = new Set<string>();
    const areas: PopulationGridArea[] = structureAreas.map((a) => {
      const names = areaNames(a);
      const key = populationAreaKey(names);
      structureKeys.add(key);
      return {
        names: names.slice(0, level),
        stale: false,
        cells: byKey.get(key)?.cells ?? {},
      };
    });
    const stale: PopulationGridArea[] = [...byKey.entries()]
      .filter(([key]) => !structureKeys.has(key))
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([, area]) => ({
        names: area.names.slice(0, level),
        stale: true,
        cells: area.cells,
      }));
    return {
      success: true,
      data: {
        populationLevel: level,
        years: [...years].sort((a, b) => a - b),
        areas: [...areas, ...stale],
      },
    };
  });
}

export type PopulationExportRow = PopulationAreaRow & {
  population_type: string;
  year: number;
  count: number;
};

export async function getPopulationExportRows(
  mainDb: Sql,
): Promise<{ level: AdminAreaLevel | undefined; rows: PopulationExportRow[] }> {
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

// The import template: every HMIS structure area at the population level,
// one row per population type for `year`, count blank for the user to fill.
// Names come from the structure, so a filled template imports without a
// name mismatch. Undefined while the level is unset.
export async function getPopulationTemplate(
  mainDb: Sql,
  year: number,
): Promise<{ header: string[]; rows: string[][] } | undefined> {
  const level = await getPopulationLevel(mainDb);
  if (level === undefined) return undefined;
  const areaColumns = ADMIN_AREA_COLUMNS.slice(0, level);
  const header = [...areaColumns, "year", "population_type", "count"];
  const areas = await listHmisStructureAreas(mainDb, level);
  const rows = areas.flatMap((a) =>
    POPULATION_TYPE_IDS.map((populationType) => [
      ...areaNames(a).slice(0, level),
      String(year),
      populationType,
      "",
    ])
  );
  return { header, rows };
}

// The values generation reads: one population type at the population level,
// as anchors per area keyed by `populationAreaKey`, so the expansion can look
// a structure area up directly.
export async function getPopulationAnchors(
  mainDb: Sql,
  populationType: string,
  level: AdminAreaLevel,
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
  level: AdminAreaLevel,
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

type PopulationStoreRow = PopulationAreaRow & {
  population_type: string;
  admin_area_level: AdminAreaLevel;
  year: number;
  count: number;
};

type ParsedPopulationCsv = { level: AdminAreaLevel; rows: PopulationStoreRow[] };

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
    const level: AdminAreaLevel = columnIndex.has("admin_area_4")
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
    const populationLevel = await getPopulationLevel(mainDb);
    if (populationLevel === undefined) {
      return {
        success: false,
        err: "Set the population level on the Population page before importing",
      };
    }
    if (level !== populationLevel) {
      return { success: false, err: levelMismatchMessage(level, populationLevel) };
    }

    const knownTypes = new Set(POPULATION_TYPE_IDS);
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
          `line ${line}: area "${[a2, a3, a4].filter((s) => s !== "").join(" / ")}" is not in the HMIS structure at level ${level}`,
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
          `line ${line}: unknown population type "${typeId}" (one of ${POPULATION_TYPE_IDS.join(", ")})`,
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

// Upsert by key, so a later file adds years or corrects values without
// re-supplying everything.
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
        err: `The import would leave population data for ${
          incomplete.join(", ")
        } incomplete: indicator values that use it are computed only for the areas and years it covers. Check the file and confirm to import.`,
      };
    }
    const { level, rows } = parsed.data;
    const outcome = await mainDb.begin<
      { written: true } | { written: false; level: AdminAreaLevel | undefined }
    >(async (sql) => {
      // The level is re-read under the lock so a setting change cannot slip
      // between the parse and the write.
      await sql`LOCK TABLE population IN SHARE ROW EXCLUSIVE MODE`;
      const populationLevel = await getPopulationLevel(sql);
      if (populationLevel !== level) return { written: false, level: populationLevel };
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
      return { written: true };
    });
    if (!outcome.written) {
      return {
        success: false,
        err: outcome.level === undefined
          ? "Set the population level on the Population page before importing"
          : levelMismatchMessage(level, outcome.level),
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

// Level-derived identifiers are interpolated as text; `level` is the closed
// union, so nothing user-controlled reaches the SQL.
function structureTable(level: AdminAreaLevel): string {
  return `admin_areas_hmis_${level}`;
}

function structureJoinCondition(level: AdminAreaLevel): string {
  return ADMIN_AREA_COLUMNS.slice(0, level)
    .map((c) => `a.${c} = p.${c}`)
    .join(" AND ");
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

function areaNames(row: PopulationAreaRow): string[] {
  return [
    row.admin_area_1,
    row.admin_area_2,
    row.admin_area_3,
    row.admin_area_4,
  ];
}

function levelMismatchMessage(
  fileLevel: AdminAreaLevel,
  populationLevel: AdminAreaLevel,
): string {
  return `The file is at admin area level ${fileLevel}, but this instance's population level is ${populationLevel}: the file needs the columns admin_area_1 to admin_area_${populationLevel}. To change the population level, delete all population data first.`;
}
