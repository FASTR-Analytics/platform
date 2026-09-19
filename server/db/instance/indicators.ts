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
  generateDataKey,
  getNewIndicatorIdIssue,
  getSpecialIndicatorTypeIssue,
  hasRows,
  type HmisIndicator,
  type HmisIndicatorDefinition,
  type HmisIndicatorDefinitionInput,
  type HmisIndicatorType,
  IndicatorExpressionError,
  type IndicatorFormat,
  type IndicatorNamingElement,
  type IndicatorNamingInput,
  type InstanceIndicatorDetails,
  isCount,
  isDhis2ShapedId,
  isSpecialIndicatorId,
  MAX_INDICATOR_EXPRESSION_INGREDIENTS,
  parseIndicatorExpression,
  POPULATION_TYPE_IDS,
  renameIdentifierInExpression,
  renameIdentifiers,
  resolveIndicatorExpression,
  t3,
  type ThresholdDirection,
  type ThresholdsRule,
  thresholdsRuleSchema,
  writeIndicatorExpression,
} from "lib";
import { tryCatchDatabaseAsync } from "./../utils.ts";

// The stored shape of one indicator (PLAN_A5 ruling 1, PLAN_A6 ruling 1).
// `expression` is a calculated indicator's formula, `data_id` the key an
// Uploaded or DHIS2 element indicator's rows carry (a generated opaque key
// or the UID); each NULL for the other types (the table's CHECK).
// `dhis2_label` is what DHIS2 calls a DHIS2 element's element or operand,
// NULL on every other type and on an element it was never read for. `members` is aggregated from indicator_sum_members,
// ordered by member id, empty for every other type. `thresholds` is the CF
// rule as JSON text (every JSON column is text: JSON.parse on read,
// JSON.stringify on write: SYSTEM_02), validated by the lib schema here.
export type DBIndicatorCommon = {
  indicator_common_id: string;
  indicator_common_label: string;
  definition_type: HmisIndicatorType;
  expression: string | null;
  data_id: string | null;
  dhis2_label: string | null;
  members: string[];
  include_in_analysis: boolean;
  format_as: IndicatorFormat;
  thresholds: string | null;
  direction: ThresholdDirection;
  target: number | null;
  expected_low_counts: boolean;
  sort_order: number;
};

const INDICATOR_COLUMNS = `
  i.indicator_common_id, i.indicator_common_label, i.definition_type, i.expression, i.data_id,
  i.dhis2_label,
  (SELECT COALESCE(array_agg(m.member_id ORDER BY m.member_id), ARRAY[]::text[])
     FROM indicator_sum_members m WHERE m.sum_id = i.indicator_common_id) AS members,
  i.include_in_analysis, i.format_as, i.thresholds, i.direction, i.target,
  i.expected_low_counts, i.sort_order`;

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
    direction: row.direction,
    target: row.target,
    expected_low_counts: row.expected_low_counts,
    sort_order: row.sort_order,
  };
}

// The rule's `direction` key is the indicator's direction (HmisIndicator,
// lib/types/indicators.ts): written from the column, whatever the client
// posted.
function thresholdsToDb(
  thresholds: ThresholdsRule | null,
  direction: ThresholdDirection,
): string | null {
  return thresholds === null
    ? null
    : JSON.stringify({ ...thresholds, direction });
}

function dbRowToDefinition(row: DBIndicatorCommon): HmisIndicatorDefinition {
  switch (row.definition_type) {
    case "uploaded":
      return { type: "uploaded", data_id: row.data_id! };
    case "dhis2_element":
      return { type: "dhis2_element", data_id: row.data_id!, dhis2_label: row.dhis2_label };
    case "sum":
      return { type: "sum", members: row.members };
    case "calculated":
      return { type: "calculated", expression: row.expression! };
  }
}

type DefinitionFields = {
  definition_type: HmisIndicatorType;
  expression: string | null;
  data_id: string | null;
  members: string[];
};

// The columns a posted definition writes. An Uploaded indicator's key is
// the one the row already holds, whatever type it held it under, or a
// generated one when it holds none (a create, or a retype from Sum or
// Calculated); a DHIS2 element's is the typed UID (PLAN_A6 ruling 1).
function definitionFields(
  definition: HmisIndicatorDefinitionInput,
  currentDataId: string | null,
): DefinitionFields {
  return {
    definition_type: definition.type,
    expression: definition.type === "calculated" ? definition.expression : null,
    data_id: definition.type === "uploaded"
      ? currentDataId ?? generateDataKey()
      : inputDataId(definition),
    members: definition.type === "sum" ? definition.members : [],
  };
}

// The data id a client may post: a DHIS2 element's UID and nothing else.
function inputDataId(definition: HmisIndicatorDefinitionInput): string | null {
  return definition.type === "dhis2_element" ? definition.data_id : null;
}

// `format_as` is display-only and the sole scale (PLAN_1c ruling 3), and so
// are `thresholds` and `target`. A count is always a number with no
// conditional-formatting rule and no target (the table's three count
// CHECKs); a calculated one chooses all three. `expected_low_counts` is a
// count's fact only: a calculated indicator is never adjusted (the calculated
// CHECK).
function typeRuleError(
  indicator: Pick<
    NewIndicator,
    "definition" | "format_as" | "thresholds" | "target" | "expected_low_counts"
  >,
): string | undefined {
  if (!isCount(indicator.definition.type)) {
    return indicator.expected_low_counts
      ? "A Calculated indicator is never adjusted, so it cannot expect low counts"
      : undefined;
  }
  if (indicator.format_as !== "number") {
    return "An Uploaded, DHIS2 element or Sum indicator is a count and is always formatted as a number";
  }
  if (indicator.thresholds !== null) {
    return "An Uploaded, DHIS2 element or Sum indicator is a count and has no conditional-formatting rule";
  }
  if (indicator.target !== null) {
    return "An Uploaded, DHIS2 element or Sum indicator is a count and has no target";
  }
  return undefined;
}

// A DHIS2 element's data id is DHIS2-shaped (the table's CHECK). An
// Uploaded indicator's is not user input.
function dataIdError(definition: HmisIndicatorDefinitionInput): string | undefined {
  if (definition.type === "dhis2_element" && !isDhis2ShapedId(definition.data_id)) {
    return `DHIS2 id ${
      JSON.stringify(definition.data_id)
    } must be a data element UID or a UID.COC operand`;
  }
  return undefined;
}

// Sum members are indicators that have rows (PLAN_A5 ruling 2): each member
// must exist, as Uploaded or a DHIS2 element, in the dictionary the write
// leaves behind. `types` is that dictionary's id → type.
function membersRuleError(
  ownId: string,
  definition: HmisIndicatorDefinitionInput,
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
      type: r.definition_type === "calculated" ? "calculated" as const : "leaf" as const,
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
  pendingDefinitions: Map<string, HmisIndicatorDefinitionInput>,
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
      type: definition.type === "calculated" ? "calculated" : "leaf",
      expression: definition.type === "calculated" ? definition.expression : null,
    });
  }
  const dictionary = buildExpressionDictionary([...entries.values()]);
  for (const [id, definition] of pendingDefinitions) {
    if (definition.type !== "calculated") continue;
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
    if (entry.type !== "calculated" || pendingDefinitions.has(entry.id)) continue;
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
    if (survivor.type !== "calculated") continue;
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
  definition: HmisIndicatorDefinitionInput;
  include_in_analysis: boolean;
  format_as: IndicatorFormat;
  thresholds: ThresholdsRule | null;
  direction: ThresholdDirection;
  target: number | null;
  expected_low_counts: boolean;
};

// What an insert writes: a posted indicator plus the DHIS2 label, which no
// client posts. The naming step supplies the server's reading of DHIS2's
// name for each element it creates; every other create writes NULL.
type IndicatorInsert = NewIndicator & { dhis2_label: string | null };

// The pre-checks every create shares: each id through the validator (a
// reserved word refused, a special id accepted for a count and refused for
// a calculated), a DHIS2 element's data id DHIS2-shaped and held by no other
// indicator, the format rule, no id or DHIS2 id twice or already taken,
// every member an existing indicator with rows, and every expression
// resolving against the dictionary the write would leave. An Uploaded
// indicator's key is generated at insert and needs no check.
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
    const err = typeRuleError(indicator) ?? dataIdError(indicator.definition);
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
    const dataId = inputDataId(i.definition);
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
  indicators: IndicatorInsert[],
): Promise<void> {
  let sortOrder = (
    await sql<{ next: number }[]>`
      SELECT COALESCE(MAX(sort_order), 0) + 1 AS next FROM indicators
    `
  )[0].next;
  for (const indicator of indicators) {
    try {
      const d = definitionFields(indicator.definition, null);
      await sql`
        INSERT INTO indicators (
          indicator_common_id, indicator_common_label,
          definition_type, expression, data_id, dhis2_label, include_in_analysis,
          format_as, thresholds, direction, target, expected_low_counts,
          sort_order, updated_at
        )
        VALUES (
          ${indicator.indicator_common_id}, ${indicator.indicator_common_label},
          ${d.definition_type}, ${d.expression}, ${d.data_id},
          ${d.definition_type === "dhis2_element" ? indicator.dhis2_label : null},
          ${indicator.include_in_analysis},
          ${indicator.format_as},
          ${thresholdsToDb(indicator.thresholds, indicator.direction)},
          ${indicator.direction}, ${indicator.target},
          ${indicator.expected_low_counts},
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
    await mainDb.begin((sql) =>
      insertIndicators(sql, indicators.map((i) => ({ ...i, dhis2_label: null })))
    );
    return { success: true, data: { created: indicators.length } };
  });
}

// =============================================================================
// THE NAMING STEP (PLAN_A6 ruling 7)
// =============================================================================

type NamingPlan =
  | { ok: true; indicators: IndicatorInsert[] }
  | { ok: false; err: string };

// The naming step as the server applies it: each element with the DHIS2
// label the route read from live metadata (NULL when the element could not
// be read, in which case its verdict refuses the save anyway).
export type NamingElementInput = IndicatorNamingElement & { dhis2_label: string | null };

export type NamingInput = {
  elements: NamingElementInput[];
  calculated: IndicatorNamingInput["calculated"];
};

// What the naming step's choices amount to. A DHIS2 element or operand
// becomes a new DHIS2 element under the chosen id; an existing id is
// refused. A UID some indicator already holds creates nothing, and a
// calculated's expression is rewritten from UIDs to the indicators those
// elements land in. Everything created is in the analysis.
async function planIndicatorNaming(
  mainDb: Sql,
  input: NamingInput,
): Promise<NamingPlan> {
  const existing = await getHmisIndicators(mainDb);
  const existingIds = new Set(existing.map((i) => i.indicator_common_id));
  const ownerOfDataId = new Map<string, string>();
  for (const i of existing) {
    const dataId = definitionDataId(i.definition);
    if (dataId !== null) ownerOfDataId.set(dataId, i.indicator_common_id);
  }
  const landing = new Map<string, string>();
  const indicators: IndicatorInsert[] = [];
  const newIds = new Set<string>();

  for (const element of input.elements) {
    if (landing.has(element.data_id)) {
      return { ok: false, err: `DHIS2 id ${element.data_id} is listed more than once.` };
    }
    const owner = ownerOfDataId.get(element.data_id);
    if (owner !== undefined) {
      landing.set(element.data_id, owner);
      continue;
    }
    if (existingIds.has(element.indicator_id)) {
      return {
        ok: false,
        err: `Indicator ${
          JSON.stringify(element.indicator_id)
        } already exists; choose another id for ${element.data_id}.`,
      };
    }
    if (newIds.has(element.indicator_id)) {
      return {
        ok: false,
        err: `Indicator ${
          JSON.stringify(element.indicator_id)
        } is chosen for more than one DHIS2 id; one indicator carries one. Create one indicator per element and a sum over them.`,
      };
    }
    newIds.add(element.indicator_id);
    landing.set(element.data_id, element.indicator_id);
    indicators.push({
      indicator_common_id: element.indicator_id,
      indicator_common_label: element.label,
      definition: { type: "dhis2_element", data_id: element.data_id },
      dhis2_label: element.dhis2_label,
      include_in_analysis: true,
      format_as: "number",
      thresholds: null,
      direction: "higher-is-better",
      target: null,
      expected_low_counts: false,
    });
  }
  for (const calculated of input.calculated) {
    let expression: string;
    try {
      const node = parseIndicatorExpression(calculated.expression);
      const unnamed = collectIdentifiers(node).filter((id) => !landing.has(id));
      if (unnamed.length > 0) {
        return {
          ok: false,
          err: `${calculated.indicator_id}: its formula names DHIS2 ids that were not named: ${
            unnamed.join(", ")
          }`,
        };
      }
      expression = writeIndicatorExpression(
        renameIdentifiers(node, Object.fromEntries(landing)),
      );
    } catch (e) {
      if (!(e instanceof IndicatorExpressionError)) throw e;
      return { ok: false, err: `${calculated.indicator_id}: ${e.message}` };
    }
    indicators.push({
      indicator_common_id: calculated.indicator_id,
      indicator_common_label: calculated.label,
      definition: { type: "calculated", expression },
      dhis2_label: null,
      include_in_analysis: true,
      format_as: calculated.format_as,
      thresholds: null,
      direction: "higher-is-better",
      target: null,
      expected_low_counts: false,
    });
  }
  return { ok: true, indicators };
}

// Saves a naming step in one transaction: the new DHIS2 elements and the
// calculated indicators over them. Every pre-check of createIndicators
// applies, so either everything lands or nothing does.
export async function applyIndicatorNaming(
  mainDb: Sql,
  input: NamingInput,
): Promise<APIResponseWithData<{ created: number }>> {
  return await tryCatchDatabaseAsync(async () => {
    const plan = await planIndicatorNaming(mainDb, input);
    if (!plan.ok) {
      return { success: false, err: plan.err };
    }
    const err = await checkIndicatorWrites(mainDb, plan.indicators);
    if (err) {
      return { success: false, err };
    }
    await mainDb.begin((sql) => insertIndicators(sql, plan.indicators));
    return { success: true, data: { created: plan.indicators.length } };
  });
}

export type Dhis2NamingElement = NamingElementInput & {
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
// refuses the whole save; an accepted indicator becomes a calculated over the
// DHIS2 elements its operands land in.
// Every DHIS2 element's id and data id, for the label refresh.
export async function getDhis2ElementDataIds(
  mainDb: Sql,
): Promise<{ indicator_common_id: string; data_id: string }[]> {
  const rows = await mainDb<{ indicator_common_id: string; data_id: string }[]>`
    SELECT indicator_common_id, data_id FROM indicators
    WHERE definition_type = 'dhis2_element'
    ORDER BY indicator_common_id
  `;
  return rows.map((r) => ({ indicator_common_id: r.indicator_common_id, data_id: r.data_id }));
}

// Writes the DHIS2 label the route read for each element, by indicator id,
// where it differs from the stored one; updated_at moves on those rows so
// the dictionary stamp changes. Only a DHIS2 element is written (the CHECK
// would refuse anything else). Returns how many rows changed.
export async function setDhis2Labels(
  mainDb: Sql,
  labels: Map<string, string>,
): Promise<number> {
  if (labels.size === 0) return 0;
  const ids = [...labels.keys()];
  const values = ids.map((id) => labels.get(id)!);
  const rows = await mainDb<{ indicator_common_id: string }[]>`
    UPDATE indicators i
    SET dhis2_label = v.label, updated_at = CURRENT_TIMESTAMP
    FROM UNNEST(${ids}::text[], ${values}::text[]) AS v(id, label)
    WHERE i.indicator_common_id = v.id
      AND i.definition_type = 'dhis2_element'
      AND i.dhis2_label IS DISTINCT FROM v.label
    RETURNING i.indicator_common_id
  `;
  return rows.length;
}

export async function createIndicatorsFromDhis2(
  mainDb: Sql,
  input: { elements: Dhis2NamingElement[]; indicators: Dhis2NamingIndicator[] },
): Promise<APIResponseWithData<{ created: number }>> {
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
  const calculated: IndicatorNamingInput["calculated"] = [];
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
    calculated.push({
      indicator_id: indicator.indicator_id,
      label: indicator.label,
      expression: parse.expression,
      format_as: parse.format_as,
    });
  }
  return await applyIndicatorNaming(mainDb, {
    elements: input.elements.map(({ verdict: _verdict, ...element }) => element),
    calculated,
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
// every calculated expression that names the old id and every schedule's
// selection in the same transaction (the junction follows by ON UPDATE
// CASCADE); historical run and version rows are history and keep their
// pairs, which are data ids and stay valid. Retyping never changes the key,
// except Uploaded to DHIS2 element, which takes the typed UID and so needs
// no rows under the old key; a DHIS2 element retyped to Uploaded keeps its
// UID as its key. Any switch to Sum or Calculated is refused with rows or
// while a sum names the indicator. A DHIS2 id is fixed once rows exist
// under it; without rows it may change within the type's rule, and it must
// not belong to another indicator (PLAN_A6 ruling 1).
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
    const err = typeRuleError(update) ?? dataIdError(update.definition);
    if (err) {
      return { success: false, err };
    }

    const current = (
      await mainDb<
        { definition_type: HmisIndicatorType; data_id: string | null; dhis2_label: string | null }[]
      >`
        SELECT definition_type, data_id, dhis2_label FROM indicators
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

    const d = definitionFields(update.definition, current.data_id);
    const nextDataId = d.data_id;
    if (current.data_id !== null && nextDataId !== current.data_id) {
      const withData = await indicatorsWithData(mainDb, [oldIndicatorId]);
      if (withData.length > 0) {
        return {
          success: false,
          err: current.definition_type === "dhis2_element"
            ? `Cannot change the DHIS2 id of an indicator that has data: ${
              describeWithData(withData)
            }. Its data is keyed by it; rename the indicator instead.`
            : `Cannot make an indicator that has data a DHIS2 element: ${
              describeWithData(withData)
            }. Its data is keyed by its own key; delete its data first.`,
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

    // The DHIS2 label describes the data id it was read for: it stays while
    // the indicator remains a DHIS2 element under the same id and goes
    // otherwise, since no path re-reads it.
    const dhis2Label = d.definition_type === "dhis2_element" && d.data_id === current.data_id
      ? current.dhis2_label
      : null;
    await mainDb.begin(async (sql) => {
      await sql`
        UPDATE indicators
        SET
          indicator_common_id = ${newId},
          indicator_common_label = ${update.indicator_common_label},
          definition_type = ${d.definition_type},
          expression = ${d.expression},
          data_id = ${d.data_id},
          dhis2_label = ${dhis2Label},
          include_in_analysis = ${update.include_in_analysis},
          format_as = ${update.format_as},
          thresholds = ${thresholdsToDb(update.thresholds, update.direction)},
          direction = ${update.direction},
          target = ${update.target},
          expected_low_counts = ${update.expected_low_counts},
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

// Every calculated expression naming the old id, and every schedule selection
// listing it, rewritten to the new id.
async function renameReferences(
  sql: Sql,
  from: string,
  to: string,
): Promise<void> {
  const calculated = await sql<{ indicator_common_id: string; expression: string }[]>`
    SELECT indicator_common_id, expression FROM indicators
    WHERE definition_type = 'calculated' AND expression IS NOT NULL
  `;
  for (const row of calculated) {
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
// The include-in-analysis flag over many rows at once, the list's bulk
// action. A special is analysed whatever its flag says
// (`analysedIndicatorIds`) and the editor keeps it on, so excluding one is
// refused here rather than stored as a flag nothing reads.
export async function setIndicatorsIncludeInAnalysis(
  mainDb: Sql,
  indicatorIds: string[],
  includeInAnalysis: boolean,
): Promise<APIResponseNoData> {
  return await tryCatchDatabaseAsync(async () => {
    if (indicatorIds.length === 0) {
      return { success: true };
    }
    if (!includeInAnalysis) {
      const specials = indicatorIds.filter(isSpecialIndicatorId);
      if (specials.length > 0) {
        return {
          success: false,
          err: `Special indicators are always analysed and cannot be excluded: ${
            specials.join(", ")
          }`,
        };
      }
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
    await mainDb`
      UPDATE indicators
      SET include_in_analysis = ${includeInAnalysis}, updated_at = CURRENT_TIMESTAMP
      WHERE indicator_common_id = ANY(${indicatorIds})
        AND include_in_analysis <> ${includeInAnalysis}
    `;
    return { success: true };
  });
}

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
