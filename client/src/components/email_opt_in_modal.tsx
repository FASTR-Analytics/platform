import { clerk } from "~/components/LoggedInWrapper";
import { Button, ModalContainer, type AlertComponentProps } from "panther";
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
      topPanel={
        <div class="font-700 text-base-content text-xl">
          {t3({ en: "Stay in the loop", fr: "Restez informé" })}
        </div>
      }
      leftButtons={
        // eslint-disable-next-line jsx-key
        [
          <Button
            onClick={() => handleChoice(false)}
            intent="neutral"
            disabled={loading()}
          >
            {t3({ en: "No thanks", fr: "Non merci" })}
          </Button>,
        ]
      }
      rightButtons={
        // eslint-disable-next-line jsx-key
        [
          <Button
            onClick={() => handleChoice(true)}
            intent="primary"
            disabled={loading()}
          >
            {t3({ en: "Yes, sign me up", fr: "Oui, inscrivez-moi" })}
          </Button>,
        ]
      }
    >
      <p class="text-base-content text-sm">
        {t3({
          en: "Would you like to receive email updates and announcements?",
          fr: "Souhaitez-vous recevoir des mises à jour et des annonces par e-mail ?",
        })}
      </p>
    </ModalContainer>
  );
}
