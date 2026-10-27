import { referencedReportEmbedIds } from "../report-forge/engine/mod.ts";

// One notion of "a figure the reader can see": registered in the report AND
// embedded by a `figure:<id>` token in the body. The two sets drift, because
// `replace_figure` swaps a body token for a fresh id and leaves the old entry
// registered: unreferenced entries are pruned at LOAD, not in session, so that
// an editor undo can bring a token back (a prune on every keystroke would
// delete the figure a missed reference still needs).
//
// A figure outside this set is nobody's: it renders nowhere, no caption the
// reader sees belongs to it, and an edit to it changes nothing on the page. So
// every report figure tool reads through here, which is also what keeps the
// index the model is offered and the figures it may read from disagreeing.
//
// Insertion order is the registry's, not the body's: the index the model reads
// is stable across edits that only move a token.
//
// Generic in the entry: nothing here reads the block, so a caller is never
// pushed into a cast to satisfy it.
export function reportLiveFigures<T>(
  body: string,
  figures: Record<string, T>,
): Record<string, T> {
  const embedded = referencedReportEmbedIds(body).figures;
  return Object.fromEntries(
    Object.entries(figures).filter(([id]) => embedded.has(id)),
  );
}
