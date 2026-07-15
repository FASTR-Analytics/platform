import {
  t3,
  type DatasetHmisImportLedgerItem,
  type Dhis2RunPair,
} from "lib";
import {
  Button,
  EditorComponentProps,
  FrameTop,
  StateHolderWrapper,
  Table,
  createQuery,
  getEditorWrapper,
  toNum0,
  type TableColumn,
} from "panther";
import { Show, createMemo } from "solid-js";
import { serverActions } from "~/server_actions";
import { DatasetHmisDhis2Runs } from "./dhis2_run";
import { ImportLedgerIndicatorDetail } from "./_import_ledger_indicator";

export type LedgerPeriodWindow = { min: number; max: number };

type IndicatorRollup = {
  indicatorRawId: string;
  monthsWithData: number;
  monthsInWindow: number;
  latestImportedAt: string | undefined;
  latestSource: DatasetHmisImportLedgerItem["source"] | undefined;
  failedMonths: number;
  items: DatasetHmisImportLedgerItem[];
};

function countMonthsInclusive(min: number, max: number): number {
  const years = Math.floor(max / 100) - Math.floor(min / 100);
  return years * 12 + (max % 100) - (min % 100) + 1;
}

function buildRollups(items: DatasetHmisImportLedgerItem[]): {
  rollups: IndicatorRollup[];
  window: LedgerPeriodWindow | undefined;
} {
  if (items.length === 0) {
    return { rollups: [], window: undefined };
  }
  let min = Infinity;
  let max = -Infinity;
  for (const item of items) {
    min = Math.min(min, item.periodId);
    max = Math.max(max, item.periodId);
  }
  const window: LedgerPeriodWindow = { min, max };
  const monthsInWindow = countMonthsInclusive(min, max);

  const byIndicator = new Map<string, DatasetHmisImportLedgerItem[]>();
  for (const item of items) {
    const list = byIndicator.get(item.indicatorRawId);
    if (list) {
      list.push(item);
    } else {
      byIndicator.set(item.indicatorRawId, [item]);
    }
  }

  const rollups = Array.from(byIndicator.entries()).map<IndicatorRollup>(
    ([indicatorRawId, indicatorItems]) => {
      let monthsWithData = 0;
      let failedMonths = 0;
      let latestImportedAt: string | undefined;
      let latestSource: DatasetHmisImportLedgerItem["source"] | undefined;
      for (const item of indicatorItems) {
        if (item.nRecords > 0) {
          monthsWithData++;
        }
        if (item.status === "error") {
          failedMonths++;
        }
        if (
          item.importedAt &&
          (latestImportedAt === undefined || item.importedAt > latestImportedAt)
        ) {
          latestImportedAt = item.importedAt;
          latestSource = item.source;
        }
      }
      return {
        indicatorRawId,
        monthsWithData,
        monthsInWindow,
        latestImportedAt,
        latestSource,
        failedMonths,
        items: indicatorItems,
      };
    },
  );

  // "What needs attention" floats up by default; every column stays sortable.
  rollups.sort(
    (a, b) =>
      b.failedMonths - a.failedMonths ||
      a.indicatorRawId.localeCompare(b.indicatorRawId),
  );

  return { rollups, window };
}

export function sourceLabel(
  source: DatasetHmisImportLedgerItem["source"],
): string {
  if (source === "dhis2") {
    return "DHIS2";
  }
  if (source === "csv") {
    return "CSV";
  }
  return t3({
    en: "Before import tracking began",
    fr: "Avant le suivi des importations",
    pt: "Antes do registo das importações",
  });
}

export function ImportLedger(p: EditorComponentProps<{}, undefined>) {
  const { openEditor, EditorWrapper } = getEditorWrapper();

  const ledger = createQuery(
    () => serverActions.getDatasetHmisImportLedger({}),
    t3({
      en: "Loading import status...",
      fr: "Chargement de l'état des importations...",
      pt: "A carregar o estado das importações...",
    }),
  );
  // Labels are a display-only enrichment — don't gate the ledger table
  // behind a second StateHolderWrapper for it; degrade to blank until ready.
  const indicators = createQuery(() => serverActions.getIndicators({}));
  const indicatorLabels = createMemo((): Map<string, string> => {
    const s = indicators.state();
    if (s.status !== "ready") return new Map();
    return new Map(
      s.data.rawIndicators.map((r) => [r.raw_indicator_id, r.raw_indicator_label]),
    );
  });

  const columns: TableColumn<IndicatorRollup>[] = [
    {
      key: "indicatorRawId",
      header: t3({ en: "Indicator ID", fr: "ID indicateur", pt: "ID do indicador" }),
      sortable: true,
    },
    {
      key: "indicatorLabel",
      header: t3({ en: "Label", fr: "Libellé", pt: "Etiqueta" }),
      sortable: true,
      sortValue: (item) => indicatorLabels().get(item.indicatorRawId) ?? "",
      render: (item) => indicatorLabels().get(item.indicatorRawId) ?? "",
    },
    {
      key: "monthsWithData",
      header: t3({
        en: "Months with data",
        fr: "Mois avec données",
        pt: "Meses com dados",
      }),
      sortable: true,
      alignH: "right",
      sortValue: (item) => item.monthsWithData,
      render: (item) =>
        `${toNum0(item.monthsWithData)} / ${toNum0(item.monthsInWindow)}`,
    },
    {
      key: "latestImportedAt",
      header: t3({
        en: "Last imported",
        fr: "Dernière importation",
        pt: "Última importação",
      }),
      sortable: true,
      sortValue: (item) => item.latestImportedAt ?? "",
      render: (item) => {
        if (item.latestImportedAt) {
          return `${new Date(item.latestImportedAt).toLocaleDateString()} (${
            item.latestSource ? sourceLabel(item.latestSource) : ""
          })`;
        }
        // No timestamp anywhere: either pre-ledger backfill data, or an
        // indicator that has only ever failed (never imported at all).
        return item.items.some((i) => i.source === "backfill")
          ? sourceLabel("backfill")
          : t3({
            en: "Never imported",
            fr: "Jamais importé",
            pt: "Nunca importado",
          });
      },
    },
    {
      key: "failedMonths",
      header: t3({
        en: "Failed months",
        fr: "Mois en échec",
        pt: "Meses com falhas",
      }),
      sortable: true,
      alignH: "right",
      sortValue: (item) => item.failedMonths,
      render: (item) => (
        <span class={item.failedMonths > 0 ? "text-danger font-700" : ""}>
          {toNum0(item.failedMonths)}
        </span>
      ),
    },
  ];

  async function viewIndicator(rollup: IndicatorRollup, window: LedgerPeriodWindow) {
    await openEditor({
      element: ImportLedgerIndicatorDetail,
      props: {
        indicatorRawId: rollup.indicatorRawId,
        items: rollup.items,
        window,
        silentFetch: ledger.silentFetch,
      },
    });
  }

  // Checklist action: retry every failed (indicator, month) pair — enqueues a
  // per-pair run over exactly those pairs (WS-C's unit made visible).
  async function retryFailedPairs(items: DatasetHmisImportLedgerItem[]) {
    const failedPairs: Dhis2RunPair[] = items
      .filter((item) => item.status === "error")
      .map((item) => ({
        indicatorRawId: item.indicatorRawId,
        periodId: item.periodId,
      }));
    await openEditor({
      element: DatasetHmisDhis2Runs,
      props: {
        silentFetch: ledger.silentFetch,
        presetPairs: failedPairs,
        presetLabel: t3({
          en: "Retrying all failed pairs:",
          fr: "Nouvelle tentative pour toutes les paires en échec :",
          pt: "Nova tentativa para todos os pares falhados:",
        }),
      },
    });
  }

  return (
    <EditorWrapper>
      <FrameTop
        panelChildren={
          <div class="ui-pad ui-gap bg-base-200 flex h-full w-full items-center">
            <Button iconName="chevronLeft" onClick={() => p.close(undefined)} />
            <div class="font-700 flex-1 truncate text-xl">
              {t3({
                en: "Import status by indicator",
                fr: "État des importations par indicateur",
                pt: "Estado das importações por indicador",
              })}
            </div>
            <div class="ui-gap-sm flex items-center">
              <Button iconName="refresh" onClick={ledger.fetch} />
            </div>
          </div>
        }
      >
        <StateHolderWrapper state={ledger.state()}>
          {(keyedItems) => {
            const { rollups, window } = buildRollups(keyedItems);
            const failedCount = keyedItems.filter(
              (item) => item.status === "error",
            ).length;
            return (
              <div class="ui-pad ui-spy-sm flex h-full w-full flex-col">
                <Show when={failedCount > 0}>
                  <div class="flex-none">
                    <Button
                      onClick={() => retryFailedPairs(keyedItems)}
                      intent="danger"
                      outline
                      iconName="refresh"
                    >
                      {t3({
                        en: "Retry failed pairs",
                        fr: "Réessayer les paires en échec",
                        pt: "Repetir os pares falhados",
                      })}{" "}
                      ({toNum0(failedCount)})
                    </Button>
                  </div>
                </Show>
                <div class="min-h-0 flex-1">
                  <Table
                  data={rollups}
                  columns={columns}
                  keyField="indicatorRawId"
                  noRowsMessage={t3({
                    en: "No imports recorded yet",
                    fr: "Aucune importation enregistrée pour le moment",
                    pt: "Ainda não há importações registadas",
                  })}
                    onRowClick={(rollup) => {
                      if (window) {
                        viewIndicator(rollup, window);
                      }
                    }}
                    fitTableToAvailableHeight
                  />
                </div>
              </div>
            );
          }}
        </StateHolderWrapper>
      </FrameTop>
    </EditorWrapper>
  );
}
