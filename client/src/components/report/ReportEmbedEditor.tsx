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
                  en: "Click a figure or image to edit it.",
                  fr: "Cliquez sur une figure ou une image pour la modifier.",
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
                {t3({ en: "Insert figure", fr: "Insérer une figure" })}
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
        {(embed) => (
          <div class="ui-pad ui-spy">
            <Show when={p.canConfigure}>
              <Switch>
                <Match when={embed().kind === "figure"}>
                  <div class="ui-gap-sm flex flex-col">
                    <Show
                      when={
                        (embed() as { figureBlock: FigureBlock }).figureBlock
                          .figureInputs &&
                        (embed() as { figureBlock: FigureBlock }).figureBlock
                          .source?.type === "from_data"
                      }
                    >
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
                        en: "Create new visualization",
                        fr: "Créer une nouvelle visualisation",
                      })}
                    </Button>
                  </div>
                </Match>
                <Match when={embed().kind === "image"}>
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
                      value={
                        (embed() as { imageBlock: ImageBlock }).imageBlock
                          .imgFile
                      }
                      onChange={(v) => p.onChangeImageFile(embed().id, v)}
                      fullWidth
                    />
                    <Input
                      label={t3({
                        en: "Alt text for screen readers (optional)",
                        fr: "Texte alternatif pour lecteurs d'écran (facultatif)",
                      })}
                      value={captionDraft()}
                      onChange={onCaptionInput}
                      fullWidth
                    />
                  </div>
                </Match>
              </Switch>
              <div class="pt-2">
                <Button intent="danger" outline onClick={() => p.onDelete()}>
                  <Show
                    when={embed().kind === "figure"}
                    fallback={t3({
                      en: "Delete image",
                      fr: "Supprimer l'image",
                    })}
                  >
                    {t3({ en: "Delete figure", fr: "Supprimer la figure" })}
                  </Show>
                </Button>
              </div>
            </Show>
          </div>
        )}
      </Show>
    </div>
  );
}
