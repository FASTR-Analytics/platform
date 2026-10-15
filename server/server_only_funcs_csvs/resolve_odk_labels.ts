import type { ParsedXlsForm, XlsFormQuestion } from "./parse_xlsform.ts";

const MAX_UNRESOLVED_VALUES_REPORTED = 10;

// The HFA header convention: a header is a question id, or an ODK question
// path whose last segment is one, matched exactly, else to the one question
// whose id equals it ignoring case (a survey firm's export can re-case the
// form's names).
export function findXlsFormQuestionForHeader(
  xlsForm: ParsedXlsForm,
  rawHeader: string,
): XlsFormQuestion | undefined {
  const questionId = rawHeader.substring(rawHeader.lastIndexOf("/") + 1);
  const exact = xlsForm.questions.get(questionId);
  if (exact) {
    return exact;
  }
  const lower = questionId.toLowerCase();
  const caseless = [...xlsForm.questions.values()].filter((q) =>
    q.questionId.toLowerCase() === lower
  );
  return caseless.length === 1 ? caseless[0] : undefined;
}

// A code's choice label, or undefined for a code the choice list lacks.
export type OdkLabelLookup = (code: string) => string | undefined;

// Present only when the header matches a select_one question with a choice
// list: only those cells hold codes.
export function odkLabelLookupForHeader(
  xlsForm: ParsedXlsForm,
  rawHeader: string,
): OdkLabelLookup | undefined {
  const question = findXlsFormQuestionForHeader(xlsForm, rawHeader);
  if (!question || question.type !== "select_one" || !question.listName) {
    return undefined;
  }
  const choices = xlsForm.choiceLists.get(question.listName);
  if (!choices) {
    return undefined;
  }
  const codeToLabel = new Map(choices.map((c) => [c.value, c.label]));
  return (code) => codeToLabel.get(code);
}

export type OdkLabelResolutionTally<C extends string> = {
  column: C;
  resolvedCount: number;
  unresolvedCount: number;
  unresolvedValues: string[];
};

// Replaces codes with labels and counts, per column, the codes resolved and
// the codes that stay raw, keeping the first distinct unresolved ones. A
// column several headers feed (a correction column beside its original) is
// counted once, under the column.
export function createOdkLabelResolver<C extends string>(): {
  resolve: (
    column: C,
    lookup: OdkLabelLookup | undefined,
    value: string,
  ) => string;
  tallies: () => OdkLabelResolutionTally<C>[];
} {
  const tallies = new Map<
    C,
    { resolvedCount: number; unresolvedCount: number; unresolved: Set<string> }
  >();
  return {
    resolve: (column, lookup, value) => {
      if (!lookup) {
        return value;
      }
      let tally = tallies.get(column);
      if (!tally) {
        tally = { resolvedCount: 0, unresolvedCount: 0, unresolved: new Set() };
        tallies.set(column, tally);
      }
      if (!value) {
        return value;
      }
      const label = lookup(value);
      if (label === undefined) {
        tally.unresolvedCount++;
        if (tally.unresolved.size < MAX_UNRESOLVED_VALUES_REPORTED) {
          tally.unresolved.add(value);
        }
        return value;
      }
      tally.resolvedCount++;
      return label;
    },
    tallies: () =>
      [...tallies].map(([column, t]) => ({
        column,
        resolvedCount: t.resolvedCount,
        unresolvedCount: t.unresolvedCount,
        unresolvedValues: [...t.unresolved],
      })),
  };
}
