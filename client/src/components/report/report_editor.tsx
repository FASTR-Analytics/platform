import { onCleanup, onMount } from "solid-js";
import { EditorView } from "@codemirror/view";
import { basicSetup } from "codemirror";
import { markdown } from "@codemirror/lang-markdown";
import type { FigureBlock, ImageBlock } from "lib";
import { embedWidgets, type EmbedResolver } from "./figure_widget_extension";

export type ReportEditorApi = {
  // Insert an embed token on its own line at the current cursor.
  insertEmbedOnNewLine: (token: string) => void;
  // Replace the whole document (used when accepting a staged AI edit).
  setBody: (body: string) => void;
  // Remove an embed's token line (used when deleting a figure/image).
  removeEmbedToken: (kind: "figure" | "image", id: string) => void;
  // Change an embed's caption (the markdown alt text in its token).
  setEmbedCaption: (
    kind: "figure" | "image",
    id: string,
    caption: string,
  ) => void;
  // Re-measure (e.g. after the editor was hidden during a diff review).
  refresh: () => void;
};

type Props = {
  body: string;
  figures: Record<string, FigureBlock>;
  images: Record<string, ImageBlock>;
  assetUrl: (imgFile: string) => string;
  onBodyChange: (body: string) => void;
  onSelectEmbed: (kind: "figure" | "image", id: string) => void;
  selectedId: () => string | undefined;
  ref?: (api: ReportEditorApi) => void;
};

export function ReportEditor(props: Props) {
  let parent!: HTMLDivElement;
  let view: EditorView | undefined;

  // Read the registries/selection live (Solid props are reactive getters) so a
  // newly inserted figure resolves immediately and the selected ring stays live.
  const resolver: EmbedResolver = {
    getFigure: (id) => props.figures[id],
    getImage: (id) => props.images[id],
    assetUrl: (imgFile) => props.assetUrl(imgFile),
    onSelectEmbed: (kind, id) => props.onSelectEmbed(kind, id),
    getSelectedId: () => props.selectedId(),
  };

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

  onMount(() => {
    view = new EditorView({
      doc: props.body,
      parent,
      extensions: [
        basicSetup,
        markdown(),
        EditorView.lineWrapping,
        // Fill the container so the editor (and its line-number gutter) extends
        // the full height even when the document is short (panther fullHeight).
        EditorView.theme({
          "&.cm-editor": { height: "100%" },
          // Fixed editor text size (content + gutter), independent of page size.
          "&": { fontSize: "15px" },
          ".cm-scroller": { overflow: "auto" },
          ".cm-content, .cm-gutter": { minHeight: "100%" },
        }),
        embedWidgets(resolver),
        EditorView.updateListener.of((u) => {
          if (u.docChanged) props.onBodyChange(u.state.doc.toString());
        }),
      ],
    });
    function setBody(next: string) {
      if (!view) return;
      view.dispatch({
        changes: { from: 0, to: view.state.doc.length, insert: next },
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

    function refresh() {
      view?.requestMeasure();
    }

    props.ref?.({
      insertEmbedOnNewLine,
      setBody,
      removeEmbedToken,
      setEmbedCaption,
      refresh,
    });
  });

  onCleanup(() => view?.destroy());

  return (
    <div
      ref={parent}
      class="bg-base-100 mx-auto h-full w-full max-w-4xl overflow-auto rounded border"
    />
  );
}
