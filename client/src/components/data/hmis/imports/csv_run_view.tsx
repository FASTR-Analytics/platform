import { t3, type DatasetHmisImportRunSummary } from "lib";
import {
  Button,
  FrameRight,
  ProgressBar,
  createDeleteAction,
  toPct0,
} from "panther";
import { serverActions } from "~/server_actions";

type Props = {
  run: DatasetHmisImportRunSummary;
  onChanged: () => Promise<void>;
};

// Running CSV run: staging/integrating percentage (relocated from the deleted
// attempt wizard's progress views).
export function CsvRunView(p: Props) {
  const csvProgress = () => {
    const progress = p.run.progress;
    return progress && "percent" in progress ? progress : undefined;
  };

  const percent = () => csvProgress()?.percent ?? 0;

  const phaseLabel = () =>
    csvProgress()?.phase === "integrating"
      ? t3({ en: "Integrating...", fr: "Intégration...", pt: "A integrar..." })
      : t3({ en: "Staging...", fr: "Préparation...", pt: "A preparar..." });

  async function attemptCancel() {
    const cancelAction = createDeleteAction(
      t3({
        en: "Cancel this import? Nothing already merged is affected.",
        fr: "Annuler cette importation ? Rien de déjà fusionné n'est affecté.",
        pt: "Cancelar esta importação? Nada já fundido é afetado.",
      }),
      () => serverActions.cancelDatasetHmisDhis2Run({ runId: p.run.id }),
      p.onChanged,
    );
    await cancelAction.click();
  }

  return (
    <FrameRight
      panelChildren={
        <div class="ui-pad">
          <Button onClick={attemptCancel} intent="danger" iconName="x" outline>
            {t3({ en: "Cancel import", fr: "Annuler l'importation", pt: "Cancelar a importação" })}
          </Button>
        </div>
      }
    >
      <div class="ui-pad ui-spy">
        <div class="ui-gap flex items-baseline">
          <div class="font-700 text-3xl">{toPct0(percent() / 100)}</div>
          <div class="text-sm">
            {phaseLabel()}{" "}
            <span class="font-mono">{p.run.csvFileName ?? ""}</span>
          </div>
        </div>
        <ProgressBar progressFrom0To100={percent()} />
        <div class="text-xs">
          {t3({
            en: "This updates automatically. A fully clean file integrates without further steps; dropped rows will hold the import here for your review.",
            fr: "Mise à jour automatique. Un fichier entièrement valide s'intègre sans autre étape ; des lignes rejetées mettront l'importation en attente de votre vérification ici.",
            pt: "Atualiza-se automaticamente. Um ficheiro totalmente válido integra-se sem mais etapas; linhas rejeitadas colocarão a importação em espera aqui para a sua revisão.",
          })}
        </div>
      </div>
    </FrameRight>
  );
}
