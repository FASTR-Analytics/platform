import { isFrench, t, t2, T } from "lib";
import {
  AlertComponentProps,
  AlertFormHolder,
  Input,
  timActionForm,
} from "panther";
import { createSignal } from "solid-js";
import { serverActions } from "~/server_actions";

export function CopyProjectForm(
  p: AlertComponentProps<
    {
      projectId: string;
      silentFetch: () => Promise<void>;
    },
    { newProjectId: string }
  >,
) {
  // Temp state

  const [tempLabel, setTempLabel] = createSignal<string>("");
  // Actions

  const save = timActionForm(
    async (e: MouseEvent) => {
      e.preventDefault();
      const goodLabel = tempLabel().trim();
      if (!goodLabel) {
        return { success: false, err: t("You must enter a project name") };
      }
      return await serverActions.copyProject({
        project_id: p.projectId,
        projectId: p.projectId,
        newProjectLabel: goodLabel,
      });
    },
    () => p.silentFetch(),
    (data) => p.close({ newProjectId: data!.newProjectId }),
  );

  return (
    <AlertFormHolder
      formId="add-project"
      header={t2(T.Paramètres.copy_project)}
      savingState={save.state()}
      saveFunc={save.click}
      cancelFunc={() => p.close(undefined)}
      french={isFrench()}
    >
      <div class="ui-spy">
        <Input
          label={t("New project name")}
          value={tempLabel()}
          onChange={setTempLabel}
          fullWidth
          autoFocus
        />
        <div class="max-w-[500px] text-sm">
          NOTE: Copying a project will be disruptive to other users. If they are
          in the middle of an action, they will get an error. It is not
          catastrophic, it may just confuse other users. For this reason, only
          copy projects when others aren't likely to be using the platform, and
          only copy infrequently. It could take several minutes.
        </div>
      </div>
    </AlertFormHolder>
  );
}
