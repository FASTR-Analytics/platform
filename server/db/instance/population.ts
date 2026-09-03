import { Sql } from "postgres";
import {
  type APIResponseNoData,
  type APIResponseWithData,
  collectIdentifiers,
  describeNewIndicatorIdIssue,
  getNewIndicatorIdIssue,
  type InstancePopulationSummary,
  parseIndicatorExpression,
  type PopulationAnchor,
  type PopulationCoverage,
  POPULATION_CSV_REQUIRED_COLUMNS,
  type PopulationImportResult,
  populationIngredientId,
  type PopulationRow,
  type PopulationTypeInfo,
} from "lib";
import { getCsvStreamComponents } from "../../server_only_funcs_csvs/get_csv_components_streaming_fast.ts";
import { tryCatchDatabaseAsync } from "../utils.ts";
import { resolveAssetFilePath } from "./assets.ts";
import { getStructureSchema } from "./config.ts";

// The population store (PLAN_1b ruling 1): annual figures per admin area ×
// year × population type, validated against the HMIS structure at upload,
// and the user-extensible type vocabulary. Every write stamps
// `population_last_updated` in instance_config — the one version key the
// SSE summary and the client rows cache read.

const POPULATION_LAST_UPDATED_KEY = "population_last_updated";

// Keep batches well under Postgres's 65,534-parameter limit (8 params/row)
const INSERT_BATCH_SIZE = 4000;

const ADMIN_AREA_COLUMNS = [
  "admin_area_1",
  "admin_area_2",
  "admin_area_3",
  "admin_area_4",
] as const;

// ── Types ────────────────────────────────────────────────────────────────────

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

// Refuses while any stored expression names the type as `[population:<id>]`
// (PLAN_1c ruling 6) — the same re-parse the common-indicator delete guard
// performs; the type's population rows go with it (ON DELETE CASCADE) — the
// client's confirm dialog says so.
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
        } — change those indicators first`,
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

// ── Summary (T1) ─────────────────────────────────────────────────────────────

export async function getInstancePopulationSummary(
  mainDb: Sql,
): Promise<InstancePopulationSummary> {
  const populationTypes = await getPopulationTypes(mainDb);
  const groups = await mainDb<
    {
      population_type: string;
      admin_area_level: number;
      first_year: number;
      last_year: number;
      year_count: number;
      area_count: number;
      row_count: number;
    }[]
  >`
    SELECT
      population_type,
      admin_area_level,
      MIN(year)::int AS first_year,
      MAX(year)::int AS last_year,
      COUNT(DISTINCT year)::int AS year_count,
      COUNT(DISTINCT (admin_area_1, admin_area_2, admin_area_3, admin_area_4))::int AS area_count,
      COUNT(*)::int AS row_count
    FROM population
    GROUP BY population_type, admin_area_level
    ORDER BY population_type, admin_area_level
  `;
  const structureCounts = new Map<number, number>();
  for (const level of [2, 3, 4]) {
    const [{ n }] = await mainDb<{ n: number }[]>`
      SELECT COUNT(*)::int AS n FROM ${mainDb(`admin_areas_hmis_${level}`)}
    `;
    structureCounts.set(level, n);
  }
  const populationCoverage: PopulationCoverage[] = groups.map((g) => {
    const structureAreaCount = structureCounts.get(g.admin_area_level) ?? 0;
    return {
      populationType: g.population_type,
      adminAreaLevel: g.admin_area_level,
      firstYear: g.first_year,
      lastYear: g.last_year,
      yearCount: g.year_count,
      areaCount: g.area_count,
      structureAreaCount,
      // Every structure area × every stored year has a row. Stored areas
      // that are no longer in the structure inflate area_count but not
      // row_count against the structure product, so this stays exact.
      complete: structureAreaCount > 0 &&
        g.row_count === structureAreaCount * g.year_count &&
        g.area_count === structureAreaCount,
    };
  });
  const stampRow = (
    await mainDb<{ config_json_value: string }[]>`
      SELECT config_json_value FROM instance_config
      WHERE config_key = ${POPULATION_LAST_UPDATED_KEY}
    `
  ).at(0);
  return {
    populationTypes,
    populationCoverage,
    populationLastUpdated: stampRow
      ? (JSON.parse(stampRow.config_json_value) as string)
      : undefined,
  };
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

// ── Rows ─────────────────────────────────────────────────────────────────────

export async function getPopulationRows(mainDb: Sql): Promise<PopulationRow[]> {
  const rows = await mainDb<
    {
      population_type: string;
      admin_area_level: number;
      admin_area_1: string;
      admin_area_2: string;
      admin_area_3: string;
      admin_area_4: string;
      year: number;
      count: number;
    }[]
  >`
    SELECT population_type, admin_area_level, admin_area_1, admin_area_2,
           admin_area_3, admin_area_4, year, count
    FROM population
    ORDER BY population_type, admin_area_level, admin_area_1, admin_area_2,
             admin_area_3, admin_area_4, year
  `;
  return rows.map((r) => ({
    populationType: r.population_type,
    adminAreaLevel: r.admin_area_level,
    adminArea1: r.admin_area_1,
    adminArea2: r.admin_area_2,
    adminArea3: r.admin_area_3,
    adminArea4: r.admin_area_4,
    year: r.year,
    count: Number(r.count),
  }));
}

// The figures generation reads (PLAN_1b ruling 4): one population type at one
// level, as anchors per area. The area key is the full name path joined the
// way `populationAreaKey` joins it, so the expansion can look a structure
// area up directly.
export async function getPopulationAnchors(
  mainDb: Sql,
  populationType: string,
  adminAreaLevel: number,
): Promise<Map<string, PopulationAnchor[]>> {
  const rows = await mainDb<
    {
      admin_area_1: string;
      admin_area_2: string;
      admin_area_3: string;
      admin_area_4: string;
      year: number;
      count: number;
    }[]
  >`
    SELECT admin_area_1, admin_area_2, admin_area_3, admin_area_4, year, count
    FROM population
    WHERE population_type = ${populationType}
      AND admin_area_level = ${adminAreaLevel}
  `;
  const byArea = new Map<string, PopulationAnchor[]>();
  for (const r of rows) {
    const key = populationAreaKey([
      r.admin_area_1,
      r.admin_area_2,
      r.admin_area_3,
      r.admin_area_4,
    ]);
    const anchors = byArea.get(key) ?? [];
    anchors.push({ year: r.year, count: Number(r.count) });
    byArea.set(key, anchors);
  }
  return byArea;
}

// admin_area_1..4 names (unused levels '') → one lookup key. ' ' can
// never be in a name Postgres stores.
export function populationAreaKey(names: readonly string[]): string {
  return names.join(" ");
}

export type StructureAreaPath = {
  admin_area_1: string;
  admin_area_2: string;
  admin_area_3: string;
  admin_area_4: string;
};

// Every HMIS structure area at `level`, full name path, finer columns ''.
export async function listHmisStructureAreas(
  mainDb: Sql,
  level: number,
): Promise<StructureAreaPath[]> {
  const columns = ADMIN_AREA_COLUMNS.slice(0, level);
  const rows = await mainDb.unsafe<Record<string, string>[]>(
    `SELECT ${columns.join(", ")} FROM admin_areas_hmis_${level}
     ORDER BY ${columns.join(", ")}`,
  );
  return rows.map((r) => ({
    admin_area_1: r.admin_area_1,
    admin_area_2: r.admin_area_2,
    admin_area_3: r.admin_area_3 ?? "",
    admin_area_4: r.admin_area_4 ?? "",
  }));
}

// ── Import ───────────────────────────────────────────────────────────────────

// Fixed-column CSV (lib/types/population.ts POPULATION_CSV_REQUIRED_COLUMNS):
// admin_area_2 [admin_area_3 [admin_area_4]], year, population_type, count,
// optional admin_area_1. The level is the deepest admin column present. Every
// row's area path must exist in the HMIS structure at that level, every type
// must exist in the vocabulary, and the file must not repeat a key. Rows are
// UPSERTED by (type, level, area, year), so a later file adds years or
// corrects figures without re-supplying everything; a group is removed with
// deletePopulationGroup.
export async function importPopulationCsv(
  mainDb: Sql,
  assetFileName: string,
): Promise<APIResponseWithData<PopulationImportResult>> {
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
    const level = columnIndex.has("admin_area_4")
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

    type Row = {
      population_type: string;
      admin_area_level: number;
      admin_area_1: string;
      admin_area_2: string;
      admin_area_3: string;
      admin_area_4: string;
      year: number;
      count: number;
    };
    const rows: Row[] = [];
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

    await mainDb.begin(async (sql) => {
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
    });

    const years = rows.map((r) => r.year);
    return {
      success: true,
      data: {
        rowsImported: rows.length,
        adminAreaLevel: level,
        populationTypes: [...new Set(rows.map((r) => r.population_type))].sort(),
        firstYear: Math.min(...years),
        lastYear: Math.max(...years),
      },
    };
  });
}

export async function deletePopulationGroup(
  mainDb: Sql,
  populationType: string,
  adminAreaLevel: number,
): Promise<APIResponseNoData> {
  return await tryCatchDatabaseAsync(async () => {
    await mainDb.begin(async (sql) => {
      await sql`
        DELETE FROM population
        WHERE population_type = ${populationType}
          AND admin_area_level = ${adminAreaLevel}
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
