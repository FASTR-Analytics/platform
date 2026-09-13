import {
  t3,
  type DatasetHmisImportLedgerItem,
  type Dhis2RunPairInput,
} from "lib";
import {
  Button,
  StateHolderWrapper,
  Table,
  toNum0,
  type StateHolder,
  type TableColumn,
} from "panther";
import { Show } from "solid-js";

export type LedgerPeriodWindow = { min: number; max: number };

type Props = {
  // Both reads are shell-owned (this tab is remounted on every silent
  // runs/scheduling fetch, so it must not own queries: see the shell).
  ledger: StateHolder<DatasetHmisImportLedgerItem[]>;
  // The dictionary's label per indicator id, a display-only enrichment.
  indicatorLabels: Map<string, string>;
  onOpenIndicator: (
    indicatorId: string,
    items: DatasetHmisImportLedgerItem[],
    window: LedgerPeriodWindow,
  ) => Promise<void>;
  onRetryFailedPairs: (pairs: Dhis2RunPairInput[]) => Promise<void>;
};

type IndicatorRollup = {
  indicatorId: string;
  monthsWithData: number;
  monthsInWindow: number;
  latestImportedAt: string | undefined;
  latestRoute: DatasetHmisImportLedgerItem["route"] | undefined;
  failedMonths: number;
  skippedValues: number;
  items: DatasetHmisImportLedgerItem[];
};

// Import history pivoted by indicator (the ledger's key): one row per
// indicator across the dataset's period window, click-through to the
// per-month detail. Same history as the History tab, different axis.
export function Dhis2TabByIndicator(p: Props) {
  const columns: TableColumn<IndicatorRollup>[] = [
    {
      key: "indicatorId",
      header: t3({ en: "Indicator ID", fr: "ID de l'indicateur", pt: "ID do indicador" }),
      sortable: true,
      render: (item) => <span class="font-mono">{item.indicatorId}</span>,
    },
    {
      key: "label",
      header: t3({ en: "Label", fr: "Libellé", pt: "Etiqueta" }),
      sortable: true,
      sortValue: (item) => p.indicatorLabels.get(item.indicatorId) ?? "",
      render: (item) => p.indicatorLabels.get(item.indicatorId) ?? "",
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
            item.latestRoute ? importRouteLabel(item.latestRoute) : ""
          })`;
        }
        // No timestamp anywhere: either pre-ledger backfill data, or an
        // indicator that has only ever failed (never imported at all).
        return item.items.some((i) => i.route === "backfill")
          ? importRouteLabel("backfill")
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
    {
      key: "skippedValues",
      header: t3({
        en: "Skipped values",
        fr: "Valeurs ignorées",
        pt: "Valores ignorados",
      }),
      sortable: true,
      alignH: "right",
      sortValue: (item) => item.skippedValues,
      render: (item) => (
        <span class={item.skippedValues > 0 ? "text-warning font-700" : ""}>
          {toNum0(item.skippedValues)}
        </span>
      ),
    },
  ];

  function retryFailedPairs(items: DatasetHmisImportLedgerItem[]) {
    const failedPairs: Dhis2RunPairInput[] = items
      .filter((item) => item.status === "error")
      .map((item) => ({
        dataId: item.dataId,
        periodId: item.periodId,
      }));
    void p.onRetryFailedPairs(failedPairs);
  }

  return (
    <StateHolderWrapper state={p.ledger} noPad>
      {(keyedItems) => {
        const { rollups, window } = buildRollups(keyedItems);
        const failedCount = keyedItems.filter(
          (item) => item.status === "error",
        ).length;
        return (
          <div class="ui-spy-sm">
            <Show when={failedCount > 0}>
              <div class="">
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
            <Table
              data={rollups}
              columns={columns}
              keyField="indicatorId"
              noRowsMessage={t3({
                en: "No imports recorded yet",
                fr: "Aucune importation enregistrée pour le moment",
                pt: "Ainda não há importações registadas",
              })}
              onRowClick={(rollup) => {
                if (window) {
                  void p.onOpenIndicator(rollup.indicatorId, rollup.items, window);
                }
              }}
            />
          </div>
        );
      }}
    </StateHolderWrapper>
  );
}

// How a ledger row's data arrived: the DHIS2 importer, a CSV upload, or the
// backfill that predates import tracking.
export function importRouteLabel(
  route: DatasetHmisImportLedgerItem["route"],
): string {
  if (route === "dhis2") {
    return "DHIS2";
  }
  if (route === "csv") {
    return "CSV";
  }
  return t3({
    en: "Before import tracking began",
    fr: "Avant le suivi des importations",
    pt: "Antes do registo das importações",
  });
}

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
    const list = byIndicator.get(item.dataId);
    if (list) {
      list.push(item);
    } else {
      byIndicator.set(item.dataId, [item]);
    }
  }

  const rollups = Array.from(byIndicator.entries()).map<IndicatorRollup>(
    ([indicatorId, indicatorItems]) => {
      let monthsWithData = 0;
      let failedMonths = 0;
      let skippedValues = 0;
      let latestImportedAt: string | undefined;
      let latestRoute: DatasetHmisImportLedgerItem["route"] | undefined;
      for (const item of indicatorItems) {
        if (item.nRecords > 0) {
          monthsWithData++;
        }
        if (item.status === "error") {
          failedMonths++;
        }
        skippedValues += item.skippedValues;
        if (
          item.importedAt &&
          (latestImportedAt === undefined || item.importedAt > latestImportedAt)
        ) {
          latestImportedAt = item.importedAt;
          latestRoute = item.route;
        }
      }
      return {
        indicatorId,
        monthsWithData,
        monthsInWindow,
        latestImportedAt,
        latestRoute,
        failedMonths,
        skippedValues,
        items: indicatorItems,
      };
    },
  );

  // "What needs attention" floats up by default; every column stays sortable.
  rollups.sort(
    (a, b) =>
      b.failedMonths - a.failedMonths ||
      a.indicatorId.localeCompare(b.indicatorId),
  );

  return { rollups, window };
}
