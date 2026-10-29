import { MergeView } from "@codemirror/merge";
import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { t3 } from "lib";
import { type AlertComponentProps, ModalContainer } from "panther";
import { onCleanup, onMount, Show } from "solid-js";

type Props = {
  title: string;
  description: string;
  before: string;
  after: string;
  // Aborts when the chat resolves the decision itself (Stop, a view exit):
  // the dialog closes as a rejection.
  signal: AbortSignal;
};

// The HFA writes' approval: every changed indicator laid out as text, stored
// against proposed, in a merge view that highlights what changed and folds
// what did not, so a batch of many indicators stays readable.
export function HfaProposalDiff(p: AlertComponentProps<Props, boolean>) {
  let parent!: HTMLDivElement;
  let merge: MergeView | undefined;

  onMount(() => {
    if (p.signal.aborted) {
      p.close(false);
      return;
    }
    const onAbort = () => p.close(false);
    p.signal.addEventListener("abort", onAbort);
    onCleanup(() => p.signal.removeEventListener("abort", onAbort));
    const base = [
      EditorView.editable.of(false),
      EditorState.readOnly.of(true),
      EditorView.lineWrapping,
      EditorView.theme({
        ".cm-content": { padding: "8px 12px", fontFamily: "monospace" },
        ".cm-changeGutter": { width: "6px", paddingLeft: "0" },
        ".cm-gutters": { border: "none" },
      }),
    ];
    merge = new MergeView({
      a: { doc: p.before, extensions: base },
      b: {
        doc: p.after,
        extensions: [
          ...base,
          EditorView.theme({
            "&": { borderLeft: "1px solid var(--color-base-300)" },
          }),
        ],
      },
      parent,
      gutter: true,
      highlightChanges: true,
      collapseUnchanged: {},
    });
  });

  onCleanup(() => merge?.destroy());

  return (
    <ModalContainer
      title={p.title}
      width="4xl"
      actions={[
        {
          label: t3({ en: "Accept", fr: "Accepter", pt: "Aceitar" }),
          onClick: () => p.close(true),
          iconName: "check",
        },
      ]}
      onCancel={() => p.close(false)}
      cancelLabel={t3({ en: "Reject", fr: "Rejeter", pt: "Rejeitar" })}
    >
      <Show when={p.description}>
        <div class="whitespace-pre-wrap text-sm">{p.description}</div>
      </Show>
      <div class="border-base-300 overflow-hidden rounded border text-xs">
        <div ref={parent} />
      </div>
    </ModalContainer>
  );
}
