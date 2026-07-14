import { t3, type DatasetHmisImportRunSummary } from "lib";
import {
  Button,
  Table,
  createDeleteAction,
  toNum0,
  type TableColumn,
} from "panther";
import { serverActions } from "~/server_actions";

type Props = {
  // Oldest first — the order the scheduler tick drains them (FIFO).
  queuedRuns: DatasetHmisImportRunSummary[];
  onChanged: () => Promise<void>;
};

function selectionLabel(run: DatasetHmisImportRunSummary): string {
  if (run.selection.kind === "window") {
    return `${toNum0(run.selection.rawIndicatorIds.length)} ${t3({
      en: "indicators",
      fr: "indicateurs",
      pt: "indicadores",
    })} · ${run.selection.startPeriod}–${run.selection.endPeriod}`;
  }
  return `${toNum0(run.selection.nPairs)} ${t3({
    en: "pairs",
    fr: "paires",
    pt: "pares",
  })}`;
}

export function Dhis2QueuedRuns(p: Props) {
  const columns: TableColumn<DatasetHmisImportRunSummary>[] = [
    {
      key: "id",
      header: "#",
      render: (run) => `${p.queuedRuns.indexOf(run) + 1}`,
    },
    {
      key: "startedAt",
      header: t3({ en: "Queued at", fr: "Mise en file le", pt: "Em fila desde" }),
      render: (run) => new Date(run.startedAt).toLocaleString(),
    },
    {
      key: "triggeredBy",
      header: t3({ en: "By", fr: "Par", pt: "Por" }),
      render: (run) => run.triggeredBy ?? "",
    },
    {
      key: "selection",
      header: t3({ en: "Selection", fr: "Sélection", pt: "Seleção" }),
      render: selectionLabel,
    },
    {
      key: "status",
      header: "",
      render: (run) => {
        const remove = createDeleteAction(
          t3({
            en: "Remove this import from the queue?",
            fr: "Retirer cette importation de la file d'attente ?",
            pt: "Remover esta importação da fila?",
          }),
          () => serverActions.cancelDatasetHmisDhis2Run({ runId: run.id }),
          p.onChanged,
        );
        return (
          <div class="flex justify-end">
            <Button onClick={remove.click} size="sm" outline intent="danger">
              {t3({ en: "Remove", fr: "Retirer", pt: "Remover" })}
            </Button>
          </div>
        );
      },
    },
  ];

  return (
    <div class="border-base-300 ui-pad ui-spy rounded border">
      <div class="font-700 text-lg">
        {t3({ en: "Queued imports", fr: "Importations en file d'attente", pt: "Importações em fila" })}
      </div>
      <div class="text-sm">
        {t3({
          en: "These start automatically, in order, once the current import (or CSV operation) finishes. They run with the stored credentials.",
          fr: "Elles démarrent automatiquement, dans l'ordre, dès que l'importation en cours (ou l'opération CSV) se termine. Elles utilisent les identifiants enregistrés.",
          pt: "Estas começam automaticamente, por ordem, assim que a importação atual (ou a operação CSV) terminar. Utilizam as credenciais guardadas.",
        })}
      </div>
      <Table
        data={p.queuedRuns}
        columns={columns}
        keyField="id"
        noRowsMessage={t3({
          en: "No queued imports",
          fr: "Aucune importation en file d'attente",
          pt: "Nenhuma importação em fila",
        })}
      />
    </div>
  );
}
