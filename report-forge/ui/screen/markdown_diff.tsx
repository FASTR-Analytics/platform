import { MergeView } from "@codemirror/merge";
import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { markdown } from "@codemirror/lang-markdown";
import { t3 } from "../../engine/i18n.ts";
import { Modal, type ModalProps } from "../kit/mod.ts";
import { onCleanup, onMount } from "solid-js";

type Props = ModalProps<
  {
    oldText: string;
    newText: string;
    summary?: string;
    // Aborts on an EXTERNAL resolution (the proposer withdrew the change):
    // the dialog closes itself, as a rejection.
    signal?: AbortSignal;
  },
  boolean
>;

// Accept/reject diff for a proposed edit, shown as a modal so the user acts
// on the proposal before any other work. Built on @codemirror/merge
// MergeView; change tinting is the merge view's own semantic styling.
export function ReportMarkdownDiff(p: Props) {
  let parent!: HTMLDivElement;
  let merge: MergeView | undefined;

  onMount(() => {
    if (p.signal) {
      if (p.signal.aborted) {
        p.close(false);
        return;
      }
      const onAbort = () => p.close(false);
      p.signal.addEventListener("abort", onAbort);
      onCleanup(() => p.signal?.removeEventListener("abort", onAbort));
    }
    const base = [
      EditorView.editable.of(false),
      EditorState.readOnly.of(true),
      markdown(),
      EditorView.lineWrapping,
      EditorView.theme({
        ".cm-content": { padding: "8px 12px" },
        // Widen the merge change marker (default 3px) so it reads as a deliberate
        // change bar rather than a stray border. Red on the a/deletions pane,
        // green on the b/insertions pane (merge base theme colors).
        ".cm-changeGutter": { width: "6px", paddingLeft: "0" },
        // Drop the base-theme gutter divider on both panes; the pane divider
        // lives on the right pane's left edge instead (see bPane).
        ".cm-gutters": { border: "none" },
      }),
    ];
    // Right pane only: a single left border is the divider between the two panes.
    const bPane = [
      ...base,
      EditorView.theme({
        "&": { borderLeft: "1px solid var(--rf-color-base-300)" },
      }),
    ];
    merge = new MergeView({
      a: { doc: p.oldText, extensions: base },
      b: { doc: p.newText, extensions: bPane },
      parent,
      gutter: true,
      highlightChanges: true,
      // Fold unchanged stretches behind a clickable expander so the change is
      // always on screen: without this, an edit below the fold of a long
      // report shows as an apparently empty diff.
      collapseUnchanged: {},
    });
  });

  onCleanup(() => merge?.destroy());

  return (
    <Modal
      width="4xl"
      pad="none"
      title={p.summary ??
        t3({
          en: "Proposed change",
          fr: "Modification proposée",
          pt: "Alteração proposta",
        })}
      actions={[
        {
          label: t3({ en: "Reject", fr: "Rejeter", pt: "Rejeitar" }),
          onClick: () => p.close(false),
          intent: "danger",
          outline: true,
          iconName: "x",
        },
        {
          label: t3({ en: "Accept", fr: "Accepter", pt: "Aceitar" }),
          onClick: () => p.close(true),
          iconName: "check",
        },
      ]}
    >
      <div ref={parent} />
    </Modal>
  );
}
