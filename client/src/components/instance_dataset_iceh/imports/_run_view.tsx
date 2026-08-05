import { t3, type IcehImportRunSummary } from "lib";
import { Button, FrameRight, ProgressBar, createDeleteAction, toPct0 } from "panther";
import { serverActions } from "~/server_actions";

type Props = {
  run: IcehImportRunSummary;
  onChanged: () => Promise<void>;
};

// Running ICEH run: staging/integrating percentage (the old attempt wizard's
// progress was frozen at 0% — the run worker actually reports it).
export function IcehRunView(p: Props) {
  const percent = () => p.run.progress?.percent ?? 0;

  const phaseLabel = () =>
    p.run.progress?.phase === "integrating"
      ? t3({ en: "Integrating...", fr: "Intégration...", pt: "A integrar..." })
      : t3({ en: "Staging...", fr: "Préparation...", pt: "A preparar..." });

  async function attemptCancel() {
    const cancelAction = createDeleteAction(
      t3({
        en: "Cancel this import? Nothing already merged is affected.",
        fr: "Annuler cette importation ? Rien de déjà fusionné n'est affecté.",
        pt: "Cancelar esta importação? Nada já fundido é afetado.",
      }),
      () => serverActions.cancelDatasetIcehRun({ runId: p.run.id }),
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
            {phaseLabel()} <span class="font-mono">{p.run.zipFileName}</span>
          </div>
        </div>
        <ProgressBar progressFrom0To100={percent()} />
        <div class="text-xs">
          {t3({
            en: "This updates automatically. A fully clean file integrates without further steps; skipped rows will hold the import here for your review.",
            fr: "Mise à jour automatique. Un fichier entièrement valide s'intègre sans autre étape ; des lignes ignorées mettront l'importation en attente de votre vérification ici.",
            pt: "Atualiza-se automaticamente. Um ficheiro totalmente válido integra-se sem mais etapas; linhas ignoradas colocarão a importação em espera aqui para a sua revisão.",
          })}
        </div>
      </div>
    </FrameRight>
  );
}
