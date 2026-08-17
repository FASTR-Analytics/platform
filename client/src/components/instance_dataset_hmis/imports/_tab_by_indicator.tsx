import {
  t3,
  type DatasetHmisImportLedgerItem,
  type Dhis2RunPair,
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
  // runs/scheduling fetch, so it must not own queries — see the shell).
  ledger: StateHolder<DatasetHmisImportLedgerItem[]>;
  indicatorLabels: Map<string, string>;
  onOpenIndicator: (
    indicatorRawId: string,
    items: DatasetHmisImportLedgerItem[],
    window: LedgerPeriodWindow,
  ) => Promise<void>;
  onRetryFailedPairs: (pairs: Dhis2RunPair[]) => Promise<void>;
};

type IndicatorRollup = {
  indicatorRawId: string;
  monthsWithData: number;
  monthsInWindow: number;
  latestImportedAt: string | undefined;
  latestSource: DatasetHmisImportLedgerItem["source"] | undefined;
  failedMonths: number;
  items: DatasetHmisImportLedgerItem[];
};

// Import history pivoted by indicator: one row per raw indicator across the
// dataset's period window, click-through to the per-month detail. Same
// history as the History tab, different axis.
export function Dhis2TabByIndicator(p: Props) {
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
      sortValue: (item) => p.indicatorLabels.get(item.indicatorRawId) ?? "",
      render: (item) => p.indicatorLabels.get(item.indicatorRawId) ?? "",
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
            item.latestSource ? ledgerSourceLabel(item.latestSource) : ""
          })`;
        }
        // No timestamp anywhere: either pre-ledger backfill data, or an
        // indicator that has only ever failed (never imported at all).
        return item.items.some((i) => i.source === "backfill")
          ? ledgerSourceLabel("backfill")
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

  function viewIndicator(rollup: IndicatorRollup, window: LedgerPeriodWindow) {
    void p.onOpenIndicator(rollup.indicatorRawId, rollup.items, window);
  }

  function retryFailedPairs(items: DatasetHmisImportLedgerItem[]) {
    const failedPairs: Dhis2RunPair[] = items
      .filter((item) => item.status === "error")
      .map((item) => ({
        indicatorRawId: item.indicatorRawId,
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
            />
          </div>
        );
      }}
    </StateHolderWrapper>
  );
}

export function ledgerSourceLabel(
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
