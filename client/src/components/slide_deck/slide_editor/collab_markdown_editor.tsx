import type { Awareness } from "y-protocols/awareness";
import type * as Y from "yjs";
import { CollabMarkdownEditor as SharedCollabMarkdownEditor } from "~/components/_shared/collab_markdown_editor";
import { projectState } from "~/state/project/t1_store";

// Slide-editor wrapper around the shared CollabMarkdownEditor: injects the
// slide-deck configure permission so the two slide call sites (collab_text_field,
// editor_panel_content) don't each repeat it. `canEdit` is read reactively (Solid
// getter-wraps the prop), so it still re-runs when permissions arrive after mount.
export function CollabMarkdownEditor(p: {
  yText: Y.Text;
  awareness: Awareness;
  onTextChange: (markdown: string) => void;
  height?: string;
  plain?: boolean;
}) {
  return (
    <SharedCollabMarkdownEditor
      yText={p.yText}
      awareness={p.awareness}
      canEdit={projectState.thisUserPermissions.can_configure_slide_decks &&
        !projectState.isLocked}
      onTextChange={p.onTextChange}
      height={p.height}
      plain={p.plain}
    />
  );
}
