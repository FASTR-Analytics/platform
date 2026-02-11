
import { trackStore } from "@solid-primitives/deep";
import {
  ItemsHolderPresentationObject,
  PresentationObjectConfig,
  PresentationObjectDetail,
  ProjectDetail,
  ResultsValueInfoForPresentationObject,
  T,
  getModuleIdForMetric,
  getReplicateByProp,
  getTextRenderingOptions,
  hasDuplicateDisaggregatorDisplayOptions,
  t,
  t2,
  type InstanceDetail
} from "lib";
import {
  APIResponseWithData,
  Button,
  ChartHolder,
  Csv,
  FigureInputs,
  FrameTop,
  StateHolder,
  StateHolderWrapper,
  downloadCsv,
  downloadJson,
  getEditorWrapper,
  openAlert,
  openComponent,
  saveAs,
  timActionButton,
  timActionDelete
} from "panther";
import {
  Match,
  Show,
  Switch,
  createEffect,
  createMemo,
  createSignal,
  onCleanup,
  onMount,
} from "solid-js";
import { createStore, unwrap, type SetStoreFunction } from "solid-js/store";
import { ReplicateByOptionsPresentationObject } from "~/components/ReplicateByOptions";
import { ConflictResolutionModal } from "~/components/forms_editors/conflict_resolution_modal";
import { DownloadPresentationObject } from "~/components/forms_editors/download_presentation_object";
import { ViewResultsObject } from "~/components/forms_editors/view_results_object";
import {
  useOptimisticSetLastUpdated,
  useOptimisticSetProjectLastUpdated,
} from "~/components/project_runner/mod";
import { getFigureInputsFromPresentationObject } from "~/generate_visualization/mod";
import { serverActions } from "~/server_actions";
import {
  getPresentationObjectItemsFromCacheOrFetch,
  getPresentationObjectItemsFromCacheOrFetch_AsyncGenerator
} from "~/state/po_cache";
import { setShowAi, showAi } from "~/state/ui";
import type { CreateModeReturn, EditModeReturn, EphemeralModeReturn } from ".";
import { DuplicateVisualization } from "./duplicate_visualization";
import { PresentationObjectEditorPanel } from "./presentation_object_editor_panel";
import { SaveAsNewVisualizationModal } from "./save_as_new_visualization_modal";
import { VisualizationSettings } from "./visualization_settings";
import { useAIProjectContext } from "../project_ai/context";
import type { AIContext } from "../project_ai/types";

type InnerProps = {
  mode: "edit" | "create" | "ephemeral";
  instanceDetail: InstanceDetail;
  projectDetail: ProjectDetail;
  isGlobalAdmin: boolean;
  poDetail: PresentationObjectDetail;
  resultsValueInfo: ResultsValueInfoForPresentationObject;
  returnToContext?: AIContext;
  onClose:
  | ((result: EditModeReturn) => void)
  | ((result: CreateModeReturn) => void)
  | ((result: EphemeralModeReturn) => void);
};

export function VisualizationEditorInner(p: InnerProps) {
  const optimisticSetLastUpdated = useOptimisticSetLastUpdated();
  const optimisticSetProjectLastUpdated = useOptimisticSetProjectLastUpdated();
  const { setAIContext, notifyAI } = useAIProjectContext();

  // Extract static values from stores to prevent external reactivity
  const projectId = p.projectDetail.id;
  // const visualizationFolders = structuredClone(p.projectDetail.visualizationFolders);
  // const isLocked = p.projectDetail.isLocked;

  const {
    openEditor: openEditorForResultsObject,
    EditorWrapper: EditorWrapperForResultsObject,
  } = getEditorWrapper();

  // Temp state

  const [tempConfig, setTempConfig] = createStore<PresentationObjectConfig>(
    structuredClone(p.poDetail.config),
  );

  const manuallyUpdateTempConfig: SetStoreFunction<PresentationObjectConfig> = (...args: any[]) => {
    (setTempConfig as any)(...args);
    notifyAI({ type: "edited_viz_locally" });
  };

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
      projectId,
      p.poDetail,
      config,
    );
    for await (const state of iter) {
      setItemsHolder(state);
    }
  }

  const [needsSave, setNeedsSave] = createSignal<boolean>(false);

  onMount(() => {
    console.log("[VIZ] onMount - mode:", p.mode, "label:", p.poDetail.label);
    const unwrappedTempConfig = unwrap(tempConfig);

    console.log("[VIZ] calling attemptGetPresentationObjectItems");
    attemptGetPresentationObjectItems(unwrappedTempConfig);

    // Set AI context now that editor is mounted (all modes)
    console.log("[VIZ] calling setAIContext");
    setAIContext({
      mode: "editing_visualization",
      vizId: p.mode === "edit" ? p.poDetail.id : null, // null for create/ephemeral
      vizLabel: p.poDetail.label,
      resultsValue: p.poDetail.resultsValue,
      getTempConfig: () => tempConfig,
      setTempConfig,
    });
    console.log("[VIZ] setAIContext completed");
  });

  onCleanup(() => {
    setAIContext(p.returnToContext ?? { mode: "viewing_visualizations" });
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
    const _periodFilterNMonths = tempConfig.d.periodFilter?.nMonths;
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

    if (firstRunNeedsSave) {
      firstRunNeedsSave = false;
      return;
    }
    setNeedsSave(true);
  });


  // Actions

  // Create mode: open modal to get name and folder, then create
  async function saveAsNewVisualization() {
    const unwrappedTempConfig = unwrap(tempConfig);
    const modalRes = await openComponent({
      element: SaveAsNewVisualizationModal,
      props: {
        projectId: projectId,
        existingLabel: p.poDetail.label,
        resultsValue: p.poDetail.resultsValue,
        config: unwrappedTempConfig,
        folders: p.projectDetail.visualizationFolders,
      },
    });
    if (modalRes) {
      (p.onClose as (result: CreateModeReturn) => void)({
        created: {
          presentationObjectId: modalRes.newPresentationObjectId,
          folderId: modalRes.folderId,
        },
      });
    }
  }

  // Edit mode: save existing presentation object
  async function saveFunc(overwriteIfConflict?: boolean): Promise<
    APIResponseWithData<{ lastUpdated: string }>
  > {
    const unwrappedTempConfig = unwrap(tempConfig);

    const res = await serverActions.updatePresentationObjectConfig({
      projectId: projectId,
      po_id: p.poDetail.id,
      config: unwrappedTempConfig,
      expectedLastUpdated: p.poDetail.lastUpdated,
      overwrite: overwriteIfConflict,
    });

    if (res.success === false && res.err === "CONFLICT") {
      // Show modal with options
      const userChoice = await openComponent({
        element: ConflictResolutionModal,
        props: {
          itemName: "visualization"
        },
      });

      if (userChoice === "view_theirs") {
        (p.onClose as (result: EditModeReturn) => void)(undefined);
        return res;
      }

      if (userChoice === "overwrite") {
        // Retry with overwrite flag
        return saveFunc(true);
      }

      if (userChoice === "save_as_new") {
        // Create new visualization with user's edited config
        const createRes = await serverActions.createPresentationObject({
          projectId: projectId,
          label: `${p.poDetail.label} (copy)`,
          resultsValue: p.poDetail.resultsValue,
          config: unwrappedTempConfig,
          makeDefault: false,
          folderId: p.poDetail.folderId,
        });

        if (createRes.success === false) {
          return createRes;
        }

        optimisticSetLastUpdated(
          "presentation_objects",
          createRes.data.newPresentationObjectId,
          createRes.data.lastUpdated,
        );
        optimisticSetProjectLastUpdated(createRes.data.lastUpdated);

        (p.onClose as (result: EditModeReturn) => void)({ saved: true });
        return createRes;
      }

      // userChoice === "cancel" - stay in editor
      return res;
    }

    if (res.success === false) {
      return res;
    }

    setNeedsSave(false);

    optimisticSetLastUpdated(
      "presentation_objects",
      p.poDetail.id,
      res.data.lastUpdated,
    );
    optimisticSetProjectLastUpdated(res.data.lastUpdated);

    return res;
  }

  const saveAndClose = timActionButton(
    () => saveFunc(),
    () => (p.onClose as (result: EditModeReturn) => void)({ saved: true }),
  );

  const save = timActionButton(() => saveFunc());

  async function attemptUpdateLabel() {
    if (needsSave()) {
      await openAlert({
        text: t2(T.FRENCH_UI_STRINGS.you_must_save_before_editing),
      });
      return;
    }
    await openComponent({
      element: VisualizationSettings,
      props: {
        projectId: projectId,
        presentationObjectId: p.poDetail.id,
        resultsObjectId: p.poDetail.resultsValue.resultsObjectId,
        moduleId: getModuleIdForMetric(p.poDetail.resultsValue.id),
        isDefault: p.poDetail.isDefault,
        existingLabel: p.poDetail.label,
        currentFolderId: p.poDetail.folderId,
        folders: p.projectDetail.visualizationFolders,
        silentFetchPoDetail: async () => { },
        mutateFunc: async (newLabel) =>
          serverActions.updatePresentationObjectLabel({
            projectId: projectId,
            po_id: p.poDetail.id,
            label: newLabel,
          }),
      },
    });
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
        projectId: projectId,
        poDetails: [{ id: p.poDetail.id, label: p.poDetail.label, folderId: p.poDetail.folderId }],
        folders: p.projectDetail.visualizationFolders,
      },
    });
    if (res === undefined) {
      return;
    }
    optimisticSetProjectLastUpdated(res.lastUpdated);

    (p.onClose as (result: EditModeReturn) => void)({ saved: true });

    await openAlert({
      text: `Visualization duplicated. Opening new visualization...`,
      intent: "success",
    });
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
        projectId,
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

  async function attemptDeletePresentationObjectDetail() {
    if (p.poDetail.isDefault) {
      return;
    }
    const deleteAction = timActionDelete(
      t2(T.FRENCH_UI_STRINGS.are_you_sure_you_want_to_delet_1),
      () =>
        serverActions.deletePresentationObject({
          projectId: projectId,
          po_id: p.poDetail.id,
        }),
      () => (p.onClose as (result: EditModeReturn) => void)({ deleted: true }),
    );

    await deleteAction.click();
  }

  async function viewResultsObject(resultsObjectId: string) {
    const _res = await openEditorForResultsObject({
      element: ViewResultsObject,
      props: {
        projectId: projectId,
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
              <Switch>
                <Match when={p.mode === "ephemeral"}>
                  <Show
                    when={needsSave()}
                    fallback={
                      <Button
                        iconName="chevronLeft"
                        onClick={() => (p.onClose as any)(undefined)}
                      />
                    }
                  >
                    <Button
                      intent="success"
                      onClick={() => (p.onClose as (result: EphemeralModeReturn) => void)({ updated: { config: unwrap(tempConfig) } })}
                      iconName="check"
                    >
                      {t("Apply")}
                    </Button>
                    <Button
                      outline
                      onClick={() => (p.onClose as any)(undefined)}
                      iconName="x"
                    >
                      {t2(T.FRENCH_UI_STRINGS.cancel)}
                    </Button>
                  </Show>
                </Match>
                <Match
                  when={
                    (needsSave() || p.mode === "create") &&
                    !p.projectDetail.isLocked &&
                    !p.poDetail.isDefault
                  }
                >
                  <Switch>
                    <Match when={p.mode === "create"}>
                      <Button
                        intent="success"
                        onClick={saveAsNewVisualization}
                        iconName="save"
                      >
                        {t("Save as new visualization")}
                      </Button>
                    </Match>
                    <Match when={true}>
                      <>
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
                      </>
                    </Match>
                  </Switch>
                  <Button
                    outline
                    onClick={() => (p.onClose as any)(undefined)}
                    iconName="x"
                  >
                    {t2(T.FRENCH_UI_STRINGS.cancel)}
                  </Button>
                </Match>
                <Match when={true}>
                  <Button
                    iconName="chevronLeft"
                    onClick={() => (p.onClose as any)(undefined)}
                  />
                </Match>
              </Switch>
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
              <Show when={!p.projectDetail.isLocked && p.mode === "edit"}>
                <Button
                  onClick={attemptUpdateLabel}
                  iconName="settings"
                  outline
                >
                </Button>
                <Button onClick={duplicate} iconName="copy" outline>
                </Button>
                <Show when={!p.poDetail.isDefault}>
                  <Button
                    onClick={attemptDeletePresentationObjectDetail}
                    iconName="trash"
                    outline
                  >
                  </Button>
                </Show>
              </Show>
              <Button onClick={download} iconName="download">
                {t2(T.FRENCH_UI_STRINGS.download)}
              </Button>
              <Show when={!showAi()}>
                <Button
                  onClick={() => setShowAi(true)}
                  iconName="chevronLeft"
                  outline
                >
                  {t("AI")}
                </Button>
              </Show>
            </div>
          </div>
        }
      >
        <div class="flex h-full w-full">
          <div class="h-full w-96 flex-none border-r">
            <PresentationObjectEditorPanel
              projectDetail={p.projectDetail}
              poDetail={p.poDetail}
              resultsValueInfo={p.resultsValueInfo}
              tempConfig={tempConfig}
              setTempConfig={manuallyUpdateTempConfig}
              viewResultsObject={viewResultsObject}
            />
          </div>
          <Show when={getReplicateByProp(tempConfig)} keyed>
            {(keyedReplicateBy) => {
              return (
                <ReplicateByOptionsPresentationObject
                  replicateBy={keyedReplicateBy}
                  config={tempConfig}
                  poDetail={p.poDetail}
                  selectedReplicantValue={tempConfig.d.selectedReplicantValue}
                  setSelectedReplicant={(v) =>
                    manuallyUpdateTempConfig("d", "selectedReplicantValue", v)
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
