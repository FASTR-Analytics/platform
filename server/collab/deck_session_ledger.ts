// =============================================================================
// Per-slide attribution ledger for deck editing sessions
// =============================================================================
//
// Deck versions attribute WHO edited per session; this ledger records WHICH
// SLIDE each of them touched — the deck equivalent of the report body's
// per-character authorship. Every slide-level write path reports here (collab
// room edits via the slide room deps, HTTP routes for create/duplicate/
// delete/move/update, deck settings/label), and the accumulated map is frozen
// into the deck version when it is written (deck_versions.slide_editors),
// then cleared — a version's ledger covers exactly "changes since the
// previous version".
//
// In-memory only (there is no deck-level checkpoint row to persist it to): a
// server restart loses the open session's per-slide detail and those versions
// fall back to session-level attribution — same accepted class as the
// tracker's crash window. Best-effort by design.

import type { DeckSlideEditors } from "lib";

type SlideTouch = {
  edited?: Set<string>;
  added?: Set<string>;
  removed?: Set<string>;
};

type DeckLedger = {
  slides: Map<string, SlideTouch>;
  settings: Set<string>;
  reordered: Set<string>;
};

const ledgers = new Map<string, DeckLedger>();

// Element-level touches from the slide-room observer, keyed per SLIDE (the
// observer doesn't know the deck; slide ids are globally unique). Drained
// alongside the deck ledger for the slides it recorded. Each element keeps
// classified buckets so deletions attribute exactly (deck-side tombstones):
// everyone who touched it, plus who added/removed it and who deleted text
// inside it.
type ElementTouch = {
  touched: Set<string>;
  added?: Set<string>;
  removed?: Set<string>;
  textDeleted?: Set<string>;
};
const elementTouches = new Map<string, Map<string, ElementTouch>>();

// Runaway-session backstops: beyond these, new entries are dropped (they fall
// back to coarser attribution).
const SLIDE_CAP = 500;
const ELEMENTS_PER_SLIDE_CAP = 100;

function key(projectId: string, deckId: string): string {
  return `${projectId}::deck::${deckId}`;
}

function slideKey(projectId: string, slideId: string): string {
  return `${projectId}::slide::${slideId}`;
}

function ledgerFor(projectId: string, deckId: string): DeckLedger {
  const k = key(projectId, deckId);
  let ledger = ledgers.get(k);
  if (!ledger) {
    ledger = { slides: new Map(), settings: new Set(), reordered: new Set() };
    ledgers.set(k, ledger);
  }
  return ledger;
}

function touchFor(ledger: DeckLedger, slideId: string): SlideTouch | null {
  let touch = ledger.slides.get(slideId);
  if (!touch) {
    if (ledger.slides.size >= SLIDE_CAP) return null;
    touch = {};
    ledger.slides.set(slideId, touch);
  }
  return touch;
}

function record(
  projectId: string,
  deckId: string,
  slideId: string,
  kind: keyof SlideTouch,
  email: string,
): void {
  const touch = touchFor(ledgerFor(projectId, deckId), slideId);
  if (!touch) return;
  (touch[kind] ??= new Set()).add(email);
}

export function recordSlideEdited(
  projectId: string,
  deckId: string,
  slideId: string,
  email: string,
): void {
  record(projectId, deckId, slideId, "edited", email);
}

export function recordSlideAdded(
  projectId: string,
  deckId: string,
  slideId: string,
  email: string,
): void {
  record(projectId, deckId, slideId, "added", email);
}

export function recordSlideRemoved(
  projectId: string,
  deckId: string,
  slideId: string,
  email: string,
): void {
  record(projectId, deckId, slideId, "removed", email);
}

/** Element-level touch from the slide-room observer ("field:header",
 *  "block:<id>", "layout", "props"). Keyed per slide — merged into the deck
 *  ledger's entry for that slide at drain time. `kind` classifies the op:
 *  "touched" (any edit), "added"/"removed" (structural), "textDeleted". */
export function recordSlideElementTouch(
  projectId: string,
  slideId: string,
  elementKey: string,
  email: string,
  kind: keyof ElementTouch = "touched",
): void {
  const k = slideKey(projectId, slideId);
  let elements = elementTouches.get(k);
  if (!elements) {
    elements = new Map();
    elementTouches.set(k, elements);
  }
  let touch = elements.get(elementKey);
  if (!touch) {
    if (elements.size >= ELEMENTS_PER_SLIDE_CAP) return;
    touch = { touched: new Set() };
    elements.set(elementKey, touch);
  }
  // Every classified op is also a touch, so `elements` stays the superset.
  touch.touched.add(email);
  if (kind !== "touched") (touch[kind] ??= new Set()).add(email);
}

export function recordDeckSettingsEdited(
  projectId: string,
  deckId: string,
  email: string,
): void {
  ledgerFor(projectId, deckId).settings.add(email);
}

export function recordDeckReordered(
  projectId: string,
  deckId: string,
  email: string,
): void {
  ledgerFor(projectId, deckId).reordered.add(email);
}

/** Freeze + clear the deck's open session ledger — called when a version is
 *  written. Returns null when nothing was recorded. */
export function drainDeckLedger(
  projectId: string,
  deckId: string,
): DeckSlideEditors | null {
  const k = key(projectId, deckId);
  const ledger = ledgers.get(k);
  if (!ledger) return null;
  ledgers.delete(k);
  const slides: DeckSlideEditors["slides"] = {};
  for (const [slideId, touch] of ledger.slides) {
    // Pull (and clear) the slide's element-level touches along with it.
    const sk = slideKey(projectId, slideId);
    const elementMap = elementTouches.get(sk);
    elementTouches.delete(sk);
    const elements: Record<string, string[]> = {};
    const elementsAdded: Record<string, string[]> = {};
    const elementsRemoved: Record<string, string[]> = {};
    const elementsTextDeleted: Record<string, string[]> = {};
    for (const [elementKey, et] of elementMap ?? []) {
      elements[elementKey] = [...et.touched];
      if (et.added) elementsAdded[elementKey] = [...et.added];
      if (et.removed) elementsRemoved[elementKey] = [...et.removed];
      if (et.textDeleted) {
        elementsTextDeleted[elementKey] = [...et.textDeleted];
      }
    }
    const nonEmpty = (r: Record<string, string[]>) =>
      Object.keys(r).length > 0;
    slides[slideId] = {
      ...(touch.edited ? { edited: [...touch.edited] } : {}),
      ...(touch.added ? { added: [...touch.added] } : {}),
      ...(touch.removed ? { removed: [...touch.removed] } : {}),
      ...(nonEmpty(elements) ? { elements } : {}),
      ...(nonEmpty(elementsAdded) ? { elementsAdded } : {}),
      ...(nonEmpty(elementsRemoved) ? { elementsRemoved } : {}),
      ...(nonEmpty(elementsTextDeleted) ? { elementsTextDeleted } : {}),
    };
  }
  const result: DeckSlideEditors = {
    slides,
    ...(ledger.settings.size > 0 ? { settings: [...ledger.settings] } : {}),
    ...(ledger.reordered.size > 0 ? { reordered: [...ledger.reordered] } : {}),
  };
  if (
    Object.keys(slides).length === 0 && !result.settings && !result.reordered
  ) {
    return null;
  }
  return result;
}

/** Merge a drained ledger back — used when the version insert that consumed
 *  it failed, so the attribution retries with the next write. */
export function restoreDeckLedger(
  projectId: string,
  deckId: string,
  drained: DeckSlideEditors | null,
): void {
  if (!drained) return;
  const ledger = ledgerFor(projectId, deckId);
  for (const [slideId, touch] of Object.entries(drained.slides)) {
    for (const kind of ["edited", "added", "removed"] as const) {
      for (const email of touch[kind] ?? []) {
        record(projectId, deckId, slideId, kind, email);
      }
    }
    const elementKinds = [
      ["elements", "touched"],
      ["elementsAdded", "added"],
      ["elementsRemoved", "removed"],
      ["elementsTextDeleted", "textDeleted"],
    ] as const;
    for (const [field, kind] of elementKinds) {
      for (const [elementKey, emails] of Object.entries(touch[field] ?? {})) {
        for (const email of emails) {
          recordSlideElementTouch(projectId, slideId, elementKey, email, kind);
        }
      }
    }
  }
  for (const email of drained.settings ?? []) ledger.settings.add(email);
  for (const email of drained.reordered ?? []) ledger.reordered.add(email);
}
