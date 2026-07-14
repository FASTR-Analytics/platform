import {
  getCalendar,
  t3,
  type DatasetHmisImportRunSummary,
} from "lib";
import {
  Button,
  ProgressBar,
  createDeleteAction,
  formatPeriod,
  toNum0,
  toPct0,
} from "panther";
import { For, Show } from "solid-js";
import { serverActions } from "~/server_actions";

type Props = {
  run: DatasetHmisImportRunSummary;
  onChanged: () => Promise<void>;
};

export function Dhis2RunView(p: Props) {
  const completedPairs = () => p.run.succeededPairs + p.run.failedPairs;
  const fraction = () =>
    p.run.totalPairs > 0 ? completedPairs() / p.run.totalPairs : 0;

  async function attemptCancel() {
    const cancelAction = createDeleteAction(
      t3({
        en: "Cancel this import run? Pairs already imported are kept.",
        fr: "Annuler cette importation ? Les paires déjà importées sont conservées.",
        pt: "Cancelar esta importação? Os pares já importados são mantidos.",
      }),
      () => serverActions.cancelDatasetHmisDhis2Run({ runId: p.run.id }),
      p.onChanged,
    );
    await cancelAction.click();
  }

  const phaseLabel = () => {
    const phase = p.run.progress?.phase;
    if (phase === "classifying") {
      return t3({
        en: "Classifying indicators against DHIS2 metadata...",
        fr: "Classification des indicateurs selon les métadonnées DHIS2...",
        pt: "A classificar os indicadores segundo os metadados DHIS2...",
      });
    }
    if (phase === "finalizing") {
      return t3({ en: "Finalizing...", fr: "Finalisation...", pt: "A finalizar..." });
    }
    return t3({ en: "Fetching data...", fr: "Récupération des données...", pt: "A obter os dados..." });
  };

  return (
    <div class="border-base-300 ui-pad ui-spy rounded border">
      <div class="ui-gap flex items-center">
        <div class="font-700 flex-1 text-lg">
          {t3({
            en: "Import in progress",
            fr: "Importation en cours",
            pt: "Importação em curso",
          })}
        </div>
        <Button onClick={attemptCancel} intent="danger" iconName="x" outline>
          {t3({ en: "Cancel run", fr: "Annuler l'importation", pt: "Cancelar a importação" })}
        </Button>
      </div>

      <div class="ui-gap flex items-baseline">
        <div class="font-700 text-3xl">{toPct0(fraction())}</div>
        <div class="text-sm">
          {toNum0(completedPairs())} / {toNum0(p.run.totalPairs)}{" "}
          {t3({
            en: "pairs done",
            fr: "paires traitées",
            pt: "pares concluídos",
          })}
          {" — "}
          {toNum0(p.run.succeededPairs)}{" "}
          {t3({ en: "succeeded", fr: "réussies", pt: "bem-sucedidos" })},{" "}
          <span class={p.run.failedPairs > 0 ? "text-danger font-700" : ""}>
            {toNum0(p.run.failedPairs)}{" "}
            {t3({ en: "failed", fr: "en échec", pt: "falhados" })}
          </span>
        </div>
      </div>
      <ProgressBar progressFrom0To100={fraction() * 100} />

      <div class="text-sm">{phaseLabel()}</div>

      <Show when={(p.run.progress?.activePairs.length ?? 0) > 0}>
        <div class="text-xs">
          <div class="font-700 mb-1">
            {t3({ en: "Currently fetching", fr: "En cours de récupération", pt: "A obter neste momento" })}
          </div>
          <div class="ui-gap-sm flex flex-wrap">
            <For each={p.run.progress?.activePairs ?? []}>
              {(pair) => (
                <div class="bg-base-200 rounded px-2 py-1">
                  {pair.indicatorRawId} ·{" "}
                  {formatPeriod(pair.periodId, "year-month", getCalendar())}
                </div>
              )}
            </For>
          </div>
        </div>
      </Show>

      <div class="text-xs">
        {t3({
          en: "Completed pairs are saved as they finish — closing this view does not stop the import. Per-indicator results are in the import status view.",
          fr: "Les paires terminées sont sauvegardées au fur et à mesure — fermer cette vue n'arrête pas l'importation. Les résultats par indicateur sont dans l'état des importations.",
          pt: "Os pares concluídos são guardados à medida que terminam — fechar esta vista não interrompe a importação. Os resultados por indicador estão no estado das importações.",
        })}
      </div>
    </div>
  );
}
