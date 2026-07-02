import { t3, type IcehUploadAttemptStatus } from "lib";
import { Button, type ButtonAction } from "panther";
import { Show } from "solid-js";

type Props = {
  status: Extract<IcehUploadAttemptStatus, { status: "complete" }>;
  deleteSafe: ButtonAction<[]>;
};

export function ProgressComplete(p: Props) {
  const samplesSuffix = () =>
    p.status.skippedUnknownStratSamples?.length
      ? ` (${t3({ en: "e.g.", fr: "p. ex." })} ${p.status.skippedUnknownStratSamples.join(", ")})`
      : "";
  return (
    <div class="ui-pad ui-spy">
      <div class="">
        {t3({
          en: `Import complete! ${p.status.nRowsIntegrated.toLocaleString()} rows integrated.`,
          fr: `Importation terminée ! ${p.status.nRowsIntegrated.toLocaleString()} lignes intégrées.`,
        })}
      </div>
      <Show when={(p.status.nRowsSkippedUnknownStrat ?? 0) > 0}>
        <div class="text-warning">
          {t3({
            en: `${p.status.nRowsSkippedUnknownStrat!.toLocaleString()} rows were skipped because their disaggregation ("Strat") was not recognized${samplesSuffix()}.`,
            fr: `${p.status.nRowsSkippedUnknownStrat!.toLocaleString()} lignes ont été ignorées car leur désagrégation (« Strat ») n'a pas été reconnue${samplesSuffix()}.`,
          })}
        </div>
      </Show>
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
