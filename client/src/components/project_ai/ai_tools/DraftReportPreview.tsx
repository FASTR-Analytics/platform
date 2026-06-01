import { t3 } from "lib";
import { Button, MarkdownPresentationJsx } from "panther";
import { createSignal, Show } from "solid-js";
import { serverActions } from "~/server_actions";

type Props = {
  projectId: string;
  label: string;
  markdown: string;
};

// Inline chat preview of an AI-drafted report with a "Create report" action
// (renders via the same MarkdownPresentationJsx the editor preview uses).
export function DraftReportPreview(p: Props) {
  const [isCreating, setIsCreating] = createSignal(false);
  const [created, setCreated] = createSignal(false);
  const [err, setErr] = createSignal<string | undefined>();

  async function create() {
    setIsCreating(true);
    setErr(undefined);
    const res = await serverActions.createReport({
      projectId: p.projectId,
      label: p.label,
      folderId: null,
    });
    if (!res.success) {
      setErr(res.err);
      setIsCreating(false);
      return;
    }
    const bodyRes = await serverActions.updateReportBody({
      projectId: p.projectId,
      report_id: res.data.reportId,
      body: p.markdown,
      expectedLastUpdated: res.data.lastUpdated,
      overwrite: true,
    });
    if (!bodyRes.success) {
      setErr(bodyRes.err);
      setIsCreating(false);
      return;
    }
    setCreated(true);
    setIsCreating(false);
  }

  return (
    <div class="border-base-300 ui-pad ui-spy rounded border">
      <div class="text-base-content text-sm font-medium">{p.label}</div>
      <div class="max-h-96 overflow-auto">
        <MarkdownPresentationJsx markdown={p.markdown} />
      </div>
      <Show
        when={!created()}
        fallback={
          <div class="text-success text-xs">
            {t3({ en: "Report created.", fr: "Rapport créé." })}
          </div>
        }
      >
        <div class="ui-gap flex items-center">
          <Button
            intent="success"
            iconName="plus"
            disabled={isCreating()}
            onClick={create}
          >
            {isCreating()
              ? t3({ en: "Creating…", fr: "Création…" })
              : t3({ en: "Create report", fr: "Créer le rapport" })}
          </Button>
          <Show when={err()}>
            <span class="text-danger text-xs">{err()}</span>
          </Show>
        </div>
      </Show>
    </div>
  );
}
