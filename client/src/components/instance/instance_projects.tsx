import { useNavigate } from "@solidjs/router";
import { InstanceDetail, t2, T } from "lib";
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
import { t } from "lib";

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
        text: t(" Instance is not ready yet. Try refreshing the web page."),
        intent: "danger",
      });
      return;
    }
    if (instState.data.datasetsWithData.length === 0) {
      await openAlert({
        text: t(
          "You need to add data to the instance before you can create a project",
        ),
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
          <HeadingBarMainRibbon heading={t2(T.FRENCH_UI_STRINGS.projects)}>
            <Show when={p.isGlobalAdmin || p.canCreateProjects}>
              <Button onClick={attemptAddProject} iconName="plus">
                {t2(T.FRENCH_UI_STRINGS.create_project)}
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
                    <div class="text-neutral text-sm">{t("No projects")}</div>
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
                              Project locked
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
