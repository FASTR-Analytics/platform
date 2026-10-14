import { minimalSetup } from "codemirror";
import { EditorState } from "@codemirror/state";
import { EditorView, keymap } from "@codemirror/view";
import { markdown } from "@codemirror/lang-markdown";
import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { tags } from "@lezer/highlight";
import { yCollab, yUndoManagerKeymap } from "y-codemirror.next";
import type { Awareness } from "y-protocols/awareness";
import * as Y from "yjs";
import { createEffect, onCleanup } from "solid-js";
import { attachSelectionNameHover, yCaretHygiene } from "report-forge";
import { darkMode } from "~/state/t4_ui";

// A CodeMirror markdown/plain editor bound directly to a Y.Text via
// y-codemirror.next. It renders remote collaborators' carets and selections
// (from Yjs awareness) and preserves the local caret through remote edits:
// things a plain <textarea> can't do. Shared by the slide editor (text-block
// body + title/header fields) and the figure editor (caption fields); the
// caller supplies `canEdit`, so this component is decoupled from any one
// permission source.

// The setups bundle defaultHighlightStyle as a FALLBACK highlighter, and its
// markdown token colors assume a light background: the #/-/*/> marks come out
// near-black and vanish on dark bases. In dark mode we add this non-fallback
// highlighter (which then fully replaces the default one; uncovered tags
// inherit the editor's text color). CSS vars keep it in sync with app.css.
const darkMarkdownHighlight = HighlightStyle.define([
  {
    tag: [
      tags.processingInstruction,
      tags.meta,
      tags.punctuation,
      tags.labelName,
      tags.string,
      tags.contentSeparator,
      tags.quote,
    ],
    color: "var(--color-neutral)",
  },
  { tag: tags.heading, fontWeight: "bold" },
  { tag: [tags.link, tags.url], color: "var(--color-primary)" },
  { tag: tags.emphasis, fontStyle: "italic" },
  { tag: tags.strong, fontWeight: "bold" },
  { tag: tags.strikethrough, textDecoration: "line-through" },
  // HTML-format reports (lang-html) — otherwise monochrome in dark mode.
  { tag: [tags.tagName, tags.angleBracket], color: "var(--color-primary)" },
  { tag: tags.attributeName, color: "var(--color-neutral)" },
  { tag: tags.attributeValue, color: "var(--color-success)" },
  { tag: tags.comment, color: "var(--color-neutral)", fontStyle: "italic" },
]);

// Reads the darkMode signal: call inside a tracked scope (the effect that
// builds the EditorView) so a theme toggle rebuilds the editor.
export function darkMarkdownExtensions() {
  return darkMode() ? [syntaxHighlighting(darkMarkdownHighlight)] : [];
}

function buildExtensions(
  yText: Y.Text,
  awareness: Awareness,
  height: string,
  plain: boolean,
  canEdit: boolean,
  undoManager: Y.UndoManager | undefined,
) {
  return [
    // yCollab's per-user undo takes precedence over the base keymap.
    keymap.of([...yUndoManagerKeymap]),
    minimalSetup,
    ...darkMarkdownExtensions(),
    ...(plain ? [] : [markdown()]),
    // View-only users get a read-only editor: their keystrokes would otherwise
    // flow into the local doc, be rejected server-side ("No edit permission"),
    // and silently diverge this client from every peer.
    ...(canEdit
      ? []
      : [EditorState.readOnly.of(true), EditorView.editable.of(false)]),
    EditorView.lineWrapping,
    EditorView.theme({
      "&": {
        fontSize: "var(--text-sm)",
        border: "1px solid rgba(0,0,0,0.15)",
        borderRadius: "6px",
        backgroundColor: "#fff",
      },
      "&.cm-focused": { outline: "none" },
      ".cm-scroller": {
        overflow: "auto",
        maxHeight: height,
        fontFamily: "inherit",
      },
      ".cm-content": { minHeight: height, padding: "8px" },
    }),
    // With a host-supplied manager the binding registers its sync origin on
    // it, joining the host's per-user stack; otherwise yCollab creates a
    // private per-editor stack. Either way yUndoManagerKeymap above pops it.
    undoManager
      ? yCollab(yText, awareness, { undoManager })
      : yCollab(yText, awareness),
    yCaretHygiene(yText, awareness),
  ];
}

export function CollabMarkdownEditor(p: {
  yText: Y.Text;
  awareness: Awareness;
  /** Whether this user may edit: false renders a read-only editor. */
  canEdit: boolean;
  /** Mirror the text into the host's working state so it re-renders as you type. */
  onTextChange: (markdown: string) => void;
  height?: string;
  /** Plain text (no markdown highlighting): used for title/header/caption fields. */
  plain?: boolean;
  /** Join the host editor's per-user undo stack instead of a private
   *  per-textbox one: the host's undo buttons then cover typing here, and
   *  in-editor Ctrl+Z pops that same stack. See SlideSession.undoManager. */
  undoManager?: Y.UndoManager;
}) {
  let parent!: HTMLDivElement;
  let view: EditorView | undefined;

  // Recreate the editor when the bound Y.Text or edit permission changes
  // (permissions can arrive after mount; the reactive read re-runs this effect).
  createEffect(() => {
    const yText = p.yText;
    const canEdit = p.canEdit;
    view?.destroy();
    view = new EditorView({
      parent,
      doc: yText.toString(),
      extensions: buildExtensions(
        yText,
        p.awareness,
        p.height ?? "300px",
        !!p.plain,
        canEdit,
        p.undoManager,
      ),
    });
    const observer = () => p.onTextChange(yText.toString());
    yText.observe(observer);
    const detachHover = attachSelectionNameHover(view.dom, p.awareness);
    onCleanup(() => {
      yText.unobserve(observer);
      detachHover();
    });
  });

  onCleanup(() => view?.destroy());

  return <div ref={parent} class="w-full" />;
}
