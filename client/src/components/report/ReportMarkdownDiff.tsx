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
    // Set when staged via the approval lifecycle's customProposalUI override
    // (report_editor's propose-edit tools): aborts on an EXTERNAL resolution
    // (Stop) — this UI's cleanup obligation is to close itself, since
    // panther has no dismissal API for an already-open openComponent
    // dialog.
    signal?: AbortSignal;
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
        "&": { borderLeft: "1px solid var(--color-base-300)" },
      }),
    ];
    merge = new MergeView({
      a: { doc: p.oldText, extensions: base },
      b: { doc: p.newText, extensions: bPane },
      parent,
      gutter: true,
      highlightChanges: true,
      // Fold unchanged stretches behind a clickable expander so the change is
      // always on screen — without this, an edit below the fold of a long
      // report shows as an apparently empty diff.
      collapseUnchanged: {},
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
