import { Sql } from "postgres";
import {
  APIResponseNoData,
  APIResponseWithData,
  buildExpressionDictionary,
  collectIdentifiers,
  type CommonIndicator,
  type CommonIndicatorDefinition,
  describeDhis2ParseRefusal,
  describeDhis2ElementRefusal,
  describeNewIndicatorIdIssue,
  type Dhis2IndicatorDecomposition,
  type Dhis2ElementVerdict,
  type ExpressionDictionaryEntry,
  getNewIndicatorIdIssue,
  getSpecialIndicatorTypeIssue,
  INDICATOR_BATCH_FILE_COLUMNS,
  INDICATOR_BATCH_MEMBERS_SEPARATOR,
  IndicatorExpressionError,
  type IndicatorFormat,
  type IndicatorNamingElement,
  type IndicatorNamingInput,
  type InstanceIndicatorDetails,
  isCommonIndicatorType,
  isDhis2ShapedId,
  MAX_INDICATOR_EXPRESSION_INGREDIENTS,
  parseIndicatorExpression,
  POPULATION_TYPE_IDS,
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

// The stored shape of one indicator (PLAN_A4 ruling 1). `expression` is a
// derived indicator's formula, `members` a sum's member ids as JSON text,
// `dhis2_id` the element a DHIS2-fetched base carries; each NULL for the
// other types (the table's CHECK). `thresholds` is the CF rule as JSON text
// (every JSON column is text: JSON.parse on read, JSON.stringify on write:
// SYSTEM_02), validated by the lib schema here.
export type DBIndicatorCommon = {
  indicator_common_id: string;
  indicator_common_label: string;
  definition_type: "base" | "sum" | "derived";
  expression: string | null;
  dhis2_id: string | null;
  members: string | null;
  include_in_analysis: boolean;
  format_as: IndicatorFormat;
  thresholds: string | null;
  sort_order: number;
};

const COMMON_INDICATOR_COLUMNS =
  `indicator_common_id, indicator_common_label, definition_type, expression, dhis2_id, members, include_in_analysis, format_as, thresholds, sort_order`;

export function dbRowToCommonIndicator(row: DBIndicatorCommon): CommonIndicator {
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

function dbRowToDefinition(row: DBIndicatorCommon): CommonIndicatorDefinition {
  switch (row.definition_type) {
    case "base":
      return { type: "base", dhis2_id: row.dhis2_id };
    case "sum":
      return { type: "sum", members: JSON.parse(row.members!) as string[] };
    case "derived":
      return { type: "derived", expression: row.expression! };
  }
}

type DefinitionFields = {
  definition_type: CommonIndicatorDefinition["type"];
  expression: string | null;
  dhis2_id: string | null;
  members: string | null;
};

function definitionFields(
  definition: CommonIndicatorDefinition,
): DefinitionFields {
  switch (definition.type) {
    case "base":
      return {
        definition_type: "base",
        expression: null,
        dhis2_id: definition.dhis2_id,
        members: null,
      };
    case "sum":
      return {
        definition_type: "sum",
        expression: null,
        dhis2_id: null,
        members: JSON.stringify(definition.members),
      };
    case "derived":
      return {
        definition_type: "derived",
        expression: definition.expression,
        dhis2_id: null,
        members: null,
      };
  }
}

// `format_as` is display-only and the sole scale (PLAN_1c ruling 3). A base
// and a sum are counts, so they are always numbers; a derived one chooses.
function formatRuleError(
  definition: CommonIndicatorDefinition,
  formatAs: IndicatorFormat,
): string | undefined {
  return definition.type !== "derived" && formatAs !== "number"
    ? "A base or sum indicator is a count and is always formatted as a number"
    : undefined;
}

function dhis2IdError(definition: CommonIndicatorDefinition): string | undefined {
  return definition.type === "base" && definition.dhis2_id !== null &&
      !isDhis2ShapedId(definition.dhis2_id)
    ? `DHIS2 id ${
      JSON.stringify(definition.dhis2_id)
    } must be a data element UID or a UID.COC operand`
    : undefined;
}

// Sum members are bases only (PLAN_A4 ruling 2): each member must exist, as
// a base, in the dictionary the write leaves behind. `types` is that
// dictionary's id → type.
function membersRuleError(
  ownId: string,
  definition: CommonIndicatorDefinition,
  types: Map<string, CommonIndicatorDefinition["type"]>,
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
    if (type !== "base") {
      return `Member ${JSON.stringify(member)} is not a base indicator (a sum's members are bases only)`;
    }
  }
  return undefined;
}

// The live expression dictionary: every indicator (a sum as a leaf, like a
// base), plus every population type under its own id.
async function loadExpressionDictionaryEntries(
  sql: Sql,
): Promise<ExpressionDictionaryEntry[]> {
  const stored = await sql<
    {
      indicator_common_id: string;
      definition_type: "base" | "sum" | "derived";
      expression: string | null;
    }[]
  >`SELECT indicator_common_id, definition_type, expression FROM indicators`;
  return [
    ...stored.map((r) => ({
      id: r.indicator_common_id,
      type: r.definition_type === "derived" ? "derived" as const : "base" as const,
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

export async function getInstanceIndicatorDetails(
  mainDb: Sql,
): Promise<APIResponseWithData<InstanceIndicatorDetails>> {
  return await tryCatchDatabaseAsync(async () => {
    return {
      success: true,
      data: { indicators: await getCommonIndicators(mainDb) },
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
// produce.
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
      type: definition.type === "derived" ? "derived" : "base",
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

// Data never exists without its base (dataset_hmis.indicator_id RESTRICTs),
// so removing or retyping a base with data is refused here, with the
// counts, before the FK would.
async function indicatorsWithData(
  sql: Sql,
  indicatorIds: string[],
): Promise<{ indicator_id: string; count: number }[]> {
  if (indicatorIds.length === 0) return [];
  return await sql<{ indicator_id: string; count: number }[]>`
    SELECT indicator_id, COUNT(*)::int AS count
    FROM dataset_hmis
    WHERE indicator_id = ANY(${indicatorIds})
    GROUP BY indicator_id
    ORDER BY indicator_id
  `;
}

function describeWithData(
  rows: { indicator_id: string; count: number }[],
): string {
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
    SELECT i.indicator_common_id AS sum_id, m.member_id
    FROM indicators i
    CROSS JOIN LATERAL jsonb_array_elements_text(i.members::jsonb) AS m(member_id)
    WHERE i.definition_type = 'sum' AND m.member_id = ANY(${memberIds})
    ORDER BY i.indicator_common_id, m.member_id
  `;
  return rows.filter((r) => !ignoreSumIds.has(r.sum_id));
}

function describeSumsNaming(
  rows: { sum_id: string; member_id: string }[],
): string {
  return rows.map((r) => `${r.member_id} (in ${r.sum_id})`).join(", ");
}

// A dhis2_id belongs to exactly one base (the UNIQUE constraint). Reports
// the ids in `dhis2Ids` that an indicator other than `ownerIds` carries.
async function dhis2IdsOwnedElsewhere(
  sql: Sql,
  dhis2Ids: string[],
  ownerIds: Set<string>,
): Promise<{ dhis2_id: string; indicator_id: string }[]> {
  if (dhis2Ids.length === 0) return [];
  const rows = await sql<{ dhis2_id: string; indicator_id: string }[]>`
    SELECT dhis2_id, indicator_common_id AS indicator_id FROM indicators
    WHERE dhis2_id = ANY(${dhis2Ids})
    ORDER BY dhis2_id
  `;
  return rows.filter((r) => !ownerIds.has(r.indicator_id));
}

function describeOwnedElsewhere(
  rows: { dhis2_id: string; indicator_id: string }[],
): string {
  return `A DHIS2 id belongs to exactly one indicator; these already belong to another: ${
    rows.map((r) => `${r.dhis2_id} (${r.indicator_id})`).join(", ")
  }.`;
}

async function loadTypes(
  sql: Sql,
): Promise<Map<string, CommonIndicatorDefinition["type"]>> {
  const rows = await sql<
    { indicator_common_id: string; definition_type: CommonIndicatorDefinition["type"] }[]
  >`SELECT indicator_common_id, definition_type FROM indicators`;
  return new Map(rows.map((r) => [r.indicator_common_id, r.definition_type]));
}

// =============================================================================
// WRITE OPERATIONS
// =============================================================================

export type NewIndicator = {
  indicator_common_id: string;
  indicator_common_label: string;
  definition: CommonIndicatorDefinition;
  include_in_analysis: boolean;
  format_as: IndicatorFormat;
  thresholds: ThresholdsRule | null;
};

// The pre-checks every create shares: each id through the validator (a
// reserved word refused, a special id accepted for a base or sum and refused
// for a derived), a dhis2_id DHIS2-shaped and owned by no other indicator,
// the format rule, no id or dhis2_id twice or already taken, every member an
// existing base, and every expression resolving against the dictionary the
// write would leave.
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
    const err = formatRuleError(indicator.definition, indicator.format_as) ??
      dhis2IdError(indicator.definition);
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

  const dhis2Ids = indicators.flatMap((i) =>
    i.definition.type === "base" && i.definition.dhis2_id !== null
      ? [i.definition.dhis2_id]
      : []
  );
  const duplicateDhis2Ids = dhis2Ids.filter((id, index) =>
    dhis2Ids.indexOf(id) !== index
  );
  if (duplicateDhis2Ids.length > 0) {
    return `A DHIS2 id belongs to exactly one indicator; these appear more than once: ${
      duplicateDhis2Ids.join(", ")
    }`;
  }
  const owned = await dhis2IdsOwnedElsewhere(mainDb, dhis2Ids, new Set());
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
          definition_type, expression, dhis2_id, members, include_in_analysis,
          format_as, thresholds, sort_order, updated_at
        )
        VALUES (
          ${indicator.indicator_common_id}, ${indicator.indicator_common_label},
          ${d.definition_type}, ${d.expression}, ${d.dhis2_id}, ${d.members},
          ${indicator.include_in_analysis},
          ${indicator.format_as},
          ${thresholdsToDb(indicator.thresholds)},
          ${sortOrder++}, CURRENT_TIMESTAMP
        )
      `;
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
// THE NAMING STEP (PLAN_A4 ruling 6)
// =============================================================================

type Assignment = { indicator_id: string; dhis2_id: string };

type NamingPlan =
  | { ok: true; indicators: NewIndicator[]; assignments: Assignment[] }
  | { ok: false; err: string };

// What the naming step's choices amount to: a new base per element under
// the chosen id, or the UID assigned to an existing base that has no
// dhis2_id (this is how a seeded special becomes a DHIS2 element); any
// other existing id refused; an element whose UID already belongs to an
// indicator creates nothing; a new uploaded base per CSV column id; and each
// derived with its expression rewritten from dhis2_ids to the indicators
// those elements land in. Everything created is in the analysis.
async function planIndicatorNaming(
  mainDb: Sql,
  input: IndicatorNamingInput,
): Promise<NamingPlan> {
  const existing = await getCommonIndicators(mainDb);
  const existingById = new Map(existing.map((i) => [i.indicator_common_id, i]));
  const ownerOfDhis2Id = new Map<string, string>();
  for (const i of existing) {
    if (i.definition.type === "base" && i.definition.dhis2_id !== null) {
      ownerOfDhis2Id.set(i.definition.dhis2_id, i.indicator_common_id);
    }
  }
  const landing = new Map<string, string>();
  const indicators: NewIndicator[] = [];
  const assignments: Assignment[] = [];
  const newIds = new Set<string>();
  for (const element of input.elements) {
    if (landing.has(element.dhis2_id)) {
      return {
        ok: false,
        err: `DHIS2 id ${element.dhis2_id} is listed more than once.`,
      };
    }
    const owner = ownerOfDhis2Id.get(element.dhis2_id);
    if (owner !== undefined) {
      landing.set(element.dhis2_id, owner);
      continue;
    }
    const target = existingById.get(element.indicator_id);
    if (target !== undefined) {
      if (target.definition.type !== "base" || target.definition.dhis2_id !== null) {
        return {
          ok: false,
          err: `Indicator ${
            JSON.stringify(element.indicator_id)
          } already exists and cannot take ${element.dhis2_id}: only a base indicator without a DHIS2 id can be assigned one.`,
        };
      }
      landing.set(element.dhis2_id, element.indicator_id);
      assignments.push({
        indicator_id: element.indicator_id,
        dhis2_id: element.dhis2_id,
      });
      continue;
    }
    if (newIds.has(element.indicator_id)) {
      return {
        ok: false,
        err: `Indicator ${
          JSON.stringify(element.indicator_id)
        } is chosen for more than one DHIS2 id; one indicator carries one DHIS2 id. Create one indicator per element and a sum over them.`,
      };
    }
    newIds.add(element.indicator_id);
    landing.set(element.dhis2_id, element.indicator_id);
    indicators.push({
      indicator_common_id: element.indicator_id,
      indicator_common_label: element.label,
      definition: { type: "base", dhis2_id: element.dhis2_id },
      include_in_analysis: true,
      format_as: "number",
      thresholds: null,
    });
  }
  for (const uploaded of input.uploaded) {
    if (existingById.has(uploaded.indicator_id) || newIds.has(uploaded.indicator_id)) {
      return {
        ok: false,
        err: `Indicator ${JSON.stringify(uploaded.indicator_id)} already exists.`,
      };
    }
    newIds.add(uploaded.indicator_id);
    indicators.push({
      indicator_common_id: uploaded.indicator_id,
      indicator_common_label: uploaded.label,
      definition: { type: "base", dhis2_id: null },
      include_in_analysis: true,
      format_as: "number",
      thresholds: null,
    });
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

// Saves a naming step in one transaction: the new bases, the UIDs assigned
// to existing bases, and the derived indicators over them. Every pre-check
// of createIndicators applies, so either everything lands or nothing does.
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
      if (!isDhis2ShapedId(a.dhis2_id)) {
        return {
          success: false,
          err: `DHIS2 id ${
            JSON.stringify(a.dhis2_id)
          } must be a data element UID or a UID.COC operand`,
        };
      }
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
          SET dhis2_id = ${a.dhis2_id}, updated_at = CURRENT_TIMESTAMP
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
  dhis2_id: string;
  indicator_id: string;
  label: string;
  decomposition: Dhis2IndicatorDecomposition;
};

// The DHIS2 select form's save (rulings 6 and 8): the verdicts and
// decompositions are the server's own, computed by the route against live
// DHIS2 metadata, never the client's. A refused element or indicator
// refuses the whole save; an accepted indicator becomes a derived over the
// bases its operands land in.
export async function createIndicatorsFromDhis2(
  mainDb: Sql,
  input: { elements: Dhis2NamingElement[]; indicators: Dhis2NamingIndicator[] },
): Promise<APIResponseWithData<{ created: number; assigned: number }>> {
  const named = new Set(input.elements.map((e) => e.dhis2_id));
  for (const element of input.elements) {
    if (!element.verdict.accepted) {
      return {
        success: false,
        err: `${element.dhis2_id} cannot be imported: ${
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
        err: `DHIS2 indicator ${indicator.dhis2_id} cannot be decomposed: ${
          t3(describeDhis2ParseRefusal(parse.refusal))
        }`,
      };
    }
    for (const operand of operands) {
      if (!operand.verdict.accepted) {
        return {
          success: false,
          err: `DHIS2 indicator ${indicator.dhis2_id}: operand ${operand.dhis2_id} cannot be imported: ${
            t3(describeDhis2ElementRefusal(operand.verdict.refusal))
          }`,
        };
      }
      if (!named.has(operand.dhis2_id)) {
        return {
          success: false,
          err: `DHIS2 indicator ${indicator.dhis2_id}: operand ${operand.dhis2_id} was not named`,
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

// Updates an indicator. Ids are immutable after creation (the id is the
// column key in every results package). A base with data keeps its type and
// its dhis2_id; a base a sum names keeps its type; a dhis2_id must not
// belong to another indicator; a sum's members must be bases.
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
    const err = formatRuleError(update.definition, update.format_as) ??
      dhis2IdError(update.definition);
    if (err) {
      return { success: false, err };
    }

    const current = (
      await mainDb<{ definition_type: string; dhis2_id: string | null }[]>`
        SELECT definition_type, dhis2_id FROM indicators
        WHERE indicator_common_id = ${oldIndicatorId}
      `
    ).at(0);
    if (!current) {
      return { success: false, err: `Indicator ${oldIndicatorId} not found` };
    }

    const types = await loadTypes(mainDb);
    types.set(oldIndicatorId, update.definition.type);
    const membersErr = membersRuleError(oldIndicatorId, update.definition, types);
    if (membersErr) {
      return { success: false, err: membersErr };
    }

    const definitionErr = await checkDefinitionsResolve(
      mainDb,
      new Map([[oldIndicatorId, update.definition]]),
    );
    if (definitionErr) {
      return { success: false, err: definitionErr };
    }

    if (current.definition_type === "base" && update.definition.type !== "base") {
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

    const nextDhis2Id = update.definition.type === "base"
      ? update.definition.dhis2_id
      : null;
    if (current.dhis2_id !== null && nextDhis2Id !== current.dhis2_id) {
      const withData = await indicatorsWithData(mainDb, [oldIndicatorId]);
      if (withData.length > 0) {
        return {
          success: false,
          err: `Cannot change the DHIS2 id of an indicator that has data: ${
            describeWithData(withData)
          }. Delete its data first.`,
        };
      }
    }
    if (nextDhis2Id !== null) {
      const owned = await dhis2IdsOwnedElsewhere(
        mainDb,
        [nextDhis2Id],
        new Set([oldIndicatorId]),
      );
      if (owned.length > 0) {
        return { success: false, err: describeOwnedElsewhere(owned) };
      }
    }

    const d = definitionFields(update.definition);
    await mainDb`
      UPDATE indicators
      SET
        indicator_common_label = ${update.indicator_common_label},
        definition_type = ${d.definition_type},
        expression = ${d.expression},
        dhis2_id = ${d.dhis2_id},
        members = ${d.members},
        include_in_analysis = ${update.include_in_analysis},
        format_as = ${update.format_as},
        thresholds = ${thresholdsToDb(update.thresholds)},
        updated_at = CURRENT_TIMESTAMP
      WHERE indicator_common_id = ${oldIndicatorId}
    `;

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

// Deletes indicators. Refused with a listing when one still has data, a
// surviving sum names it, or another indicator's expression still needs the
// id. A special indicator is deleted like any base.
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

    await mainDb`
      DELETE FROM indicators
      WHERE indicator_common_id = ANY(${indicatorIds})
    `;

    return { success: true };
  });
}

// =============================================================================
// BATCH FILE (PLAN_A4 ruling 7)
// =============================================================================

type BatchRow = {
  row: number;
  id: string;
  label: string;
  definition: CommonIndicatorDefinition;
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
// or one a sum names, retype an indicator with data, or move a dhis2_id
// between indicators when the old one has data. Every id goes through the
// validator.
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

    const existing = await getCommonIndicators(mainDb);
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
      const err = dhis2IdError(r.definition);
      if (err) problems.push(`row ${r.row} (${r.id}): ${err}`);
    }
    if (problems.length > 0) {
      return { success: false, err: `Invalid ids in CSV: ${problems.join("; ")}` };
    }

    // The dictionary the file leaves behind: the file's rows plus, on an
    // upsert, every existing row the file does not name.
    const survivors = new Map<string, CommonIndicatorDefinition>();
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
      if (r.definition.type !== "base" || r.definition.dhis2_id === null) continue;
      const other = fileOwner.get(r.definition.dhis2_id);
      if (other !== undefined) {
        return {
          success: false,
          err: `A DHIS2 id belongs to exactly one indicator; ${r.definition.dhis2_id} is listed under ${other} and ${r.id}`,
        };
      }
      fileOwner.set(r.definition.dhis2_id, r.id);
    }
    const currentOwner = new Map<string, string>();
    for (const i of existing) {
      if (i.definition.type === "base" && i.definition.dhis2_id !== null) {
        currentOwner.set(i.definition.dhis2_id, i.indicator_common_id);
      }
    }
    if (!replaceAllExisting) {
      for (const [dhis2Id, owner] of fileOwner) {
        const current = currentOwner.get(dhis2Id);
        if (current !== undefined && current !== owner && !fileIds.has(current)) {
          return {
            success: false,
            err: `A DHIS2 id belongs to exactly one indicator; ${dhis2Id} already belongs to ${current} and the file lists it under ${owner}`,
          };
        }
      }
    }
    // A dhis2_id that leaves its current owner (moved to another row, or
    // dropped by the row that rewrites the owner) leaves that owner's data
    // behind, so it is refused while the owner has data.
    const moved = [...fileOwner].filter(([dhis2Id, owner]) => {
      const current = currentOwner.get(dhis2Id);
      return current !== undefined && current !== owner;
    });
    const losingOwners = new Set(
      moved.map(([dhis2Id]) => currentOwner.get(dhis2Id)!),
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
      if (current.definition.type === "base" && r.definition.type !== "base") {
        retyped.push(r.id);
      }
      if (
        current.definition.type === "base" && current.definition.dhis2_id !== null &&
        (r.definition.type !== "base" || r.definition.dhis2_id !== current.definition.dhis2_id)
      ) {
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
        }. Keep them as bases or delete their data first.`,
      };
    }
    const losingWithData = await indicatorsWithData(mainDb, [...losingOwners]);
    if (losingWithData.length > 0) {
      return {
        success: false,
        err: `The file would take the DHIS2 id away from indicators that have data: ${
          describeWithData(losingWithData)
        }. Keep it under its current indicator or delete their data first.`,
      };
    }
    const removedNamedBySums = [...survivors].flatMap(([id, d]) =>
      d.type === "sum"
        ? d.members.filter((m) => removedIndicatorIds.includes(m)).map((m) => `${m} (in ${id})`)
        : []
    );
    if (removedNamedBySums.length > 0) {
      return {
        success: false,
        err: `The file would remove indicators that a sum names: ${
          removedNamedBySums.join(", ")
        }.`,
      };
    }

    await mainDb.begin(async (sql) => {
      let sortOrder = (
        await sql<{ next: number }[]>`
          SELECT COALESCE(MAX(sort_order), 0) + 1 AS next FROM indicators
        `
      )[0].next;
      // A moved dhis2_id leaves its current owner before any row is written
      // (the UNIQUE constraint is not deferrable), and removed rows go first
      // so a replace never trips on them. New rows sort after everything
      // that exists (CSV order preserved); an update keeps the row's place.
      if (removedIndicatorIds.length > 0) {
        await sql`
          DELETE FROM indicators WHERE indicator_common_id = ANY(${removedIndicatorIds})
        `;
      }
      for (const [dhis2Id] of moved) {
        await sql`
          UPDATE indicators SET dhis2_id = NULL, updated_at = CURRENT_TIMESTAMP
          WHERE dhis2_id = ${dhis2Id}
        `;
      }
      // Members and expressions may name rows later in the file, so every
      // row lands as a base first and takes its definition in a second pass.
      for (const r of rows) {
        await sql`
          INSERT INTO indicators (
            indicator_common_id, indicator_common_label, definition_type, expression,
            dhis2_id, members, include_in_analysis,
            format_as, thresholds, sort_order, updated_at
          )
          VALUES (
            ${r.id}, ${r.label}, 'base', NULL, NULL, NULL, ${r.include_in_analysis},
            'number', ${thresholdsToDb(r.thresholds)}, ${sortOrder++}, CURRENT_TIMESTAMP
          )
          ON CONFLICT (indicator_common_id) DO UPDATE SET
            indicator_common_label = EXCLUDED.indicator_common_label,
            definition_type = 'base',
            expression = NULL,
            dhis2_id = NULL,
            members = NULL,
            include_in_analysis = EXCLUDED.include_in_analysis,
            format_as = 'number',
            thresholds = EXCLUDED.thresholds,
            updated_at = CURRENT_TIMESTAMP
        `;
      }
      for (const r of rows) {
        const d = definitionFields(r.definition);
        await sql`
          UPDATE indicators
          SET definition_type = ${d.definition_type}, expression = ${d.expression},
            dhis2_id = ${d.dhis2_id}, members = ${d.members}, format_as = ${r.format_as}
          WHERE indicator_common_id = ${r.id}
        `;
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
      return { ok: false, err: `row ${row} (${id}): type must be base, sum or derived` };
    }
    const dhis2Id = cell("dhis2_id");
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
    if (type !== "base" && dhis2Id !== "") {
      return { ok: false, err: `row ${row} (${id}): only a base indicator has a DHIS2 id` };
    }
    const definition: CommonIndicatorDefinition = type === "base"
      ? { type: "base", dhis2_id: dhis2Id === "" ? null : dhis2Id }
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
    if (type !== "derived" && format_as !== "number") {
      return { ok: false, err: `row ${row} (${id}): a base or sum indicator is a count and is always formatted as a number` };
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
