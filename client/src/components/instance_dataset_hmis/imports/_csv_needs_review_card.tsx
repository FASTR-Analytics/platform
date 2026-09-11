import {
  t3,
  type DatasetHmisImportRunSummary,
  type IndicatorWithSources,
} from "lib";
import {
  AlertComponentProps,
  AlertFormHolder,
  Button,
  CollapsibleSection,
  StateHolderWrapper,
  createButtonAction,
  createDeleteAction,
  createFormAction,
  createQuery,
  openComponent,
} from "panther";
import { createEffect, createMemo, createSignal, Show } from "solid-js";
import { createStore } from "solid-js/store";
import { serverActions } from "~/server_actions";
import {
  createNamingState,
  namingInputFromState,
  namingIssues,
  NamingStep,
  type NamingState,
} from "~/components/indicator_manager_hmis/_naming_step";
import { CsvStagingSummary } from "./_csv_staging_summary";

type Props = {
  run: DatasetHmisImportRunSummary;
  onChanged: () => Promise<void>;
};

// A CSV run holding in needs_review: staging dropped rows, so nothing was
// merged. The user integrates the surviving rows anyway, turns the unknown
// source ids into indicators and re-stages the same run (PLAN_A3 ruling 6),
// or discards. The hold does NOT block other imports (the slot was
// released).
export function CsvNeedsReviewCard(p: Props) {
  const detail = createQuery(
    () => serverActions.getDatasetHmisImportRunDetail({ run_id: p.run.id }),
    t3({
      en: "Loading staging results...",
      fr: "Chargement des résultats de préparation...",
      pt: "A carregar os resultados de preparação...",
    }),
  );

  const unknownSourceIds = createMemo<string[]>(() => {
    const s = detail.state();
    return s.status === "ready"
      ? s.data.csvStagingResult?.validation?.unknownSources.ids ?? []
      : [];
  });

  const integrateAnyway = createButtonAction(
    () =>
      serverActions.resolveDatasetHmisCsvReview({
        runId: p.run.id,
        action: "integrate_anyway",
      }),
    p.onChanged,
  );

  async function createIndicatorsAndRestage() {
    const done = await openComponent({
      element: CsvUnknownSourcesNamingForm,
      props: { runId: p.run.id, sourceIds: unknownSourceIds() },
    });
    if (done) {
      await p.onChanged();
    }
  }

  async function attemptDiscard() {
    const discard = createDeleteAction(
      t3({
        en: "Discard this import? The staged rows will not be merged.",
        fr: "Abandonner cette importation ? Les lignes préparées ne seront pas fusionnées.",
        pt: "Descartar esta importação? As linhas preparadas não serão fundidas.",
      }),
      () =>
        serverActions.resolveDatasetHmisCsvReview({
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
        {t3({
          en: "CSV import needs review",
          fr: "Importation CSV à vérifier",
          pt: "Importação CSV a rever",
        })}
        <span class="font-400 ml-2 font-mono text-sm">
          {p.run.csvFileName ?? ""}
        </span>
      </div>
      <div class="text-sm">
        {t3({
          en: "Some rows were dropped during staging, so nothing has been merged yet. Review the results below, then integrate the surviving rows or discard the import. Rows with an unknown source id can become indicators: name them and the file is staged again. Other imports are not blocked while this waits.",
          fr: "Des lignes ont été rejetées pendant la préparation, rien n'a donc encore été fusionné. Vérifiez les résultats ci-dessous, puis intégrez les lignes retenues ou abandonnez l'importation. Les lignes dont l'identifiant de source est inconnu peuvent devenir des indicateurs : nommez-les et le fichier est préparé à nouveau. Les autres importations ne sont pas bloquées pendant cette attente.",
          pt: "Algumas linhas foram rejeitadas durante a preparação, pelo que nada foi ainda fundido. Reveja os resultados abaixo e depois integre as linhas retidas ou descarte a importação. As linhas com um ID de fonte desconhecido podem tornar-se indicadores: nomeie-os e o ficheiro é preparado de novo. As outras importações não ficam bloqueadas durante esta espera.",
        })}
      </div>
      <StateHolderWrapper state={detail.state()} noPad>
        {(keyedDetail) => (
          <Show when={keyedDetail.csvStagingResult} keyed>
            {(result) => (
              <CollapsibleSection
                defaultOpen
                title={t3({
                  en: "Staging results",
                  fr: "Résultats de préparation",
                  pt: "Resultados de preparação",
                })}
              >
                <CsvStagingSummary result={result} />
              </CollapsibleSection>
            )}
          </Show>
        )}
      </StateHolderWrapper>
      <div class="ui-gap-sm flex flex-wrap">
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
        <Show when={unknownSourceIds().length > 0}>
          <Button onClick={createIndicatorsAndRestage} intent="primary">
            {t3({
              en: "Create indicators for the unknown ids and re-stage",
              fr: "Créer des indicateurs pour les identifiants inconnus et préparer à nouveau",
              pt: "Criar indicadores para os IDs desconhecidos e preparar de novo",
            })}
          </Button>
        </Show>
        <Button onClick={attemptDiscard} intent="danger" outline>
          {t3({ en: "Discard", fr: "Abandonner", pt: "Descartar" })}
        </Button>
      </div>
    </div>
  );
}

// The naming step over the hold's unknown source ids: each becomes a new
// base (its label starts as the id) or a source of an existing base. Saving
// creates them and relaunches the run through the full stage leg.
function CsvUnknownSourcesNamingForm(
  p: AlertComponentProps<{ runId: number; sourceIds: string[] }, boolean>,
) {
  const dictionary = createQuery(
    () => serverActions.getIndicators({}),
    t3({
      en: "Loading indicators...",
      fr: "Chargement des indicateurs...",
      pt: "A carregar os indicadores...",
    }),
  );

  const save = createFormAction(
    async (e: MouseEvent) => {
      e.preventDefault();
      return await serverActions.resolveDatasetHmisCsvReview({
        runId: p.runId,
        action: "restage",
        naming: namingInputFromState(naming),
      });
    },
    () => p.close(true),
  );

  const [naming, setNaming] = createStore<NamingState>({
    sources: [],
    derived: [],
  });
  // Seeded once, from the dictionary as loaded: the proposed ids are
  // generated against it, and the user's edits must not be re-seeded away.
  const [indicators, setIndicators] = createSignal<IndicatorWithSources[]>();
  createEffect(() => {
    const s = dictionary.state();
    if (s.status !== "ready" || indicators() !== undefined) return;
    setNaming(
      createNamingState({
        sources: p.sourceIds.map((id) => ({ source_id: id, source_label: id })),
        derived: [],
        indicators: s.data.indicators,
      }),
    );
    setIndicators(s.data.indicators);
  });

  const issues = createMemo(() => {
    const list = indicators();
    return list === undefined ? [] : namingIssues(naming, list);
  });

  return (
    <AlertFormHolder
      formId="csv-unknown-sources-naming"
      header={t3({
        en: "Create indicators for the unknown ids",
        fr: "Créer des indicateurs pour les identifiants inconnus",
        pt: "Criar indicadores para os IDs desconhecidos",
      })}
      savingState={save.state()}
      saveFunc={save.click}
      saveButtonText={t3({
        en: "Create and re-stage",
        fr: "Créer et préparer à nouveau",
        pt: "Criar e preparar de novo",
      })}
      cancelFunc={() => p.close(undefined)}
      disableSaveButton={indicators() === undefined || issues().length > 0}
      width="2xl"
    >
      <StateHolderWrapper state={dictionary.state()} noPad>
        {() => (
          <Show when={indicators()} keyed>
            {(list) => (
              <NamingStep state={naming} setState={setNaming} indicators={list} />
            )}
          </Show>
        )}
      </StateHolderWrapper>
    </AlertFormHolder>
  );
}
