import { clerk } from "~/components/LoggedInWrapper";
import { Button, TextArea, ModalContainer, type AlertComponentProps } from "panther";
import { createSignal } from "solid-js";
import { t3 } from "lib";

export function OrganisationModal(p: AlertComponentProps<void, undefined>) {
  const [organisation, setOrganisation] = createSignal("");
  const [loading, setLoading] = createSignal(false);

  async function handleSave() {
    const value = organisation().trim();
    if (!value) return;
    setLoading(true);
    try {
      await clerk.user?.update({
        unsafeMetadata: {
          ...clerk.user.unsafeMetadata,
          organisation: value,
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
          {t3({ en: "Your organisation", fr: "Votre organisation", pt: "A sua organização" })}
        </div>
      }
      leftButtons={
        // eslint-disable-next-line jsx-key
        [
          <Button
            onClick={() => p.close(undefined)}
            intent="neutral"
            disabled={loading()}
          >
            {t3({ en: "Skip for now", fr: "Passer pour l'instant", pt: "Ignorar por agora" })}
          </Button>,
        ]
      }
      rightButtons={
        // eslint-disable-next-line jsx-key
        [
          <Button
            onClick={handleSave}
            intent="primary"
            disabled={loading() || !organisation().trim()}
          >
            {t3({ en: "Save", fr: "Enregistrer", pt: "Guardar" })}
          </Button>,
        ]
      }
    >
      <div class="flex flex-col gap-3">
        <p class="text-base-content text-sm">
          {t3({
            en: "Which organisation are you a part of?",
            fr: "À quelle organisation appartenez-vous ?",
            pt: "De que organização faz parte?",
          })}
        </p>
        <TextArea
          value={organisation()}
          onChange={setOrganisation}
          placeholder={t3({ en: "Organisation name", fr: "Nom de l'organisation", pt: "Nome da organização" })}
          fullWidth
          rows={1}
          disabled={loading()}
        />
      </div>
    </ModalContainer>
  );
}
