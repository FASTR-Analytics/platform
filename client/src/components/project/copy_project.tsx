import { t3 } from "lib";
import {
  AlertComponentProps,
  AlertFormHolder,
  Input,
  createFormAction,
} from "panther";
import { createSignal } from "solid-js";
import { serverActions } from "~/server_actions";

export function CopyProjectForm(
  p: AlertComponentProps<
    {
      projectId: string;
    },
    { newProjectId: string }
  >,
) {
  // Temp state

  const [tempLabel, setTempLabel] = createSignal<string>("");
  // Actions

  const save = createFormAction(
    async (e: MouseEvent) => {
      e.preventDefault();
      const goodLabel = tempLabel().trim();
      if (!goodLabel) {
        return { success: false, err: t3({ en: "You must enter a project name", fr: "Vous devez saisir un nom de projet", pt: "Tem de introduzir um nome de projeto" }) };
      }
      return await serverActions.copyProject({
        project_id: p.projectId,
        projectId: p.projectId,
        newProjectLabel: goodLabel,
      });
    },
    async () => {},
    (data) => p.close({ newProjectId: data!.newProjectId }),
  );

  return (
    <AlertFormHolder
      formId="add-project"
      header={t3({ en: "Copy project", fr: "Copier le projet", pt: "Copiar projeto" })}
      savingState={save.state()}
      saveFunc={save.click}
      cancelFunc={() => p.close(undefined)}
    >
      <div class="ui-spy">
        <Input
          label={t3({ en: "New project name", fr: "Nouveau nom du projet", pt: "Novo nome do projeto" })}
          value={tempLabel()}
          onChange={setTempLabel}
          fullWidth
          autoFocus
        />
      </div>
    </AlertFormHolder>
  );
}
