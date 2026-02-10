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
  getModuleIdForMetric,
  PresentationObjectSummary,
  ProjectDetail,
  getReplicateByProp,
  isFrench,
  t3,
  TC,
} from "lib";
import { getPODetailFromCacheorFetch } from "~/state/po_cache";

type SelectVisualizationResult = {
  visualizationId: string;
  replicant?: string;
};

export function SelectVisualizationForSlide(
  p: EditorComponentProps<
    { projectDetail: ProjectDetail },
    SelectVisualizationResult
  >,
) {
  const [selectedPresObj, setSelectedPresObj] = createSignal<PresentationObjectSummary | undefined>(undefined);
  const [selectedReplicant, setSelectedReplicant] = createSignal<string>("");
  const [searchText, setSearchText] = createSignal<string>("");

  async function save() {
    const presObjSummary = selectedPresObj();
    if (presObjSummary === undefined) {
      await openAlert({ text: t3({ en: "You must select a visualization in order to save", fr: "Vous devez sélectionner une visualisation pour sauvegarder" }) });
      return;
    }
    const resPoDetail = await getPODetailFromCacheorFetch(p.projectDetail.id, presObjSummary.id);
    if (resPoDetail.success === false) {
      await openAlert({ text: resPoDetail.err, intent: "danger" });
      return;
    }
    const replicateBy = getReplicateByProp(resPoDetail.data.config);
    const goodSelectedReplicant = selectedReplicant();
    if (replicateBy && !goodSelectedReplicant) {
      await openAlert({ text: t3({ en: "You must select a replicant", fr: "Un réplicant doit être sélectionné" }), intent: "danger" });
      return;
    }
    p.close({
      visualizationId: presObjSummary.id,
      replicant: goodSelectedReplicant || undefined,
    });
  }

  return (
    <FrameTop
      panelChildren={
        <HeadingBar
          heading={t3({ en: "Select visualization", fr: "Sélectionner la visualisation" })}
          searchText={searchText()}
          setSearchText={setSearchText}
          french={isFrench()}
        >
          <div class="ui-gap-sm flex">
            <Button onClick={save} intent="success" disabled={!selectedPresObj()} iconName="check">
              {t3({ en: "Select", fr: "Sélectionner" })}
            </Button>
            <Button onClick={() => p.close(undefined)} intent="neutral" iconName="x">
              {t3(TC.cancel)}
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
            fallback={<div class="text-base-100">{t3({ en: "Select a visualization", fr: "Sélectionner une visualisation" })}</div>}
            keyed
          >
            {(kP) => (
              <Side
                projectId={p.projectDetail.id}
                presObjId={kP.id}
                moduleId={getModuleIdForMetric(kP.metricId)}
                selectedReplicant={selectedReplicant()}
                setSelectedReplicant={setSelectedReplicant}
              />
            )}
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
  const poDetail = timQuery(async () => {
    return await getPODetailFromCacheorFetch(p.projectId, p.presObjId);
  }, t3(TC.loading));

  return (
    <StateHolderWrapper state={poDetail.state()}>
      {(keyedPoDetail) => (
        <div class="ui-pad ui-spy bg-base-100">
          <div>
            <PresentationObjectMiniDisplay
              projectId={p.projectId}
              presentationObjectId={keyedPoDetail.id}
              moduleId={getModuleIdForMetric(keyedPoDetail.resultsValue.id)}
              shapeType={"force-aspect-video"}
              repliantOverride={{ selectedReplicantValue: p.selectedReplicant }}
              scalePixelResolution={0.5}
            />
          </div>
          <Show when={getReplicateByProp(keyedPoDetail.config)} keyed>
            {(keyedReplicateBy) => (
              <div>
                <div class="pb-1">{t3({ en: "Replicant", fr: "Réplicant" })}</div>
                <ReplicateByOptionsPresentationObjectSelect
                  replicateBy={keyedReplicateBy}
                  config={keyedPoDetail.config}
                  poDetail={keyedPoDetail}
                  selectedReplicantValue={p.selectedReplicant}
                  setSelectedReplicant={p.setSelectedReplicant}
                  fullWidth
                />
              </div>
            )}
          </Show>
        </div>
      )}
    </StateHolderWrapper>
  );
}
