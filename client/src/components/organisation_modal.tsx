import { Button, Input, ModalContainer, type AlertComponentProps } from "panther";
import { createSignal } from "solid-js";
import { t3 } from "lib";
import { serverActions } from "~/server_actions";

export function OrganisationModal(p: AlertComponentProps<void, undefined>) {
  const [organisation, setOrganisation] = createSignal("");
  const [loading, setLoading] = createSignal(false);

  async function handleSave() {
    const value = organisation().trim();
    if (!value) return;
    setLoading(true);
    try {
      await serverActions.updateMyOrganisation({ organisation: value });
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
          {t3({ en: "Your organisation", fr: "Votre organisation" })}
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
            {t3({ en: "Skip for now", fr: "Passer pour l'instant" })}
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
            {t3({ en: "Save", fr: "Enregistrer" })}
          </Button>,
        ]
      }
    >
      <div class="flex flex-col gap-3">
        <p class="text-base-content text-sm">
          {t3({
            en: "Which organisation are you a part of?",
            fr: "À quelle organisation appartenez-vous ?",
          })}
        </p>
        <Input
          value={organisation()}
          onChange={setOrganisation}
          placeholder={t3({ en: "Organisation name", fr: "Nom de l'organisation" })}
          disabled={loading()}
        />
      </div>
    </ModalContainer>
  );
}
