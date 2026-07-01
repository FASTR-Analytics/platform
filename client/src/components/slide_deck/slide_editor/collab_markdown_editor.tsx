import { minimalSetup } from "codemirror";
import { EditorView, keymap } from "@codemirror/view";
import { markdown } from "@codemirror/lang-markdown";
import { yCollab, yUndoManagerKeymap } from "y-codemirror.next";
import type { Awareness } from "y-protocols/awareness";
import type * as Y from "yjs";
import { createEffect, onCleanup } from "solid-js";

// A CodeMirror markdown editor bound directly to a slide text block's Y.Text via
// y-codemirror.next. This is what renders remote collaborators' carets and
// selections (from Yjs awareness) and preserves the local caret through remote
// edits — things a plain <textarea> can't do. It replaces panther's TextArea for
// the text-block body only while live collab is active (see editor_panel_content).

function buildExtensions(
  yText: Y.Text,
  awareness: Awareness,
  height: string,
  plain: boolean,
) {
  return [
    // yCollab's per-user undo takes precedence over the base keymap.
    keymap.of([...yUndoManagerKeymap]),
    minimalSetup,
    ...(plain ? [] : [markdown()]),
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
  /** Mirror the text into tempSlide so the slide canvas re-renders as you type. */
  onTextChange: (markdown: string) => void;
  height?: string;
  /** Plain text (no markdown highlighting) — used for title/header fields. */
  plain?: boolean;
}) {
  let parent!: HTMLDivElement;
  let view: EditorView | undefined;

  // Recreate the editor when the bound block (Y.Text) changes.
  createEffect(() => {
    const yText = p.yText;
    view?.destroy();
    view = new EditorView({
      parent,
      doc: yText.toString(),
      extensions: buildExtensions(yText, p.awareness, p.height ?? "300px", !!p.plain),
    });
    const observer = () => p.onTextChange(yText.toString());
    yText.observe(observer);
    onCleanup(() => yText.unobserve(observer));
  });

  onCleanup(() => view?.destroy());

  return <div ref={parent} class="w-full" />;
}
