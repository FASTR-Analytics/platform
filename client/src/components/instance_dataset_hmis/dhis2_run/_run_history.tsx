import { t3, type DatasetHmisImportRunSummary } from "lib";
import { Table, toNum0, type TableColumn } from "panther";

type Props = {
  runs: DatasetHmisImportRunSummary[];
};

function statusLabel(status: DatasetHmisImportRunSummary["status"]): string {
  if (status === "queued") {
    return t3({ en: "Queued", fr: "En file d'attente", pt: "Em fila" });
  }
  if (status === "running") {
    return t3({ en: "Running", fr: "En cours", pt: "Em curso" });
  }
  if (status === "complete") {
    return t3({ en: "Complete", fr: "Terminée", pt: "Concluída" });
  }
  if (status === "cancelled") {
    return t3({ en: "Cancelled", fr: "Annulée", pt: "Cancelada" });
  }
  return t3({ en: "Error", fr: "Erreur", pt: "Erro" });
}

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

export function Dhis2RunHistory(p: Props) {
  const columns: TableColumn<DatasetHmisImportRunSummary>[] = [
    {
      key: "startedAt",
      header: t3({ en: "Started", fr: "Démarrée", pt: "Iniciada" }),
      sortable: true,
      render: (run) => new Date(run.startedAt).toLocaleString(),
    },
    {
      key: "triggeredBy",
      header: t3({ en: "By", fr: "Par", pt: "Por" }),
      sortable: true,
      render: (run) =>
        run.trigger === "schedule"
          ? `${run.triggeredBy ?? ""} (${t3({ en: "scheduled", fr: "planifiée", pt: "agendada" })})`
          : (run.triggeredBy ?? ""),
    },
    {
      key: "selection",
      header: t3({ en: "Selection", fr: "Sélection", pt: "Seleção" }),
      render: selectionLabel,
    },
    {
      key: "succeededPairs",
      header: t3({ en: "Pairs (ok / failed / total)", fr: "Paires (ok / échec / total)", pt: "Pares (ok / falha / total)" }),
      alignH: "right",
      render: (run) =>
        `${toNum0(run.succeededPairs)} / ${toNum0(run.failedPairs)} / ${toNum0(run.totalPairs)}`,
    },
    {
      key: "status",
      header: t3({ en: "Status", fr: "Statut", pt: "Estado" }),
      sortable: true,
      render: (run) => (
        <span
          class={
            run.status === "error"
              ? "text-danger font-700"
              : run.status === "running"
                ? "font-700"
                : ""
          }
          title={run.error}
        >
          {statusLabel(run.status)}
        </span>
      ),
    },
    {
      key: "versionId",
      header: t3({ en: "Version", fr: "Version", pt: "Versão" }),
      alignH: "right",
      render: (run) => (run.versionId !== undefined ? `${run.versionId}` : ""),
    },
  ];

  return (
    <div class="ui-spy-sm">
      <div class="font-700 text-lg">
        {t3({
          en: "Previous DHIS2 imports",
          fr: "Importations DHIS2 précédentes",
          pt: "Importações DHIS2 anteriores",
        })}
      </div>
      <Table
        data={p.runs}
        columns={columns}
        keyField="id"
        noRowsMessage={t3({
          en: "No DHIS2 imports yet",
          fr: "Aucune importation DHIS2 pour le moment",
          pt: "Ainda não há importações DHIS2",
        })}
      />
    </div>
  );
}
