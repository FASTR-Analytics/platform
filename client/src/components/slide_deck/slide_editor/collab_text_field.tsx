import { findRootTextField } from "lib";
import { TextArea } from "panther";
import { Show } from "solid-js";
import type { SlideSession } from "~/state/project/collab";
import { CollabMarkdownEditor } from "./collab_markdown_editor";

// A single root-level slide text field (a title / header / etc.). When live
// collab is ready it renders a CodeMirror editor bound to that field's Y.Text
// (so remote collaborators' carets show), otherwise the plain panther TextArea.
// Both paths call `onChange` to keep tempSlide (and thus the canvas) in sync.
export function CollabTextField(p: {
  session: SlideSession | null;
  collabReady: boolean;
  /** Root field key on the slide, e.g. "header", "title", "sectionSubtitle". */
  fieldKey: string;
  value: string;
  onChange: (v: string) => void;
  label?: string;
  height?: string;
}) {
  const yText = () =>
    p.collabReady && p.session
      ? findRootTextField(p.session.doc, p.fieldKey)
      : undefined;

  return (
    <Show
      when={yText()}
      keyed
      fallback={
        <TextArea
          label={p.label}
          value={p.value}
          onChange={p.onChange}
          height={p.height}
          fullWidth
        />
      }
    >
      {(t) => (
        <div>
          <Show when={p.label}>
            <label class="ui-label">{p.label}</label>
          </Show>
          <CollabMarkdownEditor
            yText={t}
            awareness={p.session!.awareness}
            onTextChange={p.onChange}
            height={p.height ?? "60px"}
            plain
          />
        </div>
      )}
    </Show>
  );
}
