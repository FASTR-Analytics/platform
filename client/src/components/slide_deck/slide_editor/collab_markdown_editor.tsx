import type { Awareness } from "y-protocols/awareness";
import type * as Y from "yjs";
import { CollabMarkdownEditor as SharedCollabMarkdownEditor } from "~/components/_shared/collab_markdown_editor";
import { canEditProduct } from "~/state/instance/product_access";

// Slide-editor wrapper around the shared CollabMarkdownEditor: injects the
// product edit gate so the two slide call sites (collab_text_field,
// editor_panel_content) don't each repeat it. `canEdit` is read reactively
// (Solid getter-wraps the prop), so it re-runs when approval changes.
export function CollabMarkdownEditor(p: {
  productId: string;
  yText: Y.Text;
  awareness: Awareness;
  onTextChange: (markdown: string) => void;
  height?: string;
  plain?: boolean;
  undoManager?: Y.UndoManager;
}) {
  return (
    <SharedCollabMarkdownEditor
      yText={p.yText}
      awareness={p.awareness}
      canEdit={canEditProduct(p.productId)}
      onTextChange={p.onTextChange}
      height={p.height}
      plain={p.plain}
      undoManager={p.undoManager}
    />
  );
}
