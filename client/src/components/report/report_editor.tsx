import { createEffect, onCleanup, onMount } from "solid-js";
import { EditorView, keymap } from "@codemirror/view";
import { Compartment, EditorState } from "@codemirror/state";
import { basicSetup } from "codemirror";
import { markdown } from "@codemirror/lang-markdown";
import { html } from "@codemirror/lang-html";
import { redo as cmRedo, undo as cmUndo } from "@codemirror/commands";
import { yCollab, yUndoManagerKeymap } from "y-codemirror.next";
import {
  attachSelectionNameHover,
  yCaretHygiene,
  darkMarkdownExtensions,
} from "~/components/_shared/collab_markdown_editor";
import type { Awareness } from "y-protocols/awareness";
import * as Y from "yjs";
import {
  type EditResult,
  fastrContainerStackUpTo,
  fastrOpenFenceOnLine,
  type FastrFencePatch,
  type FastrInkRole,
  type FastrOpenFence,
  type FigureBlock,
  findReportEmbeds,
  type ImageBlock,
  type InlineMarkState,
  inlineMarkStateAt,
  insertLinkEdit,
  type ReportEmbedRef,
  type ReportFormat,
  rewriteReportEmbedToken,
  setHeadingLevelEdit,
  setInlineRoleEdit,
  tableSnippet,
  toggleInlineDelimiters,
  toggleLinePrefixEdit,
  updateContainerFenceLine,
} from "lib";
import type { ReportEditorSelection } from "~/components/project_ai/types";
import { embedWidgets, type EmbedResolver } from "./figure_widget_extension";
import {
  FM_LIVE_SCOPE_CLASS,
  livePreviewExtensions,
} from "./live_preview_extension";
import { fastrContainerFences } from "./fastr_fence_extension";
import { rebaseProposedEdits, type SkippedRange } from "./rebase_edits";
import { darkMode } from "~/state/t4_ui";

const clamp = (n: number, lo: number, hi: number) =>
  Math.max(lo, Math.min(hi, n));

// Single source of truth for the editor's readable writing column and the pane
// width it needs to show that column at full size. Shared by the CM theme
// (.cm-content max-width), the Split pane cap (index.tsx), and the centering
// threshold — so they can't drift apart.
export const EDITOR_COLUMN_MAX_REM = 56;
// The line-number gutter adds ~4rem; the pane must be this wide for the column
// to reach EDITOR_COLUMN_MAX_REM.
export const EDITOR_PANE_MAX_REM = EDITOR_COLUMN_MAX_REM + 4; // 60

// The writing column is width-capped in every mode; this toggles whether the
// leftover space is split (centered) or kept on the right (left-aligned). When
// centered, padRight reserves space on the right *inside* the scroller (the
// scrollbar stays at the element edge), shifting the centered column left so it
// lines up with content centered in a wider container (e.g. past a sidebar).
function centerTheme(centered: boolean, padRight: number) {
  return EditorView.theme({
    ".cm-scroller": centered
      ? { justifyContent: "center", paddingRight: `${padRight}px` }
      : {},
  });
}

export type ReportEditorApi = {
  // Insert text as its own block at the current cursor — an embed token, or
  // a FASTR Markdown block snippet from the format guide.
  insertBlockOnNewLine: (token: string) => void;
  // Apply an accepted AI proposal by REBASING it over whatever changed while
  // it was under review: the proposal's hunks (baseBody -> newBody) are mapped
  // onto the live doc; hunks whose text a collaborator concurrently edited are
  // skipped (returned with their current-doc line ranges) so nobody's typing
  // is overwritten. With no concurrent edits this degenerates to a plain
  // minimal replace.
  applyRebasedBody: (
    baseBody: string,
    newBody: string,
  ) => {
    applied: number;
    skipped: SkippedRange[];
    // 0-based line of the first applied change (current-doc coordinates,
    // pre-transaction) — the caller scrolls there; undefined if nothing
    // applied.
    firstAppliedLine: number | undefined;
  };
  // Remove an embed's token line (used when deleting a figure/image).
  removeEmbedToken: (kind: "figure" | "image", id: string) => void;
  // Change an embed's caption (the token's caption/alt; the token's other
  // attributes survive).
  setEmbedCaption: (
    kind: "figure" | "image",
    id: string,
    caption: string,
  ) => void;
  // Current text selection / cursor (surfaced to the AI).
  getSelection: () => ReportEditorSelection;
  // ── FASTR Markdown toolbar ────────────────────────────────────────────────
  // Rewrite the open fence at `line` (1-based); undefined or "" deletes a key.
  // The line is explicit rather than "wherever the cursor is" so the toolbar
  // can tone an OUTER block while the caret sits inside one of its cards.
  setBlockAttrs: (line: number, patch: FastrFencePatch) => void;
  // Create the `:::report` page-setup header (first line) when the document
  // lacks one — the toolbar's Page setup control targets it from anywhere.
  insertPageSetup: (patch: FastrFencePatch) => void;
  // Wrap/unwrap the selection: ("**","**"), ("*","*"), ("`","`").
  toggleInlineMark: (before: string, after: string) => void;
  // `[phrase]{.danger}`; undefined clears the mark around the selection.
  setInlineRole: (role: FastrInkRole | undefined) => void;
  // 0 = paragraph, 1..6 = heading, across every line the selection touches.
  setHeadingLevel: (level: number) => void;
  toggleLinePrefix: (kind: "bullet" | "ordered" | "quote") => void;
  insertLink: () => void;
  insertTable: (cols: number, rows: number) => void;
  // Undo/redo the body — the toolbar's counterpart to the editor's own
  // Ctrl+Z/Ctrl+Shift+Z (per-user under collab, local history otherwise).
  undo: () => void;
  redo: () => void;
  // Re-measure (e.g. after the editor was hidden during a diff review).
  refresh: () => void;
  // Fractional 0-based source line at the viewport top (for scroll sync), or
  // undefined if it can't be read (no view / zero height / off-screen).
  getTopLine: () => number | undefined;
  // Scroll so a fractional 0-based source line sits at the viewport top.
  scrollToLine: (line: number) => void;
  // True only when the editor is scrollable AND scrolled to its end (for
  // bottom-edge sync; a non-scrollable editor returns false).
  isAtBottom: () => boolean;
  // Scroll to the very bottom.
  scrollToBottom: () => void;
};

type Props = {
  body: string;
  // Fixed for the editor's lifetime (a report's format never changes).
  format: ReportFormat;
  figures: Record<string, FigureBlock>;
  images: Record<string, ImageBlock>;
  assetUrl: (imgFile: string) => string;
  onBodyChange: (body: string) => void;
  onSelectEmbed: (kind: "figure" | "image", id: string) => void;
  selectedId: () => string | undefined;
  // rAF-throttled notification that the editor's scroll position changed.
  onScroll?: () => void;
  // Center the writing column (Edit mode); left-align it otherwise (Split).
  centered: () => boolean;
  // When centered, px reserved on the right so the column lines up with content
  // centered past the left sidebar (matches the View preview placement).
  centerPadRight?: () => number;
  // Live-collab binding: when present, the editor binds CodeMirror to the
  // shared Y.Text via yCollab (remote carets/selections, character merging,
  // per-user undo). The view is rebuilt once when this appears.
  collab?: () => { yText: Y.Text; awareness: Awareness } | undefined;
  // Edit permission: false renders the editor read-only (in BOTH modes). Under
  // collab this is required — a view-only user's keystrokes would otherwise
  // enter the shared doc, be rejected server-side, and silently diverge them.
  canEdit: () => boolean;
  // FASTR Markdown only: where the caret is, structurally, so the toolbar can
  // show the block it is inside and that block's own controls. Fires on cursor
  // moves as well as edits, but only when something the toolbar renders has
  // actually changed.
  onContextChange?: (ctx: ReportBlockContext) => void;
  // FASTR only: Edit mode's Obsidian-style surface — regions render as their
  // true themed HTML, inline syntax conceals, the editor paints the document
  // page. Toggled at runtime (Edit <-> Split) via a compartment, so flipping it
  // preserves undo, scroll, selection and the collab binding.
  livePreview?: () => boolean;
  ref?: (api: ReportEditorApi) => void;
};

export type ReportBlockContext = {
  // Blocks ENCLOSING the caret line, innermost last.
  stack: FastrOpenFence[];
  // The open fence ON the caret line itself. Leaf blocks (`stat`, `report`)
  // carry no closing fence and so never appear on the stack — this is the only
  // way the toolbar can reach them.
  fenceHere: FastrOpenFence | undefined;
  // 1-based.
  line: number;
  hasSelection: boolean;
  marks: InlineMarkState;
};

export function ReportEditor(p: Props) {
  let parent!: HTMLDivElement;
  let view: EditorView | undefined;
  let detachSelectionHover: (() => void) | undefined;
  let scrollRAF = 0;
  let lastCenterKey = "";
  let ro: ResizeObserver | undefined;
  let bindKey = "";
  // The per-user undo manager driving the collab view (set only while bound).
  // yCollab would create this itself; we pass our own so the toolbar buttons
  // can pop the SAME stack the Ctrl+Z keymap does. The yUndoManager plugin
  // registers the sync origin on it, so it tracks this user's typing only.
  // Without collab the view falls back to basicSetup's local history.
  let yUndoMgr: Y.UndoManager | undefined;
  const centerCompartment = new Compartment();
  const livePreviewCompartment = new Compartment();
  let lastLiveKey = "";

  // Pad the centered column to the right by the sidebar width so it lines up with
  // the View preview — but only when the pane is wide enough to fit the column
  // plus that pad; below that threshold drop the pad to 0 so a tight pane uses
  // its full width. Reconfigures the compartment only when the value changes.
  function applyCenterTheme() {
    if (!view) return;
    const centered = p.centered();
    const padMax = p.centerPadRight?.() ?? 0;
    let pad = 0;
    if (centered && padMax > 0) {
      const remPx =
        parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
      const columnMax = EDITOR_COLUMN_MAX_REM * remPx;
      pad = view.scrollDOM.clientWidth >= columnMax + padMax ? padMax : 0;
    }
    const key = `${centered}:${pad}`;
    if (key === lastCenterKey) return;
    lastCenterKey = key;
    view.dispatch({
      effects: centerCompartment.reconfigure(centerTheme(centered, pad)),
    });
    // The live-preview sheet ignores the scroller padding (it would shrink the
    // sheet's content area and paint the ground asymmetrically) and instead
    // re-centres itself shifted left by half the pad — same final position.
    view.scrollDOM.style.setProperty("--fm-center-pad", `${pad}px`);
  }

  // Read the registries/selection live (Solid props are reactive getters) so a
  // newly inserted figure resolves immediately and the selected ring stays live.
  const resolver: EmbedResolver = {
    getFigure: (id) => p.figures[id],
    getImage: (id) => p.images[id],
    assetUrl: (imgFile) => p.assetUrl(imgFile),
    onSelectEmbed: (kind, id) => p.onSelectEmbed(kind, id),
    getSelectedId: () => p.selectedId(),
  };

  // rAF-throttle scroll events so getTopLine reads at most once per frame.
  const onScroll = () => {
    if (scrollRAF) return;
    scrollRAF = requestAnimationFrame(() => {
      scrollRAF = 0;
      p.onScroll?.();
    });
  };

  // (Re)build the EditorView. Called on mount (plain or collab, whichever the
  // props say) and again when the collab binding appears or the edit permission
  // flips — preserving scroll position and (clamped) selection across the swap.
  // Known cost: the local undo history resets on a rebuild.
  // Fixed for the editor's lifetime, like the format it reads.
  const isFastr = p.format === "fastr";

  function liveExtensions(
    on: boolean,
    collab: { yText: Y.Text; awareness: Awareness } | undefined,
  ) {
    return on
      ? livePreviewExtensions(resolver, collab)
      : [...darkMarkdownExtensions(), embedWidgets(resolver, p.format)];
  }

  // Runtime Edit <-> Split flip, mirroring applyCenterTheme: reconfigure the
  // compartment and toggle the document-surface scope class, never rebuild.
  function applyLivePreview(on: boolean) {
    const key = String(on);
    if (!view || key === lastLiveKey) return;
    lastLiveKey = key;
    parent.classList.toggle(FM_LIVE_SCOPE_CLASS, on);
    const collab = p.collab?.();
    view.dispatch({
      effects: livePreviewCompartment.reconfigure(liveExtensions(on, collab)),
    });
  }

  function buildView(collab: { yText: Y.Text; awareness: Awareness } | undefined) {
    const prevScroll = view?.scrollDOM.scrollTop;
    const prevSel = view?.state.selection.main;
    detachSelectionHover?.();
    detachSelectionHover = undefined;
    // Destroy the view BEFORE its undo manager — the plugin's destroy hook
    // deregisters itself from the manager it was built with.
    view?.destroy();
    yUndoMgr?.destroy();
    const undoMgr = collab ? new Y.UndoManager(collab.yText) : undefined;
    yUndoMgr = undoMgr;
    view = new EditorView({
      doc: collab ? collab.yText.toString() : p.body,
      parent,
      extensions: [
        // yCollab's per-user undo takes precedence over basicSetup's keymap.
        ...(collab ? [keymap.of([...yUndoManagerKeymap])] : []),
        basicSetup,
        ...(isFastr ? [] : darkMarkdownExtensions()),
        // FASTR Markdown is markdown to CodeMirror; the `:::` fences get
        // their own line decoration on top.
        p.format === "html" ? html() : markdown(),
        ...(p.format === "fastr" ? fastrContainerFences() : []),
        ...(p.canEdit()
          ? []
          : [EditorState.readOnly.of(true), EditorView.editable.of(false)]),
        EditorView.lineWrapping,
        // Fill the container so the editor (and its line-number gutter) extends
        // the full height even when the document is short (panther fullHeight).
        EditorView.theme({
          "&.cm-editor": { height: "100%" },
          // Fixed editor text size, independent of page size.
          "&": { fontSize: "15px" },
          // Code-editor idiom: gutter on the left, text left-aligned full-width,
          // scrollbar at the pane edge. The gutter anchors the column so it
          // doesn't float.
          ".cm-scroller": { overflow: "auto" },
          ".cm-content, .cm-gutter": { minHeight: "100%" },
          // Cap the writing column (text + figure widgets, which render inside
          // .cm-content) at a readable max width, left-aligned after the gutter —
          // leftover space falls on the right; the scrollbar stays at the pane
          // edge. flexGrow:0 stops CM stretching it; flexShrink:1 lets it narrow
          // in a tight split pane.
          ".cm-content": {
            paddingTop: "1rem",
            paddingBottom: "1rem",
            flexGrow: 0,
            flexShrink: 1,
            width: "100%",
            maxWidth: `${EDITOR_COLUMN_MAX_REM}rem`,
          },
        }),
        centerCompartment.of(centerTheme(p.centered(), 0)),
        // For fastr, this slot toggles between the live-preview surface (Edit)
        // and the classic source view (Split) via a compartment, so flipping
        // modes preserves undo, scroll, selection and the collab binding. The
        // dark markdown highlighter lives in the OFF branch: live preview is a
        // light DOCUMENT even in a dark app. Other formats keep the plain
        // embed widgets, untouched.
        ...(isFastr
          ? [livePreviewCompartment.of(
            liveExtensions(p.livePreview?.() ?? false, collab),
          )]
          : [embedWidgets(resolver, p.format)]),
        EditorView.updateListener.of((u) => {
          if (u.docChanged) p.onBodyChange(u.state.doc.toString());
          // Push, not poll: a timer would still be wrong between ticks, and
          // this is exact and free. Guarded inside emitContext.
          if (isFastr && (u.docChanged || u.selectionSet)) {
            emitContext(u.state, u.docChanged);
          }
        }),
        ...(collab && undoMgr
          ? [
            yCollab(collab.yText, collab.awareness, { undoManager: undoMgr }),
            // Clears the caret on blur/teardown — yCollab alone never does
            // (see yCaretHygiene).
            yCaretHygiene(collab.yText, collab.awareness),
          ]
          : []),
      ],
    });
    lastCenterKey = "";
    applyCenterTheme();
    // Hovering a peer's selection highlight names them (caret-flag style).
    if (collab) {
      detachSelectionHover = attachSelectionNameHover(view.dom, collab.awareness);
    }
    view.scrollDOM.addEventListener("scroll", onScroll, { passive: true });
    ro?.observe(view.scrollDOM);
    if (prevScroll !== undefined) view.scrollDOM.scrollTop = prevScroll;
    if (prevSel) {
      const len = view.state.doc.length;
      view.dispatch({
        selection: {
          anchor: Math.min(prevSel.anchor, len),
          head: Math.min(prevSel.head, len),
        },
      });
    }
    // So the toolbar has a context on first paint and after every rebuild —
    // the selection dispatch above does not always produce a selectionSet.
    if (isFastr) {
      const liveOn = p.livePreview?.() ?? false;
      lastLiveKey = String(liveOn);
      parent.classList.toggle(FM_LIVE_SCOPE_CLASS, liveOn);
      ctxKey = "";
      emitContext(view.state, true);
    }
  }

  function insertBlockOnNewLine(token: string) {
    if (!view) return;
    const sel = view.state.selection.main;
    const line = view.state.doc.lineAt(sel.from);
    // Place the token as its own block: break out of the current line, then
    // leave a trailing blank line for continued typing.
    const atLineStart = sel.from === line.from;
    const prefix = atLineStart ? "" : "\n\n";
    const insert = `${prefix}${token}\n\n`;
    const at = atLineStart ? line.from : sel.from;
    view.dispatch({
      changes: { from: at, insert },
      selection: { anchor: at + insert.length },
      scrollIntoView: true,
    });
    view.focus();
  }

  // ── FASTR Markdown toolbar ─────────────────────────────────────────────────

  function setBlockAttrs(lineNumber: number, patch: FastrFencePatch) {
    if (!view || lineNumber < 1 || lineNumber > view.state.doc.lines) return;
    const line = view.state.doc.line(lineNumber);
    const next = updateContainerFenceLine(line.text, patch);
    if (next === undefined || next === line.text) return;
    // One line, one transaction — under yCollab this becomes a delete+insert
    // confined to that line, so it merges with a peer typing anywhere else.
    // Deliberately no view.focus(): the user is still inside a popover picking
    // a second option, and pulling focus back mid-interaction closes it.
    view.dispatch({ changes: { from: line.from, to: line.to, insert: next } });
  }

  function insertPageSetup(patch: FastrFencePatch) {
    if (!view) return;
    const line = updateContainerFenceLine(":::report", patch) ?? ":::report";
    view.dispatch({ changes: { from: 0, to: 0, insert: `${line}\n` } });
  }

  // Every text action lands as ONE transaction, which is what makes the
  // offsets (all measured pre-transaction) valid and the collab ops minimal.
  function applyEdit(r: EditResult) {
    if (!view || r.changes.length === 0) return;
    view.dispatch({
      changes: r.changes,
      selection: r.selection,
      scrollIntoView: true,
    });
    view.focus();
  }

  function selectionRange(): { doc: string; from: number; to: number } | undefined {
    if (!view) return undefined;
    const sel = view.state.selection.main;
    return { doc: view.state.doc.toString(), from: sel.from, to: sel.to };
  }

  function toggleInlineMark(before: string, after: string) {
    const s = selectionRange();
    if (s) applyEdit(toggleInlineDelimiters(s.doc, s.from, s.to, before, after));
  }

  function setInlineRole(role: FastrInkRole | undefined) {
    const s = selectionRange();
    if (s) applyEdit(setInlineRoleEdit(s.doc, s.from, s.to, role));
  }

  function setHeadingLevel(level: number) {
    const s = selectionRange();
    if (s) applyEdit(setHeadingLevelEdit(s.doc, s.from, s.to, level));
  }

  function toggleLinePrefix(kind: "bullet" | "ordered" | "quote") {
    const s = selectionRange();
    if (s) applyEdit(toggleLinePrefixEdit(s.doc, s.from, s.to, kind));
  }

  function insertLink() {
    const s = selectionRange();
    if (s) applyEdit(insertLinkEdit(s.doc, s.from, s.to));
  }

  function insertTable(cols: number, rows: number) {
    insertBlockOnNewLine(tableSnippet(cols, rows));
  }

  // The stack walk is cheap (a regex per line, and iterLines never
  // materialises the document) but the SIGNAL write downstream is not: a fresh
  // context object per arrow key re-renders the toolbar continuously while
  // typing and can close an open popover. So cache the walk by line, and emit
  // only when something the toolbar actually renders has changed.
  let ctxStackLine = -1;
  let ctxStack: FastrOpenFence[] = [];
  let ctxKey = "";

  function emitContext(state: EditorState, docChanged: boolean) {
    if (!p.onContextChange) return;
    const sel = state.selection.main;
    const line = state.doc.lineAt(sel.head);
    if (docChanged || line.number !== ctxStackLine) {
      ctxStackLine = line.number;
      ctxStack = fastrContainerStackUpTo(state.doc.iterLines(1, line.number));
    }
    const fenceHere = fastrOpenFenceOnLine(line.text, line.number);
    const marks = inlineMarkStateAt(
      line.text,
      sel.from - line.from,
      sel.to - line.from,
    );
    // The stack's ATTRS are part of the key, not just its shape: re-toning an
    // enclosing block while the caret sits in one of its children changes only
    // that outer fence, so a name+line key would suppress the update and leave
    // the toolbar showing the tone you just replaced.
    const key = `${line.number}|${!sel.empty}|${line.text}|${
      JSON.stringify(marks)
    }|${
      ctxStack
        .map((f) => `${f.name}${f.line}${JSON.stringify(f.attrs)}`)
        .join(">")
    }`;
    if (key === ctxKey) return;
    ctxKey = key;
    const ctx: ReportBlockContext = {
      stack: ctxStack,
      fenceHere,
      line: line.number,
      hasSelection: !sel.empty,
      marks,
    };
    // Out of the CodeMirror update. A synchronous signal write here re-renders
    // the toolbar mid-update, and anything in that render that touches the
    // view throws "Calls to EditorView.update are not allowed while an update
    // is in progress".
    queueMicrotask(() => p.onContextChange?.(ctx));
  }

  // See the ReportEditorApi doc comment. Reads the LIVE doc (not the body
  // signal) so the rebase is correct even if the mirror momentarily lags; all
  // surviving hunks land in one atomic transaction (positions pre-transaction),
  // which under yCollab becomes small mergeable Y.Text ops.
  function applyRebasedBody(baseBody: string, newBody: string) {
    if (!view) {
      return {
        applied: 0,
        skipped: [] as SkippedRange[],
        firstAppliedLine: undefined,
      };
    }
    const currentBody = view.state.doc.toString();
    const { changes, skipped } = rebaseProposedEdits(
      baseBody,
      newBody,
      currentBody,
    );
    // Changes are disjoint + ascending, so [0] is the topmost applied hunk.
    // Read the line BEFORE dispatching — coordinates are pre-transaction.
    const firstAppliedLine = changes.length > 0
      ? view.state.doc.lineAt(changes[0].from).number - 1
      : undefined;
    if (changes.length > 0) view.dispatch({ changes });
    return { applied: changes.length, skipped, firstAppliedLine };
  }

  // First token of (kind, id) in the live doc, with its line.
  function findToken(
    kind: "figure" | "image",
    id: string,
  ): { ref: ReportEmbedRef; ownsLine: boolean } | undefined {
    if (!view) return undefined;
    const doc = view.state.doc;
    const ref = findReportEmbeds(doc.toString(), p.format).find(
      (r) => r.kind === kind && r.id === id,
    );
    if (!ref) return undefined;
    const line = doc.lineAt(ref.start);
    const ownsLine = line.text.trim() === ref.raw.trim() &&
      doc.lineAt(ref.end).number === line.number;
    return { ref, ownsLine };
  }

  // A token that owns its line goes with the line; an inline token goes alone.
  function removeEmbedToken(kind: "figure" | "image", id: string) {
    if (!view) return;
    const found = findToken(kind, id);
    if (!found) return;
    if (found.ownsLine) {
      const line = view.state.doc.lineAt(found.ref.start);
      const to = Math.min(view.state.doc.length, line.to + 1);
      view.dispatch({ changes: { from: line.from, to } });
      return;
    }
    view.dispatch({ changes: { from: found.ref.start, to: found.ref.end } });
  }

  function setEmbedCaption(
    kind: "figure" | "image",
    id: string,
    caption: string,
  ) {
    if (!view) return;
    const found = findToken(kind, id);
    if (!found) return;
    view.dispatch({
      changes: {
        from: found.ref.start,
        to: found.ref.end,
        insert: rewriteReportEmbedToken(found.ref, { caption }, p.format),
      },
    });
  }

  function getSelection() {
    if (!view) return { empty: true, fromLine: 1, toLine: 1, text: "" };
    const sel = view.state.selection.main;
    const doc = view.state.doc;
    return {
      empty: sel.empty,
      fromLine: doc.lineAt(sel.from).number,
      toLine: doc.lineAt(sel.to).number,
      text: view.state.sliceDoc(sel.from, sel.to),
    };
  }

  // Pops the same stack as Ctrl+Z — the collab manager when bound (this user's
  // ops only), basicSetup's local history otherwise. Focus follows so the next
  // keystroke continues in the editor (the click moved focus to the button).
  // Covers the body text only: figure/image registry changes aren't in either
  // history — same as the keyboard.
  function undo() {
    if (!view) return;
    if (yUndoMgr) yUndoMgr.undo();
    else cmUndo(view);
    view.focus();
  }

  function redo() {
    if (!view) return;
    if (yUndoMgr) yUndoMgr.redo();
    else cmRedo(view);
    view.focus();
  }

  function refresh() {
    view?.requestMeasure();
  }

  // Fractional 0-based source line at the viewport top. Coordinate spaces must
  // not be mixed: BlockInfo.top is in *document* space, while getBoundingClientRect
  // and posAtCoords are *screen* space. view.documentTop bridges them
  // (screen Y of document top), so block screen-top = documentTop + block.top.
  function getTopLine(): number | undefined {
    if (!view) return undefined;
    const scroller = view.scrollDOM;
    const rect = scroller.getBoundingClientRect();
    if (rect.height === 0) return undefined;
    const topY = rect.top;
    // x at the content's horizontal centre avoids the line-number gutter (where
    // posAtCoords can return null). `false` => estimated, never-null position.
    const x = rect.left + scroller.clientWidth / 2;
    const pos = view.posAtCoords({ x, y: topY + 1 }, false);
    const block = view.lineBlockAt(pos);
    const blockTopClient = view.documentTop + block.top;
    const frac = block.height > 0
      ? clamp((topY - blockTopClient) / block.height, 0, 1)
      : 0;
    // Line from the block (not raw pos): robust when a tall figure widget makes
    // posAtCoords snap to a neighbouring line.
    const line0 = view.state.doc.lineAt(block.from).number - 1;
    return line0 + frac;
  }

  // Inverse of getTopLine: scroll so the fractional 0-based line sits at the
  // viewport top. documentPadding.top is added so this round-trips with
  // getTopLine (scrollTop 0 shows the content padding, not the first line).
  function scrollToLine(line: number) {
    if (!view) return;
    // Line 0 → the editor's very top (scrollTop 0), past its own top padding,
    // so it sits at the top together with the preview (not paddingTop down).
    if (line <= 0) {
      view.scrollDOM.scrollTop = 0;
      return;
    }
    const doc = view.state.doc;
    const floor = Math.floor(line);
    const lineNum = clamp(floor + 1, 1, doc.lines);
    const block = view.lineBlockAt(doc.line(lineNum).from);
    const frac = line - floor;
    view.scrollDOM.scrollTop =
      view.documentPadding.top + block.top + frac * block.height;
  }

  function isAtBottom(): boolean {
    if (!view) return false;
    const s = view.scrollDOM;
    // Scrollable AND at the end (a non-scrollable editor isn't "at bottom").
    return s.scrollHeight > s.clientHeight + 1 &&
      s.scrollTop + s.clientHeight >= s.scrollHeight - 2;
  }

  function scrollToBottom() {
    if (view) view.scrollDOM.scrollTop = view.scrollDOM.scrollHeight;
  }

  onMount(() => {
    // Re-evaluate the centering pad threshold whenever the scroller resizes.
    ro = new ResizeObserver(() => applyCenterTheme());
    const collab = p.collab?.();
    bindKey = `${collab ? "collab" : "plain"}:${p.canEdit()}:${darkMode()}`;
    buildView(collab);

    p.ref?.({
      insertBlockOnNewLine,
      applyRebasedBody,
      removeEmbedToken,
      setEmbedCaption,
      getSelection,
      setBlockAttrs,
      insertPageSetup,
      toggleInlineMark,
      setInlineRole,
      setHeadingLevel,
      toggleLinePrefix,
      insertLink,
      insertTable,
      undo,
      redo,
      refresh,
      getTopLine,
      scrollToLine,
      isAtBottom,
      scrollToBottom,
    });
  });

  // Edit <-> Split flips the live-preview surface without a rebuild.
  createEffect(() => {
    const on = p.livePreview?.() ?? false;
    if (isFastr) applyLivePreview(on);
  });

  // Rebuild when the collab binding appears (plain -> live upgrade shortly
  // after open), the edit permission flips (permissions can arrive late), or
  // the theme toggles (darkMarkdownExtensions is baked into the extension
  // list and must be re-evaluated in this tracked scope).
  createEffect(() => {
    const collab = p.collab?.();
    const key = `${collab ? "collab" : "plain"}:${p.canEdit()}:${darkMode()}`;
    if (!view) return; // pre-mount; onMount builds with current values
    if (key === bindKey) return;
    bindKey = key;
    buildView(collab);
  });

  // Re-evaluate centering when the mode (centered) or pad prop changes; the
  // ResizeObserver handles width changes.
  createEffect(() => {
    p.centered();
    p.centerPadRight?.();
    applyCenterTheme();
  });

  onCleanup(() => {
    detachSelectionHover?.();
    if (scrollRAF) cancelAnimationFrame(scrollRAF);
    ro?.disconnect();
    view?.destroy(); // removes scrollDOM (and its listener) with it
    yUndoMgr?.destroy(); // after the view — see buildView
    yUndoMgr = undefined;
  });

  return <div ref={parent} class="bg-base-100 h-full w-full" />;
}
