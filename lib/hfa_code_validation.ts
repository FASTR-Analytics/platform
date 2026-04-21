export function checkRSyntax(rCode: string): string[] {
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
        errors.push("Unmatched ')'");
        return errors;
      }
    } else if (ch === "[") bracket++;
    else if (ch === "]") {
      bracket--;
      if (bracket < 0) {
        errors.push("Unmatched ']'");
        return errors;
      }
    } else if (ch === "{") brace++;
    else if (ch === "}") {
      brace--;
      if (brace < 0) {
        errors.push("Unmatched '}'");
        return errors;
      }
    }
  }

  if (inString) errors.push("Unterminated string literal");
  if (paren > 0) errors.push(`Unclosed '(' (${paren})`);
  if (bracket > 0) errors.push(`Unclosed '[' (${bracket})`);
  if (brace > 0) errors.push(`Unclosed '{' (${brace})`);
  return errors;
}

export type HfaIndicatorValidationState = {
  hasSyntaxError: boolean;
  codeConsistent: boolean;
};

export function computeHfaIndicatorValidationState(
  code: { rCode: string; rFilterCode: string | undefined }[]
): HfaIndicatorValidationState {
  let hasSyntaxError = false;
  for (const c of code) {
    if (c.rCode.trim() && checkRSyntax(c.rCode).length > 0) {
      hasSyntaxError = true;
      break;
    }
    if (c.rFilterCode?.trim() && checkRSyntax(c.rFilterCode).length > 0) {
      hasSyntaxError = true;
      break;
    }
  }

  const nonEmpty = code.filter((c) => c.rCode.trim() || c.rFilterCode?.trim());
  let codeConsistent = true;
  if (nonEmpty.length > 1) {
    const first = nonEmpty[0];
    codeConsistent = nonEmpty.every(
      (c) =>
        c.rCode.trim() === first.rCode.trim() &&
        (c.rFilterCode?.trim() ?? "") === (first.rFilterCode?.trim() ?? "")
    );
  }

  return { hasSyntaxError, codeConsistent };
}
