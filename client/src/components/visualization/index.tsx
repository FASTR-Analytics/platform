import {
  type FigureBundle,
  PresentationObjectConfig,
  PresentationObjectDetail,
  ProjectState,
  ResultsValue,
  ResultsValueInfoForPresentationObject,
  t3,
  TC,
} from "lib";
import { AlertComponentProps, StateHolderWrapper, createQuery } from "panther";
import { Match, Switch } from "solid-js";
import type { Awareness } from "y-protocols/awareness";
import type * as Y from "yjs";
import {
  getPODetailFromCacheorFetch,
  getResultsValueInfoForPresentationObjectFromCacheOrFetch,
} from "~/state/project/t2_presentation_objects";
import { VisualizationEditorInner } from "./visualization_editor_inner";
import type { AIContext } from "~/components/project_ai/types";

export type EditModeReturn = undefined | { deleted: true } | { saved: true };
export type CreateModeReturn =
  | undefined
  | { created: { presentationObjectId: string; folderId: string | null } };
export type EphemeralModeReturn =
  | undefined
  | { updated: { config: PresentationObjectConfig } };

/**
 * Live-collab binding for the ephemeral (embedded figure) editor. The host
 * (slide/report editor) passes this so the modal co-edits the figure's config
 * IN the host's shared doc (the figConfig Y.Map), rather than committing once on
 * Apply. Absent (or not live) → the modal keeps the classic Apply/Cancel flow.
 */
export type VizFigureCollabBinding = {
  /** The figConfig Y.Map in the host doc (slide node / report figure entry),
   *  or undefined if the figure isn't decomposed (no live co-editing then). */
  getConfigMap: () => Y.Map<unknown> | undefined;
  /** The host session's Yjs awareness (carries caption carets). */
  awareness: Awareness;
  isLive: () => boolean;
  canEdit: boolean;
  /** Transaction origin for this client's edits (for the scoped undo manager). */
  localOrigin: object;
  /** Called when a coherent bundle (edited config + refreshed items) is ready,
   *  so the host can path-set it into its doc — keeps canvas peers' data in step
   *  with the config being co-edited. */
  onCoherentBundle: (bundle: FigureBundle) => void;
};

type EditModeProps = {
  mode: "edit";
  presentationObjectId: string;
  projectId: string;

  projectStateSnapshot: ProjectState;
  returnToContext?: AIContext;
  close: (result: EditModeReturn) => void;
};

type CreateModeProps = {
  mode: "create";
  label: string;
  resultsValueSnapshot: ResultsValue;
  configSnapshot: PresentationObjectConfig;
  projectId: string;

  projectStateSnapshot: ProjectState;
  returnToContext?: AIContext;
  close: (result: CreateModeReturn) => void;
};

type EphemeralModeProps = {
  mode: "ephemeral";
  label: string;
  resultsValueSnapshot: ResultsValue;
  configSnapshot: PresentationObjectConfig;
  projectId: string;

  projectStateSnapshot: ProjectState;
  returnToContext?: AIContext;
  /** When present + live, the figure is co-edited in the host doc (see type). */
  collabBinding?: VizFigureCollabBinding;
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

  const combinedData = createQuery<CombinedData>(async () => {
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

    return {
      success: true,
      data: {
        poDetail: poDetailRes.data,
        resultsValueInfo: resultsValueInfoRes.data,
      },
    } as const;
  }, t3(TC.loading));

  // async function attemptDeleteFromError() {
  //   const deleteAction = createDeleteAction(
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

  return (
    <StateHolderWrapper state={combinedData.state()}>
      {(keyedCombinedData: CombinedData) => {
        return (
          <VisualizationEditorInner
            mode="edit"

            projectStateSnapshot={p.projectStateSnapshot}
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
  const resultsValueInfo = createQuery(
    () =>
      getResultsValueInfoForPresentationObjectFromCacheOrFetch(
        p.projectId,
        p.resultsValueSnapshot.id,
      ),
    t3(TC.loading),
  );

  const syntheticPoDetail: PresentationObjectDetail = {
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
      {(keyedResultsValueInfo: ResultsValueInfoForPresentationObject) => {
        return (
          <VisualizationEditorInner
            mode="create"

            projectStateSnapshot={p.projectStateSnapshot}
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
  const resultsValueInfo = createQuery(
    () =>
      getResultsValueInfoForPresentationObjectFromCacheOrFetch(
        p.projectId,
        p.resultsValueSnapshot.id,
      ),
    t3(TC.loading),
  );

  const syntheticPoDetail: PresentationObjectDetail = {
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
      {(keyedResultsValueInfo: ResultsValueInfoForPresentationObject) => {
        return (
          <VisualizationEditorInner
            mode="ephemeral"

            projectStateSnapshot={p.projectStateSnapshot}
            poDetail={syntheticPoDetail}
            resultsValueInfo={keyedResultsValueInfo}
            returnToContext={p.returnToContext}
            collabBinding={p.collabBinding}
            onClose={p.close}
          />
        );
      }}
    </StateHolderWrapper>
  );
}
