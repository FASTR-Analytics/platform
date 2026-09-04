import { t3, TC } from "lib";
import {
  AlertComponentProps,
  AlertFormHolder,
  createFormAction,
  Input,
} from "panther";
import { createSignal } from "solid-js";
import { serverActions } from "~/server_actions";

// File → Rename. The label is the one field; the route re-broadcasts the
// project's report list, so the sidebar and the editor's heading both follow.
export function RenameReportModal(
  p: AlertComponentProps<
    { projectId: string; reportId: string; currentLabel: string },
    { label: string } | undefined
  >,
) {
  const [label, setLabel] = createSignal(p.currentLabel);

  const save = createFormAction(
    async (e: MouseEvent) => {
      e.preventDefault();
      const next = label().trim();
      if (!next) return { success: false, err: t3(TC.mustEnterName) };
      const res = await serverActions.updateReportLabel({
        projectId: p.projectId,
        report_id: p.reportId,
        label: next,
      });
      return res.success ? { success: true, data: { label: next } } : res;
    },
    (data) => p.close(data),
  );

  return (
    <AlertFormHolder
      formId="rename-report"
      header={t3({ en: "Rename report", fr: "Renommer le rapport", pt: "Mudar o nome do relatório" })}
      savingState={save.state()}
      saveFunc={save.click}
      cancelFunc={() => p.close(undefined)}
      disableSaveButton={!label().trim() || label().trim() === p.currentLabel}
    >
      <Input
        label={t3({ en: "Report name", fr: "Nom du rapport", pt: "Nome do relatório" })}
        value={label()}
        onChange={setLabel}
        fullWidth
        autoFocus
      />
    </AlertFormHolder>
  );
}
