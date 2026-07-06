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
    /** "review" (default): Accept/Reject buttons resolving true/false.
     *  "view": read-only comparison (version history) — single Close button. */
    mode?: "review" | "view";
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
        (p.mode ?? "review") === "view" ? (
          <Button outline onClick={() => p.close(false)}>
            {t3({ en: "Close", fr: "Fermer", pt: "Fechar" })}
          </Button>
        ) : (
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
        )
      }
    >
      <div ref={parent} />
    </ModalContainer>
  );
}
