import {
  getCalendar,
  t3,
  type DatasetHmisImportRunSummary,
  type Dhis2FetchErrorKind,
  type Dhis2PairFetchStat,
  type Dhis2RunPair,
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
import { Show, createMemo } from "solid-js";
import { serverActions } from "~/server_actions";
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
    Dhis2RunPair[] | undefined
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
  // Labels are a display-only enrichment: degrade to blank until ready.
  const indicators = createQuery(() => serverActions.getIndicators({}));
  const indicatorLabels = createMemo((): Map<string, string> => {
    const s = indicators.state();
    if (s.status !== "ready") return new Map();
    return new Map(
      s.data.rawIndicators.map((r) => [r.raw_indicator_id, r.raw_indicator_label]),
    );
  });

  const failedPairColumns: TableColumn<Dhis2PairFetchStat & { key: string }>[] = [
    {
      key: "indicatorRawId",
      header: t3({ en: "Indicator ID", fr: "ID indicateur", pt: "ID do indicador" }),
      sortable: true,
    },
    {
      key: "indicatorLabel",
      header: t3({ en: "Label", fr: "Libellé", pt: "Etiqueta" }),
      sortable: true,
      sortValue: (s) => indicatorLabels().get(s.indicatorRawId) ?? "",
      render: (s) => indicatorLabels().get(s.indicatorRawId) ?? "",
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
      sortValue: (s) => s.skippedValues ?? 0,
      render: (s) => toNum0(s.skippedValues ?? 0),
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
              .map((s) => ({ ...s, key: `${s.indicatorRawId}|${s.periodId}` }));
            const skippedPairStats = (keyedDetail.runStats?.pairFetchStats ?? [])
              .filter((s) => (s.skippedValues ?? 0) > 0)
              .map((s) => ({ ...s, key: `${s.indicatorRawId}|${s.periodId}` }));
            const totalSkippedValues = skippedPairStats.reduce(
              (sum, s) => sum + (s.skippedValues ?? 0),
              0,
            );
            const retryPairs: Dhis2RunPair[] = failedPairStats.map((s) => ({
              indicatorRawId: s.indicatorRawId,
              periodId: s.periodId,
            }));
            return (
              <div class="ui-spy">
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
                        en: "Indicators not found in DHIS2",
                        fr: "Indicateurs introuvables dans DHIS2",
                        pt: "Indicadores não encontrados no DHIS2",
                      })}
                    </div>
                    <div class="text-sm">
                      {t3({
                        en: "These indicator IDs match no data element or operand in DHIS2 — every selected month failed without a fetch, and will fail every run until they are fixed or removed in the indicator configuration.",
                        fr: "Ces ID d'indicateurs ne correspondent à aucun élément de données ni opérande dans DHIS2 — chaque mois sélectionné a échoué sans récupération, et échouera à chaque importation tant qu'ils ne sont pas corrigés ou retirés de la configuration des indicateurs.",
                        pt: "Estes IDs de indicadores não correspondem a nenhum elemento de dados nem operando no DHIS2 — todos os meses selecionados falharam sem obtenção, e falharão em todas as importações até serem corrigidos ou removidos na configuração dos indicadores.",
                      })}
                    </div>
                    <div class="text-sm font-mono">{unknownIds.join(", ")}</div>
                  </div>
                </Show>

                <Show when={dhis2IndicatorIds.length > 0}>
                  <div class="border-danger bg-danger-subtle ui-pad ui-spy-sm rounded border">
                    <div class="font-700">
                      {t3({
                        en: "DHIS2 indicators are not imported as values",
                        fr: "Les indicateurs DHIS2 ne sont pas importés comme valeurs",
                        pt: "Os indicadores DHIS2 não são importados como valores",
                      })}
                    </div>
                    <div class="text-sm">
                      {t3({
                        en: "These IDs are DHIS2 indicators (formulas). The importer reads only data elements and operands, so every selected month failed without a fetch and will keep failing; existing data is kept. Re-create each one through the DHIS2 indicator import in the indicator configuration, which decomposes the formula into its data elements.",
                        fr: "Ces ID sont des indicateurs DHIS2 (des formules). L'importation ne lit que les éléments de données et les opérandes : chaque mois sélectionné a échoué sans récupération et continuera d'échouer ; les données existantes sont conservées. Recréez chacun d'eux via l'import d'indicateurs DHIS2 dans la configuration des indicateurs, qui décompose la formule en ses éléments de données.",
                        pt: "Estes IDs são indicadores DHIS2 (fórmulas). A importação lê apenas elementos de dados e operandos, pelo que todos os meses selecionados falharam sem obtenção e continuarão a falhar; os dados existentes são mantidos. Recrie cada um através da importação de indicadores DHIS2 na configuração dos indicadores, que decompõe a fórmula nos seus elementos de dados.",
                      })}
                    </div>
                    <div class="text-sm font-mono">{dhis2IndicatorIds.join(", ")}</div>
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
