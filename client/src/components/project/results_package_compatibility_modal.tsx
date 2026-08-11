import { t3, TC, type ResultsPackageCompatibilityIssue } from "lib";
import {
  AlertComponentProps,
  Button,
  ModalContainer,
  StateHolderWrapper,
  createQuery,
} from "panther";
import { For, Match, Show, Switch } from "solid-js";
import { serverActions } from "~/server_actions";
import { getDisplayDisaggregationLabel } from "~/state/instance/_util_disaggregation_label";

// The §2.6 compatibility report, shown before a project repoints at another
// results package. Module evolution is per-package, so a swap is the one
// moment a project's stored visualization configs can meet a different
// catalog — this makes that informed rather than discovered afterwards.
//
// It never blocks: a package with issues is still attachable (the affected
// visualizations render their typed unavailable states, which are never
// silent). The report exists so the choice is made with the loss in view.

type Props = { projectId: string; runId: string; runLabel: string };

export function ResultsPackageCompatibilityModal(
  p: AlertComponentProps<Props, boolean>,
) {
  const report = createQuery(
    () =>
      serverActions.getResultsPackageCompatibility({
        projectId: p.projectId,
        run_id: p.runId,
      }),
    t3({
      en: "Checking this package against your visualizations...",
      fr: "Vérification de ce paquet par rapport à vos visualisations...",
      pt: "A verificar este pacote em relação às suas visualizações...",
    }),
  );

  return (
    <ModalContainer
      width="xl"
      title={`${t3({
        en: "Use this results package",
        fr: "Utiliser ce paquet de résultats",
        pt: "Usar este pacote de resultados",
      })}: ${p.runLabel}`}
      leftButtons={[
        <Button onClick={() => p.close(false)} intent="neutral" outline>
          {t3(TC.cancel)}
        </Button>,
      ]}
      rightButtons={[
        <Button onClick={() => p.close(true)} iconName="check">
          {t3({
            en: "Use this package",
            fr: "Utiliser ce paquet",
            pt: "Usar este pacote",
          })}
        </Button>,
      ]}
    >
      <StateHolderWrapper state={report.state()} noPad>
        {(keyedReport) => (
          <div class="ui-spy-sm">
            <Show
              when={keyedReport.issues.length > 0}
              fallback={
                <div class="text-sm">
                  {t3({
                    en: "Every visualization in this project resolves against this package.",
                    fr: "Toutes les visualisations de ce projet se résolvent avec ce paquet.",
                    pt: "Todas as visualizações deste projeto resolvem-se com este pacote.",
                  })}
                </div>
              }
            >
              <div class="text-sm">
                {`${keyedReport.issues.length} ${t3({
                  en: "of",
                  fr: "sur",
                  pt: "de",
                })} ${keyedReport.authoredVisualizationCount} ${t3({
                  en: "visualizations in this project would not resolve against this package. They stay in the project and show why they cannot be drawn.",
                  fr: "visualisations de ce projet ne se résoudraient pas avec ce paquet. Elles restent dans le projet et indiquent pourquoi elles ne peuvent pas être tracées.",
                  pt: "visualizações deste projeto não se resolveriam com este pacote. Permanecem no projeto e indicam por que não podem ser desenhadas.",
                })}`}
              </div>
              <div class="ui-spy-sm">
                <For each={keyedReport.issues}>
                  {(issue) => <IssueRow issue={issue} />}
                </For>
              </div>
            </Show>
          </div>
        )}
      </StateHolderWrapper>
    </ModalContainer>
  );
}

function IssueRow(p: { issue: ResultsPackageCompatibilityIssue }) {
  return (
    <div class="ui-pad-sm rounded border text-sm">
      <div class="font-700 truncate">{p.issue.label}</div>
      <div class="text-base-content-muted text-xs">
        <Switch>
          <Match when={p.issue.kind === "metric_not_in_package"}>
            {t3({
              en: "Its metric is not in this package",
              fr: "Sa métrique n'est pas dans ce paquet",
              pt: "A sua métrica não está neste pacote",
            })}
          </Match>
          <Match
            when={
              p.issue.kind === "metric_unavailable" ? p.issue.reason : undefined
            }
            keyed
          >
            {(reason) => reason}
          </Match>
          <Match when={p.issue.kind === "metric_unavailable"}>
            {t3({
              en: "Its metric produced no results in this package",
              fr: "Sa métrique n'a produit aucun résultat dans ce paquet",
              pt: "A sua métrica não produziu resultados neste pacote",
            })}
          </Match>
          <Match
            when={
              p.issue.kind === "dimensions_not_in_package"
                ? p.issue.disaggregationOptions
                : undefined
            }
            keyed
          >
            {(disOpts) =>
              `${t3({
                en: "This package does not produce",
                fr: "Ce paquet ne produit pas",
                pt: "Este pacote não produz",
              })}: ${disOpts
                .map((disOpt) => t3(getDisplayDisaggregationLabel(disOpt)))
                .join(", ")}`}
          </Match>
        </Switch>
      </div>
    </div>
  );
}
