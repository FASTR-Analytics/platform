import {
  createEffect,
  createSignal,
  For,
  type JSX,
  on,
  onCleanup,
  Show,
} from "solid-js";
import type { FastrFigureWidth } from "../../engine/fastr_markdown_blocks.ts";
import { t3 } from "../../engine/i18n.ts";
import { Icon, Input } from "../kit/mod.ts";
import {
  PopoverRow,
  ToolbarDivider,
  ToolbarPopover,
} from "../toolbar_primitives.tsx";
import { requestImageUpload } from "./image_picker.tsx";
import type { ReportForgeImageHost } from "./types.ts";

// The currently-selected embed. `width` is the figure's `{width=…}`, and is
// undefined where a width means nothing: an embed inline in a paragraph
// rather than on its own line (which is not a figure). `imgFile` is an
// image's stored reference.
export type SelectedEmbed = {
  kind: "figure" | "image";
  id: string;
  caption: string;
  width?: FastrFigureWidth;
  imgFile?: string;
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

type ControlsProps = {
  embed: SelectedEmbed | undefined;
  canConfigure: boolean;
  // Where images live; absent, an image's file cannot be changed here.
  imageHost: ReportForgeImageHost | undefined;
  // The host's own buttons for a selected figure (Edit, Replace).
  figureControls?: (id: string) => JSX.Element;
  onUpdateCaption: (id: string, caption: string) => void;
  // The figure's `{width=…}`.
  onSetWidth?: (width: FastrFigureWidth) => void;
  onChangeImageFile: (id: string, imgFile: string) => void;
  onDelete: () => void;
};

// A labelled flat button in the toolbar pill. Exported so a host's figure
// buttons (ReportForgeFigureHost.controls) match the editor's own.
export function ToolbarPillButton(p: {
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
      class="rf:ui-focusable rf:ui-hoverable-base-300 rf:flex rf:h-7 rf:items-center rf:gap-1 rf:rounded rf:px-2 rf:text-sm"
      classList={{ "rf:text-danger": p.danger }}
      title={p.title}
      onClick={() => p.onClick()}
    >
      {p.children}
    </button>
  );
}

// The selected embed's controls AS the toolbar's pill, replacing the text
// controls the way selecting an image does in Google Docs (and as the slide
// toolbar's image and figure controls look): flat buttons, the image file
// and the alt text as dropdowns, Delete last.
export function EmbedToolbarControls(p: ControlsProps) {
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

  const imageAssets = () => p.imageHost?.library?.() ?? [];
  const canUpload = () =>
    p.imageHost?.requestUpload !== undefined ||
    p.imageHost?.upload !== undefined;
  const setFile = (file: string) => {
    const e = p.embed;
    if (e?.kind === "image") p.onChangeImageFile(e.id, file);
  };
  async function upload() {
    const host = p.imageHost;
    if (!host) return;
    setUploading(true);
    try {
      const stored = await requestImageUpload(host);
      if (stored !== undefined) setFile(stored);
    } catch (e) {
      console.warn("Image upload failed", e);
    } finally {
      setUploading(false);
    }
  }

  return (
    <Show when={p.canConfigure && p.embed !== undefined}>
      <Show when={p.embed}>
        {(embed) => {
          const imgFile = () => embed().imgFile ?? "";
          return (
            <div class="rf:flex rf:items-center rf:gap-0.5">
              <Show when={embed().kind === "figure"}>
                {p.figureControls?.(embed().id)}
              </Show>
              <Show when={embed().kind === "image"}>
                <ToolbarPopover
                  label={
                    <span class="rf:flex rf:items-center rf:gap-1">
                      <Icon name="photo" class="rf:h-4 rf:w-4" />
                      <span class="rf:max-w-48 rf:truncate">
                        {uploading()
                          ? t3({
                            en: "Uploading…",
                            fr: "Téléversement…",
                            pt: "A carregar…",
                          })
                          : imgFile()}
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
                    <div class="rf:max-h-64 rf:w-64 rf:overflow-auto">
                      <For
                        each={imageAssets()}
                        fallback={
                          <div class="rf:text-base-content-muted rf:px-2 rf:py-1 rf:text-xs">
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
                            active={imgFile() === file}
                            onClick={() => {
                              setFile(file);
                              close();
                            }}
                          >
                            <span class="rf:truncate">{file}</span>
                          </PopoverRow>
                        )}
                      </For>
                    </div>
                  )}
                </ToolbarPopover>
                <Show when={canUpload()}>
                  <ToolbarPillButton
                    onClick={() => void upload()}
                    title={t3({
                      en: "Upload a new image",
                      fr: "Téléverser une nouvelle image",
                      pt: "Carregar uma nova imagem",
                    })}
                  >
                    <Icon name="upload" class="rf:h-4 rf:w-4" />
                    {t3({
                      en: "Upload",
                      fr: "Téléverser",
                      pt: "Carregar",
                    })}
                  </ToolbarPillButton>
                </Show>
                <ToolbarDivider />
                <ToolbarPopover
                  label={
                    <span class="rf:flex rf:items-center rf:gap-1">
                      {t3({
                        en: "Alt text",
                        fr: "Texte alternatif",
                        pt: "Texto alternativo",
                      })}
                      <Show when={captionDraft().trim().length > 0}>
                        <Icon name="check" class="rf:h-3.5 rf:w-3.5" />
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
                    <div class="rf:w-72">
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
              </Show>
              <Show when={p.onSetWidth && embed().width}>
                {(width) => (
                  <>
                    <ToolbarDivider />
                    <ToolbarPopover
                      label={
                        <span class="rf:flex rf:items-center rf:gap-1">
                          {t3({ en: "Size", fr: "Taille", pt: "Tamanho" })}
                          <span class="rf:text-base-content-muted">
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
                        <div class="rf:w-48">
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
              <ToolbarPillButton danger onClick={() => p.onDelete()}>
                <Icon name="trash" class="rf:h-4 rf:w-4" />
                {t3({ en: "Delete", fr: "Supprimer", pt: "Eliminar" })}
              </ToolbarPillButton>
            </div>
          );
        }}
      </Show>
    </Show>
  );
}
