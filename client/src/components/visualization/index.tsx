import {
  PresentationObjectConfig,
  PresentationObjectDetail,
  ProjectDetail,
  ResultsValue,
  ResultsValueInfoForPresentationObject,
  t3,
  TC,
  type InstanceDetail,
} from "lib";
import { AlertComponentProps, StateHolderWrapper, timQuery } from "panther";
import { Match, Switch } from "solid-js";
import {
  getPODetailFromCacheorFetch,
  getResultsValueInfoForPresentationObjectFromCacheOrFetch,
} from "~/state/po_cache";
import { VisualizationEditorInner } from "./visualization_editor_inner";
import type { AIContext } from "~/components/project_ai/types";

export type EditModeReturn = undefined | { deleted: true } | { saved: true };
export type CreateModeReturn =
  | undefined
  | { created: { presentationObjectId: string; folderId: string | null } };
export type EphemeralModeReturn =
  | undefined
  | { updated: { config: PresentationObjectConfig } };

type EditModeProps = {
  mode: "edit";
  presentationObjectId: string;
  projectId: string;
  instanceDetail: InstanceDetail;
  projectDetail: ProjectDetail;
  isGlobalAdmin: boolean;
  returnToContext?: AIContext;
  close: (result: EditModeReturn) => void;
};

type CreateModeProps = {
  mode: "create";
  label: string;
  resultsValue: ResultsValue;
  config: PresentationObjectConfig;
  projectId: string;
  instanceDetail: InstanceDetail;
  projectDetail: ProjectDetail;
  isGlobalAdmin: boolean;
  returnToContext?: AIContext;
  close: (result: CreateModeReturn) => void;
};

type EphemeralModeProps = {
  mode: "ephemeral";
  label: string;
  resultsValue: ResultsValue;
  config: PresentationObjectConfig;
  projectId: string;
  instanceDetail: InstanceDetail;
  projectDetail: ProjectDetail;
  isGlobalAdmin: boolean;
  returnToContext?: AIContext;
  close: (result: EphemeralModeReturn) => void;
};

export type VisualizationEditorProps =
  | EditModeProps
  | CreateModeProps
  | EphemeralModeProps;

export function VisualizationEditor(
  p: AlertComponentProps<VisualizationEditorProps, any>,
) {
  return (
    <Switch>
      <Match when={p.mode === "edit" && p}>
        {(editProps) => (
          <VisualizationEditorEdit
            {...(editProps() as EditModeProps & { close: any })}
          />
        )}
      </Match>
      <Match when={p.mode === "create" && p}>
        {(createProps) => (
          <VisualizationEditorCreate
            {...(createProps() as CreateModeProps & { close: any })}
          />
        )}
      </Match>
      <Match when={p.mode === "ephemeral" && p}>
        {(ephemeralProps) => (
          <VisualizationEditorEphemeral
            {...(ephemeralProps() as EphemeralModeProps & { close: any })}
          />
        )}
      </Match>
    </Switch>
  );
}

function VisualizationEditorEdit(p: EditModeProps) {
  type CombinedData = {
    poDetail: PresentationObjectDetail;
    resultsValueInfo: ResultsValueInfoForPresentationObject;
  };

  const combinedData = timQuery<CombinedData>(async () => {
    console.log("[VIZ EDIT] timQuery starting for:", p.presentationObjectId);
    const [poDetailRes, resultsValueInfoRes] = await Promise.all([
      getPODetailFromCacheorFetch(p.projectId, p.presentationObjectId),
      (async () => {
        const pd = await getPODetailFromCacheorFetch(
          p.projectId,
          p.presentationObjectId,
        );
        if (pd.success === false) {
          return pd;
        }
        return getResultsValueInfoForPresentationObjectFromCacheOrFetch(
          p.projectId,
          pd.data.resultsValue.id,
        );
      })(),
    ]);

    if (poDetailRes.success === false) {
      return poDetailRes;
    }
    if (resultsValueInfoRes.success === false) {
      return resultsValueInfoRes;
    }

    console.log("[VIZ EDIT] timQuery completed successfully");
    return {
      success: true,
      data: {
        poDetail: poDetailRes.data,
        resultsValueInfo: resultsValueInfoRes.data,
      },
    } as const;
  }, t3(TC.loading));

  // async function attemptDeleteFromError() {
  //   const deleteAction = timActionDelete(
  //     t2(T.FRENCH_UI_STRINGS.are_you_sure_you_want_to_delet_1),
  //     () =>
  //       serverActions.deletePresentationObject({
  //         projectId: p.projectId,
  //         po_id: p.presentationObjectId,
  //       }),
  //     () => p.close({ deleted: true }),
  //   );
  //   await deleteAction.click();
  // }

  console.log("[VIZ EDIT] Rendering with state:", combinedData.state());
  return (
    <StateHolderWrapper state={combinedData.state()}>
      {(keyedCombinedData: CombinedData) => {
        console.log(
          "[VIZ EDIT] StateHolderWrapper rendering children with data:",
          keyedCombinedData,
        );
        return (
          <VisualizationEditorInner
            mode="edit"
            instanceDetail={p.instanceDetail}
            projectDetail={p.projectDetail}
            isGlobalAdmin={p.isGlobalAdmin}
            poDetail={keyedCombinedData.poDetail}
            resultsValueInfo={keyedCombinedData.resultsValueInfo}
            returnToContext={p.returnToContext}
            onClose={p.close}
          />
        );
      }}
    </StateHolderWrapper>
  );
}

function VisualizationEditorCreate(p: CreateModeProps) {
  const resultsValueInfo = timQuery(
    () =>
      getResultsValueInfoForPresentationObjectFromCacheOrFetch(
        p.projectId,
        p.resultsValue.id,
      ),
    t3(TC.loading),
  );

  const syntheticPoDetail: PresentationObjectDetail = {
    id: "",
    projectId: p.projectId,
    lastUpdated: "",
    label: p.label,
    resultsValue: p.resultsValue,
    config: p.config,
    isDefault: false,
    folderId: null,
  };

  return (
    <StateHolderWrapper state={resultsValueInfo.state()}>
      {(keyedResultsValueInfo: ResultsValueInfoForPresentationObject) => {
        return (
          <VisualizationEditorInner
            mode="create"
            instanceDetail={p.instanceDetail}
            projectDetail={p.projectDetail}
            isGlobalAdmin={p.isGlobalAdmin}
            poDetail={syntheticPoDetail}
            resultsValueInfo={keyedResultsValueInfo}
            returnToContext={p.returnToContext}
            onClose={p.close}
          />
        );
      }}
    </StateHolderWrapper>
  );
}

function VisualizationEditorEphemeral(p: EphemeralModeProps) {
  const resultsValueInfo = timQuery(
    () =>
      getResultsValueInfoForPresentationObjectFromCacheOrFetch(
        p.projectId,
        p.resultsValue.id,
      ),
    t3(TC.loading),
  );

  const syntheticPoDetail: PresentationObjectDetail = {
    id: "",
    projectId: p.projectId,
    lastUpdated: "",
    label: p.label,
    resultsValue: p.resultsValue,
    config: p.config,
    isDefault: false,
    folderId: null,
  };

  return (
    <StateHolderWrapper state={resultsValueInfo.state()}>
      {(keyedResultsValueInfo: ResultsValueInfoForPresentationObject) => {
        return (
          <VisualizationEditorInner
            mode="ephemeral"
            instanceDetail={p.instanceDetail}
            projectDetail={p.projectDetail}
            isGlobalAdmin={p.isGlobalAdmin}
            poDetail={syntheticPoDetail}
            resultsValueInfo={keyedResultsValueInfo}
            returnToContext={p.returnToContext}
            onClose={p.close}
          />
        );
      }}
    </StateHolderWrapper>
  );
}
