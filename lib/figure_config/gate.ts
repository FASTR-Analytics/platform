import { type FigureConfigProblem, problemKey } from "./validate.ts";

// The one check at the editor's write. Every press is taken into the draft;
// the draft is written to its host, and rows are fetched for it, only while it
// has no problem that the config the document holds lacks. So a change that
// adds a problem is not saved, and a stored figure that already has a problem
// can still be edited.
export function isDraftWritable(
  draftProblems: readonly FigureConfigProblem[],
  documentProblems: readonly FigureConfigProblem[],
): boolean {
  const held = new Set(documentProblems.map(problemKey));
  return draftProblems.every((p) => held.has(problemKey(p)));
}
