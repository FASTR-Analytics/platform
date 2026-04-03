import { t3 } from "lib";
import { Button, type TimActionButton } from "panther";

export function ProgressComplete(p: { deleteSafe: TimActionButton<[]> }) {
  return (
    <div class="ui-pad ui-spy">
      <div class="">
        {t3({ en: "This import is complete! You should now remove the upload form.", fr: "Cette importation est terminée ! Vous devez maintenant supprimer le formulaire de téléversement." })}
      </div>
      <Button
        onClick={p.deleteSafe.click}
        state={p.deleteSafe.state()}
        intent="success"
        iconName="trash"
      >
        {t3({ en: "Remove completed upload form", fr: "Supprimer le formulaire de téléversement terminé" })}
      </Button>
    </div>
  );
}
