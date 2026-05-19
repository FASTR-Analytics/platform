import { t3 } from "lib";
import { Button, type TimActionButton } from "panther";

type Props = {
  nRowsIntegrated: number;
  deleteSafe: TimActionButton<[]>;
};

export function ProgressComplete(p: Props) {
  return (
    <div class="ui-pad">
      <h3 class="font-700 text-success text-lg mb-4">
        {t3({ en: "Import Complete!", fr: "Importation terminée !" })}
      </h3>

      <div class="mb-6 rounded border p-4">
        <p class="text-sm">
          <strong>{t3({ en: "Rows integrated:", fr: "Lignes intégrées :" })}</strong>{" "}
          {p.nRowsIntegrated.toLocaleString()}
        </p>
      </div>

      <p class="text-neutral mb-4">
        {t3({
          en: "The ICEH data has been successfully imported. You can now view and analyze the equity data.",
          fr: "Les données ICEH ont été importées avec succès. Vous pouvez maintenant consulter et analyser les données d'équité.",
        })}
      </p>

      <Button onClick={() => p.deleteSafe.click()} intent="primary">
        {t3({ en: "Close and finish", fr: "Fermer et terminer" })}
      </Button>
    </div>
  );
}
