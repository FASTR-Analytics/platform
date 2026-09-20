import { clerk } from "~/components/LoggedInWrapper";
import { ModalContainer, type AlertComponentProps } from "panther";
import { createSignal } from "solid-js";
import { t3 } from "lib";

export function EmailOptInModal(p: AlertComponentProps<void, undefined>) {
  const [loading, setLoading] = createSignal(false);

  async function handleChoice(optIn: boolean) {
    setLoading(true);
    try {
      await clerk.user?.update({
        unsafeMetadata: {
          ...clerk.user.unsafeMetadata,
          emailOptIn: optIn,
          emailOptInAsked: true,
        },
      });
    } finally {
      setLoading(false);
    }
    p.close(undefined);
  }

  return (
    <ModalContainer
      width="sm"
      title={t3({ en: "Stay in the loop", fr: "Restez informé", pt: "Mantenha-se informado" })}
      actions={[
        {
          label: t3({ en: "No thanks", fr: "Non merci", pt: "Não, obrigado" }),
          onClick: () => handleChoice(false),
          intent: "neutral",
          disabled: loading(),
        },
        {
          label: t3({ en: "Yes, sign me up", fr: "Oui, inscrivez-moi", pt: "Sim, quero inscrever-me" }),
          onClick: () => handleChoice(true),
          disabled: loading(),
        },
      ]}
    >
      <p class="text-base-content text-sm">
        {t3({
          en: "Would you like to receive email updates and announcements?",
          fr: "Souhaitez-vous recevoir des mises à jour et des annonces par e-mail ?",
          pt: "Gostaria de receber atualizações e anúncios por e-mail?",
        })}
      </p>
    </ModalContainer>
  );
}
