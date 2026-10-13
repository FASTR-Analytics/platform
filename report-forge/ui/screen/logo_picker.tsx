import { createSignal, For, Show } from "solid-js";
import { t3 } from "../../engine/i18n.ts";
import {
  Button,
  FormError,
  Modal,
  type ModalProps,
  SortableList,
} from "../kit/mod.ts";
import { requestImageUpload } from "./image_picker.tsx";
import type { ReportForgeImageHost } from "./types.ts";

// The logos of a `:::logos` row, left to right: the host's own logos and the
// images it already has (upload one here too). Returns the chosen files in
// order: the same `imgFile` values an image record carries.

type Props = {
  host: ReportForgeImageHost;
  initial: string[];
  editing: boolean;
};

export function LogoPicker(p: ModalProps<Props, string[]>) {
  const [chosen, setChosen] = createSignal<string[]>([...p.initial]);
  const [uploading, setUploading] = createSignal(false);
  const [err, setErr] = createSignal<string>();

  const builtIn = () => p.host.logos ?? [];
  const library = () => p.host.library?.() ?? [];
  const canUpload = () =>
    p.host.requestUpload !== undefined || p.host.upload !== undefined;

  const isChosen = (file: string) => chosen().includes(file);
  const toggle = (file: string) =>
    setChosen((prev) =>
      prev.includes(file) ? prev.filter((f) => f !== file) : [...prev, file]
    );

  const labelOf = (file: string) =>
    builtIn().find((l) => l.value === file)?.label ?? file;
  const onDark = (file: string) =>
    builtIn().find((l) => l.value === file)?.onDark === true;

  // An uploaded image joins the row as soon as the host has stored it.
  async function upload() {
    setErr(undefined);
    setUploading(true);
    try {
      const stored = await requestImageUpload(p.host);
      if (stored !== undefined && !isChosen(stored)) toggle(stored);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setUploading(false);
    }
  }

  // A logo on a ground it reads on: a light logo is invisible on white, so
  // it previews on a dark ground (a content colour, like the logo).
  const LogoThumb = (t: { file: string; class: string }) => (
    <div
      class={`rf:flex rf:shrink-0 rf:items-center rf:justify-center rf:rounded ${t.class}`}
      style={onDark(t.file) ? { "background-color": "#1f2a30" } : undefined}
    >
      <img
        src={p.host.assetUrl(t.file)}
        alt=""
        loading="lazy"
        class="rf:max-h-full rf:max-w-full rf:object-contain rf:p-1"
      />
    </div>
  );

  // A selectable tile (a logo or an image the host has).
  const Tile = (t: { file: string; label: string }) => (
    <button
      type="button"
      class="rf:ui-focusable rf:rounded rf:border rf:p-2 rf:text-left"
      classList={{
        "rf:border-primary rf:bg-primary-subtle": isChosen(t.file),
        "rf:ui-hoverable-base-100": !isChosen(t.file),
      }}
      onClick={() => toggle(t.file)}
    >
      <LogoThumb file={t.file} class="rf:h-12 rf:w-full" />
      <div class="rf:truncate rf:pt-1 rf:text-xs" title={t.label}>
        {t.label}
      </div>
    </button>
  );

  return (
    <Modal
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
      <div class="rf:ui-spy">
        <div class="rf:ui-spy-sm">
          <div class="rf:ui-text-caption">
            {t3({
              en: "In the row, left to right",
              fr: "Dans la rangée, de gauche à droite",
              pt: "Na linha, da esquerda para a direita",
            })}
          </div>
          <Show
            when={chosen().length > 0}
            fallback={
              <div class="rf:text-base-content-muted rf:text-sm">
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
                <div class="rf:flex rf:min-w-0 rf:flex-1 rf:items-center rf:gap-2">
                  <LogoThumb file={item.id} class="rf:h-8 rf:w-20" />
                  <span class="rf:flex-1 rf:truncate rf:text-sm">
                    {labelOf(item.id)}
                  </span>
                  <Button
                    size="sm"
                    outline
                    iconName="x"
                    ariaLabel={t3({
                      en: "Remove",
                      fr: "Retirer",
                      pt: "Remover",
                    })}
                    onClick={() => toggle(item.id)}
                  />
                </div>
              )}
            </SortableList>
          </Show>
        </div>

        <Show when={builtIn().length > 0}>
          <div class="rf:ui-spy-sm">
            <div class="rf:ui-gap-sm rf:grid rf:grid-cols-[repeat(auto-fill,minmax(10rem,1fr))]">
              <For each={builtIn()}>
                {(logo) => <Tile file={logo.value} label={logo.label} />}
              </For>
            </div>
          </div>
        </Show>

        <Show when={canUpload() || p.host.library !== undefined}>
          <div class="rf:ui-spy-sm">
            <div class="rf:flex rf:items-center rf:gap-2">
              <div class="rf:ui-text-caption rf:flex-1">
                {t3({
                  en: "Your images",
                  fr: "Vos images",
                  pt: "As suas imagens",
                })}
              </div>
              <Show when={canUpload()}>
                <Button
                  size="sm"
                  outline
                  iconName="upload"
                  loading={uploading()}
                  onClick={() => void upload()}
                >
                  {t3({
                    en: "Upload logo",
                    fr: "Téléverser un logo",
                    pt: "Carregar logótipo",
                  })}
                </Button>
              </Show>
            </div>
            <FormError error={err()} />
            <div class="rf:ui-gap-sm rf:grid rf:max-h-72 rf:grid-cols-[repeat(auto-fill,minmax(10rem,1fr))] rf:overflow-auto">
              <For
                each={library()}
                fallback={
                  <div class="rf:text-base-content-muted rf:text-sm">
                    {t3({
                      en: "No images uploaded yet",
                      fr: "Aucune image téléversée",
                      pt: "Ainda não há imagens carregadas",
                    })}
                  </div>
                }
              >
                {(file) => <Tile file={file} label={file} />}
              </For>
            </div>
          </div>
        </Show>
      </div>
    </Modal>
  );
}
