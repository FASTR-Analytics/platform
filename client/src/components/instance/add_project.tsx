import { OtherUser, t3 } from "lib";
import {
  AlertComponentProps,
  AlertFormHolder,
  Input,
  createFormAction,
} from "panther";
import { createSignal } from "solid-js";
import { serverActions } from "~/server_actions";
import {
  ProjectScopePicker,
  storedValueFromScopeSelection,
  type ProjectScopeSelection,
} from "~/components/_shared/project_scope_picker";

// A new project is a name plus a scope identity (national or a single Admin
// Area 2 — PLAN_1_PROJECT_AA2_SCOPE): it starts with no results package
// attached (the typed no-run state) and gets one from the Results package
// tab, which is where datasets and modules now come from (PLAN_RESULTS_RUNS
// Phase 3).
export function AddProjectForm(
  p: AlertComponentProps<
    {
      users: OtherUser[];
    },
    { newProjectId: string }
  >,
) {
  const [tempLabel, setTempLabel] = createSignal<string>("");
  const [tempScope, setTempScope] = createSignal<ProjectScopeSelection>({
    mode: "national",
  });

  const save = createFormAction(
    async (e: MouseEvent) => {
      e.preventDefault();
      const goodLabel = tempLabel().trim();
      if (!goodLabel) {
        return {
          success: false,
          err: t3({
            en: "You must enter a project name",
            fr: "Vous devez saisir un nom de projet",
            pt: "Tem de introduzir um nome de projeto",
          }),
        };
      }
      const adminArea2 = storedValueFromScopeSelection(tempScope());
      if (adminArea2 === undefined) {
        return {
          success: false,
          err: t3({
            en: "You must select an area for the project scope",
            fr: "Vous devez sélectionner une zone pour la portée du projet",
            pt: "Tem de selecionar uma zona para o âmbito do projeto",
          }),
        };
      }
      return await serverActions.createProject({ label: goodLabel, adminArea2 });
    },
    async () => {},
    (data) => p.close({ newProjectId: data!.newProjectId }),
  );

  return (
    <AlertFormHolder
      formId="add-project"
      header={t3({
        en: "Create project",
        fr: "Créer un projet",
        pt: "Criar projeto",
      })}
      savingState={save.state()}
      saveFunc={save.click}
      cancelFunc={() => p.close(undefined)}
      wider
    >
      <div class="ui-spy">
        <Input
          label={t3({
            en: "Project name",
            fr: "Nom du projet",
            pt: "Nome do projeto",
          })}
          value={tempLabel()}
          onChange={setTempLabel}
          fullWidth
          autoFocus
        />
        <ProjectScopePicker selection={tempScope()} onChange={setTempScope} />
      </div>
    </AlertFormHolder>
  );
}
