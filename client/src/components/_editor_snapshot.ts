import { unwrap } from "solid-js/store";
import type { SlideDeckConfig } from "lib";

// What an editor overlay freezes at open — and, more importantly, what it does
// NOT (D16 / §2.5).
//
// The PackageScope is deliberately absent: editors read it LIVE from the T1
// products row, and the authoring context from the immutable T2 cache keyed by
// that live runId. Reattaching a product or changing its scope while an editor
// is open therefore moves the figure data AND the metric/preset catalog
// together, and lights the D4 stale badges. Freezing the pair here is exactly
// the bug that would hide.
//
// What must not move under an open slide editor is the DECK's own presentation
// config: the editor renders and measures the page against it, so a concurrent
// deck-level style change would re-flow the canvas under the user's cursor
// mid-edit. That is the one thing snapshotted.
export function snapshotForSlideEditor(p: { deckConfig: SlideDeckConfig }) {
  return {
    deckConfigSnapshot: structuredClone(unwrap(p.deckConfig)),
  };
}
