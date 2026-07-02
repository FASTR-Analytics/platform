// Single source of truth for analysing user-authored HFA indicator R code.
// Used by BOTH the client editor/validator and the server dependency analyzer,
// so the editor's green/red status and the run-time unknown-variable check can
// never disagree. Pure functions only — this compiles into Deno and Vite.

export const HFA_VAR_NAME_REGEX = /^[a-zA-Z][a-zA-Z0-9_]{0,63}$/;

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

export function extractRIdentifiers(rCode: string): string[] {
  const cleaned = stripRStringsAndComments(rCode);
  const identifierPattern = /\b[a-zA-Z_][a-zA-Z0-9._]*\b/g;
  const matches = [...cleaned.matchAll(identifierPattern)];
  const variables = matches
    .map((m) => m[0])
    .filter((v) => !R_KEYWORDS.has(v) && !R_COMMON_FUNCTIONS.has(v));
  return [...new Set(variables)].sort();
}
