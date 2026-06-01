import {
  Decoration,
  type DecorationSet,
  EditorView,
  WidgetType,
} from "@codemirror/view";
import {
  type EditorState,
  type Extension,
  RangeSetBuilder,
  StateField,
} from "@codemirror/state";
import { render } from "solid-js/web";
import type { FigureBlock, ImageBlock } from "lib";
import { ReportFigureEmbed } from "./ReportFigureEmbed";

export type EmbedResolver = {
  getFigure: (id: string) => FigureBlock | undefined;
  getImage: (id: string) => ImageBlock | undefined;
  assetUrl: (imgFile: string) => string;
};

// A line that is exactly a single embed token: ![caption](figure:id) / ![alt](image:id)
const LINE_TOKEN_RE = /^!\[([^\]]*)\]\((figure|image):([^)\s]+)\)$/;

class EmbedWidget extends WidgetType {
  constructor(
    readonly kind: "figure" | "image",
    readonly id: string,
    readonly caption: string,
    readonly resolver: EmbedResolver,
  ) {
    super();
  }

  override eq(other: EmbedWidget): boolean {
    return (
      other.kind === this.kind &&
      other.id === this.id &&
      other.caption === this.caption
    );
  }

  override toDOM(view: EditorView): HTMLElement {
    const dom = document.createElement("div");
    dom.className = "w-full my-4 select-none";
    dom.contentEditable = "false";

    const dispose = render(() => {
      if (this.kind === "figure") {
        const fig = this.resolver.getFigure(this.id);
        return fig
          ? (
            <ReportFigureEmbed
              figure={fig}
              onMeasured={() => view.requestMeasure()}
            />
          )
          : <div class="text-danger text-xs">Missing figure: {this.id}</div>;
      }
      const img = this.resolver.getImage(this.id);
      return img
        ? (
          <img
            class="w-full"
            src={this.resolver.assetUrl(img.imgFile)}
            alt={this.caption}
          />
        )
        : <div class="text-danger text-xs">Missing image: {this.id}</div>;
    }, dom);

    (dom as unknown as { _dispose?: () => void })._dispose = dispose;
    return dom;
  }

  override ignoreEvent(): boolean {
    return true;
  }

  override destroy(dom: HTMLElement): void {
    (dom as unknown as { _dispose?: () => void })._dispose?.();
  }

  override get estimatedHeight(): number {
    return this.kind === "figure" ? 260 : 180;
  }
}

function buildEmbedDecorations(
  state: EditorState,
  resolver: EmbedResolver,
): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>();
  for (let i = 1; i <= state.doc.lines; i++) {
    const line = state.doc.line(i);
    const m = LINE_TOKEN_RE.exec(line.text.trim());
    if (!m) continue;
    const [, caption, kind, id] = m;
    builder.add(
      line.from,
      line.to,
      Decoration.replace({
        widget: new EmbedWidget(
          kind as "figure" | "image",
          id,
          caption,
          resolver,
        ),
        block: true,
      }),
    );
  }
  return builder.finish();
}

// Block decorations MUST be provided directly via a StateField (not a view
// plugin) — see EditorView.decorations facet docs.
export function embedWidgets(resolver: EmbedResolver): Extension {
  const field = StateField.define<DecorationSet>({
    create(state) {
      return buildEmbedDecorations(state, resolver);
    },
    update(deco, tr) {
      return tr.docChanged ? buildEmbedDecorations(tr.state, resolver) : deco;
    },
    provide: (f) => EditorView.decorations.from(f),
  });

  return [
    field,
    EditorView.atomicRanges.of((view) => view.state.field(field)),
  ];
}
