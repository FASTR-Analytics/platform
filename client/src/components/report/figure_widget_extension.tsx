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
import { Match, Show, Switch } from "solid-js";
import { type FigureBlock, type ImageBlock, t3 } from "lib";
import { ReportFigureEmbed } from "./ReportFigureEmbed";

export type EmbedKind = "figure" | "image";

export type EmbedResolver = {
  getFigure: (id: string) => FigureBlock | undefined;
  getImage: (id: string) => ImageBlock | undefined;
  assetUrl: (imgFile: string) => string;
  // Clicking an embed selects it (opens the left-side editor, dashboard-style).
  onSelectEmbed: (kind: EmbedKind, id: string) => void;
  getSelectedId: () => string | undefined;
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
    // Block widgets must NOT have vertical margins — CodeMirror measures the
    // widget's box for vertical layout, and margins fall outside it, which
    // desyncs cursor positions below the widget. Use vertical PADDING instead.
    dom.className = "w-full p-4 select-none";
    dom.contentEditable = "false";
    dom.style.cursor = "pointer";
    dom.addEventListener("click", (e) => {
      e.stopPropagation();
      this.resolver.onSelectEmbed(this.kind, this.id);
    });

    // Reactive: the selected ring tracks the selection signal, and the embed
    // content (figure/image) re-renders when its registry entry changes (so
    // Switch/Edit visualization updates the live figure).
    const dispose = render(
      () => (
        <div
          class="ui-pad rounded border"
          classList={{
            "border-primary border-2":
              this.resolver.getSelectedId() === this.id,
            "border-base-300 hover:border-primary":
              this.resolver.getSelectedId() !== this.id,
          }}
        >
          <Switch>
            <Match when={this.kind === "figure"}>
              <Show
                when={this.resolver.getFigure(this.id)}
                fallback={
                  <div class="text-danger text-xs">
                    {t3({
                      en: "Missing visualization:",
                      fr: "Visualisation manquante :",
                      pt: "Visualização em falta:",
                    })}{" "}
                    {this.id}
                  </div>
                }
              >
                {(fig) => (
                  <ReportFigureEmbed
                    figure={fig()}
                    onMeasured={() => view.requestMeasure()}
                  />
                )}
              </Show>
            </Match>
            <Match when={this.kind === "image"}>
              <Show
                when={this.resolver.getImage(this.id)}
                fallback={
                  <div class="text-danger text-xs">
                    {t3({ en: "Missing image:", fr: "Image manquante :", pt: "Imagem em falta:" })}{" "}
                    {this.id}
                  </div>
                }
              >
                {(img) => (
                  <img
                    class="w-full"
                    src={this.resolver.assetUrl(img().imgFile)}
                    alt={this.caption}
                  />
                )}
              </Show>
            </Match>
          </Switch>
        </div>
      ),
      dom,
    );

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

  return [field, EditorView.atomicRanges.of((view) => view.state.field(field))];
}
