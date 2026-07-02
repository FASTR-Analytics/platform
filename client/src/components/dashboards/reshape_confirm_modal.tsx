import { t3 } from "lib";
import {
  AlertComponentProps,
  AlertFormHolder,
  ProgressBar,
  getProgress,
  createFormAction,
} from "panther";
import { Show } from "solid-js";

type Props = {
  message: string;
  run: (
    report: (frac: number, msg: string) => void,
  ) => Promise<{ success: true } | { success: false; err: string }>;
};

type ReturnType = { ok: true };

// Confirm + progress for an edit/switch that changes an entry's structure
// (item→group, group→item, or a group rebuild). The resolve + replace work is
// injected via `run`, which reports progress as it resolves each member.
export function ReshapeConfirmModal(p: AlertComponentProps<Props, ReturnType>) {
  const progress = getProgress();

  const save = createFormAction(
    async (e: MouseEvent) => {
      e.preventDefault();
      const res = await p.run((frac, msg) => progress.onProgress(frac, msg));
      if (!res.success) return res;
      return { success: true as const, data: { ok: true as const } };
    },
    (data) => p.close(data),
  );

  return (
    <AlertFormHolder
      formId="confirm-reshape-dashboard-entry"
      header={t3({
        en: "Update dashboard item",
        fr: "Mettre à jour l'élément",
        pt: "Atualizar elemento do painel",
      })}
      savingState={save.state()}
      saveFunc={save.click}
      cancelFunc={() => p.close(undefined)}
    >
      <div class="ui-spy">
        <div class="text-sm">{p.message}</div>
        <Show when={save.state().status === "loading"}>
          <ProgressBar
            progressFrom0To100={progress.progressFrom0To100()}
            progressMsg={progress.progressMsg()}
            small
          />
        </Show>
      </div>
    </AlertFormHolder>
  );
}
