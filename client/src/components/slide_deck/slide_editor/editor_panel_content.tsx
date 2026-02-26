import {
  ContentSlide,
  ContentBlock,
  DeckFooterConfig,
  FigureBlock,
  TextBlock,
  ImageBlock,
  t3,
  TC,
} from "lib";
import {
  TextArea,
  OpenEditorProps,
  findById,
  LayoutNode,
  Select,
  Button,
  LabelHolder,
  MultiSelect,
  RadioGroup,
  StateHolderWrapper,
  getSelectOptions,
  timQuery,
  Slider,
} from "panther";
import { createSignal, Match, Setter, Show, Switch } from "solid-js";
import { serverActions } from "~/server_actions";
import { SetStoreFunction } from "solid-js/store";
import { convertBlockType } from "../slide_transforms/convert_block_type";

type Props = {
  projectId: string;
  tempSlide: ContentSlide;
  setTempSlide: SetStoreFunction<any>;
  selectedBlockId: string | undefined;
  setSelectedBlockId: Setter<string | undefined>;
  openEditor: <TProps, TReturn>(
    v: OpenEditorProps<TProps, TReturn>,
  ) => Promise<TReturn | undefined>;
  contentTab: "slide" | "block";
  setContentTab: Setter<"slide" | "block">;
  onShowLayoutMenu: (x: number, y: number) => void;
  onEditVisualization: () => void;
  onSelectVisualization: () => void;
  onCreateVisualization: () => void;
  deckLogos: string[];
  deckFooter: DeckFooterConfig | undefined;
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

    function updateNode(
      node: LayoutNode<ContentBlock>,
    ): LayoutNode<ContentBlock> {
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
      const newLayout = convertBlockType(
        p.tempSlide.layout,
        p.selectedBlockId,
        newType as "text" | "figure" | "image",
      );
      p.setTempSlide("layout", newLayout);
    }
  }

  return (
    <div class="flex h-full w-full flex-col">
      <div class="flex w-full flex-none border-b">
        <div
          class="ui-hoverable data-[selected=true]:bg-base-200 flex-1 border-r py-2 text-center"
          onClick={() => p.setContentTab("slide")}
          data-selected={p.contentTab === "slide"}
        >
          {t3({ en: "Header / Footer", fr: "En-tête / Pied de page" })}
        </div>
        <div
          class="ui-hoverable data-[selected=true]:bg-base-200 flex-1 py-2 text-center"
          onClick={() => p.setContentTab("block")}
          data-selected={p.contentTab === "block"}
        >
          {t3({ en: "Content", fr: "Contenu" })}
        </div>
      </div>

      <div class="h-0 w-full flex-1">
        <Switch>
          <Match when={p.contentTab === "slide"}>
            <div class="h-full overflow-auto">
              <div class="ui-pad ui-spy">
                <TextArea
                  label={t3({ en: "Header", fr: "En-tête" })}
                  value={p.tempSlide.header ?? ""}
                  onChange={(v: string) =>
                    p.setTempSlide("header", v || undefined)
                  }
                  fullWidth
                  height="60px"
                />
                <TextArea
                  label={t3({ en: "Sub Header", fr: "Sous-en-tête" })}
                  value={p.tempSlide.subHeader ?? ""}
                  onChange={(v: string) =>
                    p.setTempSlide("subHeader", v || undefined)
                  }
                  fullWidth
                  height="40px"
                />
                <TextArea
                  label={t3({ en: "Date", fr: "Date" })}
                  value={p.tempSlide.date ?? ""}
                  onChange={(v: string) =>
                    p.setTempSlide("date", v || undefined)
                  }
                  fullWidth
                  height="40px"
                />
                <LabelHolder label={t3({ en: "Header logos", fr: "Logos d'en-tête" })}>
                  <Show
                    when={p.deckLogos.length > 0}
                    fallback={
                      <div class="text-neutral text-xs">
                        {t3({ en: "No logos set in report settings", fr: "Aucun logo défini dans les paramètres du rapport" })}
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
                <hr class="border-base-300" />
                <Show
                  when={!p.deckFooter}
                  fallback={
                    <div class="text-neutral text-xs">
                      {t3({ en: "Footer is set at the deck level", fr: "Le pied de page est défini au niveau du diaporama" })}
                    </div>
                  }
                >
                  <TextArea
                    label={t3({ en: "Footer", fr: "Pied de page" })}
                    value={p.tempSlide.footer ?? ""}
                    onChange={(v: string) =>
                      p.setTempSlide("footer", v || undefined)
                    }
                    fullWidth
                    height="40px"
                  />
                  <LabelHolder label={t3({ en: "Footer logos", fr: "Logos de pied de page" })}>
                    <Show
                      when={p.deckLogos.length > 0}
                      fallback={
                        <div class="text-neutral text-xs">
                          {t3({ en: "No logos set in report settings", fr: "Aucun logo défini dans les paramètres du rapport" })}
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
                </Show>
              </div>
            </div>
          </Match>

          <Match when={p.contentTab === "block"}>
            <div class="h-full overflow-auto">
              <Show
                when={getCurrentBlock()}
                fallback={
                  <div class="ui-pad text-base-content/70 text-sm">
                    {t3({ en: "Click a block on the canvas to edit it", fr: "Cliquez sur un bloc du canevas pour le modifier" })}
                  </div>
                }
              >
                <div class="ui-pad ui-spy">
                  <div class="ui-gap-sm flex items-end">
                    <Select
                      label={t3({ en: "Content type", fr: "Type de contenu" })}
                      options={[
                        { value: "text", label: t3({ en: "Text", fr: "Texte" }) },
                        { value: "figure", label: t3({ en: "Visualization", fr: "Visualisation" }) },
                        { value: "image", label: t3({ en: "Image", fr: "Image" }) },
                      ]}
                      value={getCurrentBlock()?.type}
                      onChange={handleBlockTypeChange}
                      fullWidth
                    />
                    <Button
                      outline
                      onClick={(e: MouseEvent) => {
                        const rect = (
                          e.currentTarget as HTMLElement
                        ).getBoundingClientRect();
                        p.onShowLayoutMenu(rect.left, rect.bottom);
                      }}
                    >
                      {t3({ en: "Layout", fr: "Mise en page" })}
                    </Button>
                  </div>
                  <Switch>
                    <Match when={getCurrentBlock()?.type === "text"}>
                      <TextArea
                        label={t3({ en: "Text", fr: "Texte" })}
                        value={(getCurrentBlock() as TextBlock).markdown}
                        onChange={(v: string) =>
                          updateSelectedBlock((b: any) => ({
                            ...b,
                            markdown: v,
                          }))
                        }
                        fullWidth
                        height="300px"
                      />{" "}
                      <Select
                        label={t3({ en: "Text background", fr: "Arrière-plan du texte" })}
                        options={[
                          { value: "none", label: t3({ en: "None", fr: "Aucun" }) },
                          { value: "primary", label: t3({ en: "Theme color", fr: "Couleur du thème" }) },
                          { value: "grey", label: t3({ en: "Light grey", fr: "Gris clair" }) },
                          { value: "success", label: t3({ en: "Green", fr: "Vert" }) },
                          { value: "danger", label: t3({ en: "Red", fr: "Rouge" }) },
                        ]}
                        value={
                          (getCurrentBlock() as TextBlock).style
                            ?.textBackground ?? "none"
                        }
                        onChange={(v: string) =>
                          updateSelectedBlock((b) => {
                            const tb = b as TextBlock;
                            return {
                              ...tb,
                              style: { ...tb.style, textBackground: v },
                            };
                          })
                        }
                        fullWidth
                      />
                      {(() => {
                        const TEXT_SIZES = [
                          0.41, 0.51, 0.64, 0.8, 1, 1.25, 1.56, 1.95, 2.44,
                          3.05, 3.81, 4.77,
                        ];
                        const TEXT_SIZE_LABELS: Record<number, string> = {
                          0.41: "3XS",
                          0.64: "XS",
                          1: "M",
                          1.56: "XL",
                          2.44: "3XL",
                          4.77: "6XL",
                        };
                        const SIZE_LABELS = [
                          "3XS",
                          "2XS",
                          "XS",
                          "S",
                          "M",
                          "L",
                          "XL",
                          "2XL",
                          "3XL",
                          "4XL",
                          "5XL",
                          "6XL",
                        ];
                        const blockIndex = () => {
                          const size =
                            (getCurrentBlock() as TextBlock).style?.textSize ??
                            1;
                          const idx = TEXT_SIZES.indexOf(size);
                          return idx >= 0 ? idx : TEXT_SIZES.indexOf(1);
                        };
                        const [dragIndex, setDragIndex] = createSignal<
                          number | undefined
                        >(undefined);
                        const displayIndex = () => dragIndex() ?? blockIndex();
                        const disableReset = () =>
                          (getCurrentBlock() as TextBlock).style?.textSize ===
                            1 ||
                          (getCurrentBlock() as TextBlock).style === undefined;
                        return (
                          <div class="ui-gap-sm flex items-center">
                            <Slider
                              label={t3({ en: "Text size", fr: "Taille du texte" })}
                              value={displayIndex()}
                              onChange={(i) => setDragIndex(i)}
                              onRelease={(i) => {
                                setDragIndex(undefined);
                                const size = TEXT_SIZES[i];
                                updateSelectedBlock((b) => {
                                  const tb = b as TextBlock;
                                  return {
                                    ...tb,
                                    style: { ...tb.style, textSize: size },
                                  };
                                });
                              }}
                              min={0}
                              max={TEXT_SIZES.length - 1}
                              step={1}
                              showValueInLabel
                              valueInLabelFormatter={(i) =>
                                SIZE_LABELS[i] ?? ""
                              }
                              ticks={{
                                major: TEXT_SIZES.map((_, i) => i),
                                showLabels: true,
                                labelFormatter: (i) =>
                                  TEXT_SIZE_LABELS[TEXT_SIZES[i]] ?? "",
                              }}
                              fullWidth
                            />

                            <Button
                              outline
                              onClick={() => {
                                setDragIndex(undefined);
                                updateSelectedBlock((b) => {
                                  const tb = b as TextBlock;
                                  return {
                                    ...tb,
                                    style: { ...tb.style, textSize: 1 },
                                  };
                                });
                              }}
                              iconName="refresh"
                              disabled={disableReset()}
                            >
                              {/* Layout */}
                            </Button>
                          </div>
                        );
                      })()}
                    </Match>
                    <Match when={getCurrentBlock()?.type === "figure"}>
                      {(() => {
                        const block = () => getCurrentBlock() as FigureBlock;
                        const hasFigure = () => !!block().figureInputs;
                        const hasSource = () =>
                          block().source?.type === "from_data";
                        return (
                          <div class="ui-gap-sm flex flex-col">
                            <Show when={hasFigure() && hasSource()}>
                              <Button onClick={() => p.onEditVisualization()}>
                                {t3({ en: "Edit Visualization", fr: "Modifier la visualisation" })}
                              </Button>
                            </Show>
                            <Button onClick={() => p.onSelectVisualization()}>
                              {hasFigure()
                                ? t3({ en: "Switch Visualization", fr: "Changer de visualisation" })
                                : t3({ en: "Select Visualization", fr: "Sélectionner la visualisation" })}
                            </Button>
                            <Button onClick={() => p.onCreateVisualization()}>
                              {t3({ en: "Create New Visualization", fr: "Créer une nouvelle visualisation" })}
                            </Button>
                            <Show when={hasFigure()}>
                              <Button
                                intent="danger"
                                outline
                                onClick={() =>
                                  updateSelectedBlock(() => ({
                                    type: "figure",
                                  }))
                                }
                              >
                                {t3({ en: "Remove Visualization", fr: "Supprimer la visualisation" })}
                              </Button>
                            </Show>
                          </div>
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
    t3(TC.loadingFiles),
  );

  return (
    <div class="ui-spy">
      <StateHolderWrapper state={assetListing.state()} noPad>
        {(keyedAssets) => (
          <Select
            label={t3({ en: "Image file", fr: "Fichier image" })}
            options={getSelectOptions(
              keyedAssets.filter((f) => f.isImage).map((f) => f.fileName),
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
          label={t3({ en: "Image fit", fr: "Ajustement de l'image" })}
          value={p.block().style?.imgFit ?? "contain"}
          options={[
            { value: "cover", label: t3({ en: "Cover whole area", fr: "Couvrir toute la zone" }) },
            {
              value: "contain",
              label: t3({ en: "Fit inside area", fr: "Adapter à l'intérieur de la zone" }),
            },
          ]}
          onChange={(v: string) =>
            p.updateSelectedBlock((b) => {
              const ib = b as ImageBlock;
              return {
                ...ib,
                style: { ...ib.style, imgFit: v as "cover" | "contain" },
              };
            })
          }
        />
        <Show when={(p.block().style?.imgFit ?? "contain") === "contain"}>
          <Select
            label={t3({ en: "Alignment", fr: "Alignement" })}
            options={[
              { value: "center", label: t3({ en: "Center", fr: "Centre" }) },
              { value: "top", label: t3({ en: "Top", fr: "Haut" }) },
              { value: "bottom", label: t3({ en: "Bottom", fr: "Bas" }) },
              { value: "left", label: t3({ en: "Left", fr: "Gauche" }) },
              { value: "right", label: t3({ en: "Right", fr: "Droite" }) },
            ]}
            value={p.block().style?.imgAlign ?? "center"}
            onChange={(v: string) =>
              p.updateSelectedBlock((b) => {
                const ib = b as ImageBlock;
                return {
                  ...ib,
                  style: {
                    ...ib.style,
                    imgAlign: v as
                      | "center"
                      | "top"
                      | "bottom"
                      | "left"
                      | "right",
                  },
                };
              })
            }
            fullWidth
          />
        </Show>
      </Show>
    </div>
  );
}
