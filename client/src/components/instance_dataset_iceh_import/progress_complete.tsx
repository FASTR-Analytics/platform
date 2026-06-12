import { t3, type IcehUploadAttemptStatus } from "lib";
import { Button, type ButtonAction } from "panther";

type Props = {
  status: Extract<IcehUploadAttemptStatus, { status: "complete" }>;
  deleteSafe: ButtonAction<[]>;
};

export function ProgressComplete(p: Props) {
  return (
    <div class="ui-pad ui-spy">
      <div class="">
        {t3({
          en: `Import complete! ${p.status.nRowsIntegrated.toLocaleString()} rows integrated.`,
          fr: `Importation terminée ! ${p.status.nRowsIntegrated.toLocaleString()} lignes intégrées.`,
        })}
      </div>
      <div class="">
        {t3({
          en: "You should now remove the upload form.",
          fr: "Vous devez maintenant supprimer le formulaire de téléversement.",
        })}
      </div>
      <Button
        onClick={p.deleteSafe.click}
        state={p.deleteSafe.state()}
        intent="success"
        iconName="trash"
      >
        {t3({
          en: "Remove completed upload form",
          fr: "Supprimer le formulaire de téléversement terminé",
        })}
      </Button>
    </div>
  );
}
