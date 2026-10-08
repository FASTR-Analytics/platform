import {
  getCalendar,
  t3,
  type DatasetHmisImportRunSummary,
  type Dhis2FetchErrorKind,
  type Dhis2PairFetchStat,
  type Dhis2RunPairInput,
} from "lib";
import {
  Button,
  EditorComponentProps,
  FrameTop,
  HeadingBar,
  StateHolderWrapper,
  Table,
  createQuery,
  formatPeriod,
  getEditorWrapper,
  toNum0,
  type TableColumn,
} from "panther";
import { For, Show, createMemo } from "solid-js";
import { serverActions } from "~/server_actions";
import {
  dataIdWithIndicator,
  dhis2FormulaRemedy,
  indicatorsByDataId,
  indicatorNameText,
} from "~/components/indicator_manager_hmis/_indicator_display";
import { ImportInformation } from "../_import_information";
import { selectionLabel, statusLabel } from "./_tab_history";
import { fetchDatasetHmisVersion } from "./_version_info";

function errorKindLabel(kind: Dhis2FetchErrorKind | undefined): string {
  if (kind === "permanent") {
    return t3({ en: "Configuration", fr: "Configuration", pt: "Configuração" });
  }
  if (kind === "transient") {
    return t3({ en: "Server", fr: "Serveur", pt: "Servidor" });
  }
  return "";
}

// The per-run error surface (PLAN_DHIS2_IMPORTER_SURFACE_ERRORS): everything
// the system recorded about one run (the fatal error, unknown indicator ids,
// per-pair fetch failures), opened from a History row.
// Closes with a pair list when the user asks to retry the failed pairs; the
// shell feeds it to the wizard's presetPairs entry.
export function Dhis2RunDetail(
  p: EditorComponentProps<
    { run: DatasetHmisImportRunSummary },
    Dhis2RunPairInput[] | undefined
  >,
) {
  const { openEditor, EditorWrapper } = getEditorWrapper();

  async function viewVersion(versionId: number) {
    const version = await fetchDatasetHmisVersion(versionId);
    if (version) {
      await openEditor({ element: ImportInformation, props: { version } });
    }
  }

  const detail = createQuery(
    () => serverActions.getDatasetHmisImportRunDetail({ run_id: p.run.id }),
    t3({
      en: "Loading run detail...",
      fr: "Chargement du détail de l'importation...",
      pt: "A carregar o detalhe da importação...",
    }),
  );
  // The pairs carry data ids (PLAN_A5 ruling 9); the dictionary keyed by
  // data id names them. A display-only enrichment: blank until ready.
  const indicators = createQuery(() => serverActions.getIndicators({}));
  const byDataId = createMemo(() => {
    const s = indicators.state();
    return s.status !== "ready" ? new Map() : indicatorsByDataId(s.data.indicators);
  });
  const indicatorName = (dataId: string): string => {
    const indicator = byDataId().get(dataId);
    return indicator ? indicatorNameText(indicator) : "";
  };
  const idWithIndicator = (dataId: string): string =>
    dataIdWithIndicator(byDataId().get(dataId), dataId);

  const windowSelection = () =>
    p.run.selection?.kind === "window" ? p.run.selection : undefined;

  const failedPairColumns: TableColumn<Dhis2PairFetchStat & { key: string }>[] = [
    {
      key: "dataId",
      header: t3({ en: "DHIS2 id", fr: "Identifiant DHIS2", pt: "ID DHIS2" }),
      sortable: true,
      render: (s) => <span class="font-mono">{s.dataId}</span>,
    },
    {
      key: "indicator",
      header: t3({ en: "Indicator", fr: "Indicateur", pt: "Indicador" }),
      sortable: true,
      sortValue: (s) => indicatorName(s.dataId),
      render: (s) => indicatorName(s.dataId),
    },
    {
      key: "periodId",
      header: t3({ en: "Month", fr: "Mois", pt: "Mês" }),
      sortable: true,
      sortValue: (s) => s.periodId,
      render: (s) => formatPeriod(s.periodId, "year-month", getCalendar()),
    },
    {
      key: "errorKind",
      header: t3({ en: "Error type", fr: "Type d'erreur", pt: "Tipo de erro" }),
      sortable: true,
      sortValue: (s) => s.errorKind ?? "",
      render: (s) => (
        <span class={s.errorKind === "permanent" ? "text-danger font-700" : ""}>
          {errorKindLabel(s.errorKind)}
        </span>
      ),
    },
    {
      key: "error",
      header: t3({ en: "Error detail", fr: "Détail de l'erreur", pt: "Detalhe do erro" }),
      render: (s) => (
        <span class="block max-w-md truncate" title={s.error}>
          {s.error ?? ""}
        </span>
      ),
    },
  ];

  const skippedPairColumns: TableColumn<Dhis2PairFetchStat & { key: string }>[] = [
    failedPairColumns[0]!,
    failedPairColumns[1]!,
    failedPairColumns[2]!,
    {
      key: "skippedValues",
      header: t3({ en: "Skipped values", fr: "Valeurs ignorées", pt: "Valores ignorados" }),
      sortable: true,
      alignH: "right",
      sortValue: (s) => s.skippedValues,
      render: (s) => toNum0(s.skippedValues),
    },
  ];

  function factRow(label: string, value: string) {
    return (
      <div class="flex items-baseline">
        <div class="w-56 flex-none">{label}</div>
        <div class="min-w-0 flex-1 wrap-break-word">{value}</div>
      </div>
    );
  }

  return (
    <EditorWrapper>
    <FrameTop
      panelChildren={
        <HeadingBar
          tonal
          onBack={() => p.close(undefined)}
          heading={
            <>
              {t3({ en: "Import run", fr: "Importation", pt: "Importação" })}
              <span class="font-400 ml-4">
                {new Date(p.run.startedAt).toLocaleString()}
              </span>
            </>
          }
        />
      }
    >
      <div class="ui-pad ui-spy h-full w-full overflow-auto">
        <div class="ui-pad ui-spy-sm rounded border text-sm">
          <div class="font-700 text-base">
            {t3({ en: "Run summary", fr: "Résumé de l'importation", pt: "Resumo da importação" })}
          </div>
          <div class="flex items-baseline">
            <div class="w-56 flex-none">{t3({ en: "Status", fr: "Statut", pt: "Estado" })}</div>
            <div
              class={`flex-1 ${p.run.status === "error" ? "text-danger font-700" : ""}`}
            >
              {statusLabel(p.run.status)}
            </div>
          </div>
          {factRow(
            t3({ en: "Started", fr: "Démarrée", pt: "Iniciada" }),
            new Date(p.run.startedAt).toLocaleString(),
          )}
          {factRow(
            t3({ en: "Ended", fr: "Terminée", pt: "Terminada" }),
            p.run.endedAt ? new Date(p.run.endedAt).toLocaleString() : "",
          )}
          {factRow(
            t3({ en: "Triggered by", fr: "Déclenchée par", pt: "Iniciada por" }),
            p.run.trigger === "schedule"
              ? `${p.run.triggeredBy ?? ""} (${t3({ en: "scheduled", fr: "planifiée", pt: "agendada" })})`
              : (p.run.triggeredBy ?? ""),
          )}
          {factRow(
            t3({ en: "Selection", fr: "Sélection", pt: "Seleção" }),
            selectionLabel(p.run),
          )}
          {factRow(
            t3({
              en: "Pairs (ok / failed / total)",
              fr: "Paires (ok / échec / total)",
              pt: "Pares (ok / falha / total)",
            }),
            `${toNum0(p.run.succeededPairs)} / ${toNum0(p.run.failedPairs)} / ${toNum0(p.run.totalPairs)}`,
          )}
          <div class="flex items-baseline">
            <div class="w-56 flex-none">
              {t3({ en: "Version", fr: "Version", pt: "Versão" })}
            </div>
            <div class="min-w-0 flex-1">
              <Show when={p.run.versionId} keyed fallback={""}>
                {(versionId) => (
                  <Button
                    size="sm"
                    outline
                    onClick={() => void viewVersion(versionId)}
                  >
                    {`${versionId} — ${t3({ en: "view import information", fr: "voir les informations d'importation", pt: "ver as informações de importação" })}`}
                  </Button>
                )}
              </Show>
            </div>
          </div>
          {factRow("DHIS2", p.run.dhis2Url ?? "")}
        </div>

        <Show when={p.run.error}>
          <div class="border-danger bg-danger-subtle ui-pad ui-spy-sm rounded border">
            <div class="font-700">
              {t3({ en: "Run error", fr: "Erreur de l'importation", pt: "Erro da importação" })}
            </div>
            <div class="text-sm wrap-break-word">{p.run.error}</div>
          </div>
        </Show>

        <StateHolderWrapper state={detail.state()} noPad>
          {(keyedDetail) => {
            const unknownIds = keyedDetail.runStats?.classification.unknownIds ?? [];
            const dhis2IndicatorIds =
              keyedDetail.runStats?.classification.dhis2IndicatorIds ?? [];
            const failedPairStats = (keyedDetail.runStats?.pairFetchStats ?? [])
              .filter((s) => !s.success)
              .map((s) => ({ ...s, key: `${s.dataId}|${s.periodId}` }));
            const skippedPairStats = (keyedDetail.runStats?.pairFetchStats ?? [])
              .filter((s) => s.skippedValues > 0)
              .map((s) => ({ ...s, key: `${s.dataId}|${s.periodId}` }));
            const totalSkippedValues = skippedPairStats.reduce(
              (sum, s) => sum + s.skippedValues,
              0,
            );
            const retryPairs: Dhis2RunPairInput[] = failedPairStats.map((s) => ({
              dataId: s.dataId,
              periodId: s.periodId,
            }));
            const dropped = windowSelection();
            return (
              <div class="ui-spy">
                <Show
                  when={dropped &&
                    (dropped.populationTermsDropped.length > 0 ||
                      dropped.uploadedIndicatorsDropped.length > 0)
                    ? dropped
                    : undefined}
                >
                  {(selection) => (
                    <div class="ui-pad ui-spy-sm rounded border text-sm">
                      <div class="font-700">
                        {t3({
                          en: "Not fetched from this selection",
                          fr: "Non récupéré pour cette sélection",
                          pt: "Não obtido para esta seleção",
                        })}
                      </div>
                      <Show when={selection().populationTermsDropped.length > 0}>
                        <div>
                          {t3({
                            en: `Population terms (${toNum0(selection().populationTermsDropped.length)}), which come from the Population page, not DHIS2:`,
                            fr: `Termes de population (${toNum0(selection().populationTermsDropped.length)}), qui proviennent de la page Population et non de DHIS2 :`,
                            pt: `Termos de população (${toNum0(selection().populationTermsDropped.length)}), que provêm da página População e não do DHIS2:`,
                          })}{" "}
                          <span class="font-mono">{selection().populationTermsDropped.join(", ")}</span>
                        </div>
                      </Show>
                      <Show when={selection().uploadedIndicatorsDropped.length > 0}>
                        <div>
                          {t3({
                            en: `Indicators of type Uploaded, which are not fetched from DHIS2 (${toNum0(selection().uploadedIndicatorsDropped.length)}):`,
                            fr: `Indicateurs de type Téléversé, qui ne sont pas récupérés depuis DHIS2 (${toNum0(selection().uploadedIndicatorsDropped.length)}) :`,
                            pt: `Indicadores do tipo Carregado, que não são obtidos do DHIS2 (${toNum0(selection().uploadedIndicatorsDropped.length)}):`,
                          })}{" "}
                          <span class="font-mono">{selection().uploadedIndicatorsDropped.join(", ")}</span>
                        </div>
                      </Show>
                    </div>
                  )}
                </Show>
                <Show
                  when={keyedDetail.runStats === undefined && keyedDetail.status !== "running"}
                >
                  <div class="text-sm">
                    {t3({
                      en: "Per-pair detail was not recorded for this run (it was interrupted before finishing). The current state of every indicator-month is in the import status view.",
                      fr: "Le détail par paire n'a pas été enregistré pour cette importation (elle a été interrompue avant la fin). L'état actuel de chaque indicateur-mois est dans l'état des importations.",
                      pt: "O detalhe por par não foi registado para esta importação (foi interrompida antes de terminar). O estado atual de cada indicador-mês está no estado das importações.",
                    })}
                  </div>
                </Show>

                <Show when={unknownIds.length > 0}>
                  <div class="border-danger bg-danger-subtle ui-pad ui-spy-sm rounded border">
                    <div class="font-700">
                      {t3({
                        en: "Some selected indicators point to nothing in DHIS2",
                        fr: "Certains indicateurs sélectionnés ne correspondent à rien dans DHIS2",
                        pt: "Alguns indicadores selecionados não apontam para nada no DHIS2",
                      })}
                    </div>
                    <div class="text-sm">
                      {t3({
                        en: "Their DHIS2 ids match no data element or operand in DHIS2. Every selected month of each failed without a fetch, and will fail every run until the indicator is changed in the indicator list. If it holds no data, fix its DHIS2 id or delete the indicator. If it holds data, change its type to Uploaded: it keeps its data, and no DHIS2 import fetches it again.",
                        fr: "Leurs identifiants DHIS2 ne correspondent à aucun élément de données ni opérande dans DHIS2. Chaque mois sélectionné de chacun a échoué sans récupération, et échouera à chaque importation tant que l'indicateur n'est pas modifié dans la liste des indicateurs. S'il ne contient aucune donnée, corrigez son identifiant DHIS2 ou supprimez l'indicateur. S'il contient des données, changez son type en Téléversé : il conserve ses données, et aucune importation DHIS2 ne le récupère plus.",
                        pt: "Os seus IDs DHIS2 não correspondem a nenhum elemento de dados nem operando no DHIS2. Todos os meses selecionados de cada um falharam sem obtenção, e falharão em todas as importações até o indicador ser alterado na lista de indicadores. Se não tiver dados, corrija o seu ID DHIS2 ou elimine o indicador. Se tiver dados, mude o seu tipo para Carregado: mantém os seus dados, e nenhuma importação DHIS2 o volta a obter.",
                      })}
                    </div>
                    <IdLines ids={unknownIds} label={idWithIndicator} />
                  </div>
                </Show>

                <Show when={dhis2IndicatorIds.length > 0}>
                  <div class="border-danger bg-danger-subtle ui-pad ui-spy-sm rounded border">
                    <div class="font-700">
                      {t3({
                        en: "Some selected indicators point to DHIS2 formulas",
                        fr: "Certains indicateurs sélectionnés pointent vers des formules DHIS2",
                        pt: "Alguns indicadores selecionados apontam para fórmulas DHIS2",
                      })}
                    </div>
                    <div class="text-sm">
                      {t3({
                        en: "Their DHIS2 ids belong to DHIS2 formulas (what DHIS2 calls an indicator), and this importer reads only data elements, so every selected month of each failed without a fetch and will keep failing, while the data already imported is kept.",
                        fr: "Leurs identifiants DHIS2 appartiennent à des formules DHIS2 (ce que DHIS2 appelle un indicateur), et cette importation ne lit que les éléments de données : chaque mois sélectionné de chacun a échoué sans récupération et continuera d'échouer, tandis que les données déjà importées sont conservées.",
                        pt: "Os seus IDs DHIS2 pertencem a fórmulas DHIS2 (o que o DHIS2 chama um indicador), e esta importação lê apenas elementos de dados, pelo que todos os meses selecionados de cada um falharam sem obtenção e continuarão a falhar, enquanto os dados já importados são mantidos.",
                      })}
                    </div>
                    <div class="text-sm">{dhis2FormulaRemedy()}</div>
                    <IdLines ids={dhis2IndicatorIds} label={idWithIndicator} />
                  </div>
                </Show>

                <Show when={skippedPairStats.length > 0}>
                  <div class="ui-spy-sm">
                    <div class="font-700 text-lg">
                      {t3({ en: "Skipped values", fr: "Valeurs ignorées", pt: "Valores ignorados" })}{" "}
                      ({toNum0(totalSkippedValues)})
                    </div>
                    <div class="text-sm">
                      {t3({
                        en: "Facility values that were not non-negative integers were left out of these pairs; the rest of each pair was imported. The import status view lists a sample per month.",
                        fr: "Les valeurs d'établissement qui n'étaient pas des entiers positifs ou nuls ont été exclues de ces paires ; le reste de chaque paire a été importé. L'état des importations présente un échantillon par mois.",
                        pt: "Os valores de unidade que não eram inteiros não negativos foram excluídos destes pares; o resto de cada par foi importado. O estado das importações mostra uma amostra por mês.",
                      })}
                    </div>
                    <Table
                      data={skippedPairStats}
                      columns={skippedPairColumns}
                      keyField="key"
                    />
                  </div>
                </Show>

                <Show when={failedPairStats.length > 0}>
                  <div class="ui-spy-sm">
                    <div class="ui-gap flex items-center">
                      <div class="font-700 text-lg">
                        {t3({ en: "Failed pairs", fr: "Paires en échec", pt: "Pares falhados" })}{" "}
                        ({toNum0(failedPairStats.length)})
                      </div>
                      <Button
                        onClick={() => p.close(retryPairs)}
                        size="sm"
                        outline
                        intent="danger"
                        iconName="refresh"
                      >
                        {t3({
                          en: "Retry failed pairs",
                          fr: "Réessayer les paires en échec",
                          pt: "Repetir os pares falhados",
                        })}
                      </Button>
                    </div>
                    <Table
                      data={failedPairStats}
                      columns={failedPairColumns}
                      keyField="key"
                    />
                  </div>
                </Show>

              </div>
            );
          }}
        </StateHolderWrapper>
      </div>
    </FrameTop>
    </EditorWrapper>
  );
}

function IdLines(p: { ids: string[]; label: (id: string) => string }) {
  return (
    <div class="text-sm font-mono">
      <For each={p.ids}>{(id) => <div>{p.label(id)}</div>}</For>
    </div>
  );
}
