import {
  Button,
  EditorComponentProps,
  FrameTop,
  HeadingBar,
  StateHolderWrapper,
  openAlert,
  timQuery,
} from "panther";
import { Setter, Show, createSignal } from "solid-js";
import { PresentationObjectMiniDisplay } from "~/components/PresentationObjectMiniDisplay";
import { PresentationObjectPanelDisplay } from "~/components/PresentationObjectPanelDisplay";
import { ReplicateByOptionsPresentationObjectSelect } from "~/components/ReplicateByOptions";
import {
  PresentationObjectInReportInfo,
  PresentationObjectSummary,
  ProjectDetail,
  getReplicateByProp,
  isFrench,
  t2,
  T,
} from "lib";
import { useProjectDirtyStates } from "~/components/project_runner/mod";
import { getPODetailFromCacheorFetch } from "~/state/po_cache";
import { t } from "lib";

export function SelectPresentationObject(
  p: EditorComponentProps<
    {
      projectDetail: ProjectDetail;
      currentlySelected: string | undefined;
    },
    PresentationObjectInReportInfo
  >,
) {
  const pds = useProjectDirtyStates();
  const [selectedPresObj, setSelectedPresObj] = createSignal<
    PresentationObjectSummary | undefined
  >(undefined);
  const [selectedReplicant, setSelectedReplicant] = createSignal<string>("");

  const [searchText, setSearchText] = createSignal<string>("");

  async function save() {
    const presObjSummary = selectedPresObj();
    if (presObjSummary === undefined) {
      await openAlert({
        text: t("You must select a visualization in order to save"),
      });
      return;
    }
    const resPoDetail = await getPODetailFromCacheorFetch(
      p.projectDetail.id,
      presObjSummary.id,
    );
    if (resPoDetail.success === false) {
      await openAlert({
        text: resPoDetail.err,
        intent: "danger",
      });
      return;
    }
    const replicateBy = getReplicateByProp(resPoDetail.data.config);
    const goodSelectedReplicant = selectedReplicant();
    if (replicateBy && !goodSelectedReplicant) {
      await openAlert({
        text: t2(T.FRENCH_UI_STRINGS.you_must_select_a_replicant),
        intent: "danger",
      });
      return;
    }
    const poReportInfo: PresentationObjectInReportInfo = {
      id: resPoDetail.data.id,
      moduleId: resPoDetail.data.resultsValue.moduleId,
      isDefault: resPoDetail.data.isDefault,
      replicateBy,
      selectedReplicantValue: goodSelectedReplicant,
    };
    p.close(poReportInfo);
  }

  return (
    <FrameTop
      panelChildren={
        <HeadingBar
          heading={t2(T.FRENCH_UI_STRINGS.select_visualization)}
          searchText={searchText()}
          setSearchText={setSearchText}
          french={isFrench()}
        >
          <div class="ui-gap-sm flex">
            <Button
              onClick={save}
              intent="success"
              disabled={!selectedPresObj()}
              iconName="save"
            >
              {t2(T.FRENCH_UI_STRINGS.select)}
            </Button>
            <Button
              onClick={() => p.close(undefined)}
              intent="neutral"
              iconName="x"
            >
              {t2(T.FRENCH_UI_STRINGS.cancel)}
            </Button>
          </div>
        </HeadingBar>
      }
    >
      <div class="flex h-full w-full">
        <div class="w-0 flex-1 overflow-auto">
          <PresentationObjectPanelDisplay
            projectDetail={p.projectDetail}
            searchText={searchText().trim()}
            onClick={(po) => setSelectedPresObj(po)}
          />
        </div>
        <div class="ui-pad bg-primary w-1/3 overflow-auto">
          <Show
            when={selectedPresObj()}
            fallback={
              <div class="text-base-100">
                {t2(T.FRENCH_UI_STRINGS.select_a_visualization)}
              </div>
            }
            keyed
          >
            {(kP) => {
              return (
                <Side
                  projectId={p.projectDetail.id}
                  presObjId={kP.id}
                  moduleId={kP.moduleId}
                  selectedReplicant={selectedReplicant()}
                  setSelectedReplicant={setSelectedReplicant}
                />
              );
            }}
          </Show>
        </div>
      </div>
    </FrameTop>
  );
}

type SideProps = {
  projectId: string;
  presObjId: string;
  moduleId: string;
  selectedReplicant: string;
  setSelectedReplicant: Setter<string>;
};

function Side(p: SideProps) {
  const pds = useProjectDirtyStates();
  const poDetail = timQuery(async () => {
    return await getPODetailFromCacheorFetch(p.projectId, p.presObjId);
  }, t2(T.FRENCH_UI_STRINGS.loading_1));

  return (
    <StateHolderWrapper state={poDetail.state()}>
      {(keyedPoDetail) => {
        return (
          <div class="ui-pad ui-spy bg-base-100">
            <div class="">
              <PresentationObjectMiniDisplay
                projectId={p.projectId}
                presentationObjectId={keyedPoDetail.id}
                moduleId={keyedPoDetail.resultsValue.moduleId}
                shapeType={"force-aspect-video"}
                repliantOverride={{
                  selectedReplicantValue: p.selectedReplicant,
                }}
                scalePixelResolution={0.5}
              />
            </div>
            <Show when={getReplicateByProp(keyedPoDetail.config)} keyed>
              {(keyedReplicateBy) => {
                return (
                  <div class="">
                    <div class="pb-1">{t2(T.FRENCH_UI_STRINGS.replicant)}</div>
                    <ReplicateByOptionsPresentationObjectSelect
                      replicateBy={keyedReplicateBy}
                      config={keyedPoDetail.config}
                      poDetail={keyedPoDetail}
                      selectedReplicantValue={p.selectedReplicant}
                      setSelectedReplicant={p.setSelectedReplicant}
                      fullWidth
                    />
                  </div>
                );
              }}
            </Show>
          </div>
        );
      }}
    </StateHolderWrapper>
  );
}
