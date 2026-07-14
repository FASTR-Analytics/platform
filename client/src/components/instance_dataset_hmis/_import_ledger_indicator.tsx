import {
  getCalendar,
  t3,
  type DatasetHmisImportLedgerItem,
  type Dhis2RunPair,
} from "lib";
import {
  Button,
  EditorComponentProps,
  FrameTop,
  Table,
  formatPeriod,
  getEditorWrapper,
  toNum0,
  type TableColumn,
} from "panther";
import { DatasetHmisDhis2Runs } from "./dhis2_run";
import { sourceLabel, type LedgerPeriodWindow } from "./_import_ledger";

type MonthRow = {
  periodId: number;
  item: DatasetHmisImportLedgerItem | undefined;
};

function enumerateMonthsDescending(window: LedgerPeriodWindow): number[] {
  const out: number[] = [];
  let year = Math.floor(window.max / 100);
  let month = window.max % 100;
  while (year * 100 + month >= window.min) {
    out.push(year * 100 + month);
    month--;
    if (month < 1) {
      month = 12;
      year--;
    }
  }
  return out;
}

// The stored error is prefixed with its classification by the ledger writer:
// "[permanent] …" = config error that will fail again until fixed,
// "[transient] …" = server health at the time of the run.
function splitError(
  error: string | undefined,
): { kind: "permanent" | "transient" | undefined; message: string } {
  if (!error) {
    return { kind: undefined, message: "" };
  }
  if (error.startsWith("[permanent] ")) {
    return { kind: "permanent", message: error.slice("[permanent] ".length) };
  }
  if (error.startsWith("[transient] ")) {
    return { kind: "transient", message: error.slice("[transient] ".length) };
  }
  return { kind: undefined, message: error };
}

export function ImportLedgerIndicatorDetail(
  p: EditorComponentProps<
    {
      indicatorRawId: string;
      items: DatasetHmisImportLedgerItem[];
      window: LedgerPeriodWindow;
      silentFetch: () => Promise<void>;
    },
    undefined
  >,
) {
  const { openEditor, EditorWrapper } = getEditorWrapper();

  const itemsByPeriod = new Map<number, DatasetHmisImportLedgerItem>();
  for (const item of p.items) {
    itemsByPeriod.set(item.periodId, item);
  }
  const rows = enumerateMonthsDescending(p.window).map<MonthRow>(
    (periodId) => ({ periodId, item: itemsByPeriod.get(periodId) }),
  );

  // Checklist action: re-import every month in the window for this indicator
  // as per-pair units.
  async function reimportIndicator() {
    const pairs: Dhis2RunPair[] = enumerateMonthsDescending(p.window).map(
      (periodId) => ({ indicatorRawId: p.indicatorRawId, periodId }),
    );
    await openEditor({
      element: DatasetHmisDhis2Runs,
      props: {
        silentFetch: p.silentFetch,
        presetPairs: pairs,
        presetLabel: `${t3({
          en: "Re-importing",
          fr: "Réimportation de",
          pt: "A reimportar",
        })} ${p.indicatorRawId}:`,
      },
    });
  }

  const columns: TableColumn<MonthRow>[] = [
    {
      key: "periodId",
      header: t3({ en: "Month", fr: "Mois", pt: "Mês" }),
      render: (row) => formatPeriod(row.periodId, "year-month", getCalendar()),
    },
    {
      key: "status",
      header: t3({ en: "Status", fr: "État", pt: "Estado" }),
      render: (row) => {
        if (!row.item) {
          return (
            <span class="opacity-50">
              {t3({
                en: "Never imported",
                fr: "Jamais importé",
                pt: "Nunca importado",
              })}
            </span>
          );
        }
        if (row.item.status === "error") {
          const { kind } = splitError(row.item.error);
          return (
            <span class="text-danger font-700">
              {kind === "permanent"
                ? t3({
                  en: "Error — configuration",
                  fr: "Erreur — configuration",
                  pt: "Erro — configuração",
                })
                : kind === "transient"
                ? t3({
                  en: "Error — server",
                  fr: "Erreur — serveur",
                  pt: "Erro — servidor",
                })
                : t3({ en: "Error", fr: "Erreur", pt: "Erro" })}
            </span>
          );
        }
        if (row.item.nRecords === 0) {
          return t3({
            en: "Checked — no data",
            fr: "Vérifié — aucune donnée",
            pt: "Verificado — sem dados",
          });
        }
        return t3({ en: "OK", fr: "OK", pt: "OK" });
      },
    },
    {
      key: "nRecords",
      header: t3({ en: "Records", fr: "Enregistrements", pt: "Registos" }),
      alignH: "right",
      render: (row) => (row.item ? toNum0(row.item.nRecords) : ""),
    },
    {
      key: "sumCount",
      header: t3({
        en: "Service counts",
        fr: "Prestations de services",
        pt: "Prestações de serviços",
      }),
      alignH: "right",
      render: (row) => (row.item ? toNum0(row.item.sumCount) : ""),
    },
    {
      key: "source",
      header: t3({ en: "Source", fr: "Source", pt: "Fonte" }),
      render: (row) => (row.item ? sourceLabel(row.item.source) : ""),
    },
    {
      key: "importedAt",
      header: t3({
        en: "Last imported",
        fr: "Dernière importation",
        pt: "Última importação",
      }),
      render: (row) => {
        if (!row.item) {
          return "";
        }
        if (!row.item.importedAt) {
          // Backfill rows predate tracking; anything else with no timestamp
          // has never successfully imported — leave the cell empty rather
          // than implying a pre-tracking import.
          return row.item.source === "backfill" ? sourceLabel("backfill") : "";
        }
        return new Date(row.item.importedAt).toLocaleString();
      },
    },
    {
      key: "error",
      header: t3({ en: "Error detail", fr: "Détail de l'erreur", pt: "Detalhe do erro" }),
      render: (row) => {
        const { message } = splitError(row.item?.error);
        return (
          <span class="block max-w-md truncate" title={message}>
            {message}
          </span>
        );
      },
    },
  ];

  return (
    <EditorWrapper>
      <FrameTop
        panelChildren={
          <div class="ui-pad ui-gap bg-base-200 flex h-full w-full items-center">
            <Button iconName="chevronLeft" onClick={() => p.close(undefined)} />
            <div class="font-700 flex-1 truncate text-xl">
              {t3({
                en: "Import status",
                fr: "État des importations",
                pt: "Estado das importações",
              })}
              <span class="font-400 ml-4">{p.indicatorRawId}</span>
            </div>
            <div class="ui-gap-sm flex items-center">
              <Button iconName="databaseImport" onClick={reimportIndicator}>
                {t3({
                  en: "Re-import this indicator",
                  fr: "Réimporter cet indicateur",
                  pt: "Reimportar este indicador",
                })}
              </Button>
            </div>
          </div>
        }
      >
        <div class="ui-pad h-full w-full">
          <Table
            data={rows}
            columns={columns}
            keyField="periodId"
            noRowsMessage={t3({
              en: "No months in window",
              fr: "Aucun mois dans la fenêtre",
              pt: "Nenhum mês na janela",
            })}
            fitTableToAvailableHeight
          />
        </div>
      </FrameTop>
    </EditorWrapper>
  );
}
