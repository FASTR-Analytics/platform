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
        }),
      );
      return;
    }
    if (!description().trim()) {
      setErr(
        t3({
          en: "Please enter a description",
          fr: "Veuillez entrer une description",
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
      title={t3({ en: "Feedback", fr: "Retour" })}
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
                {t3({ en: "Send", fr: "Envoyer" })}
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
          })}
        </div>
      </Show>
      <Show when={!sent()}>
        <div class="text-base-content pb-2 text-sm">
          {t3({
            en: "Let us know about any bugs or suggestions.",
            fr: "Faites-nous part de vos bugs ou suggestions.",
          })}
        </div>
        <Select
          label={t3({ en: "Feedback type", fr: "Type de retour" })}
          value={feedbackType()}
          options={[
            { value: "bug", label: t3({ en: "Bug", fr: "Bug" }) },
            {
              value: "suggestion",
              label: t3({ en: "Suggestion", fr: "Suggestion" }),
            },
          ]}
          onChange={(v: string) => setFeedbackType(v as FeedbackType)}
          placeholder={t3({
            en: "Select a type...",
            fr: "Sélectionner un type...",
          })}
          fullWidth
        />
        <TextArea
          label={t3({ en: "Description", fr: "Description" })}
          value={description()}
          onChange={setDescription}
          placeholder={t3({
            en: "Describe the bug or suggestion...",
            fr: "Décrivez le bug ou la suggestion...",
          })}
          fullWidth
          height="140px"
        />
        <div>
          <div class="text-base-content pb-1 text-sm font-medium">
            {t3({ en: "Images (optional)", fr: "Images (optionnel)" })}
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
              {t3({ en: "Add image", fr: "Ajouter une image" })}
            </Button>
            <For each={images()}>
              {(img, i) => (
                <div class="flex items-center gap-1 text-sm">
                  <span class="text-base-content max-w-32 truncate">
                    {img.filename}
                  </span>
                  <button
                    type="button"
                    class="text-error hover:text-error cursor-pointer opacity-60 hover:opacity-100"
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
