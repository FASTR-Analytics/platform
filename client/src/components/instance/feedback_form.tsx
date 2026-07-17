import { t3, TC } from "lib";
import {
  Button,
  ModalContainer,
  Select,
  StateHolderFormError,
  TextArea,
  type AlertComponentProps,
} from "panther";
import { For, Show, createSignal } from "solid-js";
import { serverActions } from "~/server_actions";

type FeedbackType = "bug" | "suggestion";
type ImageAttachment = { content: string; filename: string; mimeType: string };

export function FeedbackForm(
  p: AlertComponentProps<{ projectLabel?: string }, undefined>,
) {
  const [feedbackType, setFeedbackType] = createSignal<
    FeedbackType | undefined
  >(undefined);
  const [description, setDescription] = createSignal("");
  const [err, setErr] = createSignal("");
  const [sent, setSent] = createSignal(false);
  const [sending, setSending] = createSignal(false);
  const [images, setImages] = createSignal<ImageAttachment[]>([]);
  let fileInputRef: HTMLInputElement | undefined;

  async function handleFileSelect(e: Event) {
    const input = e.target as HTMLInputElement;
    const files = Array.from(input.files ?? []);
    const results: ImageAttachment[] = [];
    for (const file of files) {
      const base64 = await new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onload = () => {
          const dataUrl = reader.result as string;
          resolve(dataUrl.split(",")[1]);
        };
        reader.readAsDataURL(file);
      });
      results.push({ content: base64, filename: file.name, mimeType: file.type });
    }
    setImages((prev) => [...prev, ...results]);
    input.value = "";
  }

  async function handleSend() {
    if (!feedbackType()) {
      setErr(
        t3({
          en: "Please select a feedback type",
          fr: "Veuillez sélectionner un type de retour",
          pt: "Selecione um tipo de comentário",
        }),
      );
      return;
    }
    if (!description().trim()) {
      setErr(
        t3({
          en: "Please enter a description",
          fr: "Veuillez entrer une description",
          pt: "Introduza uma descrição",
        }),
      );
      return;
    }
    setErr("");
    setSending(true);
    const res = await serverActions.sendHelpEmail({
      feedbackType: feedbackType()!,
      description: description(),
      projectLabel: p.projectLabel,
      images: images().length > 0 ? images() : undefined,
    });
    setSending(false);
    if (!res.success) {
      setErr(res.err);
      return;
    }
    setSent(true);
  }

  return (
    <ModalContainer
      title={t3({ en: "Feedback", fr: "Retour", pt: "Comentários" })}
      width="md"
      leftButtons={
        sent()
          ? // eslint-disable-next-line jsx-key
            [
              <Button
                onClick={() => p.close(undefined)}
                intent="success"
                iconName="check"
              >
                {t3(TC.done)}
              </Button>,
            ]
          : // eslint-disable-next-line jsx-key
            [
              <Button
                onClick={handleSend}
                intent="success"
                iconName="arrowRight"
                disabled={sending()}
              >
                {t3({ en: "Send", fr: "Envoyer", pt: "Enviar" })}
              </Button>,
              // eslint-disable-next-line jsx-key
              <Button
                onClick={() => p.close(undefined)}
                intent="neutral"
                iconName="x"
              >
                {t3(TC.cancel)}
              </Button>,
            ]
      }
    >
      <Show when={sent()}>
        <div class="text-success py-4 text-center">
          {t3({
            en: "Thank you for your feedback!",
            fr: "Merci pour votre retour !",
            pt: "Obrigado pelos seus comentários!",
          })}
        </div>
      </Show>
      <Show when={!sent()}>
        <div class="text-base-content pb-2 text-sm">
          {t3({
            en: "Let us know about any bugs or suggestions.",
            fr: "Faites-nous part de vos bugs ou suggestions.",
            pt: "Comunique-nos quaisquer erros ou sugestões.",
          })}
        </div>
        <Select
          label={t3({ en: "Feedback type", fr: "Type de retour", pt: "Tipo de comentário" })}
          value={feedbackType()}
          options={[
            { value: "bug", label: t3({ en: "Bug", fr: "Bug", pt: "Erro" }) },
            {
              value: "suggestion",
              label: t3({ en: "Suggestion", fr: "Suggestion", pt: "Sugestão" }),
            },
          ]}
          onChange={(v: string) => setFeedbackType(v as FeedbackType)}
          placeholder={t3({
            en: "Select a type...",
            fr: "Sélectionner un type...",
            pt: "Selecionar um tipo...",
          })}
          fullWidth
        />
        <TextArea
          label={t3({ en: "Description", fr: "Description", pt: "Descrição" })}
          value={description()}
          onChange={setDescription}
          placeholder={t3({
            en: "Describe the bug or suggestion...",
            fr: "Décrivez le bug ou la suggestion...",
            pt: "Descreva o erro ou a sugestão...",
          })}
          fullWidth
          height="140px"
        />
        <div>
          <div class="text-base-content pb-1 text-sm">
            {t3({ en: "Images (optional)", fr: "Images (optionnel)", pt: "Imagens (opcional)" })}
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            class="hidden"
            onChange={handleFileSelect}
          />
          <div class="ui-gap-sm flex flex-wrap items-center">
            <Button
              onClick={() => fileInputRef?.click()}
              intent="neutral"
              iconName="plus"
              size="sm"
            >
              {t3({ en: "Add image", fr: "Ajouter une image", pt: "Adicionar imagem" })}
            </Button>
            <For each={images()}>
              {(img, i) => (
                <div class="flex items-center gap-1 text-sm">
                  <span class="text-base-content max-w-32 truncate">
                    {img.filename}
                  </span>
                  <button
                    type="button"
                    class="text-base-content-muted cursor-pointer hover:text-danger"
                    onClick={() =>
                      setImages((prev) => prev.filter((_, j) => j !== i()))
                    }
                  >
                    ×
                  </button>
                </div>
              )}
            </For>
          </div>
        </div>
        <Show when={err()}>
          <StateHolderFormError state={{ status: "error", err: err() }} />
        </Show>
      </Show>
    </ModalContainer>
  );
}
