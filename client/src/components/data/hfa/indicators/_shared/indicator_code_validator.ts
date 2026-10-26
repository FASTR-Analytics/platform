import {
  describeHfaCodeError,
  hfaCodeResultType,
  parseHfaIndicatorCode,
  t3,
} from "lib";

export type IndicatorCodeValidation = {
  syntaxErrors: string[];
  unknownVariableErrors: string[];
  referencedIds: string[];
};

export const EMPTY_INDICATOR_CODE_VALIDATION: IndicatorCodeValidation = {
  syntaxErrors: [],
  unknownVariableErrors: [],
  referencedIds: [],
};

export function hasIndicatorCodeErrors(
  result: IndicatorCodeValidation,
): boolean {
  return (
    result.syntaxErrors.length > 0 || result.unknownVariableErrors.length > 0
  );
}

export function validateIndicatorCode(
  code: string,
  availableVariableIds: Set<string>,
  otherIndicatorIds: Set<string>,
): IndicatorCodeValidation {
  if (!code.trim()) return EMPTY_INDICATOR_CODE_VALIDATION;
  const parsed = parseHfaIndicatorCode(code);
  if (!parsed.ok) {
    return {
      syntaxErrors: [t3(describeHfaCodeError(parsed.error))],
      unknownVariableErrors: [],
      referencedIds: [],
    };
  }

  const unknownVariableErrors: string[] = [];
  const referencedIds: string[] = [];
  const knownIds = [...availableVariableIds, ...otherIndicatorIds];

  for (const id of parsed.identifiers) {
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

  return { syntaxErrors: [], unknownVariableErrors, referencedIds };
}

// Whether the code's result type fits the indicator's declared `type`, for
// the AI's validation. Code that does not parse has no type; its syntax error
// is reported by validateIndicatorCode.
export function checkIndicatorCodeResultType(
  code: string,
  expectedType: "binary" | "numeric",
): string[] {
  if (!code.trim()) return [];
  const parsed = parseHfaIndicatorCode(code);
  if (!parsed.ok) return [];
  const resultType = hfaCodeResultType(parsed.node);
  if (expectedType === "binary" && resultType === "numeric") {
    return [
      "TYPE: indicator is 'binary' but its code is a number, not a yes/no condition. A binary indicator's code should be a condition, e.g. `var == 1`.",
    ];
  }
  if (expectedType === "numeric" && resultType === "boolean") {
    return [
      "TYPE: indicator is 'numeric' but its code is a yes/no condition. A numeric indicator's code should yield a number; for a 0/1 flag averaged into a percentage use type 'binary' instead.",
    ];
  }
  return [];
}
