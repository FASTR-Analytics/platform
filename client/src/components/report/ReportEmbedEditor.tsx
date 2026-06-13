import type { FigureBlock, ImageBlock } from "lib";
import { t3 } from "lib";
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

// The currently-selected report embed (report-specific — no Dashboard naming).
export type SelectedReportEmbed =
  | { kind: "figure"; id: string; caption: string; figureBlock: FigureBlock }
  | { kind: "image"; id: string; caption: string; imageBlock: ImageBlock };

type Props = {
  embed: SelectedReportEmbed | undefined;
  canConfigure: boolean;
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
              <div class="ui-pad text-base-content/60 text-sm">
                {t3({
                  en: "Click a visualization or image to edit it.",
                  fr: "Cliquez sur une visualisation ou une image pour la modifier.",
                })}
              </div>
            }
          >
            <div class="ui-pad ui-spy-sm flex flex-col">
              <Button
                outline
                iconName="chart"
                fullWidth
                onClick={() => p.onInsertFigure()}
              >
                {t3({
                  en: "Insert visualization",
                  fr: "Insérer une visualisation",
                })}
              </Button>
              <Button
                outline
                iconName="photo"
                fullWidth
                onClick={() => p.onInsertImage()}
              >
                {t3({ en: "Insert image", fr: "Insérer une image" })}
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
                        <Show when={fb().bundle !== undefined}>
                          <Button onClick={() => p.onEditFigure()}>
                            {t3({
                              en: "Edit visualization",
                              fr: "Modifier la visualisation",
                            })}
                          </Button>
                        </Show>
                        <Button onClick={() => p.onSwitchFigure()}>
                          {t3({
                            en: "Switch visualization",
                            fr: "Changer de visualisation",
                          })}
                        </Button>
                        <Button onClick={() => p.onCreateFigure()}>
                          {t3({
                            en: "New visualization",
                            fr: "Nouvelle visualisation",
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
                          })}
                          selectLabel={t3({
                            en: "Image file",
                            fr: "Fichier image",
                          })}
                          filter={(a) => a.isImage}
                          value={ib().imgFile}
                          onChange={(v) => p.onChangeImageFile(embed().id, v)}
                          fullWidth
                        />
                        <Input
                          label={t3({
                            en: "Alt text for screen readers (optional)",
                            fr:
                              "Texte alternatif pour lecteurs d'écran (facultatif)",
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
                        en: "Delete visualization",
                        fr: "Supprimer la visualisation",
                      })
                      : t3({ en: "Delete image", fr: "Supprimer l'image" })}
                  </Button>
                </div>
              </Show>
            </div>
          );
        }}
      </Show>
    </div>
  );
}
