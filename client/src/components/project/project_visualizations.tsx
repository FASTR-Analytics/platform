import { useNavigate } from "@solidjs/router";
import { ProjectDetail, isFrench, t, t2, T, VisualizationGroupingMode } from "lib";
import {
  Button,
  FrameTop,
  HeadingBar,
  OpenEditorProps,
  Select,
  downloadJson,
  openAlert,
  openComponent,
} from "panther";
import { Show, createSignal } from "solid-js";
import { PresentationObjectPanelDisplay } from "~/components/PresentationObjectPanelDisplay";
import {
  useOptimisticSetLastUpdated,
  useOptimisticSetProjectLastUpdated,
} from "~/components/project_runner/mod";
import { serverActions } from "~/server_actions";
import { vizGroupingMode, setVizGroupingMode } from "~/state/ui";
import { AddVisualization } from "./add_visualization";

const GROUPING_OPTIONS: { value: VisualizationGroupingMode; label: string }[] = [
  { value: "module", label: "By module" },
  { value: "folders", label: "By folder" },
  { value: "metric", label: "By metric" },
  { value: "ai-status", label: "By status" },
  { value: "flat", label: "Flat list" },
];

type Props = {
  projectDetail: ProjectDetail;
  isGlobalAdmin: boolean;
  attemptGetProjectDetail: () => Promise<void>;
  silentRefreshProject: () => Promise<void>;
  openProjectEditor: <TProps, TReturn>(
    v: OpenEditorProps<TProps, TReturn>,
  ) => Promise<TReturn | undefined>;
};

export function ProjectVisualizations(p: Props) {
  const navigate = useNavigate();
  const optimisticSetLastUpdated = useOptimisticSetLastUpdated();
  const optimisticSetProjectLastUpdated = useOptimisticSetProjectLastUpdated();

  const [searchText, setSearchText] = createSignal<string>("");

  async function attempAddPresentationObject() {
    const res = await openComponent({
      element: AddVisualization,
      props: {
        projectId: p.projectDetail.id,
        isGlobalAdmin: p.isGlobalAdmin,
      },
    });
    if (res === undefined) {
      return;
    }
    optimisticSetLastUpdated(
      "presentation_objects",
      res.newPresentationObjectId,
      res.lastUpdated,
    );
    optimisticSetProjectLastUpdated(res.lastUpdated);
    navigate(
      `/?p=${p.projectDetail.id}&m=${res.moduleId}&v=${res.newPresentationObjectId}`,
    );
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
          <div class="ui-gap-sm flex items-center">
            <Select
              options={GROUPING_OPTIONS}
              value={vizGroupingMode()}
              onChange={(v) => setVizGroupingMode(v as VisualizationGroupingMode)}
              size="sm"
            />
            <Show
              when={
                !p.projectDetail.isLocked &&
                p.projectDetail.projectModules.length > 0
              }
            >
              <Button onClick={attempAddPresentationObject} iconName="plus">
                {t2(T.FRENCH_UI_STRINGS.create_visualization)}
              </Button>
            </Show>
          </div>
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
            navigate(`/?p=${p.projectDetail.id}&v=${po.id}`);
          }}
        />
      </Show>
    </FrameTop>
  );
}
