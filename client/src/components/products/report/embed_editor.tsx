import type { FastrFigureWidth, FigureBlock, ImageBlock } from "lib";
import type Uppy from "@uppy/core";
import { t3 } from "lib";
import { Button, Icon, Input } from "panther";
import {
  createEffect,
  createSignal,
  For,
  type JSX,
  Match,
  on,
  onCleanup,
  onMount,
  Show,
  Switch,
} from "solid-js";
import {
  cleanupUppy,
  createUppyInstance,
  FileUploadSelector,
} from "~/components/_shared/mod.ts";
import {
  PopoverRow,
  ToolbarDivider,
  ToolbarPopover,
} from "~/components/products/_shared/mod.ts";
import { instanceState } from "~/state/instance/t1_store";

// The currently-selected report embed. `width` is the FASTR Markdown
// figure's `{width=…}`, and is undefined wherever a width means nothing:
// another format, or an embed inline in a paragraph rather than on its own
// line (which is not a figure).
export type SelectedReportEmbed =
  | {
    kind: "figure";
    id: string;
    caption: string;
    width?: FastrFigureWidth;
    figureBlock: FigureBlock;
  }
  | {
    kind: "image";
    id: string;
    caption: string;
    width?: FastrFigureWidth;
    imageBlock: ImageBlock;
  };

// The sizes the toolbar offers, narrowest first; "normal" (the column) is the
// default. The retired `wide` is not offered, and a figure still carrying it
// reads as the column (it renders as one).
const FIGURE_SIZE_OPTIONS: { value: FastrFigureWidth; label: () => string }[] =
  [
    {
      value: "small",
      label: () => t3({ en: "Small", fr: "Petite", pt: "Pequena" }),
    },
    {
      value: "medium",
      label: () => t3({ en: "Medium", fr: "Moyenne", pt: "Média" }),
    },
    {
      value: "normal",
      label: () =>
        t3({ en: "Full width", fr: "Pleine largeur", pt: "Largura total" }),
    },
    {
      value: "full",
      label: () =>
        t3({ en: "Edge to edge", fr: "Bord à bord", pt: "De ponta a ponta" }),
    },
  ];

function figureSizeLabel(width: FastrFigureWidth): string {
  const shown = width === "wide" ? "normal" : width;
  return FIGURE_SIZE_OPTIONS.find((o) => o.value === shown)?.label() ?? "";
}

// The insert buttons — the toolbar's Insert tab (fastr) or the plain strip
// (markdown/html) render these; the editing controls live separately below.
export function ReportInsertEmbedButtons(p: {
  canConfigure: boolean;
  onInsertFigure: () => void;
  onInsertImage: () => void;
}) {
  return (
    <Show when={p.canConfigure}>
      <div
        class="ui-gap-sm flex items-center"
        data-tour="report-insert-buttons"
      >
        <Button
          size="sm"
          outline
          onBackground="base-100"
          iconName="chart"
          onClick={() => p.onInsertFigure()}
        >
          {t3({
            en: "Insert visualization",
            fr: "Insérer une visualisation",
            pt: "Inserir visualização",
          })}
        </Button>
        <Button
          size="sm"
          outline
          onBackground="base-100"
          iconName="photo"
          onClick={() => p.onInsertImage()}
        >
          {t3({
            en: "Insert image",
            fr: "Insérer une image",
            pt: "Inserir imagem",
          })}
        </Button>
      </div>
    </Show>
  );
}

type ControlsProps = {
  embed: SelectedReportEmbed | undefined;
  canConfigure: boolean;
  onUpdateCaption: (id: string, caption: string) => void;
  // FASTR Markdown only (the toolbar pill): the figure's `{width=…}`.
  onSetWidth?: (width: FastrFigureWidth) => void;
  // figure
  onEditFigure: () => void;
  onSwitchFigure: () => void;
  onCreateFigure: () => void;
  // image
  onChangeImageFile: (id: string, imgFile: string) => void;
  onDelete: () => void;
};

// The selected embed's controls, as a horizontal top-bar segment: figure
// actions for a figure, file + alt text for an image, delete for both.
// Renders nothing when no embed is selected.
export function ReportEmbedControls(p: ControlsProps) {
  const [captionDraft, setCaptionDraft] = createSignal("");
  let debounce: ReturnType<typeof setTimeout> | undefined;

  function clearDebounce() {
    if (debounce) {
      clearTimeout(debounce);
      debounce = undefined;
    }
  }

  // Reseed the draft whenever the selected embed changes; cancel any pending
  // commit so it can't fire against the new embed.
  createEffect(
    on(
      () => p.embed?.id,
      () => {
        clearDebounce();
        setCaptionDraft(p.embed?.caption ?? "");
      },
    ),
  );
  onCleanup(clearDebounce);

  function onCaptionInput(v: string) {
    setCaptionDraft(v);
    const id = p.embed?.id;
    const orig = p.embed?.caption;
    clearDebounce();
    debounce = setTimeout(() => {
      if (id && v.trim() !== orig) p.onUpdateCaption(id, v.trim());
    }, 500);
  }

  return (
    <Show when={p.canConfigure && p.embed !== undefined}>
      <Show when={p.embed}>
        {(embed) => {
          // Narrow the discriminated union once, no per-use casts.
          const figureBlock = () => {
            const e = embed();
            return e.kind === "figure" ? e.figureBlock : undefined;
          };
          const imageBlock = () => {
            const e = embed();
            return e.kind === "image" ? e.imageBlock : undefined;
          };
          return (
            <div class="ui-gap-sm flex flex-wrap items-center">
              <Switch>
                <Match when={figureBlock()}>
                  {(fb) => (
                    <>
                      <Show when={fb().bundle !== undefined}>
                        <Button size="sm" onClick={() => p.onEditFigure()}>
                          {t3({
                            en: "Edit visualization",
                            fr: "Modifier la visualisation",
                            pt: "Editar visualização",
                          })}
                        </Button>
                      </Show>
                      <Button
                        size="sm"
                        outline
                        onClick={() => p.onSwitchFigure()}
                      >
                        {t3({
                          en: "Switch",
                          fr: "Changer",
                          pt: "Mudar",
                        })}
                      </Button>
                      <Button
                        size="sm"
                        outline
                        onClick={() => p.onCreateFigure()}
                      >
                        {t3({
                          en: "New",
                          fr: "Nouvelle",
                          pt: "Nova",
                        })}
                      </Button>
                    </>
                  )}
                </Match>
                <Match when={imageBlock()}>
                  {(ib) => (
                    <>
                      <FileUploadSelector
                        buttonLabel={t3({
                          en: "Upload image",
                          fr: "Téléverser une image",
                          pt: "Carregar imagem",
                        })}
                        selectLabel={t3({
                          en: "Image file",
                          fr: "Fichier image",
                          pt: "Ficheiro de imagem",
                        })}
                        filter={(a) => a.isImage}
                        value={ib().imgFile}
                        onChange={(v) => p.onChangeImageFile(embed().id, v)}
                      />
                      <div class="w-56">
                        <Input
                          placeholder={t3({
                            en: "Alt text for screen readers",
                            fr: "Texte alternatif pour lecteurs d'écran",
                            pt: "Texto alternativo para leitores de ecrã",
                          })}
                          value={captionDraft()}
                          onChange={onCaptionInput}
                          fullWidth
                        />
                      </div>
                    </>
                  )}
                </Match>
              </Switch>
              <Button
                size="sm"
                intent="danger"
                outline
                onClick={() => p.onDelete()}
              >
                {t3({ en: "Delete", fr: "Supprimer", pt: "Eliminar" })}
              </Button>
            </div>
          );
        }}
      </Show>
    </Show>
  );
}

// A labelled flat button in the toolbar pill (the slide toolbar's TextButton).
function PillButton(p: {
  onClick: () => void;
  id?: string;
  title?: string;
  danger?: boolean;
  children: JSX.Element;
}) {
  return (
    <button
      type="button"
      id={p.id}
      class="ui-focusable ui-hoverable-base-300 flex h-7 items-center gap-1 rounded px-2 text-sm"
      classList={{ "text-danger": p.danger }}
      title={p.title}
      onClick={() => p.onClick()}
    >
      {p.children}
    </button>
  );
}

let uploadTriggerCounter = 0;

// Upload a replacement image: it lands in the assets over SSE, then takes
// the image's place (the FileUploadSelector flow, as a pill button).
function ImageUploadButton(p: {
  onUploading: (on: boolean) => void;
  onUploaded: (fileName: string) => void;
}) {
  const id = `report-embed-upload-${++uploadTriggerCounter}`;
  const [waitingFor, setWaitingFor] = createSignal<string | null>(null);
  const imageNames = () =>
    instanceState.assets.filter((a) => a.isImage).map((a) => a.fileName);
  let uppy: Uppy | undefined;
  onMount(() => {
    uppy = createUppyInstance({
      triggerId: `#${id}`,
      allowedFileTypes: ["image/*"],
      onUploadSuccess: (file) => {
        if (!file) return;
        const name = file.name as string;
        if (imageNames().includes(name)) p.onUploaded(name);
        else setWaitingFor(name);
      },
    });
  });
  onCleanup(() => cleanupUppy(uppy));
  createEffect(() => {
    const pending = waitingFor();
    p.onUploading(pending !== null);
    if (pending === null || !imageNames().includes(pending)) return;
    p.onUploaded(pending);
    setWaitingFor(null);
  });
  return (
    <PillButton
      id={id}
      onClick={() => {}}
      title={t3({
        en: "Upload a new image",
        fr: "Téléverser une nouvelle image",
        pt: "Carregar uma nova imagem",
      })}
    >
      <Icon iconName="upload" class="h-4 w-4" />
      {t3({ en: "Upload", fr: "Téléverser", pt: "Carregar" })}
    </PillButton>
  );
}

// The selected embed's controls AS the FASTR toolbar's pill, replacing the
// text controls the way selecting an image does in Google Docs (and as the
// slide toolbar's image and figure controls look): flat buttons, the image
// file and the alt text as dropdowns, Delete last. The markdown/html strip
// keeps ReportEmbedControls.
export function ReportEmbedToolbarControls(p: ControlsProps) {
  const [captionDraft, setCaptionDraft] = createSignal("");
  const [uploading, setUploading] = createSignal(false);
  let debounce: ReturnType<typeof setTimeout> | undefined;
  const clearDebounce = () => {
    if (debounce) clearTimeout(debounce);
    debounce = undefined;
  };
  createEffect(on(() => p.embed?.id, () => {
    clearDebounce();
    setCaptionDraft(p.embed?.caption ?? "");
  }));
  onCleanup(clearDebounce);
  function onCaptionInput(v: string) {
    setCaptionDraft(v);
    const id = p.embed?.id;
    const orig = p.embed?.caption;
    clearDebounce();
    debounce = setTimeout(() => {
      if (id && v.trim() !== orig) p.onUpdateCaption(id, v.trim());
    }, 500);
  }

  const imageAssets = () =>
    instanceState.assets.filter((a) => a.isImage).map((a) => a.fileName);
  const setFile = (file: string) => {
    const e = p.embed;
    if (e?.kind === "image") p.onChangeImageFile(e.id, file);
  };

  return (
    <Show when={p.canConfigure && p.embed !== undefined}>
      <Show when={p.embed}>
        {(embed) => {
          const figureBlock = () => {
            const e = embed();
            return e.kind === "figure" ? e.figureBlock : undefined;
          };
          const imageBlock = () => {
            const e = embed();
            return e.kind === "image" ? e.imageBlock : undefined;
          };
          return (
            <div class="flex items-center gap-0.5">
              <Switch>
                <Match when={figureBlock()}>
                  {(fb) => (
                    <>
                      <Show when={fb().bundle !== undefined}>
                        <PillButton onClick={() => p.onEditFigure()}>
                          <Icon iconName="pencil" class="h-4 w-4" />
                          {t3({
                            en: "Edit visualization",
                            fr: "Modifier la visualisation",
                            pt: "Editar visualização",
                          })}
                        </PillButton>
                      </Show>
                      <PillButton onClick={() => p.onSwitchFigure()}>
                        <Icon iconName="chart" class="h-4 w-4" />
                        {t3({
                          en: "Replace visualization",
                          fr: "Remplacer la visualisation",
                          pt: "Substituir visualização",
                        })}
                      </PillButton>
                    </>
                  )}
                </Match>
                <Match when={imageBlock()}>
                  {(ib) => (
                    <>
                      <ToolbarPopover
                        label={
                          <span class="flex items-center gap-1">
                            <Icon iconName="photo" class="h-4 w-4" />
                            <span class="max-w-48 truncate">
                              {uploading()
                                ? t3({
                                  en: "Uploading…",
                                  fr: "Téléversement…",
                                  pt: "A carregar…",
                                })
                                : ib().imgFile}
                            </span>
                          </span>
                        }
                        title={t3({
                          en: "Image file",
                          fr: "Fichier image",
                          pt: "Ficheiro de imagem",
                        })}
                      >
                        {(close) => (
                          <div class="max-h-64 w-64 overflow-auto">
                            <For
                              each={imageAssets()}
                              fallback={
                                <div class="text-base-content-muted px-2 py-1 text-xs">
                                  {t3({
                                    en: "No images uploaded",
                                    fr: "Aucune image téléversée",
                                    pt: "Nenhuma imagem carregada",
                                  })}
                                </div>
                              }
                            >
                              {(file) => (
                                <PopoverRow
                                  active={ib().imgFile === file}
                                  onClick={() => {
                                    setFile(file);
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
                      <ImageUploadButton
                        onUploading={setUploading}
                        onUploaded={setFile}
                      />
                      <ToolbarDivider />
                      <ToolbarPopover
                        label={
                          <span class="flex items-center gap-1">
                            {t3({
                              en: "Alt text",
                              fr: "Texte alternatif",
                              pt: "Texto alternativo",
                            })}
                            <Show when={captionDraft().trim().length > 0}>
                              <Icon iconName="check" class="h-3.5 w-3.5" />
                            </Show>
                          </span>
                        }
                        title={t3({
                          en: "Alt text for screen readers",
                          fr: "Texte alternatif pour lecteurs d'écran",
                          pt: "Texto alternativo para leitores de ecrã",
                        })}
                      >
                        {() => (
                          <div class="w-72">
                            <Input
                              label={t3({
                                en: "Alt text for screen readers",
                                fr: "Texte alternatif pour lecteurs d'écran",
                                pt: "Texto alternativo para leitores de ecrã",
                              })}
                              value={captionDraft()}
                              onChange={onCaptionInput}
                              fullWidth
                              autoFocus
                            />
                          </div>
                        )}
                      </ToolbarPopover>
                    </>
                  )}
                </Match>
              </Switch>
              <Show when={p.onSetWidth && embed().width}>
                {(width) => (
                  <>
                    <ToolbarDivider />
                    <ToolbarPopover
                      label={
                        <span class="flex items-center gap-1">
                          {t3({ en: "Size", fr: "Taille", pt: "Tamanho" })}
                          <span class="text-base-content-muted">
                            {figureSizeLabel(width())}
                          </span>
                        </span>
                      }
                      title={t3({
                        en: "How wide the figure is on the page",
                        fr: "La largeur de la figure sur la page",
                        pt: "A largura da figura na página",
                      })}
                    >
                      {(close) => (
                        <div class="w-48">
                          <For each={FIGURE_SIZE_OPTIONS}>
                            {(opt) => (
                              <PopoverRow
                                active={(width() === "wide"
                                  ? "normal"
                                  : width()) === opt.value}
                                onClick={() => {
                                  p.onSetWidth?.(opt.value);
                                  close();
                                }}
                              >
                                {opt.label()}
                              </PopoverRow>
                            )}
                          </For>
                        </div>
                      )}
                    </ToolbarPopover>
                  </>
                )}
              </Show>
              <ToolbarDivider />
              <PillButton danger onClick={() => p.onDelete()}>
                <Icon iconName="trash" class="h-4 w-4" />
                {t3({ en: "Delete", fr: "Supprimer", pt: "Eliminar" })}
              </PillButton>
            </div>
          );
        }}
      </Show>
    </Show>
  );
}
