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
  referencedVars: string[];
};

export function validateRCode(
  rCode: string,
  availableVarNames: Set<string>,
  otherIndicatorVarNames: Set<string>,
): RCodeValidationResult {
  if (!rCode.trim()) {
    return { warnings: [], referencedVars: [] };
  }

  const identifiers = extractRIdentifiers(rCode);
  const warnings: string[] = [];
  const referencedVars: string[] = [];

  for (const id of identifiers) {
    if (availableVarNames.has(id) || otherIndicatorVarNames.has(id)) {
      referencedVars.push(id);
    } else {
      warnings.push(`Variable '${id}' not found in this time point`);
    }
  }

  return { warnings, referencedVars };
}
