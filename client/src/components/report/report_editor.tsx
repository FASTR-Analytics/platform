import { createEffect, onCleanup, onMount } from "solid-js";
import { EditorView, keymap } from "@codemirror/view";
import { Compartment, EditorState } from "@codemirror/state";
import { basicSetup } from "codemirror";
import { markdown } from "@codemirror/lang-markdown";
import { yCollab, yUndoManagerKeymap } from "y-codemirror.next";
import type { Awareness } from "y-protocols/awareness";
import type * as Y from "yjs";
import type { FigureBlock, ImageBlock } from "lib";
import type { ReportEditorSelection } from "~/components/project_ai/types";
import { embedWidgets, type EmbedResolver } from "./figure_widget_extension";

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
  // Insert an embed token on its own line at the current cursor.
  insertEmbedOnNewLine: (token: string) => void;
  // Replace the document with `body` via a minimal single-region change (used
  // when accepting a staged AI edit; under live collab the small change merges
  // with concurrent peer typing instead of clobbering the whole doc).
  setBody: (body: string) => void;
  // Remove an embed's token line (used when deleting a figure/image).
  removeEmbedToken: (kind: "figure" | "image", id: string) => void;
  // Change an embed's caption (the markdown alt text in its token).
  setEmbedCaption: (
    kind: "figure" | "image",
    id: string,
    caption: string,
  ) => void;
  // Current text selection / cursor (surfaced to the AI).
  getSelection: () => ReportEditorSelection;
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
  ref?: (api: ReportEditorApi) => void;
};

export function ReportEditor(p: Props) {
  let parent!: HTMLDivElement;
  let view: EditorView | undefined;
  let scrollRAF = 0;
  let lastCenterKey = "";
  let ro: ResizeObserver | undefined;
  let bindKey = "";
  const centerCompartment = new Compartment();

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
  function buildView(collab: { yText: Y.Text; awareness: Awareness } | undefined) {
    const prevScroll = view?.scrollDOM.scrollTop;
    const prevSel = view?.state.selection.main;
    view?.destroy();
    view = new EditorView({
      doc: collab ? collab.yText.toString() : p.body,
      parent,
      extensions: [
        // yCollab's per-user undo takes precedence over basicSetup's keymap.
        ...(collab ? [keymap.of([...yUndoManagerKeymap])] : []),
        basicSetup,
        markdown(),
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
        embedWidgets(resolver),
        EditorView.updateListener.of((u) => {
          if (u.docChanged) p.onBodyChange(u.state.doc.toString());
        }),
        ...(collab ? [yCollab(collab.yText, collab.awareness)] : []),
      ],
    });
    lastCenterKey = "";
    applyCenterTheme();
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
  }

  function insertEmbedOnNewLine(token: string) {
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

  // Minimal single-region replace (prefix/suffix walk, same idea as the CRDT
  // syncText): under yCollab this becomes a small mergeable Y.Text edit, so an
  // AI accept doesn't clobber a peer's concurrent typing or move their caret.
  function setBody(next: string) {
    if (!view) return;
    const cur = view.state.doc.toString();
    if (cur === next) return;
    const maxPre = Math.min(cur.length, next.length);
    let pfx = 0;
    while (pfx < maxPre && cur[pfx] === next[pfx]) pfx++;
    let sfx = 0;
    while (
      sfx < maxPre - pfx &&
      cur[cur.length - 1 - sfx] === next[next.length - 1 - sfx]
    ) {
      sfx++;
    }
    view.dispatch({
      changes: {
        from: pfx,
        to: cur.length - sfx,
        insert: next.slice(pfx, next.length - sfx),
      },
    });
  }

  function findTokenLine(kind: "figure" | "image", id: string) {
    if (!view) return undefined;
    const idx = view.state.doc.toString().indexOf(`(${kind}:${id})`);
    if (idx < 0) return undefined;
    return view.state.doc.lineAt(idx);
  }

  function removeEmbedToken(kind: "figure" | "image", id: string) {
    if (!view) return;
    const line = findTokenLine(kind, id);
    if (!line) return;
    const to = Math.min(view.state.doc.length, line.to + 1);
    view.dispatch({ changes: { from: line.from, to } });
  }

  function setEmbedCaption(
    kind: "figure" | "image",
    id: string,
    caption: string,
  ) {
    if (!view) return;
    const line = findTokenLine(kind, id);
    if (!line) return;
    const safe = caption
      .replace(/[[\]\n\r]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    view.dispatch({
      changes: {
        from: line.from,
        to: line.to,
        insert: `![${safe}](${kind}:${id})`,
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
    bindKey = `${collab ? "collab" : "plain"}:${p.canEdit()}`;
    buildView(collab);

    p.ref?.({
      insertEmbedOnNewLine,
      setBody,
      removeEmbedToken,
      setEmbedCaption,
      getSelection,
      refresh,
      getTopLine,
      scrollToLine,
      isAtBottom,
      scrollToBottom,
    });
  });

  // Rebuild when the collab binding appears (plain -> live upgrade shortly
  // after open) or the edit permission flips (permissions can arrive late).
  createEffect(() => {
    const collab = p.collab?.();
    const key = `${collab ? "collab" : "plain"}:${p.canEdit()}`;
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
    if (scrollRAF) cancelAnimationFrame(scrollRAF);
    ro?.disconnect();
    view?.destroy(); // removes scrollDOM (and its listener) with it
  });

  return <div ref={parent} class="bg-base-100 h-full w-full" />;
}
