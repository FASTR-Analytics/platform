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
 *  Maintained by the server room while people type (see
 *  server/collab/authorship.ts) and snapshotted per version so diff views can
 *  attribute each inserted span to its actual author instead of the whole
 *  session's editor set. */
export type AuthorRun = {
  len: number;
  email: string | null;
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

export type DeckVersionDetail = DeckVersionSummary & {
  label: string;
  deckConfig: SlideDeckConfig;
  slides: DeckVersionSlide[];
};
