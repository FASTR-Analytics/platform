import {
  getModuleIdForMetric,
  ProjectDetail,
  ReportDetail,
  ReportItemConfig,
  ReportItemContentItem,
  ReportItemContentItemType,
  t,
  t2,
  T,
} from "lib";
import {
  Button,
  Checkbox,
  findById,
  LayoutNode,
  OpenEditorProps,
  RadioGroup,
  Select,
  Slider,
  StateHolderWrapper,
  TextArea,
  getSelectOptions,
  timQuery,
} from "panther";
import { Match, Setter, Show, Switch, createMemo } from "solid-js";
import { SetStoreFunction } from "solid-js/store";
import { PresentationObjectMiniDisplay } from "~/components/PresentationObjectMiniDisplay";
import { serverActions } from "~/server_actions";
// TODO: Re-enable when nested layout UI is implemented
// import { ReportItemEditorPanelContentBox } from "./report_item_editor_panel_content_box";
import { SelectPresentationObject } from "./select_presentation_object";
import { InlineReplicantSelector } from "./inline_replicant_selector";

type Props = {
  projectDetail: ProjectDetail;
  tempReportItemConfig: ReportItemConfig;
  setTempReportItemConfig: SetStoreFunction<ReportItemConfig>;
  reportDetail: ReportDetail;
  openEditor: <TProps, TReturn>(
    v: OpenEditorProps<TProps, TReturn>,
  ) => Promise<TReturn | undefined>;
  selectedItemId: string | undefined;
  setSelectedItemId: Setter<string | undefined>;
};

export function ReportItemEditorContent(p: Props) {
  // Helper to get the current item from the nested tree structure by ID
  function getCurrentItem(): ReportItemContentItem | undefined {
    if (!p.selectedItemId) return undefined;
    const content = p.tempReportItemConfig.freeform.content;
    if (content.layoutType !== "explicit") {
      throw new Error("Manual editor only supports explicit layout");
    }
    const result = findById(content.layout, p.selectedItemId);
    if (!result || result.node.type !== "item") return undefined;
    return result.node.data;
  }

  // Helper to update the selected item's data immutably
  function updateSelectedItemData(
    updater: (data: ReportItemContentItem) => ReportItemContentItem
  ) {
    if (!p.selectedItemId) return;

    function updateNode(
      node: LayoutNode<ReportItemContentItem>
    ): LayoutNode<ReportItemContentItem> {
      if (node.id === p.selectedItemId && node.type === "item") {
        return { ...node, data: updater(node.data) };
      }
      if (node.type === "rows" || node.type === "cols") {
        return {
          ...node,
          children: node.children.map(updateNode),
        } as LayoutNode<ReportItemContentItem>;
      }
      return node;
    }

    const content = p.tempReportItemConfig.freeform.content;
    if (content.layoutType !== "explicit") {
      throw new Error("Manual editor only supports explicit layout");
    }
    const newLayout = updateNode(content.layout);
    p.setTempReportItemConfig("freeform", "content", {
      layoutType: "explicit",
      layout: newLayout,
    });
  }

  async function updateItemType(type: ReportItemContentItemType) {
    updateSelectedItemData((data) => ({ ...data, type }));
  }
  const assetListing = timQuery(
    () => serverActions.getAssets({}),
    t2(T.FRENCH_UI_STRINGS.loading_files),
  );

  async function updatePresentationObjectId() {
    const res = await p.openEditor({
      element: SelectPresentationObject,
      props: {
        projectDetail: p.projectDetail,
        currentlySelected: undefined,
      },
    });
    if (res === undefined) {
      return;
    }
    // TODO - add something here that asks the user to select their replicant
    updateSelectedItemData((data) => ({
      ...data,
      presentationObjectInReportInfo: res,
    }));
  }

  // Generic helper function to update content properties
  function updateContentProperty<K extends keyof ReportItemContentItem>(
    propertyName: K,
    value: ReportItemContentItem[K],
  ) {
    updateSelectedItemData((data) => ({ ...data, [propertyName]: value }));
  }

  // Special case for updateHides since it has a different signature
  function updateHides(
    hide: boolean,
    type: "hideFigureCaption" | "hideFigureSubCaption" | "hideFigureFootnote",
  ) {
    updateContentProperty(type, hide);
  }

  return (
    <div class="">
      {/* TODO: Re-enable when nested layout UI is implemented
      <ReportItemEditorPanelContentBox
        projectId={p.projectDetail.id}
        tempReportItemConfig={p.tempReportItemConfig}
        setTempReportItemConfig={p.setTempReportItemConfig}
        selectedRowCol={p.selectedRowCol}
        setSelectedRowCol={p.setSelectedRowCol}
      />
      */}
      <div class="ui-pad">
        <Show when={getCurrentItem()} keyed>
          {(keyedItem) => {
            return (
              <div class="ui-spy">
                <div class="">
                  <Select
                    label={t2(T.FRENCH_UI_STRINGS.content_type)}
                    options={[
                      {
                        value: "placeholder",
                        label: t2(T.FRENCH_UI_STRINGS.placeholder),
                      },
                      {
                        value: "figure",
                        label: t2(T.FRENCH_UI_STRINGS.visualization_1),
                      },
                      { value: "image", label: t2(T.FRENCH_UI_STRINGS.image) },
                      { value: "text", label: t2(T.FRENCH_UI_STRINGS.text) },
                    ]}
                    value={keyedItem.type}
                    onChange={(v) =>
                      updateItemType(
                        v as "figure" | "placeholder" | "image" | "text",
                      )
                    }
                    fullWidth
                  />
                </div>
                <Switch>
                  <Match when={keyedItem.type === "figure"}>
                    <div class="ui-spy">
                      <div class="ui-spy">
                        <Show
                          when={keyedItem.presentationObjectInReportInfo}
                          fallback={
                            <div class="text-danger">
                              {t("Select a visualization to display")}
                            </div>
                          }
                          keyed
                        >
                          {(keyedPresentationObjectInReportInfo) => {
                            const replicantOverride = createMemo(() => {
                              const _v =
                                keyedItem.presentationObjectInReportInfo
                                  ?.selectedReplicantValue;
                              return {
                                selectedReplicantValue:
                                  keyedItem.presentationObjectInReportInfo
                                    ?.selectedReplicantValue,
                              };
                            });

                            return (
                              <div class="ui-spy">
                                <PresentationObjectMiniDisplay
                                  projectId={p.projectDetail.id}
                                  moduleId={
                                    getModuleIdForMetric(keyedPresentationObjectInReportInfo.metricId)
                                  }
                                  presentationObjectId={
                                    keyedPresentationObjectInReportInfo.id
                                  }
                                  shapeType="ideal"
                                  repliantOverride={replicantOverride()}
                                  scalePixelResolution={0.5}
                                />
                                <Show
                                  when={
                                    keyedPresentationObjectInReportInfo.replicateBy
                                  }
                                  keyed
                                >
                                  {(replicateBy) => (
                                    <InlineReplicantSelector
                                      projectId={p.projectDetail.id}
                                      presentationObjectId={
                                        keyedPresentationObjectInReportInfo.id
                                      }
                                      replicateBy={replicateBy}
                                      selectedValue={
                                        keyedPresentationObjectInReportInfo.selectedReplicantValue
                                      }
                                      onChange={(v) =>
                                        updateContentProperty(
                                          "presentationObjectInReportInfo",
                                          {
                                            ...keyedPresentationObjectInReportInfo,
                                            selectedReplicantValue: v,
                                          },
                                        )
                                      }
                                    />
                                  )}
                                </Show>
                              </div>
                            );
                          }}
                        </Show>
                        <div class="">
                          <Button
                            onClick={updatePresentationObjectId}
                            iconName="pencil"
                          >
                            {keyedItem.presentationObjectInReportInfo
                              ? t2(T.FRENCH_UI_STRINGS.change)
                              : t2(T.FRENCH_UI_STRINGS.select)}{" "}
                            {t("visualization")}
                          </Button>
                        </div>
                      </div>
                      <div class="ui-spy-sm">
                        <Checkbox
                          label={t2(
                            T.FRENCH_UI_STRINGS.allow_visualization_to_shrink,
                          )}
                          checked={keyedItem.stretch}
                          onChange={(ch) =>
                            updateContentProperty("stretch", ch)
                          }
                        />
                        <Checkbox
                          label={t2(
                            T.FRENCH_UI_STRINGS.use_additional_visualization_s,
                          )}
                          checked={keyedItem.useFigureAdditionalScale}
                          onChange={(ch) =>
                            updateContentProperty(
                              "useFigureAdditionalScale",
                              ch,
                            )
                          }
                        />
                        <Show when={keyedItem.useFigureAdditionalScale}>
                          <Slider
                            label={t2(T.FRENCH_UI_STRINGS.scale)}
                            min={0.1}
                            max={5}
                            step={0.1}
                            value={keyedItem.figureAdditionalScale ?? 1}
                            onChange={(v) =>
                              updateContentProperty("figureAdditionalScale", v)
                            }
                            fullWidth
                            showValueInLabel
                          />
                        </Show>
                        <Checkbox
                          label={t2(
                            T.FRENCH_UI_STRINGS.hide_visualization_caption,
                          )}
                          checked={keyedItem.hideFigureCaption}
                          onChange={(ch) =>
                            updateHides(ch, "hideFigureCaption")
                          }
                        />
                        <Checkbox
                          label={t2(
                            T.FRENCH_UI_STRINGS.hide_visualization_subcaption,
                          )}
                          checked={keyedItem.hideFigureSubCaption}
                          onChange={(ch) =>
                            updateHides(ch, "hideFigureSubCaption")
                          }
                        />
                        <Checkbox
                          label={t2(
                            T.FRENCH_UI_STRINGS.hide_visualization_footnote,
                          )}
                          checked={keyedItem.hideFigureFootnote}
                          onChange={(ch) =>
                            updateHides(ch, "hideFigureFootnote")
                          }
                        />
                      </div>
                    </div>
                  </Match>
                  <Match when={keyedItem.type === "text"}>
                    <div class="ui-spy-sm">
                      <TextArea
                        label={t2(T.FRENCH_UI_STRINGS.text)}
                        value={keyedItem.markdown ?? ""}
                        onChange={(v) => updateContentProperty("markdown", v)}
                        fullWidth
                        height="300px"
                      />
                      <div class="ui-gap-sm flex">
                        <Select
                          label={t2(T.FRENCH_UI_STRINGS.text_background)}
                          options={[
                            { value: "none", label: "None" },
                            { value: "primary", label: "Report theme color" },
                            { value: "grey", label: "Light grey" },
                            { value: "success", label: "Green" },
                            { value: "danger", label: "Red" },
                          ]}
                          value={keyedItem.textBackground}
                          onChange={(v) =>
                            updateContentProperty("textBackground", v)
                          }
                          fullWidth
                        />
                        <Select
                          label={t2(T.FRENCH_UI_STRINGS.text_size)}
                          options={[
                            { value: "0.41", label: "3XS" },
                            { value: "0.51", label: "2XS" },
                            { value: "0.64", label: "XS" },
                            { value: "0.8", label: "Small" },
                            { value: "1", label: "Medium" },
                            { value: "1.25", label: "Large" },
                            { value: "1.56", label: "XL" },
                            { value: "1.95", label: "2XL" },
                            { value: "2.44", label: "3XL" },
                            { value: "3.05", label: "4XL" },
                            { value: "3.81", label: "5XL" },
                            { value: "4.77", label: "6XL" },
                          ]}
                          value={String(keyedItem.textSize ?? 1)}
                          onChange={(v) =>
                            updateContentProperty("textSize", Number(v))
                          }
                          fullWidth
                        />
                      </div>
                      <Show when={keyedItem.textBackground !== "none"}>
                        <Checkbox
                          label={t("Fill shading to available area")}
                          checked={keyedItem.fillArea}
                          onChange={(ch) =>
                            updateContentProperty("fillArea", ch)
                          }
                        />
                      </Show>
                    </div>
                  </Match>
                  <Match when={keyedItem.type === "image"}>
                    <div class="space-y-4">
                      <StateHolderWrapper state={assetListing.state()} noPad>
                        {(keyedAssets) => {
                          return (
                            <Select
                              label={t2(T.FRENCH_UI_STRINGS.image_file)}
                              options={getSelectOptions(
                                keyedAssets
                                  .filter((f) => f.isImage)
                                  .map((f) => f.fileName),
                              )}
                              value={keyedItem.imgFile}
                              onChange={(v) =>
                                updateContentProperty("imgFile", v)
                              }
                              fullWidth
                            />
                          );
                        }}
                      </StateHolderWrapper>
                      <Show when={keyedItem.imgFile}>
                        {/* <Show when={keyedItem.imgFit === "inside"}> */}
                        <Checkbox
                          label={t2(T.Reports.stretch_to_fit)}
                          checked={keyedItem.imgStretch}
                          onChange={(ch) =>
                            updateContentProperty("imgStretch", ch)
                          }
                        />
                        {/* <Checkbox
                          label={t("Specify height")}
                          checked={keyedItem.placeholderSpecifyHeight}
                          onChange={(ch) =>
                            updateContentProperty(
                              "placeholderSpecifyHeight",
                              ch,
                            )
                          }
                        /> */}
                        <Show when={!keyedItem.imgStretch}>
                          <Slider
                            label={t("Height")}
                            min={50}
                            max={1500}
                            step={50}
                            value={keyedItem.imgHeight ?? 100}
                            onChange={(v) =>
                              updateContentProperty("imgHeight", v)
                            }
                            fullWidth
                            showValueInLabel
                          />
                        </Show>
                        <RadioGroup
                          label={t2(T.FRENCH_UI_STRINGS.image_fit)}
                          value={keyedItem.imgFit}
                          options={[
                            {
                              value: "cover",
                              label: t2(T.FRENCH_UI_STRINGS.cover_whole_area),
                            },
                            {
                              value: "inside",
                              label: t2(T.FRENCH_UI_STRINGS.fit_inside_area),
                            },
                          ]}
                          onChange={(v) => updateContentProperty("imgFit", v as "cover" | "inside")}
                        />
                        {/* </Show> */}
                      </Show>
                    </div>
                  </Match>
                  <Match when={keyedItem.type === "placeholder"}>
                    <div class="space-y-4">
                      <Checkbox
                        label={t2(T.FRENCH_UI_STRINGS.hide_placeholder_shading)}
                        checked={keyedItem.placeholderInvisible}
                        onChange={(ch) =>
                          updateContentProperty("placeholderInvisible", ch)
                        }
                      />
                      <Checkbox
                        label={t2(T.Reports.stretch_to_fit)}
                        checked={keyedItem.placeholderStretch}
                        onChange={(ch) =>
                          updateContentProperty("placeholderStretch", ch)
                        }
                      />
                      <Show when={!keyedItem.placeholderStretch}>
                        <Slider
                          label={t("Height")}
                          min={50}
                          max={1500}
                          step={50}
                          value={keyedItem.placeholderHeight ?? 100}
                          onChange={(v) =>
                            updateContentProperty("placeholderHeight", v)
                          }
                          fullWidth
                          showValueInLabel
                        />
                      </Show>
                    </div>
                  </Match>
                </Switch>
              </div>
            );
          }}
        </Show>
      </div>
    </div>
  );
}
