import { AlertComponentProps, ModalContainer } from "panther";
import { t3 } from "lib";

export function ConflictResolutionModal(
  p: AlertComponentProps<
    {
      itemName?: string;
    },
    "view_theirs" | "overwrite" | "save_as_new" | "cancel"
  >,
) {
  return (
    <ModalContainer
      title={t3({ en: "Conflict Detected", fr: "Conflit détecté", pt: "Conflito detetado" })}
      width="lg"
      onCancel={() => p.close("cancel")}
      cancelLabel={t3({ en: "Keep editing", fr: "Continuer les modifications", pt: "Continuar a editar" })}
      actions={[
        {
          label: t3({ en: "Overwrite theirs", fr: "Écraser les leurs", pt: "Substituir as deles" }),
          onClick: () => p.close("overwrite"),
          intent: "danger",
          outline: true,
        },
        {
          label: t3({ en: "Discard mine", fr: "Abandonner les miennes", pt: "Descartar as minhas" }),
          onClick: () => p.close("view_theirs"),
          intent: "neutral",
          outline: true,
        },
        {
          label: t3(
            p.itemName
              ? {
                  en: `Save as a new ${p.itemName}`,
                  fr: `Enregistrer comme nouveau ${p.itemName}`,
                  pt: `Guardar como novo ${p.itemName}`,
                }
              : { en: "Save as new", fr: "Enregistrer comme nouveau", pt: "Guardar como novo" },
          ),
          onClick: () => p.close("save_as_new"),
        },
      ]}
    >
      <div class="ui-spy-sm">
        <div>
          {t3({
            en: "Someone else saved changes while you were editing.",
            fr: "Quelqu'un d'autre a enregistré des modifications pendant que vous éditiez.",
            pt: "Outra pessoa guardou alterações enquanto editava.",
          })}
        </div>
        <div class="text-base-content-muted text-sm">
          {t3({
            en: "Overwrite replaces their version with yours. Discard drops your changes and loads theirs. Save as new keeps both.",
            fr: "Écraser remplace leur version par la vôtre. Abandonner supprime vos modifications et charge les leurs. Enregistrer comme nouveau conserve les deux.",
            pt: "Substituir troca a versão deles pela sua. Descartar elimina as suas alterações e carrega as deles. Guardar como novo mantém ambas.",
          })}
        </div>
      </div>
    </ModalContainer>
  );
}
