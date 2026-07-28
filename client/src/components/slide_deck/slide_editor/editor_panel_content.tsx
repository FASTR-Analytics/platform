import type {
  ContentSlide,
  ContentBlock,
  ContentSlideSplit,
  ContentSlideSplitFill,
  FigureBlock,
  TextBlock,
  TextSizeKey,
  ImageBlock,
  LogoVisibility,
} from "lib";
import { DEFAULT_TEXT_SIZE_KEY, findNodeMap, t3, TEXT_SIZE_KEYS } from "lib";
import type { PatternType } from "panther";
import {
  TextArea,
  OpenEditorProps,
  findById,
  LayoutNode,
  Select,
  Button,
  RadioGroup,
  getSelectOptions,
  Slider,
  Checkbox,
} from "panther";
import { createSignal, Match, Setter, Show, Switch } from "solid-js";
import { instanceState } from "~/state/instance/t1_store";
import { SetStoreFunction } from "solid-js/store";
import { convertBlockType } from "../slide_transforms/convert_block_type";
import { MarkdownGuide } from "~/components/_markdown_guide";
import { CollabMarkdownEditor } from "./collab_markdown_editor";
import { CollabTextField } from "./collab_text_field";
import type { SlideSession } from "~/state/project/collab";
import type * as Y from "yjs";

type Props = {
  projectId: string;
  tempSlide: ContentSlide;
  setTempSlide: SetStoreFunction<any>;
  selectedBlockId: string | undefined;
  setSelectedBlockId: Setter<string | undefined>;
  session: SlideSession | null;
  collabReady: boolean;
  onSelectTextTarget: (targetId: string | undefined) => void;
  openEditor: <TProps, TReturn>(
    v: OpenEditorProps<TProps, TReturn>,
  ) => Promise<TReturn | undefined>;
  contentTab: "slide" | "block";
  setContentTab: Setter<"slide" | "block">;
  onShowLayoutMenu: (x: number, y: number) => void;
  onEditVisualization: () => void;
  onSelectVisualization: () => void;
  onCreateVisualization: () => void;
  showHeaderLogosByDefault: boolean;
  showFooterLogosByDefault: boolean;
  hasGlobalFooterText: boolean;
};

function getLogoVisibilityOptions(showByDefault: boolean) {
  return [
    {
      value: "inherit",
      label: t3({
        en: showByDefault ? "Default (show)" : "Default (hide)",
        fr: showByDefault ? "Défaut (afficher)" : "Défaut (masquer)",
        pt: showByDefault ? "Predefinição (mostrar)" : "Predefinição (ocultar)",
      }),
    },
    { value: "show", label: t3({ en: "Show", fr: "Afficher", pt: "Mostrar" }) },
    { value: "hide", label: t3({ en: "Hide", fr: "Masquer", pt: "Ocultar" }) },
  ];
}

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

  // The selected text block's Y.Text, but only once live collab is ready and the
  // block exists in the shared doc — otherwise we fall back to the panther
  // TextArea. Present => the CodeMirror collaborative editor (remote carets).
  function getBlockYText(): Y.Text | undefined {
    if (!p.collabReady || !p.session || !p.selectedBlockId) return undefined;
    const m = findNodeMap(p.session.doc, p.selectedBlockId);
    if (!m || m.get("blockType") !== "text") return undefined;
    return m.get("markdown") as Y.Text | undefined;
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
          class="ui-hoverable-base-100 data-[selected=true]:bg-base-200 flex-1 border-r py-2 text-center"
          onClick={() => p.setContentTab("slide")}
          data-selected={p.contentTab === "slide"}
        >
          {t3({
            en: "Header / Footer",
            fr: "En-tête / Pied de page",
            pt: "Cabeçalho / Rodapé",
          })}
        </div>
        <div
          class="ui-hoverable-base-100 data-[selected=true]:bg-base-200 flex-1 py-2 text-center"
          onClick={() => p.setContentTab("block")}
          data-selected={p.contentTab === "block"}
        >
          {t3({ en: "Content", fr: "Contenu", pt: "Conteúdo" })}
        </div>
      </div>

      <div class="h-0 w-full flex-1">
        <Switch>
          <Match when={p.contentTab === "slide"}>
            <div class="h-full overflow-auto">
              <div class="ui-pad ui-spy-sm">
                <CollabTextField
                  session={p.session}
                  collabReady={p.collabReady}
                  fieldKey="header"
                  targetId="headerText"
                  onSelectTarget={p.onSelectTextTarget}
                  label={t3({ en: "Header", fr: "En-tête", pt: "Cabeçalho" })}
                  value={p.tempSlide.header ?? ""}
                  onChange={(v: string) =>
                    p.setTempSlide("header", v || undefined)
                  }
                  height="60px"
                />
                <CollabTextField
                  session={p.session}
                  collabReady={p.collabReady}
                  fieldKey="subHeader"
                  targetId="subHeaderText"
                  onSelectTarget={p.onSelectTextTarget}
                  label={t3({
                    en: "Sub Header",
                    fr: "Sous-en-tête",
                    pt: "Subcabeçalho",
                  })}
                  value={p.tempSlide.subHeader ?? ""}
                  onChange={(v: string) =>
                    p.setTempSlide("subHeader", v || undefined)
                  }
                  height="40px"
                />
                <CollabTextField
                  session={p.session}
                  collabReady={p.collabReady}
                  fieldKey="date"
                  targetId="dateText"
                  onSelectTarget={p.onSelectTextTarget}
                  label={t3({ en: "Date", fr: "Date", pt: "Data" })}
                  value={p.tempSlide.date ?? ""}
                  onChange={(v: string) =>
                    p.setTempSlide("date", v || undefined)
                  }
                  height="40px"
                />
                <Select
                  label={t3({
                    en: "Header logos",
                    fr: "Logos d'en-tête",
                    pt: "Logótipos do cabeçalho",
                  })}
                  value={p.tempSlide.showHeaderLogos ?? "inherit"}
                  options={getLogoVisibilityOptions(p.showHeaderLogosByDefault)}
                  onChange={(v) =>
                    p.setTempSlide(
                      "showHeaderLogos",
                      v === "inherit" ? undefined : (v as LogoVisibility),
                    )
                  }
                />
              </div>
              <hr class="mt-3 mb-1" />
              <div class="ui-pad ui-spy-sm">
                <Show
                  when={!p.hasGlobalFooterText}
                  fallback={
                    <div class="ui-text-caption">
                      {t3({
                        en: "Footer text is set at the deck level",
                        fr: "Le texte de pied de page est défini au niveau du diaporama",
                        pt: "O texto do rodapé é definido ao nível da apresentação",
                      })}
                    </div>
                  }
                >
                  <CollabTextField
                    session={p.session}
                    collabReady={p.collabReady}
                    fieldKey="footer"
                    targetId="footerText"
                    onSelectTarget={p.onSelectTextTarget}
                    label={t3({
                      en: "Footer text",
                      fr: "Texte de pied de page",
                      pt: "Texto do rodapé",
                    })}
                    value={p.tempSlide.footer ?? ""}
                    onChange={(v: string) =>
                      p.setTempSlide("footer", v || undefined)
                    }
                    height="40px"
                  />
                </Show>
                <Select
                  label={t3({
                    en: "Footer logos",
                    fr: "Logos de pied de page",
                    pt: "Logótipos do rodapé",
                  })}
                  value={p.tempSlide.showFooterLogos ?? "inherit"}
                  options={getLogoVisibilityOptions(p.showFooterLogosByDefault)}
                  onChange={(v) =>
                    p.setTempSlide(
                      "showFooterLogos",
                      v === "inherit" ? undefined : (v as LogoVisibility),
                    )
                  }
                />
              </div>
              <hr class="mt-3 mb-1" />
              <div class="ui-pad ui-spy-sm">
                <Checkbox
                  label={t3({
                    en: "Add split panel",
                    fr: "Ajouter panneau divisé",
                    pt: "Adicionar painel dividido",
                  })}
                  checked={!!p.tempSlide.split}
                  onChange={(checked) => {
                    if (checked) {
                      p.setTempSlide("split", {
                        placement: "left",
                        sizeAsPct: 15,
                        fill: { type: "plain" },
                      } satisfies ContentSlideSplit);
                    } else {
                      p.setTempSlide("split", undefined);
                    }
                  }}
                />
                <Show when={p.tempSlide.split}>
                  <Select
                    label={t3({ en: "Placement", fr: "Placement", pt: "Posicionamento" })}
                    value={p.tempSlide.split!.placement}
                    options={[
                      {
                        value: "left",
                        label: t3({ en: "Left", fr: "Gauche", pt: "Esquerda" }),
                      },
                      {
                        value: "right",
                        label: t3({ en: "Right", fr: "Droite", pt: "Direita" }),
                      },
                    ]}
                    onChange={(v) =>
                      p.setTempSlide(
                        "split",
                        "placement",
                        v as "left" | "right",
                      )
                    }
                    fullWidth
                  />
                  <Select
                    label={t3({ en: "Size", fr: "Taille", pt: "Tamanho" })}
                    value={String(p.tempSlide.split!.sizeAsPct)}
                    options={[
                      { value: "5", label: "5%" },
                      { value: "10", label: "10%" },
                      { value: "15", label: "15%" },
                      { value: "20", label: "20%" },
                      { value: "25", label: "25%" },
                      { value: "30", label: "30%" },
                      { value: "35", label: "35%" },
                      { value: "40", label: "40%" },
                      { value: "45", label: "45%" },
                      { value: "50", label: "50%" },
                    ]}
                    onChange={(v) =>
                      p.setTempSlide("split", "sizeAsPct", Number(v))
                    }
                    fullWidth
                  />
                  <Select
                    label={t3({ en: "Fill", fr: "Remplissage", pt: "Preenchimento" })}
                    value={p.tempSlide.split!.fill.type}
                    options={[
                      { value: "plain", label: t3({ en: "Plain", fr: "Uni", pt: "Liso" }) },
                      {
                        value: "pattern",
                        label: t3({ en: "Pattern", fr: "Motif", pt: "Padrão" }),
                      },
                      {
                        value: "image",
                        label: t3({ en: "Image", fr: "Image", pt: "Imagem" }),
                      },
                    ]}
                    onChange={(v) => {
                      if (v === "plain") {
                        p.setTempSlide("split", "fill", { type: "plain" });
                      } else if (v === "pattern") {
                        p.setTempSlide("split", "fill", {
                          type: "pattern",
                          patternType: "ovals",
                        });
                      } else if (v === "image") {
                        p.setTempSlide("split", "fill", {
                          type: "image",
                          imgFile: "",
                        });
                      }
                    }}
                    fullWidth
                  />
                  <Show when={p.tempSlide.split!.fill.type === "pattern"}>
                    <Select
                      label={t3({ en: "Pattern", fr: "Motif", pt: "Padrão" })}
                      value={
                        (
                          p.tempSlide.split!.fill as {
                            type: "pattern";
                            patternType: PatternType;
                          }
                        ).patternType
                      }
                      options={[
                        {
                          value: "ovals",
                          label: t3({ en: "Ovals", fr: "Ovales", pt: "Ovais" }),
                        },
                        {
                          value: "circles",
                          label: t3({ en: "Circles", fr: "Cercles", pt: "Círculos" }),
                        },
                        {
                          value: "dots",
                          label: t3({ en: "Dots", fr: "Points", pt: "Pontos" }),
                        },
                        {
                          value: "lines",
                          label: t3({ en: "Lines", fr: "Lignes", pt: "Linhas" }),
                        },
                        {
                          value: "grid",
                          label: t3({ en: "Grid", fr: "Grille", pt: "Grelha" }),
                        },
                        {
                          value: "chevrons",
                          label: t3({ en: "Chevrons", fr: "Chevrons", pt: "Galões" }),
                        },
                        {
                          value: "waves",
                          label: t3({ en: "Waves", fr: "Vagues", pt: "Ondas" }),
                        },
                        {
                          value: "noise",
                          label: t3({ en: "Noise", fr: "Bruit", pt: "Ruído" }),
                        },
                      ]}
                      onChange={(v) =>
                        p.setTempSlide("split", "fill", {
                          type: "pattern",
                          patternType: v as PatternType,
                        })
                      }
                      fullWidth
                    />
                  </Show>
                  <Show when={p.tempSlide.split!.fill.type === "image"}>
                    <Select
                      label={t3({ en: "Image", fr: "Image", pt: "Imagem" })}
                      options={getSelectOptions(
                        instanceState.assets
                          .filter((f) => f.isImage)
                          .map((f) => f.fileName),
                      )}
                      value={
                        (
                          p.tempSlide.split!.fill as {
                            type: "image";
                            imgFile: string;
                          }
                        ).imgFile
                      }
                      onChange={(v) =>
                        p.setTempSlide("split", "fill", {
                          type: "image",
                          imgFile: v,
                        })
                      }
                      fullWidth
                    />
                  </Show>
                </Show>
              </div>
            </div>
          </Match>

          <Match when={p.contentTab === "block"}>
            <div class="h-full overflow-auto">
              <Show
                when={getCurrentBlock()}
                fallback={
                  <div class="ui-pad text-base-content-muted text-sm">
                    {t3({
                      en: "Click a block on the canvas to edit it",
                      fr: "Cliquez sur un bloc du canevas pour le modifier",
                      pt: "Clique num bloco na área de edição para o editar",
                    })}
                  </div>
                }
              >
                <div class="ui-pad ui-spy">
                  <div class="ui-gap-sm flex items-end">
                    <Select
                      label={t3({ en: "Content type", fr: "Type de contenu", pt: "Tipo de conteúdo" })}
                      options={[
                        {
                          value: "text",
                          label: t3({ en: "Text", fr: "Texte", pt: "Texto" }),
                        },
                        {
                          value: "figure",
                          label: t3({
                            en: "Visualization",
                            fr: "Visualisation",
                            pt: "Visualização",
                          }),
                        },
                        {
                          value: "image",
                          label: t3({ en: "Image", fr: "Image", pt: "Imagem" }),
                        },
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
                      {t3({ en: "Layout", fr: "Mise en page", pt: "Disposição" })}
                    </Button>
                  </div>
                  <Switch>
                    <Match when={getCurrentBlock()?.type === "text"}>
                      <Show
                        when={getBlockYText()}
                        keyed
                        fallback={
                          <TextArea
                            label={t3({ en: "Text", fr: "Texte", pt: "Texto" })}
                            value={(getCurrentBlock() as TextBlock).markdown}
                            onChange={(v: string) =>
                              updateSelectedBlock((b: any) => ({
                                ...b,
                                markdown: v,
                              }))
                            }
                            fullWidth
                            height="300px"
                          />
                        }
                      >
                        {(yText) => (
                          <div class="ui-spy-sm">
                            <label class="text-base-content-muted text-xs">
                              {t3({ en: "Text", fr: "Texte", pt: "Texto" })}
                            </label>
                            <CollabMarkdownEditor
                              yText={yText}
                              awareness={p.session!.awareness}
                              onTextChange={(md) =>
                                updateSelectedBlock((b: any) => ({
                                  ...b,
                                  markdown: md,
                                }))
                              }
                              height="300px"
                            />
                          </div>
                        )}
                      </Show>
                      <Select
                        label={t3({
                          en: "Text background",
                          fr: "Arrière-plan du texte",
                          pt: "Fundo do texto",
                        })}
                        options={[
                          {
                            value: "none",
                            label: t3({ en: "None", fr: "Aucun", pt: "Nenhum" }),
                          },
                          {
                            value: "primary",
                            label: t3({
                              en: "Theme color",
                              fr: "Couleur du thème",
                              pt: "Cor do tema",
                            }),
                          },
                          {
                            value: "grey",
                            label: t3({ en: "Light grey", fr: "Gris clair", pt: "Cinzento claro" }),
                          },
                          {
                            value: "success",
                            label: t3({ en: "Green", fr: "Vert", pt: "Verde" }),
                          },
                          {
                            value: "danger",
                            label: t3({ en: "Red", fr: "Rouge", pt: "Vermelho" }),
                          },
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

                      <MarkdownGuide />

                      {/* <>
                        {(() => {
                          const TICK_LABEL_KEYS = new Set<TextSizeKey>([
                            "3xs",
                            "xs",
                            "m",
                            "xl",
                            "3xl",
                            "6xl",
                          ]);
                          const blockIndex = () => {
                            const key =
                              (getCurrentBlock() as TextBlock).style
                                ?.textSize ?? DEFAULT_TEXT_SIZE_KEY;
                            const idx = TEXT_SIZE_KEYS.indexOf(key);
                            return idx >= 0
                              ? idx
                              : TEXT_SIZE_KEYS.indexOf(DEFAULT_TEXT_SIZE_KEY);
                          };
                          const [dragIndex, setDragIndex] = createSignal<
                            number | undefined
                          >(undefined);
                          const displayIndex = () =>
                            dragIndex() ?? blockIndex();
                          const disableReset = () =>
                            (getCurrentBlock() as TextBlock).style?.textSize ===
                              DEFAULT_TEXT_SIZE_KEY ||
                            (getCurrentBlock() as TextBlock).style ===
                              undefined;
                          return (
                            <div class="ui-gap-sm flex items-center">
                              <Slider
                                label={t3({
                                  en: "Text size",
                                  fr: "Taille du texte",
                                  pt: "Tamanho do texto",
                                })}
                                value={displayIndex()}
                                onChange={(i) => setDragIndex(i)}
                                onRelease={(i) => {
                                  setDragIndex(undefined);
                                  const key = TEXT_SIZE_KEYS[i];
                                  updateSelectedBlock((b) => {
                                    const tb = b as TextBlock;
                                    return {
                                      ...tb,
                                      style: { ...tb.style, textSize: key },
                                    };
                                  });
                                }}
                                min={0}
                                max={TEXT_SIZE_KEYS.length - 1}
                                step={1}
                                showValueInLabel
                                valueInLabelFormatter={(i) =>
                                  TEXT_SIZE_KEYS[i]?.toUpperCase() ?? ""
                                }
                                ticks={{
                                  major: TEXT_SIZE_KEYS.map((_, i) => i),
                                  showLabels: true,
                                  labelFormatter: (i) =>
                                    TICK_LABEL_KEYS.has(TEXT_SIZE_KEYS[i])
                                      ? TEXT_SIZE_KEYS[i].toUpperCase()
                                      : "",
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
                                      style: {
                                        ...tb.style,
                                        textSize: DEFAULT_TEXT_SIZE_KEY,
                                      },
                                    };
                                  });
                                }}
                                iconName="refresh"
                                disabled={disableReset()}
                              ></Button>
                            </div>
                          );
                        })()}
                      </> */}
                    </Match>
                    <Match when={getCurrentBlock()?.type === "figure"}>
                      {(() => {
                        const block = () => getCurrentBlock() as FigureBlock;
                        const hasBundle = () => block().bundle !== undefined;
                        return (
                          <div class="ui-gap-sm flex flex-col">
                            <Show when={hasBundle()}>
                              <Button onClick={() => p.onEditVisualization()}>
                                {t3({
                                  en: "Edit Visualization",
                                  fr: "Modifier la visualisation",
                                  pt: "Editar visualização",
                                })}
                              </Button>
                            </Show>
                            <Button onClick={() => p.onSelectVisualization()}>
                              {hasBundle()
                                ? t3({
                                    en: "Switch Visualization",
                                    fr: "Changer de visualisation",
                                    pt: "Trocar visualização",
                                  })
                                : t3({
                                    en: "Select Visualization",
                                    fr: "Sélectionner la visualisation",
                                    pt: "Selecionar visualização",
                                  })}
                            </Button>
                            <Button onClick={() => p.onCreateVisualization()}>
                              {t3({
                                en: "Create New Visualization",
                                fr: "Créer une nouvelle visualisation",
                                pt: "Criar nova visualização",
                              })}
                            </Button>
                            <Show when={hasBundle()}>
                              <Button
                                intent="danger"
                                outline
                                onClick={() =>
                                  updateSelectedBlock(() => ({
                                    type: "figure",
                                  }))
                                }
                              >
                                {t3({
                                  en: "Remove Visualization",
                                  fr: "Supprimer la visualisation",
                                  pt: "Remover visualização",
                                })}
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
  return (
    <div class="ui-spy">
      <Select
        label={t3({ en: "Image file", fr: "Fichier image", pt: "Ficheiro de imagem" })}
        options={getSelectOptions(
          instanceState.assets.filter((f) => f.isImage).map((f) => f.fileName),
        )}
        value={p.block().imgFile}
        onChange={(v: string) =>
          p.updateSelectedBlock((b) => ({ ...b, imgFile: v }))
        }
        fullWidth
      />
      <Show when={p.block().imgFile}>
        <RadioGroup
          label={t3({ en: "Image fit", fr: "Ajustement de l'image", pt: "Ajuste da imagem" })}
          value={p.block().style?.imgFit ?? "contain"}
          options={[
            {
              value: "cover",
              label: t3({
                en: "Cover whole area",
                fr: "Couvrir toute la zone",
                pt: "Cobrir toda a área",
              }),
            },
            {
              value: "contain",
              label: t3({
                en: "Fit inside area",
                fr: "Adapter à l'intérieur de la zone",
                pt: "Ajustar dentro da área",
              }),
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
            label={t3({ en: "Alignment", fr: "Alignement", pt: "Alinhamento" })}
            options={[
              { value: "center", label: t3({ en: "Center", fr: "Centre", pt: "Centro" }) },
              { value: "top", label: t3({ en: "Top", fr: "Haut", pt: "Cima" }) },
              { value: "bottom", label: t3({ en: "Bottom", fr: "Bas", pt: "Baixo" }) },
              { value: "left", label: t3({ en: "Left", fr: "Gauche", pt: "Esquerda" }) },
              { value: "right", label: t3({ en: "Right", fr: "Droite", pt: "Direita" }) },
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
