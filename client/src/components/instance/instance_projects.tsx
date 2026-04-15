import { useNavigate } from "@solidjs/router";
import { t3 } from "lib";
import {
  Button,
  FrameTop,
  HeadingBarMainRibbon,
  LockIcon,
  getEditorWrapper,
  openComponent,
} from "panther";
import { For, Show } from "solid-js";
import { AddProjectForm } from "./add_project";
import { CompareProjects } from "./compare_projects";
import { instanceState } from "~/state/instance/t1_store";

type Props = {
  isGlobalAdmin: boolean;
  canCreateProjects: boolean;
};

function formatTimeAgo(isoString: string): string {
  const date = new Date(isoString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60_000);
  const diffHours = Math.floor(diffMs / 3_600_000);
  const diffDays = Math.floor(diffMs / 86_400_000);
  if (diffMins < 1) return t3({ en: "Just now", fr: "À l'instant" });
  if (diffMins < 60) return t3({ en: `${diffMins}m ago`, fr: `Il y a ${diffMins}m` });
  if (diffHours < 24) return t3({ en: `${diffHours}h ago`, fr: `Il y a ${diffHours}h` });
  if (diffDays < 30) return t3({ en: `${diffDays}d ago`, fr: `Il y a ${diffDays}j` });
  return date.toLocaleDateString();
}

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
                  class="ui-pad ui-hoverable border-base-300 flex min-h-[150px] flex-col justify-between rounded border"
                >
                  <div class="ui-spy-sm">
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
                  <Show when={project.lastActivityAt}>
                    {(ts) => (
                      <div class="text-neutral text-xs">
                        {formatTimeAgo(ts())}
                      </div>
                    )}
                  </Show>
                </a>
              );
            }}
          </For>
        </div>
      </FrameTop>
    </EditorWrapper>
  );
}
