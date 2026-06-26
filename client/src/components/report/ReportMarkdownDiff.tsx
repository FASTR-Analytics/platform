import { MergeView } from "@codemirror/merge";
import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { markdown } from "@codemirror/lang-markdown";
import { t3 } from "lib";
import { type AlertComponentProps, Button, ModalContainer } from "panther";
import { onCleanup, onMount } from "solid-js";

type Props = AlertComponentProps<
  {
    oldText: string;
    newText: string;
    summary?: string;
  },
  boolean
>;

// Accept/reject diff for a staged AI edit, shown as a locking modal (openComponent
// backdrop) so the user must act on the proposal before any other work. Built on
// @codemirror/merge MergeView (no panther diff primitive). Change tinting is the
// merge view's own semantic styling; our chrome uses success/danger intents (§8.0).
export function ReportMarkdownDiff(p: Props) {
  let parent!: HTMLDivElement;
  let merge: MergeView | undefined;

  onMount(() => {
    const readOnly = [
      EditorView.editable.of(false),
      EditorState.readOnly.of(true),
      markdown(),
      EditorView.lineWrapping,
    ];
    merge = new MergeView({
      a: { doc: p.oldText, extensions: readOnly },
      b: { doc: p.newText, extensions: readOnly },
      parent,
      gutter: true,
      highlightChanges: true,
    });
  });

  onCleanup(() => merge?.destroy());

  return (
    <ModalContainer
      width="4xl"
      noContentPadding
      title={
        p.summary ??
        t3({
          en: "Proposed change",
          fr: "Modification proposée",
          pt: "Alteração proposta",
        })
      }
      rightButtons={
        <>
          <Button
            intent="danger"
            outline
            iconName="x"
            onClick={() => p.close(false)}
          >
            {t3({ en: "Reject", fr: "Rejeter", pt: "Rejeitar" })}
          </Button>
          <Button
            intent="success"
            iconName="check"
            onClick={() => p.close(true)}
          >
            {t3({ en: "Accept", fr: "Accepter", pt: "Aceitar" })}
          </Button>
        </>
      }
    >
      <div ref={parent} />
    </ModalContainer>
  );
}
