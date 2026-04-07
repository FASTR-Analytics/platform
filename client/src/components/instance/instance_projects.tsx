import { useNavigate } from "@solidjs/router";
import { t3 } from "lib";
import {
  Button,
  FrameTop,
  HeadingBarMainRibbon,
  LockIcon,
  getEditorWrapper,
  openAlert,
  openComponent,
} from "panther";
import { For, Show } from "solid-js";
import { AddProjectForm } from "./add_project";
import { CompareProjects } from "./compare_projects";
import { instanceState } from "~/state/instance_state";

type Props = {
  isGlobalAdmin: boolean;
  canCreateProjects: boolean;
};

export function InstanceProjects(p: Props) {
  const navigate = useNavigate();

  const { openEditor, EditorWrapper } = getEditorWrapper();

  async function compareProjects() {
    await openEditor({
      element: CompareProjects,
      props: {},
    });
  }

  async function attemptAddProject() {
    if (instanceState.datasetsWithData.length === 0) {
      await openAlert({
        text: t3({
          en: "You need to add data to the instance before you can create a project",
          fr: "Vous devez ajouter des données à l'instance avant de pouvoir créer un projet",
        }),
        intent: "danger",
      });
      return;
    }
    const res = await openComponent({
      element: AddProjectForm,
      props: {
        users: instanceState.users,
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
            <div class="ui-gap-sm flex items-center">
              <Show when={p.isGlobalAdmin}>
                <Button onClick={compareProjects} outline intent="base-100">
                  {t3({ en: "Compare projects", fr: "Comparer les projets" })}
                </Button>
              </Show>
              <Show when={p.isGlobalAdmin || p.canCreateProjects}>
                <Button onClick={attemptAddProject} iconName="plus">
                  {t3({ en: "Create project", fr: "Créer un projet" })}
                </Button>
              </Show>
            </div>
          </HeadingBarMainRibbon>
        }
      >
        <div class="ui-pad ui-gap grid h-full w-full flex-1 grid-cols-[repeat(auto-fill,minmax(15rem,1fr))] content-start overflow-auto">
          <For
            each={instanceState.projects}
            fallback={
              <div class="text-neutral text-sm">
                {t3({ en: "No projects", fr: "Aucun projet" })}
              </div>
            }
          >
            {(project) => {
              if (project.status !== "ready") {
                return (
                  <div class="ui-pad border-base-300 min-h-[150px] rounded border opacity-50">
                    <div class="ui-spy-sm col-span-1">
                      <div class="font-700">{project.label}</div>
                      <div class="text-neutral text-sm">
                        {t3({
                          en: "Copying...",
                          fr: "Copie en cours...",
                        })}
                      </div>
                    </div>
                  </div>
                );
              }
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
                        {t3({
                          en: "Project locked",
                          fr: "Projet verrouillé",
                        })}
                      </div>
                    </Show>
                  </div>
                </a>
              );
            }}
          </For>
        </div>
      </FrameTop>
    </EditorWrapper>
  );
}
