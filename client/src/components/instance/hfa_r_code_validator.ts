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

export function extractRIdentifiers(rCode: string): string[] {
  let cleaned = rCode;
  cleaned = cleaned.replace(/"[^"]*"/g, "");
  cleaned = cleaned.replace(/'[^']*'/g, "");
  cleaned = cleaned.replace(/#[^\n]*/g, "");

  const identifierPattern = /\b[a-zA-Z_][a-zA-Z0-9._]*\b/g;
  const matches = [...cleaned.matchAll(identifierPattern)];

  const variables = matches
    .map((m) => m[0])
    .filter((v) => !R_KEYWORDS.has(v) && !R_COMMON_FUNCTIONS.has(v));

  return [...new Set(variables)].sort();
}

export type RCodeValidationResult = {
  warnings: string[];
  syntaxErrors: string[];
  referencedVars: string[];
};

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

function stripStringsAndComments(rCode: string): string {
  let out = "";
  let inString: '"' | "'" | null = null;
  let inComment = false;
  for (let i = 0; i < rCode.length; i++) {
    const ch = rCode[i];
    const prev = i > 0 ? rCode[i - 1] : "";
    if (inComment) {
      if (ch === "\n") { inComment = false; out += ch; }
      continue;
    }
    if (inString) {
      if (ch === inString && prev !== "\\") inString = null;
      continue;
    }
    if (ch === "#") { inComment = true; continue; }
    if (ch === '"' || ch === "'") { inString = ch; continue; }
    out += ch;
  }
  return out;
}

function checkLoneEquals(rCode: string): string[] {
  const stripped = stripStringsAndComments(rCode);
  if (/(^|[^=!<>])=(?!=)/.test(stripped)) {
    return [
      "Found '=' — if you meant equality comparison, use '=='. Ignore if this is a named argument or assignment.",
    ];
  }
  return [];
}

export function validateRCode(
  rCode: string,
  availableVarNames: Set<string>,
  otherIndicatorVarNames: Set<string>,
): RCodeValidationResult {
  if (!rCode.trim()) {
    return { warnings: [], syntaxErrors: [], referencedVars: [] };
  }

  const syntaxErrors = checkRSyntax(rCode);
  const identifiers = extractRIdentifiers(rCode);
  const warnings: string[] = [...checkLoneEquals(rCode)];
  const referencedVars: string[] = [];

  for (const id of identifiers) {
    if (availableVarNames.has(id) || otherIndicatorVarNames.has(id)) {
      referencedVars.push(id);
    } else {
      warnings.push(`Variable '${id}' not found in this time point`);
    }
  }

  return { warnings, syntaxErrors, referencedVars };
}
