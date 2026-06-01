import { onCleanup, onMount } from "solid-js";
import { EditorView } from "@codemirror/view";
import { basicSetup } from "codemirror";
import { markdown } from "@codemirror/lang-markdown";
import type { FigureBlock, ImageBlock } from "lib";
import { embedWidgets, type EmbedResolver } from "./figure_widget_extension";

type Props = {
  body: string;
  figures: Record<string, FigureBlock>;
  images: Record<string, ImageBlock>;
  assetUrl: (imgFile: string) => string;
  onBodyChange: (body: string) => void;
};

export function ReportEditor(props: Props) {
  let parent!: HTMLDivElement;
  let view: EditorView | undefined;

  const resolver: EmbedResolver = {
    getFigure: (id) => props.figures[id],
    getImage: (id) => props.images[id],
    assetUrl: props.assetUrl,
  };

  onMount(() => {
    view = new EditorView({
      doc: props.body,
      parent,
      extensions: [
        basicSetup,
        markdown(),
        EditorView.lineWrapping,
        embedWidgets(resolver),
        EditorView.updateListener.of((u) => {
          if (u.docChanged) props.onBodyChange(u.state.doc.toString());
        }),
      ],
    });
  });

  onCleanup(() => view?.destroy());

  return (
    <div ref={parent} class="ui-pad mx-auto h-full w-full max-w-3xl overflow-auto" />
  );
}
