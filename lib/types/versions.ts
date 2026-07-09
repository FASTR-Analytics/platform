import type { FigureBlock } from "./_figure_bundle.ts";
import type { ImageBlock, Slide, SlideDeckConfig } from "./slides.ts";

// =============================================================================
// Version history (reports + slide decks)
// =============================================================================
//
// One version = one editing session's end state (full content snapshot) plus
// the set of users who edited during that window. Versions are captured
// server-side by the version tracker (see server/collab/version_tracker.ts)
// and by the restore routes; the client only ever reads/restores them.

export type VersionEditor = {
  email: string;
  name: string;
};

/** Run-length-encoded per-character authorship of a report body: `len`
 *  characters written by `email` (null = unknown — text that predates the
 *  ledger, was edited outside a live collab room, or came from a restore).
 *  Runs with `deletedBy` present are TOMBSTONES: characters deleted at this
 *  position, kept as ghosts so diff views can name the exact deleter
 *  (deletedBy null = deleter unknown, e.g. a restore's rewrite). Live runs
 *  concatenated equal the body; tombstones sit where the text used to be.
 *  Maintained by the server room while people type (see
 *  server/collab/authorship.ts) and snapshotted per version so diff views can
 *  attribute each changed span to its actual author instead of the whole
 *  session's editor set. */
export type AuthorRun = {
  len: number;
  email: string | null;
  deletedBy?: string | null;
  /** Tombstones only: the deleted text itself (len === text.length). Lets the
   *  diff views align the previous version against the "ghost document"
   *  (body + deletions spliced back in) for per-character deleter attribution
   *  that survives word-aligned diff boundaries and typed-then-deleted
   *  ghosts. */
  text?: string;
};

export type ReportVersionSummary = {
  id: string;
  createdAt: string;
  editors: VersionEditor[];
  /** Total stored content size (body + figures + images JSON), for observability. */
  sizeBytes: number;
  /** Set when this version was created by restoring another version. */
  restoredFromVersionId: string | null;
};

export type ReportVersionDetail = ReportVersionSummary & {
  label: string;
  body: string;
  figures: Record<string, FigureBlock>;
  images: Record<string, ImageBlock>;
  /** Per-character authorship of `body` at snapshot time; null when the
   *  ledger wasn't available (pre-feature version, non-collab edits). */
  bodyAuthors: AuthorRun[] | null;
};

/** One step in a version's lineage (body only — no figure payloads): the
 *  compare view diffs adjacent steps to attribute each changed section to the
 *  editing session that introduced it. */
export type ReportVersionLineageStep = {
  id: string;
  createdAt: string;
  editors: VersionEditor[];
  body: string;
  bodyAuthors: AuthorRun[] | null;
};

/** A slide as frozen inside a deck version (original id kept for restore). */
export type DeckVersionSlide = {
  id: string;
  sortOrder: number;
  config: Slide;
};

export type DeckVersionSummary = {
  id: string;
  createdAt: string;
  editors: VersionEditor[];
  slideCount: number;
  sizeBytes: number;
  restoredFromVersionId: string | null;
};

/** Per-slide attribution for one deck editing session (emails; names resolve
 *  client-side): who edited/added/removed each slide, plus deck-level ops.
 *  Maintained in memory by server/collab/deck_session_ledger.ts and frozen
 *  per version — null for pre-feature versions or after a server restart
 *  (the UI falls back to the session's editor set). */
export type DeckSlideEditors = {
  slides: Record<
    string,
    {
      edited?: string[];
      added?: string[];
      removed?: string[];
      /** Element-level detail for collab edits: element key (see
       *  observeSlideDocElements in lib/collab/slide_crdt.ts — "field:<name>",
       *  "block:<id>", "layout", "props") -> emails of everyone who touched
       *  the element. */
      elements?: Record<string, string[]>;
      /** Deck-side deletion "tombstones": exactly who ADDED an element
       *  (children-map key insert), who structurally REMOVED it (key delete),
       *  and who DELETED TEXT inside it (Y.Text delete ops) — lets the version
       *  diff say "removed by Bob" instead of falling back to the whole
       *  element-editor set. Subsets of `elements`. */
      elementsAdded?: Record<string, string[]>;
      elementsRemoved?: Record<string, string[]>;
      elementsTextDeleted?: Record<string, string[]>;
    }
  >;
  settings?: string[];
  reordered?: string[];
};

export type DeckVersionDetail = DeckVersionSummary & {
  label: string;
  deckConfig: SlideDeckConfig;
  slides: DeckVersionSlide[];
  slideEditors: DeckSlideEditors | null;
};
