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

export type FeedbackType = "bug" | "suggestion" | "help";
type ImageAttachment = { content: string; filename: string; mimeType: string };

export function FeedbackForm(
  p: AlertComponentProps<
    // `context` = where in the app the report came from (the open product,
    // the tab), so a bug report says what the user was looking at.
    { context?: string; initialType?: FeedbackType },
    undefined
  >,
) {
  const [feedbackType, setFeedbackType] = createSignal<
    FeedbackType | undefined
  >(p.initialType);
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
          en: "Please select a type",
          fr: "Veuillez sélectionner un type",
          pt: "Selecione um tipo",
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
      context: p.context,
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
      title={t3({
        en: "Help & feedback",
        fr: "Aide et commentaires",
        pt: "Ajuda e comentários",
      })}
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
          {feedbackType() === "help"
            ? t3({
                en: "Thank you! We have received your request and will get back to you soon.",
                fr: "Merci ! Nous avons bien reçu votre demande et vous répondrons bientôt.",
                pt: "Obrigado! Recebemos o seu pedido e responderemos em breve.",
              })
            : t3({
                en: "Thank you for your feedback!",
                fr: "Merci pour votre retour !",
                pt: "Obrigado pelos seus comentários!",
              })}
        </div>
      </Show>
      <Show when={!sent()}>
        <div class="text-base-content pb-2 text-sm">
          {t3({
            en: "Ask for help, report a bug, or send a suggestion.",
            fr: "Demandez de l'aide, signalez un bug ou envoyez une suggestion.",
            pt: "Peça ajuda, comunique um erro ou envie uma sugestão.",
          })}
        </div>
        <Select
          label={t3({ en: "Type", fr: "Type", pt: "Tipo" })}
          value={feedbackType()}
          options={[
            {
              value: "help",
              label: t3({
                en: "Help request",
                fr: "Demande d'aide",
                pt: "Pedido de ajuda",
              }),
            },
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
            en: "Describe your question, bug or suggestion...",
            fr: "Décrivez votre question, bug ou suggestion...",
            pt: "Descreva a sua questão, erro ou sugestão...",
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
