// Single source of truth for analysing user-authored HFA indicator R code.
// Used by BOTH the client editor/validator and the server dependency analyzer,
// so the editor's green/red status and the run-time unknown-variable check can
// never disagree. Pure functions only: this compiles into Deno and Vite.

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

const R_KEYWORDS = new Set([
  "TRUE",
  "FALSE",
  "NA",
  "NA_real_",
  "NA_integer_",
  "NA_character_",
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
  "return",
  "in",
]);

// The indicator code language: a per-facility expression in R syntax, spliced
// into a `case_when` branch over the wide frame. Only vectorised, elementwise,
// NA-propagating functions belong here. A reducing function such as `sum` or
// `mean` collapses across every facility and broadcasts one scalar to each
// row, silently wrong, so it is rejected, as is any function not listed.
// Single source for the validator, the server analyzer, the editor's help line
// and the AI guidance.
export const HFA_CODE_FUNCTIONS = [
  "c",
  "is.na",
  "ifelse",
  "pmin",
  "pmax",
  "abs",
  "round",
  "floor",
  "ceiling",
  "as.numeric",
] as const;
const HFA_CODE_FUNCTION_SET: ReadonlySet<string> = new Set(HFA_CODE_FUNCTIONS);

export const HFA_CODE_OPERATORS = [
  "==",
  "!=",
  "<",
  ">",
  "<=",
  ">=",
  "&",
  "|",
  "!",
  "+",
  "-",
  "*",
  "/",
  "^",
  "%in%",
] as const;

// Bareword logical operators accepted as aliases for R's vectorised `&`/`|`.
// Single source of truth for both `normalizeRLogicalOperators` (which rewrites
// them) and `isReservedHfaId` (which forbids them as variable ids).
// Case-insensitive: the normaliser rewrites any case, so any case collides.
const R_LOGICAL_OPERATOR_ALIASES = new Map<string, string>([
  ["and", "&"],
  ["or", "|"],
]);
export const HFA_CODE_OPERATOR_ALIASES = [...R_LOGICAL_OPERATOR_ALIASES.keys()]
  .map((k) => k.toUpperCase());

const R_LOGICAL_OPERATOR_REGEX = new RegExp(
  `(^|[^A-Za-z0-9_.])(${
    [...R_LOGICAL_OPERATOR_ALIASES.keys()].join("|")
  })(?![A-Za-z0-9_.])`,
  "gi",
);

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

// An id that cannot be used in HFA, neither as an authored indicator id
// nor as a referenceable survey variable, because it collides with how
// indicator R code is interpreted or with the module script's own columns, and
// would silently break at run time:
//   - `and`/`or` (any case) are rewritten to `&`/`|` by
//     `normalizeRLogicalOperators`, so a variable with that name becomes an
//     operator.
//   - R keywords are dropped from identifier extraction, so a variable with
//     that exact name is silently ignored as a dependency. The accepted
//     functions are the language's vocabulary, listed under the code box, so
//     a variable with one of those names is reserved to keep code readable.
//   - The M10 structural column names above.
// Applied at BOTH ends: indicator-id validation and survey-data import.
export function isReservedHfaId(name: string): boolean {
  const trimmed = name.trim();
  if (R_LOGICAL_OPERATOR_ALIASES.has(trimmed.toLowerCase())) {
    return true;
  }
  if (M10_STRUCTURAL_NAMES.has(trimmed.toLowerCase())) {
    return true;
  }
  if (M10_STRUCTURAL_PREFIX_REGEX.test(trimmed)) {
    return true;
  }
  if (trimmed.toLowerCase().endsWith("__status")) {
    return true;
  }
  return R_KEYWORDS.has(trimmed) || HFA_CODE_FUNCTION_SET.has(trimmed);
}

// Char scanner (not regex): handles escaped quotes inside strings, and keeps
// the newline that terminates a comment so line structure is preserved.
export function stripRStringsAndComments(rCode: string): string {
  let out = "";
  let inString: '"' | "'" | null = null;
  let inComment = false;
  for (let i = 0; i < rCode.length; i++) {
    const ch = rCode[i];
    const prev = i > 0 ? rCode[i - 1] : "";
    if (inComment) {
      if (ch === "\n") {
        inComment = false;
        out += ch;
      }
      continue;
    }
    if (inString) {
      if (ch === inString && prev !== "\\") {
        inString = null;
      }
      continue;
    }
    if (ch === "#") {
      inComment = true;
      continue;
    }
    if (ch === '"' || ch === "'") {
      inString = ch;
      continue;
    }
    out += ch;
  }
  return out;
}

// Accept `AND`/`OR` (any case) as aliases for R's vectorised `&`/`|`, rewriting
// them outside string literals and comments. Word boundaries treat `.` and
// identifier characters as part of a word, so `factor`, `donor`, and a dataset
// variable like `x.or` are left untouched. `&&`/`||` are deliberately NOT
// rewritten: those are a distinct mistake the validator flags (a vectorised
// case_when rejects them), and silently "fixing" them would hide the error.
export function normalizeRLogicalOperators(rCode: string): string {
  let out = "";
  let codeRun = "";
  let inString: '"' | "'" | null = null;
  let inComment = false;

  const flush = (): void => {
    out += codeRun.replace(
      R_LOGICAL_OPERATOR_REGEX,
      (_m, pre: string, op: string) =>
        pre + (R_LOGICAL_OPERATOR_ALIASES.get(op.toLowerCase()) ?? op),
    );
    codeRun = "";
  };

  for (let i = 0; i < rCode.length; i++) {
    const ch = rCode[i];
    const prev = i > 0 ? rCode[i - 1] : "";
    if (inComment) {
      out += ch;
      if (ch === "\n") inComment = false;
      continue;
    }
    if (inString) {
      out += ch;
      if (ch === inString && prev !== "\\") inString = null;
      continue;
    }
    if (ch === "#") {
      flush();
      inComment = true;
      out += ch;
      continue;
    }
    if (ch === '"' || ch === "'") {
      flush();
      inString = ch;
      out += ch;
      continue;
    }
    codeRun += ch;
  }
  flush();
  return out;
}

// An identifier followed by `(` is a call; every other identifier is a
// variable or indicator reference.
const R_IDENTIFIER_REGEX = /\b([a-zA-Z_][a-zA-Z0-9._]*)\b(\s*\()?/g;

function splitRIdentifiers(
  rCode: string,
): { variables: string[]; calls: string[] } {
  const cleaned = stripRStringsAndComments(normalizeRLogicalOperators(rCode));
  const variables = new Set<string>();
  const calls = new Set<string>();
  for (const m of cleaned.matchAll(R_IDENTIFIER_REGEX)) {
    const name = m[1];
    if (R_KEYWORDS.has(name)) continue;
    (m[2] ? calls : variables).add(name);
  }
  return { variables: [...variables].sort(), calls: [...calls].sort() };
}

export function extractRIdentifiers(rCode: string): string[] {
  return splitRIdentifiers(rCode).variables;
}

export function unknownRFunctions(rCode: string): string[] {
  return splitRIdentifiers(rCode).calls.filter(
    (name) => !HFA_CODE_FUNCTION_SET.has(name),
  );
}
