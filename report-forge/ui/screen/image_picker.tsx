import { createSignal, For, Show } from "solid-js";
import { t3 } from "../../engine/i18n.ts";
import {
  Button,
  FormError,
  Input,
  Modal,
  type ModalProps,
} from "../kit/mod.ts";
import type { ReportForgeImageHost } from "./types.ts";

// Asks the user for an image the host stores: its own upload flow, or a file
// from their machine handed to `upload`. Resolves with the stored image's
// reference, or undefined when they back out or the host has no upload.
export async function requestImageUpload(
  host: ReportForgeImageHost,
): Promise<string | undefined> {
  if (host.requestUpload) return await host.requestUpload();
  const upload = host.upload;
  if (!upload) return undefined;
  const file = await new Promise<File | undefined>((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.onchange = () => resolve(input.files?.[0]);
    // A dismissed file dialog fires `cancel` where the browser has it; where
    // it does not, the promise simply never settles and nothing is held.
    input.oncancel = () => resolve(undefined);
    input.click();
  });
  return file ? await upload(file) : undefined;
}

export type PickedImage = { imgFile: string; alt: string };

// The default insert-image dialog: choose an image the host already has, or
// upload one, and describe it. A host may replace it whole
// (ReportForgeImageHost.pick).
export function ImagePicker(
  p: ModalProps<{ host: ReportForgeImageHost }, PickedImage>,
) {
  const [imgFile, setImgFile] = createSignal("");
  const [alt, setAlt] = createSignal("");
  const [busy, setBusy] = createSignal(false);
  const [err, setErr] = createSignal<string>();
  const canUpload = () =>
    p.host.requestUpload !== undefined || p.host.upload !== undefined;

  async function upload() {
    setErr(undefined);
    setBusy(true);
    try {
      const stored = await requestImageUpload(p.host);
      if (stored !== undefined) setImgFile(stored);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      width="md"
      title={t3({
        en: "Insert image",
        fr: "Insérer une image",
        pt: "Inserir imagem",
      })}
      onCancel={() => p.close(undefined)}
      actions={[
        {
          label: t3({ en: "Insert", fr: "Insérer", pt: "Inserir" }),
          onClick: () => p.close({ imgFile: imgFile(), alt: alt().trim() }),
          disabled: !imgFile(),
        },
      ]}
    >
      <div class="rf:ui-spy">
        <div class="rf:flex rf:items-center rf:gap-3">
          <Show when={canUpload()}>
            <Button
              outline
              iconName="upload"
              loading={busy()}
              onClick={() => void upload()}
            >
              {t3({
                en: "Upload image",
                fr: "Téléverser une image",
                pt: "Carregar imagem",
              })}
            </Button>
          </Show>
          <Show when={imgFile()}>
            <img
              class="rf:h-12 rf:max-w-40 rf:rounded rf:border rf:object-contain"
              src={p.host.assetUrl(imgFile())}
              alt=""
            />
          </Show>
        </div>
        <Show when={p.host.library}>
          {(library) => (
            <div class="rf:ui-spy-sm">
              <div class="rf:ui-text-caption">
                {t3({
                  en: "Your images",
                  fr: "Vos images",
                  pt: "As suas imagens",
                })}
              </div>
              <div class="rf:ui-gap-sm rf:grid rf:max-h-72 rf:grid-cols-[repeat(auto-fill,minmax(8rem,1fr))] rf:overflow-auto">
                <For
                  each={library()()}
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
                  {(file) => (
                    <button
                      type="button"
                      class="rf:ui-focusable rf:rounded rf:border rf:p-1 rf:text-left"
                      classList={{
                        "rf:border-primary rf:bg-primary-subtle":
                          imgFile() === file,
                        "rf:ui-hoverable-base-100": imgFile() !== file,
                      }}
                      onClick={() => setImgFile(file)}
                    >
                      <img
                        class="rf:h-16 rf:w-full rf:object-contain"
                        src={p.host.assetUrl(file)}
                        alt=""
                        loading="lazy"
                      />
                      <div class="rf:truncate rf:pt-1 rf:text-xs" title={file}>
                        {file}
                      </div>
                    </button>
                  )}
                </For>
              </div>
            </div>
          )}
        </Show>
        <Input
          label={t3({
            en: "Alt text (optional)",
            fr: "Texte alternatif (optionnel)",
            pt: "Texto alternativo (opcional)",
          })}
          value={alt()}
          onChange={setAlt}
          fullWidth
        />
        <FormError error={err()} />
      </div>
    </Modal>
  );
}
