import { clerk } from "./logged_in_wrapper";
import { TextArea, ModalContainer, type AlertComponentProps } from "panther";
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
      title={t3({ en: "Your organisation", fr: "Votre organisation", pt: "A sua organização" })}
      onCancel={() => p.close(undefined)}
      cancelLabel={t3({ en: "Skip for now", fr: "Passer pour l'instant", pt: "Ignorar por agora" })}
      cancelDisabled={loading()}
      actions={[
        {
          label: t3({ en: "Save", fr: "Enregistrer", pt: "Guardar" }),
          onClick: handleSave,
          disabled: loading() || !organisation().trim(),
        },
      ]}
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
