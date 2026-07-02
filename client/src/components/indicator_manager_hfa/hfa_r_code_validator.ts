import { extractRIdentifiers, stripRStringsAndComments } from "lib";

export type RCodeValidationResult = {
  syntaxErrors: string[];
  unknownVariableErrors: string[];
  warnings: string[];
  referencedVars: string[];
};

export function hasRCodeErrors(result: RCodeValidationResult): boolean {
  return (
    result.syntaxErrors.length > 0 || result.unknownVariableErrors.length > 0
  );
}

export function validateRCode(
  rCode: string,
  availableVarNames: Set<string>,
  otherIndicatorVarNames: Set<string>,
): RCodeValidationResult {
  if (!rCode.trim()) {
    return {
      syntaxErrors: [],
      unknownVariableErrors: [],
      warnings: [],
      referencedVars: [],
    };
  }

  const syntaxErrors = checkRSyntax(rCode);
  const identifiers = extractRIdentifiers(rCode);
  const warnings: string[] = [...checkLoneEquals(rCode)];
  const unknownVariableErrors: string[] = [];
  const referencedVars: string[] = [];

  for (const id of identifiers) {
    if (availableVarNames.has(id) || otherIndicatorVarNames.has(id)) {
      referencedVars.push(id);
    } else {
      unknownVariableErrors.push(`Variable '${id}' not found in this time point`);
    }
  }

  return { syntaxErrors, unknownVariableErrors, warnings, referencedVars };
}

function checkRSyntax(rCode: string): string[] {
  const errors: string[] = [];
  let paren = 0;
  let bracket = 0;
  let brace = 0;
  let inString: '"' | "'" | null = null;
  let inComment = false;

  for (let i = 0; i < rCode.length; i++) {
    const ch = rCode[i];
    const prev = i > 0 ? rCode[i - 1] : "";
    if (inComment) {
      if (ch === "\n") inComment = false;
      continue;
    }
    if (inString) {
      if (ch === inString && prev !== "\\") inString = null;
      continue;
    }
    if (ch === "#") { inComment = true; continue; }
    if (ch === '"' || ch === "'") { inString = ch; continue; }
    if (ch === "(") paren++;
    else if (ch === ")") { paren--; if (paren < 0) { errors.push("Unmatched ')'"); return errors; } }
    else if (ch === "[") bracket++;
    else if (ch === "]") { bracket--; if (bracket < 0) { errors.push("Unmatched ']'"); return errors; } }
    else if (ch === "{") brace++;
    else if (ch === "}") { brace--; if (brace < 0) { errors.push("Unmatched '}'"); return errors; } }
  }

  if (inString) errors.push("Unterminated string literal");
  if (paren > 0) errors.push(`Unclosed '(' (${paren})`);
  if (bracket > 0) errors.push(`Unclosed '[' (${bracket})`);
  if (brace > 0) errors.push(`Unclosed '{' (${brace})`);
  return errors;
}

function checkLoneEquals(rCode: string): string[] {
  const stripped = stripRStringsAndComments(rCode);
  if (/(^|[^=!<>])=(?!=)/.test(stripped)) {
    return [
      "Found '=' — if you meant equality comparison, use '=='. Ignore if this is a named argument or assignment.",
    ];
  }
  return [];
}

const BOOLEAN_FUNCS = new Set([
  "is.na", "is.null", "grepl", "str_detect", "startsWith", "endsWith",
  "isTRUE", "isFALSE", "xor",
]);
const NUMERIC_FUNCS = new Set([
  "sum", "mean", "min", "max", "abs", "sqrt", "log", "exp", "length",
  "nchar", "rowSums", "rowMeans", "round", "ceiling", "floor",
  "which", "ncol", "nrow",
]);
// `as.numeric` / `as.integer` are deliberately NOT classified numeric: coercing a
// comparison to 0/1 (`as.numeric(x == 1)`) is a standard way to write a *binary*
// indicator, so treating them as numeric would mis-flag valid binary code.

// Strips redundant outer parentheses that wrap the whole expression, so
// `(x == 1)` is analysed like `x == 1`.
function stripOuterParens(input: string): string {
  let s = input.trim();
  while (s.startsWith("(") && s.endsWith(")")) {
    let depth = 0;
    let wrapsWhole = true;
    for (let i = 0; i < s.length; i++) {
      if (s[i] === "(") depth++;
      else if (s[i] === ")") {
        depth--;
        if (depth === 0 && i < s.length - 1) { wrapsWhole = false; break; }
      }
    }
    if (wrapsWhole && depth === 0) s = s.slice(1, -1).trim();
    else break;
  }
  return s;
}

// Best-effort inference of the result type of an R expression evaluated per
// facility. R is dynamically typed, so this is heuristic and deliberately
// conservative: it returns "unknown" (→ no warning) whenever it can't be sure
// (e.g. ifelse / case_when, whose type depends on their branches).
export function inferRCodeResultType(
  rCode: string,
): "boolean" | "numeric" | "unknown" {
  const s = stripOuterParens(stripRStringsAndComments(rCode).trim());
  if (!s) return "unknown";

  // Scan for operators at the top level (paren/bracket depth 0).
  let depth = 0;
  let hasComparison = false;
  let hasLogical = false;
  let hasArithmetic = false;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (ch === "(" || ch === "[" || ch === "{") { depth++; continue; }
    if (ch === ")" || ch === "]" || ch === "}") { depth--; continue; }
    if (depth !== 0) continue;
    const two = s.slice(i, i + 2);
    if (two === "==" || two === "!=" || two === "<=" || two === ">=") { hasComparison = true; i++; continue; }
    if (s.slice(i, i + 4) === "%in%") { hasComparison = true; i += 3; continue; }
    if (ch === "<" || ch === ">") { hasComparison = true; continue; }
    if (ch === "&" || ch === "|") { hasLogical = true; continue; }
    if (ch === "+" || ch === "*" || ch === "/" || ch === "^") { hasArithmetic = true; continue; }
    if (ch === "-") {
      const prev = s.slice(0, i).trimEnd().slice(-1);
      if (/[a-zA-Z0-9_.)\]]/.test(prev)) hasArithmetic = true;
    }
  }

  if (hasComparison || hasLogical) return "boolean";
  if (s.startsWith("!") && !s.startsWith("!=")) return "boolean";
  if (hasArithmetic) return "numeric";

  // A single function call wrapping the whole expression.
  const call = s.match(/^([a-zA-Z_][a-zA-Z0-9._]*)\s*\(.*\)$/s);
  if (call) {
    if (BOOLEAN_FUNCS.has(call[1])) return "boolean";
    if (NUMERIC_FUNCS.has(call[1])) return "numeric";
    return "unknown";
  }

  // A bare variable or numeric literal is a numeric value.
  if (/^[a-zA-Z_][a-zA-Z0-9._]*$/.test(s)) return "numeric";
  if (/^-?\d+(\.\d+)?$/.test(s)) return "numeric";
  return "unknown";
}

// Checks whether an r-code expression's inferred result type matches the
// indicator's declared `type`. Returns warning messages (empty when consistent
// or when the type can't be inferred).
export function checkRCodeResultType(
  rCode: string,
  expectedType: "binary" | "numeric",
): string[] {
  if (!rCode.trim()) return [];
  const inferred = inferRCodeResultType(rCode);
  if (inferred === "unknown") return [];
  if (expectedType === "binary" && inferred === "numeric") {
    return [
      "TYPE: indicator is 'binary' but the r-code looks numeric (no top-level comparison/logical). A binary indicator's code should yield TRUE/FALSE, e.g. `var == 1`.",
    ];
  }
  if (expectedType === "numeric" && inferred === "boolean") {
    return [
      "TYPE: indicator is 'numeric' but the r-code looks boolean (a comparison/logical). A numeric indicator's code should yield a number; for a 0/1 flag averaged into a percentage use type 'binary' instead.",
    ];
  }
  return [];
}
