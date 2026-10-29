// HFA indicator code: the per-facility expression an analyst writes for each
// round, in the platform's expression language (lib/indicator_expression).
// Single source for what HFA code may say, used by BOTH the client editor and
// the server generator, so the editor's green/red status and the run-time
// checks can never disagree. Pure functions only: this compiles into Deno and
// Vite.

import {
  collectIdentifiers,
  EXPRESSION_FUNCTION_NAMES,
  EXPRESSION_KEYWORDS,
  type ExpressionNode,
  ExpressionSyntaxError,
  type ExpressionSyntaxErrorKind,
  parseIndicatorExpression,
} from "./indicator_expression/mod.ts";
import type { TranslatableString } from "./translate/types.ts";
import { findHfaDependencyCycles } from "./hfa_indicator_dependencies.ts";
import type {
  HfaDictionaryForValidation,
  HfaIndicator,
  HfaIndicatorCode,
  HfaIndicatorVariantCode,
} from "./types/mod.ts";

// Shape rule for an *authored HFA indicator* id (`HfaIndicator.indicatorId`):
// starts with a letter, then letters/digits/underscores, max 64 chars. This is
// deliberately NOT the rule for survey/dataset variable ids: those are
// external (from the XLSForm) and legitimately broader (e.g. hyphenated
// sentinel expansions like `sup_05e_-99`). A valid indicator id must also not
// be reserved: see `isReservedHfaId`.
export const HFA_INDICATOR_ID_REGEX = /^[a-zA-Z][a-zA-Z0-9_]{0,63}$/;

// The app assigns indicator ids; nobody types one. `takenIds` is every id the
// new one must not equal: stored indicator ids, ids already assigned in the
// same batch, and survey variable ids (an indicator id is spliced into R as a
// bare symbol, so it must not shadow a dataset column).
export function nextHfaIndicatorId(takenIds: Iterable<string>): string {
  const taken = new Set(takenIds);
  let n = 0;
  for (const id of taken) {
    const m = /^ind(\d+)$/.exec(id);
    if (m) n = Math.max(n, Number(m[1]));
  }
  for (;;) {
    n++;
    const id = `ind${String(n).padStart(3, "0")}`;
    if (!taken.has(id) && !isReservedHfaId(id)) return id;
  }
}

// Shape rule for a variant item id: lowercase letter, then lowercase
// letters/digits/underscores, max 64 chars. Item ids are data values of the
// hfa_variant_item column and the suffix of composed per-item R columns, and
// must be globally unique across ALL HFA id namespaces (indicator ids,
// categories, sub-categories, service-categories, other items): labels
// resolve through one flat id→label map, so a collision silently mislabels.
export const HFA_VARIANT_ITEM_ID_REGEX = /^[a-z][a-z0-9_]{0,63}$/;

// The generated per-item wide column for (parent indicator, variant item).
// Composition is NOT reversible (indicator ids legally contain `__`), so nothing may
// parse this name back apart: parent/item routing is metadata-driven only.
// Composed names must be unique against {indicator ids} ∪ {survey
// variables} ∪ {other composed names} and must clear `isReservedHfaId`
// (notably its `__status` suffix rule): enforced at authoring time and as a
// generation-time hard error.
export function composeHfaVariantColumnName(
  parentIndicatorId: string,
  itemId: string,
): string {
  return `${parentIndicatorId}__${itemId}`;
}

// The language as the editor's help line and the AI guidance state it.
// `& | !` are accepted as AND OR NOT, and text is written in quotes.
export const HFA_CODE_SYMBOLS = [
  "==",
  "!=",
  "<",
  ">",
  "<=",
  ">=",
  "+",
  "-",
  "*",
  "/",
] as const;
export const HFA_CODE_WORDS = ["AND", "OR", "NOT"] as const;
export const HFA_CODE_LIST_EXAMPLE = "x IN (1, 2)";

// The generator splices every variable and indicator id into R as a bare
// symbol, in the code and in the sentinel bindings around it. So an id the
// code names must be a syntactic R name (`[q_1]` is accepted and emitted as
// `q_1`; a name that needs the brackets, such as `[q_-99]`, is not), and must
// not be one of R's reserved words, which R reads as a constant or a keyword
// instead of the column.
export const HFA_CODE_NAME_PATTERN = /^[A-Za-z][A-Za-z0-9_]*$/;
const R_RESERVED_WORDS = new Set([
  "TRUE",
  "FALSE",
  "NA",
  "NA_real_",
  "NA_integer_",
  "NA_character_",
  "NA_complex_",
  "NULL",
  "Inf",
  "NaN",
  "if",
  "else",
  "for",
  "while",
  "repeat",
  "function",
  "break",
  "next",
  "in",
]);

// Column names the M10 script owns. `time_point` / `facility_*` / `admin_area_*`
// are its facility columns, `variable_id` / `value` are what it pivots on, and
// `weight` / `weight_final` carry the sampling weight. A survey variable or
// indicator with one of these names collides at `pivot_wider`, overwrites the
// column via `mutate`, or, at worst, silently shadows it inside the scoped
// bindings the indicator expression is evaluated in, turning every row NA with
// no error. `__status` is the suffix of the generated response-status columns,
// which the script collects by pattern.
//
// Matched case-insensitively even though R column names are case-sensitive:
// `Weight` would not actually collide, but a name that differs only in case
// from a structural column is a mistake worth rejecting at the boundary.
const M10_STRUCTURAL_NAMES = new Set([
  "variable_id",
  "value",
  "weight",
  "weight_final",
]);
const M10_STRUCTURAL_PREFIX_REGEX = /^(facility_|admin_area_|time_point)/i;

// An id that cannot be used in HFA, neither as an authored indicator id nor as
// a referenceable survey variable, because the code could not name it or the
// module script would misread it:
//   - the language's words (`and`, `or`, `not`, `in`, any case), which parse
//     as operators, and its function names, which parse as calls;
//   - R's reserved words, since the id is spliced into R bare;
//   - the M10 structural column names above.
// Applied at BOTH ends: indicator-id validation and survey-data import.
export function isReservedHfaId(name: string): boolean {
  const trimmed = name.trim();
  const lower = trimmed.toLowerCase();
  return (EXPRESSION_KEYWORDS as readonly string[]).includes(lower) ||
    (EXPRESSION_FUNCTION_NAMES as readonly string[]).includes(trimmed) ||
    R_RESERVED_WORDS.has(trimmed) ||
    M10_STRUCTURAL_NAMES.has(lower) ||
    M10_STRUCTURAL_PREFIX_REGEX.test(trimmed) ||
    lower.endsWith("__status");
}

export type HfaCodeError =
  | { kind: ExpressionSyntaxErrorKind; at: number; token: string }
  | { kind: "call"; name: string }
  | { kind: "unsupported_name"; name: string }
  | { kind: "text_operand"; text: string };

export type HfaCodeParse =
  | { ok: true; node: ExpressionNode; identifiers: string[] }
  | { ok: false; error: HfaCodeError };

// The language minus what HFA code cannot use: calls (the grammar keeps
// `abs`, `coalesce`, `nullif` for calculated indicators), a name the
// generator cannot bind, and text anywhere but beside `==`, `!=`, `<`, `>`,
// `<=`, `>=` or in an IN test (R cannot add or negate text).
export function parseHfaIndicatorCode(source: string): HfaCodeParse {
  let node: ExpressionNode;
  try {
    node = parseIndicatorExpression(source);
  } catch (e) {
    if (!(e instanceof ExpressionSyntaxError)) throw e;
    return { ok: false, error: { kind: e.kind, at: e.at, token: e.token } };
  }
  const refused = findRefusedNode(node, undefined);
  if (refused !== undefined) return { ok: false, error: refused };
  const identifiers = collectIdentifiers(node);
  const unbindable = identifiers.find((id) => !HFA_CODE_NAME_PATTERN.test(id));
  if (unbindable !== undefined) {
    return { ok: false, error: { kind: "unsupported_name", name: unbindable } };
  }
  return { ok: true, node, identifiers };
}

function findRefusedNode(
  node: ExpressionNode,
  parent: ExpressionNode["kind"] | undefined,
): HfaCodeError | undefined {
  const first = (children: ExpressionNode[]) => {
    for (const child of children) {
      const refused = findRefusedNode(child, node.kind);
      if (refused !== undefined) return refused;
    }
    return undefined;
  };
  switch (node.kind) {
    case "number":
    case "identifier":
      return undefined;
    case "string":
      return parent === "compare" || parent === "in"
        ? undefined
        : { kind: "text_operand", text: node.value };
    case "call":
      return { kind: "call", name: node.name };
    case "negate":
    case "not":
      return first([node.operand]);
    case "binary":
    case "compare":
    case "and":
    case "or":
      return first([node.left, node.right]);
    case "in":
      return first([node.operand, ...node.values]);
  }
}

// One stored snippet, as a write route would store it: a round's main code
// or filter, or a round's code for one variant item.
export type HfaCodeRow = {
  indicatorId: string;
  timePoint: string;
  field: "rCode" | "rFilterCode" | `variant:${string}`;
  code: string;
};

// Every row whose code is not blank and does not parse, with the parse error:
// what a write boundary refuses, since such a snippet can never run.
export function unparseableHfaCode(
  rows: HfaCodeRow[],
): (HfaCodeRow & { error: HfaCodeError })[] {
  return rows.flatMap((row) => {
    if (!row.code.trim()) return [];
    const parsed = parseHfaIndicatorCode(row.code);
    return parsed.ok ? [] : [{ ...row, error: parsed.error }];
  });
}

// The identifiers the code names, for guards that only need its references
// (unused variables, deletion warnings). Code that does not parse names
// nothing here; the editor reports it as an error.
export function hfaIndicatorCodeIdentifiers(source: string): string[] {
  const parsed = parseHfaIndicatorCode(source);
  return parsed.ok ? parsed.identifiers : [];
}

// A yes/no condition or a number, read off the root node.
export function hfaCodeResultType(node: ExpressionNode): "boolean" | "numeric" {
  switch (node.kind) {
    case "compare":
    case "and":
    case "or":
    case "not":
    case "in":
      return "boolean";
    default:
      return "numeric";
  }
}

export function describeHfaCodeError(error: HfaCodeError): TranslatableString {
  switch (error.kind) {
    case "call":
    case "unknown_function":
    case "uncalled_function":
    case "arity": {
      const name = "name" in error ? error.name : error.token;
      return {
        en:
          `'${name}' is a function, and functions are not part of indicator code`,
        fr:
          `« ${name} » est une fonction, et les fonctions ne font pas partie du code des indicateurs`,
        pt:
          `'${name}' é uma função, e as funções não fazem parte do código dos indicadores`,
      };
    }
    case "unsupported_name":
      return {
        en:
          `'${error.name}' cannot be used in indicator code: a name must start with a letter and hold only letters, digits and underscores`,
        fr:
          `« ${error.name} » ne peut pas être utilisé dans le code des indicateurs : un nom commence par une lettre et ne contient que des lettres, des chiffres et des tirets bas`,
        pt:
          `'${error.name}' não pode ser usado no código dos indicadores: um nome começa por uma letra e contém apenas letras, dígitos e sublinhados`,
      };
    case "text_operand":
      return {
        en:
          `The text "${error.text}" can only be compared, with == != < > <= >= or IN`,
        fr:
          `Le texte « ${error.text} » ne peut qu'être comparé, avec == != < > <= >= ou IN`,
        pt:
          `O texto "${error.text}" só pode ser comparado, com == != < > <= >= ou IN`,
      };
  }
  const position = error.at + 1;
  const token = error.token;
  switch (error.kind) {
    case "empty":
      return {
        en: "The code is empty",
        fr: "Le code est vide",
        pt: "O código está vazio",
      };
    case "unexpected_char":
      return {
        en: `'${token}' at character ${position} is not part of indicator code`,
        fr:
          `« ${token} » au caractère ${position} ne fait pas partie du code des indicateurs`,
        pt:
          `'${token}' no carácter ${position} não faz parte do código dos indicadores`,
      };
    case "unclosed_bracket":
      return {
        en: `The '[' at character ${position} is never closed`,
        fr: `Le « [ » au caractère ${position} n'est jamais fermé`,
        pt: `O '[' no carácter ${position} nunca é fechado`,
      };
    case "empty_bracket":
      return {
        en: `Empty '[]' at character ${position}`,
        fr: `« [] » vide au caractère ${position}`,
        pt: `'[]' vazio no carácter ${position}`,
      };
    case "unclosed_quote":
      return {
        en: `The quote at character ${position} is never closed`,
        fr: `Le guillemet au caractère ${position} n'est jamais fermé`,
        pt: `As aspas no carácter ${position} nunca são fechadas`,
      };
    case "single_equals":
      return {
        en: `Single '=' at character ${position}: write '==' to compare`,
        fr:
          `« = » seul au caractère ${position} : écrivez « == » pour comparer`,
        pt: `'=' isolado no carácter ${position}: escreva '==' para comparar`,
      };
    case "doubled_operator":
      return {
        en: `'${token}' at character ${position}: write '${token[0]}' or ${
          token === "&&" ? "AND" : "OR"
        }`,
        fr: `« ${token} » au caractère ${position} : écrivez « ${
          token[0]
        } » ou ${token === "&&" ? "AND" : "OR"}`,
        pt: `'${token}' no carácter ${position}: escreva '${token[0]}' ou ${
          token === "&&" ? "AND" : "OR"
        }`,
      };
    case "missing_operand":
      return token === ""
        ? {
          en: "The code ends where a value is expected",
          fr: "Le code s'arrête là où une valeur est attendue",
          pt: "O código termina onde se espera um valor",
        }
        : {
          en: `A value is expected at character ${position}, not '${token}'`,
          fr:
            `Une valeur est attendue au caractère ${position}, pas « ${token} »`,
          pt: `Espera-se um valor no carácter ${position}, não '${token}'`,
        };
    case "expected":
      return {
        en: `'${token}' is expected at character ${position}`,
        fr: `« ${token} » est attendu au caractère ${position}`,
        pt: `'${token}' é esperado no carácter ${position}`,
      };
    case "trailing":
      return {
        en: `Unexpected '${token}' at character ${position}`,
        fr: `« ${token} » inattendu au caractère ${position}`,
        pt: `'${token}' inesperado no carácter ${position}`,
      };
  }
}

// ---------------------------------------------------------------------------
// The status core: what is wrong with an indicator's code, round by round.
// Every surface that shows status (the manager, the editor, the chat's tools)
// computes it here; the client translates the texts at render.
// ---------------------------------------------------------------------------

export type HfaCodeIssueKind =
  | "syntax"
  | "unknown_variable"
  | "filter_without_code"
  | "variant_without_code"
  | "cycle"
  | "result_type";

export type HfaCodeIssue = { kind: HfaCodeIssueKind; text: TranslatableString };

// A result-type mismatch is the one warning; every other kind is an error.
export function isHfaCodeError(kind: HfaCodeIssueKind): boolean {
  return kind !== "result_type";
}

export function validateHfaIndicatorCode(
  code: string,
  availableVariableIds: ReadonlySet<string>,
  otherIndicatorIds: ReadonlySet<string>,
): { issues: HfaCodeIssue[]; referencedIds: string[] } {
  return validateAgainst(
    code,
    availableVariableIds,
    otherIndicatorIds,
    undefined,
    parseHfaIndicatorCode,
  );
}

// One parse per distinct source within a status pass: rounds usually share
// their code, and the issues and the result type read the same parse.
function cachedHfaCodeParse(): (source: string) => HfaCodeParse {
  const cache = new Map<string, HfaCodeParse>();
  return (source) => {
    const known = cache.get(source);
    if (known !== undefined) return known;
    const parsed = parseHfaIndicatorCode(source);
    cache.set(source, parsed);
    return parsed;
  };
}

// `excludedId` is an indicator id that `indicatorIds` holds but the code may
// not name: an indicator's own id in its main code. Excluding it here saves
// building a copy of the id set per indicator.
function validateAgainst(
  code: string,
  variableIds: ReadonlySet<string>,
  indicatorIds: ReadonlySet<string>,
  excludedId: string | undefined,
  parse: (source: string) => HfaCodeParse,
): { issues: HfaCodeIssue[]; referencedIds: string[] } {
  if (!code.trim()) return { issues: [], referencedIds: [] };
  const parsed = parse(code);
  if (!parsed.ok) {
    return {
      issues: [{ kind: "syntax", text: describeHfaCodeError(parsed.error) }],
      referencedIds: [],
    };
  }
  const isKnown = (id: string) =>
    variableIds.has(id) || (id !== excludedId && indicatorIds.has(id));
  const issues: HfaCodeIssue[] = [];
  const referencedIds: string[] = [];
  for (const id of parsed.identifiers) {
    if (isKnown(id)) {
      referencedIds.push(id);
      continue;
    }
    const lower = id.toLowerCase();
    const sameCase = [...variableIds, ...indicatorIds].find((k) =>
      k !== excludedId && k.toLowerCase() === lower
    );
    issues.push({
      kind: "unknown_variable",
      text: unknownIdText(id, sameCase),
    });
  }
  return { issues, referencedIds };
}

function unknownIdText(
  id: string,
  sameCase: string | undefined,
): TranslatableString {
  return sameCase
    ? {
      en:
        `Variable '${id}' not found in this time point. Did you mean '${sameCase}'?`,
      fr:
        `Variable « ${id} » introuvable dans ce point temporel. Vouliez-vous dire « ${sameCase} » ?`,
      pt:
        `Variável '${id}' não encontrada neste ponto temporal. Queria dizer '${sameCase}'?`,
    }
    : {
      en: `Variable '${id}' not found in this time point`,
      fr: `Variable « ${id} » introuvable dans ce point temporel`,
      pt: `Variável '${id}' não encontrada neste ponto temporal`,
    };
}

// Whether the code's result fits the indicator's `type`. Code that does not
// parse has no type; its syntax issue is reported instead.
export function checkHfaCodeResultType(
  code: string,
  type: "binary" | "numeric",
): TranslatableString | undefined {
  return resultTypeText(code, type, parseHfaIndicatorCode);
}

function resultTypeText(
  code: string,
  type: "binary" | "numeric",
  parse: (source: string) => HfaCodeParse,
): TranslatableString | undefined {
  if (!code.trim()) return undefined;
  const parsed = parse(code);
  if (!parsed.ok) return undefined;
  const resultType = hfaCodeResultType(parsed.node);
  if (type === "binary" && resultType === "numeric") {
    return {
      en:
        "The indicator is yes/no (binary) but this code gives a number. Write a condition, such as var == 1",
      fr:
        "L'indicateur est oui/non (binaire) mais ce code donne un nombre. Écrivez une condition, comme var == 1",
      pt:
        "O indicador é sim/não (binário) mas este código dá um número. Escreva uma condição, como var == 1",
    };
  }
  if (type === "numeric" && resultType === "boolean") {
    return {
      en:
        "The indicator is a number (numeric) but this code gives yes/no. For a share of facilities, make the indicator binary",
      fr:
        "L'indicateur est un nombre (numérique) mais ce code donne oui/non. Pour une part des établissements, rendez l'indicateur binaire",
      pt:
        "O indicador é um número (numérico) mas este código dá sim/não. Para uma proporção de estabelecimentos, torne o indicador binário",
    };
  }
  return undefined;
}

export type HfaRoundStatusKind = "none" | "error" | "warning" | "ready";

export type HfaFieldIssue = HfaCodeIssue & {
  field: "rCode" | "rFilterCode" | "variantCode";
  itemId?: string;
};

export type HfaRoundStatus = {
  timePoint: string;
  status: HfaRoundStatusKind;
  issues: HfaFieldIssue[];
};

export type HfaIndicatorStatus = {
  rounds: HfaRoundStatus[];
  consistent: boolean;
};

// Per indicator, per round of the dictionary. Main and filter code are read
// against the round's variables and the other indicators; variant code may
// also name its own indicator. Variant rows of items outside the indicator's
// group are not its code and are ignored. `only` limits the result to some
// indicators, as the editor needs on every keystroke; cycles are still read
// off the whole graph.
export function hfaIndicatorsStatus(input: {
  indicators: HfaIndicator[];
  code: HfaIndicatorCode[];
  variantCode: HfaIndicatorVariantCode[];
  variantItems: { id: string; groupId: string }[];
  dictionary: HfaDictionaryForValidation;
  only?: ReadonlySet<string>;
}): Map<string, HfaIndicatorStatus> {
  const parse = cachedHfaCodeParse();
  const allIds = new Set(input.indicators.map((i) => i.indicatorId));
  const codeByIndicator = groupBy(input.code, (c) => c.indicatorId);
  const variantByIndicator = groupBy(input.variantCode, (c) => c.indicatorId);
  const groupByItem = new Map(input.variantItems.map((i) => [i.id, i.groupId]));
  const variablesByRound = new Map(
    input.dictionary.timePoints.map((tp) => [
      tp.timePoint,
      new Set(tp.variables.map((v) => v.variableId)),
    ]),
  );
  const cycleByIndicator = new Map<string, TranslatableString>();
  for (
    const cycle of findHfaDependencyCycles(input.indicators, codeByIndicator)
  ) {
    const text = cycleText(cycle);
    for (const id of cycle) cycleByIndicator.set(id, text);
  }

  const result = new Map<string, HfaIndicatorStatus>();
  for (const ind of input.indicators) {
    const id = ind.indicatorId;
    if (input.only !== undefined && !input.only.has(id)) continue;
    const code = codeByIndicator.get(id) ?? [];
    const variantCode = (variantByIndicator.get(id) ?? []).filter((c) =>
      ind.variantGroupId !== null &&
      groupByItem.get(c.itemId) === ind.variantGroupId
    );
    const cycle = cycleByIndicator.get(id);
    const rounds = input.dictionary.timePoints.map((tp): HfaRoundStatus => {
      const variables = variablesByRound.get(tp.timePoint) ?? new Set();
      const main = code.find((c) => c.timePoint === tp.timePoint);
      const rCode = main?.rCode ?? "";
      const rFilterCode = main?.rFilterCode ?? "";
      const hasCode = rCode.trim() !== "";
      const issues: HfaFieldIssue[] = [];
      const add = (
        field: HfaFieldIssue["field"],
        found: HfaCodeIssue[],
        itemId?: string,
      ) => {
        for (const issue of found) {
          issues.push(
            itemId === undefined
              ? { ...issue, field }
              : { ...issue, field, itemId },
          );
        }
      };
      add("rCode", validateAgainst(rCode, variables, allIds, id, parse).issues);
      add(
        "rFilterCode",
        validateAgainst(rFilterCode, variables, allIds, id, parse).issues,
      );
      if (!hasCode && rFilterCode.trim() !== "") {
        add("rFilterCode", [{
          kind: "filter_without_code",
          text: FILTER_WITHOUT_CODE,
        }]);
      }
      if (hasCode && cycle !== undefined) {
        add("rCode", [{ kind: "cycle", text: cycle }]);
      }
      const resultType = resultTypeText(rCode, ind.type, parse);
      if (resultType !== undefined) {
        add("rCode", [{ kind: "result_type", text: resultType }]);
      }
      for (const v of variantCode) {
        if (v.timePoint !== tp.timePoint || !v.rCode.trim()) continue;
        add(
          "variantCode",
          validateAgainst(v.rCode, variables, allIds, undefined, parse).issues,
          v.itemId,
        );
        if (!hasCode) {
          add("variantCode", [{
            kind: "variant_without_code",
            text: VARIANT_WITHOUT_CODE,
          }], v.itemId);
        }
      }
      return {
        timePoint: tp.timePoint,
        status: issues.some((i) => isHfaCodeError(i.kind))
          ? "error"
          : issues.length > 0
          ? "warning"
          : hasCode
          ? "ready"
          : "none",
        issues,
      };
    });
    result.set(id, { rounds, consistent: isHfaCodeConsistent(code) });
  }
  return result;
}

// The non-empty rounds have identical trimmed main and filter code. Variant
// code is not compared.
export function isHfaCodeConsistent(
  code: { rCode: string; rFilterCode?: string | undefined }[],
): boolean {
  const key = (c: { rCode: string; rFilterCode?: string | undefined }) =>
    `${c.rCode.trim()}\u0000${c.rFilterCode?.trim() ?? ""}`;
  const nonEmpty = code.filter((c) => key(c) !== "\u0000");
  return nonEmpty.every((c) => key(c) === key(nonEmpty[0]));
}

const FILTER_WITHOUT_CODE: TranslatableString = {
  en: "Filter code requires indicator code for this time point",
  fr: "Le code filtre nécessite un code d'indicateur pour ce point temporel",
  pt: "O código de filtro requer código do indicador para este ponto temporal",
};

const VARIANT_WITHOUT_CODE: TranslatableString = {
  en: "Variant code requires indicator code for this time point",
  fr:
    "Le code de variante nécessite un code d'indicateur pour ce point temporel",
  pt:
    "O código de variante requer código do indicador para este ponto temporal",
};

function cycleText(cycle: string[]): TranslatableString {
  const members = cycle.join(", ");
  return cycle.length === 1
    ? {
      en: "The indicator names itself: a run refuses a cycle",
      fr: "L'indicateur se nomme lui-même : une exécution refuse un cycle",
      pt: "O indicador nomeia-se a si próprio: uma execução recusa um ciclo",
    }
    : {
      en:
        `The indicators ${members} name each other in a cycle: a run refuses a cycle`,
      fr:
        `Les indicateurs ${members} se nomment en cycle : une exécution refuse un cycle`,
      pt:
        `Os indicadores ${members} nomeiam-se em ciclo: uma execução recusa um ciclo`,
    };
}

function groupBy<T>(items: T[], key: (item: T) => string): Map<string, T[]> {
  const out = new Map<string, T[]>();
  for (const item of items) {
    const k = key(item);
    const list = out.get(k);
    if (list === undefined) out.set(k, [item]);
    else list.push(item);
  }
  return out;
}
