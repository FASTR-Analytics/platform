import {
  extractRIdentifiers,
  HFA_CODE_FUNCTIONS,
  normalizeRLogicalOperators,
  stripRStringsAndComments,
  t3,
  unknownRFunctions,
} from "lib";

export type RCodeValidationResult = {
  syntaxErrors: string[];
  unknownVariableErrors: string[];
  warnings: string[];
  referencedIds: string[];
};

export function hasRCodeErrors(result: RCodeValidationResult): boolean {
  return (
    result.syntaxErrors.length > 0 || result.unknownVariableErrors.length > 0
  );
}

export function validateRCode(
  rCode: string,
  availableVariableIds: Set<string>,
  otherIndicatorIds: Set<string>,
): RCodeValidationResult {
  if (!rCode.trim()) {
    return {
      syntaxErrors: [],
      unknownVariableErrors: [],
      warnings: [],
      referencedIds: [],
    };
  }

  // Validate exactly what the server will splice into R: normalise first, so a
  // typo like `x &and y` (which normalises to the scalar `x && y`) is caught by
  // checkVectorizedLogical instead of passing green and failing at run time.
  const normalized = normalizeRLogicalOperators(rCode);
  const syntaxErrors = [
    ...checkRSyntax(normalized),
    ...checkVectorizedLogical(normalized),
    ...checkFunctions(normalized),
  ];
  const identifiers = extractRIdentifiers(normalized);
  const warnings: string[] = [...checkLoneEquals(normalized)];
  const unknownVariableErrors: string[] = [];
  const referencedIds: string[] = [];
  const knownIds = [...availableVariableIds, ...otherIndicatorIds];

  for (const id of identifiers) {
    if (availableVariableIds.has(id) || otherIndicatorIds.has(id)) {
      referencedIds.push(id);
    } else {
      const lower = id.toLowerCase();
      const sameCase = knownIds.find((k) => k.toLowerCase() === lower);
      unknownVariableErrors.push(
        sameCase
          ? t3({
            en:
              `Variable '${id}' not found in this time point. Did you mean '${sameCase}'?`,
            fr:
              `Variable « ${id} » introuvable dans ce point temporel. Vouliez-vous dire « ${sameCase} » ?`,
            pt:
              `Variável '${id}' não encontrada neste ponto temporal. Queria dizer '${sameCase}'?`,
          })
          : t3({
            en: `Variable '${id}' not found in this time point`,
            fr: `Variable « ${id} » introuvable dans ce point temporel`,
            pt: `Variável '${id}' não encontrada neste ponto temporal`,
          }),
      );
    }
  }

  return { syntaxErrors, unknownVariableErrors, warnings, referencedIds };
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
    if (ch === "#") {
      inComment = true;
      continue;
    }
    if (ch === '"' || ch === "'") {
      inString = ch;
      continue;
    }
    if (ch === "(") paren++;
    else if (ch === ")") {
      paren--;
      if (paren < 0) {
        errors.push(unmatched(")"));
        return errors;
      }
    } else if (ch === "[") bracket++;
    else if (ch === "]") {
      bracket--;
      if (bracket < 0) {
        errors.push(unmatched("]"));
        return errors;
      }
    } else if (ch === "{") brace++;
    else if (ch === "}") {
      brace--;
      if (brace < 0) {
        errors.push(unmatched("}"));
        return errors;
      }
    }
  }

  if (inString) {
    errors.push(
      t3({
        en: "Unterminated string literal",
        fr: "Chaîne de caractères non terminée",
        pt: "Cadeia de caracteres não terminada",
      }),
    );
  }
  if (paren > 0) errors.push(unclosed("(", paren));
  if (bracket > 0) errors.push(unclosed("[", bracket));
  if (brace > 0) errors.push(unclosed("{", brace));
  return errors;
}

function unmatched(close: string): string {
  return t3({
    en: `Unmatched '${close}'`,
    fr: `« ${close} » sans ouverture`,
    pt: `'${close}' sem abertura`,
  });
}

function unclosed(open: string, count: number): string {
  return t3({
    en: `Unclosed '${open}' (${count})`,
    fr: `« ${open} » non fermé (${count})`,
    pt: `'${open}' não fechado (${count})`,
  });
}

// `&&`/`||` pass R's parser but fail at run time: indicator code runs vectorised
// over every facility inside a dplyr `case_when`, where the scalar `&&`/`||`
// error. `AND`/`OR` are accepted (normalised to `&`/`|`), but `&&`/`||` are a
// distinct mistake we flag rather than silently rewrite. Checked on the
// string/comment-stripped code so `str_detect(x, "a && b")` is not misflagged.
function checkVectorizedLogical(rCode: string): string[] {
  const stripped = stripRStringsAndComments(rCode);
  const errors: string[] = [];
  if (stripped.includes("&&")) errors.push(scalarOperator("&&", "&"));
  if (stripped.includes("||")) errors.push(scalarOperator("||", "|"));
  return errors;
}

function scalarOperator(scalar: string, vectorised: string): string {
  return t3({
    en:
      `Use '${vectorised}' instead of '${scalar}': indicator code runs across all facilities at once, so '${scalar}' will fail when the module runs.`,
    fr:
      `Utilisez « ${vectorised} » au lieu de « ${scalar} » : le code de l'indicateur s'exécute sur tous les établissements à la fois, donc « ${scalar} » échouera à l'exécution du module.`,
    pt:
      `Use '${vectorised}' em vez de '${scalar}': o código do indicador corre sobre todos os estabelecimentos de uma vez, por isso '${scalar}' falhará quando o módulo correr.`,
  });
}

function checkFunctions(rCode: string): string[] {
  const accepted = HFA_CODE_FUNCTIONS.join(", ");
  return unknownRFunctions(rCode).map((name) =>
    t3({
      en:
        `'${name}' is not an accepted function. The code accepts: ${accepted}`,
      fr:
        `« ${name} » n'est pas une fonction acceptée. Le code accepte : ${accepted}`,
      pt: `'${name}' não é uma função aceite. O código aceita: ${accepted}`,
    })
  );
}

function checkLoneEquals(rCode: string): string[] {
  const stripped = stripRStringsAndComments(rCode);
  if (/(^|[^=!<>])=(?!=)/.test(stripped)) {
    return [
      t3({
        en:
          "Found '=': if you meant an equality comparison, use '=='. Ignore if this is a named argument or an assignment.",
        fr:
          "« = » trouvé : pour une comparaison d'égalité, utilisez « == ». Ignorez s'il s'agit d'un argument nommé ou d'une affectation.",
        pt:
          "Encontrado '=': para uma comparação de igualdade, use '=='. Ignore se for um argumento nomeado ou uma atribuição.",
      }),
    ];
  }
  return [];
}

const BOOLEAN_FUNCS = new Set(["is.na"]);
const NUMERIC_FUNCS = new Set(["abs", "round", "ceiling", "floor"]);
// `as.numeric`, `pmin` and `pmax` are deliberately NOT classified numeric:
// coercing a comparison to 0/1 (`as.numeric(x == 1)`, `pmax(a == 1, b == 1)`)
// is a standard way to write a *binary* indicator, so treating them as numeric
// would mis-flag valid binary code.

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
        if (depth === 0 && i < s.length - 1) {
          wrapsWhole = false;
          break;
        }
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
  const s = stripOuterParens(
    stripRStringsAndComments(normalizeRLogicalOperators(rCode)).trim(),
  );
  if (!s) return "unknown";

  // Scan for operators at the top level (paren/bracket depth 0).
  let depth = 0;
  let hasComparison = false;
  let hasLogical = false;
  let hasArithmetic = false;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (ch === "(" || ch === "[" || ch === "{") {
      depth++;
      continue;
    }
    if (ch === ")" || ch === "]" || ch === "}") {
      depth--;
      continue;
    }
    if (depth !== 0) continue;
    const two = s.slice(i, i + 2);
    if (two === "==" || two === "!=" || two === "<=" || two === ">=") {
      hasComparison = true;
      i++;
      continue;
    }
    if (s.slice(i, i + 4) === "%in%") {
      hasComparison = true;
      i += 3;
      continue;
    }
    if (ch === "<" || ch === ">") {
      hasComparison = true;
      continue;
    }
    if (ch === "&" || ch === "|") {
      hasLogical = true;
      continue;
    }
    if (ch === "+" || ch === "*" || ch === "/" || ch === "^") {
      hasArithmetic = true;
      continue;
    }
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
