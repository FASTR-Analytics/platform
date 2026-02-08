import { ContentSlide, ContentBlock, FigureBlock, TextBlock, ImageBlock, t2, T, t } from "lib";
import { TextArea, OpenEditorProps, findById, LayoutNode, Select, Button, LabelHolder, MultiSelect, RadioGroup, StateHolderWrapper, getSelectOptions, timQuery } from "panther";
import { Match, Setter, Show, Switch } from "solid-js";
import { serverActions } from "~/server_actions";
import { SetStoreFunction } from "solid-js/store";
import { convertBlockType } from "../slide_transforms/convert_block_type";

type Props = {
  projectId: string;
  tempSlide: ContentSlide;
  setTempSlide: SetStoreFunction<any>;
  selectedBlockId: string | undefined;
  setSelectedBlockId: Setter<string | undefined>;
  openEditor: <TProps, TReturn>(v: OpenEditorProps<TProps, TReturn>) => Promise<TReturn | undefined>;
  contentTab: "slide" | "block";
  setContentTab: Setter<"slide" | "block">;
  onShowLayoutMenu: (x: number, y: number) => void;
  onEditVisualization: () => void;
  onSelectVisualization: () => void;
  deckLogos: string[];
};

export function SlideEditorPanelContent(p: Props) {
  // Cache block data by blockId+type for restoration when switching back
  const blockTypeCache = new Map<string, ContentBlock>();

  function cacheKey(blockId: string, blockType: string) {
    return `${blockId}_${blockType}`;
  }

  function getCurrentBlock(): ContentBlock | undefined {
    if (!p.selectedBlockId) return undefined;
    const result = findById(p.tempSlide.layout, p.selectedBlockId);
    if (!result || result.node.type !== "item") return undefined;
    return result.node.data;
  }

  function updateSelectedBlock(updater: (block: ContentBlock) => ContentBlock) {
    if (!p.selectedBlockId) return;

    function updateNode(node: LayoutNode<ContentBlock>): LayoutNode<ContentBlock> {
      if (node.id === p.selectedBlockId && node.type === "item") {
        return { ...node, data: updater(node.data) };
      }
      if (node.type === "rows" || node.type === "cols") {
        return { ...node, children: node.children.map(updateNode) };
      }
      return node;
    }

    const newLayout = updateNode(p.tempSlide.layout);
    p.setTempSlide("layout", newLayout);
  }

  function handleBlockTypeChange(newType: string) {
    if (!p.selectedBlockId) return;
    const current = getCurrentBlock();
    if (!current || current.type === newType) return;

    // Cache current block before switching
    blockTypeCache.set(cacheKey(p.selectedBlockId, current.type), current);

    // Check cache for target type
    const cached = blockTypeCache.get(cacheKey(p.selectedBlockId, newType));
    if (cached) {
      updateSelectedBlock(() => cached);
    } else {
      const newLayout = convertBlockType(p.tempSlide.layout, p.selectedBlockId, newType as "text" | "figure" | "image");
      p.setTempSlide("layout", newLayout);
    }
  }

  return (
    <div class="flex h-full w-full flex-col">
      <div class="flex w-full flex-none border-b">
        <div
          class="ui-hoverable flex-1 border-r py-2 text-center data-[selected=true]:bg-base-200"
          onClick={() => p.setContentTab("slide")}
          data-selected={p.contentTab === "slide"}
        >
          Slide
        </div>
        <div
          class="ui-hoverable flex-1 py-2 text-center data-[selected=true]:bg-base-200"
          onClick={() => p.setContentTab("block")}
          data-selected={p.contentTab === "block"}
        >
          Block
        </div>
      </div>

      <div class="h-0 w-full flex-1">
        <Switch>
          <Match when={p.contentTab === "slide"}>
            <div class="h-full overflow-auto">
              <div class="ui-pad ui-spy">
                <TextArea
                  label="Header"
                  value={p.tempSlide.header ?? ""}
                  onChange={(v: string) => p.setTempSlide("header", v || undefined)}
                  fullWidth
                  height="60px"
                />
                <TextArea
                  label="Sub Header"
                  value={p.tempSlide.subHeader ?? ""}
                  onChange={(v: string) => p.setTempSlide("subHeader", v || undefined)}
                  fullWidth
                  height="40px"
                />
                <TextArea
                  label="Date"
                  value={p.tempSlide.date ?? ""}
                  onChange={(v: string) => p.setTempSlide("date", v || undefined)}
                  fullWidth
                  height="40px"
                />
                <TextArea
                  label="Footer"
                  value={p.tempSlide.footer ?? ""}
                  onChange={(v: string) => p.setTempSlide("footer", v || undefined)}
                  fullWidth
                  height="40px"
                />
                <LabelHolder label={t2(T.FRENCH_UI_STRINGS.header_logos)}>
                  <Show
                    when={p.deckLogos.length > 0}
                    fallback={
                      <div class="text-xs text-neutral">
                        {t2(T.FRENCH_UI_STRINGS.no_logos_set_in_report_setting)}
                      </div>
                    }
                  >
                    <MultiSelect
                      values={p.tempSlide.headerLogos ?? []}
                      options={p.deckLogos.map((logo) => ({
                        value: logo,
                        label: logo,
                      }))}
                      onChange={(selectedLogos) => {
                        p.setTempSlide("headerLogos", selectedLogos);
                      }}
                    />
                  </Show>
                </LabelHolder>
                <LabelHolder label={t2(T.FRENCH_UI_STRINGS.footer_logos)}>
                  <Show
                    when={p.deckLogos.length > 0}
                    fallback={
                      <div class="text-xs text-neutral">
                        {t2(T.FRENCH_UI_STRINGS.no_logos_set_in_report_setting)}
                      </div>
                    }
                  >
                    <MultiSelect
                      values={p.tempSlide.footerLogos ?? []}
                      options={p.deckLogos.map((logo) => ({
                        value: logo,
                        label: logo,
                      }))}
                      onChange={(selectedLogos) => {
                        p.setTempSlide("footerLogos", selectedLogos);
                      }}
                    />
                  </Show>
                </LabelHolder>
              </div>
            </div>
          </Match>

          <Match when={p.contentTab === "block"}>
            <div class="h-full overflow-auto">
              <Show
                when={getCurrentBlock()}
                fallback={
                  <div class="ui-pad text-sm text-base-content/70">
                    Click a block on the canvas to edit it
                  </div>
                }
              >
                <div class="ui-pad ui-spy">
                  <div class="flex items-end ui-gap-sm">
                    <Select
                      label="Block Type"
                      options={[
                        { value: "text", label: "Text" },
                        { value: "figure", label: "Visualization" },
                        { value: "image", label: "Image" },
                      ]}
                      value={getCurrentBlock()?.type}
                      onChange={handleBlockTypeChange}
                      fullWidth
                    />
                    <Button
                      outline
                      onClick={(e: MouseEvent) => {
                        const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                        p.onShowLayoutMenu(rect.left, rect.bottom);
                      }}
                    >
                      Layout
                    </Button>
                  </div>
                  <Switch>
                    <Match when={getCurrentBlock()?.type === "text"}>
                      <div class="flex ui-gap-sm">
                        <Select
                          label={t2(T.FRENCH_UI_STRINGS.text_background)}
                          options={[
                            { value: "none", label: "None" },
                            { value: "primary", label: "Theme color" },
                            { value: "grey", label: "Light grey" },
                            { value: "success", label: "Green" },
                            { value: "danger", label: "Red" },
                          ]}
                          value={(getCurrentBlock() as TextBlock).style?.textBackground ?? "none"}
                          onChange={(v: string) => updateSelectedBlock((b) => {
                            const tb = b as TextBlock;
                            return { ...tb, style: { ...tb.style, textBackground: v } };
                          })}
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
                          value={String((getCurrentBlock() as TextBlock).style?.textSize ?? 1)}
                          onChange={(v: string) => updateSelectedBlock((b) => {
                            const tb = b as TextBlock;
                            return { ...tb, style: { ...tb.style, textSize: Number(v) } };
                          })}
                          fullWidth
                        />
                      </div>
                      <TextArea
                        label="Markdown Content"
                        value={(getCurrentBlock() as TextBlock).markdown}
                        onChange={(v: string) => updateSelectedBlock((b: any) => ({ ...b, markdown: v }))}
                        fullWidth
                        height="300px"
                      />
                    </Match>
                    <Match when={getCurrentBlock()?.type === "figure"}>
                      {(() => {
                        const block = () => getCurrentBlock() as FigureBlock;
                        const hasFigure = () => !!block().figureInputs;
                        const hasSource = () => block().source?.type === "from_data";
                        return (
                          <>
                            <Show when={!hasFigure()}>
                              <Button onClick={() => p.onSelectVisualization()}>
                                Select Visualization
                              </Button>
                            </Show>
                            <Show when={hasFigure()}>
                              <div class="flex flex-col ui-gap-sm">
                                <Show when={hasSource()}>
                                  <Button onClick={() => p.onEditVisualization()}>
                                    Edit Visualization
                                  </Button>
                                </Show>
                                <Button onClick={() => p.onSelectVisualization()}>
                                  Switch Visualization
                                </Button>
                              </div>
                            </Show>
                          </>
                        );
                      })()}
                    </Match>
                    <Match when={getCurrentBlock()?.type === "image"}>
                      <ImageBlockEditor
                        block={() => getCurrentBlock() as ImageBlock}
                        updateSelectedBlock={updateSelectedBlock}
                      />
                    </Match>
                  </Switch>
                </div>
              </Show>
            </div>
          </Match>
        </Switch>
      </div>
    </div>
  );
}

function ImageBlockEditor(p: {
  block: () => ImageBlock;
  updateSelectedBlock: (updater: (block: ContentBlock) => ContentBlock) => void;
}) {
  const assetListing = timQuery(
    () => serverActions.getAssets({}),
    t2(T.FRENCH_UI_STRINGS.loading_files),
  );

  return (
    <div class="ui-spy">
      <StateHolderWrapper state={assetListing.state()} noPad>
        {(keyedAssets) => (
          <Select
            label={t2(T.FRENCH_UI_STRINGS.image_file)}
            options={getSelectOptions(
              keyedAssets
                .filter((f) => f.isImage)
                .map((f) => f.fileName),
            )}
            value={p.block().imgFile}
            onChange={(v: string) =>
              p.updateSelectedBlock((b) => ({ ...b, imgFile: v }))
            }
            fullWidth
          />
        )}
      </StateHolderWrapper>
      <Show when={p.block().imgFile}>
        <RadioGroup
          label={t2(T.FRENCH_UI_STRINGS.image_fit)}
          value={p.block().style?.imgFit ?? "contain"}
          options={[
            { value: "cover", label: t2(T.FRENCH_UI_STRINGS.cover_whole_area) },
            { value: "contain", label: t2(T.FRENCH_UI_STRINGS.fit_inside_area) },
          ]}
          onChange={(v: string) =>
            p.updateSelectedBlock((b) => {
              const ib = b as ImageBlock;
              return { ...ib, style: { ...ib.style, imgFit: v as "cover" | "contain" } };
            })
          }
        />
        <Show when={(p.block().style?.imgFit ?? "contain") === "contain"}>
          <Select
            label={t("Alignment")}
            options={[
              { value: "center", label: "Center" },
              { value: "top", label: "Top" },
              { value: "bottom", label: "Bottom" },
              { value: "left", label: "Left" },
              { value: "right", label: "Right" },
            ]}
            value={p.block().style?.imgAlign ?? "center"}
            onChange={(v: string) =>
              p.updateSelectedBlock((b) => {
                const ib = b as ImageBlock;
                return { ...ib, style: { ...ib.style, imgAlign: v as "center" | "top" | "bottom" | "left" | "right" } };
              })
            }
            fullWidth
          />
        </Show>
      </Show>
    </div>
  );
}
