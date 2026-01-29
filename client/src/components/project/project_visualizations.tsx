import { ProjectDetail, InstanceDetail, PresentationObjectSummary, isFrench, t, t2, T } from "lib";
import {
  Button,
  FrameTop,
  HeadingBar,
  OpenEditorProps,
  openComponent,
} from "panther";
import { Show, createSignal } from "solid-js";
import { PresentationObjectPanelDisplay } from "~/components/PresentationObjectPanelDisplay";
import { VisualizationEditor } from "../visualization";
import { AddVisualization } from "./add_visualization";
import { CreateVisualizationFromPromptModal } from "./create_visualization_from_prompt_modal";

type Props = {
  projectDetail: ProjectDetail;
  instanceDetail: InstanceDetail;
  isGlobalAdmin: boolean;
  attemptGetProjectDetail: () => Promise<void>;
  silentRefreshProject: () => Promise<void>;
  openProjectEditor: <TProps, TReturn>(
    v: OpenEditorProps<TProps, TReturn>,
  ) => Promise<TReturn | undefined>;
  openVisualizationEditor: (
    po: PresentationObjectSummary,
    projectDetail: any,
    instanceDetail: any,
  ) => Promise<void>;
};

export function ProjectVisualizations(p: Props) {
  const [searchText, setSearchText] = createSignal<string>("");

  async function attempAddPresentationObject() {
    const res = await openComponent({
      element: AddVisualization,
      props: {
        projectId: p.projectDetail.id,
        isGlobalAdmin: p.isGlobalAdmin,
        metrics: p.projectDetail.metrics,
      },
    });
    if (res === undefined) {
      return;
    }

    const result = await p.openProjectEditor({
      element: VisualizationEditor,
      props: {
        mode: "create" as const,
        projectId: p.projectDetail.id,
        label: res.label,
        resultsValue: res.resultsValue,
        config: res.config,
        instanceDetail: p.instanceDetail,
        projectDetail: p.projectDetail,
        isGlobalAdmin: p.isGlobalAdmin,
      },
    });

    if (result?.created) {
      await p.silentRefreshProject();
    }
  }

  async function attemptAICreatePresentationObject() {
    const res = await openComponent({
      element: CreateVisualizationFromPromptModal,
      props: {
        projectId: p.projectDetail.id,
        instanceDetail: p.instanceDetail,
        projectDetail: p.projectDetail,
      },
    });
    if (res === undefined) {
      return;
    }

    const result = await p.openProjectEditor({
      element: VisualizationEditor,
      props: {
        mode: "create" as const,
        projectId: p.projectDetail.id,
        label: res.label,
        resultsValue: res.resultsValue,
        config: res.config,
        instanceDetail: p.instanceDetail,
        projectDetail: p.projectDetail,
        isGlobalAdmin: p.isGlobalAdmin,
      },
    });

    if (result?.created) {
      await p.silentRefreshProject();
    }
  }

  // async function attemptBackupPresentationObjects() {
  //   const res = await serverActions.backupPresentationObjects({
  //     projectId: p.projectDetail.id,
  //   });
  //   if (res.success === false) {
  //     await openAlert({ text: t("Backup failed"), intent: "danger" });
  //     return;
  //   }
  //   downloadJson(
  //     res.data,
  //     `visualizations_${new Date().toDateString().replaceAll(" ", "_")}.json`,
  //     "keep-undefined",
  //   );
  // }

  return (
    <FrameTop
      panelChildren={
        <HeadingBar
          heading={t2(T.FRENCH_UI_STRINGS.visualizations)}
          searchText={searchText()}
          setSearchText={setSearchText}
          french={isFrench()}
        >
          <Show
            when={
              !p.projectDetail.isLocked &&
              p.projectDetail.projectModules.length > 0
            }
          >
            <div class="flex items-center ui-gap-sm">
              <Button onClick={attemptAICreatePresentationObject} iconName="sparkles" outline>
                {t("Create with AI")}
              </Button>
              <Button onClick={attempAddPresentationObject} iconName="plus">
                {t2(T.FRENCH_UI_STRINGS.create_visualization)}
              </Button>
            </div>
          </Show>
        </HeadingBar>
      }
    >
      <Show
        when={p.projectDetail.projectModules.length > 0}
        fallback={
          <div class="ui-pad text-neutral text-sm">
            {t(
              "You need to enable at least one module to create visualizations",
            )}
          </div>
        }
      >
        <PresentationObjectPanelDisplay
          projectDetail={p.projectDetail}
          searchText={searchText().trim()}
          onClick={(po) => {
            p.openVisualizationEditor(po, p.projectDetail, p.instanceDetail);
          }}
        />
      </Show>
    </FrameTop>
  );
}
