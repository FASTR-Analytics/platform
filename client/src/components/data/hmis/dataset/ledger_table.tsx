import {
  t3,
  type DatasetHmisImportLedgerItem,
  type Dhis2RunPairInput,
  type HmisIndicator,
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
import { WrapOnUnderscore } from "~/components/data/hmis/_shared/mod.ts";

export type LedgerPeriodWindow = { min: number; max: number };

type Props = {
  // Both reads are page-owned (PLAN_A8 ruling 10): the table is a render
  // over state that survives a tab switch.
  ledger: StateHolder<DatasetHmisImportLedgerItem[]>;
  // The dictionary keyed by data id, a display-only enrichment: a row whose
  // data id no indicator carries shows blank indicator columns.
  indicatorsByDataId: Map<string, HmisIndicator>;
  onOpenIndicator: (
    dataId: string,
    items: DatasetHmisImportLedgerItem[],
    window: LedgerPeriodWindow,
  ) => Promise<void>;
  onRetryFailedPairs: (pairs: Dhis2RunPairInput[]) => Promise<void>;
};

type DataIdRollup = {
  dataId: string;
  monthsWithData: number;
  monthsInWindow: number;
  latestImportedAt: string | undefined;
  latestRoute: DatasetHmisImportLedgerItem["route"] | undefined;
  failedMonths: number;
  skippedValues: number;
  items: DatasetHmisImportLedgerItem[];
};

// The import ledger pivoted by data id (its key, PLAN_A5 ruling 9): one row
// per data id across the dataset's period window, labelled through the
// dictionary, click-through to the per-month detail.
export function LedgerTable(p: Props) {
  const indicatorOf = (item: DataIdRollup) =>
    p.indicatorsByDataId.get(item.dataId);
  const dhis2IdOf = (item: DataIdRollup) =>
    indicatorOf(item)?.definition.type === "dhis2_element"
      ? item.dataId
      : undefined;

  const columns: TableColumn<DataIdRollup>[] = [
    {
      key: "indicatorId",
      header: t3({
        en: "Indicator ID",
        fr: "ID de l'indicateur",
        pt: "ID do indicador",
      }),
      sortable: true,
      sortValue: (item) => indicatorOf(item)?.indicator_common_id ?? "",
      render: (item) => (
        <span class="font-mono">
          <WrapOnUnderscore text={indicatorOf(item)?.indicator_common_id ?? ""} />
        </span>
      ),
    },
    {
      key: "label",
      header: t3({ en: "Label", fr: "Libellé", pt: "Etiqueta" }),
      sortable: true,
      sortValue: (item) => indicatorOf(item)?.indicator_common_label ?? "",
      render: (item) => (
        <WrapOnUnderscore text={indicatorOf(item)?.indicator_common_label ?? ""} />
      ),
    },
    {
      // The key is shown only where it means something to a reader: a
      // DHIS2 element's UID. An Uploaded indicator's key is opaque (PLAN_A6
      // ruling 1).
      key: "dhis2Id",
      header: t3({ en: "DHIS2 id", fr: "Identifiant DHIS2", pt: "ID DHIS2" }),
      sortable: true,
      sortValue: (item) => dhis2IdOf(item) ?? "",
      render: (item) => <span class="font-mono">{dhis2IdOf(item) ?? ""}</span>,
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
        // No timestamp anywhere: either pre-ledger backfill data, or a data
        // id that has only ever failed (never imported at all).
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
          <div class="ui-spy-sm h-full w-full">
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
              keyField="dataId"
              noRowsMessage={t3({
                en: "No imports recorded yet",
                fr: "Aucune importation enregistrée pour le moment",
                pt: "Ainda não há importações registadas",
              })}
              onRowClick={(rollup) => {
                if (window) {
                  void p.onOpenIndicator(rollup.dataId, rollup.items, window);
                }
              }}
              fitTableToAvailableHeight
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
  rollups: DataIdRollup[];
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

  const byDataId = new Map<string, DatasetHmisImportLedgerItem[]>();
  for (const item of items) {
    const list = byDataId.get(item.dataId);
    if (list) {
      list.push(item);
    } else {
      byDataId.set(item.dataId, [item]);
    }
  }

  const rollups = Array.from(byDataId.entries()).map<DataIdRollup>(
    ([dataId, dataIdItems]) => {
      let monthsWithData = 0;
      let failedMonths = 0;
      let skippedValues = 0;
      let latestImportedAt: string | undefined;
      let latestRoute: DatasetHmisImportLedgerItem["route"] | undefined;
      for (const item of dataIdItems) {
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
        dataId,
        monthsWithData,
        monthsInWindow,
        latestImportedAt,
        latestRoute,
        failedMonths,
        skippedValues,
        items: dataIdItems,
      };
    },
  );

  // "What needs attention" floats up by default; every column stays sortable.
  rollups.sort(
    (a, b) =>
      b.failedMonths - a.failedMonths || a.dataId.localeCompare(b.dataId),
  );

  return { rollups, window };
}
