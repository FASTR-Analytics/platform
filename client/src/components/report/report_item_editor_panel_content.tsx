import {
  ProjectDetail,
  ReportDetail,
  ReportItemConfig,
  ReportItemContentItem,
  ReportItemContentItemType,
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
  TextArea,
  getSelectOptions,
} from "panther";
import { Match, Setter, Show, Switch, createMemo } from "solid-js";
import { SetStoreFunction } from "solid-js/store";
import { PresentationObjectMiniDisplay } from "~/components/PresentationObjectMiniDisplay";
import { instanceState } from "~/state/instance_state";
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
    const result = findById(content, p.selectedItemId);
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
    const newLayout = updateNode(content);
    p.setTempReportItemConfig("freeform", "content", newLayout);
  }

  async function updateItemType(type: ReportItemContentItemType) {
    updateSelectedItemData((data) => ({ ...data, type }));
  }
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
                    label="Content type"
                    options={[
                      {
                        value: "figure",
                        label: "Visualization",
                      },
                      { value: "image", label: "Image" },
                      { value: "text", label: "Text" },
                    ]}
                    value={keyedItem.type}
                    onChange={(v) =>
                      updateItemType(
                        v as "figure" | "image" | "text",
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
                              {"Select a visualization to display"}
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
                                    keyedPresentationObjectInReportInfo.metricId
                                      ? p.projectDetail.metrics.find(m => m.id === keyedPresentationObjectInReportInfo.metricId)?.moduleId
                                      : undefined
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
                              ? "Change"
                              : "Select"}{" "}
                            {"visualization"}
                          </Button>
                        </div>
                      </div>
                      <div class="ui-spy-sm">
                        <Checkbox
                          label="Allow visualization to shrink or stretch"
                          checked={keyedItem.stretch}
                          onChange={(ch) =>
                            updateContentProperty("stretch", ch)
                          }
                        />
                        <Checkbox
                          label="Use additional visualization scaling"
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
                            label="Scale"
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
                          label="Hide visualization caption"
                          checked={keyedItem.hideFigureCaption}
                          onChange={(ch) =>
                            updateHides(ch, "hideFigureCaption")
                          }
                        />
                        <Checkbox
                          label="Hide visualization sub-caption"
                          checked={keyedItem.hideFigureSubCaption}
                          onChange={(ch) =>
                            updateHides(ch, "hideFigureSubCaption")
                          }
                        />
                        <Checkbox
                          label="Hide visualization footnote"
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
                        label="Text"
                        value={keyedItem.markdown ?? ""}
                        onChange={(v) => updateContentProperty("markdown", v)}
                        fullWidth
                        height="300px"
                      />
                      <div class="ui-gap-sm flex">
                        <Select
                          label="Text background"
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
                          label="Text size"
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
                          label="Fill shading to available area"
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
                      <Select
                        label="Image file"
                        options={getSelectOptions(
                          instanceState.assets
                            .filter((f) => f.isImage)
                            .map((f) => f.fileName),
                        )}
                        value={keyedItem.imgFile}
                        onChange={(v) =>
                          updateContentProperty("imgFile", v)
                        }
                        fullWidth
                      />
                      <Show when={keyedItem.imgFile}>
                        {/* <Show when={keyedItem.imgFit === "inside"}> */}
                        <Checkbox
                          label="Stretch to fit available space"
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
                            label="Height"
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
                          label="Image fit"
                          value={keyedItem.imgFit}
                          options={[
                            {
                              value: "cover",
                              label: "Cover whole area",
                            },
                            {
                              value: "inside",
                              label: "Fit inside area",
                            },
                          ]}
                          onChange={(v) => updateContentProperty("imgFit", v as "cover" | "inside")}
                        />
                        {/* </Show> */}
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
