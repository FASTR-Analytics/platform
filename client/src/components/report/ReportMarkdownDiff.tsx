import { MergeView } from "@codemirror/merge";
import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { markdown } from "@codemirror/lang-markdown";
import { t3 } from "lib";
import { Button } from "panther";
import { onCleanup, onMount } from "solid-js";

type Props = {
  oldText: string;
  newText: string;
  summary?: string;
  onAccept: () => void;
  onReject: () => void;
};

// Accept/reject diff for a staged AI edit. Built on @codemirror/merge MergeView
// (no panther diff primitive). Change tinting is the merge view's own
// semantic styling; our chrome uses success/danger intents (§8.0).
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
    <div class="flex h-full w-full flex-col">
      <div class="border-base-300 ui-pad flex items-center gap-2 border-b">
        <div class="text-base-content flex-1 truncate text-sm font-medium">
          {p.summary ?? t3({ en: "Proposed change", fr: "Modification proposée" })}
        </div>
        <Button intent="danger" outline iconName="x" onClick={p.onReject}>
          {t3({ en: "Reject", fr: "Rejeter" })}
        </Button>
        <Button intent="success" iconName="check" onClick={p.onAccept}>
          {t3({ en: "Accept", fr: "Accepter" })}
        </Button>
      </div>
      <div ref={parent} class="min-h-0 flex-1 overflow-auto" />
    </div>
  );
}
