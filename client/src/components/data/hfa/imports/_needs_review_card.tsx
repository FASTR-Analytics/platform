import { t3, type HfaImportRunSummary } from "lib";
import {
  Button,
  CollapsibleSection,
  createButtonAction,
  createDeleteAction,
} from "panther";
import { Show } from "solid-js";
import { serverActions } from "~/server_actions";
import { HfaStagingSummary } from "./_staging_summary";

type Props = {
  run: HfaImportRunSummary;
  onChanged: () => Promise<void>;
};

// An HFA run holding in needs_review: staging dropped facility rows, so
// nothing was merged. The user integrates the surviving rows anyway or
// discards. The hold does NOT occupy the single-running slot.
export function HfaNeedsReviewCard(p: Props) {
  const integrateAnyway = createButtonAction(
    () =>
      serverActions.resolveDatasetHfaReview({
        runId: p.run.id,
        action: "integrate_anyway",
      }),
    p.onChanged,
  );

  async function attemptDiscard() {
    const discard = createDeleteAction(
      t3({
        en: "Discard this import? The staged rows will not be merged.",
        fr: "Abandonner cette importation ? Les lignes préparées ne seront pas fusionnées.",
        pt: "Descartar esta importação? As linhas preparadas não serão fundidas.",
      }),
      () =>
        serverActions.resolveDatasetHfaReview({
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
        <span class="font-400 ml-2 font-mono text-sm">{p.run.csvFileName}</span>
      </div>
      <div class="text-sm">
        {t3({
          en: "Some facility rows were dropped during staging, so nothing has been merged yet. Review the results below, then integrate the surviving rows or discard the import.",
          fr: "Des lignes d'établissements ont été rejetées pendant la préparation, rien n'a donc encore été fusionné. Vérifiez les résultats ci-dessous, puis intégrez les lignes retenues ou abandonnez l'importation.",
          pt: "Algumas linhas de estabelecimentos foram rejeitadas durante a preparação, pelo que nada foi ainda fundido. Reveja os resultados abaixo e depois integre as linhas retidas ou descarte a importação.",
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
            <HfaStagingSummary result={result} />
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
