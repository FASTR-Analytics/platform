// Line ranges of a document, as people and models read them. Pure text, so
// the AI entry can name the lines an edit skipped without loading the editor.

// Where a skipped hunk sits, as 1-based line numbers in the CURRENT document
// (the text the user is looking at), so the notice can say which lines were
// left alone. Approximate when concurrent edits straddle the hunk.
export type SkippedRange = { fromLine: number; toLine: number };

// "5", "5–8", "5, 12–14", for embedding in skip notices.
export function formatLineRanges(skipped: readonly SkippedRange[]): string {
  return skipped
    .map((s) =>
      s.fromLine === s.toLine ? `${s.fromLine}` : `${s.fromLine}–${s.toLine}`
    )
    .join(", ");
}
