import {
  PresentationObjectConfig,
  PresentationObjectDetail,
  PresentationObjectEditorDetail,
  ProjectState,
  ResultsValue,
  ResultsValueInfoForPresentationObject,
  t3,
  TC,
} from "lib";
import { AlertComponentProps, StateHolderWrapper, createQuery } from "panther";
import { Match, Switch } from "solid-js";
import {
  getPODetailFromCacheorFetch,
  getResultsValueInfoForPresentationObjectFromCacheOrFetch,
} from "~/state/project/t2_presentation_objects";
import { VisualizationEditorInner } from "~/components/figure_editor/visualization_editor_inner";
import type { ProjectAIViewState } from "~/components/project_ai/ai_views";

// The standalone visualization editor of the project's Visualizations tab:
// edit a saved visualization or create one. The embedded figure editor is
// `~/components/figure_editor`.

// Both modes open through the one element, so a caller's result is the union
// of the two returns; `created?: never` keeps `result?.created` a valid read.
export type EditModeReturn =
  | undefined
  | { deleted: true; created?: never }
  | { saved: true; created?: never };
export type CreateModeReturn =
  | undefined
  | { created: { presentationObjectId: string; folderId: string | null } };

type EditModeProps = {
  mode: "edit";
  presentationObjectId: string;
  projectId: string;
  projectStateSnapshot: ProjectState;
  returnToContext?: ProjectAIViewState;
  close: (result: EditModeReturn) => void;
};

type CreateModeProps = {
  mode: "create";
  label: string;
  resultsValueSnapshot: ResultsValue;
  configSnapshot: PresentationObjectConfig;
  projectId: string;
  projectStateSnapshot: ProjectState;
  returnToContext?: ProjectAIViewState;
  close: (result: CreateModeReturn) => void;
};

export type VisualizationEditorProps = EditModeProps | CreateModeProps;

export function VisualizationEditor(
  p: AlertComponentProps<VisualizationEditorProps, EditModeReturn | CreateModeReturn>,
) {
  return (
    <Switch>
      <Match when={p.mode === "edit" && p} keyed>
        {(editProps) => <VisualizationEditorEdit {...editProps} />}
      </Match>
      <Match when={p.mode === "create" && p} keyed>
        {(createProps) => <VisualizationEditorCreate {...createProps} />}
      </Match>
    </Switch>
  );
}

function VisualizationEditorEdit(p: EditModeProps) {
  type CombinedData = {
    poDetail: PresentationObjectDetail;
    resultsValueInfo: ResultsValueInfoForPresentationObject;
  };

  const combinedData = createQuery<CombinedData>(async () => {
    const poDetailRes = await getPODetailFromCacheorFetch(
      p.projectId,
      p.presentationObjectId,
    );
    if (poDetailRes.success === false) {
      return poDetailRes;
    }
    const resultsValueInfoRes =
      await getResultsValueInfoForPresentationObjectFromCacheOrFetch(
        p.projectId,
        poDetailRes.data.resultsValue.id,
      );
    if (resultsValueInfoRes.success === false) {
      return resultsValueInfoRes;
    }
    return {
      success: true,
      data: {
        poDetail: poDetailRes.data,
        resultsValueInfo: resultsValueInfoRes.data,
      },
    } as const;
  }, t3(TC.loading));

  return (
    <StateHolderWrapper state={combinedData.state()}>
      {(keyedCombinedData: CombinedData) => (
        <VisualizationEditorInner
          mode="edit"
          projectStateSnapshot={p.projectStateSnapshot}
          poDetail={keyedCombinedData.poDetail}
          resultsValueInfo={keyedCombinedData.resultsValueInfo}
          returnToContext={p.returnToContext}
          onClose={p.close}
        />
      )}
    </StateHolderWrapper>
  );
}

function VisualizationEditorCreate(p: CreateModeProps) {
  const resultsValueInfo = createQuery(
    () =>
      getResultsValueInfoForPresentationObjectFromCacheOrFetch(
        p.projectId,
        p.resultsValueSnapshot.id,
      ),
    t3(TC.loading),
  );

  const syntheticPoDetail: PresentationObjectEditorDetail = {
    id: "",
    projectId: p.projectId,
    lastUpdated: "",
    label: p.label,
    resultsValue: p.resultsValueSnapshot,
    config: p.configSnapshot,
    isDefault: false,
    folderId: null,
  };

  return (
    <StateHolderWrapper state={resultsValueInfo.state()}>
      {(keyedResultsValueInfo: ResultsValueInfoForPresentationObject) => (
        <VisualizationEditorInner
          mode="create"
          projectStateSnapshot={p.projectStateSnapshot}
          poDetail={syntheticPoDetail}
          resultsValueInfo={keyedResultsValueInfo}
          returnToContext={p.returnToContext}
          onClose={p.close}
        />
      )}
    </StateHolderWrapper>
  );
}
