import { RangeSetBuilder } from "@codemirror/state";
import {
  Decoration,
  type DecorationSet,
  EditorView,
  ViewPlugin,
  type ViewUpdate,
} from "@codemirror/view";
import { parseContainerFence } from "lib";

// FASTR Markdown only: tint the `:::` container fences so the block structure
// reads at a glance while typing. @codemirror/lang-markdown has no idea what a
// fence is (the format is ours), and a full lezer-markdown extension would buy
// nothing beyond this — the fences are whole lines by definition.

const fenceLine = Decoration.line({ class: "cm-fm-fence" });

function buildDecorations(view: EditorView): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>();
  for (const { from, to } of view.visibleRanges) {
    let pos = from;
    while (pos <= to) {
      const line = view.state.doc.lineAt(pos);
      if (parseContainerFence(line.text)) {
        builder.add(line.from, line.from, fenceLine);
      }
      pos = line.to + 1;
    }
  }
  return builder.finish();
}

export function fastrContainerFences() {
  return [
    ViewPlugin.fromClass(
      class {
        decorations: DecorationSet;
        constructor(view: EditorView) {
          this.decorations = buildDecorations(view);
        }
        update(u: ViewUpdate) {
          if (u.docChanged || u.viewportChanged) {
            this.decorations = buildDecorations(u.view);
          }
        }
      },
      { decorations: (v) => v.decorations },
    ),
    EditorView.baseTheme({
      "&light .cm-fm-fence": {
        backgroundColor: "rgba(37, 99, 235, 0.07)",
        boxShadow: "inset 2px 0 0 rgba(37, 99, 235, 0.55)",
      },
      "&dark .cm-fm-fence": {
        backgroundColor: "rgba(147, 197, 253, 0.10)",
        boxShadow: "inset 2px 0 0 rgba(147, 197, 253, 0.55)",
      },
    }),
  ];
}
