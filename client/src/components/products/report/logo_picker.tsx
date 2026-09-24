import type Uppy from "@uppy/core";
import { t3 } from "lib";
import {
  type AlertComponentProps,
  Button,
  Card,
  ModalContainer,
  SortableList,
} from "panther";
import {
  createEffect,
  createSignal,
  For,
  onCleanup,
  onMount,
  Show,
} from "solid-js";
import { cleanupUppy, createUppyInstance } from "~/components/_shared/mod.ts";
import {
  FASTR_LOGOS,
  FASTR_LOGO_VALUES,
  resolveLogoUrl,
} from "~/generate_slide_deck/fastr_logos";
import { instanceState } from "~/state/instance/t1_store";

// The logos of a `:::logos` row, left to right: the built-in FASTR logos and
// the instance's image assets (upload one here too). Returns the chosen
// files in order: the same `imgFile` values a report image carries.

type Props = {
  initial: string[];
  editing: boolean;
};

let triggerCounter = 0;

export function ReportLogoPicker(p: AlertComponentProps<Props, string[]>) {
  const [chosen, setChosen] = createSignal<string[]>([...p.initial]);
  const [waitingFor, setWaitingFor] = createSignal<string | null>(null);
  const triggerId = `report-logo-upload-${++triggerCounter}`;

  const imageAssets = () =>
    instanceState.assets.filter((a) => a.isImage).map((a) => a.fileName);

  const isChosen = (file: string) => chosen().includes(file);
  const toggle = (file: string) =>
    setChosen((prev) =>
      prev.includes(file) ? prev.filter((f) => f !== file) : [...prev, file]
    );

  const labelOf = (file: string) => {
    const fastr = FASTR_LOGOS.find((l) => l.value === file);
    return fastr ? t3(fastr.label) : file;
  };

  // An upload lands in the assets over SSE; it joins the row once it has.
  let uppy: Uppy | undefined;
  onMount(() => {
    uppy = createUppyInstance({
      triggerId: `#${triggerId}`,
      allowedFileTypes: ["image/*"],
      onUploadSuccess: (file) => {
        if (!file) return;
        const name = file.name as string;
        if (imageAssets().includes(name)) {
          if (!isChosen(name)) toggle(name);
        } else {
          setWaitingFor(name);
        }
      },
    });
  });
  onCleanup(() => cleanupUppy(uppy));
  createEffect(() => {
    const pending = waitingFor();
    if (pending === null || !imageAssets().includes(pending)) return;
    if (!isChosen(pending)) toggle(pending);
    setWaitingFor(null);
  });

  return (
    <ModalContainer
      width="2xl"
      title={t3({ en: "Logos", fr: "Logos", pt: "Logótipos" })}
      onCancel={() => p.close(undefined)}
      actions={[
        {
          label: p.editing
            ? t3({ en: "Save", fr: "Enregistrer", pt: "Guardar" })
            : t3({ en: "Insert", fr: "Insérer", pt: "Inserir" }),
          onClick: () => p.close(chosen()),
          disabled: chosen().length === 0,
        },
      ]}
    >
      <div class="ui-spy">
        <div class="ui-spy-sm">
          <div class="ui-text-caption">
            {t3({
              en: "In the row, left to right",
              fr: "Dans la rangée, de gauche à droite",
              pt: "Na linha, da esquerda para a direita",
            })}
          </div>
          <Show
            when={chosen().length > 0}
            fallback={
              <div class="text-base-content-muted text-sm">
                {t3({
                  en: "Pick one or more logos below",
                  fr: "Choisissez un ou plusieurs logos ci-dessous",
                  pt: "Escolha um ou mais logótipos abaixo",
                })}
              </div>
            }
          >
            <SortableList
              items={chosen().map((f) => ({ id: f }))}
              onReorder={(ids) => setChosen(ids)}
            >
              {(item) => (
                <div class="flex min-w-0 flex-1 items-center gap-2">
                  <LogoThumb file={item.id} class="h-8 w-20" />
                  <span class="flex-1 truncate text-sm">{labelOf(item.id)}</span>
                  <Button
                    size="sm"
                    outline
                    iconName="x"
                    ariaLabel={t3({ en: "Remove", fr: "Retirer", pt: "Remover" })}
                    onClick={() => toggle(item.id)}
                  />
                </div>
              )}
            </SortableList>
          </Show>
        </div>

        <div class="ui-spy-sm">
          <div class="ui-text-caption">FASTR</div>
          <div class="ui-gap-sm grid grid-cols-[repeat(auto-fill,minmax(10rem,1fr))]">
            <For each={FASTR_LOGOS}>
              {(logo) => (
                <Card
                  pad="sm"
                  selected={isChosen(logo.value)}
                  onClick={() => toggle(logo.value)}
                >
                  <LogoThumb file={logo.value} class="h-12 w-full" />
                  <div class="truncate pt-1 text-xs">{t3(logo.label)}</div>
                </Card>
              )}
            </For>
          </div>
        </div>

        <div class="ui-spy-sm">
          <div class="flex items-center gap-2">
            <div class="ui-text-caption flex-1">
              {t3({ en: "Your images", fr: "Vos images", pt: "As suas imagens" })}
            </div>
            <Button id={triggerId} size="sm" outline iconName="upload">
              {t3({ en: "Upload logo", fr: "Téléverser un logo", pt: "Carregar logótipo" })}
            </Button>
          </div>
          <Show when={waitingFor()}>
            <div class="text-base-content-muted text-sm">
              {t3({
                en: "Processing upload...",
                fr: "Traitement du téléversement...",
                pt: "A processar o carregamento...",
              })}
            </div>
          </Show>
          <div class="ui-gap-sm grid max-h-72 grid-cols-[repeat(auto-fill,minmax(10rem,1fr))] overflow-auto">
            <For
              each={imageAssets()}
              fallback={
                <div class="text-base-content-muted text-sm">
                  {t3({
                    en: "No images uploaded yet",
                    fr: "Aucune image téléversée",
                    pt: "Ainda não há imagens carregadas",
                  })}
                </div>
              }
            >
              {(file) => (
                <Card
                  pad="sm"
                  selected={isChosen(file)}
                  onClick={() => toggle(file)}
                >
                  <LogoThumb file={file} class="h-12 w-full" />
                  <div class="truncate pt-1 text-xs" title={file}>{file}</div>
                </Card>
              )}
            </For>
          </div>
        </div>
      </div>
    </ModalContainer>
  );
}

// A logo on a ground it reads on: the white FASTR logo is invisible on
// white, so it previews on a dark ground (a content colour, like the logo).
function LogoThumb(p: { file: string; class: string }) {
  const dark = () => p.file === FASTR_LOGO_VALUES[1];
  return (
    <div
      class={`flex shrink-0 items-center justify-center rounded ${p.class}`}
      style={dark() ? { "background-color": "#1f2a30" } : undefined}
    >
      <img
        src={resolveLogoUrl(p.file)}
        alt=""
        loading="lazy"
        class="max-h-full max-w-full object-contain p-1"
      />
    </div>
  );
}
