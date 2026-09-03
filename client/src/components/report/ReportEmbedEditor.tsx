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
          {t3({ en: "Insert image", fr: "Insérer une image", pt: "Inserir imagem" })}
        </Button>
      </div>
    </Show>
  );
}

type ControlsProps = {
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
                      <Button size="sm" outline onClick={() => p.onSwitchFigure()}>
                        {t3({
                          en: "Switch",
                          fr: "Changer",
                          pt: "Mudar",
                        })}
                      </Button>
                      <Button size="sm" outline onClick={() => p.onCreateFigure()}>
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
              <Button size="sm" intent="danger" outline onClick={() => p.onDelete()}>
                {t3({ en: "Delete", fr: "Supprimer", pt: "Eliminar" })}
              </Button>
            </div>
          );
        }}
      </Show>
    </Show>
  );
}
