import { t3, TC } from "lib";
import {
  Button,
  ModalContainer,
  Select,
  StateHolderFormError,
  TextArea,
  type AlertComponentProps,
} from "panther";
import { Show, createSignal } from "solid-js";
import { serverActions } from "~/server_actions";

type FeedbackType = "bug" | "suggestion";

export function HelpForm(p: AlertComponentProps<{ projectLabel?: string }, undefined>) {
  const [feedbackType, setFeedbackType] = createSignal<FeedbackType | undefined>(undefined);
  const [description, setDescription] = createSignal("");
  const [err, setErr] = createSignal("");
  const [sent, setSent] = createSignal(false);
  const [sending, setSending] = createSignal(false);

  async function handleSend() {
    if (!feedbackType()) {
      setErr(t3({ en: "Please select a type", fr: "Veuillez sélectionner un type" }));
      return;
    }
    if (!description().trim()) {
      setErr(t3({ en: "Please enter a description", fr: "Veuillez entrer une description" }));
      return;
    }
    setErr("");
    setSending(true);
    const res = await serverActions.sendHelpEmail({
      feedbackType: feedbackType()!,
      description: description(),
      projectLabel: p.projectLabel,
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
              <Button onClick={() => p.close(undefined)} intent="success" iconName="check">
                {t3(TC.done)}
              </Button>,
            ]
          : // eslint-disable-next-line jsx-key
            [
              <Button onClick={handleSend} intent="success" iconName="arrowRight" disabled={sending()}>
                {t3({ en: "Send", fr: "Envoyer" })}
              </Button>,
              // eslint-disable-next-line jsx-key
              <Button onClick={() => p.close(undefined)} intent="neutral" iconName="x">
                {t3(TC.cancel)}
              </Button>,
            ]
      }
    >
      <Show when={sent()}>
        <div class="text-success py-4 text-center">
          {t3({ en: "Thank you for your feedback!", fr: "Merci pour votre retour !" })}
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
          label={t3({ en: "Type", fr: "Type" })}
          value={feedbackType()}
          options={[
            { value: "bug", label: t3({ en: "Bug", fr: "Bug" }) },
            { value: "suggestion", label: t3({ en: "Suggestion", fr: "Suggestion" }) },
          ]}
          onChange={(v: string) => setFeedbackType(v as FeedbackType)}
          placeholder={t3({ en: "Select a type...", fr: "Sélectionner un type..." })}
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
        <Show when={err()}>
          <StateHolderFormError state={{ status: "error", err: err() }} />
        </Show>
      </Show>
    </ModalContainer>
  );
}
