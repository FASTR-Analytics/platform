import { InstanceDetail, PresentationObjectSummary, isFrench, t, t2, T } from "lib";
import {
  Button,
  FrameTop,
  HeadingBar,
  OpenEditorProps,
  openAlert,
  openComponent,
} from "panther";
import { Show, createSignal } from "solid-js";
import { PresentationObjectPanelDisplay } from "~/components/PresentationObjectPanelDisplay";
import { VisualizationEditor } from "../visualization";
import { AddVisualization } from "./add_visualization";
import { getPODetailFromCacheorFetch } from "~/state/po_cache";
import { updateProjectView } from "~/state/ui";
import { useProjectDetail } from "~/components/project_runner/mod";
import { useAIProjectContext } from "~/components/project_ai/context";
import { snapshotForVizEditor } from "~/utils/snapshot";

type Props = {
  instanceDetail: InstanceDetail;
  isGlobalAdmin: boolean;
  openProjectEditor: <TProps, TReturn>(
    v: OpenEditorProps<TProps, TReturn>,
  ) => Promise<TReturn | undefined>;
};

export function ProjectVisualizations(p: Props) {
  const projectDetail = useProjectDetail();
  const [searchText, setSearchText] = createSignal<string>("");
  const { aiContext } = useAIProjectContext();

  async function openVisualizationEditor(po: PresentationObjectSummary) {
    if (po.isDefault) {
      const poDetailRes = await getPODetailFromCacheorFetch(
        projectDetail.id,
        po.id,
      );
      if (poDetailRes.success === false) {
        await openAlert({
          text: "Failed to load visualization",
          intent: "danger",
        });
        return;
      }

      const result = await p.openProjectEditor({
        element: VisualizationEditor,
        props: {
          mode: "create" as const,
          projectId: projectDetail.id,
          label: `Copy of ${poDetailRes.data.label}`,
          isGlobalAdmin: p.isGlobalAdmin,
          returnToContext: aiContext(),
          ...snapshotForVizEditor({
            projectDetail,
            instanceDetail: p.instanceDetail,
            resultsValue: poDetailRes.data.resultsValue,
            config: poDetailRes.data.config,
          }),
        },
      });

      if (result?.created) {
        // SSE will update projectDetail automatically
        updateProjectView({
          vizGroupingMode: "folders",
          vizSelectedGroup: result.created.folderId === null ? "_unfiled" : result.created.folderId,
        });
      }
      return;
    }

    await p.openProjectEditor({
      element: VisualizationEditor,
      props: {
        mode: "edit" as const,
        projectId: projectDetail.id,
        presentationObjectId: po.id,
        isGlobalAdmin: p.isGlobalAdmin,
        returnToContext: aiContext(),
        ...snapshotForVizEditor({
          projectDetail,
          instanceDetail: p.instanceDetail,
        }),
      },
    });
    // SSE will update projectDetail automatically
  }

  async function attempAddPresentationObject() {
    const res = await openComponent({
      element: AddVisualization,
      props: {
        projectId: projectDetail.id,
        isGlobalAdmin: p.isGlobalAdmin,
        metrics: projectDetail.metrics,
      },
    });
    if (res === undefined) {
      return;
    }

    await p.openProjectEditor({
      element: VisualizationEditor,
      props: {
        mode: "create" as const,
        projectId: projectDetail.id,
        label: res.label,
        isGlobalAdmin: p.isGlobalAdmin,
        returnToContext: aiContext(),
        ...snapshotForVizEditor({
          projectDetail,
          instanceDetail: p.instanceDetail,
          resultsValue: res.resultsValue,
          config: res.config,
        }),
      },
    });
  }

  // async function attemptAICreatePresentationObject() {
  //   const res = await openComponent({
  //     element: CreateVisualizationFromPromptModal,
  //     props: {
  //       projectId: projectDetail.id,
  //       instanceDetail: p.instanceDetail,
  //       projectDetail: projectDetail,
  //     },
  //   });
  //   if (res === undefined) {
  //     return;
  //   }

  //   await p.openProjectEditor({
  //     element: VisualizationEditor,
  //     props: {
  //       mode: "create" as const,
  //       projectId: projectDetail.id,
  //       label: res.label,
  //       resultsValue: res.resultsValue,
  //       config: res.config,
  //       instanceDetail: p.instanceDetail,
  //       projectDetail: projectDetail,
  //       isGlobalAdmin: p.isGlobalAdmin,
  //     },
  //   });
  // }

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
          class="border-base-300"
        >
          <Show
            when={
              !projectDetail.isLocked &&
              projectDetail.projectModules.length > 0
            }
          >
            <div class="flex items-center ui-gap-sm">
              {/* <Button onClick={attemptAICreatePresentationObject} iconName="sparkles" outline>
                {t("Create with AI")}
              </Button> */}
              <Button onClick={attempAddPresentationObject} iconName="plus">
                {t2(T.FRENCH_UI_STRINGS.create_visualization)}
              </Button>
            </div>
          </Show>
        </HeadingBar>
      }
    >
      <Show
        when={projectDetail.projectModules.length > 0}
        fallback={
          <div class="ui-pad text-neutral text-sm">
            {t(
              "You need to enable at least one module to create visualizations",
            )}
          </div>
        }
      >
        <PresentationObjectPanelDisplay
          projectDetail={projectDetail}
          searchText={searchText().trim()}
          onClick={openVisualizationEditor}
        />
      </Show>
    </FrameTop>
  );
}
