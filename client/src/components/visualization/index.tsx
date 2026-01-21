import { trackStore } from "@solid-primitives/deep";
import { useNavigate } from "@solidjs/router";
import {
  ItemsHolderPresentationObject,
  PresentationObjectConfig,
  PresentationObjectDetail,
  ProjectDetail,
  getModuleIdForMetric,
  getReplicateByProp,
  getTextRenderingOptions,
  hasDuplicateDisaggregatorDisplayOptions,
  isFrench,
  t,
  t2,
  T,
} from "lib";
import {
  APIResponseWithData,
  Button,
  ChartHolder,
  Checkbox,
  Csv,
  FrameRightResizable,
  FrameTop,
  StateHolder,
  StateHolderWrapper,
  FigureInputs,
  downloadCsv,
  downloadJson,
  getEditorWrapper,
  openAlert,
  openComponent,
  saveAs,
  timActionDelete,
  timActionButton,
  timQuery,
} from "panther";
import {
  Show,
  Switch,
  Match,
  createEffect,
  createMemo,
  createSignal,
  onMount,
  untrack,
} from "solid-js";
import { createStore, unwrap } from "solid-js/store";
import { ReplicateByOptionsPresentationObject } from "~/components/ReplicateByOptions";
import { ConfirmUpdate } from "~/components/forms_editors/confirm_update";
import { DownloadPresentationObject } from "~/components/forms_editors/download_presentation_object";
import { ViewResultsObject } from "~/components/forms_editors/view_results_object";
import {
  useOptimisticSetLastUpdated,
  useOptimisticSetProjectLastUpdated,
  useProjectDirtyStates,
} from "~/components/project_runner/mod";
import { serverActions } from "~/server_actions";
import {
  getPODetailFromCacheorFetch,
  getPresentationObjectItemsFromCacheOrFetch,
  getPresentationObjectItemsFromCacheOrFetch_AsyncGenerator,
} from "~/state/po_cache";
import { setShowAi, showAi } from "~/state/ui";
import { AiInterpretationPane } from "./ai_interpretation_pane";
import { DuplicateVisualization } from "./duplicate_visualization";
import { PresentationObjectEditorPanel } from "./presentation_object_editor_panel";
import { VisualizationSettings } from "./visualization_settings";
import { getFigureInputsFromPresentationObject } from "~/generate_visualization/mod";

export function Visualization(p: {
  isGlobalAdmin: boolean;
  projectDetail: ProjectDetail;
  presentationObjectId: string;
  backToProject: (withUpdate: boolean) => void;
}) {

  const poDetail = timQuery<PresentationObjectDetail>(() => {
    return getPODetailFromCacheorFetch(
      p.projectDetail.id,
      p.presentationObjectId,
    );
  }, t2(T.FRENCH_UI_STRINGS.loading_visualization));

  async function attemptDeleteFromError() {
    const deleteAction = timActionDelete(
      t2(T.FRENCH_UI_STRINGS.are_you_sure_you_want_to_delet_1),
      () =>
        serverActions.deletePresentationObject({
          projectId: p.projectDetail.id,
          po_id: p.presentationObjectId,
        }),
      () => p.backToProject(true),
    );
    await deleteAction.click();
  }

  return (
    <StateHolderWrapper
      state={poDetail.state()}
      onErrorButton={{
        label: t2(T.Platform.go_back),
        onClick: () => p.backToProject(false),
      }}
      onErrorSecondaryButton={{
        label: t2(T.FRENCH_UI_STRINGS.delete),
        onClick: attemptDeleteFromError,
      }}
    >
      {(keyedPoDetail: PresentationObjectDetail) => {
        return (
          <PresentationObjectEditorInner
            projectDetail={p.projectDetail}
            isGlobalAdmin={p.isGlobalAdmin}
            poDetail={keyedPoDetail}
            silentFetchPoDetail={poDetail.silentFetch}
            refreshPoDetail={poDetail.fetch}
            backToProject={() => p.backToProject(false)}
          />
        );
      }}
    </StateHolderWrapper>
  );
}

type Props = {
  projectDetail: ProjectDetail;
  isGlobalAdmin: boolean;
  poDetail: PresentationObjectDetail;
  backToProject: () => void;
  silentFetchPoDetail: () => Promise<void>;
  refreshPoDetail: () => Promise<void>;
};

function PresentationObjectEditorInner(p: Props) {
  const pds = useProjectDirtyStates();
  const optimisticSetLastUpdated = useOptimisticSetLastUpdated();
  const optimisticSetProjectLastUpdated = useOptimisticSetProjectLastUpdated();
  const navigate = useNavigate();
  let initialLastUpdated =
    pds.lastUpdated.presentation_objects[p.poDetail.id] ?? "unknown";
  let isCurrentlySaving = false;

  const {
    openEditor: openEditorForResultsObject,
    EditorWrapper: EditorWrapperForResultsObject,
  } = getEditorWrapper();

  // Temp state

  const [tempConfig, setTempConfig] = createStore<PresentationObjectConfig>(
    structuredClone(p.poDetail.config),
  );

  const [itemsHolder, setItemsHolder] = createSignal<
    StateHolder<{
      ih: ItemsHolderPresentationObject;
      config: PresentationObjectConfig;
    }>
  >({
    status: "loading",
    msg: t2(T.FRENCH_UI_STRINGS.fetching_data_to_be_visualized),
  });

  // Sub-state updater

  async function attemptGetPresentationObjectItems(
    config: PresentationObjectConfig,
  ) {
    const iter = getPresentationObjectItemsFromCacheOrFetch_AsyncGenerator(
      p.projectDetail.id,
      p.poDetail,
      config,
    );
    for await (const state of iter) {
      setItemsHolder(state);
    }
  }

  const [needsSave, setNeedsSave] = createSignal<boolean>(false);

  onMount(() => {
    const unwrappedTempConfig = unwrap(tempConfig);
    attemptGetPresentationObjectItems(unwrappedTempConfig);
  });

  let firstRunConfigChange = true;
  createEffect(() => {
    // These are the items that could potentially require a re-fetch
    // All other items should be accessed below in the createMemo on the child element
    // ddddddddddddddddddddddddddddd
    for (const k in tempConfig.d) {
      //@ts-ignore
      const _v = tempConfig.d[k];
    }
    for (const dis of tempConfig.d.disaggregateBy) {
      const _v = dis.disOpt + "-" + dis.disDisplayOpt;
    }
    for (const fil of tempConfig.d.filterBy) {
      const _v = fil.disOpt + "-" + fil.values.join("-");
    }
    const _periodFilterFilterType = tempConfig.d.periodFilter?.filterType;
    const _periodFilterOpt = tempConfig.d.periodFilter?.periodOption;
    const _periodFilterMin = tempConfig.d.periodFilter?.min;
    const _periodFilterMax = tempConfig.d.periodFilter?.max;
    const _valuesFilter = tempConfig.d.valuesFilter?.join("-");
    const _includeNationalForAdminArea2 = tempConfig.d
      .includeNationalForAdminArea2
      ? "yes"
      : "no";
    if (firstRunConfigChange) {
      firstRunConfigChange = false;
      return;
    }
    const unwrappedTempConfig = unwrap(tempConfig);
    attemptGetPresentationObjectItems(unwrappedTempConfig);
  });

  let firstRunNeedsSave = true;
  createEffect(() => {
    trackStore(tempConfig);
    // // Access all possible properties in tempConfig
    // // ddddddddddddddddddddddddddddd
    // for (const k in tempConfig.d) {
    //   //@ts-ignore
    //   const _v = tempConfig.d[k];
    // }
    // for (const dis of tempConfig.d.disaggregateBy) {
    //   const _v = dis.disOpt + "-" + dis.disDisplayOpt;
    // }
    // for (const fil of tempConfig.d.filterBy) {
    //   const _v = fil.disOpt + "-" + fil.values.join("-");
    // }
    // const _periodFilterOpt = tempConfig.d.periodFilter?.periodOption;
    // const _periodFilterMin = tempConfig.d.periodFilter?.min;
    // const _periodFilterMax = tempConfig.d.periodFilter?.max;
    // const _valuesFilter = tempConfig.d.valuesFilter?.join("-");

    // // sssssssssssssssssssssssssssss
    // for (const k in tempConfig.s) {
    //   //@ts-ignore
    //   const _v = tempConfig.s[k];
    // }
    // // ttttttttttttttttttttttttttttt
    // for (const k in tempConfig.t) {
    //   //@ts-ignore
    //   const _v = tempConfig.t[k];
    // }
    if (firstRunNeedsSave) {
      firstRunNeedsSave = false;
      return;
    }
    setNeedsSave(true);
  });

  // Someone else saved mechanism

  createEffect(() => {
    const _lastUpdated =
      pds.lastUpdated.presentation_objects[p.poDetail.id] ?? "unknown";
    const _needsSave = untrack(() => needsSave());
    console.log("NEEDS SAVE =", _needsSave);
    console.log("isCurrentlySaving =", isCurrentlySaving);
    console.log("_lastUpdated =", _lastUpdated);
    console.log("initialLastUpdated =", initialLastUpdated);
    if (!isCurrentlySaving && _lastUpdated !== initialLastUpdated) {
      if (_needsSave || firstRunNeedsSave) {
        console.log("CALLING askIfWantToUpdate");
        askIfWantToUpdate();
      } else {
        console.log("CALLING p.refreshPoDetail");
        p.refreshPoDetail();
      }
    }
  });

  async function askIfWantToUpdate() {
    const res = await openComponent({
      element: ConfirmUpdate,
      props: {
        thingLabel: "visualization",
      },
    });
    if (res) {
      p.refreshPoDetail();
    }
  }

  // Actions

  async function saveFunc(): Promise<
    APIResponseWithData<{ lastUpdated: string }>
  > {
    isCurrentlySaving = true;
    const unwrappedTempConfig = unwrap(tempConfig);
    const res = await serverActions.updatePresentationObjectConfig({
      projectId: p.projectDetail.id,
      po_id: p.poDetail.id,
      config: unwrappedTempConfig,
    });
    if (res.success === false) {
      isCurrentlySaving = false;
      return res;
    }
    // optimisticSetLastUpdated(p.poDetail.id, res.data.lastUpdated);
    console.log("TIM NEED TO WORK ON THIS");
    initialLastUpdated = res.data.lastUpdated;
    isCurrentlySaving = false;
    setNeedsSave(false);
    return res;
  }

  const saveAndClose = timActionButton(
    () => saveFunc(),
    () => p.backToProject(),
  );

  const save = timActionButton(() => saveFunc());

  // function revert() {
  //   if (!p.poDetail.defaultDefinitionConfig) {
  //     return;
  //   }
  //   const startingConfig = structuredClone(_STARTING_PRES_OBJ_CONFIG);
  //   const defaultDefConfig = structuredClone(
  //     p.poDetail.defaultDefinitionConfig,
  //   );
  //   setTempConfig({
  //     ...startingConfig,
  //     ...defaultDefConfig,
  //   });
  // }

  async function attemptUpdateLabel() {
    if (needsSave()) {
      await openAlert({
        text: t2(T.FRENCH_UI_STRINGS.you_must_save_before_editing),
      });
      return;
    }
    const res = await openComponent({
      element: VisualizationSettings,
      props: {
        projectId: p.projectDetail.id,
        presentationObjectId: p.poDetail.id,
        resultsObjectId: p.poDetail.resultsValue.resultsObjectId,
        moduleId: getModuleIdForMetric(p.poDetail.resultsValue.id),
        isDefault: p.poDetail.isDefault,
        existingLabel: p.poDetail.label,
        silentFetchPoDetail: p.silentFetchPoDetail,
        mutateFunc: async (newLabel) =>
          serverActions.updatePresentationObjectLabel({
            projectId: p.projectDetail.id,
            po_id: p.poDetail.id,
            label: newLabel,
          }),
      },
    });
    if (res === "NEEDS_UPDATE") {
      // Don't use lus optimistic for this. Needs to reload
      p.refreshPoDetail();
    }
  }

  async function duplicate() {
    if (needsSave() && !p.poDetail.isDefault) {
      await openAlert({
        text: t(
          "In order to be duplicated, visualizations cannot have any unsaved changes",
        ),
      });
      return;
    }
    const res = await openComponent({
      element: DuplicateVisualization,
      props: {
        projectId: p.projectDetail.id,
        poDetail: p.poDetail,
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
      `/?p=${p.projectDetail.id}&v=${res.newPresentationObjectId}`,
    );
  }

  async function download() {
    if (needsSave()) {
      await openAlert({
        text: t2(T.FRENCH_UI_STRINGS.you_must_save_before_downloadi),
      });
      return;
    }
    const canvas = window.document.getElementById(
      "CANVAS_FOR_DOWNLOADING",
    ) as HTMLCanvasElement;
    if (!canvas) {
      await openAlert({
        text: "Could not get canvas",
        intent: "danger",
      });
      return;
    }
    const replicateBy = getReplicateByProp(tempConfig);
    const res = await openComponent({
      element: DownloadPresentationObject,
      props: {
        isReplicateBy: !!replicateBy,
        poDetail: p.poDetail,
      },
    });
    if (res === undefined) {
      return;
    }
    if (res.format === "json-definition") {
      const jsonDef = {
        id: p.poDetail.id,
        label: p.poDetail.label,
        metricId: p.poDetail.resultsValue.id,
        config: p.poDetail.config,
      };
      downloadJson(
        jsonDef,
        `${p.poDetail.label.replaceAll(" ", "_").trim()}_definition.json`,
      );
      return;
    }
    if (res.format === "data-results-file") {
      viewResultsObject(p.poDetail.resultsValue.resultsObjectId);
      return;
    }
    if (res.format === "data-visualization") {
      const res = await getPresentationObjectItemsFromCacheOrFetch(
        p.projectDetail.id,
        p.poDetail,
        tempConfig,
      );
      if (res.success === false || res.data.ih.status !== "ok") {
        return;
      }
      const csv = Csv.fromObjects(res.data.ih.items).stringify();
      downloadCsv(
        csv,
        `${p.poDetail.label.replaceAll(" ", "_").trim()}_underlying_data.csv`,
      );
      return;
    }
    if (res.transparent && !res.padding) {
      canvas.toBlob(
        (blob) => {
          saveAs(
            blob ?? "",
            `${p.poDetail.label.replaceAll(" ", "_").trim()}.png`,
          );
        },
        "png",
        1,
      );
      return;
    }
    const _PX = res.padding ? 100 : 0;
    const _PY = res.padding ? 100 : 0;
    // const _PY = Math.round((_PX * canvas.height) / canvas.width);
    const newW = canvas.width + 2 * _PX;
    const newH = canvas.height + 2 * _PY;
    if (replicateBy && res.allReplicants) {
      // downloadMultiple(
      //   _PX,
      //   _PY,
      //   canvas.width,
      //   canvas.height,
      //   res.transparent,
      //   replicateBy,
      // );
      return;
    }
    const backCanvas = new OffscreenCanvas(newW, newH);
    const backCanvasCtx = backCanvas.getContext("2d")!;
    if (!res.transparent) {
      backCanvasCtx.fillStyle = "#ffffff";
      backCanvasCtx.fillRect(0, 0, newW, newH);
    }
    backCanvasCtx.drawImage(canvas, _PX, _PY);
    const blob = await backCanvas.convertToBlob({ type: "png", quality: 1 });
    saveAs(blob, `${p.poDetail.label.replaceAll(" ", "_").trim()}.png`);
  }

  // async function downloadMultiple(
  //   _PX: number,
  //   _PY: number,
  //   existingCanvasWidth: number,
  //   existingCanvasHeight: number,
  //   transparent: boolean,
  //   replicateBy: "admin_area_2" | "admin_area_3" | "indicator_common_id",
  // ) {
  //   const lastUpdated = lus[p.poDetail.id] ?? "unknown";
  //   const lastModified = new Date();
  //   const replicants = await getReplicantOptions(
  //     p.projectId,
  //     p.poDetail.resultsObjectId,
  //     replicateBy,
  //   );
  //   if (replicants.success === false) {
  //     return;
  //   }
  //   const poDetailsRes = await Promise.all(
  //     replicants.data.map(async (opt) => {
  //       const figureInputs = await getPOFigureInputsFromCacheOrFetch(
  //         p.projectId,
  //         p.poDetail.id,
  //         lastUpdated,
  //         [
  //           {
  //             replicateBy,
  //             selectedReplicantValue: opt.value,
  //           },
  //         ],
  //       );
  //       const dummyCanvas = new OffscreenCanvas(100, 100);
  //       const dummyCanvasCtx = dummyCanvas.getContext("2d")!;
  //       //@ts-ignore
  //       const dummyCrc = new CanvasRenderContext(dummyCanvasCtx);
  //       const fig = new Figure(figureInputs.data);
  //       const idealH =
  //         figureInputs.data.style?.idealAspectRatio === "none"
  //           ? existingCanvasHeight
  //           : fig.getIdealHeight(dummyCrc, existingCanvasWidth);
  //       const newW = existingCanvasWidth + 2 * _PX;
  //       const newH = idealH + 2 * _PY;

  //       const canvas = new OffscreenCanvas(newW, newH);
  //       const canvasCtx = canvas.getContext("2d")!;
  //       if (!transparent) {
  //         canvasCtx.fillStyle = "#ffffff";
  //         canvasCtx.fillRect(0, 0, newW, newH);
  //       }
  //       //@ts-ignore
  //       const crc = new CanvasRenderContext(canvasCtx);
  //       const rcd = new RectCoordsDims([
  //         _PX,
  //         _PY,
  //         newW - 2 * _PX,
  //         newH - 2 * _PX,
  //       ]);
  //       fig.measure(crc, rcd).render(crc);
  //       const blob = await canvas.convertToBlob({ type: "png", quality: 1 });
  //       return {
  //         name: `${p.poDetail.label.replaceAll(" ", "_").trim()}_${opt.value.replaceAll(" ", "_").trim()}.png`,
  //         lastModified,
  //         input: blob,
  //       };
  //     }),
  //   );
  //   const goodBlobs = poDetailsRes.filter(
  //     (
  //       b,
  //     ): b is {
  //       name: string;
  //       lastModified: Date;
  //       input: Blob;
  //     } => b !== undefined,
  //   );

  //   const blob = await downloadZip(goodBlobs).blob();
  //   saveAs(blob, `${p.poDetail.label.replaceAll(" ", "_").trim()}.zip`);
  // }

  async function attemptDeletePresentationObjectDetail() {
    if (p.poDetail.isDefault) {
      return;
    }
    const deleteAction = timActionDelete(
      t2(T.FRENCH_UI_STRINGS.are_you_sure_you_want_to_delet_1),
      () =>
        serverActions.deletePresentationObject({
          projectId: p.projectDetail.id,
          po_id: p.poDetail.id,
        }),
      () => p.backToProject(),
    );

    await deleteAction.click();
  }

  async function viewResultsObject(resultsObjectId: string) {
    const _res = await openEditorForResultsObject({
      element: ViewResultsObject,
      props: {
        projectId: p.projectDetail.id,
        moduleId: getModuleIdForMetric(p.poDetail.resultsValue.id),
        resultsObjectId,
      },
    });
  }

  return (
    <EditorWrapperForResultsObject>
      <FrameTop
        panelChildren={
          <div class="ui-pad ui-gap flex items-center border-b">
            <div class="ui-gap-sm flex items-center">
              <Show
                when={
                  needsSave() &&
                  !p.projectDetail.isLocked &&
                  !p.poDetail.isDefault
                }
                fallback={
                  <Button
                    iconName="chevronLeft"
                    onClick={() => p.backToProject()}
                  />
                }
              >
                <Button
                  intent="success"
                  onClick={saveAndClose.click}
                  state={saveAndClose.state()}
                  iconName="save"
                >
                  {t2(T.FRENCH_UI_STRINGS.save_and_close)}
                </Button>
                <Button
                  intent="success"
                  onClick={save.click}
                  state={save.state()}
                  iconName="save"
                >
                  {t2(T.FRENCH_UI_STRINGS.save)}
                </Button>
                <Button
                  intent="neutral"
                  onClick={() => p.backToProject()}
                  iconName="x"
                >
                  {t2(T.FRENCH_UI_STRINGS.cancel)}
                </Button>
              </Show>
            </div>
            <div class="font-700 flex flex-1 items-center truncate text-xl">
              <span class="font-400">{p.poDetail.label}</span>
              <Show when={p.poDetail.isDefault}>
                <span class="border-primary bg-base-100 font-400 text-primary ml-4 truncate rounded border px-2 py-1 text-xs">
                  {t2(T.FRENCH_UI_STRINGS.default)}
                </span>
              </Show>
            </div>
            <div class="ui-gap-sm flex items-center">
              {/* <Show when={p.isGlobalAdmin}>
                <div class="truncate rounded border border-success bg-base-100 px-2 py-1 text-xs text-success">
                  Instance admin!
                </div>
              </Show> */}
              <div class="pr-2">
                <Checkbox
                  label="Show AI"
                  checked={showAi()}
                  onChange={setShowAi}
                />
              </div>
              <Show when={!p.projectDetail.isLocked}>
                <Button
                  onClick={attemptUpdateLabel}
                  iconName="settings"
                  // intent="neutral"
                  outline
                >
                  {/* {t2(T.FRENCH_UI_STRINGS.edit_name)} */}
                </Button>
                <Button onClick={duplicate} iconName="copy" outline>
                  {/* {t2(T.FRENCH_UI_STRINGS.duplicate)} */}
                </Button>
                <Show when={!p.poDetail.isDefault}>
                  <Button
                    onClick={attemptDeletePresentationObjectDetail}
                    iconName="trash"
                    outline
                  >
                    {/* {t2(T.FRENCH_UI_STRINGS.delete)} */}
                  </Button>
                </Show>
              </Show>
              <Button onClick={download} iconName="download">
                {t2(T.FRENCH_UI_STRINGS.download)}
              </Button>
            </div>
          </div>
        }
      >
        <div class="flex h-full w-full">
          {/* <Show when={!p.poDetail.isDefault}> */}
          <div class="h-full w-96 flex-none border-r">
            <PresentationObjectEditorPanel
              projectDetail={p.projectDetail}
              poDetail={p.poDetail}
              tempConfig={tempConfig}
              setTempConfig={setTempConfig}
              viewResultsObject={viewResultsObject}
            />
          </div>
          {/* </Show> */}
          <Show when={getReplicateByProp(tempConfig)} keyed>
            {(keyedReplicateBy) => {
              return (
                <ReplicateByOptionsPresentationObject
                  replicateBy={keyedReplicateBy}
                  config={tempConfig}
                  poDetail={p.poDetail}
                  selectedReplicantValue={tempConfig.d.selectedReplicantValue}
                  setSelectedReplicant={(v) =>
                    setTempConfig("d", "selectedReplicantValue", v)
                  }
                />
              );
            }}
          </Show>
          <div class="h-full w-0 flex-1">
            <Show
              when={
                !hasDuplicateDisaggregatorDisplayOptions(
                  p.poDetail.resultsValue,
                  tempConfig,
                )
              }
              fallback={
                <div class="ui-pad">
                  {t2(T.FRENCH_UI_STRINGS.you_have_two_disaggregators_wi)}
                </div>
              }
            >
              <Show
                when={
                  !getReplicateByProp(tempConfig) ||
                  tempConfig.d.selectedReplicantValue
                }
                fallback={
                  <div class="ui-pad">
                    {t2(T.FRENCH_UI_STRINGS.you_must_select_a_replicant)}
                  </div>
                }
              >
                <StateHolderWrapper state={itemsHolder()}>
                  {(keyedItemsHolder) => {
                    return (
                      <Switch>
                        <Match when={keyedItemsHolder.ih.status === "too_many_items"}>
                          <div class="ui-pad">
                            Too many data points selected. Please add filters or reduce disaggregation options to view fewer than 20,000 data points.
                          </div>
                        </Match>
                        <Match when={keyedItemsHolder.ih.status === "no_data_available"}>
                          <div class="ui-pad">
                            No data available with current filter selection.
                          </div>
                        </Match>
                        <Match when={keyedItemsHolder.ih.status === "ok"}>
                          {(() => {
                            const figureInputs = createMemo<StateHolder<FigureInputs>>(
                              () => {
                                // Check for empty items array (shouldn't happen with new discriminated union, but keeping for safety)
                                if (keyedItemsHolder.ih.status === "ok" && keyedItemsHolder.ih.items.length === 0) {
                                  return {
                                    status: "error",
                                    err: t2(T.Visualizations.no_rows),
                                  };
                                }
                                // sssssssssssssssssssssssssssss
                                for (const k in tempConfig.s) {
                                  //@ts-ignore
                                  const _v = tempConfig.s[k];
                                }
                                // ttttttttttttttttttttttttttttt
                                for (const k in tempConfig.t) {
                                  //@ts-ignore
                                  const _v = tempConfig.t[k];
                                }
                                return getFigureInputsFromPresentationObject(
                                  p.poDetail.resultsValue,
                                  keyedItemsHolder.ih,
                                  keyedItemsHolder.config,
                                );
                              },
                            );

                            return (
                              <FrameRightResizable
                                startingWidth={300}
                                minWidth={260}
                                panelChildren={
                                  showAi() && (
                                    <div class="bg-base-100 h-full border-l">
                                      <AiInterpretationPane
                                        projectDetail={p.projectDetail}
                                        presentationObjectId={p.poDetail.id}
                                        figureInputs={figureInputs()}
                                        tempConfig={tempConfig}
                                        setTempConfig={setTempConfig}
                                        resultsValue={p.poDetail.resultsValue}
                                      />
                                    </div>
                                  )
                                }
                              >
                                <div class="ui-pad h-full w-full overflow-auto">
                                  <StateHolderWrapper state={figureInputs()}>
                                    {(keyedFigureInputs) => {
                                      return (
                                        <ChartHolder
                                          canvasElementId="CANVAS_FOR_DOWNLOADING"
                                          chartInputs={keyedFigureInputs}
                                          height={
                                            tempConfig.s.idealAspectRatio === "none"
                                              ? "flex"
                                              : "ideal"
                                          }
                                          noRescaleWithWidthChange
                                          textRenderingOptions={getTextRenderingOptions()}
                                        />
                                      );
                                    }}
                                  </StateHolderWrapper>
                                </div>
                              </FrameRightResizable>
                            );
                          })()}
                        </Match>
                      </Switch>
                    );
                  }}
                </StateHolderWrapper>
              </Show>
            </Show>
          </div>
        </div>
      </FrameTop>
    </EditorWrapperForResultsObject>
  );
}
