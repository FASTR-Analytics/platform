import { type HfaImportRunSummary, t3 } from "lib";
import {
  Button,
  CollapsibleSection,
  createButtonAction,
  createDeleteAction,
} from "panther";
import { Show } from "solid-js";
import { serverActions } from "~/server_actions";
import { HfaStagingSummary } from "./staging_summary";

type Props = {
  run: HfaImportRunSummary;
  onChanged: () => Promise<void>;
};

// An HFA run holding in needs_review: rows with no facility id, or new
// facilities with no complete admin areas, so nothing was merged. The user
// integrates anyway, which leaves those out, or discards. The hold does NOT
// occupy the single-running slot.
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
        fr:
          "Abandonner cette importation ? Les lignes préparées ne seront pas fusionnées.",
        pt:
          "Descartar esta importação? As linhas preparadas não serão fundidas.",
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
      <div class="ui-text-heading">
        {t3({
          en: "Import needs review",
          fr: "Importation à vérifier",
          pt: "Importação a rever",
        })}
        <span class="font-400 ml-2 font-mono text-sm">{p.run.csvFileName}</span>
      </div>
      <div class="text-sm">
        {t3({
          en:
            "Some rows have no facility id, or some new facilities have no complete admin areas, so nothing has been merged yet. Review the results below, then integrate anyway, which leaves those rows and facilities out, or discard the import.",
          fr:
            "Certaines lignes n'ont pas d'identifiant d'établissement, ou de nouveaux établissements n'ont pas d'unités administratives complètes, rien n'a donc encore été fusionné. Vérifiez les résultats ci-dessous, puis intégrez malgré tout, ce qui laisse de côté ces lignes et ces établissements, ou abandonnez l'importation.",
          pt:
            "Algumas linhas não têm identificador de estabelecimento, ou alguns novos estabelecimentos não têm zonas administrativas completas, pelo que nada foi ainda fundido. Reveja os resultados abaixo e depois integre mesmo assim, o que deixa de fora essas linhas e esses estabelecimentos, ou descarte a importação.",
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
          {t3({
            en: "Integrate anyway",
            fr: "Intégrer malgré tout",
            pt: "Integrar mesmo assim",
          })}
        </Button>
        <Button onClick={attemptDiscard} intent="danger" outline>
          {t3({ en: "Discard", fr: "Abandonner", pt: "Descartar" })}
        </Button>
      </div>
    </div>
  );
}
