import { AlertComponentProps, Button, capitalizeFirstLetter, ModalContainer } from "panther";
import { t3 } from "lib";

export function ConfirmUpdate(
  p: AlertComponentProps<
    {
      thingLabel: "visualization" | "report item";
    },
    boolean
  >,
) {
  return (
    <ModalContainer title={t3({ en: `${capitalizeFirstLetter(p.thingLabel)} updated`, fr: `${capitalizeFirstLetter(p.thingLabel)} mis à jour`, pt: `${capitalizeFirstLetter(p.thingLabel)} atualizado` })} width="sm">
      <div>
        {t3(p.thingLabel === "report item" ? { en: "This report has been updated by another user. Do you want to cancel your edits and see the new version?", fr: "Ce rapport a été mis à jour par un autre utilisateur. Souhaitez-vous annuler vos modifications et voir la nouvelle version ?", pt: "Este relatório foi atualizado por outro utilizador. Pretende cancelar as suas edições e ver a nova versão?" } : { en: "This visualization has been updated by another user. Do you want to cancel your edits and see the new version?", fr: "Cette visualisation a été mise à jour par un autre utilisateur. Souhaitez-vous annuler vos modifications et voir la nouvelle version ?", pt: "Esta visualização foi atualizada por outro utilizador. Pretende cancelar as suas edições e ver a nova versão?" })}
      </div>
      <div class="ui-gap-sm flex flex-col pt-2">
        <Button onClick={() => p.close(true)} iconName="refresh">
          {t3({ en: "Yes, cancel edits and see new version", fr: "Oui, annuler les modifications et voir la nouvelle version", pt: "Sim, cancelar as edições e ver a nova versão" })}
        </Button>
        <Button onClick={() => p.close(false)} intent="neutral" iconName="x">
          {t3({ en: "No, keep editing", fr: "Non, continuer les modifications", pt: "Não, continuar a editar" })}
        </Button>
      </div>
    </ModalContainer>
  );
}
