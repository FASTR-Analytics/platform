import { Sql } from "postgres";
import {
  APIResponseNoData,
  APIResponseWithData,
  buildExpressionDictionary,
  collectIdentifiers,
  definitionDataId,
  describeDhis2ElementRefusal,
  describeDhis2ParseRefusal,
  describeNewIndicatorIdIssue,
  type Dhis2ElementVerdict,
  type Dhis2IndicatorDecomposition,
  type ExpressionDictionaryEntry,
  getNewIndicatorIdIssue,
  getSpecialIndicatorTypeIssue,
  hasRows,
  type HmisIndicator,
  type HmisIndicatorDefinition,
  type HmisIndicatorType,
  INDICATOR_BATCH_FILE_COLUMNS,
  INDICATOR_BATCH_MEMBERS_SEPARATOR,
  IndicatorExpressionError,
  type IndicatorFormat,
  type IndicatorNamingElement,
  type IndicatorNamingInput,
  type IndicatorNamingUploaded,
  type InstanceIndicatorDetails,
  isCount,
  isDhis2ShapedId,
  isHmisIndicatorType,
  MAX_INDICATOR_EXPRESSION_INGREDIENTS,
  parseIndicatorExpression,
  POPULATION_TYPE_IDS,
  renameIdentifierInExpression,
  renameIdentifiers,
  resolveIndicatorExpression,
  t3,
  type ThresholdsRule,
  thresholdsRuleSchema,
  writeIndicatorExpression,
} from "lib";
import { tryCatchDatabaseAsync } from "./../utils.ts";
import { resolveAssetFilePath } from "./assets.ts";
import { readCsvFile } from "@timroberton/panther";

// The stored shape of one indicator (PLAN_A5 ruling 1). `expression` is a
// derived indicator's formula, `data_id` the key an Uploaded or DHIS2
// element indicator's rows carry; each NULL for the other types (the
// table's CHECK). `members` is aggregated from indicator_sum_members,
// ordered by member id, empty for every other type. `thresholds` is the CF
// rule as JSON text (every JSON column is text: JSON.parse on read,
// JSON.stringify on write: SYSTEM_02), validated by the lib schema here.
export type DBIndicatorCommon = {
  indicator_common_id: string;
  indicator_common_label: string;
  definition_type: HmisIndicatorType;
  expression: string | null;
  data_id: string | null;
  members: string[];
  include_in_analysis: boolean;
  format_as: IndicatorFormat;
  thresholds: string | null;
  sort_order: number;
};

const INDICATOR_COLUMNS = `
  i.indicator_common_id, i.indicator_common_label, i.definition_type, i.expression, i.data_id,
  (SELECT COALESCE(array_agg(m.member_id ORDER BY m.member_id), ARRAY[]::text[])
     FROM indicator_sum_members m WHERE m.sum_id = i.indicator_common_id) AS members,
  i.include_in_analysis, i.format_as, i.thresholds, i.sort_order`;

export function dbRowToHmisIndicator(row: DBIndicatorCommon): HmisIndicator {
  return {
    indicator_common_id: row.indicator_common_id,
    indicator_common_label: row.indicator_common_label,
    definition: dbRowToDefinition(row),
    include_in_analysis: row.include_in_analysis,
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

function dbRowToDefinition(row: DBIndicatorCommon): HmisIndicatorDefinition {
  switch (row.definition_type) {
    case "uploaded":
      return { type: "uploaded", data_id: row.data_id };
    case "dhis2_element":
      return { type: "dhis2_element", data_id: row.data_id! };
    case "sum":
      return { type: "sum", members: row.members };
    case "derived":
      return { type: "derived", expression: row.expression! };
  }
}

type DefinitionFields = {
  definition_type: HmisIndicatorType;
  expression: string | null;
  data_id: string | null;
  members: string[];
};

function definitionFields(
  definition: HmisIndicatorDefinition,
): DefinitionFields {
  return {
    definition_type: definition.type,
    expression: definition.type === "derived" ? definition.expression : null,
    data_id: definitionDataId(definition),
    members: definition.type === "sum" ? definition.members : [],
  };
}

// `format_as` is display-only and the sole scale (PLAN_1c ruling 3), and so
// is `thresholds`. A count is always a number with no conditional-formatting
// rule (the table's two count CHECKs); a derived one chooses both.
function countRuleError(
  definition: HmisIndicatorDefinition,
  formatAs: IndicatorFormat,
  thresholds: ThresholdsRule | null,
): string | undefined {
  if (!isCount(definition.type)) return undefined;
  if (formatAs !== "number") {
    return "An Uploaded, DHIS2 element or Sum indicator is a count and is always formatted as a number";
  }
  if (thresholds !== null) {
    return "An Uploaded, DHIS2 element or Sum indicator is a count and has no conditional-formatting rule";
  }
  return undefined;
}

// A DHIS2 element's data id is DHIS2-shaped (the table's CHECK); an
// Uploaded indicator's is whatever the file said, never blank.
function dataIdError(definition: HmisIndicatorDefinition): string | undefined {
  if (definition.type === "dhis2_element" && !isDhis2ShapedId(definition.data_id)) {
    return `DHIS2 id ${
      JSON.stringify(definition.data_id)
    } must be a data element UID or a UID.COC operand`;
  }
  if (
    definition.type === "uploaded" && definition.data_id !== null &&
    definition.data_id.trim() !== definition.data_id
  ) {
    return `File id ${JSON.stringify(definition.data_id)} must not have leading or trailing whitespace`;
  }
  if (definition.type === "uploaded" && definition.data_id === "") {
    return "A file id must not be empty; leave it unset instead";
  }
  return undefined;
}

// Sum members are indicators that have rows (PLAN_A5 ruling 2): each member
// must exist, as Uploaded or a DHIS2 element, in the dictionary the write
// leaves behind. `types` is that dictionary's id → type.
function membersRuleError(
  ownId: string,
  definition: HmisIndicatorDefinition,
  types: Map<string, HmisIndicatorType>,
): string | undefined {
  if (definition.type !== "sum") return undefined;
  if (definition.members.length === 0) {
    return "A sum needs at least one member";
  }
  const seen = new Set<string>();
  for (const member of definition.members) {
    if (seen.has(member)) return `Member ${JSON.stringify(member)} is listed twice`;
    seen.add(member);
    if (member === ownId) return "A sum cannot be its own member";
    const type = types.get(member);
    if (type === undefined) {
      return `Member ${JSON.stringify(member)} does not exist`;
    }
    if (!hasRows(type)) {
      return `Member ${
        JSON.stringify(member)
      } is not an Uploaded or DHIS2 element indicator (a sum's members are indicators that have rows)`;
    }
  }
  return undefined;
}

// The live expression dictionary: every count as a leaf, plus every
// population type under its own id.
async function loadExpressionDictionaryEntries(
  sql: Sql,
): Promise<ExpressionDictionaryEntry[]> {
  const stored = await sql<
    {
      indicator_common_id: string;
      definition_type: HmisIndicatorType;
      expression: string | null;
    }[]
  >`SELECT indicator_common_id, definition_type, expression FROM indicators`;
  return [
    ...stored.map((r) => ({
      id: r.indicator_common_id,
      type: r.definition_type === "derived" ? "derived" as const : "leaf" as const,
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

export async function getHmisIndicators(
  mainDb: Sql,
): Promise<HmisIndicator[]> {
  const rows = await mainDb.unsafe<DBIndicatorCommon[]>(
    `SELECT ${INDICATOR_COLUMNS} FROM indicators i ORDER BY i.sort_order, i.indicator_common_id`,
  );
  return rows.map(dbRowToHmisIndicator);
}

export async function getInstanceIndicatorDetails(
  mainDb: Sql,
): Promise<APIResponseWithData<InstanceIndicatorDetails>> {
  return await tryCatchDatabaseAsync(async () => {
    return {
      success: true,
      data: { indicators: await getHmisIndicators(mainDb) },
    };
  });
}

// =============================================================================
// GUARDS
// =============================================================================

// The authoring validator (PLAN_1a §1.2): an expression may only name
// indicators that resolve, may not cycle or nest too deep, and must flatten
// to no more ingredients than a results row can carry. Enforced HERE, where
// the user is; run capture enforces the same rules again where the data
// is. `pendingDefinitions` overrides what the dictionary says about the rows
// being written, so a cycle is judged against the state the write would
// produce; `rename` is the id change the write makes, applied to the
// dictionary and to every stored expression before anything is judged.
async function checkDefinitionsResolve(
  mainDb: Sql,
  pendingDefinitions: Map<string, HmisIndicatorDefinition>,
  rename?: { from: string; to: string },
): Promise<string | undefined> {
  // The resolver reports an unknown population identifier itself, listing
  // the type ids: the store's types are ordinary dictionary entries.
  const entries = new Map<string, ExpressionDictionaryEntry>();
  for (const e of await loadExpressionDictionaryEntries(mainDb)) {
    if (rename !== undefined && e.id === rename.from) continue;
    entries.set(e.id, {
      ...e,
      expression: rename !== undefined && e.expression !== null
        ? renameIdentifierInExpression(e.expression, rename.from, rename.to)
        : e.expression,
    });
  }
  for (const [id, definition] of pendingDefinitions) {
    entries.set(id, {
      id,
      type: definition.type === "derived" ? "derived" : "leaf",
      expression: definition.type === "derived" ? definition.expression : null,
    });
  }
  const dictionary = buildExpressionDictionary([...entries.values()]);
  for (const [id, definition] of pendingDefinitions) {
    if (definition.type !== "derived") continue;
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

type WithData = { indicator_id: string; data_id: string; count: number };

// Data never exists without the indicator that holds its key
// (dataset_hmis.data_id RESTRICTs), so removing such an indicator,
// retyping it out of the types that have rows, or moving its data id is
// refused here, with the counts, before the FK would.
async function indicatorsWithData(
  sql: Sql,
  indicatorIds: string[],
): Promise<WithData[]> {
  if (indicatorIds.length === 0) return [];
  return await sql<WithData[]>`
    SELECT i.indicator_common_id AS indicator_id, i.data_id, COUNT(d.*)::int AS count
    FROM indicators i
    JOIN dataset_hmis d ON d.data_id = i.data_id
    WHERE i.indicator_common_id = ANY(${indicatorIds})
    GROUP BY i.indicator_common_id, i.data_id
    ORDER BY i.indicator_common_id
  `;
}

function describeWithData(rows: WithData[]): string {
  return rows.map((r) => `${r.indicator_id} (${r.count} records)`).join(", ");
}

// A sum is data, so the dependency on its members is strict (ruling 2):
// the sums that name any of `memberIds`, excluding `ignoreSumIds`.
async function sumsNaming(
  sql: Sql,
  memberIds: string[],
  ignoreSumIds: Set<string> = new Set(),
): Promise<{ sum_id: string; member_id: string }[]> {
  if (memberIds.length === 0) return [];
  const rows = await sql<{ sum_id: string; member_id: string }[]>`
    SELECT sum_id, member_id FROM indicator_sum_members
    WHERE member_id = ANY(${memberIds})
    ORDER BY sum_id, member_id
  `;
  return rows.filter((r) => !ignoreSumIds.has(r.sum_id));
}

function describeSumsNaming(
  rows: { sum_id: string; member_id: string }[],
): string {
  return rows.map((r) => `${r.member_id} (in ${r.sum_id})`).join(", ");
}

// A data id belongs to exactly one indicator (the UNIQUE constraint).
// Reports the ids in `dataIds` that an indicator other than `ownerIds`
// holds.
async function dataIdsOwnedElsewhere(
  sql: Sql,
  dataIds: string[],
  ownerIds: Set<string>,
): Promise<{ data_id: string; indicator_id: string }[]> {
  if (dataIds.length === 0) return [];
  const rows = await sql<{ data_id: string; indicator_id: string }[]>`
    SELECT data_id, indicator_common_id AS indicator_id FROM indicators
    WHERE data_id = ANY(${dataIds})
    ORDER BY data_id
  `;
  return rows.filter((r) => !ownerIds.has(r.indicator_id));
}

function describeOwnedElsewhere(
  rows: { data_id: string; indicator_id: string }[],
): string {
  return `A data id belongs to exactly one indicator; these already belong to another: ${
    rows.map((r) => `${r.data_id} (${r.indicator_id})`).join(", ")
  }.`;
}

async function loadTypes(
  sql: Sql,
): Promise<Map<string, HmisIndicatorType>> {
  const rows = await sql<
    { indicator_common_id: string; definition_type: HmisIndicatorType }[]
  >`SELECT indicator_common_id, definition_type FROM indicators`;
  return new Map(rows.map((r) => [r.indicator_common_id, r.definition_type]));
}

// =============================================================================
// WRITE OPERATIONS
// =============================================================================

export type NewIndicator = {
  indicator_common_id: string;
  indicator_common_label: string;
  definition: HmisIndicatorDefinition;
  include_in_analysis: boolean;
  format_as: IndicatorFormat;
  thresholds: ThresholdsRule | null;
};

// The pre-checks every create shares: each id through the validator (a
// reserved word refused, a special id accepted for a count and refused for
// a derived), a DHIS2 element's data id DHIS2-shaped, no data id held by
// another indicator, the format rule, no id or data id twice or already
// taken, every member an existing indicator with rows, and every
// expression resolving against the dictionary the write would leave.
async function checkIndicatorWrites(
  mainDb: Sql,
  indicators: NewIndicator[],
): Promise<string | undefined> {
  for (const indicator of indicators) {
    const idIssue = getNewIndicatorIdIssue(
      indicator.indicator_common_id,
      indicator.definition.type,
    );
    if (idIssue) {
      return `Invalid indicator ID ${
        JSON.stringify(indicator.indicator_common_id)
      }: ${describeNewIndicatorIdIssue(idIssue)}`;
    }
    const err = countRuleError(indicator.definition, indicator.format_as, indicator.thresholds) ??
      dataIdError(indicator.definition);
    if (err) {
      return `${indicator.indicator_common_id}: ${err}`;
    }
  }

  const ids = indicators.map((i) => i.indicator_common_id);
  const duplicateIds = ids.filter((id, index) => ids.indexOf(id) !== index);
  if (duplicateIds.length > 0) {
    return `Duplicate indicator IDs in request: ${duplicateIds.join(", ")}`;
  }

  if (ids.length > 0) {
    const existingIds = await mainDb<{ indicator_common_id: string }[]>`
      SELECT indicator_common_id FROM indicators
      WHERE indicator_common_id = ANY(${ids})
    `;
    if (existingIds.length > 0) {
      return `Indicators already exist: ${
        existingIds.map((row) => row.indicator_common_id).join(", ")
      }`;
    }
  }

  const dataIds = indicators.flatMap((i) => {
    const dataId = definitionDataId(i.definition);
    return dataId === null ? [] : [dataId];
  });
  const duplicateDataIds = dataIds.filter((id, index) =>
    dataIds.indexOf(id) !== index
  );
  if (duplicateDataIds.length > 0) {
    return `A data id belongs to exactly one indicator; these appear more than once: ${
      duplicateDataIds.join(", ")
    }`;
  }
  const owned = await dataIdsOwnedElsewhere(mainDb, dataIds, new Set());
  if (owned.length > 0) {
    return describeOwnedElsewhere(owned);
  }

  const types = await loadTypes(mainDb);
  for (const indicator of indicators) {
    types.set(indicator.indicator_common_id, indicator.definition.type);
  }
  for (const indicator of indicators) {
    const err = membersRuleError(
      indicator.indicator_common_id,
      indicator.definition,
      types,
    );
    if (err) return `${indicator.indicator_common_id}: ${err}`;
  }

  return await checkDefinitionsResolve(
    mainDb,
    new Map(indicators.map((i) => [i.indicator_common_id, i.definition])),
  );
}

async function writeMembers(
  sql: Sql,
  sumId: string,
  members: string[],
): Promise<void> {
  await sql`DELETE FROM indicator_sum_members WHERE sum_id = ${sumId}`;
  if (members.length > 0) {
    await sql`
      INSERT INTO indicator_sum_members (sum_id, member_id)
      SELECT ${sumId}, UNNEST(${members}::text[])
    `;
  }
}

// All-or-nothing: one failed item aborts the whole Postgres transaction
// (every later statement fails with "transaction is aborted"), so per-item
// catch-and-continue can never deliver partial success. The rethrow
// decorates the error with the item that caused it.
async function insertIndicators(
  sql: Sql,
  indicators: NewIndicator[],
): Promise<void> {
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
          definition_type, expression, data_id, include_in_analysis,
          format_as, thresholds, sort_order, updated_at
        )
        VALUES (
          ${indicator.indicator_common_id}, ${indicator.indicator_common_label},
          ${d.definition_type}, ${d.expression}, ${d.data_id},
          ${indicator.include_in_analysis},
          ${indicator.format_as},
          ${thresholdsToDb(indicator.thresholds)},
          ${sortOrder++}, CURRENT_TIMESTAMP
        )
      `;
      await writeMembers(sql, indicator.indicator_common_id, d.members);
    } catch (error) {
      throw new Error(
        `${indicator.indicator_common_id}: ${
          error instanceof Error ? error.message : "Unknown error"
        }`,
      );
    }
  }
}

// Creates indicators in one transaction.
export async function createIndicators(
  mainDb: Sql,
  indicators: NewIndicator[],
): Promise<APIResponseWithData<{ created: number }>> {
  return await tryCatchDatabaseAsync(async () => {
    const err = await checkIndicatorWrites(mainDb, indicators);
    if (err) {
      return { success: false, err };
    }
    await mainDb.begin((sql) => insertIndicators(sql, indicators));
    return { success: true, data: { created: indicators.length } };
  });
}

// =============================================================================
// THE NAMING STEP (PLAN_A5 rulings 6 and 7)
// =============================================================================

// An existing Uploaded indicator with no data id takes the value as its
// data id, and becomes a DHIS2 element when the value came from DHIS2.
type Assignment = {
  indicator_id: string;
  data_id: string;
  type: "uploaded" | "dhis2_element";
};

type NamingPlan =
  | { ok: true; indicators: NewIndicator[]; assignments: Assignment[] }
  | { ok: false; err: string };

// What the naming step's choices amount to. A DHIS2 element or operand: a
// new DHIS2 element under the chosen id, or, when the chosen id is an
// existing Uploaded indicator with no data id, that indicator takes the
// UID as its data id and becomes a DHIS2 element (this is how a seeded
// special becomes a DHIS2 element); any other existing id is refused. A
// file value: a new Uploaded indicator under the chosen id carrying the
// value as its data id, or, when the chosen id is an existing Uploaded
// indicator with no data id, that indicator adopts the value. A value some
// indicator already holds as its data id creates nothing, and a derived's
// expression is rewritten from data ids to the indicators those values
// land in. Everything created is in the analysis.
async function planIndicatorNaming(
  mainDb: Sql,
  input: IndicatorNamingInput,
): Promise<NamingPlan> {
  const existing = await getHmisIndicators(mainDb);
  const existingById = new Map(existing.map((i) => [i.indicator_common_id, i]));
  const ownerOfDataId = new Map<string, string>();
  for (const i of existing) {
    const dataId = definitionDataId(i.definition);
    if (dataId !== null) ownerOfDataId.set(dataId, i.indicator_common_id);
  }
  const landing = new Map<string, string>();
  const indicators: NewIndicator[] = [];
  const assignments: Assignment[] = [];
  const newIds = new Set<string>();

  const place = (
    row: IndicatorNamingElement | IndicatorNamingUploaded,
    type: "uploaded" | "dhis2_element",
  ): string | undefined => {
    const what = type === "dhis2_element" ? "DHIS2 id" : "File id";
    if (landing.has(row.data_id)) {
      return `${what} ${row.data_id} is listed more than once.`;
    }
    const owner = ownerOfDataId.get(row.data_id);
    if (owner !== undefined) {
      landing.set(row.data_id, owner);
      return undefined;
    }
    const target = existingById.get(row.indicator_id);
    if (target !== undefined) {
      if (target.definition.type !== "uploaded" || target.definition.data_id !== null) {
        return `Indicator ${
          JSON.stringify(row.indicator_id)
        } already exists and cannot take ${row.data_id}: only an Uploaded indicator without a file id can be assigned one.`;
      }
      landing.set(row.data_id, row.indicator_id);
      assignments.push({ indicator_id: row.indicator_id, data_id: row.data_id, type });
      return undefined;
    }
    if (newIds.has(row.indicator_id)) {
      return `Indicator ${
        JSON.stringify(row.indicator_id)
      } is chosen for more than one ${what}; one indicator carries one. Create one indicator per value and a sum over them.`;
    }
    newIds.add(row.indicator_id);
    landing.set(row.data_id, row.indicator_id);
    indicators.push({
      indicator_common_id: row.indicator_id,
      indicator_common_label: row.label,
      definition: { type, data_id: row.data_id },
      include_in_analysis: true,
      format_as: "number",
      thresholds: null,
    });
    return undefined;
  };

  for (const element of input.elements) {
    const err = place(element, "dhis2_element");
    if (err !== undefined) return { ok: false, err };
  }
  for (const uploaded of input.uploaded) {
    const err = place(uploaded, "uploaded");
    if (err !== undefined) return { ok: false, err };
  }
  for (const derived of input.derived) {
    let expression: string;
    try {
      const node = parseIndicatorExpression(derived.expression);
      const unnamed = collectIdentifiers(node).filter((id) => !landing.has(id));
      if (unnamed.length > 0) {
        return {
          ok: false,
          err: `${derived.indicator_id}: its formula names DHIS2 ids that were not named: ${
            unnamed.join(", ")
          }`,
        };
      }
      expression = writeIndicatorExpression(
        renameIdentifiers(node, Object.fromEntries(landing)),
      );
    } catch (e) {
      if (!(e instanceof IndicatorExpressionError)) throw e;
      return { ok: false, err: `${derived.indicator_id}: ${e.message}` };
    }
    indicators.push({
      indicator_common_id: derived.indicator_id,
      indicator_common_label: derived.label,
      definition: { type: "derived", expression },
      include_in_analysis: true,
      format_as: derived.format_as,
      thresholds: null,
    });
  }
  return { ok: true, indicators, assignments };
}

// Saves a naming step in one transaction: the new indicators, the data ids
// assigned to existing Uploaded indicators, and the derived indicators
// over them. Every pre-check of createIndicators applies, so either
// everything lands or nothing does.
export async function applyIndicatorNaming(
  mainDb: Sql,
  input: IndicatorNamingInput,
): Promise<APIResponseWithData<{ created: number; assigned: number }>> {
  return await tryCatchDatabaseAsync(async () => {
    const plan = await planIndicatorNaming(mainDb, input);
    if (!plan.ok) {
      return { success: false, err: plan.err };
    }
    for (const a of plan.assignments) {
      const err = dataIdError({ type: a.type, data_id: a.data_id });
      if (err) return { success: false, err };
    }
    const err = await checkIndicatorWrites(mainDb, plan.indicators);
    if (err) {
      return { success: false, err };
    }
    await mainDb.begin(async (sql) => {
      await insertIndicators(sql, plan.indicators);
      for (const a of plan.assignments) {
        await sql`
          UPDATE indicators
          SET data_id = ${a.data_id}, definition_type = ${a.type}, updated_at = CURRENT_TIMESTAMP
          WHERE indicator_common_id = ${a.indicator_id}
        `;
      }
    });
    return {
      success: true,
      data: {
        created: plan.indicators.length,
        assigned: plan.assignments.length,
      },
    };
  });
}

export type Dhis2NamingElement = IndicatorNamingElement & {
  verdict: Dhis2ElementVerdict;
};

export type Dhis2NamingIndicator = {
  uid: string;
  indicator_id: string;
  label: string;
  decomposition: Dhis2IndicatorDecomposition;
};

// The DHIS2 select form's save (rulings 6 and 8): the verdicts and
// decompositions are the server's own, computed by the route against live
// DHIS2 metadata, never the client's. A refused element or indicator
// refuses the whole save; an accepted indicator becomes a derived over the
// DHIS2 elements its operands land in.
export async function createIndicatorsFromDhis2(
  mainDb: Sql,
  input: { elements: Dhis2NamingElement[]; indicators: Dhis2NamingIndicator[] },
): Promise<APIResponseWithData<{ created: number; assigned: number }>> {
  const named = new Set(input.elements.map((e) => e.data_id));
  for (const element of input.elements) {
    if (!element.verdict.accepted) {
      return {
        success: false,
        err: `${element.data_id} cannot be imported: ${
          t3(describeDhis2ElementRefusal(element.verdict.refusal))
        }`,
      };
    }
  }
  const derived: IndicatorNamingInput["derived"] = [];
  for (const indicator of input.indicators) {
    const { parse, operands } = indicator.decomposition;
    if (!parse.accepted) {
      return {
        success: false,
        err: `DHIS2 indicator ${indicator.uid} cannot be decomposed: ${
          t3(describeDhis2ParseRefusal(parse.refusal))
        }`,
      };
    }
    for (const operand of operands) {
      if (!operand.verdict.accepted) {
        return {
          success: false,
          err: `DHIS2 indicator ${indicator.uid}: operand ${operand.data_id} cannot be imported: ${
            t3(describeDhis2ElementRefusal(operand.verdict.refusal))
          }`,
        };
      }
      if (!named.has(operand.data_id)) {
        return {
          success: false,
          err: `DHIS2 indicator ${indicator.uid}: operand ${operand.data_id} was not named`,
        };
      }
    }
    derived.push({
      indicator_id: indicator.indicator_id,
      label: indicator.label,
      expression: parse.expression,
      format_as: parse.format_as,
    });
  }
  return await applyIndicatorNaming(mainDb, {
    elements: input.elements.map(({ verdict: _verdict, ...element }) => element),
    uploaded: [],
    derived,
  });
}

// =============================================================================
// UPDATE, RENAME (PLAN_A5 rulings 3, 4 and 5)
// =============================================================================

// Why a rename to `update.indicator_common_id` is refused. Renaming from a
// special id is allowed: it takes the id out of the module scripts' inputs,
// exactly as deleting the indicator does (Tim, 2026-09-13).
async function renameError(
  mainDb: Sql,
  update: NewIndicator,
): Promise<string | undefined> {
  const newId = update.indicator_common_id;
  const idIssue = getNewIndicatorIdIssue(newId, update.definition.type);
  if (idIssue) {
    return `Invalid indicator ID ${JSON.stringify(newId)}: ${
      describeNewIndicatorIdIssue(idIssue)
    }`;
  }
  const taken = await mainDb<{ indicator_common_id: string }[]>`
    SELECT indicator_common_id FROM indicators WHERE indicator_common_id = ${newId}
  `;
  if (taken.length > 0) {
    return `Indicator ID ${JSON.stringify(newId)} is already taken.`;
  }
  return undefined;
}

// Updates an indicator, renaming it when the id differs. A rename rewrites
// every derived expression that names the old id and every schedule's
// selection in the same transaction (the junction follows by ON UPDATE
// CASCADE); historical run and version rows are history and keep their
// pairs, which are data ids and stay valid. Switching Uploaded and DHIS2
// element either way is allowed with rows and changes none; any switch to
// or from Sum or Derived is refused with rows or while a sum names the
// indicator. The data id is fixed once rows exist under it; without rows it
// may be taken, changed or cleared within the type's rule, and it must not
// belong to another indicator.
export async function updateIndicator(
  mainDb: Sql,
  oldIndicatorId: string,
  update: NewIndicator,
): Promise<APIResponseNoData> {
  return await tryCatchDatabaseAsync(async () => {
    const newId = update.indicator_common_id;
    const rename = oldIndicatorId !== newId
      ? { from: oldIndicatorId, to: newId }
      : undefined;
    if (rename !== undefined) {
      const err = await renameError(mainDb, update);
      if (err) return { success: false, err };
    }

    const typeIssue = getSpecialIndicatorTypeIssue(newId, update.definition.type);
    if (typeIssue) {
      return {
        success: false,
        err: `Indicator ID ${JSON.stringify(newId)} ${
          describeNewIndicatorIdIssue(typeIssue)
        }`,
      };
    }
    const err = countRuleError(update.definition, update.format_as, update.thresholds) ??
      dataIdError(update.definition);
    if (err) {
      return { success: false, err };
    }

    const current = (
      await mainDb<{ definition_type: HmisIndicatorType; data_id: string | null }[]>`
        SELECT definition_type, data_id FROM indicators
        WHERE indicator_common_id = ${oldIndicatorId}
      `
    ).at(0);
    if (!current) {
      return { success: false, err: `Indicator ${oldIndicatorId} not found` };
    }

    const types = await loadTypes(mainDb);
    types.delete(oldIndicatorId);
    types.set(newId, update.definition.type);
    const membersErr = membersRuleError(newId, update.definition, types);
    if (membersErr) {
      return { success: false, err: membersErr };
    }

    const definitionErr = await checkDefinitionsResolve(
      mainDb,
      new Map([[newId, update.definition]]),
      rename,
    );
    if (definitionErr) {
      return { success: false, err: definitionErr };
    }

    if (hasRows(current.definition_type) && !hasRows(update.definition.type)) {
      const withData = await indicatorsWithData(mainDb, [oldIndicatorId]);
      if (withData.length > 0) {
        return {
          success: false,
          err: `Cannot change the type of an indicator that has data: ${
            describeWithData(withData)
          }. Delete its data first.`,
        };
      }
      const naming = await sumsNaming(mainDb, [oldIndicatorId]);
      if (naming.length > 0) {
        return {
          success: false,
          err: `Cannot change the type of an indicator that a sum names: ${
            describeSumsNaming(naming)
          }. Remove it from those sums first.`,
        };
      }
    }

    const nextDataId = definitionDataId(update.definition);
    if (current.data_id !== null && nextDataId !== current.data_id) {
      const withData = await indicatorsWithData(mainDb, [oldIndicatorId]);
      if (withData.length > 0) {
        return {
          success: false,
          err: `Cannot change the ${
            current.definition_type === "dhis2_element" ? "DHIS2 id" : "file id"
          } of an indicator that has data: ${
            describeWithData(withData)
          }. Its data is keyed by it; rename the indicator instead.`,
        };
      }
    }
    if (nextDataId !== null && nextDataId !== current.data_id) {
      const owned = await dataIdsOwnedElsewhere(
        mainDb,
        [nextDataId],
        new Set([oldIndicatorId]),
      );
      if (owned.length > 0) {
        return { success: false, err: describeOwnedElsewhere(owned) };
      }
    }

    const d = definitionFields(update.definition);
    await mainDb.begin(async (sql) => {
      await sql`
        UPDATE indicators
        SET
          indicator_common_id = ${newId},
          indicator_common_label = ${update.indicator_common_label},
          definition_type = ${d.definition_type},
          expression = ${d.expression},
          data_id = ${d.data_id},
          include_in_analysis = ${update.include_in_analysis},
          format_as = ${update.format_as},
          thresholds = ${thresholdsToDb(update.thresholds)},
          updated_at = CURRENT_TIMESTAMP
        WHERE indicator_common_id = ${oldIndicatorId}
      `;
      await writeMembers(sql, newId, d.members);
      if (rename !== undefined) {
        await renameReferences(sql, rename.from, rename.to);
      }
    });

    return { success: true };
  });
}

// Every derived expression naming the old id, and every schedule selection
// listing it, rewritten to the new id.
async function renameReferences(
  sql: Sql,
  from: string,
  to: string,
): Promise<void> {
  const derived = await sql<{ indicator_common_id: string; expression: string }[]>`
    SELECT indicator_common_id, expression FROM indicators
    WHERE definition_type = 'derived' AND expression IS NOT NULL
  `;
  for (const row of derived) {
    const rewritten = renameIdentifierInExpression(row.expression, from, to);
    if (rewritten === row.expression) continue;
    await sql`
      UPDATE indicators
      SET expression = ${rewritten}, updated_at = CURRENT_TIMESTAMP
      WHERE indicator_common_id = ${row.indicator_common_id}
    `;
  }
  await sql`
    UPDATE dataset_hmis_scheduled_imports
    SET selection = jsonb_set(
      selection::jsonb, '{indicatorIds}',
      (SELECT COALESCE(jsonb_agg(CASE WHEN id = ${from} THEN ${to} ELSE id END ORDER BY ord), '[]'::jsonb)
       FROM jsonb_array_elements_text(selection::jsonb -> 'indicatorIds') WITH ORDINALITY AS t(id, ord))
    )::text
    WHERE selection::jsonb -> 'indicatorIds' ? ${from}
  `;
}

export async function reorderHmisIndicators(
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

// Deletes indicators. Refused with a listing when one still has data, a
// surviving sum names it, or another indicator's expression still needs the
// id. A special indicator is deleted like any other (ruling 14: the data
// FKs stay, so data never outlives the indicator that holds its key).
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

    const withData = await indicatorsWithData(mainDb, indicatorIds);
    if (withData.length > 0) {
      return {
        success: false,
        err: `Cannot delete indicators that have data: ${
          describeWithData(withData)
        }. Delete their data first.`,
      };
    }

    const naming = await sumsNaming(mainDb, indicatorIds, new Set(indicatorIds));
    if (naming.length > 0) {
      return {
        success: false,
        err: `Cannot delete indicators that a sum names: ${
          describeSumsNaming(naming)
        }. Remove them from those sums first.`,
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

    // The member FK is NO ACTION, checked per row at the end of the
    // statement in row order, so a sum deleted after one of its members in
    // the same statement would refuse the member: the junction rows of the
    // sums being deleted go first.
    await mainDb.begin(async (sql) => {
      await sql`DELETE FROM indicator_sum_members WHERE sum_id = ANY(${indicatorIds})`;
      await sql`DELETE FROM indicators WHERE indicator_common_id = ANY(${indicatorIds})`;
    });

    return { success: true };
  });
}

// =============================================================================
// BATCH FILE (PLAN_A5 ruling 11)
// =============================================================================

type BatchRow = {
  row: number;
  id: string;
  label: string;
  definition: HmisIndicatorDefinition;
  include_in_analysis: boolean;
  format_as: IndicatorFormat;
  thresholds: ThresholdsRule | null;
};

const BATCH_FORMATS: readonly IndicatorFormat[] = [
  "number",
  "percent",
  "rate_per_10k",
];

// One file, one row per indicator. Upsert keeps an existing row's
// sort_order; replace deletes every indicator the file does not name.
// Refused with a listing when the write would remove an indicator with data
// or one a sum names, retype an indicator with data out of the types that
// have rows, retype one a sum names, or move a data id whose owner has
// data. Every id goes through the validator; a DHIS2 element's data id
// must be DHIS2-shaped.
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

    const existing = await getHmisIndicators(mainDb);
    const existingById = new Map(existing.map((i) => [i.indicator_common_id, i]));
    const fileIds = new Set(rows.map((r) => r.id));

    // Row numbers are 1-based and count the CSV header row.
    const problems: string[] = [];
    for (const r of rows) {
      const current = existingById.get(r.id);
      const idIssue = current === undefined
        ? getNewIndicatorIdIssue(r.id, r.definition.type)
        : getSpecialIndicatorTypeIssue(r.id, r.definition.type);
      if (idIssue) {
        problems.push(
          `row ${r.row} (${r.id}): ${describeNewIndicatorIdIssue(idIssue)}`,
        );
      }
      const err = dataIdError(r.definition);
      if (err) problems.push(`row ${r.row} (${r.id}): ${err}`);
    }
    if (problems.length > 0) {
      return { success: false, err: `Invalid ids in CSV: ${problems.join("; ")}` };
    }

    // The dictionary the file leaves behind: the file's rows plus, on an
    // upsert, every existing row the file does not name.
    const survivors = new Map<string, HmisIndicatorDefinition>();
    if (!replaceAllExisting) {
      for (const i of existing) survivors.set(i.indicator_common_id, i.definition);
    }
    for (const r of rows) survivors.set(r.id, r.definition);
    const types = new Map(
      [...survivors].map(([id, d]) => [id, d.type] as const),
    );
    for (const r of rows) {
      const err = membersRuleError(r.id, r.definition, types);
      if (err) return { success: false, err: `row ${r.row} (${r.id}): ${err}` };
    }

    const fileOwner = new Map<string, string>();
    for (const r of rows) {
      const dataId = definitionDataId(r.definition);
      if (dataId === null) continue;
      const other = fileOwner.get(dataId);
      if (other !== undefined) {
        return {
          success: false,
          err: `A data id belongs to exactly one indicator; ${dataId} is listed under ${other} and ${r.id}`,
        };
      }
      fileOwner.set(dataId, r.id);
    }
    const currentOwner = new Map<string, string>();
    for (const i of existing) {
      const dataId = definitionDataId(i.definition);
      if (dataId !== null) currentOwner.set(dataId, i.indicator_common_id);
    }
    if (!replaceAllExisting) {
      for (const [dataId, owner] of fileOwner) {
        const current = currentOwner.get(dataId);
        if (current !== undefined && current !== owner && !fileIds.has(current)) {
          return {
            success: false,
            err: `A data id belongs to exactly one indicator; ${dataId} already belongs to ${current} and the file lists it under ${owner}`,
          };
        }
      }
    }
    // A data id that leaves its current owner (moved to another row, or
    // dropped by the row that rewrites the owner) leaves that owner's data
    // behind, so it is refused while the owner has data (ruling 4).
    const moved = [...fileOwner].filter(([dataId, owner]) => {
      const current = currentOwner.get(dataId);
      return current !== undefined && current !== owner;
    });
    const losingOwners = new Set(
      moved.map(([dataId]) => currentOwner.get(dataId)!),
    );
    const removedIndicatorIds = replaceAllExisting
      ? existing
        .map((i) => i.indicator_common_id)
        .filter((id) => !fileIds.has(id))
      : [];
    const retyped: string[] = [];
    for (const r of rows) {
      const current = existingById.get(r.id);
      if (current === undefined) continue;
      if (hasRows(current.definition.type) && !hasRows(r.definition.type)) {
        retyped.push(r.id);
      }
      const currentDataId = definitionDataId(current.definition);
      if (currentDataId !== null && definitionDataId(r.definition) !== currentDataId) {
        losingOwners.add(r.id);
      }
    }
    const removedWithData = await indicatorsWithData(mainDb, removedIndicatorIds);
    if (removedWithData.length > 0) {
      return {
        success: false,
        err: `The file would remove indicators that have data: ${
          describeWithData(removedWithData)
        }. Keep them in the file or delete their data first.`,
      };
    }
    const retypedWithData = await indicatorsWithData(mainDb, retyped);
    if (retypedWithData.length > 0) {
      return {
        success: false,
        err: `The file would change the type of indicators that have data: ${
          describeWithData(retypedWithData)
        }. Keep them Uploaded or DHIS2 elements, or delete their data first.`,
      };
    }
    const losingWithData = await indicatorsWithData(mainDb, [...losingOwners]);
    if (losingWithData.length > 0) {
      return {
        success: false,
        err: `The file would take the data id away from indicators that have data: ${
          describeWithData(losingWithData)
        }. A data id is fixed once rows exist under it; keep it under its current indicator or delete their data first.`,
      };
    }
    const gone = new Set([...removedIndicatorIds, ...retyped]);
    const goneNamedBySums = [...survivors].flatMap(([id, d]) =>
      d.type === "sum"
        ? d.members.filter((m) => gone.has(m)).map((m) => `${m} (in ${id})`)
        : []
    );
    if (goneNamedBySums.length > 0) {
      return {
        success: false,
        err: `The file would remove or retype indicators that a sum names: ${
          goneNamedBySums.join(", ")
        }.`,
      };
    }

    await mainDb.begin(async (sql) => {
      let sortOrder = (
        await sql<{ next: number }[]>`
          SELECT COALESCE(MAX(sort_order), 0) + 1 AS next FROM indicators
        `
      )[0].next;
      // A moved data id leaves its current owner before any row is written
      // (the UNIQUE constraint is not deferrable), and removed rows go first
      // so a replace never trips on them. New rows sort after everything
      // that exists (CSV order preserved); an update keeps the row's place.
      if (removedIndicatorIds.length > 0) {
        await sql`
          DELETE FROM indicators WHERE indicator_common_id = ANY(${removedIndicatorIds})
        `;
      }
      for (const [dataId] of moved) {
        await sql`
          UPDATE indicators SET definition_type = 'uploaded', data_id = NULL, updated_at = CURRENT_TIMESTAMP
          WHERE data_id = ${dataId}
        `;
      }
      // Members and expressions may name rows later in the file, so every
      // row lands as Uploaded first and takes its definition in a second
      // pass. The first pass keeps a row's unchanged data id: the data FK
      // refuses clearing one that has rows, and every move that is not
      // allowed was refused above. Every row is written as an Uploaded count
      // here, so the format and the rule take their values in the second pass.
      for (const r of rows) {
        const dataId = definitionDataId(r.definition);
        await sql`
          INSERT INTO indicators (
            indicator_common_id, indicator_common_label, definition_type, expression,
            data_id, include_in_analysis,
            format_as, thresholds, sort_order, updated_at
          )
          VALUES (
            ${r.id}, ${r.label}, 'uploaded', NULL, NULL, ${r.include_in_analysis},
            'number', NULL, ${sortOrder++}, CURRENT_TIMESTAMP
          )
          ON CONFLICT (indicator_common_id) DO UPDATE SET
            indicator_common_label = EXCLUDED.indicator_common_label,
            definition_type = 'uploaded',
            expression = NULL,
            data_id = CASE WHEN indicators.data_id = ${dataId} THEN indicators.data_id END,
            include_in_analysis = EXCLUDED.include_in_analysis,
            format_as = 'number',
            thresholds = NULL,
            updated_at = CURRENT_TIMESTAMP
        `;
        await sql`DELETE FROM indicator_sum_members WHERE sum_id = ${r.id}`;
      }
      for (const r of rows) {
        const d = definitionFields(r.definition);
        await sql`
          UPDATE indicators
          SET definition_type = ${d.definition_type}, expression = ${d.expression},
            data_id = ${d.data_id}, format_as = ${r.format_as},
            thresholds = ${thresholdsToDb(r.thresholds)}
          WHERE indicator_common_id = ${r.id}
        `;
        await writeMembers(sql, r.id, d.members);
      }

      // The file's expressions are checked against the dictionary the file
      // leaves behind: an unresolvable one aborts the whole write.
      const entries = await loadExpressionDictionaryEntries(sql);
      const dictionary = buildExpressionDictionary(entries);
      for (const entry of entries) {
        if (entry.type !== "derived") continue;
        resolveIndicatorExpression({
          ownId: entry.id,
          source: entry.expression ?? "",
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
    const type = cell("type") || "uploaded";
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
    if (!isHmisIndicatorType(type)) {
      return {
        ok: false,
        err: `row ${row} (${id}): type must be uploaded, dhis2_element, sum or derived`,
      };
    }
    const dataId = cell("data_id");
    const members = cell("members")
      .split(INDICATOR_BATCH_MEMBERS_SEPARATOR)
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
    const expression = cell("expression");
    if (type !== "derived" && expression !== "") {
      return { ok: false, err: `row ${row} (${id}): only a derived indicator has an expression` };
    }
    if (type === "derived" && expression === "") {
      return { ok: false, err: `row ${row} (${id}): a derived indicator needs an expression` };
    }
    if (type !== "sum" && members.length > 0) {
      return { ok: false, err: `row ${row} (${id}): only a sum has members` };
    }
    if (!hasRows(type) && dataId !== "") {
      return { ok: false, err: `row ${row} (${id}): only an Uploaded or DHIS2 element indicator has a data id` };
    }
    if (type === "dhis2_element" && dataId === "") {
      return { ok: false, err: `row ${row} (${id}): a DHIS2 element needs a data id` };
    }
    const definition: HmisIndicatorDefinition = type === "uploaded"
      ? { type: "uploaded", data_id: dataId === "" ? null : dataId }
      : type === "dhis2_element"
      ? { type: "dhis2_element", data_id: dataId }
      : type === "sum"
      ? { type: "sum", members }
      : { type: "derived", expression };
    const includeCell = cell("include_in_analysis").toLowerCase() || "true";
    if (includeCell !== "true" && includeCell !== "false") {
      return { ok: false, err: `row ${row} (${id}): include_in_analysis must be true or false` };
    }
    const formatCell = cell("format_as") || "number";
    if (!(BATCH_FORMATS as readonly string[]).includes(formatCell)) {
      return { ok: false, err: `row ${row} (${id}): format_as must be one of ${BATCH_FORMATS.join(", ")}` };
    }
    const format_as = formatCell as IndicatorFormat;
    if (isCount(type) && format_as !== "number") {
      return {
        ok: false,
        err: `row ${row} (${id}): an Uploaded, DHIS2 element or Sum indicator is a count and is always formatted as a number`,
      };
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
    if (isCount(type) && thresholds !== null) {
      return {
        ok: false,
        err: `row ${row} (${id}): an Uploaded, DHIS2 element or Sum indicator is a count and has no conditional-formatting rule`,
      };
    }
    rows.push({
      row,
      id,
      label,
      definition,
      include_in_analysis: includeCell === "true",
      format_as,
      thresholds,
    });
  }
  return { ok: true, rows };
}
