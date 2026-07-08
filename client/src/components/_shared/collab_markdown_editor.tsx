import { minimalSetup } from "codemirror";
import { EditorState } from "@codemirror/state";
import { EditorView, keymap } from "@codemirror/view";
import { markdown } from "@codemirror/lang-markdown";
import { yCollab, yUndoManagerKeymap } from "y-codemirror.next";
import type { Awareness } from "y-protocols/awareness";
import type * as Y from "yjs";
import { createEffect, onCleanup } from "solid-js";

// A CodeMirror markdown/plain editor bound directly to a Y.Text via
// y-codemirror.next. It renders remote collaborators' carets and selections
// (from Yjs awareness) and preserves the local caret through remote edits —
// things a plain <textarea> can't do. Shared by the slide editor (text-block
// body + title/header fields) and the visualization editor (caption fields);
// the caller supplies `canEdit` (each surface has its own configure permission),
// so this component is decoupled from any one project-state permission.

function buildExtensions(
  yText: Y.Text,
  awareness: Awareness,
  height: string,
  plain: boolean,
  canEdit: boolean,
) {
  return [
    // yCollab's per-user undo takes precedence over the base keymap.
    keymap.of([...yUndoManagerKeymap]),
    minimalSetup,
    ...(plain ? [] : [markdown()]),
    // View-only users get a read-only editor: their keystrokes would otherwise
    // flow into the local doc, be rejected server-side ("No edit permission"),
    // and silently diverge this client from every peer.
    ...(canEdit ? [] : [EditorState.readOnly.of(true), EditorView.editable.of(false)]),
    EditorView.lineWrapping,
    EditorView.theme({
      "&": {
        fontSize: "14px",
        border: "1px solid rgba(0,0,0,0.15)",
        borderRadius: "6px",
        backgroundColor: "#fff",
      },
      "&.cm-focused": { outline: "none" },
      ".cm-scroller": { overflow: "auto", maxHeight: height, fontFamily: "inherit" },
      ".cm-content": { minHeight: height, padding: "8px" },
    }),
    yCollab(yText, awareness),
  ];
}

export function CollabMarkdownEditor(p: {
  yText: Y.Text;
  awareness: Awareness;
  /** Whether this user may edit — false renders a read-only editor. */
  canEdit: boolean;
  /** Mirror the text into the host's working state so it re-renders as you type. */
  onTextChange: (markdown: string) => void;
  height?: string;
  /** Plain text (no markdown highlighting) — used for title/header/caption fields. */
  plain?: boolean;
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
      extensions: buildExtensions(yText, p.awareness, p.height ?? "300px", !!p.plain, canEdit),
    });
    const observer = () => p.onTextChange(yText.toString());
    yText.observe(observer);
    onCleanup(() => yText.unobserve(observer));
  });

  onCleanup(() => view?.destroy());

  return <div ref={parent} class="w-full" />;
}
