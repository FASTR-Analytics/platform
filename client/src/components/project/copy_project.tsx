import { isFrench, t3 } from "lib";
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
        return { success: false, err: t3({ en: "You must enter a project name", fr: "Vous devez saisir un nom de projet" }) };
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
      header={t3({ en: "Copy project", fr: "Copier le projet" })}
      savingState={save.state()}
      saveFunc={save.click}
      cancelFunc={() => p.close(undefined)}
      french={isFrench()}
    >
      <div class="ui-spy">
        <Input
          label={t3({ en: "New project name", fr: "Nouveau nom du projet" })}
          value={tempLabel()}
          onChange={setTempLabel}
          fullWidth
          autoFocus
        />
        <div class="max-w-[500px] text-sm">
          {t3({ en: "NOTE: Copying a project will be disruptive to other users. If they are in the middle of an action, they will get an error. It is not catastrophic, it may just confuse other users. For this reason, only copy projects when others aren't likely to be using the platform, and only copy infrequently. It could take several minutes.", fr: "NOTE : La copie d'un projet peut perturber les autres utilisateurs. S'ils sont en cours d'action, ils recevront une erreur. Ce n'est pas catastrophique, mais cela peut prêter à confusion. Pour cette raison, ne copiez les projets que lorsque les autres utilisateurs ne sont pas susceptibles d'utiliser la plateforme, et ne le faites que rarement. L'opération peut prendre plusieurs minutes." })}
        </div>
      </div>
    </AlertFormHolder>
  );
}
