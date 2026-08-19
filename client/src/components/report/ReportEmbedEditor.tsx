import type {
  FigureBlock,
  FigureBundle,
  ImageBlock,
  PackageScope,
  RunAuthoringContext,
} from "lib";
import { t3 } from "lib";
import { StaleFigureBadge } from "~/components/figure_editor/stale_figure_badge";
import { Button, Input } from "panther";
import {
  createEffect,
  createSignal,
  Match,
  on,
  onCleanup,
  Show,
  Switch,
} from "solid-js";
import { FileUploadSelector } from "~/components/_file_upload_selector";
import { MarkdownGuide } from "~/components/_markdown_guide";

// The currently-selected report embed.
export type SelectedReportEmbed =
  | { kind: "figure"; id: string; caption: string; figureBlock: FigureBlock }
  | { kind: "image"; id: string; caption: string; imageBlock: ImageBlock };

type Props = {
  embed: SelectedReportEmbed | undefined;
  canConfigure: boolean;
  /** The product's pair, live from T1 — what staleness is measured against. */
  scope: PackageScope;
  authoringContext: RunAuthoringContext | undefined;
  /** Set ⇔ the SELECTED figure was resolved under a different pair (D4). */
  staleFigureBundle: FigureBundle | undefined;
  /** Commit a re-resolved bundle back into the report's figure registry. */
  onFigureUpdated: (bundle: FigureBundle) => void;
  onUpdateCaption: (id: string, caption: string) => void;
  // figure
  onEditFigure: () => void;
  onSwitchFigure: () => void;
  onCreateFigure: () => void;
  // image
  onChangeImageFile: (id: string, imgFile: string) => void;
  onDelete: () => void;
  // nothing selected → offer inserts here (insert and edit are mutually exclusive)
  onInsertFigure: () => void;
  onInsertImage: () => void;
};

// Ever-present left panel for editing the selected embed — same UX as the slide
// editor's block panel: figure controls for a figure, image-file controls for an
// image, caption + delete for both.
export function ReportEmbedEditor(p: Props) {
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
    <div class="flex h-full w-full flex-col overflow-auto">
      <Show
        when={p.embed}
        fallback={
          <Show
            when={p.canConfigure}
            fallback={
              <div class="ui-pad text-base-content-muted text-sm">
                {t3({
                  en: "Click a figure or image to edit it.",
                  fr: "Cliquez sur une figure ou une image pour la modifier.",
                  pt: "Clique numa figura ou imagem para a editar.",
                })}
              </div>
            }
          >
            <div
              class="ui-pad ui-spy-sm flex flex-col"
            >
              <Button
                data-tour="report-insert-buttons"
                outline
                iconName="chart"
                fullWidth
                onClick={() => p.onInsertFigure()}
              >
                {t3({
                  en: "Insert figure",
                  fr: "Insérer une figure",
                  pt: "Inserir figura",
                })}
              </Button>
              <Button
                outline
                iconName="photo"
                fullWidth
                onClick={() => p.onInsertImage()}
              >
                {t3({ en: "Insert image", fr: "Insérer une image", pt: "Inserir imagem" })}
              </Button>
            </div>
          </Show>
        }
      >
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
            <div class="ui-pad ui-spy">
              <Show when={p.canConfigure}>
                <Switch>
                  <Match when={figureBlock()}>
                    {(fb) => (
                      <div class="ui-gap-sm flex flex-col">
                        {/* D4: this figure came from a different package or
                            scope than the product now serves from. Shown here,
                            beside the embed's own controls — never blocking. */}
                        <Show
                          when={
                            p.authoringContext && p.staleFigureBundle
                              ? {
                                context: p.authoringContext,
                                bundle: p.staleFigureBundle,
                              }
                              : undefined
                          }
                          keyed
                        >
                          {(keyed) => (
                            <StaleFigureBadge
                              bundle={keyed.bundle}
                              scope={p.scope}
                              authoringContext={keyed.context}
                              onUpdated={p.onFigureUpdated}
                              canEdit={p.canConfigure}
                            />
                          )}
                        </Show>
                        <Show when={fb().bundle !== undefined}>
                          <Button onClick={() => p.onEditFigure()}>
                            {t3({
                              en: "Edit figure",
                              fr: "Modifier la figure",
                              pt: "Editar figura",
                            })}
                          </Button>
                        </Show>
                        <Button onClick={() => p.onSwitchFigure()}>
                          {t3({
                            en: "Switch figure",
                            fr: "Changer de figure",
                            pt: "Mudar de figura",
                          })}
                        </Button>
                        <Button onClick={() => p.onCreateFigure()}>
                          {t3({
                            en: "New figure",
                            fr: "Nouvelle figure",
                            pt: "Nova figura",
                          })}
                        </Button>
                      </div>
                    )}
                  </Match>
                  <Match when={imageBlock()}>
                    {(ib) => (
                      <div class="ui-spy">
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
                          fullWidth
                        />
                        <Input
                          label={t3({
                            en: "Alt text for screen readers (optional)",
                            fr: "Texte alternatif pour lecteurs d'écran (facultatif)",
                            pt: "Texto alternativo para leitores de ecrã (opcional)",
                          })}
                          value={captionDraft()}
                          onChange={onCaptionInput}
                          fullWidth
                        />
                      </div>
                    )}
                  </Match>
                </Switch>
                <div class="pt-2">
                  <Button intent="danger" outline onClick={() => p.onDelete()}>
                    {embed().kind === "figure"
                      ? t3({
                          en: "Delete figure",
                          fr: "Supprimer la figure",
                          pt: "Eliminar figura",
                        })
                      : t3({ en: "Delete image", fr: "Supprimer l'image", pt: "Eliminar imagem" })}
                  </Button>
                </div>
              </Show>
            </div>
          );
        }}
      </Show>
      <Show when={p.canConfigure}>
        <div class="ui-pad mt-auto border-t">
          <MarkdownGuide />
        </div>
      </Show>
    </div>
  );
}
