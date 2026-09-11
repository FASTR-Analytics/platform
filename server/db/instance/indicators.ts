import { Sql } from "postgres";
import {
  APIResponseNoData,
  APIResponseWithData,
  buildExpressionDictionary,
  type CommonIndicator,
  type CommonIndicatorDefinition,
  describeNewIndicatorIdIssue,
  type ExpressionDictionaryEntry,
  getNewIndicatorIdIssue,
  getNewSourceIdIssue,
  getSpecialIndicatorTypeIssue,
  INDICATOR_BATCH_FILE_COLUMNS,
  INDICATOR_BATCH_SOURCES_SEPARATOR,
  IndicatorExpressionError,
  type IndicatorFormat,
  type IndicatorSource,
  type IndicatorWithSources,
  type InstanceIndicatorDetails,
  isCommonIndicatorType,
  MAX_INDICATOR_EXPRESSION_INGREDIENTS,
  POPULATION_TYPE_IDS,
  resolveIndicatorExpression,
  type ThresholdsRule,
  thresholdsRuleSchema,
} from "lib";
import { tryCatchDatabaseAsync } from "./../utils.ts";
import { resolveAssetFilePath } from "./assets.ts";
import { readCsvFile } from "@timroberton/panther";

// The stored shape of one indicator. `expression` carries a derived
// indicator's formula and is NULL for a base one (PLAN_1a §1.2). `thresholds`
// is the CF rule as JSON text (every JSON column is text: JSON.parse on read,
// JSON.stringify on write: SYSTEM_02), validated by the lib schema here.
export type DBIndicatorCommon = {
  indicator_common_id: string;
  indicator_common_label: string;
  definition_type: "base" | "derived";
  expression: string | null;
  format_as: IndicatorFormat;
  thresholds: string | null;
  sort_order: number;
};

const COMMON_INDICATOR_COLUMNS =
  `indicator_common_id, indicator_common_label, definition_type, expression, format_as, thresholds, sort_order`;

export function dbRowToCommonIndicator(row: DBIndicatorCommon): CommonIndicator {
  return {
    indicator_common_id: row.indicator_common_id,
    indicator_common_label: row.indicator_common_label,
    definition: dbRowToDefinition(row),
    format_as: row.format_as,
    thresholds: row.thresholds === null
      ? null
      : thresholdsRuleSchema.parse(JSON.parse(row.thresholds)),
    sort_order: row.sort_order,
  };
}

function thresholdsToDb(thresholds: ThresholdsRule | null): string | null {
  return thresholds === null ? null : JSON.stringify(thresholds);
}

function dbRowToDefinition(row: DBIndicatorCommon): CommonIndicatorDefinition {
  switch (row.definition_type) {
    case "base":
      return { type: "base" };
    case "derived":
      return { type: "derived", expression: row.expression! };
  }
}

type DefinitionFields = {
  definition_type: CommonIndicatorDefinition["type"];
  expression: string | null;
};

function definitionFields(
  definition: CommonIndicatorDefinition,
): DefinitionFields {
  switch (definition.type) {
    case "base":
      return { definition_type: "base", expression: null };
    case "derived":
      return { definition_type: "derived", expression: definition.expression };
  }
}

// `format_as` is display-only and the sole scale (PLAN_1c ruling 3). A base
// indicator is a count, so it is always a number; a derived one chooses.
function formatRuleError(
  definition: CommonIndicatorDefinition,
  formatAs: IndicatorFormat,
): string | undefined {
  return definition.type === "base" && formatAs !== "number"
    ? "A base indicator is a count and is always formatted as a number"
    : undefined;
}

// A source belongs to a base: a derived indicator is its formula.
function sourcesRuleError(
  definition: CommonIndicatorDefinition,
  sources: IndicatorSource[],
): string | undefined {
  return definition.type === "derived" && sources.length > 0
    ? "A derived indicator is defined by its formula and has no sources"
    : undefined;
}

function sourceIdIssues(sources: IndicatorSource[]): string[] {
  const issues: string[] = [];
  const seen = new Set<string>();
  for (const source of sources) {
    const issue = getNewSourceIdIssue(source.source_id);
    if (issue) {
      issues.push(
        `Invalid source ID ${JSON.stringify(source.source_id)}: ${
          describeNewIndicatorIdIssue(issue)
        }`,
      );
    }
    if (seen.has(source.source_id)) {
      issues.push(`Duplicate source ID ${JSON.stringify(source.source_id)}`);
    }
    seen.add(source.source_id);
    if (source.source_label.trim() === "") {
      issues.push(`Source ${JSON.stringify(source.source_id)} needs a label`);
    }
  }
  return issues;
}

// The live expression dictionary: every indicator, plus every population
// type under its own id.
async function loadExpressionDictionaryEntries(
  sql: Sql,
): Promise<ExpressionDictionaryEntry[]> {
  const stored = await sql<
    {
      indicator_common_id: string;
      definition_type: "base" | "derived";
      expression: string | null;
    }[]
  >`SELECT indicator_common_id, definition_type, expression FROM indicators`;
  return [
    ...stored.map((r) => ({
      id: r.indicator_common_id,
      type: r.definition_type,
      expression: r.expression,
    })),
    ...POPULATION_TYPE_IDS.map((id) => ({
      id,
      type: "population" as const,
      expression: null,
    })),
  ];
}

// =============================================================================
// READ OPERATIONS
// =============================================================================

export async function getCommonIndicators(
  mainDb: Sql,
): Promise<CommonIndicator[]> {
  const rows = await mainDb.unsafe<DBIndicatorCommon[]>(
    `SELECT ${COMMON_INDICATOR_COLUMNS} FROM indicators ORDER BY sort_order, indicator_common_id`,
  );
  return rows.map(dbRowToCommonIndicator);
}

// The whole dictionary: every indicator with its sources (a derived
// indicator's list is empty).
export async function getIndicatorsWithSources(
  sql: Sql,
): Promise<IndicatorWithSources[]> {
  const rows = await sql.unsafe<
    (DBIndicatorCommon & { sources: IndicatorSource[] | null })[]
  >(`
    SELECT
      ${COMMON_INDICATOR_COLUMNS.split(", ").map((c) => `i.${c}`).join(", ")},
      (
        SELECT json_agg(json_build_object('source_id', s.source_id, 'source_label', s.source_label) ORDER BY s.source_id)
        FROM indicator_sources s
        WHERE s.indicator_id = i.indicator_common_id
      ) AS sources
    FROM indicators i
    ORDER BY i.sort_order, i.indicator_common_id
  `);
  return rows.map((row) => ({
    ...dbRowToCommonIndicator(row),
    sources: row.sources ?? [],
  }));
}

export async function getInstanceIndicatorDetails(
  mainDb: Sql,
): Promise<APIResponseWithData<InstanceIndicatorDetails>> {
  return await tryCatchDatabaseAsync(async () => {
    return {
      success: true,
      data: { indicators: await getIndicatorsWithSources(mainDb) },
    };
  });
}

// =============================================================================
// GUARDS
// =============================================================================

// The authoring validator (PLAN_1a §1.2): an expression may only name
// indicators that resolve to `base` or `derived`, may not cycle or nest too
// deep, and must flatten to no more ingredients than a results row can
// carry. Enforced HERE, where the user is; run capture enforces the same
// rules again where the data is. `pendingDefinitions` overrides what the
// dictionary says about the rows being written, so a cycle is judged against
// the state the write would produce.
async function checkDefinitionsResolve(
  mainDb: Sql,
  pendingDefinitions: Map<string, CommonIndicatorDefinition>,
): Promise<string | undefined> {
  // The resolver reports an unknown population identifier itself, listing
  // the type ids: the store's types are ordinary dictionary entries.
  const entries = new Map<string, ExpressionDictionaryEntry>(
    (await loadExpressionDictionaryEntries(mainDb)).map((e) => [e.id, e]),
  );
  for (const [id, definition] of pendingDefinitions) {
    entries.set(id, {
      id,
      type: definition.type,
      expression: definition.type === "base" ? null : definition.expression,
    });
  }
  const dictionary = buildExpressionDictionary([...entries.values()]);
  for (const [id, definition] of pendingDefinitions) {
    if (definition.type === "base") continue;
    try {
      resolveIndicatorExpression({
        ownId: id,
        source: definition.expression,
        dictionary,
        maxIngredients: MAX_INDICATOR_EXPRESSION_INGREDIENTS,
      });
    } catch (e) {
      if (e instanceof IndicatorExpressionError) return e.message;
      throw e;
    }
  }
  // A write can also break an indicator that is not itself being written:
  // repointing an indicator at a new expression invalidates every chain
  // that runs through it.
  for (const entry of entries.values()) {
    if (entry.type !== "derived" || pendingDefinitions.has(entry.id)) continue;
    try {
      resolveIndicatorExpression({
        ownId: entry.id,
        source: entry.expression ?? "",
        dictionary,
        maxIngredients: MAX_INDICATOR_EXPRESSION_INGREDIENTS,
      });
    } catch (e) {
      if (e instanceof IndicatorExpressionError) {
        return `This change would break ${
          JSON.stringify(entry.id)
        }: ${e.message}`;
      }
      throw e;
    }
  }
  return undefined;
}

// The delete guard over expressions: an indicator named by another's
// formula cannot go. Resolving each surviving definition against the
// post-delete dictionary is what makes the check exact: an id used only deep
// inside a chain blocks the delete just as a directly-named one does.
async function expressionsBlockingRemoval(
  sql: Sql,
  removedIds: Set<string>,
): Promise<string[]> {
  const survivors = (await loadExpressionDictionaryEntries(sql)).filter(
    (e) => !removedIds.has(e.id),
  );
  const dictionary = buildExpressionDictionary(survivors);
  const blocked: string[] = [];
  for (const survivor of survivors) {
    if (survivor.type !== "derived") continue;
    try {
      resolveIndicatorExpression({
        ownId: survivor.id,
        source: survivor.expression ?? "",
        dictionary,
        maxIngredients: MAX_INDICATOR_EXPRESSION_INGREDIENTS,
      });
    } catch (e) {
      if (!(e instanceof IndicatorExpressionError)) throw e;
      blocked.push(`${survivor.id} (${e.message})`);
    }
  }
  return blocked;
}

// Data never exists without its source (dataset_hmis.source_id RESTRICTs),
// so removing a source with data is refused here, with the counts, before
// the FK would.
async function sourcesWithData(
  sql: Sql,
  sourceIds: string[],
): Promise<{ source_id: string; count: number }[]> {
  if (sourceIds.length === 0) return [];
  return await sql<{ source_id: string; count: number }[]>`
    SELECT source_id, COUNT(*)::int AS count
    FROM dataset_hmis
    WHERE source_id = ANY(${sourceIds})
    GROUP BY source_id
    ORDER BY source_id
  `;
}

function describeSourcesWithData(
  rows: { source_id: string; count: number }[],
): string {
  return rows.map((r) => `${r.source_id} (${r.count} records)`).join(", ");
}

// A source belongs to exactly one base (the primary key). Reports the
// sources in `sourceIds` that another indicator already owns.
async function sourcesOwnedElsewhere(
  sql: Sql,
  sourceIds: string[],
  ownerIds: Set<string>,
): Promise<{ source_id: string; indicator_id: string }[]> {
  if (sourceIds.length === 0) return [];
  const rows = await sql<{ source_id: string; indicator_id: string }[]>`
    SELECT source_id, indicator_id FROM indicator_sources
    WHERE source_id = ANY(${sourceIds})
    ORDER BY source_id
  `;
  return rows.filter((r) => !ownerIds.has(r.indicator_id));
}

function describeOwnedElsewhere(
  rows: { source_id: string; indicator_id: string }[],
): string {
  return `A source belongs to exactly one base indicator; these already belong to another: ${
    rows.map((r) => `${r.source_id} (${r.indicator_id})`).join(", ")
  }. Use the other indicator, or define a derived indicator over it.`;
}

// =============================================================================
// WRITE OPERATIONS
// =============================================================================

export type NewIndicator = {
  indicator_common_id: string;
  indicator_common_label: string;
  sources: IndicatorSource[];
  definition: CommonIndicatorDefinition;
  format_as: IndicatorFormat;
  thresholds: ThresholdsRule | null;
};

async function writeSources(
  sql: Sql,
  indicatorId: string,
  sources: IndicatorSource[],
): Promise<void> {
  for (const source of sources) {
    await sql`
      INSERT INTO indicator_sources (source_id, indicator_id, source_label, updated_at)
      VALUES (${source.source_id}, ${indicatorId}, ${source.source_label}, CURRENT_TIMESTAMP)
      ON CONFLICT (source_id) DO UPDATE SET
        indicator_id = EXCLUDED.indicator_id,
        source_label = EXCLUDED.source_label,
        updated_at = CURRENT_TIMESTAMP
    `;
  }
}

// Creates indicators, each with its sources, in one transaction. Every id
// goes through the validator (ruling 5): a reserved word is refused, a
// special id is accepted for a base and refused for a derived, a source id
// keeps the charset rule only.
export async function createIndicators(
  mainDb: Sql,
  indicators: NewIndicator[],
): Promise<APIResponseWithData<{ created: number }>> {
  return await tryCatchDatabaseAsync(async () => {
    for (const indicator of indicators) {
      const idIssue = getNewIndicatorIdIssue(
        indicator.indicator_common_id,
        indicator.definition.type,
      );
      if (idIssue) {
        return {
          success: false,
          err: `Invalid indicator ID ${
            JSON.stringify(indicator.indicator_common_id)
          }: ${describeNewIndicatorIdIssue(idIssue)}`,
        };
      }
      const issues = sourceIdIssues(indicator.sources);
      if (issues.length > 0) {
        return { success: false, err: issues.join("; ") };
      }
      const err = formatRuleError(indicator.definition, indicator.format_as) ??
        sourcesRuleError(indicator.definition, indicator.sources);
      if (err) {
        return { success: false, err: `${indicator.indicator_common_id}: ${err}` };
      }
    }

    const ids = indicators.map((i) => i.indicator_common_id);
    const duplicateIds = ids.filter((id, index) => ids.indexOf(id) !== index);
    if (duplicateIds.length > 0) {
      return {
        success: false,
        err: `Duplicate indicator IDs in request: ${duplicateIds.join(", ")}`,
      };
    }

    const existingIds = await mainDb<{ indicator_common_id: string }[]>`
      SELECT indicator_common_id FROM indicators
      WHERE indicator_common_id = ANY(${ids})
    `;
    if (existingIds.length > 0) {
      return {
        success: false,
        err: `Indicators already exist: ${
          existingIds.map((row) => row.indicator_common_id).join(", ")
        }`,
      };
    }

    const allSourceIds = indicators.flatMap((i) =>
      i.sources.map((s) => s.source_id)
    );
    const duplicateSources = allSourceIds.filter((id, index) =>
      allSourceIds.indexOf(id) !== index
    );
    if (duplicateSources.length > 0) {
      return {
        success: false,
        err: `A source belongs to exactly one base indicator; these appear more than once: ${
          duplicateSources.join(", ")
        }`,
      };
    }
    const owned = await sourcesOwnedElsewhere(mainDb, allSourceIds, new Set());
    if (owned.length > 0) {
      return { success: false, err: describeOwnedElsewhere(owned) };
    }

    const definitionErr = await checkDefinitionsResolve(
      mainDb,
      new Map(indicators.map((i) => [i.indicator_common_id, i.definition])),
    );
    if (definitionErr) {
      return { success: false, err: definitionErr };
    }

    // All-or-nothing: one failed item aborts the whole Postgres transaction
    // (every later statement fails with "transaction is aborted"), so
    // per-item catch-and-continue can never deliver partial success. The
    // rethrow decorates the error with the item that caused it.
    await mainDb.begin(async (sql) => {
      let sortOrder = (
        await sql<{ next: number }[]>`
          SELECT COALESCE(MAX(sort_order), 0) + 1 AS next FROM indicators
        `
      )[0].next;
      for (const indicator of indicators) {
        try {
          const d = definitionFields(indicator.definition);
          await sql`
            INSERT INTO indicators (
              indicator_common_id, indicator_common_label,
              definition_type, expression,
              format_as, thresholds, sort_order, updated_at
            )
            VALUES (
              ${indicator.indicator_common_id}, ${indicator.indicator_common_label},
              ${d.definition_type}, ${d.expression},
              ${indicator.format_as},
              ${thresholdsToDb(indicator.thresholds)},
              ${sortOrder++}, CURRENT_TIMESTAMP
            )
          `;
          await writeSources(sql, indicator.indicator_common_id, indicator.sources);
        } catch (error) {
          throw new Error(
            `${indicator.indicator_common_id}: ${
              error instanceof Error ? error.message : "Unknown error"
            }`,
          );
        }
      }
    });

    return { success: true, data: { created: indicators.length } };
  });
}

// Updates an indicator and replaces its source list. Ids are immutable
// after creation (the id is the column key in every results package). A
// source removed here must carry no data; a source added here must not
// belong to another indicator; a retype to derived drops every source.
export async function updateIndicator(
  mainDb: Sql,
  oldIndicatorId: string,
  update: NewIndicator,
): Promise<APIResponseNoData> {
  return await tryCatchDatabaseAsync(async () => {
    if (oldIndicatorId !== update.indicator_common_id) {
      return {
        success: false,
        err:
          "Indicator IDs cannot be changed after creation. Create a new indicator instead.",
      };
    }

    const typeIssue = getSpecialIndicatorTypeIssue(
      update.indicator_common_id,
      update.definition.type,
    );
    if (typeIssue) {
      return {
        success: false,
        err: `Indicator ID ${
          JSON.stringify(update.indicator_common_id)
        } ${describeNewIndicatorIdIssue(typeIssue)}`,
      };
    }
    const issues = sourceIdIssues(update.sources);
    if (issues.length > 0) {
      return { success: false, err: issues.join("; ") };
    }
    const err = formatRuleError(update.definition, update.format_as) ??
      sourcesRuleError(update.definition, update.sources);
    if (err) {
      return { success: false, err };
    }

    const definitionErr = await checkDefinitionsResolve(
      mainDb,
      new Map([[oldIndicatorId, update.definition]]),
    );
    if (definitionErr) {
      return { success: false, err: definitionErr };
    }

    const nextIds = new Set(update.sources.map((s) => s.source_id));
    const owned = await sourcesOwnedElsewhere(
      mainDb,
      [...nextIds],
      new Set([oldIndicatorId]),
    );
    if (owned.length > 0) {
      return { success: false, err: describeOwnedElsewhere(owned) };
    }
    const current = await mainDb<{ source_id: string }[]>`
      SELECT source_id FROM indicator_sources WHERE indicator_id = ${oldIndicatorId}
    `;
    const removedIds = current
      .map((r) => r.source_id)
      .filter((id) => !nextIds.has(id));
    const withData = await sourcesWithData(mainDb, removedIds);
    if (withData.length > 0) {
      return {
        success: false,
        err: `Cannot remove sources that have data: ${
          describeSourcesWithData(withData)
        }. Delete their data first.`,
      };
    }

    const d = definitionFields(update.definition);
    await mainDb.begin(async (sql) => {
      await sql`
        UPDATE indicators
        SET
          indicator_common_label = ${update.indicator_common_label},
          definition_type = ${d.definition_type},
          expression = ${d.expression},
          format_as = ${update.format_as},
          thresholds = ${thresholdsToDb(update.thresholds)},
          updated_at = CURRENT_TIMESTAMP
        WHERE indicator_common_id = ${oldIndicatorId}
      `;
      if (removedIds.length > 0) {
        await sql`
          DELETE FROM indicator_sources
          WHERE indicator_id = ${oldIndicatorId} AND source_id = ANY(${removedIds})
        `;
      }
      await writeSources(sql, oldIndicatorId, update.sources);
    });

    return { success: true };
  });
}

export async function reorderCommonIndicators(
  mainDb: Sql,
  order: string[],
): Promise<APIResponseNoData> {
  return await tryCatchDatabaseAsync(async () => {
    await mainDb.begin(async (sql) => {
      for (let i = 0; i < order.length; i++) {
        await sql`
          UPDATE indicators
          SET sort_order = ${i + 1},
              updated_at = CURRENT_TIMESTAMP
          WHERE indicator_common_id = ${order[i]}
        `;
      }
    });
    return { success: true };
  });
}

// Deletes indicators; their sources go with them (CASCADE). Refused with a
// listing when a source still has data or another indicator's expression
// still needs the id. A special indicator is deleted like any base.
export async function deleteIndicators(
  mainDb: Sql,
  indicatorIds: string[],
): Promise<APIResponseNoData> {
  return await tryCatchDatabaseAsync(async () => {
    if (indicatorIds.length === 0) {
      return { success: true };
    }

    const found = await mainDb<{ indicator_common_id: string }[]>`
      SELECT indicator_common_id FROM indicators
      WHERE indicator_common_id = ANY(${indicatorIds})
    `;
    const foundIds = new Set(found.map((row) => row.indicator_common_id));
    const notFoundIds = indicatorIds.filter((id) => !foundIds.has(id));
    if (notFoundIds.length > 0) {
      return {
        success: false,
        err: `Indicators not found: ${notFoundIds.join(", ")}`,
      };
    }

    const sourceIds = (
      await mainDb<{ source_id: string }[]>`
        SELECT source_id FROM indicator_sources WHERE indicator_id = ANY(${indicatorIds})
      `
    ).map((r) => r.source_id);
    const withData = await sourcesWithData(mainDb, sourceIds);
    if (withData.length > 0) {
      return {
        success: false,
        err: `Cannot delete indicators whose sources have data: ${
          describeSourcesWithData(withData)
        }. Delete their data first.`,
      };
    }

    const blocked = await expressionsBlockingRemoval(
      mainDb,
      new Set(indicatorIds),
    );
    if (blocked.length > 0) {
      return {
        success: false,
        err: `Cannot delete indicators that other indicators are defined from: ${
          blocked.join("; ")
        }`,
      };
    }

    await mainDb`
      DELETE FROM indicators
      WHERE indicator_common_id = ANY(${indicatorIds})
    `;

    return { success: true };
  });
}

// =============================================================================
// BATCH FILE (PLAN_A3 ruling 11)
// =============================================================================

type BatchRow = {
  row: number;
  id: string;
  label: string;
  type: CommonIndicatorDefinition["type"];
  sources: string[];
  expression: string;
  format_as: IndicatorFormat;
  thresholds: ThresholdsRule | null;
};

const BATCH_FORMATS: readonly IndicatorFormat[] = [
  "number",
  "percent",
  "rate_per_10k",
];

// One file, one row per indicator: `sources` semicolon-separated for a
// base and empty for a derived. Upsert keeps an existing row's sort_order;
// replace deletes every indicator the file does not name, refusing with a
// listing when that would remove a source with data or an id a surviving
// expression names. Every id goes through the validator.
export async function batchUploadIndicators(
  mainDb: Sql,
  assetFileName: string,
  replaceAllExisting: boolean,
): Promise<APIResponseNoData> {
  return await tryCatchDatabaseAsync(async () => {
    const filePath = resolveAssetFilePath(assetFileName);
    let csvData: Record<string, string>[];
    try {
      csvData = (
        await readCsvFile(filePath, { rowHeaders: "none" })
      ).toObjects();
    } catch (error) {
      return {
        success: false,
        err: `Failed to read CSV file: ${
          error instanceof Error ? error.message : String(error)
        }`,
      };
    }

    const parsed = parseBatchRows(csvData);
    if (!parsed.ok) {
      return { success: false, err: parsed.err };
    }
    const rows = parsed.rows;

    const existing = await getIndicatorsWithSources(mainDb);
    const existingById = new Map(existing.map((i) => [i.indicator_common_id, i]));
    const fileIds = new Set(rows.map((r) => r.id));

    // Row numbers are 1-based and count the CSV header row.
    const problems: string[] = [];
    for (const r of rows) {
      const current = existingById.get(r.id);
      const idIssue = current === undefined
        ? getNewIndicatorIdIssue(r.id, r.type)
        : getSpecialIndicatorTypeIssue(r.id, r.type);
      if (idIssue) {
        problems.push(
          `row ${r.row} (${r.id}): ${describeNewIndicatorIdIssue(idIssue)}`,
        );
      }
      for (const sourceId of r.sources) {
        const issue = getNewSourceIdIssue(sourceId);
        if (issue) {
          problems.push(
            `row ${r.row} (${sourceId}): ${describeNewIndicatorIdIssue(issue)}`,
          );
        }
      }
    }
    if (problems.length > 0) {
      return { success: false, err: `Invalid ids in CSV: ${problems.join("; ")}` };
    }

    // The dictionary the file describes.
    const sourceOwner = new Map<string, string>();
    for (const r of rows) {
      for (const sourceId of r.sources) {
        const other = sourceOwner.get(sourceId);
        if (other !== undefined && other !== r.id) {
          return {
            success: false,
            err: `A source belongs to exactly one base indicator; ${sourceId} is listed under ${other} and ${r.id}`,
          };
        }
        sourceOwner.set(sourceId, r.id);
      }
    }
    if (!replaceAllExisting) {
      for (const i of existing) {
        if (fileIds.has(i.indicator_common_id)) continue;
        for (const s of i.sources) {
          const fileOwner = sourceOwner.get(s.source_id);
          if (fileOwner !== undefined) {
            return {
              success: false,
              err: `A source belongs to exactly one base indicator; ${s.source_id} already belongs to ${i.indicator_common_id} and the file lists it under ${fileOwner}`,
            };
          }
        }
      }
    }

    // Sources the write would take from their current owner: removed (a
    // replace removes every source the file does not list; an upsert
    // removes the sources of a row it rewrites that the row no longer
    // lists) or moved to another row of the file. Both leave the old
    // owner's data behind, so both are refused while the source has data.
    const currentOwner = new Map<string, string>();
    const existingLabels = new Map<string, string>();
    for (const i of existing) {
      for (const s of i.sources) {
        currentOwner.set(s.source_id, i.indicator_common_id);
        existingLabels.set(s.source_id, s.source_label);
      }
    }
    const removedSourceIds: string[] = [];
    for (const i of existing) {
      const inFile = fileIds.has(i.indicator_common_id);
      if (!inFile && !replaceAllExisting) continue;
      const kept = new Set(
        inFile ? rows.find((r) => r.id === i.indicator_common_id)!.sources : [],
      );
      for (const s of i.sources) {
        if (!kept.has(s.source_id) && sourceOwner.get(s.source_id) === undefined) {
          removedSourceIds.push(s.source_id);
        }
      }
    }
    const moved = [...sourceOwner].filter(([sourceId, owner]) => {
      const current = currentOwner.get(sourceId);
      return current !== undefined && current !== owner;
    });
    const movedWithData = await sourcesWithData(
      mainDb,
      moved.map(([sourceId]) => sourceId),
    );
    if (movedWithData.length > 0) {
      return {
        success: false,
        err: `The file would move sources that have data to another indicator: ${
          describeSourcesWithData(movedWithData)
        }. Keep them under their current indicator or delete their data first.`,
      };
    }
    const withData = await sourcesWithData(mainDb, removedSourceIds);
    if (withData.length > 0) {
      return {
        success: false,
        err: `The file would remove sources that have data: ${
          describeSourcesWithData(withData)
        }. Keep them in the file or delete their data first.`,
      };
    }

    const removedIndicatorIds = replaceAllExisting
      ? existing
        .map((i) => i.indicator_common_id)
        .filter((id) => !fileIds.has(id))
      : [];

    await mainDb.begin(async (sql) => {
      let sortOrder = (
        await sql<{ next: number }[]>`
          SELECT COALESCE(MAX(sort_order), 0) + 1 AS next FROM indicators
        `
      )[0].next;
      // Every indicator row lands before any source is written, so a moved
      // source's new owner exists (the FK is not deferrable). New rows sort
      // after everything that exists (CSV order preserved); an update keeps
      // the row's place.
      for (const r of rows) {
        const definition: CommonIndicatorDefinition = r.type === "base"
          ? { type: "base" }
          : { type: "derived", expression: r.expression };
        const d = definitionFields(definition);
        await sql`
          INSERT INTO indicators (
            indicator_common_id, indicator_common_label, definition_type, expression,
            format_as, thresholds, sort_order, updated_at
          )
          VALUES (
            ${r.id}, ${r.label}, ${d.definition_type}, ${d.expression},
            ${r.format_as}, ${thresholdsToDb(r.thresholds)}, ${sortOrder++}, CURRENT_TIMESTAMP
          )
          ON CONFLICT (indicator_common_id) DO UPDATE SET
            indicator_common_label = EXCLUDED.indicator_common_label,
            definition_type = EXCLUDED.definition_type,
            expression = EXCLUDED.expression,
            format_as = EXCLUDED.format_as,
            thresholds = EXCLUDED.thresholds,
            updated_at = CURRENT_TIMESTAMP
        `;
      }
      // Moves before the per-row source writes, so the outcome does not
      // depend on the file's row order: a moved source is already under its
      // new owner when the old owner's row drops it. An UPDATE rather than a
      // delete and re-insert keeps the source's ledger rows (CASCADE).
      for (const [sourceId, owner] of moved) {
        await sql`
          UPDATE indicator_sources
          SET indicator_id = ${owner}, updated_at = CURRENT_TIMESTAMP
          WHERE source_id = ${sourceId}
        `;
      }
      // After the moves, so a replace that drops an old owner does not
      // cascade a moved source away.
      if (removedIndicatorIds.length > 0) {
        await sql`
          DELETE FROM indicators WHERE indicator_common_id = ANY(${removedIndicatorIds})
        `;
      }
      for (const r of rows) {
        const keptSources = new Set(r.sources);
        await sql`
          DELETE FROM indicator_sources
          WHERE indicator_id = ${r.id} AND NOT (source_id = ANY(${r.sources}))
        `;
        // The file carries no source labels: an existing source keeps its
        // label (through a move too), a new one is labelled by its id until
        // edited.
        await writeSources(
          sql,
          r.id,
          [...keptSources].map((source_id) => ({
            source_id,
            source_label: existingLabels.get(source_id) ?? source_id,
          })),
        );
      }

      // The file's expressions are checked against the dictionary the file
      // leaves behind: an unresolvable one aborts the whole write.
      const survivors = await loadExpressionDictionaryEntries(sql);
      const dictionary = buildExpressionDictionary(survivors);
      for (const survivor of survivors) {
        if (survivor.type !== "derived") continue;
        resolveIndicatorExpression({
          ownId: survivor.id,
          source: survivor.expression ?? "",
          dictionary,
          maxIngredients: MAX_INDICATOR_EXPRESSION_INGREDIENTS,
        });
      }
    });

    return { success: true };
  });
}

function parseBatchRows(
  csvData: Record<string, string>[],
): { ok: true; rows: BatchRow[] } | { ok: false; err: string } {
  const rows: BatchRow[] = [];
  const seen = new Set<string>();
  for (const [index, raw] of csvData.entries()) {
    const row = index + 2;
    const cell = (key: (typeof INDICATOR_BATCH_FILE_COLUMNS)[number]) =>
      (raw[key] ?? "").trim();
    const id = cell("indicator_id");
    const label = cell("label");
    const type = cell("type") || "base";
    if (!id || !label) {
      return {
        ok: false,
        err: `row ${row}: indicator_id and label are required (columns: ${
          INDICATOR_BATCH_FILE_COLUMNS.join(", ")
        })`,
      };
    }
    if (seen.has(id)) {
      return { ok: false, err: `row ${row}: ${id} appears more than once` };
    }
    seen.add(id);
    if (!isCommonIndicatorType(type)) {
      return { ok: false, err: `row ${row} (${id}): type must be base or derived` };
    }
    const sources = cell("sources")
      .split(INDICATOR_BATCH_SOURCES_SEPARATOR)
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
    const expression = cell("expression");
    if (type === "base" && expression !== "") {
      return { ok: false, err: `row ${row} (${id}): a base indicator has no expression` };
    }
    if (type === "derived" && expression === "") {
      return { ok: false, err: `row ${row} (${id}): a derived indicator needs an expression` };
    }
    if (type === "derived" && sources.length > 0) {
      return { ok: false, err: `row ${row} (${id}): a derived indicator has no sources` };
    }
    const formatCell = cell("format_as") || "number";
    if (!(BATCH_FORMATS as readonly string[]).includes(formatCell)) {
      return { ok: false, err: `row ${row} (${id}): format_as must be one of ${BATCH_FORMATS.join(", ")}` };
    }
    const format_as = formatCell as IndicatorFormat;
    if (type === "base" && format_as !== "number") {
      return { ok: false, err: `row ${row} (${id}): a base indicator is a count and is always formatted as a number` };
    }
    let thresholds: ThresholdsRule | null = null;
    const thresholdsCell = cell("thresholds");
    if (thresholdsCell !== "") {
      try {
        thresholds = thresholdsRuleSchema.parse(JSON.parse(thresholdsCell));
      } catch {
        return { ok: false, err: `row ${row} (${id}): thresholds is not a valid rule` };
      }
    }
    rows.push({ row, id, label, type, sources, expression, format_as, thresholds });
  }
  return { ok: true, rows };
}
