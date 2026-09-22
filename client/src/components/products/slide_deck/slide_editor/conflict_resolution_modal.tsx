import { AlertComponentProps, Button, ModalContainer } from "panther";
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
      width="md"
    >
      <div>
        {t3({
          en: "Someone else saved changes while you were editing.",
          fr: "Quelqu'un d'autre a enregistré des modifications pendant que vous éditiez.",
          pt: "Outra pessoa guardou alterações enquanto editava.",
        })}
      </div>
      <div class="ui-gap-sm flex flex-col pt-2">
        <Button onClick={() => p.close("overwrite")} intent="danger">
          {t3({
            en: "Save anyway (overwrite their changes)",
            fr: "Enregistrer quand même (écraser leurs modifications)",
            pt: "Guardar mesmo assim (substituir as alterações da outra pessoa)",
          })}
        </Button>
        <Button onClick={() => p.close("save_as_new")} intent="primary">
          {t3(
            p.itemName
              ? {
                  en: `Save as a new ${p.itemName}`,
                  fr: `Enregistrer comme nouveau ${p.itemName}`,
                  pt: `Guardar como novo ${p.itemName}`,
                }
              : { en: "Save as new", fr: "Enregistrer comme nouveau", pt: "Guardar como novo" },
          )}
        </Button>
        <Button onClick={() => p.close("view_theirs")} intent="neutral">
          {t3({
            en: "Discard my changes and close",
            fr: "Abandonner mes modifications et fermer",
            pt: "Descartar as minhas alterações e fechar",
          })}
        </Button>
        <Button onClick={() => p.close("cancel")} intent="neutral" outline>
          {t3({ en: "Keep editing", fr: "Continuer les modifications", pt: "Continuar a editar" })}
        </Button>
      </div>
    </ModalContainer>
  );
}
