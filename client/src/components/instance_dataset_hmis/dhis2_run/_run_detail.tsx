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
  StateHolderWrapper,
  Table,
  createQuery,
  formatPeriod,
  toNum0,
  type TableColumn,
} from "panther";
import { Show, createMemo } from "solid-js";
import { serverActions } from "~/server_actions";
import { selectionLabel, statusLabel } from "./_tab_history";

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
// the system recorded about one run — the fatal error, unknown indicator ids,
// per-pair fetch failures, shadow mismatches — opened from a History row.
// Closes with a pair list when the user asks to retry the failed pairs; the
// shell feeds it to the wizard's presetPairs entry.
export function Dhis2RunDetail(
  p: EditorComponentProps<
    { run: DatasetHmisImportRunSummary },
    Dhis2RunPair[] | undefined
  >,
) {
  const detail = createQuery(
    () => serverActions.getDatasetHmisImportRunDetail({ run_id: p.run.id }),
    t3({
      en: "Loading run detail...",
      fr: "Chargement du détail de l'importation...",
      pt: "A carregar o detalhe da importação...",
    }),
  );
  // Labels are a display-only enrichment — degrade to blank until ready.
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

  function factRow(label: string, value: string) {
    return (
      <div class="flex items-baseline">
        <div class="w-56 flex-none">{label}</div>
        <div class="min-w-0 flex-1 wrap-break-word">{value}</div>
      </div>
    );
  }

  return (
    <FrameTop
      panelChildren={
        <div class="ui-pad ui-gap bg-base-200 flex h-full w-full items-center">
          <Button iconName="chevronLeft" onClick={() => p.close(undefined)} />
          <div class="font-700 flex-1 truncate text-xl">
            {t3({ en: "Import run", fr: "Importation", pt: "Importação" })}
            <span class="font-400 ml-4">
              {new Date(p.run.startedAt).toLocaleString()}
            </span>
          </div>
        </div>
      }
    >
      <div class="ui-pad ui-spy h-full w-full overflow-auto">
        <div class="border-base-300 ui-pad ui-spy-sm rounded border text-sm">
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
          {factRow(
            t3({ en: "Version", fr: "Version", pt: "Versão" }),
            p.run.versionId !== undefined ? `${p.run.versionId}` : "",
          )}
          {factRow("DHIS2", p.run.dhis2Url)}
        </div>

        <Show when={p.run.error}>
          <div class="border-danger bg-danger/10 ui-pad ui-spy-sm rounded border">
            <div class="font-700">
              {t3({ en: "Run error", fr: "Erreur de l'importation", pt: "Erro da importação" })}
            </div>
            <div class="text-sm wrap-break-word">{p.run.error}</div>
          </div>
        </Show>

        <StateHolderWrapper state={detail.state()} noPad>
          {(keyedDetail) => {
            const unknownIds = keyedDetail.runStats?.classification.unknownIds ?? [];
            const failedPairStats = (keyedDetail.runStats?.pairFetchStats ?? [])
              .filter((s) => !s.success)
              .map((s) => ({ ...s, key: `${s.indicatorRawId}|${s.periodId}` }));
            const shadowMismatches = (keyedDetail.runStats?.shadow?.mismatches ?? []).map(
              (m) => ({
                ...m,
                key: `${m.indicatorRawId}|${m.periodId}|${m.facilityId}`,
              }),
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
                  <div class="border-danger bg-danger/10 ui-pad ui-spy-sm rounded border">
                    <div class="font-700">
                      {t3({
                        en: "Indicators not found in DHIS2",
                        fr: "Indicateurs introuvables dans DHIS2",
                        pt: "Indicadores não encontrados no DHIS2",
                      })}
                    </div>
                    <div class="text-sm">
                      {t3({
                        en: "These indicator IDs do not exist in DHIS2 — every selected month failed without a fetch, and will fail every run until they are fixed or removed in the indicator configuration.",
                        fr: "Ces ID d'indicateurs n'existent pas dans DHIS2 — chaque mois sélectionné a échoué sans récupération, et échouera à chaque importation tant qu'ils ne sont pas corrigés ou retirés de la configuration des indicateurs.",
                        pt: "Estes IDs de indicadores não existem no DHIS2 — todos os meses selecionados falharam sem obtenção, e falharão em todas as importações até serem corrigidos ou removidos na configuração dos indicadores.",
                      })}
                    </div>
                    <div class="text-sm font-mono">{unknownIds.join(", ")}</div>
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

                <Show when={shadowMismatches.length > 0}>
                  <div class="ui-spy-sm">
                    <div class="font-700 text-lg">
                      {t3({
                        en: "Verification mismatches",
                        fr: "Divergences de vérification",
                        pt: "Divergências de verificação",
                      })}
                    </div>
                    <div class="text-sm">
                      {t3({
                        en: "First-run verification compared DHIS2's raw data values against its analytics engine. Hard mismatches fail the pair; soft mismatches (zero vs absent) are recorded only.",
                        fr: "La vérification de première importation a comparé les valeurs brutes de DHIS2 à son moteur analytique. Les divergences majeures font échouer la paire ; les divergences mineures (zéro ou absent) sont seulement enregistrées.",
                        pt: "A verificação da primeira importação comparou os valores brutos do DHIS2 com o seu motor analítico. As divergências graves fazem falhar o par; as divergências ligeiras (zero ou ausente) são apenas registadas.",
                      })}
                    </div>
                    <Table
                      data={shadowMismatches}
                      columns={[
                        {
                          key: "kind",
                          header: t3({ en: "Kind", fr: "Type", pt: "Tipo" }),
                          render: (m) => (
                            <span class={m.kind === "hard" ? "text-danger font-700" : ""}>
                              {m.kind === "hard"
                                ? t3({ en: "Hard", fr: "Majeure", pt: "Grave" })
                                : t3({ en: "Soft", fr: "Mineure", pt: "Ligeira" })}
                            </span>
                          ),
                        },
                        {
                          key: "indicatorRawId",
                          header: t3({ en: "Indicator ID", fr: "ID indicateur", pt: "ID do indicador" }),
                        },
                        {
                          key: "periodId",
                          header: t3({ en: "Month", fr: "Mois", pt: "Mês" }),
                          render: (m) => formatPeriod(m.periodId, "year-month", getCalendar()),
                        },
                        {
                          key: "facilityId",
                          header: t3({ en: "Facility", fr: "Établissement", pt: "Estabelecimento" }),
                        },
                        {
                          key: "dvsValue",
                          header: t3({ en: "Data value", fr: "Valeur brute", pt: "Valor bruto" }),
                          alignH: "right",
                          render: (m) => (m.dvsValue !== undefined ? toNum0(m.dvsValue) : "—"),
                        },
                        {
                          key: "analyticsValue",
                          header: t3({ en: "Analytics value", fr: "Valeur analytique", pt: "Valor analítico" }),
                          alignH: "right",
                          render: (m) =>
                            m.analyticsValue !== undefined ? toNum0(m.analyticsValue) : "—",
                        },
                      ]}
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
  );
}
