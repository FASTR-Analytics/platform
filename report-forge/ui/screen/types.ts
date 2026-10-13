// The contract between a host and the mounted editor: what the host hands
// in, and what the editor asks of it. Everything but the document itself is
// optional, and the editor simply does without what a host leaves out (no
// figures menu, no PDF, no upload button).

import type { Component, JSX } from "solid-js";
import type { Awareness } from "y-protocols/awareness";
import type * as Y from "yjs";
import type { FastrReportTemplate } from "../../engine/fastr_report_templates.ts";
import type {
  FastrChartPalette,
  FastrReportTheme,
  FastrThemeColorOverride,
} from "../../engine/report_fastr_themes.ts";
import type { ReportForgeLanguage } from "../../engine/i18n.ts";
import type { FigureViewProps } from "../editor/embed_resolver.ts";
import type { RenderReportPdf } from "../exports/paged_pdf.ts";
import type { FigureInkTheme } from "../figure_ink.ts";

// ── The document's settings ──────────────────────────────────────────────────

// The document's look. Everything else about a document is in its body.
export type ReportForgeSettings = {
  theme: FastrReportTheme;
  // A palette that overrides the theme's own colours, and the id of the
  // saved palette it came from, when the host keeps a library of them.
  colors?: FastrThemeColorOverride;
  paletteId?: string;
  // The template the document was started from (metadata: the body carries
  // the template's skeleton, never a reference to it).
  template?: FastrReportTemplate;
  // False ONLY on a new document nobody has chosen a look for yet: the
  // editor then offers the theme picker once, on open, and sets this true.
  themeChosen?: boolean;
};

// A saved palette the host offers in the theme picker beside the themes.
export type ReportPalette = {
  id: string;
  label: string;
  description?: string;
  colors: FastrThemeColorOverride | null;
};

// ── Images ───────────────────────────────────────────────────────────────────

// Where images live. `imgFile` is the host's own reference to an image (a
// path, a storage key, a URL already): the editor stores it in the image
// record and asks the host to turn it into a URL when it draws.
export type ReportForgeImageHost = {
  assetUrl: (imgFile: string) => string;
  // Store a file the user picked from their machine; resolves with its
  // reference. With this alone a host has working images.
  upload?: (file: File) => Promise<string>;
  // Or run the host's own upload flow from start to finish (its file dialog,
  // its progress): resolves with the stored image's reference, or undefined
  // when the user backs out. Wins over `upload` when both are given.
  requestUpload?: () => Promise<string | undefined>;
  // Images already stored that the user may choose from, newest wherever
  // the host puts them. A reactive read: an upload landing shows up at once.
  library?: () => string[];
  // Replace the whole insert-image picker with the host's own.
  pick?: () => Promise<{ imgFile: string; alt: string } | undefined>;
  // Logos the host ships with (a `:::logos` row offers them beside the
  // library). `onDark` previews a light logo on a dark ground.
  logos?: { value: string; label: string; onDark?: boolean }[];
};

// ── Figures ──────────────────────────────────────────────────────────────────

// Figures are the host's entirely: the editor lays out a box for each
// `figure:<id>` token and the host fills it. A host with no figures leaves
// this out, and the editor offers none.
export type ReportForgeFigureHost = {
  // The ids of the document's figures. A reactive read.
  ids: () => readonly string[];
  // Draws one figure in the editor (see FigureViewProps).
  View: Component<FigureViewProps>;
  // The pixel box a figure's export raster has, when known: the editor
  // gives the live figure the same box before it draws. Call the editor's
  // `refreshEmbedSizes` (ReportForgeApi) when a size lands.
  size?: (id: string) => { width: number; height: number } | undefined;
  // The figure's pixels for an export, on a transparent ground, in the given
  // ink, FIGURE_EXPORT_WIDTH_PX wide.
  rasterize?: (
    id: string,
    ink: FigureInkTheme,
    palette: FastrChartPalette,
  ) => Promise<{ url: string; width: number; height: number } | undefined>;
  // "Insert > Visualization": the host creates or picks a figure and
  // resolves with its id and a caption; the editor inserts the token.
  insert?: () => Promise<{ id: string; caption: string } | undefined>;
  // Extra buttons in the toolbar while a figure is selected (Edit, Replace),
  // before the editor's own (size, delete).
  controls?: (id: string) => JSX.Element;
};

// ── Slots ────────────────────────────────────────────────────────────────────

// An extra entry in one of the editor's menus. Entries of one `menu` appear
// together, after the editor's own, in the order given.
export type ReportForgeMenuItem = {
  menu: "file";
  label: string;
  onClick: () => void;
  // A rule above this entry, to group what follows.
  dividerBefore?: boolean;
};

// ── The mounted editor ───────────────────────────────────────────────────────

export type ReportForgeProps = {
  // The document. `body` is FASTR Markdown; the host stores each part and
  // hands back what it stored. The editor never fetches or saves.
  body: string;
  // `origin` says who made the change: "user" for typing (this user's, or a
  // collaborator's arriving through `collab`), "program" for a body the
  // editor applied itself (an accepted proposal, a template, applyBody).
  onBodyChange: (body: string, origin: "user" | "program") => void;
  settings: ReportForgeSettings;
  // May reject (a save that failed): the editor then keeps the old look and
  // shows the error.
  onSettingsChange: (settings: ReportForgeSettings) => void | Promise<void>;
  images?: Record<string, { type: "image"; imgFile: string }>;
  onImagesChange?: (
    images: Record<string, { type: "image"; imgFile: string }>,
  ) => void | Promise<void>;

  // The document's name: export file names, the PDF's running footer, the
  // title a template opens with.
  title?: string;
  // When the document was last saved, in the host's words ("14:02"): shown
  // in Page > Document details.
  lastSaved?: string;
  // False renders the document read-only, with no menus or toolbar.
  canEdit?: boolean;
  language?: ReportForgeLanguage;

  // Where images live. Absent, the editor offers no images or logos.
  imageHost?: ReportForgeImageHost;
  // The host's figures. Absent, the editor offers none.
  figures?: ReportForgeFigureHost;
  // Saved palettes for the theme picker, and (optionally) the host's own
  // editor for one: `edit(undefined)` creates a new palette.
  palettes?: {
    list: () => Promise<ReportPalette[]>;
    edit?: (palette: ReportPalette | undefined) => Promise<void>;
  };
  // Prints the paged document to a PDF (the package's server entry is the
  // printer). Absent, Download offers Word and .html only.
  renderPdf?: RenderReportPdf;

  // Real-time editing: bind the editor to a shared Y.Text. The host owns
  // the transport and the awareness; the editor owns carets, per-user undo
  // and caret hygiene. `onBodyChange` still fires on every change, local or
  // remote.
  collab?: { yText: Y.Text; awareness: Awareness };

  // Slots.
  menuItems?: ReportForgeMenuItem[];
  // The trailing end of the menu row (presence avatars, a status chip).
  menuTrailing?: JSX.Element;
  // A strip above the editing surface, full width (a host's banners).
  banner?: JSX.Element;
  // A panel docked on the right of the editing surface (an assistant).
  dockedPanel?: JSX.Element;
  // Whether the outline starts closed, and a place to remember the choice.
  outlineClosed?: boolean;
  onOutlineClosedChange?: (closed: boolean) => void;

  // The embed the user has selected, as it changes (a host showing presence).
  onSelectedEmbedChange?: (
    embed: { kind: "figure" | "image"; id: string } | undefined,
  ) => void;

  // The editor's imperative handle, once it has mounted.
  ref?: (api: ReportForgeApi) => void;
};

// What a host can ask of a mounted editor.
export type ReportForgeApi = {
  // The text selection, or the caret when nothing is selected.
  getSelection: () =>
    | { empty: boolean; fromLine: number; toLine: number; text: string }
    | undefined;
  // Show the user a proposed new body as an accept/reject diff over the
  // current one. On accept, the change is applied rebased over anything
  // typed since (by this user or a collaborator); hunks that collide with
  // newer edits are skipped and returned.
  proposeEdit: (
    proposal: { newBody: string; summary?: string; signal?: AbortSignal },
  ) => Promise<
    | { accepted: false }
    | { accepted: true; skipped: { fromLine: number; toLine: number }[] }
  >;
  // Replace the body programmatically (rebased as above, no dialog).
  applyBody: (
    baseBody: string,
    newBody: string,
  ) => Promise<{ skipped: { fromLine: number; toLine: number }[] }>;
  // Insert a token or a block on a new line at the caret.
  insertBlock: (text: string) => void;
  // Where the editor has put the page breaks, with the body it laid out.
  getPageLayout: () =>
    | {
      body: string;
      pageStarts: number[];
      paraSplits: { line: number; rows: number[] }[];
      figureFits: { line: number; height: number }[];
      gapStretches: { line: number; marginTop: number }[];
    }
    | undefined;
  // A figure's size landed (ReportForgeFigureHost.size): re-box it now.
  refreshEmbedSizes: () => void;
  // Select an embed (the toolbar shows its controls) or clear the selection.
  selectEmbed: (
    embed: { kind: "figure" | "image"; id: string } | undefined,
  ) => void;
  selectedEmbed: () => { kind: "figure" | "image"; id: string } | undefined;
  // Open the editor's own dialogs.
  openDownload: () => void;
  openThemePicker: () => void;
  // Move the view to a 1-based source line.
  scrollToLine: (line: number) => void;
  undo: () => void;
  redo: () => void;
};
