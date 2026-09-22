import { t3, type IcehImportRunSummary } from "lib";
import {
  Button,
  CollapsibleSection,
  createButtonAction,
  createDeleteAction,
} from "panther";
import { Show } from "solid-js";
import { serverActions } from "~/server_actions";
import { IcehStagingSummary } from "./_staging_summary";

type Props = {
  run: IcehImportRunSummary;
  onChanged: () => Promise<void>;
};

// An ICEH run holding in needs_review: staging skipped rows it cannot
// explain (unknown disaggregator / invalid year / unknown indicator), so
// nothing was merged. The user integrates the surviving rows anyway (the
// retained zip is re-ingested with the gate skipped) or discards. The hold
// does NOT occupy the single-running slot.
export function IcehNeedsReviewCard(p: Props) {
  const integrateAnyway = createButtonAction(
    () =>
      serverActions.resolveDatasetIcehReview({
        runId: p.run.id,
        action: "integrate_anyway",
      }),
    p.onChanged,
  );

  async function attemptDiscard() {
    const discard = createDeleteAction(
      t3({
        en: "Discard this import? Nothing will be merged.",
        fr: "Abandonner cette importation ? Rien ne sera fusionné.",
        pt: "Descartar esta importação? Nada será fundido.",
      }),
      () =>
        serverActions.resolveDatasetIcehReview({
          runId: p.run.id,
          action: "discard",
        }),
      p.onChanged,
    );
    await discard.click();
  }

  return (
    <div class="border-warning ui-pad ui-spy-sm rounded border">
      <div class="font-700">
        {t3({ en: "Import needs review", fr: "Importation à vérifier", pt: "Importação a rever" })}
        <span class="font-400 ml-2 font-mono text-sm">{p.run.zipFileName}</span>
      </div>
      <div class="text-sm">
        {t3({
          en: "Some rows were skipped during staging for reasons the file cannot explain, so nothing has been merged yet. Review the results below, then integrate the surviving rows or discard the import.",
          fr: "Des lignes ont été ignorées pendant la préparation pour des raisons que le fichier ne peut expliquer, rien n'a donc encore été fusionné. Vérifiez les résultats ci-dessous, puis intégrez les lignes retenues ou abandonnez l'importation.",
          pt: "Algumas linhas foram ignoradas durante a preparação por razões que o ficheiro não pode explicar, pelo que nada foi ainda fundido. Reveja os resultados abaixo e depois integre as linhas retidas ou descarte a importação.",
        })}
      </div>
      <Show when={p.run.diagnostics} keyed>
        {(result) => (
          <CollapsibleSection
            defaultOpen
            title={t3({
              en: "Staging results",
              fr: "Résultats de préparation",
              pt: "Resultados de preparação",
            })}
          >
            <IcehStagingSummary result={result} />
          </CollapsibleSection>
        )}
      </Show>
      <div class="ui-gap-sm flex">
        <Button
          onClick={integrateAnyway.click}
          state={integrateAnyway.state()}
          intent="success"
        >
          {t3({ en: "Integrate anyway", fr: "Intégrer malgré tout", pt: "Integrar mesmo assim" })}
        </Button>
        <Button onClick={attemptDiscard} intent="danger" outline>
          {t3({ en: "Discard", fr: "Abandonner", pt: "Descartar" })}
        </Button>
      </div>
    </div>
  );
}
