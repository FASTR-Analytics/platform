// The slide editor's toolbar, laid out like the FASTR report toolbar (Google
// Docs style): a menu row (Slide, Text, Split panel) above one pill that
// follows the selection: text formatting while typing on the canvas, a title's
// size and weight, or the selected block's type, layout and figure/image
// controls. It replaces the old left-hand panel; text itself is edited on the
// canvas (inline_text_editor.tsx), or as markdown in MarkdownSourceModal.

import type {
  ContentBlock,
  ContentSlide,
  ContentSlideSplit,
  FigureBlock,
  FigureBundle,
  ImageBlock,
  LogoVisibility,
  PackageScope,
  RunAuthoringContext,
  Slide,
  TextBlock,
} from "lib";
import { t3 } from "lib";
import type { PatternType } from "panther";
import { findById, Icon } from "panther";
import { For, type JSX, Match, Show, Switch } from "solid-js";
import type { SetStoreFunction } from "solid-js/store";
import {
  MenuDivider,
  PopoverRow,
  ToolbarDivider,
  ToolbarPopover,
  ToolButton,
} from "~/components/products/_shared/mod.ts";
import { StaleFigureBadge } from "~/components/_shared/figure_editor/mod.ts";
import { instanceState } from "~/state/instance/t1_store";
import {
  INLINE_EDIT_KEEP_ATTR,
  type InlineEditTarget,
  type InlineTextApi,
} from "./inline_text_editor";
import { SLIDE_TEXT_FIELDS, slideTextField } from "./slide_fields";

type BlockType = "text" | "figure" | "image";

type Props = {
  tempSlide: Slide;
  setTempSlide: SetStoreFunction<any>;
  showCoverLogosByDefault: boolean;
  showHeaderLogosByDefault: boolean;
  showFooterLogosByDefault: boolean;
  hasGlobalFooterText: boolean;
  canEdit: boolean;
  canUndoRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onTypeChange: (type: "cover" | "section" | "content") => void;
  selectedBlockId: string | undefined;
  /** Selected title primitive id ("coverTitle", "headerText", ...). */
  selectedTextTarget: string | undefined;
  /** What is being typed on the canvas right now, and its commands. */
  editing: InlineEditTarget | undefined;
  inlineApi: InlineTextApi | undefined;
  onEditText: (target: InlineEditTarget) => void;
  /** Show an absent title field: seed it and start typing into it. */
  onAddField: (primitiveId: string) => void;
  onEditMarkdown: (blockId: string) => void;
  onShowLayoutMenu: (x: number, y: number) => void;
  onBlockTypeChange: (blockId: string, type: BlockType) => void;
  updateBlock: (blockId: string, updater: (b: ContentBlock) => ContentBlock) => void;
  staleFigureBundle: FigureBundle | undefined;
  staleContext: { scope: PackageScope; authoringContext: RunAuthoringContext };
  onFigureUpdated: (bundle: FigureBundle) => void;
  onEditVisualization: () => void;
  onCreateVisualization: () => void;
};

const TEXT_BACKGROUNDS = [
  { value: "none", label: () => t3({ en: "None", fr: "Aucun", pt: "Nenhum" }) },
  { value: "primary", label: () => t3({ en: "Theme color", fr: "Couleur du thème", pt: "Cor do tema" }) },
  { value: "grey", label: () => t3({ en: "Light grey", fr: "Gris clair", pt: "Cinzento claro" }) },
  { value: "success", label: () => t3({ en: "Green", fr: "Vert", pt: "Verde" }) },
  { value: "danger", label: () => t3({ en: "Red", fr: "Rouge", pt: "Vermelho" }) },
];

const PATTERNS: { value: PatternType; label: () => string }[] = [
  { value: "ovals", label: () => t3({ en: "Ovals", fr: "Ovales", pt: "Ovais" }) },
  { value: "circles", label: () => t3({ en: "Circles", fr: "Cercles", pt: "Círculos" }) },
  { value: "dots", label: () => t3({ en: "Dots", fr: "Points", pt: "Pontos" }) },
  { value: "lines", label: () => t3({ en: "Lines", fr: "Lignes", pt: "Linhas" }) },
  { value: "grid", label: () => t3({ en: "Grid", fr: "Grille", pt: "Grelha" }) },
  { value: "chevrons", label: () => t3({ en: "Chevrons", fr: "Chevrons", pt: "Galões" }) },
  { value: "waves", label: () => t3({ en: "Waves", fr: "Vagues", pt: "Ondas" }) },
  { value: "noise", label: () => t3({ en: "Noise", fr: "Bruit", pt: "Ruído" }) },
];

const IMAGE_ALIGNS = [
  { value: "center", label: () => t3({ en: "Center", fr: "Centre", pt: "Centro" }) },
  { value: "top", label: () => t3({ en: "Top", fr: "Haut", pt: "Cima" }) },
  { value: "bottom", label: () => t3({ en: "Bottom", fr: "Bas", pt: "Baixo" }) },
  { value: "left", label: () => t3({ en: "Left", fr: "Gauche", pt: "Esquerda" }) },
  { value: "right", label: () => t3({ en: "Right", fr: "Droite", pt: "Direita" }) },
] as const;

function blockTypeLabel(type: BlockType | undefined): string {
  return type === "figure"
    ? t3({ en: "Figure", fr: "Figure", pt: "Figura" })
    : type === "image"
    ? t3({ en: "Image", fr: "Image", pt: "Imagem" })
    : t3({ en: "Text", fr: "Texte", pt: "Texto" });
}

function Caption(p: { children: JSX.Element }) {
  return <div class="text-base-content-muted px-2 pt-1 pb-0.5 text-xs">{p.children}</div>;
}

function Check(p: { on: boolean }) {
  return (
    <span class="inline-flex w-5 justify-center">
      <Show when={p.on}>
        <Icon iconName="check" class="h-3.5 w-3.5" />
      </Show>
    </span>
  );
}

// A pill button with a text label (Edit figure, Markdown, ...).
function TextButton(p: {
  onClick: (e: MouseEvent) => void;
  title?: string;
  danger?: boolean;
  tour?: string;
  children: JSX.Element;
}) {
  return (
    <button
      type="button"
      class="ui-focusable ui-hoverable-base-300 flex h-7 items-center gap-1 rounded px-2 text-sm"
      classList={{ "text-danger": p.danger }}
      title={p.title}
      data-tour={p.tour}
      onClick={(e) => p.onClick(e)}
    >
      {p.children}
    </button>
  );
}

export function SlideToolbar(p: Props) {
  const slideRec = () => p.tempSlide as unknown as Record<string, unknown>;

  const selectedBlock = (): ContentBlock | undefined => {
    if (p.tempSlide.type !== "content" || !p.selectedBlockId) return undefined;
    const hit = findById((p.tempSlide as ContentSlide).layout, p.selectedBlockId);
    return hit?.node.type === "item" ? hit.node.data : undefined;
  };

  // The title whose size/weight the pill shows: the one being typed into,
  // else the selected one.
  const activeTitle = () => {
    const e = p.editing;
    const id = e?.kind === "title" ? e.primitiveId : e ? undefined : p.selectedTextTarget;
    return id ? slideTextField(id) : undefined;
  };

  const logoRows = (field: string, showByDefault: boolean) => {
    const cur = () => (slideRec()[field] as LogoVisibility | undefined) ?? "inherit";
    const opts = [
      {
        value: "inherit",
        label: showByDefault
          ? t3({ en: "Default (show)", fr: "Défaut (afficher)", pt: "Predefinição (mostrar)" })
          : t3({ en: "Default (hide)", fr: "Défaut (masquer)", pt: "Predefinição (ocultar)" }),
      },
      { value: "show", label: t3({ en: "Show", fr: "Afficher", pt: "Mostrar" }) },
      { value: "hide", label: t3({ en: "Hide", fr: "Masquer", pt: "Ocultar" }) },
    ];
    return (
      <For each={opts}>
        {(o) => (
          <PopoverRow
            active={cur() === o.value}
            onClick={() =>
              p.setTempSlide(field, o.value === "inherit" ? undefined : o.value)
            }
          >
            {o.label}
          </PopoverRow>
        )}
      </For>
    );
  };

  const split = () =>
    p.tempSlide.type === "content" ? (p.tempSlide as ContentSlide).split : undefined;

  const imageAssets = () =>
    instanceState.assets.filter((f) => f.isImage).map((f) => f.fileName);

  // While typing on the canvas, a click in the toolbar must not take focus
  // from the (hidden) text editor.
  const keepFocus = (e: MouseEvent) => {
    if (p.editing && (e.target as Element).closest("button")) e.preventDefault();
  };

  return (
    <div
      data-cursor-zone="header"
      data-tour="slide-format-toolbar"
      {...{ [INLINE_EDIT_KEEP_ATTR]: "" }}
      onMouseDown={keepFocus}
    >
      {/* ── Menu row ─────────────────────────────────────────────────── */}
      <div class="flex flex-wrap items-center gap-1 px-2 pt-0.5">
        <ToolbarPopover
          menu
          tour="slide-type-select"
          label={t3({ en: "Slide", fr: "Diapositive", pt: "Diapositivo" })}
          title={t3({ en: "Slide", fr: "Diapositive", pt: "Diapositivo" })}
        >
          {(close) => (
            <div class="w-56">
              <Caption>{t3({ en: "Slide type", fr: "Type de diapositive", pt: "Tipo de diapositivo" })}</Caption>
              <For
                each={[
                  { value: "cover" as const, label: t3({ en: "Cover", fr: "Couverture", pt: "Capa" }) },
                  { value: "section" as const, label: t3({ en: "Section", fr: "Section", pt: "Secção" }) },
                  { value: "content" as const, label: t3({ en: "Content", fr: "Contenu", pt: "Conteúdo" }) },
                ]}
              >
                {(o) => (
                  <PopoverRow
                    active={p.tempSlide.type === o.value}
                    onClick={() => {
                      p.onTypeChange(o.value);
                      close();
                    }}
                  >
                    {o.label}
                  </PopoverRow>
                )}
              </For>
              <Switch>
                <Match when={p.tempSlide.type === "cover"}>
                  <MenuDivider />
                  <Caption>{t3({ en: "Cover logos", fr: "Logos de couverture", pt: "Logótipos da capa" })}</Caption>
                  {logoRows("showLogos", p.showCoverLogosByDefault)}
                </Match>
                <Match when={p.tempSlide.type === "content"}>
                  <MenuDivider />
                  <Caption>{t3({ en: "Header logos", fr: "Logos d'en-tête", pt: "Logótipos do cabeçalho" })}</Caption>
                  {logoRows("showHeaderLogos", p.showHeaderLogosByDefault)}
                  <MenuDivider />
                  <Caption>{t3({ en: "Footer logos", fr: "Logos de pied de page", pt: "Logótipos do rodapé" })}</Caption>
                  {logoRows("showFooterLogos", p.showFooterLogosByDefault)}
                </Match>
              </Switch>
            </div>
          )}
        </ToolbarPopover>

        <ToolbarPopover
          menu
          tour="slide-text-fields"
          label={t3({ en: "Insert", fr: "Insérer", pt: "Inserir" })}
          title={t3({ en: "Insert", fr: "Insérer", pt: "Inserir" })}
        >
          {(close) => (
            <div class="w-56">
              <Caption>
                {t3({
                  en: "Click text on the slide to edit it",
                  fr: "Cliquez sur un texte de la diapositive pour le modifier",
                  pt: "Clique num texto do diapositivo para o editar",
                })}
              </Caption>
              <For each={SLIDE_TEXT_FIELDS.filter((f) => f.slideType === p.tempSlide.type)}>
                {(f) => {
                  const present = () => !!(slideRec()[f.field] as string | undefined)?.trim();
                  const deckFooter = () => f.primitiveId === "footerText" && p.hasGlobalFooterText;
                  return (
                    <Show
                      when={!deckFooter()}
                      fallback={
                        <Caption>
                          {t3({
                            en: "Footer text is set for the whole deck",
                            fr: "Le pied de page est défini pour toute la présentation",
                            pt: "O rodapé é definido para toda a apresentação",
                          })}
                        </Caption>
                      }
                    >
                      <PopoverRow
                        active={false}
                        onClick={() => {
                          close();
                          if (present()) {
                            p.onEditText({ kind: "title", field: f.field, primitiveId: f.primitiveId });
                          } else {
                            p.onAddField(f.primitiveId);
                          }
                        }}
                      >
                        <Check on={present()} />
                        <span class="flex-1">{f.label()}</span>
                        <Show when={!present()}>
                          <span class="text-base-content-muted text-xs">
                            {t3({ en: "Add", fr: "Ajouter", pt: "Adicionar" })}
                          </span>
                        </Show>
                      </PopoverRow>
                    </Show>
                  );
                }}
              </For>
            </div>
          )}
        </ToolbarPopover>

        <Show when={p.tempSlide.type === "content"}>
          <ToolbarPopover
            menu
            tour="slide-split-menu"
            label={t3({ en: "Split panel", fr: "Panneau divisé", pt: "Painel dividido" })}
            title={t3({ en: "Split panel", fr: "Panneau divisé", pt: "Painel dividido" })}
          >
            {() => (
              <div class="w-60">
                <PopoverRow active={!split()} onClick={() => p.setTempSlide("split", undefined)}>
                  {t3({ en: "None", fr: "Aucun", pt: "Nenhum" })}
                </PopoverRow>
                <For each={["left", "right"] as const}>
                  {(side) => (
                    <PopoverRow
                      active={split()?.placement === side}
                      onClick={() =>
                        split()
                          ? p.setTempSlide("split", "placement", side)
                          : p.setTempSlide("split", {
                            placement: side,
                            sizeAsPct: 15,
                            fill: { type: "plain" },
                          } satisfies ContentSlideSplit)}
                    >
                      {side === "left"
                        ? t3({ en: "Left", fr: "Gauche", pt: "Esquerda" })
                        : t3({ en: "Right", fr: "Droite", pt: "Direita" })}
                    </PopoverRow>
                  )}
                </For>
                <Show when={split()}>
                  {(sp) => (
                    <>
                      <MenuDivider />
                      <Caption>{t3({ en: "Size", fr: "Taille", pt: "Tamanho" })}</Caption>
                      <div class="grid grid-cols-5 gap-0.5 px-1">
                        <For each={[5, 10, 15, 20, 25, 30, 35, 40, 45, 50]}>
                          {(pct) => (
                            <PopoverRow
                              active={sp().sizeAsPct === pct}
                              onClick={() => p.setTempSlide("split", "sizeAsPct", pct)}
                            >
                              {pct}%
                            </PopoverRow>
                          )}
                        </For>
                      </div>
                      <MenuDivider />
                      <Caption>{t3({ en: "Fill", fr: "Remplissage", pt: "Preenchimento" })}</Caption>
                      <PopoverRow
                        active={sp().fill.type === "plain"}
                        onClick={() => p.setTempSlide("split", "fill", { type: "plain" })}
                      >
                        {t3({ en: "Plain", fr: "Uni", pt: "Liso" })}
                      </PopoverRow>
                      <PopoverRow
                        active={sp().fill.type === "pattern"}
                        onClick={() =>
                          sp().fill.type !== "pattern" &&
                          p.setTempSlide("split", "fill", { type: "pattern", patternType: "ovals" })}
                      >
                        {t3({ en: "Pattern", fr: "Motif", pt: "Padrão" })}
                      </PopoverRow>
                      <PopoverRow
                        active={sp().fill.type === "image"}
                        onClick={() =>
                          sp().fill.type !== "image" &&
                          p.setTempSlide("split", "fill", { type: "image", imgFile: "" })}
                      >
                        {t3({ en: "Image", fr: "Image", pt: "Imagem" })}
                      </PopoverRow>
                      <Show when={sp().fill.type === "pattern"}>
                        <div class="grid grid-cols-2 gap-0.5 px-1 pt-1">
                          <For each={PATTERNS}>
                            {(pat) => (
                              <PopoverRow
                                active={(sp().fill as { patternType?: PatternType }).patternType === pat.value}
                                onClick={() =>
                                  p.setTempSlide("split", "fill", { type: "pattern", patternType: pat.value })}
                              >
                                {pat.label()}
                              </PopoverRow>
                            )}
                          </For>
                        </div>
                      </Show>
                      <Show when={sp().fill.type === "image"}>
                        <div class="max-h-48 overflow-auto px-1 pt-1">
                          <For
                            each={imageAssets()}
                            fallback={
                              <Caption>
                                {t3({ en: "No images uploaded", fr: "Aucune image téléversée", pt: "Nenhuma imagem carregada" })}
                              </Caption>
                            }
                          >
                            {(file) => (
                              <PopoverRow
                                active={(sp().fill as { imgFile?: string }).imgFile === file}
                                onClick={() => p.setTempSlide("split", "fill", { type: "image", imgFile: file })}
                              >
                                <span class="truncate">{file}</span>
                              </PopoverRow>
                            )}
                          </For>
                        </div>
                      </Show>
                    </>
                  )}
                </Show>
              </div>
            )}
          </ToolbarPopover>
        </Show>
      </div>

      {/* ── The pill: follows the selection ────────────────────────────── */}
      <div class="px-2 pt-1 pb-2">
        <div class="bg-base-200 flex min-h-9 flex-wrap items-center gap-0.5 rounded-full px-3 py-1">
          <Show when={p.canUndoRedo}>
            <ToolButton label={t3({ en: "Undo", fr: "Annuler", pt: "Anular" })} onClick={p.onUndo}>
              <Icon iconName="undo" class="h-4 w-4" />
            </ToolButton>
            <ToolButton label={t3({ en: "Redo", fr: "Rétablir", pt: "Refazer" })} onClick={p.onRedo}>
              <Icon iconName="redo" class="h-4 w-4" />
            </ToolButton>
            <ToolbarDivider />
          </Show>

          <Switch
            fallback={
              <span class="text-base-content-muted px-1 text-sm">
                {t3({
                  en: "Double-click text on the slide to type, or click a block for its options",
                  fr: "Double-cliquez sur un texte pour écrire, ou cliquez sur un bloc pour ses options",
                  pt: "Faça duplo clique num texto para escrever, ou clique num bloco para as suas opções",
                })}
              </span>
            }
          >
            {/* Typing in a text block: character and paragraph formatting. */}
            <Match when={p.editing?.kind === "block" && p.inlineApi?.isMarkdown ? p.inlineApi : undefined}>
              {(api) => (
                <>
                  <ToolButton
                    label={t3({ en: "Bold (Ctrl+B)", fr: "Gras (Ctrl+B)", pt: "Negrito (Ctrl+B)" })}
                    active={() => api().marks().bold}
                    onClick={() => api().toggleStyle("bold")}
                  >
                    <span class="font-700">B</span>
                  </ToolButton>
                  <ToolButton
                    label={t3({ en: "Italic (Ctrl+I)", fr: "Italique (Ctrl+I)", pt: "Itálico (Ctrl+I)" })}
                    active={() => api().marks().italic}
                    onClick={() => api().toggleStyle("italic")}
                  >
                    <span class="italic">I</span>
                  </ToolButton>
                  <ToolbarDivider />
                  <ToolButton
                    label={t3({ en: "Bulleted list", fr: "Liste à puces", pt: "Lista com marcadores" })}
                    active={() => api().marks().list === "bullet"}
                    onClick={() => api().toggleList(false)}
                  >
                    •
                  </ToolButton>
                  <ToolButton
                    label={t3({ en: "Numbered list", fr: "Liste numérotée", pt: "Lista numerada" })}
                    active={() => api().marks().list === "numbered"}
                    onClick={() => api().toggleList(true)}
                  >
                    <span class="text-xs">1.</span>
                  </ToolButton>
                  <ToolbarDivider />
                  <TextBlockControls {...p} blockId={(p.editing as { id: string }).id} />
                </>
              )}
            </Match>

            {/* A cover/section title, being typed into or selected. */}
            <Match when={activeTitle()?.style ? activeTitle() : undefined}>
              {(f) => {
                const st = () => f().style!;
                const size = () => (slideRec()[st().size] as number | undefined) ?? st().sizeDefault;
                const bold = () => (slideRec()[st().bold] as boolean | undefined) ?? st().boldDefault;
                const italic = () => (slideRec()[st().italic] as boolean | undefined) ?? false;
                const setSize = (n: number) =>
                  p.setTempSlide(st().size, Math.max(st().min, Math.min(st().max, n)));
                return (
                  <>
                    <span class="text-base-content-muted px-1 text-sm">{f().label()}</span>
                    <ToolbarDivider />
                    <ToolButton
                      label={t3({ en: "Smaller", fr: "Plus petit", pt: "Mais pequeno" })}
                      onClick={() => setSize(size() - 1)}
                    >
                      <Icon iconName="minus" class="h-4 w-4" />
                    </ToolButton>
                    <span class="border-base-300 bg-base-100 flex h-6 w-8 items-center justify-center rounded border text-sm">
                      {size()}
                    </span>
                    <ToolButton
                      label={t3({ en: "Larger", fr: "Plus grand", pt: "Maior" })}
                      onClick={() => setSize(size() + 1)}
                    >
                      <Icon iconName="plus" class="h-4 w-4" />
                    </ToolButton>
                    <ToolbarDivider />
                    <ToolButton
                      label={t3({ en: "Bold", fr: "Gras", pt: "Negrito" })}
                      active={bold}
                      onClick={() => p.setTempSlide(st().bold, !bold())}
                    >
                      <span class="font-700">B</span>
                    </ToolButton>
                    <ToolButton
                      label={t3({ en: "Italic", fr: "Italique", pt: "Itálico" })}
                      active={italic}
                      onClick={() => p.setTempSlide(st().italic, !italic())}
                    >
                      <span class="italic">I</span>
                    </ToolButton>
                    <ToolbarDivider />
                    <ToolButton
                      label={t3({ en: "Reset to default", fr: "Réinitialiser", pt: "Repor predefinição" })}
                      onClick={() => {
                        p.setTempSlide(st().size, undefined);
                        p.setTempSlide(st().bold, undefined);
                        p.setTempSlide(st().italic, undefined);
                      }}
                    >
                      <Icon iconName="refresh" class="h-4 w-4" />
                    </ToolButton>
                  </>
                );
              }}
            </Match>

            {/* Header / sub header / date / footer: plain text, no styles. */}
            <Match when={p.editing?.kind === "title" || (!p.editing && p.selectedTextTarget) ? activeTitle() : undefined}>
              {(f) => (
                <span class="text-base-content-muted px-1 text-sm">
                  {f().label()}
                  {" · "}
                  {t3({
                    en: "styled by the deck theme",
                    fr: "mise en forme par le thème",
                    pt: "estilo definido pelo tema",
                  })}
                </span>
              )}
            </Match>

            {/* A selected layout block. */}
            <Match when={p.selectedBlockId && selectedBlock() ? p.selectedBlockId : undefined}>
              {(blockId) => {
                const block = () => selectedBlock();
                return (
                  <>
                    <ToolbarPopover
                      tour="slide-block-type"
                      label={<span>{blockTypeLabel(block()?.type)}</span>}
                      title={t3({ en: "Content type", fr: "Type de contenu", pt: "Tipo de conteúdo" })}
                    >
                      {(close) => (
                        <For each={["text", "figure", "image"] as BlockType[]}>
                          {(bt) => (
                            <PopoverRow
                              active={block()?.type === bt}
                              onClick={() => {
                                p.onBlockTypeChange(blockId(), bt);
                                close();
                              }}
                            >
                              {blockTypeLabel(bt)}
                            </PopoverRow>
                          )}
                        </For>
                      )}
                    </ToolbarPopover>
                    <TextButton
                      tour="slide-layout-button"
                      title={t3({ en: "Split, add, move or delete blocks", fr: "Diviser, ajouter, déplacer ou supprimer des blocs", pt: "Dividir, adicionar, mover ou eliminar blocos" })}
                      onClick={(e) => {
                        const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
                        p.onShowLayoutMenu(r.left, r.bottom);
                      }}
                    >
                      <Icon iconName="layoutGrid" class="h-4 w-4" />
                      {t3({ en: "Layout", fr: "Mise en page", pt: "Disposição" })}
                    </TextButton>
                    <ToolbarDivider />
                    <Switch>
                      <Match when={block()?.type === "text"}>
                        <TextButton
                          onClick={() => p.onEditText({ kind: "block", id: blockId() })}
                        >
                          <Icon iconName="pencil" class="h-4 w-4" />
                          {t3({ en: "Edit text", fr: "Modifier le texte", pt: "Editar texto" })}
                        </TextButton>
                        <TextBlockControls {...p} blockId={blockId()} />
                      </Match>
                      <Match when={block()?.type === "figure"}>
                        <FigureControls
                          {...p}
                          blockId={blockId()}
                          block={block() as FigureBlock}
                        />
                      </Match>
                      <Match when={block()?.type === "image"}>
                        <ImageControls
                          {...p}
                          blockId={blockId()}
                          block={block() as ImageBlock}
                          assets={imageAssets()}
                        />
                      </Match>
                    </Switch>
                  </>
                );
              }}
            </Match>
          </Switch>
        </div>
      </div>
    </div>
  );
}

function TextBlockControls(p: Props & { blockId: string }) {
  const bg = () => {
    if (p.tempSlide.type !== "content") return "none";
    const hit = findById((p.tempSlide as ContentSlide).layout, p.blockId);
    const data = hit?.node.type === "item" ? (hit.node.data as TextBlock) : undefined;
    return data?.style?.textBackground ?? "none";
  };
  return (
    <>
      <ToolbarPopover
        label={
          <span>
            {t3({ en: "Background", fr: "Arrière-plan", pt: "Fundo" })}
          </span>
        }
        title={t3({ en: "Text background", fr: "Arrière-plan du texte", pt: "Fundo do texto" })}
      >
        {(close) => (
          <For each={TEXT_BACKGROUNDS}>
            {(o) => (
              <PopoverRow
                active={bg() === o.value}
                onClick={() => {
                  p.updateBlock(p.blockId, (b) => {
                    const tb = b as TextBlock;
                    return { ...tb, style: { ...tb.style, textBackground: o.value } };
                  });
                  close();
                }}
              >
                {o.label()}
              </PopoverRow>
            )}
          </For>
        )}
      </ToolbarPopover>
      <TextButton
        title={t3({
          en: "Edit this block's markdown source (code blocks, links, anything typing can't reach)",
          fr: "Modifier la source markdown de ce bloc (blocs de code, liens, etc.)",
          pt: "Editar a fonte markdown deste bloco (blocos de código, ligações, etc.)",
        })}
        onClick={() => p.onEditMarkdown(p.blockId)}
      >
        <Icon iconName="code" class="h-4 w-4" />
        {t3({ en: "Markdown", fr: "Markdown", pt: "Markdown" })}
      </TextButton>
    </>
  );
}

function FigureControls(p: Props & { blockId: string; block: FigureBlock }) {
  const hasBundle = () => p.block.bundle !== undefined;
  return (
    <>
      {/* Resolved under another package or scope than the deck now serves
          from (D4): shown, never blocking. */}
      <Show when={p.staleFigureBundle} keyed>
        {(stale) => (
          <StaleFigureBadge
            bundle={stale}
            scope={p.staleContext.scope}
            authoringContext={p.staleContext.authoringContext}
            onUpdated={p.onFigureUpdated}
            canEdit={p.canEdit}
          />
        )}
      </Show>
      <Show when={hasBundle()}>
        <TextButton onClick={() => p.onEditVisualization()}>
          <Icon iconName="pencil" class="h-4 w-4" />
          {t3({ en: "Edit figure", fr: "Modifier la figure", pt: "Editar figura" })}
        </TextButton>
      </Show>
      <TextButton onClick={() => p.onCreateVisualization()}>
        <Icon iconName="chart" class="h-4 w-4" />
        {hasBundle()
          ? t3({ en: "Replace figure", fr: "Remplacer la figure", pt: "Substituir figura" })
          : t3({ en: "Insert figure", fr: "Insérer une figure", pt: "Inserir figura" })}
      </TextButton>
      <Show when={hasBundle()}>
        <TextButton danger onClick={() => p.updateBlock(p.blockId, () => ({ type: "figure" }))}>
          <Icon iconName="trash" class="h-4 w-4" />
          {t3({ en: "Remove figure", fr: "Supprimer la figure", pt: "Remover figura" })}
        </TextButton>
      </Show>
    </>
  );
}

function ImageControls(
  p: Props & { blockId: string; block: ImageBlock; assets: string[] },
) {
  const setStyle = (patch: Partial<NonNullable<ImageBlock["style"]>>) =>
    p.updateBlock(p.blockId, (b) => {
      const ib = b as ImageBlock;
      return { ...ib, style: { ...ib.style, ...patch } };
    });
  const fit = () => p.block.style?.imgFit ?? "contain";
  return (
    <>
      <ToolbarPopover
        label={
          <span class="max-w-40 truncate">
            {p.block.imgFile || t3({ en: "Choose image", fr: "Choisir une image", pt: "Escolher imagem" })}
          </span>
        }
        title={t3({ en: "Image file", fr: "Fichier image", pt: "Ficheiro de imagem" })}
      >
        {(close) => (
          <div class="max-h-64 w-60 overflow-auto">
            <For
              each={p.assets}
              fallback={
                <Caption>
                  {t3({ en: "No images uploaded", fr: "Aucune image téléversée", pt: "Nenhuma imagem carregada" })}
                </Caption>
              }
            >
              {(file) => (
                <PopoverRow
                  active={p.block.imgFile === file}
                  onClick={() => {
                    p.updateBlock(p.blockId, (b) => ({ ...(b as ImageBlock), imgFile: file }));
                    close();
                  }}
                >
                  <span class="truncate">{file}</span>
                </PopoverRow>
              )}
            </For>
          </div>
        )}
      </ToolbarPopover>
      <Show when={p.block.imgFile}>
        <ToolbarPopover
          label={
            <span>
              {fit() === "cover"
                ? t3({ en: "Cover area", fr: "Couvrir", pt: "Cobrir" })
                : t3({ en: "Fit inside", fr: "Ajuster", pt: "Ajustar" })}
            </span>
          }
          title={t3({ en: "Image fit", fr: "Ajustement de l'image", pt: "Ajuste da imagem" })}
        >
          {(close) => (
            <>
              <PopoverRow
                active={fit() === "cover"}
                onClick={() => {
                  setStyle({ imgFit: "cover" });
                  close();
                }}
              >
                {t3({ en: "Cover whole area", fr: "Couvrir toute la zone", pt: "Cobrir toda a área" })}
              </PopoverRow>
              <PopoverRow
                active={fit() === "contain"}
                onClick={() => {
                  setStyle({ imgFit: "contain" });
                  close();
                }}
              >
                {t3({ en: "Fit inside area", fr: "Adapter à l'intérieur de la zone", pt: "Ajustar dentro da área" })}
              </PopoverRow>
            </>
          )}
        </ToolbarPopover>
        <Show when={fit() === "contain"}>
          <ToolbarPopover
            label={
              <span>
                {IMAGE_ALIGNS.find((a) => a.value === (p.block.style?.imgAlign ?? "center"))?.label()}
              </span>
            }
            title={t3({ en: "Alignment", fr: "Alignement", pt: "Alinhamento" })}
          >
            {(close) => (
              <For each={IMAGE_ALIGNS}>
                {(a) => (
                  <PopoverRow
                    active={(p.block.style?.imgAlign ?? "center") === a.value}
                    onClick={() => {
                      setStyle({ imgAlign: a.value });
                      close();
                    }}
                  >
                    {a.label()}
                  </PopoverRow>
                )}
              </For>
            )}
          </ToolbarPopover>
        </Show>
      </Show>
    </>
  );
}
