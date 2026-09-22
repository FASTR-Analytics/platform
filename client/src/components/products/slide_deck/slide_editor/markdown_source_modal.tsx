import { t3 } from "lib";
import { type AlertComponentProps, ModalContainer, TextArea } from "panther";
import { createSignal, Show } from "solid-js";
import type { Awareness } from "y-protocols/awareness";
import type * as Y from "yjs";
import { CollabMarkdownEditor } from "./collab_markdown_editor";
import { MarkdownGuide } from "./markdown_guide";

// A text block's markdown source. Typing on the canvas covers everyday text;
// this is for what the canvas cannot edit (code blocks, link targets) and for
// anyone who prefers the source. Bound to the same Y.Text as the canvas editor, so it is
// live for collaborators too.
export function MarkdownSourceModal(
  p: AlertComponentProps<
    {
      productId: string;
      yText: Y.Text | undefined;
      awareness: Awareness | undefined;
      undoManager: Y.UndoManager | undefined;
      initial: string;
      onText: (markdown: string) => void;
    },
    void
  >,
) {
  const [plain, setPlain] = createSignal(p.initial);
  return (
    <ModalContainer
      title={t3({ en: "Edit as markdown", fr: "Modifier en markdown", pt: "Editar em markdown" })}
      width="lg"
      actions={[
        {
          label: t3({ en: "Done", fr: "Terminé", pt: "Concluído" }),
          intent: "primary",
          onClick: () => p.close(undefined),
        },
      ]}
    >
      <Show
        when={p.yText && p.awareness ? p.yText : undefined}
        keyed
        fallback={
          <TextArea
            value={plain()}
            onChange={(v: string) => {
              setPlain(v);
              p.onText(v);
            }}
            fullWidth
            height="360px"
          />
        }
      >
        {(yText) => (
          <CollabMarkdownEditor
            productId={p.productId}
            yText={yText}
            awareness={p.awareness!}
            onTextChange={p.onText}
            height="360px"
            undoManager={p.undoManager}
          />
        )}
      </Show>
      <MarkdownGuide />
    </ModalContainer>
  );
}
