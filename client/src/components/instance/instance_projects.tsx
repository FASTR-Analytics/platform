import { useNavigate } from "@solidjs/router";
import { t3 } from "lib";
import {
  Button,
  FrameTop,
  HeadingBarMainRibbon,
  Icon,
  getEditorWrapper,
  openAlert,
  openComponent,
} from "panther";
import { createMemo, For, Show } from "solid-js";
import { serverActions } from "~/server_actions";
import { AddProjectForm } from "./add_project";
import { CompareProjects } from "./compare_projects";
import { PendingDeletions } from "./pending_deletions";
import { instanceState } from "~/state/instance/t1_store";
import { projectsSortMode, setProjectsSortMode } from "~/state/t4_ui";
import { SortControl, sortBySortMode } from "~/components/_shared/sort_control";

type Props = {
  canCreateProjects: boolean;
};

function formatTimeAgo(isoString: string): string {
  const date = new Date(isoString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60_000);
  const diffHours = Math.floor(diffMs / 3_600_000);
  const diffDays = Math.floor(diffMs / 86_400_000);
  if (diffMins < 1)
    return t3({ en: "Just now", fr: "À l'instant", pt: "Agora mesmo" });
  if (diffMins < 60)
    return t3({
      en: `${diffMins}m ago`,
      fr: `Il y a ${diffMins}m`,
      pt: `há ${diffMins}m`,
    });
  if (diffHours < 24)
    return t3({
      en: `${diffHours}h ago`,
      fr: `Il y a ${diffHours}h`,
      pt: `há ${diffHours}h`,
    });
  if (diffDays < 30)
    return t3({
      en: `${diffDays}d ago`,
      fr: `Il y a ${diffDays}j`,
      pt: `há ${diffDays}d`,
    });
  return date.toLocaleDateString();
}

export function InstanceProjects(p: Props) {
  const navigate = useNavigate();

  const { openEditor, EditorWrapper } = getEditorWrapper();

  const pendingDeletionCount = createMemo(
    () =>
      instanceState.projects.filter(
        (proj) => proj.status === "pending_deletion",
      ).length,
  );

  const sortedProjects = createMemo(() =>
    sortBySortMode(
      instanceState.projects.filter(
        (proj) => proj.status !== "pending_deletion",
      ),
      projectsSortMode(),
      (proj) => proj.label,
      (proj) => proj.lastActivityAt,
    ),
  );

  async function compareProjects() {
    await openEditor({
      element: CompareProjects,
      props: {},
    });
  }

  async function openPendingDeletions() {
    await openEditor({
      element: PendingDeletions,
      props: {},
    });
  }

  async function attemptAddProject() {
    const spaceRes = await serverActions.getDiskSpace({});
    if (spaceRes.success && !spaceRes.data.ok) {
      await openAlert({
        text: t3({
          en: `Not enough disk space to create a project. Only ${spaceRes.data.availableGB} GB available.`,
          fr: `Espace disque insuffisant pour créer un projet. Seulement ${spaceRes.data.availableGB} Go disponible.`,
          pt: `Espaço em disco insuficiente para criar um projeto. Apenas ${spaceRes.data.availableGB} GB disponíveis.`,
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
          <HeadingBarMainRibbon
            heading={t3({ en: "Projects", fr: "Projets", pt: "Projetos" })}
          >
            <div class="ui-gap-sm flex items-center">
              <SortControl
                value={projectsSortMode()}
                onChange={setProjectsSortMode}
                outlineAndBase100
              />
              <Show when={instanceState.currentUserIsGlobalAdmin}>
                <Button onClick={compareProjects} outline onBackground="base-content" intent="base-100">
                  {t3({
                    en: "Compare projects",
                    fr: "Comparer les projets",
                    pt: "Comparar projetos",
                  })}
                </Button>
              </Show>
              <Show
                when={
                  instanceState.currentUserIsGlobalAdmin &&
                  pendingDeletionCount() > 0
                }
              >
                <Button
                  onClick={openPendingDeletions}
                  outline
                  onBackground="base-content"
                  intent="base-100"
                >
                  {t3({
                    en: `Pending deletions (${pendingDeletionCount()})`,
                    fr: `Suppressions en attente (${pendingDeletionCount()})`,
                    pt: `Eliminações pendentes (${pendingDeletionCount()})`,
                  })}
                </Button>
              </Show>
              <Show
                when={
                  instanceState.currentUserIsGlobalAdmin || p.canCreateProjects
                }
              >
                <Button onClick={attemptAddProject} iconName="plus">
                  {t3({
                    en: "Create project",
                    fr: "Créer un projet",
                    pt: "Criar projeto",
                  })}
                </Button>
              </Show>
            </div>
          </HeadingBarMainRibbon>
        }
      >
        <div class="ui-pad ui-gap grid h-full w-full flex-1 grid-cols-[repeat(auto-fill,minmax(15rem,1fr))] content-start overflow-auto">
          <For
            each={sortedProjects()}
            fallback={
              <div class="text-base-content-muted text-sm">
                {t3({
                  en: "No projects",
                  fr: "Aucun projet",
                  pt: "Sem projetos",
                })}
              </div>
            }
          >
            {(project) => (
              <Show
                when={project.status === "ready"}
                fallback={
                  <div class="ui-pad min-h-[150px] rounded border opacity-50">
                    <div class="ui-spy-sm col-span-1">
                      <div class="font-700">{project.label}</div>
                      <div class="text-base-content-muted text-sm">
                        {t3({
                          en: "Copying...",
                          fr: "Copie en cours...",
                          pt: "A copiar...",
                        })}
                      </div>
                    </div>
                  </div>
                }
              >
                <a
                  href={`/?p=${project.id}`}
                  class="ui-pad ui-hoverable-base-100 flex min-h-[150px] flex-col justify-between rounded border"
                >
                  <div class="ui-spy-sm">
                    <div class="font-700">{project.label}</div>
                    <Show when={project.isLocked}>
                      <div class="ui-gap-sm text-primary flex text-sm">
                        <span class="relative inline-flex h-[1.25em] w-[1.25em]">
                          <Icon iconName="lock" />
                        </span>
                        {t3({
                          en: "Project locked",
                          fr: "Projet verrouillé",
                          pt: "Projeto bloqueado",
                        })}
                      </div>
                    </Show>
                  </div>
                  <Show when={project.lastActivityAt}>
                    {(ts) => (
                      <div class="ui-text-caption">
                        {formatTimeAgo(ts())}
                      </div>
                    )}
                  </Show>
                </a>
              </Show>
            )}
          </For>
        </div>
      </FrameTop>
    </EditorWrapper>
  );
}
