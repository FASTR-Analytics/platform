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
// code names must be a syntactic R name (no `[bracketed]` form), and must not
// be one of R's reserved words, which R reads as a constant or a keyword
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
