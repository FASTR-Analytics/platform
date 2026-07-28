// Single source of truth for analysing user-authored HFA indicator R code.
// Used by BOTH the client editor/validator and the server dependency analyzer,
// so the editor's green/red status and the run-time unknown-variable check can
// never disagree. Pure functions only — this compiles into Deno and Vite.

// Shape rule for an *authored HFA indicator* name (`HfaIndicator.varName`):
// starts with a letter, then letters/digits/underscores, max 64 chars. This is
// deliberately NOT the rule for survey/dataset variable names — those are
// external (from the XLSForm) and legitimately broader (e.g. hyphenated
// sentinel expansions like `sup_05e_-99`). A valid indicator name must also not
// be reserved — see `isReservedHfaVarName`.
export const HFA_INDICATOR_NAME_REGEX = /^[a-zA-Z][a-zA-Z0-9_]{0,63}$/;

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

const R_COMMON_FUNCTIONS = new Set([
  "c",
  "case_when",
  "across",
  "rowSums",
  "rowMeans",
  "str_detect",
  "as",
  "as.numeric",
  "as.character",
  "as.integer",
  "as.logical",
  "is",
  "is.na",
  "is.null",
  "ifelse",
  "sum",
  "mean",
  "min",
  "max",
  "abs",
  "sqrt",
  "log",
  "exp",
  "grepl",
  "nchar",
  "substr",
  "paste",
  "paste0",
  "length",
  "which",
  "any",
  "all",
  "round",
  "ceiling",
  "floor",
  "trimws",
  "gsub",
  "sub",
  "startsWith",
  "endsWith",
  "tolower",
  "toupper",
  "nrow",
  "ncol",
  "names",
  "print",
  "cat",
  "seq",
  "rep",
  "seq_along",
  "seq_len",
]);

// Bareword logical operators accepted as aliases for R's vectorised `&`/`|`.
// Single source of truth for both `normalizeRLogicalOperators` (which rewrites
// them) and `isReservedHfaVarName` (which forbids them as variable names).
// Case-insensitive: the normaliser rewrites any case, so any case collides.
const R_LOGICAL_OPERATOR_ALIASES = new Map<string, string>([
  ["and", "&"],
  ["or", "|"],
]);

const R_LOGICAL_OPERATOR_REGEX = new RegExp(
  `(^|[^A-Za-z0-9_.])(${[...R_LOGICAL_OPERATOR_ALIASES.keys()].join("|")})(?![A-Za-z0-9_.])`,
  "gi",
);

// Column names the M10 script owns. `time_point` / `facility_*` / `admin_area_*`
// are its facility columns, `var_name` / `value` are what it pivots on, and
// `weight` / `weight_final` carry the sampling weight. A survey variable or
// indicator with one of these names collides at `pivot_wider`, overwrites the
// column via `mutate`, or — worst — silently shadows it inside the scoped
// bindings the indicator expression is evaluated in, turning every row NA with
// no error. `__status` is the suffix of the generated response-status columns,
// which the script collects by pattern.
//
// Matched case-insensitively even though R column names are case-sensitive:
// `Weight` would not actually collide, but a name that differs only in case
// from a structural column is a mistake worth rejecting at the boundary.
const M10_STRUCTURAL_NAMES = new Set([
  "var_name",
  "value",
  "weight",
  "weight_final",
]);
const M10_STRUCTURAL_PREFIX_REGEX = /^(facility_|admin_area_|time_point)/i;

// A name that cannot be used as an HFA variable — neither an authored indicator
// name nor a referenceable survey variable — because it collides with how
// indicator R code is interpreted or with the module script's own columns, and
// would silently break at run time:
//   - `and`/`or` (any case) are rewritten to `&`/`|` by
//     `normalizeRLogicalOperators`, so a variable with that name becomes an
//     operator.
//   - R keywords and the common functions `extractRIdentifiers` filters (exact
//     case) are dropped from identifier extraction, so a variable with that
//     exact name is silently ignored as a dependency and mis-spliced into R.
//   - The M10 structural column names above.
// Applied at BOTH ends: indicator-name validation and survey-data import.
export function isReservedHfaVarName(name: string): boolean {
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
  return R_KEYWORDS.has(trimmed) || R_COMMON_FUNCTIONS.has(trimmed);
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
// rewritten — those are a distinct mistake the validator flags (a vectorised
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

export function extractRIdentifiers(rCode: string): string[] {
  const cleaned = stripRStringsAndComments(normalizeRLogicalOperators(rCode));
  const identifierPattern = /\b[a-zA-Z_][a-zA-Z0-9._]*\b/g;
  const matches = [...cleaned.matchAll(identifierPattern)];
  const variables = matches
    .map((m) => m[0])
    .filter((v) => !R_KEYWORDS.has(v) && !R_COMMON_FUNCTIONS.has(v));
  return [...new Set(variables)].sort();
}
