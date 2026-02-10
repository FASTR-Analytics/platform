import { useNavigate } from "@solidjs/router";
import { InstanceDetail, t3 } from "lib";
import {
  Button,
  FrameTop,
  HeadingBarMainRibbon,
  LockIcon,
  StateHolderWrapper,
  TimQuery,
  getEditorWrapper,
  openAlert,
  openComponent,
} from "panther";
import { For, Show } from "solid-js";
import { AddProjectForm } from "./add_project";

type Props = {
  isGlobalAdmin: boolean;
  canCreateProjects: boolean;
  instanceDetail: TimQuery<InstanceDetail>;
};

export function InstanceProjects(p: Props) {
  const navigate = useNavigate();

  const { openEditor, EditorWrapper } = getEditorWrapper();

  async function attemptAddProject() {
    const instState = p.instanceDetail.state();
    if (instState.status !== "ready") {
      await openAlert({
        text: t3({ en: "Instance is not ready yet. Try refreshing the web page.", fr: "L'instance n'est pas encore prête. Essayez de rafraîchir la page." }),
        intent: "danger",
      });
      return;
    }
    if (instState.data.datasetsWithData.length === 0) {
      await openAlert({
        text: t3({ en: "You need to add data to the instance before you can create a project", fr: "Vous devez ajouter des données à l'instance avant de pouvoir créer un projet" }),
        intent: "danger",
      });
      return;
    }
    const res = await openComponent({
      element: AddProjectForm,
      props: {
        instanceDetail: p.instanceDetail,
        users: instState.data.users,
      },
    });
    if (res === undefined) {
      return;
    }
    navigate(`/?p=${res.newProjectId}`);
  }

  return (
    <EditorWrapper>
      <FrameTop
        panelChildren={
          <HeadingBarMainRibbon heading={t3({ en: "Projects", fr: "Projets" })}>
            <Show when={p.isGlobalAdmin || p.canCreateProjects}>
              <Button onClick={attemptAddProject} iconName="plus">
                {t3({ en: "Create project", fr: "Créer un projet" })}
              </Button>
            </Show>
          </HeadingBarMainRibbon>
        }
      >
        <StateHolderWrapper state={p.instanceDetail.state()}>
          {(keyedInstanceDetail) => {
            return (
              <div class="ui-pad ui-gap grid h-full w-full flex-1 grid-cols-[repeat(auto-fill,minmax(15rem,1fr))] content-start overflow-auto">
                <For
                  each={keyedInstanceDetail.projects}
                  fallback={
                    <div class="text-neutral text-sm">{t3({ en: "No projects", fr: "Aucun projet" })}</div>
                  }
                >
                  {(project) => {
                    return (
                      <a
                        href={`/?p=${project.id}`}
                        class="ui-pad ui-hoverable border-base-300 min-h-[150px] rounded border"
                      >
                        <div class="ui-spy-sm col-span-1">
                          <div class="font-700">{project.label}</div>
                          <Show when={project.isLocked}>
                            <div class="ui-gap-sm text-primary flex text-sm">
                              <span class="relative inline-flex h-[1.25em] w-[1.25em]">
                                <LockIcon />
                              </span>
                              {t3({ en: "Project locked", fr: "Projet verrouillé" })}
                            </div>
                          </Show>
                        </div>
                      </a>
                    );
                  }}
                </For>
              </div>
            );
          }}
        </StateHolderWrapper>
      </FrameTop>
    </EditorWrapper>
  );
}
